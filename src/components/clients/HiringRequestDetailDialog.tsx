import { useState, useEffect, useRef } from 'react';
import { getErrorMessageSync } from "@/lib/errors";
import { format } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useHiringRequests, type HiringRequest, type Priority, type ClientStatus } from '@/hooks/useHiringRequests';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { useSlackNotifications } from '@/hooks/useSlackNotifications';
import { Loader2, Trash2, CheckCircle2, Calendar, Briefcase, Building2, Users, MapPin, FileText, X, MessageSquare, Send, Save, UserCircle, Pencil, SmilePlus, ChevronDown, Copy, User } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { CommentEditor, type CommentEditorRef } from '@/components/CommentEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { getAdminDisplayName, getAdminAvatar } from '@/lib/adminDisplayNames';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Import admin avatars
import czaAvatar from '@/assets/team/cza.png';
import kristineAvatar from '@/assets/team/kristine.png';
import eduardoAvatar from '@/assets/team/eduardo.png';
import markAvatar from '@/assets/team/mark.png';
import liezlAvatar from '@/assets/team/liezl-new.png';
import { formatDate, formatDateTime } from "@/lib/dateFormat";

const ADMIN_AVATARS: Record<string, string> = {
  'czarina@outsta.io': czaAvatar,
  'kristine@outsta.io': kristineAvatar,
  'eduardo@outsta.io': eduardoAvatar,
  'mark@outsta.io': markAvatar,
  'liezl@outsta.io': liezlAvatar,
};

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
  linked_applicant_id?: string | null;
}

interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
}

interface AdminUser {
  user_id: string;
  email: string;
}

// Use shared getAdminDisplayName from lib

