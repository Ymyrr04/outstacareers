import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    contractor_email_subject?: string | null;
    contractor_email_body?: string | null;
    email_recipient?: string;
  } | null;
  onSaved: () => void;
}

const PLACEHOLDERS = [
  { key: '{{contractor_first_name}}', label: 'Contractor First Name' },
  { key: '{{client_first_name}}', label: 'Client First Name' },
  { key: '{{job_title}}', label: 'Job Title' },
  { key: '{{weeks_elapsed}}', label: 'Weeks Elapsed' },
];

// Convert literal \n to real newlines for display in textarea
const unescapeNewlines = (str: string) => str.replace(/\\n/g, '\n');
// Convert real newlines to \n for storage (keep as real newlines)
const normalizeBody = (str: string) => str;

export const StageEmailTemplateDialog = ({ open, onOpenChange, stage, onSaved }: StageEmailTemplateDialogProps) => {
  const [contractorSubject, setContractorSubject] = useState('');
  const [contractorBody, setContractorBody] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (stage) {
      // Fall back to legacy client fields if contractor fields are empty (migration convenience)
      setContractorSubject(
        (stage as any).contractor_email_subject || stage.checkin_email_subject || ''
      );
      setContractorBody(
        unescapeNewlines((stage as any).contractor_email_body || stage.checkin_email_body || '')
      );
    }
  }, [stage]);

  const handleSave = async () => {
    if (!stage) return;
    setSaving(true);
    const { error } = await supabase
      .from('contractor_pipeline_stages')
      .update({
        contractor_email_subject: contractorSubject || null,
        contractor_email_body: contractorBody || null,
        email_recipient: 'contractor',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stage?.emoji} {stage?.name} — Contractor Email Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This template is sent to the contractor only. Clients will not receive this email.
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Available placeholders</Label>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.filter(p => !p.key.includes('client')).map(p => (
                  <Badge
                    key={p.key}
                    variant="outline"
                    className="text-[10px] cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => setContractorBody(contractorBody + p.key)}
                  >
                    {p.key}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Subject</Label>
              <Input
                value={contractorSubject}
                onChange={(e) => setContractorSubject(e.target.value)}
                placeholder="e.g. Week 1 Check-in: How are you settling in, {{contractor_first_name}}?"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Body</Label>
              <Textarea
                value={contractorBody}
                onChange={(e) => setContractorBody(e.target.value)}
                placeholder="Write your check-in email to the contractor here..."
                rows={10}
                className="text-sm"
              />
            </div>
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
