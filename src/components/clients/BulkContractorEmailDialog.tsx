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
import { Send, Loader2, FileText, Mail, Users, RefreshCw, CalendarClock, Clock, XCircle, CalendarIcon, Building2, Pause, Play, Globe } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { RichTextToolbar } from '@/components/RichTextToolbar';
import { ScheduleDateTimeDialog } from '@/components/clients/ScheduleDateTimeDialog';

interface ClientOption {
  id: string;
  company_name: string;
  contractor_count: number;
}

interface CountryOption {
  country: string;
  contractor_count: number;
}

interface AssignmentRow {
  client_id: string | null;
  company_name: string | null;
  country: string | null;
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
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [filteredCount, setFilteredCount] = useState(activeContractorCount);
  const [loadingClients, setLoadingClients] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchPendingEmails = useCallback(async () => {
    setLoadingPending(true);
    try {
      const [pendingRes, processingRes, pausedRes] = await Promise.all([
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
        supabase
          .from('scheduled_contractor_emails' as any)
          .select('*')
          .eq('status', 'paused')
          .order('scheduled_for', { ascending: true }),
      ]);
      if (!pendingRes.error) setPendingEmails((pendingRes.data as any[]) || []);
      // Combine processing and paused into processingEmails for display
      const processing = (processingRes.data as any[]) || [];
      const paused = (pausedRes.data as any[]) || [];
      setProcessingEmails([...processing, ...paused]);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('contractor_assignments')
        .select('client_id, country, client:clients(id, company_name)')
        .eq('status', 'active');
      if (error || !data) return;

      const rows: AssignmentRow[] = data.map((a: any) => ({
        client_id: a.client?.id ?? null,
        company_name: a.client?.company_name ?? null,
        country: (a.country ?? '').trim() || null,
      }));
      setAssignments(rows);

      const clientMap = new Map<string, { company_name: string; count: number }>();
      const countryMap = new Map<string, number>();
      for (const r of rows) {
        if (r.client_id && r.company_name) {
          const e = clientMap.get(r.client_id);
          if (e) e.count++;
          else clientMap.set(r.client_id, { company_name: r.company_name, count: 1 });
        }
        if (r.country) {
          countryMap.set(r.country, (countryMap.get(r.country) || 0) + 1);
        }
      }

      setClients(
        Array.from(clientMap.entries())
          .map(([id, v]) => ({ id, company_name: v.company_name, contractor_count: v.count }))
          .sort((a, b) => a.company_name.localeCompare(b.company_name))
      );
      setCountries(
        Array.from(countryMap.entries())
          .map(([country, contractor_count]) => ({ country, contractor_count }))
          .sort((a, b) => b.contractor_count - a.contractor_count || a.country.localeCompare(b.country))
      );
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

  const handlePauseBatch = async (id: string) => {
    setCancellingId(id);
    try {
      const { error } = await supabase
        .from('scheduled_contractor_emails' as any)
        .update({ status: 'paused' } as any)
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Paused', description: 'Email batch has been paused. You can resume anytime.' });
      fetchPendingEmails();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  const handleResumeBatch = async (id: string) => {
    setCancellingId(id);
    try {
      // Set status back to processing
      const { error } = await supabase
        .from('scheduled_contractor_emails' as any)
        .update({ status: 'processing' } as any)
        .eq('id', id);
      if (error) throw error;

      // Re-trigger the edge function to continue from where it left off
      const { data: emailData } = await supabase
        .from('scheduled_contractor_emails' as any)
        .select('subject, body_html, client_id, country')
        .eq('id', id)
        .single();

      if (emailData) {
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-contractor-email`;
        fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            subject: (emailData as any).subject,
            bodyHtml: (emailData as any).body_html,
            scheduledEmailId: id,
            maxBatchSize: 5,
            clientId: (emailData as any).client_id || undefined,
          }),
        }).catch(console.error);
      }

      toast({ title: 'Resumed', description: 'Email batch is resuming.' });
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

  // Recompute filtered count whenever filters or assignments change
  useEffect(() => {
    if (assignments.length === 0) {
      setFilteredCount(selectedClientId === 'all' && selectedCountry === 'all' ? activeContractorCount : 0);
      return;
    }
    const count = assignments.filter(r =>
      (selectedClientId === 'all' || r.client_id === selectedClientId) &&
      (selectedCountry === 'all' || r.country === selectedCountry)
    ).length;
    setFilteredCount(count);
  }, [assignments, selectedClientId, selectedCountry, activeContractorCount]);

  const resetForm = () => {
    setSubject('');
    setBodyHtml('');
    setSelectedTemplateId('');
    setRecurringSchedule('none');
    setRecurringEnabled(false);
    setSelectedClientId('all');
    setSelectedCountry('all');
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
        country: selectedCountry !== 'all' ? selectedCountry : null,
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
          country: selectedCountry !== 'all' ? selectedCountry : null,
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
        body: JSON.stringify({ subject, bodyHtml, scheduledEmailId, clientId: selectedClientId !== 'all' ? selectedClientId : undefined, country: selectedCountry !== 'all' ? selectedCountry : undefined }),
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
            <Select value={selectedClientId} onValueChange={setSelectedClientId} disabled={loadingClients}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClients ? 'Loading...' : 'Select company'}>
                  <span className="flex items-center gap-2">
                    <Building2 className="w-3 h-3" />
                    {selectedClientId === 'all'
                      ? `All Companies`
                      : `${clients.find(c => c.id === selectedClientId)?.company_name || 'Company'}`}
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

          {/* Country selector */}
          <div>
            <Label>Country</Label>
            <Select value={selectedCountry} onValueChange={setSelectedCountry} disabled={loadingClients}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClients ? 'Loading...' : 'Select country'}>
                  <span className="flex items-center gap-2">
                    <Globe className="w-3 h-3" />
                    {selectedCountry === 'all' ? 'All Countries' : selectedCountry}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Globe className="w-3 h-3" />
                    All Countries
                  </span>
                </SelectItem>
                {countries.map(c => (
                  <SelectItem key={c.country} value={c.country}>
                    <span className="flex items-center gap-2">
                      <Globe className="w-3 h-3" />
                      {c.country} ({c.contractor_count})
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

          {/* Processing / Paused / Stuck Emails with Progress Bar */}
          {processingEmails.length > 0 && (
            <div className="border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                {processingEmails.some((e: any) => e.status === 'processing') ? (
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                ) : (
                  <Pause className="w-4 h-4 text-amber-600" />
                )}
                <span className="font-medium text-sm">
                  {processingEmails.every((e: any) => e.status === 'paused') ? 'Paused' : 'Sending in Progress'}
                </span>
              </div>
              <div className="space-y-3">
                {processingEmails.map((email: any) => {
                  const total = email.total_items || 0;
                  const processed = email.processed_items || 0;
                  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
                  const isPaused = email.status === 'paused';
                  
                  // Detect stuck: no real send activity for 3+ minutes while processing
                  const lastActivity = email.last_activity_at || email.created_at;
                  const minutesSinceActivity = lastActivity
                    ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 60000)
                    : 0;
                  const isStuck =
                    email.status === 'processing' &&
                    !!email.last_activity_at &&
                    minutesSinceActivity >= 3 &&
                    processed < total;

                  return (
                    <div key={email.id} className="bg-background rounded-md p-3 border text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium truncate flex-1">{email.subject}</p>
                        <div className="flex items-center gap-1 ml-2">
                          {isPaused && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">
                              Paused
                            </Badge>
                          )}
                          {isStuck && (
                            <Badge variant="outline" className="text-red-600 border-red-300 text-[10px] px-1.5 py-0">
                              Stuck — no activity for {minutesSinceActivity}m
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{processed} of {total} contractors sent</span>
                          <span>{percentage}%</span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                      <div className="flex items-center gap-1 justify-end">
                        {(isPaused || isStuck) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-green-600 hover:text-green-700"
                            disabled={cancellingId === email.id}
                            onClick={() => handleResumeBatch(email.id)}
                          >
                            {cancellingId === email.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                            {isStuck ? 'Resume (Continue where left off)' : 'Resume'}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-amber-600 hover:text-amber-700"
                            disabled={cancellingId === email.id}
                            onClick={() => handlePauseBatch(email.id)}
                          >
                            {cancellingId === email.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Pause className="w-3 h-3 mr-1" />}
                            Pause
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={cancellingId === email.id}
                          onClick={() => handleCancelScheduled(email.id)}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Stop
                        </Button>
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
