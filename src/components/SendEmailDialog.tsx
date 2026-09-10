import { useState, useEffect, useRef } from 'react';
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
  Send, Loader2, Clock, CalendarIcon, AlertTriangle, User, Paperclip, X, FileImage, File
} from 'lucide-react';
import { RichTextToolbar } from './RichTextToolbar';
import { EMAIL_TO_NAME } from '@/lib/adminDisplayNames';
import { formatDateTime } from "@/lib/dateFormat";

interface EmailAttachment {
  filename: string;
  content: string; // base64
  contentType: string;
  size: number;
}

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
  "12:00 AM", "12:30 AM", "01:00 AM", "01:30 AM", "02:00 AM", "02:30 AM",
  "03:00 AM", "03:30 AM", "04:00 AM", "04:30 AM", "05:00 AM", "05:30 AM",
  "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
  "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM"
];

const timezones = ["PST", "MST", "CST", "EST", "UTC", "GMT", "CET", "IST", "JST", "AEST"];

// Convert HTML to plain text (preserving markdown-style formatting)
const htmlToPlainText = (html: string): string => {
  let text = html;
  
  // Convert bold tags to markdown
  text = text.replace(/<strong>([^<]*)<\/strong>/gi, '**$1**');
  text = text.replace(/<b>([^<]*)<\/b>/gi, '**$1**');
  
  // Convert italic tags to markdown
  text = text.replace(/<em>([^<]*)<\/em>/gi, '*$1*');
  text = text.replace(/<i>([^<]*)<\/i>/gi, '*$1*');
  
  // Convert underline tags to markdown
  text = text.replace(/<u>([^<]*)<\/u>/gi, '__$1__');
  
  // Convert list items
  text = text.replace(/<li>([^<]*)<\/li>/gi, '• $1\n');
  text = text.replace(/<\/ul>/gi, '');
  text = text.replace(/<ul>/gi, '');
  text = text.replace(/<\/ol>/gi, '');
  text = text.replace(/<ol>/gi, '');
  
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  // Convert HTML links to markdown-style links [text](url)
  // This regex handles any attributes in the <a> tag (href, style, etc.)
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '[$2]($1)');
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
  
  // Convert markdown-style bold **text** to HTML
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Convert markdown-style italic *text* to HTML (but not ** which is bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  
  // Convert markdown-style underline __text__ to HTML
  html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
  
  // Convert markdown-style links [text](url) to HTML links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color: #0066cc;">$1</a>'
  );
  
  // Convert bare URLs to links (but not ones already in markdown format or already converted)
  html = html.replace(
    /(?<!href="|>)\b(https?:\/\/[^\s<>]+)(?![^<]*<\/a>)/gi,
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
  const { templates, loading: templatesLoading, fetchTemplates, getTemplateByTrigger } = useEmailTemplates();
  const { toast } = useToast();
  
  const [selectedTrigger, setSelectedTrigger] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  const [templateError, setTemplateError] = useState(false);
  const [sendAsEmail, setSendAsEmail] = useState('default');
  const [currentAdminEmail, setCurrentAdminEmail] = useState<string | null>(null);
  
  // CC and BCC fields
  const [ccEmails, setCcEmails] = useState('');
  const [bccEmails, setBccEmails] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  
  // Interview fields
  const [interviewDate, setInterviewDate] = useState<Date>();
  const [interviewTime, setInterviewTime] = useState('');
  const [timezone, setTimezone] = useState('PST');
  const [meetingLink, setMeetingLink] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Attachments state
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);

  // Admins with configured Gmail credentials (for "Send as" dropdown)
  const ADMIN_SENDERS = [
    { email: 'mark@outsta.io', name: 'Mark' },
    { email: 'kristine@outsta.io', name: 'Kristine' },
    { email: 'czarina@outsta.io', name: 'Czarina' },
    { email: 'eduardo@outsta.io', name: 'Eduardo' },
    { email: 'jil@outsta.io', name: 'Jil' },
  ];

  // Fetch current admin email on mount
  useEffect(() => {
    const fetchAdminEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setCurrentAdminEmail(user.email.toLowerCase());
      }
    };
    fetchAdminEmail();
  }, []);

  // Fetch fresh templates when dialog opens
  useEffect(() => {
    if (open) {
      setTemplateError(false);
      fetchTemplates().catch(() => {
        setTemplateError(true);
      });
    }
  }, [open, fetchTemplates]);

  // Reset form when dialog opens or templates update
  useEffect(() => {
    if (open && !templatesLoading) {
      setSelectedTrigger(preselectedTemplate || '');
      setSubject('');
      setBodyText('');
      setInterviewDate(undefined);
      setInterviewTime('');
      setMeetingLink('');
      setAttachments([]);
      setCcEmails('');
      setBccEmails('');
      setShowCcBcc(false);
      setSendAsEmail('default');
      
      if (preselectedTemplate && templates.length > 0) {
        // Use setTimeout to ensure templates are loaded
        setTimeout(() => handleSelectTemplate(preselectedTemplate), 0);
      }
    }
  }, [open, preselectedTemplate, templatesLoading]);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 5 * 1024 * 1024; // 5MB limit per file
    const newAttachments: EmailAttachment[] = [];

    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 5MB limit`,
          variant: 'destructive',
        });
        continue;
      }

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64Content = result.split(',')[1];
          resolve(base64Content);
        };
        reader.readAsDataURL(file);
      });

      newAttachments.push({
        filename: file.name,
        content: base64,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = async (forceSendNow: boolean = false) => {
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
      // Only schedule if template has delay AND user didn't force send now
      if (template && template.delay_hours > 0 && !forceSendNow) {
        scheduleDateTime = addMinutes(new Date(), template.delay_hours).toISOString();
      }

      // Parse CC and BCC emails
      const parseEmails = (input: string): string[] => {
        return input
          .split(/[,;]/)
          .map(e => e.trim())
          .filter(e => e.length > 0 && e.includes('@'));
      };

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
          sendAsEmail: sendAsEmail !== 'default' ? sendAsEmail : undefined,
          cc: ccEmails.trim() ? parseEmails(ccEmails) : undefined,
          bcc: bccEmails.trim() ? parseEmails(bccEmails) : undefined,
          attachments: attachments.length > 0 ? attachments.map(({ filename, content, contentType }) => ({
            filename,
            content,
            contentType,
          })) : undefined,
        },
      });

      if (error) throw error;

      toast({
        title: data.scheduled ? 'Email scheduled' : 'Email sent',
        description: data.scheduled 
          ? `Will be sent on ${formatDateTime(data.scheduledFor)}`
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
          {/* Send As */}
          <div className="space-y-1.5">
            <Label className="text-sm">Send as</Label>
            <Select value={sendAsEmail} onValueChange={setSendAsEmail}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select sender..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  Recruitment (recruitment@outsta.io)
                </SelectItem>
                {ADMIN_SENDERS.map((admin) => (
                  <SelectItem key={admin.email} value={admin.email}>
                    {admin.name} ({admin.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <Label className="text-sm">Template</Label>
            {templateError ? (
              <div className="flex items-center gap-2 p-2 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Unable to load templates. You can still compose manually.</span>
              </div>
            ) : (
              <Select value={selectedTrigger} onValueChange={handleSelectTemplate} disabled={templatesLoading}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Select a template..."} />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 && !templatesLoading ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No templates available</div>
                  ) : (
                    templates.map((t) => {
                      const displayName = t.name 
                        || triggerToStatus[t.status_trigger] 
                        || t.status_trigger;
                      
                      return (
                        <SelectItem key={t.id} value={t.status_trigger}>
                          {displayName}
                          {!t.is_enabled && ' (disabled)'}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Subject</Label>
              {!showCcBcc && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCcBcc(true)}
                >
                  CC/BCC
                </Button>
              )}
            </div>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              className="h-9"
            />
          </div>

          {/* CC and BCC fields */}
          {showCcBcc && (
            <div className="space-y-3 p-3 border rounded-md bg-muted/20">
              <div className="space-y-1.5">
                <Label className="text-sm">CC</Label>
                <Input
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">Separate multiple emails with commas</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">BCC</Label>
                <Input
                  value={bccEmails}
                  onChange={(e) => setBccEmails(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">Hidden recipients (not visible to others)</p>
              </div>
            </div>
          )}

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
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                      initialFocus
                      className="pointer-events-auto"
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
            <div className="border rounded-md overflow-hidden">
              <RichTextToolbar
                value={bodyText}
                onChange={setBodyText}
                textareaRef={textareaRef}
              />
              <Textarea
                ref={textareaRef}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write your message...&#10;&#10;Use Ctrl+K for quick hyperlink insertion."
                className="min-h-[180px] text-sm resize-none border-0 rounded-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Attachments</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" />
                Add File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              />
            </div>
            
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm"
                  >
                    {att.contentType.startsWith('image/') ? (
                      <FileImage className="h-4 w-4 text-blue-500 shrink-0" />
                    ) : (
                      <File className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 truncate">{att.filename}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(att.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeAttachment(idx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {hasDelay && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleSend(true)} 
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send Now
            </Button>
          )}
          <Button size="sm" onClick={() => handleSend(false)} disabled={sending}>
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
