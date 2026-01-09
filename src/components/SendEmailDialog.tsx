import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEmailTemplates, triggerToStatus } from '@/hooks/useEmailTemplates';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, addMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  Send, Loader2, Clock, CalendarIcon, AlertTriangle, User 
} from 'lucide-react';

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicant: {
    id: string;
    full_name: string;
    email: string;
    job_title: string;
    status: string;
  } | null;
  preselectedTemplate?: string;
  onEmailSent?: () => void;
}

const timeSlots = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM"
];

const timezones = ["PST", "MST", "CST", "EST", "UTC", "GMT", "CET", "IST", "JST", "AEST"];

// Convert HTML to plain text
const htmlToPlainText = (html: string): string => {
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
};

// Convert plain text to simple HTML
const plainTextToHtml = (text: string): string => {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(
    /\b(https?:\/\/[^\s<>]+)/gi,
    '<a href="$1" style="color: #0066cc;">$1</a>'
  );
  html = html.replace(/\n/g, '<br>');
  return html;
};

export function SendEmailDialog({ 
  open, 
  onOpenChange, 
  applicant,
  preselectedTemplate,
  onEmailSent
}: SendEmailDialogProps) {
  const { templates, getTemplateByTrigger } = useEmailTemplates();
  const { toast } = useToast();
  
  const [selectedTrigger, setSelectedTrigger] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  
  // Interview fields
  const [interviewDate, setInterviewDate] = useState<Date>();
  const [interviewTime, setInterviewTime] = useState('');
  const [timezone, setTimezone] = useState('PST');
  const [meetingLink, setMeetingLink] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTrigger(preselectedTemplate || '');
      setSubject('');
      setBodyText('');
      setInterviewDate(undefined);
      setInterviewTime('');
      setMeetingLink('');
      
      if (preselectedTemplate) {
        handleSelectTemplate(preselectedTemplate);
      }
    }
  }, [open, preselectedTemplate]);

  const getFirstName = (fullName: string) => {
    return fullName.split(' ')[0];
  };

  const handleSelectTemplate = (trigger: string) => {
    setSelectedTrigger(trigger);
    const template = getTemplateByTrigger(trigger);
    if (template && applicant) {
      const firstName = getFirstName(applicant.full_name);
      
      const processedSubject = template.subject
        .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{full_name\}\}/g, applicant.full_name)
        .replace(/\{\{job_title\}\}/g, applicant.job_title);
      
      let processedBody = htmlToPlainText(template.body_html)
        .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{full_name\}\}/g, applicant.full_name)
        .replace(/\{\{job_title\}\}/g, applicant.job_title);
      
      setSubject(processedSubject);
      setBodyText(processedBody);
    }
  };

  const getProcessedBody = () => {
    let processed = bodyText;
    if (interviewDate) {
      processed = processed.replace(/\{\{interview_date\}\}/g, format(interviewDate, 'EEEE, MMMM d, yyyy'));
    }
    if (interviewTime) {
      processed = processed.replace(/\{\{interview_time\}\}/g, interviewTime);
    }
    processed = processed.replace(/\{\{timezone\}\}/g, timezone);
    if (meetingLink) {
      processed = processed.replace(/\{\{meeting_link\}\}/g, meetingLink);
    }
    return processed;
  };

  const handleSend = async () => {
    if (!applicant) return;

    if (!subject.trim() || !bodyText.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please fill in subject and message',
        variant: 'destructive',
      });
      return;
    }

    if (selectedTrigger === 'for_interview') {
      if (!interviewDate || !interviewTime || !meetingLink) {
        toast({
          title: 'Missing interview details',
          description: 'Please fill in date, time, and meeting link',
          variant: 'destructive',
        });
        return;
      }
    }

    setSending(true);

    try {
      const template = getTemplateByTrigger(selectedTrigger);
      const processedBody = getProcessedBody();
      
      let scheduleDateTime: string | undefined;
      // delay_hours now stores minutes for all templates
      if (template && template.delay_hours > 0) {
        scheduleDateTime = addMinutes(new Date(), template.delay_hours).toISOString();
      }

      const { data, error } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          applicantId: applicant.id,
          templateId: template?.id,
          subject,
          bodyHtml: plainTextToHtml(processedBody),
          recipientEmail: applicant.email,
          applicantStatusAtSend: applicant.status,
          isAutomated: false,
          scheduleFor: scheduleDateTime,
        },
      });

      if (error) throw error;

      toast({
        title: data.scheduled ? 'Email scheduled' : 'Email sent',
        description: data.scheduled 
          ? `Will be sent on ${format(new Date(data.scheduledFor), 'PPP p')}`
          : `Sent to ${applicant.email}`,
      });

      onOpenChange(false);
      onEmailSent?.();
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast({
        title: 'Failed to send',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const isInterviewTemplate = selectedTrigger === 'for_interview';
  const isSivTemplate = selectedTrigger === 'siv';
  const isRejectTemplate = selectedTrigger === 'reject';
  const template = getTemplateByTrigger(selectedTrigger);
  const hasDelay = template && template.delay_hours > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Send className="h-4 w-4" />
            Send Email
          </DialogTitle>
          {applicant && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
              <User className="h-3.5 w-3.5" />
              {applicant.full_name} • {applicant.email}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-2">
          {/* Template */}
          <div className="space-y-1.5">
            <Label className="text-sm">Template</Label>
            <Select value={selectedTrigger} onValueChange={handleSelectTemplate}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => {
                  // Use the name column if available, otherwise fallback
                  const displayName = t.name 
                    || triggerToStatus[t.status_trigger] 
                    || t.status_trigger;
                  
                  return (
                    <SelectItem key={t.id} value={t.status_trigger}>
                      {displayName}
                      {!t.is_enabled && ' (disabled)'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-sm">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              className="h-9"
            />
          </div>

          {/* Interview fields */}
          {isInterviewTemplate && (
            <div className="grid grid-cols-2 gap-3 p-3 border rounded-md bg-muted/20">
              <div className="space-y-1.5">
                <Label className="text-sm">Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-left font-normal h-9",
                        !interviewDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {interviewDate ? format(interviewDate, "MMM d, yyyy") : "Select"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={interviewDate}
                      onSelect={setInterviewDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Time *</Label>
                <Select value={interviewTime} onValueChange={setInterviewTime}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Meeting Link *</Label>
                <Input
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://..."
                  className="h-9"
                />
              </div>
            </div>
          )}

          {/* Delay warning for scheduled emails */}
          {hasDelay && template && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-amber-800 dark:text-amber-200">
                {template.delay_hours >= 60 && template.delay_hours % 60 === 0
                  ? `This email will be scheduled to send in ${template.delay_hours / 60} hour${template.delay_hours / 60 !== 1 ? 's' : ''}. You can cancel it from the communication history.`
                  : `This email will be scheduled to send in ${template.delay_hours} minute${template.delay_hours !== 1 ? 's' : ''}. You can cancel it from the communication history if moved by mistake.`
                }
              </p>
            </div>
          )}

          {/* Message */}
          <div className="space-y-1.5">
            <Label className="text-sm">Message</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Write your message...&#10;&#10;URLs will automatically become clickable links."
              className="min-h-[180px] text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Links will be clickable in the sent email.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : hasDelay ? (
              <Clock className="mr-1.5 h-4 w-4" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            {hasDelay ? 'Schedule' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
