import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StageEmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: {
    id: string;
    name: string;
    emoji: string | null;
    checkin_email_subject: string | null;
    checkin_email_body: string | null;
    email_recipient?: string;
  } | null;
  onSaved: () => void;
}

const PLACEHOLDERS = [
  { key: '{{contractor_name}}', label: 'Contractor Name' },
  { key: '{{client_name}}', label: 'Client Contact Name' },
  { key: '{{job_title}}', label: 'Job Title' },
  { key: '{{weeks_elapsed}}', label: 'Weeks Elapsed' },
];

export const StageEmailTemplateDialog = ({ open, onOpenChange, stage, onSaved }: StageEmailTemplateDialogProps) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipient, setRecipient] = useState('client');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (stage) {
      setSubject(stage.checkin_email_subject || '');
      setBody(stage.checkin_email_body || '');
      setRecipient((stage as any).email_recipient || 'client');
    }
  }, [stage]);

  const handleSave = async () => {
    if (!stage) return;
    setSaving(true);
    const { error } = await supabase
      .from('contractor_pipeline_stages')
      .update({
        checkin_email_subject: subject || null,
        checkin_email_body: body || null,
        email_recipient: recipient,
      } as any)
      .eq('id', stage.id);

    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: `Email template for "${stage.name}" updated` });
      onSaved();
      onOpenChange(false);
    }
  };

  const insertPlaceholder = (placeholder: string, target: 'subject' | 'body') => {
    if (target === 'subject') {
      setSubject(prev => prev + placeholder);
    } else {
      setBody(prev => prev + placeholder);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stage?.emoji} {stage?.name} — Email Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Send email to</Label>
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client contact only</SelectItem>
                <SelectItem value="contractor">Contractor only</SelectItem>
                <SelectItem value="both">Both client & contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Placeholders */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Available placeholders</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map(p => (
                <Badge
                  key={p.key}
                  variant="outline"
                  className="text-[10px] cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => insertPlaceholder(p.key, 'body')}
                >
                  {p.key}
                </Badge>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Week 1 Check-in: How is {{contractor_name}} doing?"
              className="text-sm"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Email body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your check-in email here..."
              rows={8}
              className="text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
