import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, MessageSquare } from 'lucide-react';

interface SendCheckinEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: {
    assignmentId: string;
    contractorName: string;
    contractorFirstName: string;
    contractorEmail: string;
    clientId: string;
    clientName: string;
    jobTitle: string;
    weeksElapsed: number;
  } | null;
  stage: {
    id: string;
    name: string;
    emoji: string | null;
    checkin_email_subject: string | null;
    checkin_email_body: string | null;
    contractor_email_subject: string | null;
    contractor_email_body: string | null;
    email_recipient: string;
  } | null;
}

const PLACEHOLDERS = [
  { key: '{{contractor_first_name}}', label: 'Contractor First Name' },
  { key: '{{client_first_name}}', label: 'Client First Name' },
  { key: '{{job_title}}', label: 'Job Title' },
  { key: '{{weeks_elapsed}}', label: 'Weeks Elapsed' },
];

function toProperCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function replacePlaceholders(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export const SendCheckinEmailDialog = ({ open, onOpenChange, contractor, stage }: SendCheckinEmailDialogProps) => {
  const [clientSubject, setClientSubject] = useState('');
  const [clientBody, setClientBody] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientFirstName, setClientFirstName] = useState('');
  const [contractorSubject, setContractorSubject] = useState('');
  const [contractorBody, setContractorBody] = useState('');
  const [sending, setSending] = useState<'client' | 'contractor' | null>(null);
  const [activeTab, setActiveTab] = useState('client');
  const { toast } = useToast();

  useEffect(() => {
    if (!stage || !contractor || !open) return;

    const placeholders: Record<string, string> = {
      contractor_first_name: toProperCase(contractor.contractorFirstName),
      client_first_name: '',
      job_title: contractor.jobTitle || 'Contractor',
      weeks_elapsed: String(contractor.weeksElapsed),
    };

    // Fetch primary client contact
    const fetchClientContact = async () => {
      const { data: contacts } = await supabase
        .from('client_contacts')
        .select('email, full_name, first_name')
        .eq('client_id', contractor.clientId)
        .eq('is_primary', true)
        .limit(1);

      const pc = contacts?.[0];
      if (pc) {
        setClientEmail(pc.email || '');
        const firstName = pc.first_name || pc.full_name?.split(' ')[0] || '';
        setClientFirstName(firstName);
        placeholders.client_first_name = firstName;
      }

      // Fill client template
      if (stage.checkin_email_subject) {
        setClientSubject(replacePlaceholders(stage.checkin_email_subject, placeholders));
      }
      if (stage.checkin_email_body) {
        setClientBody(replacePlaceholders(stage.checkin_email_body.replace(/\\n/g, '\n'), placeholders));
      }

      // Fill contractor template
      if ((stage as any).contractor_email_subject) {
        setContractorSubject(replacePlaceholders((stage as any).contractor_email_subject, placeholders));
      }
      if ((stage as any).contractor_email_body) {
        setContractorBody(replacePlaceholders((stage as any).contractor_email_body.replace(/\\n/g, '\n'), placeholders));
      }
    };

    fetchClientContact();
  }, [stage, contractor, open]);

  const handleSend = async (target: 'client' | 'contractor') => {
    if (!contractor) return;

    const email = target === 'client' ? clientEmail : contractor.contractorEmail;
    const subject = target === 'client' ? clientSubject : contractorSubject;
    const body = target === 'client' ? clientBody : contractorBody;
    const name = target === 'client' ? clientFirstName : contractor.contractorFirstName;

    if (!subject || !body) {
      toast({ title: 'Missing content', description: 'Subject and body are required', variant: 'destructive' });
      return;
    }

    setSending(target);
    try {
      if (target === 'contractor') {
        // Post to contractor's portal Check-in instead of emailing
        const { error: msgErr } = await supabase
          .from('contractor_checkin_messages' as any)
          .insert({
            contractor_assignment_id: contractor.assignmentId,
            stage_id: stage?.id ?? null,
            subject,
            body_html: body,
          } as any);
        if (msgErr) throw msgErr;

        toast({
          title: 'Posted to portal',
          description: `${contractor.contractorFirstName} will see this in their Check-in tab.`,
        });
      } else {
        if (!email) {
          toast({ title: 'No email', description: 'No client email found', variant: 'destructive' });
          setSending(null);
          return;
        }
        const { error } = await supabase.functions.invoke('send-contractor-email', {
          body: {
            contractorAssignmentId: contractor.assignmentId,
            subject,
            bodyHtml: body,
            recipientEmail: email,
            recipientName: name,
          },
        });
        if (error) throw error;

        if (stage) {
          await supabase.from('contractor_checkin_emails').insert({
            contractor_assignment_id: contractor.assignmentId,
            stage_id: stage.id,
            recipient_email: email,
            recipient_name: name,
            subject,
            body_html: body,
            status: 'sent',
            sent_at: new Date().toISOString(),
          } as any);
        }

        toast({ title: 'Email sent', description: `Check-in email sent to ${email}` });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSending(null);
    }
  };

  const emailRecipient = stage?.email_recipient || 'client';
  const showClientTab = emailRecipient === 'client' || emailRecipient === 'both';
  const showContractorTab = emailRecipient === 'contractor' || emailRecipient === 'both';
  const showBothTabs = showClientTab && showContractorTab;

  const renderEmailForm = (
    target: 'client' | 'contractor',
    subject: string,
    setSubject: (v: string) => void,
    body: string,
    setBody: (v: string) => void,
    recipientEmail: string,
  ) => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">To</Label>
        <Input value={recipientEmail} readOnly className="text-sm bg-muted/50" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Body</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="text-sm" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => handleSend(target)} disabled={!!sending}>
          {sending === target ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Sending...</>
          ) : (
            <><Send className="w-3.5 h-3.5 mr-1.5" /> Send Email</>
          )}
        </Button>
      </div>
    </div>
  );

  const hasAnyTemplate = stage?.checkin_email_subject || (stage as any)?.contractor_email_subject;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {stage?.emoji} Send Check-in Email — {contractor?.contractorName}
          </DialogTitle>
        </DialogHeader>

        {!hasAnyTemplate ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No email template configured for this stage. Click the ✉️ icon on the column header to set one up.
          </div>
        ) : showBothTabs ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="client" className="flex-1 text-xs">To Client</TabsTrigger>
              <TabsTrigger value="contractor" className="flex-1 text-xs">To Contractor</TabsTrigger>
            </TabsList>
            <TabsContent value="client" className="mt-3">
              {renderEmailForm('client', clientSubject, setClientSubject, clientBody, setClientBody, clientEmail)}
            </TabsContent>
            <TabsContent value="contractor" className="mt-3">
              {renderEmailForm('contractor', contractorSubject, setContractorSubject, contractorBody, setContractorBody, contractor?.contractorEmail || '')}
            </TabsContent>
          </Tabs>
        ) : showClientTab ? (
          renderEmailForm('client', clientSubject, setClientSubject, clientBody, setClientBody, clientEmail)
        ) : (
          renderEmailForm('contractor', contractorSubject, setContractorSubject, contractorBody, setContractorBody, contractor?.contractorEmail || '')
        )}
      </DialogContent>
    </Dialog>
  );
};
