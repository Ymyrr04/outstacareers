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
  const [recipient, setRecipient] = useState('client');
  const [clientSubject, setClientSubject] = useState('');
  const [clientBody, setClientBody] = useState('');
  const [contractorSubject, setContractorSubject] = useState('');
  const [contractorBody, setContractorBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('client');
  const { toast } = useToast();

  useEffect(() => {
    if (stage) {
      setRecipient((stage as any).email_recipient || 'client');
      setClientSubject(stage.checkin_email_subject || '');
      setClientBody(unescapeNewlines(stage.checkin_email_body || ''));
      setContractorSubject((stage as any).contractor_email_subject || '');
      setContractorBody(unescapeNewlines((stage as any).contractor_email_body || ''));
    }
  }, [stage]);

  const showClientTab = recipient === 'client' || recipient === 'both';
  const showContractorTab = recipient === 'contractor' || recipient === 'both';

  // Auto-switch tab if current tab is hidden
  useEffect(() => {
    if (!showClientTab && activeTab === 'client') setActiveTab('contractor');
    if (!showContractorTab && activeTab === 'contractor') setActiveTab('client');
  }, [recipient, showClientTab, showContractorTab, activeTab]);

  const handleSave = async () => {
    if (!stage) return;
    setSaving(true);
    const { error } = await supabase
      .from('contractor_pipeline_stages')
      .update({
        checkin_email_subject: clientSubject || null,
        checkin_email_body: clientBody || null,
        contractor_email_subject: contractorSubject || null,
        contractor_email_body: contractorBody || null,
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

  const renderTemplateFields = (
    subject: string,
    setSubject: (v: string) => void,
    body: string,
    setBody: (v: string) => void,
    label: string,
  ) => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Available placeholders</Label>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map(p => (
            <Badge
              key={p.key}
              variant="outline"
              className="text-[10px] cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => setBody(body + p.key)}
            >
              {p.key}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{label} — Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Week 1 Check-in: How is {{contractor_name}} doing?"
          className="text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{label} — Body</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your check-in email here... Use line breaks for formatting."
          rows={8}
          className="text-sm"
        />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stage?.emoji} {stage?.name} — Email Templates
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

          {/* Templates */}
          {recipient === 'both' ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="client" className="flex-1 text-xs">Client Template</TabsTrigger>
                <TabsTrigger value="contractor" className="flex-1 text-xs">Contractor Template</TabsTrigger>
              </TabsList>
              <TabsContent value="client" className="mt-3">
                {renderTemplateFields(clientSubject, setClientSubject, clientBody, setClientBody, 'Client email')}
              </TabsContent>
              <TabsContent value="contractor" className="mt-3">
                {renderTemplateFields(contractorSubject, setContractorSubject, contractorBody, setContractorBody, 'Contractor email')}
              </TabsContent>
            </Tabs>
          ) : showClientTab ? (
            renderTemplateFields(clientSubject, setClientSubject, clientBody, setClientBody, 'Client email')
          ) : (
            renderTemplateFields(contractorSubject, setContractorSubject, contractorBody, setContractorBody, 'Contractor email')
          )}

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
