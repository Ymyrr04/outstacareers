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
import { Send, Loader2, MessageSquare, ListChecks, Mail } from 'lucide-react';
import { WysiwygEditor } from '@/components/WysiwygEditor';
import { formatDate } from "@/lib/dateFormat";

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
    startDate?: string | null;
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
    checkin_sections?: CheckinSection[] | null;
  } | null;
}

interface LibraryTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: 'email' | 'checklist';
  subject: string | null;
  body_html: string | null;
  sections: any;
}

interface CheckinSection {
  title: string;
  items: string[];
  color?: string;
  enabled?: boolean;
}

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
  const [contractorMode, setContractorMode] = useState<'email' | 'checklist'>('email');
  const [contractorSections, setContractorSections] = useState<CheckinSection[]>([]);

  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const [sending, setSending] = useState<'client' | 'contractor' | null>(null);
  const [activeTab, setActiveTab] = useState('contractor');
  const { toast } = useToast();

  const buildContractorPlaceholders = (clientFirst = clientFirstName): Record<string, string> => {
    if (!contractor) return {};
    const fullName = toProperCase(contractor.contractorName || '');
    const firstName = toProperCase(contractor.contractorFirstName || fullName.split(' ')[0] || '');
    const lastName = toProperCase((contractor.contractorName || '').split(' ').slice(1).join(' '));
    const startDate = contractor.startDate
      ? formatDate(contractor.startDate)
      : '';
    return {
      // Contractor-sourced tokens (match Template Library merge tags)
      first_name: firstName,
      full_name: fullName,
      last_name: lastName,
      email: contractor.contractorEmail || '',
      role: contractor.jobTitle || 'Contractor',
      client_name: contractor.clientName || '',
      start_date: startDate,
      weeks_elapsed: String(contractor.weeksElapsed ?? ''),
      // Backward-compat aliases
      contractor_first_name: firstName,
      contractor_full_name: fullName,
      contractor_last_name: lastName,
      contractor_email: contractor.contractorEmail || '',
      job_title: contractor.jobTitle || 'Contractor',
      client_first_name: clientFirst,
    };
  };

  const placeholders = (): Record<string, string> => buildContractorPlaceholders();

  // Load library templates once when dialog opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('checkin_templates_library' as any)
        .select('id, name, description, template_type, subject, body_html, sections')
        .order('name', { ascending: true });
      setTemplates((data as any) || []);
    })();
  }, [open]);

  useEffect(() => {
    if (!stage || !contractor || !open) return;

    const p = buildContractorPlaceholders('');


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
        p.client_first_name = firstName;
      }

      if (stage.checkin_email_subject) setClientSubject(replacePlaceholders(stage.checkin_email_subject, p));
      if (stage.checkin_email_body) setClientBody(replacePlaceholders(stage.checkin_email_body.replace(/\\n/g, '\n'), p));

      setContractorSubject(
        (stage as any).contractor_email_subject
          ? replacePlaceholders((stage as any).contractor_email_subject, p)
          : `Check-in: ${stage.name}`
      );
      const stageSections = Array.isArray((stage as any).checkin_sections)
        ? ((stage as any).checkin_sections as CheckinSection[]).filter(s => s.enabled !== false && Array.isArray(s.items) && s.items.length > 0)
        : [];

      if ((stage as any).contractor_email_body) {
        setContractorBody(replacePlaceholders((stage as any).contractor_email_body.replace(/\\n/g, '\n'), p));
      } else {
        setContractorBody('');
      }
      setContractorMode(stageSections.length > 0 ? 'checklist' : 'email');
      setContractorSections(stageSections);
      setSelectedTemplateId('');
    };

    fetchClientContact();
  }, [stage, contractor, open]);

  // Auto-select a matching library template based on the stage name
  // (e.g. stage "Week 1 Check-in" -> template "Week 1 check in").
  useEffect(() => {
    if (!open || !stage || templates.length === 0 || selectedTemplateId) return;
    const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const stageKey = norm(stage.name || '');
    if (!stageKey) return;
    const match =
      templates.find(t => norm(t.name) === stageKey) ||
      templates.find(t => norm(t.name).includes(stageKey) || stageKey.includes(norm(t.name)));
    if (match) applyTemplate(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage, templates]);


  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    const p = placeholders();
    if (t.template_type === 'checklist') {
      setContractorMode('checklist');
      const secs: CheckinSection[] = Array.isArray(t.sections) ? t.sections : [];
      setContractorSections(secs.filter(s => s.enabled !== false));
      setContractorSubject(t.subject ? replacePlaceholders(t.subject, p) : `Check-in: ${t.name}`);
      setContractorBody(t.body_html ? replacePlaceholders(t.body_html, p) : contractorBody);
    } else {
      setContractorMode(contractorSections.length > 0 ? 'checklist' : 'email');
      setContractorSubject(replacePlaceholders(t.subject || t.name || '', p));
      setContractorBody(t.body_html ? replacePlaceholders(t.body_html, p) : '');
    }
  };

  const handleSend = async (target: 'client' | 'contractor') => {
    if (!contractor) return;

    if (target === 'contractor') {
      if (!contractorSubject) {
        toast({ title: 'Missing subject', description: 'Subject is required', variant: 'destructive' });
        return;
      }
      if (contractorMode === 'email' && !contractorBody) {
        toast({ title: 'Missing body', description: 'Body is required', variant: 'destructive' });
        return;
      }
      if (contractorMode === 'checklist' && contractorSections.length === 0) {
        toast({ title: 'Empty form', description: 'This checklist template has no sections', variant: 'destructive' });
        return;
      }

      setSending('contractor');
      try {
        const { error: msgErr } = await supabase
          .from('contractor_checkin_messages' as any)
          .insert({
            contractor_assignment_id: contractor.assignmentId,
            stage_id: stage?.id ?? null,
            subject: contractorSubject,
            body_html: contractorBody || null,
            template_type: contractorMode,
            sections: contractorMode === 'checklist' ? (contractorSections as any) : null,
          } as any);
        if (msgErr) throw msgErr;

        toast({
          title: 'Posted to portal',
          description: `${contractor.contractorFirstName} will see this in their Check-in tab.`,
        });
        onOpenChange(false);
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      } finally {
        setSending(null);
      }
      return;
    }

    // Client email
    if (!clientSubject || !clientBody) {
      toast({ title: 'Missing content', description: 'Subject and body are required', variant: 'destructive' });
      return;
    }
    if (!clientEmail) {
      toast({ title: 'No email', description: 'No client email found', variant: 'destructive' });
      return;
    }

    setSending('client');
    try {
      const { error } = await supabase.functions.invoke('send-contractor-email', {
        body: {
          contractorAssignmentId: contractor.assignmentId,
          subject: clientSubject,
          bodyHtml: clientBody,
          recipientEmail: clientEmail,
          recipientName: clientFirstName,
        },
      });
      if (error) throw error;

      if (stage) {
        await supabase.from('contractor_checkin_emails').insert({
          contractor_assignment_id: contractor.assignmentId,
          stage_id: stage.id,
          recipient_email: clientEmail,
          recipient_name: clientFirstName,
          subject: clientSubject,
          body_html: clientBody,
          status: 'sent',
          sent_at: new Date().toISOString(),
        } as any);
      }

      toast({ title: 'Email sent', description: `Check-in email sent to ${clientEmail}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSending(null);
    }
  };

  // Check-ins are contractor-only — never surface the client email form here.
  const showClientTab = false;
  const showContractorTab = true;
  const showBothTabs = false;

  const emailTemplates = templates.filter(t => t.template_type === 'email');
  const checklistTemplates = templates.filter(t => t.template_type === 'checklist');

  const renderTemplatePicker = () => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Load from Template Library</Label>
      <Select value={selectedTemplateId} onValueChange={applyTemplate}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Pick an email or checklist form template..." />
        </SelectTrigger>
        <SelectContent>
          {emailTemplates.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Email templates</div>
              {emailTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="inline-flex items-center gap-1.5"><Mail className="w-3 h-3" /> {t.name}</span>
                </SelectItem>
              ))}
            </>
          )}
          {checklistTemplates.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-t mt-1">Checklist forms</div>
              {checklistTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="inline-flex items-center gap-1.5"><ListChecks className="w-3 h-3" /> {t.name}</span>
                </SelectItem>
              ))}
            </>
          )}
          {templates.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">No templates saved yet.</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );

  const renderContractorForm = () => (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-md px-2.5 py-1.5">
        This will be posted to the contractor's <span className="font-medium text-foreground">Check-in tab</span> in the portal — no email is sent.
      </div>

      {renderTemplatePicker()}

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Subject</Label>
        <Input value={contractorSubject} onChange={(e) => setContractorSubject(e.target.value)} className="text-sm" />
      </div>

      {contractorMode === 'email' ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Body</Label>
          <WysiwygEditor value={contractorBody} onChange={setContractorBody} minHeight="220px" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Message shown above the form (optional)</Label>
            <WysiwygEditor value={contractorBody} onChange={setContractorBody} minHeight="160px" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Checklist form preview
              <Badge variant="outline" className="text-[10px]">The contractor will tick and submit these</Badge>
            </Label>
            <div className="rounded-md border bg-muted/20 p-3 space-y-3 max-h-[300px] overflow-y-auto">
              {contractorSections.map((sec, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold mb-1">{sec.title}</p>
                  <ul className="space-y-0.5 pl-3">
                    {sec.items.map((it, j) => {
                      const raw = it || '';
                      const isShort = raw.startsWith('[[short]]');
                      const isLong = raw.startsWith('[[long]]');
                      const text = isShort ? raw.slice(9) : isLong ? raw.slice(8) : raw;
                      const tag = isShort ? ' — short answer' : isLong ? ' — long answer' : '';
                      return (
                        <li key={j} className="text-[11px] text-muted-foreground list-disc">
                          {text}<span className="text-[10px] opacity-70">{tag}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => handleSend('contractor')} disabled={!!sending}>
          {sending === 'contractor' ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Posting...</>
          ) : contractorMode === 'checklist' ? (
            <><ListChecks className="w-3.5 h-3.5 mr-1.5" /> Post Form to Portal</>
          ) : (
            <><MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Post to Portal</>
          )}
        </Button>
      </div>
    </div>
  );

  const renderClientForm = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">To</Label>
        <Input value={clientEmail} readOnly className="text-sm bg-muted/50" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Subject</Label>
        <Input value={clientSubject} onChange={(e) => setClientSubject(e.target.value)} className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Body</Label>
        <Textarea value={clientBody} onChange={(e) => setClientBody(e.target.value)} rows={8} className="text-sm" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => handleSend('client')} disabled={!!sending}>
          {sending === 'client' ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Sending...</>
          ) : (
            <><Send className="w-3.5 h-3.5 mr-1.5" /> Send Email</>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {stage?.emoji} Send Check-in — {contractor?.contractorName}
          </DialogTitle>
        </DialogHeader>

        {showBothTabs ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="contractor" className="flex-1 text-xs">Post to Contractor Portal</TabsTrigger>
              <TabsTrigger value="client" className="flex-1 text-xs">Email Client</TabsTrigger>
            </TabsList>
            <TabsContent value="contractor" className="mt-3">{renderContractorForm()}</TabsContent>
            <TabsContent value="client" className="mt-3">{renderClientForm()}</TabsContent>
          </Tabs>
        ) : showClientTab ? (
          renderClientForm()
        ) : (
          renderContractorForm()
        )}
      </DialogContent>
    </Dialog>
  );
};
