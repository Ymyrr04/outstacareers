import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useHiringRequests, type HiringRequest, type PipelineStage, type Priority, type ClientStatus, PIPELINE_STAGES } from '@/hooks/useHiringRequests';
import { Loader2, Trash2, CheckCircle2, Calendar, Briefcase, Building2, Users, MapPin, FileText, X, MessageSquare, Send, Save, UserCircle } from 'lucide-react';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface HiringRequestDetailDialogProps {
  request: HiringRequest | null;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface AdminUser {
  user_id: string;
  email: string;
}

const EMAIL_TO_NAME: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
};

const getDisplayName = (email: string | undefined): string => {
  if (!email) return 'Unknown';
  const normalized = email.toLowerCase();
  return EMAIL_TO_NAME[normalized] || email.split('@')[0];
};

const INDUSTRIES = [
  'Healthcare',
  'Legal',
  'E-Commerce',
  'Financial',
  'Agriculture - Supply Chain',
  'Marketing and Advertising',
  'Consulting',
  'Real Estate',
  'Technology',
];

export const HiringRequestDetailDialog = ({ 
  request, 
  onOpenChange,
  onUpdated 
}: HiringRequestDetailDialogProps) => {
  const { updateRequest, deleteRequest } = useHiringRequests();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);

  const [formData, setFormData] = useState({
    job_title: '',
    priority: 'high' as Priority,
    industry: '',
    client_status: 'new' as ClientStatus,
    pipeline_stage: 'backlog' as PipelineStage,
    source: '',
    start_date: '',
    target_end_date: '',
    notes: '',
    assigned_admin_id: '',
  });

  useEffect(() => {
    if (request) {
      setFormData({
        job_title: request.job_title,
        priority: request.priority,
        industry: request.industry || '',
        client_status: request.client_status,
        pipeline_stage: request.pipeline_stage,
        source: request.source || '',
        start_date: request.start_date || '',
        target_end_date: request.target_end_date || '',
        notes: request.notes || '',
        assigned_admin_id: request.assigned_admin_id || '',
      });
      setEditingField(null);
      setHasUnsavedChanges(false);
      fetchComments(request.id);
      fetchAdminUsers();
    }
  }, [request]);

  const fetchAdminUsers = async () => {
    const { data, error } = await supabase.functions.invoke('get-admin-users');
    if (!error && data?.adminUsers) {
      setAdminUsers(data.adminUsers);
    }
  };

  const fetchComments = async (requestId: string) => {
    setLoadingComments(true);
    const { data, error } = await supabase
      .from('hiring_request_comments')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      setComments(data);
    }
    setLoadingComments(false);
  };

  const handleAddComment = async () => {
    if (!request || !newComment.trim() || !user) return;
    
    setAddingComment(true);
    const { error } = await supabase
      .from('hiring_request_comments')
      .insert({
        request_id: request.id,
        user_id: user.id,
        content: newComment.trim(),
      });
    
    if (error) {
      toast.error('Failed to add comment');
    } else {
      setNewComment('');
      fetchComments(request.id);
      // Update comment count on request
      await supabase
        .from('client_hiring_requests')
        .update({ comment_count: (request.comment_count || 0) + 1 })
        .eq('id', request.id);
      onUpdated?.();
    }
    setAddingComment(false);
  };

  const handleFieldUpdate = async (field: string, value: string) => {
    if (!request) return;
    
    setSaving(true);
    const updates: Partial<HiringRequest> = {};
    
    if (field === 'priority') updates.priority = value as Priority;
    else if (field === 'industry') updates.industry = value || null;
    else if (field === 'client_status') updates.client_status = value as ClientStatus;
    else if (field === 'pipeline_stage') updates.pipeline_stage = value as PipelineStage;
    else if (field === 'source') updates.source = value || null;
    else if (field === 'start_date') updates.start_date = value || null;
    else if (field === 'target_end_date') updates.target_end_date = value || null;
    else if (field === 'job_title') updates.job_title = value;
    else if (field === 'notes') updates.notes = value || null;
    else if (field === 'assigned_admin_id') updates.assigned_admin_id = value || null;

    const success = await updateRequest(request.id, updates);
    setSaving(false);
    setEditingField(null);
    setHasUnsavedChanges(false);

    if (success) {
      setFormData(prev => ({ ...prev, [field]: value }));
      onUpdated?.();
      toast.success('Saved');
    }
  };

  const handleDelete = async () => {
    if (!request) return;
    
    setDeleting(true);
    const success = await deleteRequest(request.id);
    setDeleting(false);

    if (success) {
      onOpenChange(false);
      onUpdated?.();
    }
  };

  if (!request) return null;

  const stageLabel = PIPELINE_STAGES.find(s => s.id === request.pipeline_stage)?.label || request.pipeline_stage;

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden [&>button]:hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pr-12 border-b bg-muted/30 shrink-0">
          <CheckCircle2 className="w-5 h-5 text-muted-foreground shrink-0" />
          {editingField === 'job_title' ? (
            <Input
              autoFocus
              value={formData.job_title}
              onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
              onBlur={() => handleFieldUpdate('job_title', formData.job_title)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFieldUpdate('job_title', formData.job_title);
                if (e.key === 'Escape') setEditingField(null);
              }}
              className="text-lg font-semibold h-auto py-1 flex-1"
            />
          ) : (
            <h2 
              className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors flex-1"
              onClick={() => setEditingField('job_title')}
            >
              {request.client_name} {'{' + request.job_title + '}'}
              {request.source && <span className="text-muted-foreground font-normal"> - from {request.source}</span>}
            </h2>
          )}
          <Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row">
          {/* Left Column - Fields */}
          <div className="flex-1 p-4 space-y-1">
            {/* Project/Stage Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <MapPin className="w-4 h-4" />
                Stage
              </div>
              <div className="flex-1">
                <Select 
                  value={formData.pipeline_stage} 
                  onValueChange={(v) => handleFieldUpdate('pipeline_stage', v)}
                >
                  <SelectTrigger className="border-0 bg-transparent h-auto p-0 hover:bg-transparent focus:ring-0">
                    <Badge variant="outline" className="font-normal">
                      {stageLabel}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map(stage => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.emoji} {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs text-muted-foreground uppercase tracking-wide pt-4 pb-2 font-medium">Fields</div>

            {/* Priority Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Priority
              </div>
              <div className="flex-1">
                <Select 
                  value={formData.priority} 
                  onValueChange={(v) => handleFieldUpdate('priority', v)}
                >
                  <SelectTrigger className="border-0 bg-transparent h-auto p-0 hover:bg-transparent focus:ring-0">
                    <Badge 
                      variant={formData.priority === 'high' ? 'destructive' : 'secondary'}
                      className="font-normal"
                    >
                      {formData.priority === 'high' ? 'High' : 'Low'}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Industry Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <Briefcase className="w-4 h-4" />
                Industry
              </div>
              <div className="flex-1">
                <Select 
                  value={formData.industry || '__none__'} 
                  onValueChange={(v) => handleFieldUpdate('industry', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="border-0 bg-transparent h-auto p-0 hover:bg-transparent focus:ring-0">
                    {formData.industry ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 font-normal">
                        {formData.industry}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {INDUSTRIES.map(industry => (
                      <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Source Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <Building2 className="w-4 h-4" />
                Source
              </div>
              <div className="flex-1">
                {editingField === 'source' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={formData.source}
                      onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFieldUpdate('source', formData.source);
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      className="h-7 text-sm"
                      placeholder="e.g., BNI Revival, LinkedIn"
                    />
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 px-2"
                      onClick={() => handleFieldUpdate('source', formData.source)}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    </Button>
                  </div>
                ) : (
                  <span 
                    className="text-sm cursor-pointer hover:text-primary"
                    onClick={() => setEditingField('source')}
                  >
                    {formData.source || '—'}
                  </span>
                )}
              </div>
            </div>

            {/* Client Status Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <Users className="w-4 h-4" />
                Existing / New
              </div>
              <div className="flex-1">
                <Select 
                  value={formData.client_status} 
                  onValueChange={(v) => handleFieldUpdate('client_status', v)}
                >
                  <SelectTrigger className="border-0 bg-transparent h-auto p-0 hover:bg-transparent focus:ring-0">
                    <Badge 
                      variant={formData.client_status === 'new' ? 'default' : 'secondary'}
                      className="font-normal"
                    >
                      {formData.client_status === 'new' ? 'New' : 'Existing'}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="existing">Existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date Range Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" />
                Date Range
              </div>
              <div className="flex-1 flex items-center gap-2">
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, start_date: e.target.value }));
                    handleFieldUpdate('start_date', e.target.value);
                  }}
                  className="h-8 text-sm w-36 px-2"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="date"
                  value={formData.target_end_date}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, target_end_date: e.target.value }));
                    handleFieldUpdate('target_end_date', e.target.value);
                  }}
                  className="h-8 text-sm w-36 px-2"
                />
              </div>
            </div>

            {/* Assignee Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <UserCircle className="w-4 h-4" />
                Assignee
              </div>
              <div className="flex-1">
                <Select 
                  value={formData.assigned_admin_id || '__none__'} 
                  onValueChange={(v) => handleFieldUpdate('assigned_admin_id', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="border-0 bg-transparent h-auto p-0 hover:bg-transparent focus:ring-0">
                    {formData.assigned_admin_id ? (
                      <Badge variant="outline" className="font-normal">
                        {adminUsers.find(a => a.user_id === formData.assigned_admin_id)?.email || 'Unknown'}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {adminUsers.map(admin => (
                      <SelectItem key={admin.user_id} value={admin.user_id}>
                        {admin.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Description Section */}
        <div className="p-4 border-t">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="w-4 h-4" />
              Description
            </div>
            {editingField === 'notes' && (
              <Button 
                size="sm" 
                onClick={() => {
                  handleFieldUpdate('notes', formData.notes);
                }}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Save
              </Button>
            )}
          </div>
          {editingField === 'notes' ? (
            <>
              <WysiwygEditor
                value={formData.notes}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, notes: value }));
                  setHasUnsavedChanges(true);
                }}
                placeholder="Post Job Description here..."
                minHeight="200px"
              />
              {/* Sticky Save Button at bottom */}
              <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t mt-4 -mx-4 px-4 py-3">
                <Button 
                  className="w-full"
                  onClick={() => {
                    handleFieldUpdate('notes', formData.notes);
                  }}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Description
                </Button>
              </div>
            </>
          ) : (
            <div 
              className="min-h-[100px] p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setEditingField('notes')}
            >
              {formData.notes ? (
                <FormattedNotes content={formData.notes} />
              ) : (
                <span className="text-muted-foreground italic text-sm">Post Job Description here...</span>
              )}
            </div>
          )}
        </div>

        {/* Comments Section */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
            <MessageSquare className="w-4 h-4" />
            Comments ({comments.length})
          </div>
          
          {/* Comment List */}
          <div className="space-y-3 mb-4 max-h-[200px] overflow-y-auto">
            {loadingComments ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No comments yet</p>
            ) : (
              comments.map(comment => {
                const commenterAdmin = adminUsers.find(a => a.user_id === comment.user_id);
                const commenterName = getDisplayName(commenterAdmin?.email);
                return (
                  <div key={comment.id} className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{commenterName}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comment.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Comment */}
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="min-h-[60px] text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleAddComment();
                }
              }}
            />
            <Button 
              size="icon" 
              onClick={handleAddComment}
              disabled={!newComment.trim() || addingComment}
              className="shrink-0"
            >
              {addingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Press Ctrl+Enter to send</p>
        </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-muted/20 shrink-0">
          <div className="text-xs text-muted-foreground">
            Created: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting}>
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Hiring Request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{request.client_name} - {request.job_title}". This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
