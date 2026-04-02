import { useState, useRef, useEffect, useCallback } from 'react';
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
import { Send, Loader2, FileText, Mail, Users, RefreshCw, CalendarClock, Clock, XCircle, CalendarIcon, Building2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { RichTextToolbar } from '@/components/RichTextToolbar';
import { ScheduleDateTimeDialog } from '@/components/clients/ScheduleDateTimeDialog';

interface ClientOption {
  id: string;
  company_name: string;
  contractor_count: number;
}

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
  const [processingEmails, setProcessingEmails] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [filteredCount, setFilteredCount] = useState(activeContractorCount);
  const [loadingClients, setLoadingClients] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchPendingEmails = useCallback(async () => {
    setLoadingPending(true);
    try {
      const [pendingRes, processingRes] = await Promise.all([
        supabase
          .from('scheduled_contractor_emails' as any)
          .select('*')
          .eq('status', 'pending')
          .order('scheduled_for', { ascending: true }),
        supabase
          .from('scheduled_contractor_emails' as any)
          .select('*')
          .eq('status', 'processing')
          .order('scheduled_for', { ascending: true }),
      ]);
      if (!pendingRes.error) setPendingEmails((pendingRes.data as any[]) || []);
      if (!processingRes.error) setProcessingEmails((processingRes.data as any[]) || []);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const { data: assignments, error } = await supabase
        .from('contractor_assignments')
        .select('client_id, client:clients(id, company_name)')
        .eq('status', 'active');
      if (error || !assignments) return;

      const countMap = new Map<string, { company_name: string; count: number }>();
      for (const a of assignments) {
        const c = a.client as any;
        if (!c?.id) continue;
        const existing = countMap.get(c.id);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(c.id, { company_name: c.company_name, count: 1 });
        }
      }

      const options: ClientOption[] = Array.from(countMap.entries())
        .map(([id, v]) => ({ id, company_name: v.company_name, contractor_count: v.count }))
        .sort((a, b) => a.company_name.localeCompare(b.company_name));
      setClients(options);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchPendingEmails();
    fetchClients();
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
  }, [open, fetchPendingEmails, fetchClients]);

  // Auto-refresh progress for processing emails every 10 seconds
  useEffect(() => {
    if (!open || processingEmails.length === 0) return;
    const interval = setInterval(() => {
      fetchPendingEmails();
    }, 10000);
    return () => clearInterval(interval);
  }, [open, processingEmails.length, fetchPendingEmails]);

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

  const handleClientSelect = (value: string) => {
    setSelectedClientId(value);
    if (value === 'all') {
      setFilteredCount(activeContractorCount);
    } else {
      const client = clients.find(c => c.id === value);
      setFilteredCount(client?.contractor_count || 0);
    }
  };

  const resetForm = () => {
    setSubject('');
    setBodyHtml('');
    setSelectedTemplateId('');
    setRecurringSchedule('none');
    setRecurringEnabled(false);
    setSelectedClientId('all');
    setFilteredCount(activeContractorCount);
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

  const handleScheduleConfirm = async (scheduledDate: Date) => {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in subject and body', variant: 'destructive' });
      return;
    }

    setScheduling(true);
    try {
      const { error } = await supabase.from('scheduled_contractor_emails' as any).insert({
        subject,
        body_html: bodyHtml,
        scheduled_for: scheduledDate.toISOString(),
        status: 'pending',
        client_id: selectedClientId !== 'all' ? selectedClientId : null,
      } as any);

      if (error) throw error;

      const dateStr = formatEasternDateTime(scheduledDate.toISOString());
      toast({
        title: 'Email Scheduled',
        description: `Bulk email scheduled for ${dateStr}`,
      });

      setScheduleDialogOpen(false);
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
      // Create a tracking record marked as 'processing' immediately
      const { data: trackingRecord, error: trackingError } = await supabase
        .from('scheduled_contractor_emails' as any)
        .insert({
          subject,
          body_html: bodyHtml,
          scheduled_for: new Date().toISOString(),
          status: 'processing',
          client_id: selectedClientId !== 'all' ? selectedClientId : null,
        } as any)
        .select('id')
        .single();

      if (trackingError) throw trackingError;
      const scheduledEmailId = (trackingRecord as any)?.id;

      // Set up recurring if enabled
      if (recurringEnabled && recurringSchedule !== 'none' && selectedTemplateId) {
        // Check if a schedule already exists for this template+client combo
        const clientFilter = selectedClientId !== 'all' ? selectedClientId : null;
        const { data: existing } = await supabase
          .from('recurring_contractor_email_schedules' as any)
          .select('id')
          .eq('template_id', selectedTemplateId)
          .eq('frequency', recurringSchedule)
          .is('client_id', clientFilter as any)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase
            .from('recurring_contractor_email_schedules' as any)
            .insert({
              template_id: selectedTemplateId,
              client_id: clientFilter,
              frequency: recurringSchedule,
              is_enabled: true,
            } as any);
        }
      }

      // Fire-and-forget: invoke bulk send in background (don't await)
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      
      fetch(`https://${projectId}.supabase.co/functions/v1/bulk-contractor-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ subject, bodyHtml, scheduledEmailId, clientId: selectedClientId !== 'all' ? selectedClientId : undefined }),
      }).then(async (res) => {
        const rawText = await res.text();
        let data: any = {};
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = { rawText };
          }
        }

        if (!res.ok) {
          throw new Error((data as any)?.error || `Bulk email failed (${res.status})`);
        }

        const isCompleted = Boolean((data as any)?.completed);

        if (isCompleted) {
          await supabase
            .from('scheduled_contractor_emails' as any)
            .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null } as any)
            .eq('id', scheduledEmailId);
          onEmailSent?.();
        } else {
          await supabase
            .from('scheduled_contractor_emails' as any)
            .update({ status: 'processing', error_message: null } as any)
            .eq('id', scheduledEmailId);
        }

        fetchPendingEmails();

        if ((data as any)?.errors?.length) {
          toast({ title: 'Some emails failed', description: `${(data as any).errors.length} email(s) failed`, variant: 'destructive' });
        }
      }).catch((err) => {
        console.error('Bulk email background error:', err);
        supabase
          .from('scheduled_contractor_emails' as any)
          .update({ status: 'failed', error_message: err.message } as any)
          .eq('id', scheduledEmailId);
      });

      const companyLabel = selectedClientId !== 'all' 
        ? clients.find(c => c.id === selectedClientId)?.company_name || 'selected company'
        : 'all companies';
      toast({
        title: 'Sending Started',
        description: `Sending to ${filteredCount} contractors (${companyLabel}). Track progress below.`,
      });

      resetForm();
      // Refresh to show the progress bar
      setTimeout(() => fetchPendingEmails(), 1000);
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
            Bulk Email to Active Contractors
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Company selector */}
          <div>
            <Label>Send To</Label>
            <Select value={selectedClientId} onValueChange={handleClientSelect} disabled={loadingClients}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClients ? 'Loading...' : 'Select company'}>
                  <span className="flex items-center gap-2">
                    <Building2 className="w-3 h-3" />
                    {selectedClientId === 'all'
                      ? `All Companies (${activeContractorCount})`
                      : `${clients.find(c => c.id === selectedClientId)?.company_name || 'Company'} (${filteredCount})`}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Users className="w-3 h-3" />
                    All Companies ({activeContractorCount} contractors)
                  </span>
                </SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3 h-3" />
                      {c.company_name} ({c.contractor_count})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recipient info */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span>
              This will send to <strong>{filteredCount}</strong> active contractor{filteredCount !== 1 ? 's' : ''}.
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

          {/* Processing Emails with Progress Bar */}
          {processingEmails.length > 0 && (
            <div className="border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="font-medium text-sm">Sending in Progress</span>
              </div>
              <div className="space-y-3">
                {processingEmails.map((email: any) => {
                  const total = email.total_items || 0;
                  const processed = email.processed_items || 0;
                  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
                  return (
                    <div key={email.id} className="bg-background rounded-md p-3 border text-sm space-y-2">
                      <p className="font-medium truncate">{email.subject}</p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{processed} of {total} contractors sent</span>
                          <span>{percentage}%</span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                        onClick={() => {
                          setRescheduleTargetId(email.id);
                          setRescheduleDialogOpen(true);
                        }}
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
              onClick={() => setScheduleDialogOpen(true)} 
              disabled={sending || scheduling || !subject.trim() || !bodyHtml.trim()}
            >
              <CalendarClock className="w-4 h-4 mr-2" />Schedule
            </Button>
            <Button onClick={handleSend} disabled={sending || scheduling || !subject.trim() || !bodyHtml.trim()}>
              {sending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending to {filteredCount}...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />Send Now ({filteredCount})</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Schedule date/time picker */}
      <ScheduleDateTimeDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        onConfirm={handleScheduleConfirm}
        title="Schedule Bulk Email"
        defaultTime="11:00 AM"
        loading={scheduling}
      />

      {/* Reschedule date/time picker */}
      <ScheduleDateTimeDialog
        open={rescheduleDialogOpen}
        onOpenChange={(o) => {
          setRescheduleDialogOpen(o);
          if (!o) setRescheduleTargetId(null);
        }}
        onConfirm={handleReschedule}
        title="Reschedule Email"
        defaultTime="11:00 AM"
        loading={!!cancellingId}
      />
    </Dialog>
  );
};
