import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Send, Loader2, Clock, CalendarIcon, FileText } from 'lucide-react';
import { RichTextToolbar } from '@/components/RichTextToolbar';
import { formatDateTime } from "@/lib/dateFormat";

interface ContractorEmailRecipient {
  assignmentId: string;
  name: string;
  email: string;
  company: string;
  jobTitle: string;
  hourlyRate?: number | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  is_default: boolean;
}

interface SendContractorEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: ContractorEmailRecipient | null;
  onEmailSent?: () => void;
}

const timeSlots = [
  "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
  "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM",
  "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM",
];

export const SendContractorEmailDialog = ({ open, onOpenChange, contractor, onEmailSent }: SendContractorEmailDialogProps) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState('09:00 AM');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load templates when dialog opens
  useEffect(() => {
    if (!open) return;
    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const { data, error } = await supabase
          .from('contractor_email_templates')
          .select('id, name, subject, body_html, is_default, template_order')
          .order('template_order');
        
        if (error) {
          console.error('Failed to load contractor email templates:', error);
          return;
        }
        
        const tpls = (data || []) as EmailTemplate[];
        console.log('Loaded contractor email templates:', tpls.length);
        setTemplates(tpls);

        // Auto-select default template on first open
        const defaultTpl = tpls.find(t => t.is_default);
        if (defaultTpl) {
          setSelectedTemplateId(defaultTpl.id);
          setSubject(defaultTpl.subject);
          setBodyHtml(defaultTpl.body_html);
        }
      } catch (err) {
        console.error('Failed to load templates:', err);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, [open]);

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === 'none') {
      setSelectedTemplateId('');
      setSubject('');
      setBodyHtml('');
      return;
    }
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      setSelectedTemplateId(tpl.id);
      setSubject(tpl.subject);
      setBodyHtml(tpl.body_html);
    }
  };

  const resetForm = () => {
    setSubject('');
    setBodyHtml('');
    setIsScheduled(false);
    setScheduleDate(undefined);
    setScheduleTime('09:00 AM');
    setSelectedTemplateId('');
  };

  const applyPlaceholders = (text: string): string => {
    if (!contractor) return text;
    const firstName = contractor.name.split(' ')[0];
    const rateStr = contractor.hourlyRate != null ? `$${contractor.hourlyRate}/hr` : '';
    return text
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{full_name\}\}/gi, contractor.name)
      .replace(/\{\{company\}\}/gi, contractor.company)
      .replace(/\{\{job_title\}\}/gi, contractor.jobTitle)
      .replace(/\{\{rate\}\}/gi, rateStr);
  };

  const handleSend = async () => {
    if (!contractor || !subject.trim() || !bodyHtml.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in subject and body', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      let scheduleFor: string | undefined;
      if (isScheduled && scheduleDate) {
        const [time, period] = scheduleTime.split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        let hour24 = hours;
        if (period === 'PM' && hours !== 12) hour24 += 12;
        if (period === 'AM' && hours === 12) hour24 = 0;
        const scheduled = new Date(scheduleDate);
        scheduled.setHours(hour24, minutes, 0, 0);
        scheduleFor = scheduled.toISOString();
      }

      const processedBody = applyPlaceholders(bodyHtml);
      const processedSubject = applyPlaceholders(subject);

      const { data, error } = await supabase.functions.invoke('send-contractor-email', {
        body: {
          contractorAssignmentId: contractor.assignmentId,
          subject: processedSubject,
          bodyHtml: processedBody,
          recipientEmail: contractor.email,
          recipientName: contractor.name,
          scheduleFor,
        },
      });

      // If the edge function returned non-2xx, supabase-js wraps it in a FunctionsHttpError
      // and swallows the body. Read the actual error message from the response.
      if (error) {
        let detailedMessage = error.message || 'Failed to send email';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) detailedMessage = body.error;
          } else if (ctx && typeof ctx.text === 'function') {
            const text = await ctx.text();
            if (text) detailedMessage = text;
          }
        } catch {
          // ignore parse errors, fall back to generic message
        }
        throw new Error(detailedMessage);
      }
      if (data?.error) throw new Error(data.error);

      toast({
        title: data?.scheduled ? 'Email Scheduled' : 'Email Sent',
        description: data?.scheduled
          ? `Email scheduled for ${formatDateTime(scheduleFor!)}`
          : `Email sent to ${contractor.name}`,
      });

      resetForm();
      onOpenChange(false);
      onEmailSent?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send email', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-teal-600" />
            Send Email to Contractor
          </DialogTitle>
        </DialogHeader>

        {contractor && (
          <div className="space-y-4">
            {/* Recipient info */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium">{contractor.name}</p>
              <p className="text-muted-foreground">{contractor.email} • {contractor.company}</p>
            </div>

            {/* Template selector */}
            <div>
              <Label>Template</Label>
              <Select 
                value={selectedTemplateId || 'none'} 
                onValueChange={handleTemplateSelect}
                disabled={loadingTemplates}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingTemplates ? 'Loading...' : 'Select a template'}>
                    <span className="flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      {selectedTemplateId 
                        ? templates.find(t => t.id === selectedTemplateId)?.name || 'Template'
                        : 'No template (blank)'}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No template (blank)</span>
                  </SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        {t.name}
                        {t.is_default && <span className="text-xs text-muted-foreground">(default)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clickable placeholders */}
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex flex-wrap items-center gap-1.5">
              <span>Insert placeholder:</span>
              {['{{first_name}}', '{{full_name}}', '{{company}}', '{{job_title}}', '{{schedule}}', '{{rate}}'].map(p => (
                <button
                  key={p}
                  type="button"
                  className="bg-muted hover:bg-muted/80 px-1.5 py-0.5 rounded font-mono text-xs cursor-pointer border border-border hover:border-primary/50 transition-colors"
                  onClick={() => {
                    // Insert into whichever field was last focused, default to body
                    const subjectEl = document.getElementById('contractor-email-subject') as HTMLInputElement | null;
                    const isSubjectFocused = document.activeElement === subjectEl;

                    if (isSubjectFocused && subjectEl) {
                      const start = subjectEl.selectionStart ?? subject.length;
                      const end = subjectEl.selectionEnd ?? subject.length;
                      const newVal = subject.substring(0, start) + p + subject.substring(end);
                      setSubject(newVal);
                      setTimeout(() => {
                        subjectEl.focus();
                        const pos = start + p.length;
                        subjectEl.setSelectionRange(pos, pos);
                      }, 0);
                    } else {
                      const ta = textareaRef.current;
                      const start = ta?.selectionStart ?? bodyHtml.length;
                      const end = ta?.selectionEnd ?? bodyHtml.length;
                      const newVal = bodyHtml.substring(0, start) + p + bodyHtml.substring(end);
                      setBodyHtml(newVal);
                      setTimeout(() => {
                        ta?.focus();
                        const pos = start + p.length;
                        ta?.setSelectionRange(pos, pos);
                      }, 0);
                    }
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Subject */}
            <div>
              <Label htmlFor="contractor-email-subject">Subject</Label>
              <Input
                id="contractor-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>

            {/* Body */}
            <div>
              <Label>Body</Label>
              <RichTextToolbar 
                value={bodyHtml} 
                onChange={setBodyHtml} 
                textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
                placeholders={['{{first_name}}', '{{full_name}}', '{{company}}', '{{job_title}}', '{{schedule}}', '{{rate}}']}
              />
              <textarea
                ref={textareaRef}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                className="w-full min-h-[320px] p-3 border rounded-md bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Write your email content here... HTML is supported."
              />
            </div>

            {/* Options row */}
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                type="button"
                variant={isScheduled ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsScheduled(!isScheduled)}
              >
                <Clock className="w-4 h-4 mr-1" />
                {isScheduled ? 'Scheduled' : 'Schedule for later'}
              </Button>

            </div>

            {isScheduled && (
              <div className="flex items-center gap-3 pl-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn(!scheduleDate && 'text-muted-foreground')}>
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {scheduleDate ? format(scheduleDate, 'MMM d, yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduleDate}
                      onSelect={setScheduleDate}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
                <Select value={scheduleTime} onValueChange={setScheduleTime}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending || !subject.trim() || !bodyHtml.trim()}>
                {sending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isScheduled ? 'Scheduling...' : 'Sending...'}</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" />{isScheduled ? 'Schedule Email' : 'Send Email'}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