const DEFAULT_INDUSTRIES = [
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
  const { updateRequest, deleteRequest, duplicateRequest } = useHiringRequests();
  const { stages } = usePipelineStages();
  const { notifyMention, notifyStatusChange } = useSlackNotifications();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [industries, setIndustries] = useState<string[]>(DEFAULT_INDUSTRIES);
  const [sources, setSources] = useState<string[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<CommentReaction[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [linkedApplicants, setLinkedApplicants] = useState<Record<string, string>>({});
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const commentInputRef = useRef<CommentEditorRef>(null);

  const REACTION_EMOJIS = ['👍', '❤️', '😄', '🎉', '🤔', '👀'];

  const [formData, setFormData] = useState({
    job_title: '',
    priority: 'high' as Priority,
    industry: '',
    client_status: 'new' as ClientStatus,
    pipeline_stage: 'backlog',
    source: '',
    start_date: '',
    target_end_date: '',
    notes: '',
    assigned_admin_id: '',
    closed_at: '',
    client_id: '' as string,
  });

  useEffect(() => {
    if (request) {
      // Format closed_at for date input (YYYY-MM-DD)
      const closedAtDate = request.closed_at 
        ? request.closed_at.split('T')[0] 
        : '';
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
        closed_at: closedAtDate,
        client_id: request.client_id || '',
      });
      setEditingField(null);
      setHasUnsavedChanges(false);
      fetchComments(request.id);
      fetchAdminUsers();
      fetchIndustries();
      fetchSources();
      fetchClients();
    }
  }, [request]);

  const fetchSources = async () => {
    const [hr, ca] = await Promise.all([
      supabase.from('client_hiring_requests').select('source').not('source', 'is', null),
      supabase.from('contractor_assignments').select('source').not('source', 'is', null),
    ]);
    const all: string[] = [
      ...((hr.data as any[]) || []).map(r => r.source),
      ...((ca.data as any[]) || []).map(r => r.source),
    ];
    const unique = [...new Set(
      all.map(s => (s || '').trim()).filter(s => s.length > 0)
    )].sort((a, b) => a.localeCompare(b));
    setSources(unique);
  };

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, company_name')
      .order('company_name');
    if (data) {
      setClients(data);
    }
  };

  const fetchIndustries = async () => {
    const { data } = await supabase
      .from('clients')
      .select('industry');
    
    if (data) {
      const clientIndustries = data
        .map(c => c.industry)
        .filter((ind): ind is string => !!ind && ind.trim() !== '');
      const allIndustries = [...new Set([...DEFAULT_INDUSTRIES, ...clientIndustries])];
      setIndustries(allIndustries.sort());
    }
  };

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
      // Fetch reactions for these comments
      const commentIds = data.map(c => c.id);
      if (commentIds.length > 0) {
        const { data: reactionsData } = await supabase
          .from('hiring_request_comment_reactions')
          .select('*')
          .in('comment_id', commentIds);
        if (reactionsData) {
          setReactions(reactionsData);
        }
      }
      // Fetch linked applicant names in one query
      const linkedApplicantIds = data
        .map(c => c.linked_applicant_id)
        .filter((id): id is string => !!id);
      if (linkedApplicantIds.length > 0) {
        const { data: applicantsData } = await supabase
          .from('applicants_prescreen')
          .select('id, full_name')
          .in('id', linkedApplicantIds);
        const nameMap: Record<string, string> = {};
        const applicantNames = (applicantsData || []) as { id: string | null; full_name: string | null }[];
        applicantNames.forEach((a) => {
          if (a.id) nameMap[a.id] = a.full_name || 'Unknown';
        });
        setLinkedApplicants(nameMap);
      } else {
        setLinkedApplicants({});
      }
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
      toast.error(getErrorMessageSync(error, 'Failed to add comment'));
    } else {
      // Check for @mentions and send email + Slack notifications
      const mentionPattern = /@(\w+)/g;
      const plainText = newComment.replace(/<[^>]*>/g, '');
      const mentions = plainText.match(mentionPattern);

      const mentionedEmails = new Set<string>();

      if (mentions) {
        // Deduplicate mentions (in case someone is mentioned twice)
        const uniqueMentionNames = [...new Set(mentions.map(m => m.substring(1).toLowerCase()))];

        // Resolve all mentioned admins
        const mentionedAdmins = uniqueMentionNames
          .map(mentionedName => adminUsers.find(admin => {
            const displayName = getAdminDisplayName(admin.email, '').toLowerCase();
            return displayName === mentionedName;
          }))
          .filter((admin): admin is NonNullable<typeof admin> =>
            !!admin && admin.email !== user.email
          );

        mentionedAdmins.forEach(a => mentionedEmails.add(a.email.toLowerCase()));

        // Send all mention email notifications in parallel
        const emailPromises = mentionedAdmins.map(mentionedAdmin =>
          supabase.functions.invoke('send-mention-notification', {
            body: {
              type: 'mention',
              recipientEmail: mentionedAdmin.email,
              recipientName: getAdminDisplayName(mentionedAdmin.email),
              senderName: getAdminDisplayName(user.email),
              requestTitle: request.job_title,
              clientName: request.client_name || 'Unknown Client',
              commentContent: newComment,
            },
          }).then(({ error: emailError }) => {
            if (emailError) console.error(`Mention email to ${mentionedAdmin.email} failed:`, emailError);
          })
        );

        // Send all Slack notifications
        mentionedAdmins.forEach(mentionedAdmin => {
          notifyMention({
            mentionedEmail: mentionedAdmin.email,
            mentionedByEmail: user.email || '',
            commentContent: newComment,
            requestId: request.id,
            requestTitle: request.job_title,
            clientName: request.client_name || 'Unknown Client',
          });
        });

        await Promise.all(emailPromises);
      }

      // Notify all OTHER admins (excluding author, already-mentioned users, and opted-out admins) about the new comment
      const EXCLUDED_FROM_COMMENT_NOTIFS = new Set(['adam@outsta.io', 'sean@outsta.io']);
      const otherAdmins = adminUsers.filter(admin =>
        admin.email &&
        admin.email !== user.email &&
        !mentionedEmails.has(admin.email.toLowerCase()) &&
        !EXCLUDED_FROM_COMMENT_NOTIFS.has(admin.email.toLowerCase())
      );

      const commentEmailPromises = otherAdmins.map(admin =>
        supabase.functions.invoke('send-mention-notification', {
          body: {
            type: 'new_comment',
            recipientEmail: admin.email,
            recipientName: getAdminDisplayName(admin.email),
            senderName: getAdminDisplayName(user.email),
            requestTitle: request.job_title,
            clientName: request.client_name || 'Unknown Client',
            commentContent: newComment,
          },
        }).then(({ error: emailError }) => {
          if (emailError) console.error(`New-comment email to ${admin.email} failed:`, emailError);
        })
      );

      await Promise.all(commentEmailPromises);
      
      setNewComment('');
      fetchComments(request.id);
      // Update comment count on request
      // Sync comment count from actual database records
      const { count } = await supabase
        .from('hiring_request_comments')
        .select('*', { count: 'exact', head: true })
        .eq('request_id', request.id);
      await supabase
        .from('client_hiring_requests')
        .update({ comment_count: count || 0 })
        .eq('id', request.id);
      onUpdated?.();
    }
    setAddingComment(false);
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentContent.trim() || !request) return;
    
    const { error } = await supabase
      .from('hiring_request_comments')
      .update({ content: editingCommentContent.trim() })
      .eq('id', commentId);
    
    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to update comment'));
    } else {
      setEditingCommentId(null);
      setEditingCommentContent('');
      fetchComments(request.id);
      toast.success('Comment updated');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!request) return;
    
    setDeletingCommentId(commentId);
    const { error } = await supabase
      .from('hiring_request_comments')
      .delete()
      .eq('id', commentId);
    
    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to delete comment'));
    } else {
      fetchComments(request.id);
      // Sync comment count from actual database records
      const { count } = await supabase
        .from('hiring_request_comments')
        .select('*', { count: 'exact', head: true })
        .eq('request_id', request.id);
      await supabase
        .from('client_hiring_requests')
        .update({ comment_count: count || 0 })
        .eq('id', request.id);
      onUpdated?.();
      toast.success('Comment deleted');
    }
    setDeletingCommentId(null);
  };

  const handleToggleReaction = async (commentId: string, emoji: string) => {
    if (!user) return;
    
    const existingReaction = reactions.find(
      r => r.comment_id === commentId && r.user_id === user.id && r.emoji === emoji
    );
    
    if (existingReaction) {
      // Remove reaction
      const { error } = await supabase
        .from('hiring_request_comment_reactions')
        .delete()
        .eq('id', existingReaction.id);
      
      if (!error) {
        setReactions(prev => prev.filter(r => r.id !== existingReaction.id));
      }
    } else {
      // Add reaction
      const { data, error } = await supabase
        .from('hiring_request_comment_reactions')
        .insert({
          comment_id: commentId,
          user_id: user.id,
          emoji,
        })
        .select()
        .single();
      
      if (!error && data) {
        setReactions(prev => [...prev, data]);
      }
    }
    setShowEmojiPicker(null);
  };

  const getReactionsForComment = (commentId: string) => {
    const commentReactions = reactions.filter(r => r.comment_id === commentId);
    const grouped: Record<string, { count: number; users: string[]; hasOwn: boolean }> = {};
    
    commentReactions.forEach(r => {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { count: 0, users: [], hasOwn: false };
      }
      grouped[r.emoji].count++;
      const adminUser = adminUsers.find(a => a.user_id === r.user_id);
      grouped[r.emoji].users.push(getAdminDisplayName(adminUser?.email, 'Unknown'));
      if (r.user_id === user?.id) {
        grouped[r.emoji].hasOwn = true;
      }
    });
    
    return grouped;
  };

  const handleCommentChange = (value: string) => {
    setNewComment(value);
    
    // Check for @ mentions in plain text extracted from HTML
    const plainText = value.replace(/<[^>]*>/g, '');
    const atMatch = plainText.match(/@(\w*)$/);
    
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
      setMentionFilter('');
    }
  };

  const insertMention = (email: string) => {
    const name = getAdminDisplayName(email, 'Unknown');
    // Replace the @partial with @Name in the content
    const updatedContent = newComment.replace(/@\w*(<\/p>)?$/, `<span class="text-primary font-medium">@${name}</span> $1`);
    setNewComment(updatedContent);
    setShowMentions(false);
    setMentionFilter('');
    
    // Focus back on editor
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const filteredMentionUsers = adminUsers.filter(admin => {
    const name = getAdminDisplayName(admin.email, 'Unknown').toLowerCase();
    const email = admin.email.toLowerCase();
    return name.includes(mentionFilter) || email.includes(mentionFilter);
  });

  const renderCommentContent = (content: string) => {
    // Render HTML content with proper styling for @mentions, links, and lists
    return (
      <div 
        className="text-sm prose prose-sm max-w-none [&_a]:text-primary [&_a]:underline [&_a]:hover:opacity-80 [&_.text-primary]:text-primary [&_.font-medium]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  };

  const handleFieldUpdate = async (field: string, value: string) => {
    if (!request) return;
    
    // Capture old stage for status change notification
    const oldPipelineStage = request.pipeline_stage;
    
    setSaving(true);
    const updates: Partial<HiringRequest> = {};
    
    if (field === 'priority') updates.priority = value as Priority;
    else if (field === 'industry') updates.industry = value || null;
    else if (field === 'client_status') updates.client_status = value as ClientStatus;
    else if (field === 'pipeline_stage') updates.pipeline_stage = value;
    else if (field === 'source') updates.source = value || null;
    else if (field === 'start_date') updates.start_date = value || null;
    else if (field === 'target_end_date') updates.target_end_date = value || null;
    else if (field === 'job_title') updates.job_title = value;
    else if (field === 'notes') updates.notes = value || null;
    else if (field === 'assigned_admin_id') updates.assigned_admin_id = value || null;
    else if (field === 'client_id') (updates as any).client_id = value || null;

    const success = await updateRequest(request.id, updates);
    setSaving(false);
    setEditingField(null);
    setHasUnsavedChanges(false);

    if (success) {
      // Send Slack notification for pipeline stage changes
      if (field === 'pipeline_stage' && value !== oldPipelineStage) {
        const oldStageLabel = stages.find(s => s.slug === oldPipelineStage)?.name || oldPipelineStage;
        const newStageLabel = stages.find(s => s.slug === value)?.name || value;
        
        notifyStatusChange({
          requestId: request.id,
          requestTitle: request.job_title,
          clientName: request.client_name || 'Unknown Client',
          oldStage: oldStageLabel,
          newStage: newStageLabel,
          changedByEmail: user?.email || '',
        });
      }

      // Send email notification when task is assigned to someone
      if (field === 'assigned_admin_id' && value) {
        const assignedAdmin = adminUsers.find(a => a.user_id === value);
        if (assignedAdmin && assignedAdmin.email !== user?.email) {
          supabase.functions.invoke('send-mention-notification', {
            body: {
              type: 'assignment',
              recipientEmail: assignedAdmin.email,
              recipientName: getAdminDisplayName(assignedAdmin.email),
              senderName: getAdminDisplayName(user?.email),
              requestTitle: request.job_title,
              clientName: request.client_name || 'Unknown Client',
            },
          }).then(({ error: emailError }) => {
            if (emailError) console.error('Assignment email notification failed:', emailError);
          });
        }
      }
      
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

  const handleDuplicate = async () => {
    if (!request) return;
    
    setDuplicating(true);
    const success = await duplicateRequest(request);
    setDuplicating(false);

    if (success) {
      onOpenChange(false);
      onUpdated?.();
    }
  };

  if (!request) return null;

  const stageLabel = stages.find(s => s.slug === request.pipeline_stage)?.name || request.pipeline_stage;

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[50vw] w-full p-0 gap-0 overflow-hidden [&>button]:hidden h-screen max-h-screen flex flex-col rounded-none">
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
              <div className="flex-1 flex items-center gap-2">
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
                    {stages.map(stage => (
                      <SelectItem key={stage.id} value={stage.slug}>
                        {stage.emoji} {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {request.pipeline_stage === 'closed' && request.closed_at && (
                  <Badge variant="outline" className="font-normal text-emerald-600 border-emerald-300">
                    {formatDate(request.closed_at)}
                  </Badge>
                )}
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
                      variant={formData.priority === 'high' ? 'destructive' : formData.priority === 'medium' ? 'default' : 'secondary'}
                      className={`font-normal ${formData.priority === 'medium' ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                    >
                      {formData.priority === 'high' ? 'High' : formData.priority === 'medium' ? 'Medium' : 'Low'}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
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
                    {industries.map(industry => (
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
                    <div className="relative flex-1">
                      <Input
                        autoFocus
                        value={formData.source}
                        onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFieldUpdate('source', formData.source);
                          if (e.key === 'Escape') setEditingField(null);
                        }}
                        className="h-7 text-sm pr-7"
                        placeholder="e.g., BNI Revival, LinkedIn"
                      />
                      <Popover open={sourcePickerOpen} onOpenChange={setSourcePickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-1 max-h-64 overflow-y-auto" align="end">
                          {sources.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">No existing sources</div>
                          ) : (
                            sources.map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
                                  onClick={() => {
                                    setFormData(prev => ({ ...prev, source: s }));
                                    setSourcePickerOpen(false);
                                    handleFieldUpdate('source', s);
                                  }}
                                >
                                  {s}
                                </button>
                              ))
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
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
                      variant={formData.client_status === 'new' ? 'default' : formData.client_status === 'returning' ? 'outline' : 'secondary'}
                      className="font-normal"
                    >
                      {formData.client_status === 'new' ? 'New' : formData.client_status === 'returning' ? 'Returning' : 'Existing'}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="existing">Existing</SelectItem>
                    <SelectItem value="returning">Returning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Client Row */}
            <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
              <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                <Building2 className="w-4 h-4" />
                Client
              </div>
              <div className="flex-1">
                <Select 
                  value={formData.client_id || '__none__'} 
                  onValueChange={(v) => handleFieldUpdate('client_id', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="border-0 bg-transparent h-auto p-0 hover:bg-transparent focus:ring-0">
                    {formData.client_id ? (
                      <span className="text-sm font-medium">
                        {clients.find(c => c.id === formData.client_id)?.company_name || request.client_name || '—'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
                    ))}
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

            {/* Closed Date Row - Only show when in closed stage */}
            {formData.pipeline_stage === 'closed' && (
              <div className="flex items-center py-2 hover:bg-muted/50 rounded px-2 -mx-2">
                <div className="flex items-center gap-2 w-32 text-muted-foreground text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Closed Date
                </div>
                <div className="flex-1">
                  <Input
                    type="date"
                    value={formData.closed_at}
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      setFormData(prev => ({ ...prev, closed_at: dateValue }));
                      // Convert to ISO string for database
                      const isoDate = dateValue ? new Date(dateValue + 'T12:00:00').toISOString() : null;
                      handleFieldUpdate('closed_at', isoDate || '');
                    }}
                    className="h-8 text-sm w-36 px-2"
                  />
                </div>
              </div>
            )}


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
                      <Badge variant="outline" className="font-normal flex items-center gap-1.5 pr-2">
                        <Avatar className="h-6 w-6">
                          {(() => {
                            const email = adminUsers.find(a => a.user_id === formData.assigned_admin_id)?.email?.toLowerCase();
                            const avatar = email ? ADMIN_AVATARS[email] : undefined;
                            return avatar ? <AvatarImage src={avatar} alt="" /> : null;
                          })()}
                          <AvatarFallback className="text-xs bg-blue-500 text-white">
                            {getAdminDisplayName(adminUsers.find(a => a.user_id === formData.assigned_admin_id)?.email, 'U').charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        {getAdminDisplayName(adminUsers.find(a => a.user_id === formData.assigned_admin_id)?.email, 'Unknown')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {adminUsers.map(admin => (
                      <SelectItem key={admin.user_id} value={admin.user_id}>
                        {getAdminDisplayName(admin.email)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Description Section - Collapsible */}
        <Collapsible defaultOpen className="border-t">
          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="w-4 h-4" />
              Description
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>svg]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4">
            <div className="flex items-center justify-end mb-2">
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
          </CollapsibleContent>
        </Collapsible>

        {/* Comments Section */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
            <MessageSquare className="w-4 h-4" />
            Comments ({comments.length})
          </div>
          
          {/* Comment List */}
          <div className="space-y-3 mb-4">
            {loadingComments ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No comments yet</p>
            ) : (
              comments.map(comment => {
                const commenterAdmin = adminUsers.find(a => a.user_id === comment.user_id);
                const commenterEmail = commenterAdmin?.email?.toLowerCase();
                const commenterName = getAdminDisplayName(commenterAdmin?.email, 'Unknown');
                const commenterAvatar = commenterEmail ? ADMIN_AVATARS[commenterEmail] : undefined;
                const commenterInitial = commenterName.charAt(0).toUpperCase();
                const isOwnComment = user?.id === comment.user_id;
                const isEditing = editingCommentId === comment.id;
                
                return (
                  <div key={comment.id} className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          {commenterAvatar ? (
                            <AvatarImage src={commenterAvatar} alt={commenterName} />
                          ) : null}
                          <AvatarFallback className="text-xs bg-blue-500 text-white">
                            {commenterInitial}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-semibold">{commenterName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(comment.created_at)}
                        </span>
                        {isOwnComment && !isEditing && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditingCommentContent(comment.content);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteComment(comment.id)}
                              disabled={deletingCommentId === comment.id}
                            >
                              {deletingCommentId === comment.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="flex gap-2 mt-2">
                        <CommentEditor
                          value={editingCommentContent}
                          onChange={setEditingCommentContent}
                          onSubmit={() => handleEditComment(comment.id)}
                          placeholder="Edit comment..."
                          compact={false}
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditComment(comment.id)}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingCommentContent('');
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {renderCommentContent(comment.content)}

                        {/* Linked applicant chip */}
                        {comment.linked_applicant_id && (
                          <div className="mt-2">
                            {linkedApplicants[comment.linked_applicant_id] ? (
                              <Link
                                to={`/admin/applicants?applicant=${comment.linked_applicant_id}`}
                                className="inline-flex items-center gap-1.5 rounded-[20px] px-2.5 py-[3px] text-[11px] font-medium bg-[#E0F7FC] text-[#066F85] hover:bg-[#B2EEF8] transition-colors"
                              >
                                <User className="w-[11px] h-[11px]" />
                                {linkedApplicants[comment.linked_applicant_id]}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-[20px] px-2.5 py-[3px] text-[11px] font-medium bg-muted text-muted-foreground">
                                <User className="w-[11px] h-[11px]" />
                                Candidate removed
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Reactions */}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {Object.entries(getReactionsForComment(comment.id)).map(([emoji, data]) => (
                        <Tooltip key={emoji}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleToggleReaction(comment.id, emoji)}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                                data.hasOwn 
                                  ? 'bg-primary/10 border-primary/30 text-primary' 
                                  : 'bg-muted/50 border-border hover:bg-muted'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span>{data.count}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {data.users.join(', ')}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      
                      {/* Add Reaction Button */}
                      <Popover open={showEmojiPicker === comment.id} onOpenChange={(open) => setShowEmojiPicker(open ? comment.id : null)}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-50 hover:opacity-100"
                          >
                            <SmilePlus className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" side="top">
                          <div className="flex gap-1">
                            {REACTION_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(comment.id, emoji)}
                                className="text-lg hover:scale-125 transition-transform p-1"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>

        {/* Sticky Add Comment + Footer */}
        <div className="shrink-0 border-t bg-background">
          {/* Add Comment - Always visible */}
          <div className="p-3 border-b">
            <div className="flex gap-2 items-center relative">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-primary">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 relative">
                <CommentEditor
                  ref={commentInputRef}
                  value={newComment}
                  onChange={handleCommentChange}
                  placeholder="Add a comment... (use @ to mention)"
                  onSubmit={() => {
                    if (newComment.trim() && newComment !== '<p></p>') {
                      handleAddComment();
                      commentInputRef.current?.clear();
                    }
                  }}
                  onTabPress={() => {
                    // Auto-select first mention suggestion on Tab
                    if (showMentions && filteredMentionUsers.length > 0) {
                      insertMention(filteredMentionUsers[0].email);
                      return true;
                    }
                    return false;
                  }}
                />
                
                {/* Mentions Dropdown */}
                {showMentions && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    <div className="p-1">
                      {filteredMentionUsers.map(admin => (
                        <button
                          key={admin.user_id}
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                          onClick={() => insertMention(admin.email)}
                        >
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-medium text-primary">
                              {admin.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{getAdminDisplayName(admin.email)}</span>
                            <span className="text-xs text-muted-foreground">{admin.email}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button 
                size="icon" 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleAddComment();
                  commentInputRef.current?.clear();
                }}
                disabled={!newComment.trim() || newComment === '<p></p>' || addingComment}
                className="shrink-0 h-9 w-9"
              >
                {addingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-3 bg-muted/20">
            <div className="text-xs text-muted-foreground">
              Created: {formatDateTime(request.created_at)}
            </div>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
                {duplicating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Duplicate
              </Button>
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
