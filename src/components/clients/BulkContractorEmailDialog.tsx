import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Send, Loader2, FileText, Mail, Users, RefreshCw, CalendarClock, Clock, XCircle, CalendarIcon } from 'lucide-react';
import { RichTextToolbar } from '@/components/RichTextToolbar';
import { ScheduleDateTimeDialog } from '@/components/clients/ScheduleDateTimeDialog';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  is_default: boolean;
}

interface BulkContractorEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeContractorCount: number;
  onEmailSent?: () => void;
}

const RECURRING_OPTIONS = [
  { value: 'none', label: 'One-time (no recurring)' },
  { value: 'weekly-friday', label: 'Every Friday' },
  { value: 'weekly-monday', label: 'Every Monday' },
  { value: 'biweekly-friday', label: 'Every other Friday' },
  { value: 'monthly-first', label: '1st of every month' },
  { value: 'monthly-last', label: 'Last day of every month' },
];

const EASTERN_TIME_ZONE = 'America/New_York';
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const EASTERN_DATETIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

const getDatePartMap = (
  date: Date,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> => {
  return new Intl.DateTimeFormat('en-US', options)
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
};

const getEasternParts = (date: Date) => {
  const partMap = getDatePartMap(date, {
    timeZone: EASTERN_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    weekday: WEEKDAY_INDEX[partMap.weekday] ?? 0,
  };
};

const getTimezoneOffsetMs = (date: Date, timeZone: string): number => {
  const partMap = getDatePartMap(date, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const asUtc = Date.UTC(
    Number(partMap.year),
    Number(partMap.month) - 1,
    Number(partMap.day),
    Number(partMap.hour),
    Number(partMap.minute),
    Number(partMap.second),
  );

  return asUtc - date.getTime();
};

const buildDateAtTimezone = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMs = getTimezoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
};

const formatEasternDateTime = (isoDate: string) => {
  return EASTERN_DATETIME_FORMATTER.format(new Date(isoDate));
};

export const BulkContractorEmailDialog = ({ 
  open, onOpenChange, activeContractorCount, onEmailSent 
}: BulkContractorEmailDialogProps) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [recurringSchedule, setRecurringSchedule] = useState('none');
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [pendingEmails, setPendingEmails] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchPendingEmails = async () => {
    setLoadingPending(true);
    try {
      const { data, error } = await supabase
        .from('scheduled_contractor_emails' as any)
        .select('*')
        .eq('status', 'pending')
        .order('scheduled_for', { ascending: true });
      if (!error) setPendingEmails((data as any[]) || []);
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchPendingEmails();
    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const { data, error } = await supabase
          .from('contractor_email_templates')
          .select('id, name, subject, body_html, is_default, template_order')
          .order('template_order');
        if (error) return;
        const tpls = (data || []) as EmailTemplate[];
        setTemplates(tpls);
        const defaultTpl = tpls.find(t => t.is_default);
        if (defaultTpl) {
          setSelectedTemplateId(defaultTpl.id);
          setSubject(defaultTpl.subject);
          setBodyHtml(defaultTpl.body_html);
        }
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, [open]);

  const handleCancelScheduled = async (id: string) => {
    setCancellingId(id);
    try {
      const { error } = await supabase
        .from('scheduled_contractor_emails' as any)
        .update({ status: 'cancelled' } as any)
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Cancelled', description: 'Scheduled email has been cancelled.' });
      fetchPendingEmails();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  const handleReschedule = async (scheduledDate: Date) => {
    if (!rescheduleTargetId) return;
    setCancellingId(rescheduleTargetId);
    try {
      const { error } = await supabase
        .from('scheduled_contractor_emails' as any)
        .update({ scheduled_for: scheduledDate.toISOString() } as any)
        .eq('id', rescheduleTargetId);
      if (error) throw error;
      const dateStr = formatEasternDateTime(scheduledDate.toISOString());
      toast({ title: 'Rescheduled', description: `Email rescheduled to ${dateStr}` });
      fetchPendingEmails();
      setRescheduleDialogOpen(false);
      setRescheduleTargetId(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

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
    setSelectedTemplateId('');
    setRecurringSchedule('none');
    setRecurringEnabled(false);
  };

  const getCronExpression = (schedule: string): string | null => {
    switch (schedule) {
      case 'weekly-friday': return '0 9 * * 5'; // Every Friday at 9 AM UTC
      case 'weekly-monday': return '0 9 * * 1';
      case 'biweekly-friday': return '0 9 1-7,15-21 * 5'; // Approx biweekly
      case 'monthly-first': return '0 9 1 * *';
      case 'monthly-last': return '0 9 28-31 * *';
      default: return null;
    }
  };

  const getNextFridayElevenEastern = (): Date => {
    const now = new Date();
    const { year, month, day, weekday } = getEasternParts(now);

    let daysUntilFriday = (5 - weekday + 7) % 7;
    if (daysUntilFriday === 0) daysUntilFriday = 7;

    const easternCalendarDate = new Date(Date.UTC(year, month - 1, day));
    easternCalendarDate.setUTCDate(easternCalendarDate.getUTCDate() + daysUntilFriday);

    const targetYear = easternCalendarDate.getUTCFullYear();
    const targetMonth = easternCalendarDate.getUTCMonth() + 1;
    const targetDay = easternCalendarDate.getUTCDate();

    return buildDateAtTimezone(targetYear, targetMonth, targetDay, 11, 0, EASTERN_TIME_ZONE);
  };

  const handleScheduleFriday = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in subject and body', variant: 'destructive' });
      return;
    }

    setScheduling(true);
    try {
      const scheduledFor = getNextFridayElevenEastern();
      
      const { error } = await supabase.from('scheduled_contractor_emails' as any).insert({
        subject,
        body_html: bodyHtml,
        scheduled_for: scheduledFor.toISOString(),
        status: 'pending',
      } as any);

      if (error) throw error;

      const fridayStr = formatEasternDateTime(scheduledFor.toISOString());
      toast({
        title: 'Email Scheduled',
        description: `Bulk email scheduled for ${fridayStr}`,
      });

      resetForm();
      onOpenChange(false);
      onEmailSent?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to schedule email', variant: 'destructive' });
    } finally {
      setScheduling(false);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in subject and body', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      // Send immediately
      const { data, error } = await supabase.functions.invoke('bulk-contractor-email', {
        body: { subject, bodyHtml },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Set up recurring if enabled
      if (recurringEnabled && recurringSchedule !== 'none') {
        const cronExpr = getCronExpression(recurringSchedule);
        if (cronExpr) {
          // Store the recurring config
          const { error: configError } = await supabase
            .from('contractor_email_templates')
            .update({ 
              is_default: true,
            })
            .eq('id', selectedTemplateId);
          
          if (configError) {
            console.error('Failed to save recurring config:', configError);
          }
        }

        toast({
          title: 'Bulk Email Sent & Recurring Set',
          description: `${data?.message}. Recurring: ${RECURRING_OPTIONS.find(o => o.value === recurringSchedule)?.label}`,
        });
      } else {
        toast({
          title: 'Bulk Email Sent',
          description: data?.message || `Emails sent to active contractors`,
        });
      }

      if (data?.errors?.length) {
        toast({
          title: 'Some emails failed',
          description: `${data.errors.length} email(s) failed to send`,
          variant: 'destructive',
        });
      }

      resetForm();
      onOpenChange(false);
      onEmailSent?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send bulk email', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-teal-600" />
            Bulk Email to All Active Contractors
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient info */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span>
              This will send to <strong>{activeContractorCount}</strong> active contractor{activeContractorCount !== 1 ? 's' : ''}.
              Placeholders like <code className="bg-muted px-1 rounded text-xs">{'{{first_name}}'}</code> will be personalized for each.
            </span>
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

          {/* Subject */}
          <div>
            <Label htmlFor="bulk-email-subject">Subject</Label>
            <Input
              id="bulk-email-subject"
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
            />
            <textarea
              ref={textareaRef}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="w-full min-h-[200px] p-3 border rounded-md bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Write your email content here... HTML is supported."
            />
          </div>

          {/* Recurring schedule */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="recurring-toggle" className="cursor-pointer font-medium">
                  Recurring Schedule
                </Label>
              </div>
              <Switch
                id="recurring-toggle"
                checked={recurringEnabled}
                onCheckedChange={(checked) => {
                  setRecurringEnabled(checked);
                  if (checked && recurringSchedule === 'none') {
                    setRecurringSchedule('weekly-friday');
                  }
                }}
              />
            </div>
            {recurringEnabled && (
              <div>
                <Select value={recurringSchedule} onValueChange={setRecurringSchedule}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRING_OPTIONS.filter(o => o.value !== 'none').map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  The selected template will be automatically sent to all active contractors on the chosen schedule.
                </p>
              </div>
            )}
          </div>

          {/* Pending Scheduled Emails */}
          {pendingEmails.length > 0 && (
            <div className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="font-medium text-sm">Pending Scheduled Emails ({pendingEmails.length})</span>
              </div>
              <div className="space-y-2">
                {pendingEmails.map((email: any) => (
                  <div key={email.id} className="flex items-center justify-between bg-background rounded-md p-3 border text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{email.subject}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <CalendarIcon className="w-3 h-3" />
                        <span>{formatEasternDateTime(email.scheduled_for)}</span>
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">
                          Pending
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={cancellingId === email.id}
                        onClick={() => handleReschedule(email.id)}
                      >
                        <CalendarClock className="w-3 h-3 mr-1" />
                        Reschedule
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        disabled={cancellingId === email.id}
                        onClick={() => handleCancelScheduled(email.id)}
                      >
                        {cancellingId === email.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <><XCircle className="w-3 h-3 mr-1" />Cancel</>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={sending || scheduling}>
              Cancel
            </Button>
            <Button 
              variant="outline"
              onClick={handleScheduleFriday} 
              disabled={sending || scheduling || !subject.trim() || !bodyHtml.trim()}
            >
              {scheduling ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scheduling...</>
              ) : (
                <><CalendarClock className="w-4 h-4 mr-2" />Schedule for Friday 11 AM</>
              )}
            </Button>
            <Button onClick={handleSend} disabled={sending || scheduling || !subject.trim() || !bodyHtml.trim()}>
              {sending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending to {activeContractorCount}...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />Send Now ({activeContractorCount})</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
