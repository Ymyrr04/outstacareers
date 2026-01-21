import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useHiringRequests, type HiringRequest, type PipelineStage, type Priority, type ClientStatus, PIPELINE_STAGES } from '@/hooks/useHiringRequests';
import { Loader2, Trash2, Pencil, Save, X } from 'lucide-react';

interface HiringRequestDetailDialogProps {
  request: HiringRequest | null;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      });
      setEditing(false);
    }
  }, [request]);

  const handleSave = async () => {
    if (!request) return;
    
    setSaving(true);
    const success = await updateRequest(request.id, {
      job_title: formData.job_title.trim(),
      priority: formData.priority,
      industry: formData.industry || null,
      client_status: formData.client_status,
      pipeline_stage: formData.pipeline_stage,
      source: formData.source.trim() || null,
      start_date: formData.start_date || null,
      target_end_date: formData.target_end_date || null,
      notes: formData.notes.trim() || null,
    });
    setSaving(false);

    if (success) {
      setEditing(false);
      onUpdated?.();
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

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate">{request.client_name}</span>
            <div className="flex items-center gap-1">
              {editing ? (
                <>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </Button>
                </>
              ) : (
                <Button size="icon" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* View Mode */}
          {!editing ? (
            <>
              <div>
                <p className="text-lg font-medium">{request.job_title}</p>
                {request.source && (
                  <p className="text-sm text-muted-foreground">from {request.source}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={request.priority === 'high' ? 'destructive' : 'secondary'}>
                  {request.priority === 'high' ? 'High Priority' : 'Low Priority'}
                </Badge>
                {request.industry && (
                  <Badge variant="outline">{request.industry}</Badge>
                )}
                <Badge variant={request.client_status === 'new' ? 'default' : 'secondary'}>
                  {request.client_status === 'new' ? 'New Client' : 'Existing Client'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Stage:</span>
                  <p className="font-medium">{PIPELINE_STAGES.find(s => s.id === request.pipeline_stage)?.label}</p>
                </div>
                {(request.start_date || request.target_end_date) && (
                  <div>
                    <span className="text-muted-foreground">Date Range:</span>
                    <p className="font-medium">
                      {request.start_date && format(new Date(request.start_date), 'MMM d, yyyy')}
                      {request.start_date && request.target_end_date && ' – '}
                      {request.target_end_date && format(new Date(request.target_end_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                )}
              </div>

              {request.notes && (
                <div>
                  <span className="text-sm text-muted-foreground">Notes:</span>
                  <p className="text-sm whitespace-pre-wrap mt-1 p-3 bg-muted/50 rounded-lg">
                    {request.notes}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Created: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
              </div>
            </>
          ) : (
            /* Edit Mode */
            <div className="space-y-4">
              <div>
                <Label>Job Title</Label>
                <Input
                  value={formData.job_title}
                  onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select 
                    value={formData.priority} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, priority: v as Priority }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Client Status</Label>
                  <Select 
                    value={formData.client_status} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, client_status: v as ClientStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="existing">Existing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Industry</Label>
                  <Select 
                    value={formData.industry} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, industry: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map(industry => (
                        <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Stage</Label>
                  <Select 
                    value={formData.pipeline_stage} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, pipeline_stage: v as PipelineStage }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STAGES.map(stage => (
                        <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Source / Referral</Label>
                <Input
                  value={formData.source}
                  onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                  placeholder="e.g., BNI Revival, LinkedIn"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Target End Date</Label>
                  <Input
                    type="date"
                    value={formData.target_end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, target_end_date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Delete Button */}
          <div className="flex justify-end pt-4 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting}>
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete Request
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
