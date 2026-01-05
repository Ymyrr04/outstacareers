import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEmailTemplates, statusToTrigger, triggerToStatus, EmailTemplate } from '@/hooks/useEmailTemplates';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, addHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  Mail, Send, Loader2, Clock, Eye, CalendarIcon, AlertTriangle 
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
  preselectedTemplate?: string; // status_trigger value
  onEmailSent?: () => void;
}

const timeSlots = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM"
];

const timezones = [
  "PST", "MST", "CST", "EST", "UTC", "GMT", "CET", "IST", "JST", "AEST"
];

export function SendEmailDialog({ 
  open, 
  onOpenChange, 
  applicant,
  preselectedTemplate,
  onEmailSent
}: SendEmailDialogProps) {
  const { templates, getTemplateByTrigger } = useEmailTemplates();
  const { toast } = useToast();
  
  const [selectedTrigger, setSelectedTrigger] = useState(preselectedTemplate || '');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  
  // Interview-specific fields
  const [interviewDate, setInterviewDate] = useState<Date>();
  const [interviewTime, setInterviewTime] = useState('');
  const [timezone, setTimezone] = useState('PST');
  const [meetingLink, setMeetingLink] = useState('');
  
  // Schedule options
  const [scheduleFor, setScheduleFor] = useState<Date>();
  const [scheduleTime, setScheduleTime] = useState('');

  const handleSelectTemplate = (trigger: string) => {
    setSelectedTrigger(trigger);
    const template = getTemplateByTrigger(trigger);
    if (template && applicant) {
      let processedSubject = template.subject
        .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
        .replace(/\{\{job_title\}\}/g, applicant.job_title);
      
      let processedBody = template.body_html
        .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
        .replace(/\{\{job_title\}\}/g, applicant.job_title);
      
      setSubject(processedSubject);
      setBodyHtml(processedBody);
    }
  };

  const getProcessedBody = () => {
    let processed = bodyHtml;
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

    // Validate required fields
    if (!subject.trim() || !bodyHtml.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please fill in subject and body',
        variant: 'destructive',
      });
      return;
    }

    // Validate interview fields if it's an interview template
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
      
      // Calculate schedule time
      let scheduleDateTime: string | undefined;
      
      // For rejection emails, use template delay
      if (selectedTrigger === 'reject' && template && template.delay_hours > 0) {
        scheduleDateTime = addHours(new Date(), template.delay_hours).toISOString();
      }
      // For manual scheduling
      else if (scheduleFor && scheduleTime) {
        const [hours, minutes] = scheduleTime.split(':');
        const scheduled = new Date(scheduleFor);
        scheduled.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        if (scheduled > new Date()) {
          scheduleDateTime = scheduled.toISOString();
        }
      }

      const { data, error } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          applicantId: applicant.id,
          templateId: template?.id,
          subject,
          bodyHtml: processedBody,
          recipientEmail: applicant.email,
          applicantStatusAtSend: applicant.status,
          isAutomated: false,
          scheduleFor: scheduleDateTime,
        },
      });

      if (error) throw error;

      toast({
        title: data.scheduled ? 'Email scheduled!' : 'Email sent!',
        description: data.scheduled 
          ? `Email scheduled for ${format(new Date(data.scheduledFor), 'PPP p')}`
          : `Email sent to ${applicant.email}`,
      });

      // Reset form
      setSelectedTrigger('');
      setSubject('');
      setBodyHtml('');
      setInterviewDate(undefined);
      setInterviewTime('');
      setMeetingLink('');
      setScheduleFor(undefined);
      setScheduleTime('');
      
      onOpenChange(false);
      onEmailSent?.();
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast({
        title: 'Failed to send email',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const isInterviewTemplate = selectedTrigger === 'for_interview';
  const isRejectTemplate = selectedTrigger === 'reject';
  const template = getTemplateByTrigger(selectedTrigger);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Email
          </DialogTitle>
          <DialogDescription>
            {applicant ? `Sending to: ${applicant.full_name} (${applicant.email})` : 'Select an applicant'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Email Template</Label>
            <Select value={selectedTrigger} onValueChange={handleSelectTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.status_trigger}>
                    {triggerToStatus[t.status_trigger] || t.status_trigger}
                    {!t.is_enabled && ' (Disabled)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
            />
          </div>

          {/* Interview-specific fields */}
          {isInterviewTemplate && (
            <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-2">
                <Label>Interview Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !interviewDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {interviewDate ? format(interviewDate, "PPP") : "Select date"}
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

              <div className="space-y-2">
                <Label>Interview Time *</Label>
                <Select value={interviewTime} onValueChange={setInterviewTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Meeting Link *</Label>
                <Input
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                />
              </div>
            </div>
          )}

          {/* Rejection delay warning */}
          {isRejectTemplate && template && template.delay_hours > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">Delayed Sending</p>
                <p className="text-amber-700 dark:text-amber-300">
                  This email will be scheduled to send in {template.delay_hours} hour(s). 
                  You can cancel it from the applicant's communication history.
                </p>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Email Body</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewMode(!previewMode)}
              >
                <Eye className="h-4 w-4 mr-1" />
                {previewMode ? 'Edit' : 'Preview'}
              </Button>
            </div>
            {previewMode ? (
              <div className="border rounded-lg p-4 min-h-[200px] prose prose-sm max-w-none dark:prose-invert">
                <div dangerouslySetInnerHTML={{ __html: getProcessedBody() }} />
              </div>
            ) : (
              <Textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="<p>Email content...</p>"
                className="min-h-[200px] font-mono text-sm"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {isRejectTemplate && template && template.delay_hours > 0 ? 'Schedule Email' : 'Send Email'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
