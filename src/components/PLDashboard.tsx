import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Search, Check, X, ArrowUpDown, ArrowUp, ArrowDown, Eye, Mail, Settings2, ChevronLeft, ChevronRight, KeyRound, Download, Users, FileText, Clock, Wallet, DollarSign } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { INTERNAL_CLIENT_ID } from '@/lib/internalCompany';
import { AdminLeaveApplications } from '@/components/AdminLeaveApplications';
import { CollapsibleSection } from '@/components/pl/CollapsibleSection';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PLReport } from '@/components/pl/PLReport';
import { parseDateOnly } from '@/lib/dateOnly';
import { formatDate, formatDateShort, formatDateTime, formatDateWithWeekday } from "@/lib/dateFormat";

interface TimesheetRow {
  id: string;
  contractor_assignment_id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  incentive_amount: number;
  notes: string | null;
  status: string;
  outsta_status: string;
  client_approval_status: string;
  client_flag_reason: string | null;
  client_reviewed_at: string | null;
  submitted_at: string;
  daily_hours: Record<string, { hours: number; reason?: string }> | null;
  contractor: {
    job_title: string | null;
    start_date: string | null;
    hours_per_week: number | null;
    hourly_rate: number | null;
    client_id: string | null;
    applicant: { full_name: string; email: string } | null;
    client: { company_name: string } | null;
  } | null;
}

interface ContractorRow {
  id: string;
  applicant_id: string | null;
  client_id: string | null;
  job_title: string | null;
  status: string;
  hourly_rate: number | null;
  hours_per_week: number | null;
  start_date: string | null;
  applicant: { full_name: string; email: string } | null;
  client: { company_name: string } | null;
  hasPortal: boolean;
  mustChange: boolean | null;
  latestTimesheet: {
    id: string;
    status: string;
    week_ending_date: string;
    total_hours: number;
    overtime_hours: number;
    incentive_amount: number;
    submitted_at: string;
    depositHours: number;
    isDeposit: boolean;
    weekIndex: number | null;
    client_approval_status: string;
    client_flag_reason: string | null;
    client_reviewed_at: string | null;
  } | null;
}

const ProfileField = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-medium">{value && String(value).trim() ? value : '—'}</div>
  </div>
);

const ClientApprovalBadge = ({
  status,
  reason,
  reviewedAt,
}: {
  status: string;
  reason?: string | null;
  reviewedAt?: string | null;
}) => {
  if (status === 'approved') {
    return <Badge variant="outline" className="border-emerald-500 text-emerald-600 w-fit">Approved</Badge>;
  }
  if (status === 'flagged') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center rounded-full border border-amber-500 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            Flagged
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-amber-700">Flag reason</div>
            <div className="text-sm whitespace-pre-wrap text-foreground">
              {reason && reason.trim() ? reason : <span className="text-muted-foreground italic">No reason provided.</span>}
            </div>
            {reviewedAt && (
              <div className="text-xs text-muted-foreground pt-1 border-t">
                Flagged {formatDateTime(reviewedAt)}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  return <Badge variant="outline" className="text-muted-foreground w-fit">Pending</Badge>;
};

const renderNotesWithLinks = (notes: string | null | undefined) => {
  if (!notes) return '—';
  const parts = notes.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary underline hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

// Cache of DB verification rows (populated once per session by a single batched query).
// Never triggers Firecrawl on its own — only reads from payoneer_verifications.
type PayoneerRow = { amount: number | null; currency: string | null; error?: string };
const payoneerCache = new Map<string, PayoneerRow>();
const payoneerCacheListeners = new Set<() => void>();
let payoneerCacheLoaded = false;
let payoneerCacheLoadingPromise: Promise<void> | null = null;

const extractPayoneerUrl = (notes: string | null | undefined): string | null => {
  if (!notes) return null;
  const m = notes.match(/https?:\/\/(?:link|app)\.payoneer\.com\/[^\s]+/i);
  return m ? m[0] : null;
};

async function loadPayoneerCache() {
  if (payoneerCacheLoaded) return;
  if (payoneerCacheLoadingPromise) return payoneerCacheLoadingPromise;
  payoneerCacheLoadingPromise = (async () => {
    const { data } = await supabase
      .from('payoneer_verifications')
      .select('url, amount, currency, error');
    (data || []).forEach((r: any) => {
      payoneerCache.set(r.url, {
        amount: r.amount !== null ? Number(r.amount) : null,
        currency: r.currency,
        error: r.error ?? undefined,
      });
    });
    payoneerCacheLoaded = true;
    payoneerCacheListeners.forEach((cb) => cb());
  })();
  return payoneerCacheLoadingPromise;
}

const PayoneerMatchBadge = ({ notes, invoice: expected, timesheetId }: { notes: string | null | undefined; invoice: number | null; timesheetId?: string }) => {
  const url = extractPayoneerUrl(notes);
  const [state, setState] = useState<PayoneerRow | null>(url ? payoneerCache.get(url) ?? null : null);
  const [verifying, setVerifying] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    if (!url) return;
    if (payoneerCache.has(url)) {
      setState(payoneerCache.get(url)!);
      return;
    }
    loadPayoneerCache().then(() => {
      setState(payoneerCache.get(url) ?? null);
    });
    const listener = () => force((n) => n + 1);
    payoneerCacheListeners.add(listener);
    return () => { payoneerCacheListeners.delete(listener); };
  }, [url]);

  const runVerify = async () => {
    if (!url || verifying) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-payoneer-invoice', { body: { url, force: true, timesheetId } });
      const result: PayoneerRow = error
        ? { amount: null, currency: null, error: error.message }
        : { amount: data?.amount ?? null, currency: data?.currency ?? null, error: data?.error };
      payoneerCache.set(url, result);
      setState(result);
    } finally {
      setVerifying(false);
    }
  };


  if (!url) return null;

  // No verification on record — show a manual verify button (no auto Firecrawl call on refresh).
  if (!state) {
    return (
      <button
        type="button"
        onClick={runVerify}
        disabled={verifying}
        className="text-[10px] px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:bg-muted/40 disabled:opacity-60"
        title="Click to verify this Payoneer link (uses 1 Firecrawl credit)"
      >
        {verifying ? 'Verifying…' : 'Verify link'}
      </button>
    );
  }

  if (state.error || state.amount == null) {
    return (
      <button
        type="button"
        onClick={runVerify}
        disabled={verifying}
        className="text-[10px] px-2 py-0.5 rounded border border-muted-foreground/40 text-muted-foreground hover:bg-muted/40 disabled:opacity-60"
        title={state.error || 'Amount not found — click to retry'}
      >
        {verifying ? 'Verifying…' : 'Invoice: unknown · retry'}
      </button>
    );
  }
  if (expected == null) {
    return (
      <Badge variant="outline" className="text-[10px]">
        Invoice: ${state.amount.toFixed(2)} {state.currency}
      </Badge>
    );
  }
  const diff = Math.abs(state.amount - expected);
  const match = diff < 0.01;
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${match ? 'border-emerald-500 text-emerald-600' : 'border-red-500 text-red-600'}`}
      title={`Invoice $${expected.toFixed(2)} · Payoneer $${state.amount.toFixed(2)} ${state.currency}`}
    >
      {match ? `✓ Match $${state.amount.toFixed(2)}` : `✗ Mismatch $${expected.toFixed(2)} vs $${state.amount.toFixed(2)}`}
    </Badge>
  );
};




export const PLDashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profileContractor, setProfileContractor] = useState<any | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileInvoices, setProfileInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [contractors, setContractors] = useState<ContractorRow[]>([]);
  const [search, setSearch] = useState('');
  const mondayOf = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const dow = x.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    x.setDate(x.getDate() + diff);
    return x;
  };
  const getCurrentWeekMonday = () => mondayOf(new Date());
  const getLastCompletedMonday = () => {
    const m = getCurrentWeekMonday();
    m.setDate(m.getDate() - 7);
    return m;
  };
  const [weekMonday, setWeekMonday] = useState<Date | null>(() => getCurrentWeekMonday());
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hoursFilter, setHoursFilter] = useState<'all' | 'mismatch' | 'over' | 'under' | 'bonus'>('all');
  const [clientPortalClientIds, setClientPortalClientIds] = useState<Set<string>>(new Set());
  const [updatingOutstaId, setUpdatingOutstaId] = useState<string | null>(null);
  const [contractorSearch, setContractorSearch] = useState('');
  const [contractorSort, setContractorSort] = useState<{ key: 'name' | 'company' | 'status' | 'rate' | 'hpw' | 'latest' | 'workHours' | 'ot' | 'bonus' | 'deposit' | 'approval' | 'portal'; dir: 'asc' | 'desc' }>({ key: 'company', dir: 'asc' });
  const [tsSort, setTsSort] = useState<{ key: 'name' | 'company' | 'week' | 'hours' | 'ot' | 'incentives' | 'status' | 'submitted'; dir: 'asc' | 'desc' }>({ key: 'submitted', dir: 'desc' });
  const [stats, setStats] = useState({ portalUsers: 0, totalEligibleContractors: 0 });
  const [viewTimesheet, setViewTimesheet] = useState<TimesheetRow | null>(null);
  const [leaveCount, setLeaveCount] = useState(0);
  const PL_SUBTAB_KEY = 'pl_active_subtab';
  const [activeSubtab, setActiveSubtab] = useState<string>(() => {
    try { return localStorage.getItem(PL_SUBTAB_KEY) || 'submissions'; } catch { return 'submissions'; }
  });
  useEffect(() => {
    try { localStorage.setItem(PL_SUBTAB_KEY, activeSubtab); } catch {}
  }, [activeSubtab]);

  // Section reordering (persisted per browser)
  const SECTION_DEFS = [
    { id: 'contractors', label: 'Contractors' },
    { id: 'leave', label: 'Leave Applications' },
    { id: 'internalContractors', label: 'Internal Team — OutSta' },
    { id: 'timesheets', label: 'Timesheet Submissions' },
    { id: 'internalTimesheets', label: 'Internal Team Submissions' },
  ] as const;
  const PL_ORDER_KEY = 'pl-dashboard-section-order';
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(PL_ORDER_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          const ids = SECTION_DEFS.map((s) => s.id);
          const filtered = arr.filter((x: any) => ids.includes(x));
          const missing = ids.filter((x) => !filtered.includes(x));
          return [...filtered, ...missing];
        }
      }
    } catch {}
    return SECTION_DEFS.map((s) => s.id);
  });
  const [reorderOpen, setReorderOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(PL_ORDER_KEY, JSON.stringify(sectionOrder)); } catch {}
  }, [sectionOrder]);
  const moveSection = (idx: number, dir: -1 | 1) => {
    setSectionOrder((prev) => {
      const arr = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });
  };
  const resetSectionOrder = () => setSectionOrder(SECTION_DEFS.map((s) => s.id));

  const fetchData = async () => {
    setLoading(true);

    const [{ data: timesheets }, { data: assignments }, { data: portalUsers }, { data: clientPortals }] = await Promise.all([
      supabase
        .from('contractor_timesheets')
        .select(`
          id, contractor_assignment_id, week_ending_date, total_hours, overtime_hours, incentive_amount, notes, status, outsta_status, submitted_at, daily_hours, client_approval_status, client_flag_reason, client_reviewed_at,
          contractor:contractor_assignments(
            job_title,
            start_date,
            hours_per_week,
            hourly_rate,
            client_id,
            applicant:applicants_prescreen(full_name, email),
            client:clients(company_name)
          )
        `)
        .order('week_ending_date', { ascending: false })
        .order('submitted_at', { ascending: false }),
      supabase
        .from('contractor_assignments')
        .select(`
          id, applicant_id, client_id, job_title, status, hourly_rate, hours_per_week, start_date,
          applicant:applicants_prescreen(full_name, email),
          client:clients(company_name)
        `)
        .in('status', ['active', 'rendering'])
        .order('status', { ascending: true }),
      supabase
        .from('contractor_portal_users')
        .select('contractor_assignment_id, must_change_password'),
      supabase
        .from('client_portal_users')
        .select('client_id'),
    ]);

    setClientPortalClientIds(new Set(((clientPortals as any[]) || []).map((c) => c.client_id).filter(Boolean)));

    const portalMap = new Map<string, boolean>(
      (portalUsers || []).map((p: any) => [p.contractor_assignment_id, p.must_change_password])
    );

    // Build map of latest timesheet per contractor (timesheets already ordered by week desc, submitted desc)
    const latestTsMap = new Map<string, any>();
    ((timesheets as any[]) || []).forEach((t) => {
      if (!latestTsMap.has(t.contractor_assignment_id)) {
        latestTsMap.set(t.contractor_assignment_id, t);
      }
    });

    const computeDepositFor = (startStr: string | null, hpw: number, weekEndingDate: string, totalHours: number) => {
      if (!startStr || !hpw) return { depositHours: 0, isDeposit: false, weekIndex: null as number | null };
      const start = new Date(startStr);
      const weekEnd = new Date(weekEndingDate);
      const diffDays = Math.floor((weekEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { depositHours: 0, isDeposit: false, weekIndex: null };
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex > 1) return { depositHours: 0, isDeposit: false, weekIndex };
      return { depositHours: Math.min(Number(totalHours), hpw), isDeposit: true, weekIndex };
    };

    const enriched: ContractorRow[] = ((assignments as any[]) || []).map((c) => {
      const ts = latestTsMap.get(c.id);
      let latestTimesheet: ContractorRow['latestTimesheet'] = null;
      if (ts) {
        const dep = computeDepositFor(c.start_date, Number(c.hours_per_week || 0), ts.week_ending_date, Number(ts.total_hours));
        latestTimesheet = {
          id: ts.id,
          status: ts.status,
          week_ending_date: ts.week_ending_date,
          total_hours: Number(ts.total_hours),
          overtime_hours: Number(ts.overtime_hours || 0),
          incentive_amount: Number(ts.incentive_amount || 0),
          submitted_at: ts.submitted_at,
          depositHours: dep.depositHours,
          isDeposit: dep.isDeposit,
          weekIndex: dep.weekIndex,
          client_approval_status: ts.client_approval_status || 'pending',
          client_flag_reason: ts.client_flag_reason ?? null,
          client_reviewed_at: ts.client_reviewed_at ?? null,
        };
      }
      return {
        id: c.id,
        applicant_id: c.applicant_id,
        client_id: c.client_id,
        job_title: c.job_title,
        status: c.status,
        hourly_rate: c.hourly_rate,
        hours_per_week: c.hours_per_week,
        start_date: c.start_date,
        applicant: c.applicant,
        client: c.client,
        hasPortal: portalMap.has(c.id),
        mustChange: portalMap.get(c.id) ?? null,
        latestTimesheet,
      };
    });

    // Sort: by full name
    enriched.sort((a, b) => (a.applicant?.full_name || '').localeCompare(b.applicant?.full_name || ''));

    setRows((timesheets as any) || []);
    setContractors(enriched);
    const externalEnriched = enriched.filter((c) => c.client_id !== INTERNAL_CLIENT_ID);
    setStats({
      portalUsers: externalEnriched.filter((c) => c.hasPortal).length,
      totalEligibleContractors: externalEnriched.length,
    });
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLeaveCount = async () => {
      // Only surface NEW (pending, not yet reviewed) leave entries
      const { count } = await supabase
        .from('contractor_leave_applications' as any)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!cancelled) setLeaveCount(count || 0);
    };
    loadLeaveCount();
    const channel = supabase
      .channel('pl_leave_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contractor_leave_applications' }, loadLeaveCount)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  const callProvision = async (payload?: Record<string, unknown>) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(`Unable to read admin session: ${sessionError.message}`);
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active admin session. Please sign in as admin and try again.');

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-contractor-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload ?? {}),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const detail = data?.error || data?.message || (typeof data === 'string' ? data : `HTTP ${res.status}`);
      throw new Error(detail);
    }
    return data;
  };

  const handleProvision = async () => {
    // Strict filter: only contractors who have a portal account AND have not yet activated
    // (still on temporary password / must_change_password = true), and are still active/rendering.
    const eligible = contractors.filter((c) => {
      if (!c.applicant?.email) return false;
      if (!['active', 'rendering'].includes((c.status || '').toLowerCase())) return false;
      if (!c.hasPortal) return false; // no portal account yet
      if (c.mustChange !== true) return false; // already activated
      return true;
    });

    if (eligible.length === 0) {
      toast({ title: 'Nothing to send', description: 'No unactivated portal accounts found.' });
      return;
    }
    if (!confirm(
      `Send Activation Emails\n\n` +
      `This will send a portal activation email to all contractors who have an account but have not yet logged in or changed their password.\n\n` +
      `Only unactivated accounts will receive an email — contractors who have already set up their account will not be contacted again.\n\n` +
      `${eligible.length} contractor account(s) will receive an activation email.`
    )) return;

    setProvisioning(true);
    let sent = 0, failed = 0;
    const portalUrl = `https://outstahub.com/portal/login`;
    try {
      for (const c of eligible) {
        try {
          await callProvision({ contractorAssignmentId: c.id });
          const firstName = (c.applicant!.full_name || '').split(' ')[0] || 'there';
          const subject = 'Your OutSta Portal Account is Ready';
          const bodyHtml = `
            <p>Hi ${firstName},</p>
            <p>Your OutSta contractor portal account has been created. You can now log in to submit your weekly hours and view your invoices.</p>
            <p><strong>Portal URL:</strong> <a href="${portalUrl}">${portalUrl}</a><br/>
            <strong>Email:</strong> ${c.applicant!.email}<br/>
            <strong>Temporary password:</strong> OutSta2026!</p>
            <p>For security, you'll be asked to change your password the first time you log in.</p>
            <p>If you have any questions, just reply to this email.</p>
            <p>Thanks,<br/>The OutSta Team</p>
          `;
          const { error: emailError } = await supabase.functions.invoke('send-contractor-email', {
            body: {
              contractorAssignmentId: c.id,
              subject,
              bodyHtml,
              recipientEmail: c.applicant!.email,
              recipientName: c.applicant!.full_name || c.applicant!.email,
            },
          });
          if (emailError) { failed += 1; console.error(`Email failed for ${c.applicant!.email}:`, emailError); }
          else sent += 1;
        } catch (err: any) {
          failed += 1;
          console.error(`Provision failed for ${c.applicant?.email}:`, err);
        }
      }


      toast({
        title: 'Provisioning complete',
        description: `Sent ${sent} activation email(s).${failed ? ` ${failed} failed — see console.` : ''}`,
      });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Provisioning failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  const handleProvisionOne = async (c: ContractorRow) => {
    if (!c.applicant?.email) {
      toast({ title: 'No email', description: 'This contractor has no email on file.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Create a portal account for ${c.applicant.full_name}?\n\nEmail: ${c.applicant.email}\nDefault password: OutSta2026!\n\nAn email with their portal credentials will be sent.`)) return;
    setProvisioningId(c.id);
    try {
      const data = await callProvision({ contractorAssignmentId: c.id });
      if (data.errors?.length) {
        toast({ title: 'Failed', description: data.errors[0], variant: 'destructive' });
      } else if (data.total === 0) {
        toast({ title: 'Nothing to do', description: 'Contractor not found or not eligible (must be active/rendering with an email).', variant: 'destructive' });
      } else if (data.created === 0 && data.linked === 0) {
        toast({ title: 'Already provisioned', description: `${c.applicant.email} already has a portal account.` });
      } else {
        // Send credentials email
        const portalUrl = `https://outstahub.com/portal/login`;
        const firstName = (c.applicant.full_name || '').split(' ')[0] || 'there';
        const subject = 'Your OutSta Portal Account is Ready';
        const bodyHtml = `
          <p>Hi ${firstName},</p>
          <p>Your OutSta contractor portal account has been created. You can now log in to submit your weekly hours and view your invoices.</p>
          <p><strong>Portal URL:</strong> <a href="${portalUrl}">${portalUrl}</a><br/>
          <strong>Email:</strong> ${c.applicant.email}<br/>
          <strong>Temporary password:</strong> OutSta2026!</p>
          <p>For security, you'll be asked to change your password the first time you log in.</p>
          <p>If you have any questions, just reply to this email.</p>
          <p>Thanks,<br/>The OutSta Team</p>
        `;

        const { error: emailError } = await supabase.functions.invoke('send-contractor-email', {
          body: {
            contractorAssignmentId: c.id,
            subject,
            bodyHtml,
            recipientEmail: c.applicant.email,
            recipientName: c.applicant.full_name || c.applicant.email,
          },
        });

        if (emailError) {
          toast({
            title: 'Account created, email failed',
            description: `Portal account created for ${c.applicant.email}, but the credentials email could not be sent. Please share the password manually.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Account ready & email sent',
            description: `${data.created ? 'Created new account' : 'Linked existing user'} for ${c.applicant.email} and sent portal credentials.`,
          });
        }
      }
      fetchData();
    } catch (e: any) {
      toast({ title: 'Provisioning failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setProvisioningId(null);
    }
  };

  const handleResendCredentials = async (c: ContractorRow) => {
    if (!c.applicant?.email) {
      toast({ title: 'No email', description: 'This contractor has no email on file.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Resend portal credentials to ${c.applicant.full_name}?\n\nEmail: ${c.applicant.email}\nPassword: OutSta2026! (only valid if they haven't changed it yet)`)) return;
    setResendingId(c.id);
    try {
      const portalUrl = `https://outstahub.com/portal/login`;
      const firstName = (c.applicant.full_name || '').split(' ')[0] || 'there';

      // Reset their auth password to the default so the credentials in the email actually work.
      const { error: resetErr } = await supabase.functions.invoke('admin-reset-password', {
        body: { email: c.applicant.email, password: 'OutSta2026!' },
      });
      if (resetErr) throw resetErr;

      // Ensure they're flagged to change password on next login.
      await supabase
        .from('contractor_portal_users')
        .update({ must_change_password: true })
        .eq('contractor_assignment_id', c.id);

      const subject = 'Your OutSta Portal Account — Login Details';
      const bodyHtml = `
        <p>Hi ${firstName},</p>
        <p>Here are your OutSta contractor portal login details. You can log in to submit your weekly hours and view your invoices.</p>
        <p><strong>Portal URL:</strong> <a href="${portalUrl}">${portalUrl}</a><br/>
        <strong>Email:</strong> ${c.applicant.email}<br/>
        <strong>Temporary password:</strong> OutSta2026!</p>
        <p>For security, you'll be asked to change your password the first time you log in.</p>
        <p>If you have any questions, just reply to this email.</p>
        <p>Thanks,<br/>The OutSta Team</p>
      `;
      const { error } = await supabase.functions.invoke('send-contractor-email', {
        body: {
          contractorAssignmentId: c.id,
          subject,
          bodyHtml,
          recipientEmail: c.applicant.email,
          recipientName: c.applicant.full_name || c.applicant.email,
        },
      });
      if (error) throw error;
      toast({ title: 'Credentials resent', description: `Email sent to ${c.applicant.email}.` });
    } catch (e: any) {
      toast({ title: 'Failed to resend', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  const handleResetPassword = async (c: ContractorRow) => {
    if (!c.applicant?.email) {
      toast({ title: 'No email', description: 'This contractor has no email on file.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Reset portal password for ${c.applicant.full_name}?\n\nTheir password will be reset to the default (OutSta2026!) and they'll be emailed the new login details. They'll be required to change it on next login.`)) return;
    setResettingId(c.id);
    try {
      const portalUrl = `https://outstahub.com/portal/login`;
      const firstName = (c.applicant.full_name || '').split(' ')[0] || 'there';
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(`Unable to read admin session: ${sessionError.message}`);
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active admin session. Please sign in as admin and try again.');

      const resetResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: c.applicant.email, password: 'OutSta2026!', contractorAssignmentId: c.id }),
      });
      const resetText = await resetResponse.text();
      let resetData: any = null;
      try {
        resetData = resetText ? JSON.parse(resetText) : null;
      } catch {
        resetData = null;
      }
      if (!resetResponse.ok || resetData?.error) {
        throw new Error(resetData?.error || resetData?.message || resetText || `Password reset failed with status ${resetResponse.status}`);
      }

      await supabase
        .from('contractor_portal_users')
        .update({ must_change_password: true })
        .eq('contractor_assignment_id', c.id);

      const subject = 'Your OutSta Portal Password Has Been Reset';
      const bodyHtml = `
        <p>Hi ${firstName},</p>
        <p>Your OutSta contractor portal password has been reset by an administrator. Use the temporary password below to log in, and you'll be asked to set a new one.</p>
        <p><strong>Portal URL:</strong> <a href="${portalUrl}">${portalUrl}</a><br/>
        <strong>Email:</strong> ${c.applicant.email}<br/>
        <strong>Temporary password:</strong> OutSta2026!</p>
        <p>If you didn't request this, please reply to this email right away.</p>
        <p>Thanks,<br/>The OutSta Team</p>
      `;
      await supabase.functions.invoke('send-contractor-email', {
        body: {
          contractorAssignmentId: c.id,
          subject,
          bodyHtml,
          recipientEmail: c.applicant.email,
          recipientName: c.applicant.full_name || c.applicant.email,
        },
      });
      toast({ title: 'Password reset', description: `New credentials emailed to ${c.applicant.email}.` });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setResettingId(null);
    }
  };

  const handleDecision = async (r: TimesheetRow, decision: 'approved' | 'rejected') => {
    const overDays = r.daily_hours
      ? Object.entries(r.daily_hours).filter(([, v]) => Number(v?.hours) > 10).map(([k]) => k)
      : [];
    const summary = overDays.length ? `\n\nDays >10 hrs: ${overDays.join(', ')}` : '';
    if (!confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} timesheet for ${r.contractor?.applicant?.full_name} (week ending ${formatDate(r.week_ending_date)})?${summary}`)) return;
    const { error } = await supabase
      .from('contractor_timesheets')
      .update({ status: decision })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Timesheet ${decision}` });
    fetchData();
  };

  const handleOutstaStatusChange = async (r: TimesheetRow, newStatus: 'pending' | 'approved' | 'flagged') => {
    if (r.outsta_status === newStatus) return;
    setUpdatingOutstaId(r.id);
    const { error } = await supabase
      .from('contractor_timesheets')
      .update({ outsta_status: newStatus })
      .eq('id', r.id);
    setUpdatingOutstaId(null);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, outsta_status: newStatus } : x)));
    toast({ title: `OutSta status: ${newStatus}` });

    if (newStatus === 'approved' || newStatus === 'flagged') {
      supabase.functions.invoke('notify-timesheet-event', {
        body: {
          event: newStatus === 'approved' ? 'timesheet_approved' : 'timesheet_flagged',
          timesheetId: r.id,
          reason: newStatus === 'flagged' ? (r.client_flag_reason || 'Flagged by OutSta admin for review.') : undefined,
          reviewerName: 'OutSta admin',
          source: 'admin',
        },
      }).catch((e) => console.error('notify invoke failed', e));
    }
  };

  const STATUS_PILL: Record<string, string> = {
    pending: 'bg-muted text-foreground/80 border-border',
    approved: 'bg-emerald-600 text-white border-emerald-600',
    flagged: 'bg-amber-500 text-white border-amber-500',
  };
  const StatusPill = ({ status, prefix }: { status: string; prefix: string }) => {
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${STATUS_PILL[status] || STATUS_PILL.pending}`}
      >
        {prefix}: {label}
      </span>
    );
  };

  const cmp = (a: any, b: any, dir: 'asc' | 'desc') => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return dir === 'asc' ? a - b : b - a;
    const r = String(a).localeCompare(String(b));
    return dir === 'asc' ? r : -r;
  };

  const externalRows = rows.filter((r) => r.contractor?.client_id !== INTERNAL_CLIENT_ID);
  const internalRows = rows.filter((r) => r.contractor?.client_id === INTERNAL_CLIENT_ID);
  const externalContractors = contractors.filter((c) => c.client_id !== INTERNAL_CLIENT_ID);
  const internalContractors = contractors.filter((c) => c.client_id === INTERNAL_CLIENT_ID);

  const applyTsFilters = (list: TimesheetRow[]) => list
    .filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          r.contractor?.applicant?.full_name?.toLowerCase().includes(q) ||
          r.contractor?.applicant?.email?.toLowerCase().includes(q) ||
          r.contractor?.client?.company_name?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (weekMonday) {
        const start = new Date(weekMonday); start.setHours(0,0,0,0);
        const end = new Date(weekMonday); end.setDate(end.getDate() + 6); end.setHours(23,59,59,999);
        const we = r.week_ending_date ? new Date(r.week_ending_date + 'T12:00:00').getTime() : 0;
        if (we < start.getTime() || we > end.getTime()) return false;
      }
      if (statusFilter && statusFilter !== 'all') {
        const [scope, val] = statusFilter.split(':');
        const field = scope === 'client' ? (r.client_approval_status || 'pending') : (r.outsta_status || 'pending');
        if (field !== val) return false;
      }
      if (hoursFilter === 'bonus') {
        if (Number(r.incentive_amount || 0) <= 0) return false;
      } else if (hoursFilter !== 'all') {
        const expected = Number(r.contractor?.hours_per_week || 0);
        const total = Number(r.total_hours || 0);
        if (expected <= 0) return false;
        const diff = total - expected;
        if (Math.abs(diff) < 0.01) return false;
        if (hoursFilter === 'over' && diff <= 0) return false;
        if (hoursFilter === 'under' && diff >= 0) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const k = tsSort.key;
      const d = tsSort.dir;
      switch (k) {
        case 'name': return cmp(a.contractor?.applicant?.full_name, b.contractor?.applicant?.full_name, d);
        case 'company': return cmp(a.contractor?.client?.company_name, b.contractor?.client?.company_name, d);
        case 'week': return cmp(new Date(a.week_ending_date).getTime(), new Date(b.week_ending_date).getTime(), d);
        case 'hours': return cmp(Number(a.total_hours), Number(b.total_hours), d);
        case 'ot': return cmp(Number(a.overtime_hours), Number(b.overtime_hours), d);
        case 'incentives': return cmp(Number(a.incentive_amount || 0), Number(b.incentive_amount || 0), d);
        case 'status': return cmp(a.status, b.status, d);
        case 'submitted': return cmp(new Date(a.submitted_at).getTime(), new Date(b.submitted_at).getTime(), d);
      }
    });

  const filtered = applyTsFilters(externalRows);
  const filteredInternal = applyTsFilters(internalRows);

  const applyContractorFilters = (list: ContractorRow[]) => list
    .filter((c) => {
      if (!contractorSearch) return true;
      const q = contractorSearch.toLowerCase();
      return (
        c.applicant?.full_name?.toLowerCase().includes(q) ||
        c.applicant?.email?.toLowerCase().includes(q) ||
        c.client?.company_name?.toLowerCase().includes(q) ||
        c.job_title?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const k = contractorSort.key;
      const d = contractorSort.dir;
      switch (k) {
        case 'name': return cmp(a.applicant?.full_name, b.applicant?.full_name, d);
        case 'company': return cmp(a.client?.company_name, b.client?.company_name, d);
        case 'status': return cmp(a.status, b.status, d);
        case 'rate': return cmp(a.hourly_rate != null ? Number(a.hourly_rate) : null, b.hourly_rate != null ? Number(b.hourly_rate) : null, d);
        case 'hpw': return cmp(a.hours_per_week, b.hours_per_week, d);
        case 'latest': return cmp(
          a.latestTimesheet ? new Date(a.latestTimesheet.week_ending_date).getTime() : null,
          b.latestTimesheet ? new Date(b.latestTimesheet.week_ending_date).getTime() : null,
          d
        );
        case 'workHours': return cmp(
          a.latestTimesheet ? Number(a.latestTimesheet.total_hours) : null,
          b.latestTimesheet ? Number(b.latestTimesheet.total_hours) : null,
          d
        );
        case 'ot': return cmp(
          a.latestTimesheet ? Number(a.latestTimesheet.overtime_hours) : null,
          b.latestTimesheet ? Number(b.latestTimesheet.overtime_hours) : null,
          d
        );
        case 'bonus': return cmp(
          a.latestTimesheet ? Number(a.latestTimesheet.incentive_amount || 0) : null,
          b.latestTimesheet ? Number(b.latestTimesheet.incentive_amount || 0) : null,
          d
        );
        case 'deposit': return cmp(
          a.latestTimesheet?.isDeposit ? Number(a.latestTimesheet.depositHours) : null,
          b.latestTimesheet?.isDeposit ? Number(b.latestTimesheet.depositHours) : null,
          d
        );
        case 'approval': return cmp(a.latestTimesheet?.client_approval_status ?? null, b.latestTimesheet?.client_approval_status ?? null, d);
        case 'portal': return cmp(
          a.hasPortal ? (a.mustChange ? 1 : 2) : 0,
          b.hasPortal ? (b.mustChange ? 1 : 2) : 0,
          d
        );
      }
    });

  const filteredContractors = applyContractorFilters(externalContractors);
  const filteredInternalContractors = applyContractorFilters(internalContractors);

  const toggleContractorSort = (key: typeof contractorSort.key) =>
    setContractorSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  const toggleTsSort = (key: typeof tsSort.key) =>
    setTsSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const SortIcon = ({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) =>
    !active ? <ArrowUpDown className="w-3 h-3 ml-1 inline opacity-40" /> :
    dir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 inline" /> : <ArrowDown className="w-3 h-3 ml-1 inline" />;

  // Compute deposit hours: first 2 weeks from start_date are security deposit, capped at hours_per_week
  const computeDeposit = (r: TimesheetRow): { depositHours: number; isDeposit: boolean; weekIndex: number | null } => {
    const startStr = r.contractor?.start_date;
    const hpw = Number(r.contractor?.hours_per_week || 0);
    if (!startStr || !hpw) return { depositHours: 0, isDeposit: false, weekIndex: null };
    const start = new Date(startStr);
    const weekEnd = new Date(r.week_ending_date);
    const diffDays = Math.floor((weekEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { depositHours: 0, isDeposit: false, weekIndex: null };
    // weekIndex 0 = first week (days 0-6), 1 = second week (days 7-13)
    const weekIndex = Math.floor(diffDays / 7);
    if (weekIndex > 1) return { depositHours: 0, isDeposit: false, weekIndex };
    const regular = Math.min(Number(r.total_hours), hpw);
    return { depositHours: regular, isDeposit: true, weekIndex };
  };

  const totalHoursAll = filtered.reduce((s, r) => s + Number(r.total_hours), 0);
  const totalOTAll = filtered.reduce((s, r) => s + Number(r.overtime_hours), 0);
  const totalIncentivesAll = filtered.reduce((s, r) => s + Number(r.incentive_amount || 0), 0);
  const totalDepositAll = filtered.reduce((s, r) => s + computeDeposit(r).depositHours, 0);

  const extractPayoneerLink = (text: string | null | undefined): string | null => {
    if (!text) return null;
    const m = text.match(/https?:\/\/(?:link|app)\.payoneer\.com\/[^\s"'<>]+/i);
    return m ? m[0] : null;
  };

  const handleExtractCSV = async () => {
    if (filtered.length === 0) {
      toast({ title: 'Nothing to extract', description: 'No submissions match the current filters.' });
      return;
    }
    // Bulk-load cached Payoneer verifications for links in the current view
    const links = Array.from(new Set(filtered.map((r) => extractPayoneerLink(r.notes)).filter(Boolean) as string[]));
    const payoneerMap = new Map<string, { amount: number | null; currency: string | null }>();
    if (links.length > 0) {
      const { data } = await supabase
        .from('payoneer_verifications')
        .select('url, amount, currency')
        .in('url', links);
      (data || []).forEach((v: any) => payoneerMap.set(v.url, { amount: v.amount != null ? Number(v.amount) : null, currency: v.currency }));
    }

    const headers = [
      'Contractor', 'Email', 'Company', 'Week Ending', 'Hours', 'Deposit Hours', 'OT',
      'Rate', 'Invoice', 'Bonus', 'Payoneer Link', 'Payoneer Amount', 'Payoneer Match',
      'Client Status', 'OutSta Status', 'Notes', 'Submitted (EST)',
    ];

    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rowsCsv = filtered.map((r) => {
      const dep = computeDeposit(r);
      const rate = Number(r.contractor?.hourly_rate || 0);
      const totalH = Number(r.total_hours);
      const otH = Number(r.overtime_hours || 0);
      const regularH = Math.max(0, totalH - otH);
      const invoice = rate > 0 ? Number((regularH * rate).toFixed(2)) : 0;
      const bonus = Number(r.incentive_amount || 0);
      const link = extractPayoneerLink(r.notes);
      const pv = link ? payoneerMap.get(link) : null;
      const pAmount = pv?.amount != null ? `${pv.amount.toFixed(2)}${pv.currency ? ' ' + pv.currency : ''}` : (link ? 'pending' : '');
      const pMatch = link
        ? (pv?.amount != null ? (Math.abs(pv.amount - invoice) < 0.01 ? 'Match' : 'Mismatch') : 'pending')
        : 'no link';
      const submittedEst = formatDateTime(r.submitted_at);

      return [
        r.contractor?.applicant?.full_name || '',
        r.contractor?.applicant?.email || '',
        r.contractor?.client?.company_name || '',
        r.week_ending_date,
        totalH.toFixed(2),
        dep.isDeposit ? dep.depositHours.toFixed(2) : '',
        otH.toFixed(2),
        rate ? rate.toFixed(2) : '',
        invoice ? invoice.toFixed(2) : '',
        bonus.toFixed(2),
        link || '',
        pAmount,
        pMatch,
        r.client_approval_status || 'pending',
        r.outsta_status || 'pending',
        (r.notes || '').replace(/\s+/g, ' ').trim(),
        submittedEst,
      ].map(esc).join(',');
    });

    const csv = [headers.join(','), ...rowsCsv].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const weekLabel = weekMonday
      ? `${format(weekMonday, 'yyyy-MM-dd')}_to_${format(new Date(weekMonday.getTime() + 6 * 86400000), 'yyyy-MM-dd')}`
      : 'all-weeks';
    a.href = url;
    a.download = `timesheet-submissions_${weekLabel}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Extracted', description: `${filtered.length} submission(s) exported to CSV.` });
  };

  const statTiles = [
    { accent: 'blue' as const, icon: Users, label: 'Portal Accounts', value: stats.portalUsers, badge: `of ${stats.totalEligibleContractors}` },
    { accent: 'amber' as const, icon: FileText, label: 'Submissions', value: filtered.length },
    { accent: 'amber' as const, icon: Clock, label: 'Total Hours', value: totalHoursAll.toFixed(2) },
    { accent: 'amber' as const, icon: Clock, label: 'Overtime Hours', value: totalOTAll.toFixed(2) },
    { accent: 'amber' as const, icon: Wallet, label: 'Deposit Hours', value: totalDepositAll.toFixed(2) },
    { accent: 'amber' as const, icon: DollarSign, label: 'Bonus', value: `$${totalIncentivesAll.toFixed(2)}` },
  ];

  return (
    <div className="space-y-3">
      <CollapsibleSection
        storageKey="pl_section_stats"
        title="Overview"
        collapsedSummary={`${stats.portalUsers}/${stats.totalEligibleContractors} portal · ${filtered.length} submissions · ${totalHoursAll.toFixed(0)}h`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3">
          {statTiles.map((t, i) => (
            <StatCard key={i} accent={t.accent} icon={t.icon} label={t.label} value={t.value} badge={(t as any).badge} sublabel={(t as any).sublabel} />
          ))}
        </div>
      </CollapsibleSection>

      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          Portal: <code className="text-foreground/70">/portal/login</code>
          <span className="mx-1.5">·</span>
          Default password: <code className="text-foreground/70">OutSta2026!</code>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReorderOpen(true)}>
            <Settings2 className="w-4 h-4 mr-2" />
            Reorder Sections
          </Button>
          {activeSubtab === 'contractors' && (
            <Button onClick={handleProvision} disabled={provisioning}>
              {provisioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Provision Accounts
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeSubtab} onValueChange={setActiveSubtab} className="w-full">
        <TabsList className="h-auto">
          <TabsTrigger value="submissions" className="gap-2">
            Weekly Submissions
            <Badge variant="secondary" className="text-[10px]">{filtered.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="contractors" className="gap-2">
            Contractors
            <Badge variant="secondary" className="text-[10px]">{filteredContractors.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="leave" className="gap-2">
            Leave Requests
            {leaveCount > 0 && <Badge variant="secondary" className="text-[10px]">{leaveCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="pl_report" className="gap-2">
            P&amp;L Report
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3">
      {activeSubtab === 'pl_report' && <PLReport />}
      {activeSubtab === 'leave' && <AdminLeaveApplications />}
      {activeSubtab === 'contractors' && (


      <CollapsibleSection
        storageKey="pl_section_contractors"
        title="Contractors"
        badge={<Badge variant="secondary" className="text-[10px] ml-1">{filteredContractors.length}</Badge>}
        collapsedSummary={`${filteredContractors.length} active contractors`}
        style={{ order: sectionOrder.indexOf('contractors') }}
        rightSlot={
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search contractor, company, role..."
              value={contractorSearch}
              onChange={(e) => setContractorSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        }
      >
        <div className="p-0">
          {/* contractors body */}
          {loading ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : filteredContractors.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No active or rendering contractors found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('name')}>Contractor<SortIcon active={contractorSort.key === 'name'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('company')}>Company<SortIcon active={contractorSort.key === 'company'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('status')}>Status<SortIcon active={contractorSort.key === 'status'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('rate')}>Rate<SortIcon active={contractorSort.key === 'rate'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('latest')}>Latest Submission<SortIcon active={contractorSort.key === 'latest'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('hpw')}>Regular Work Hours<SortIcon active={contractorSort.key === 'hpw'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('workHours')}>Work Hours<SortIcon active={contractorSort.key === 'workHours'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right w-14"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('ot')}>OT<SortIcon active={contractorSort.key === 'ot'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right w-16"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('bonus')}>Bonus<SortIcon active={contractorSort.key === 'bonus'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right w-20"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('deposit')}>Deposit<SortIcon active={contractorSort.key === 'deposit'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="w-28"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('approval')}>Client Approval<SortIcon active={contractorSort.key === 'approval'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('portal')}>Portal Account<SortIcon active={contractorSort.key === 'portal'} dir={contractorSort.dir} /></button></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContractors.map((c, idx) => (
                  <TableRow key={c.id} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                    <TableCell>
                      <div className="font-medium">{c.applicant?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.applicant?.email || '—'}</div>
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <div className="truncate" title={c.client?.company_name || ''}>
                        {c.client?.company_name || '—'}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.hourly_rate != null ? `$${Number(c.hourly_rate).toFixed(2)}` : '—'}</TableCell>
                    <TableCell>
                      {c.latestTimesheet ? (
                        <div className="flex flex-col gap-0.5">
                          {c.latestTimesheet.status === 'pending_approval' ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600 w-fit">Pending</Badge>
                          ) : c.latestTimesheet.status === 'approved' ? (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600 w-fit">Approved</Badge>
                          ) : c.latestTimesheet.status === 'rejected' ? (
                            <Badge variant="outline" className="border-destructive text-destructive w-fit">Rejected</Badge>
                          ) : (
                            <Badge variant="secondary" className="capitalize w-fit">{c.latestTimesheet.status}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">Wk {formatDateShort(c.latestTimesheet.week_ending_date)}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Not submitted</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{c.hours_per_week ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet ? (() => {
                        const expected = Number(c.hours_per_week || 0);
                        const total = Number(c.latestTimesheet.total_hours);
                        const ot = Number(c.latestTimesheet.overtime_hours);
                        const regular = total - ot;
                        let colorClass = 'text-foreground';
                        if (expected > 0) {
                          if (ot > 0 || regular > expected) colorClass = 'text-emerald-600';
                          else if (regular < expected) colorClass = 'text-red-600';
                          else colorClass = 'text-blue-600';
                        }
                        return <span className={`font-medium ${colorClass}`}>{total.toFixed(2)}</span>;
                      })() : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet && c.latestTimesheet.overtime_hours > 0 ? (
                        <span className="font-medium text-emerald-600">{c.latestTimesheet.overtime_hours.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet && c.latestTimesheet.incentive_amount > 0 ? (
                        <span className="font-medium text-blue-600">${c.latestTimesheet.incentive_amount.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet?.isDeposit ? (
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-amber-600">{c.latestTimesheet.depositHours.toFixed(2)}</span>
                          <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1 py-0 h-4 mt-0.5">
                            Wk {(c.latestTimesheet.weekIndex ?? 0) + 1}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.latestTimesheet ? (
                        <ClientApprovalBadge status={c.latestTimesheet.client_approval_status} reason={c.latestTimesheet.client_flag_reason} reviewedAt={c.latestTimesheet.client_reviewed_at} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!c.hasPortal ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-muted-foreground">No account</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={provisioningId === c.id || !c.applicant?.email}
                            onClick={() => handleProvisionOne(c)}
                          >
                            {provisioningId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><UserPlus className="w-3 h-3 mr-1" />Create</>}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {c.mustChange ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">Pending password change</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600">Active</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={loadingProfile}
                            onClick={async () => {
                              setLoadingProfile(true);
                              setProfileInvoices([]);
                              const [{ data, error }, { data: invoices }] = await Promise.all([
                                supabase
                                  .from('contractor_assignments')
                                  .select('*, applicant:applicants_prescreen(full_name, email, location, phone), client:clients(company_name, industry)')
                                  .eq('id', c.id)
                                  .maybeSingle(),
                                supabase
                                  .from('contractor_timesheets')
                                  .select('id, week_ending_date, total_hours, overtime_hours, incentive_amount, status, submitted_at, daily_hours')
                                  .eq('contractor_assignment_id', c.id)
                                  .order('week_ending_date', { ascending: false }),
                              ]);
                              setLoadingProfile(false);
                              if (error || !data) {
                                toast({ title: 'Failed to load profile', description: error?.message, variant: 'destructive' });
                                return;
                              }
                              setProfileContractor(data);
                              setProfileInvoices(invoices || []);
                            }}
                          >
                            <Eye className="w-3 h-3 mr-1" />Profile
                          </Button>
                          {c.mustChange && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={resendingId === c.id || !c.applicant?.email}
                              onClick={() => handleResendCredentials(c)}
                              title="Resend portal credentials email"
                            >
                              {resendingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Mail className="w-3 h-3 mr-1" />Resend</>}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={resettingId === c.id || !c.applicant?.email}
                            onClick={() => handleResetPassword(c)}
                            title="Reset password to default and email new credentials"
                          >
                            {resettingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><KeyRound className="w-3 h-3 mr-1" />Reset PW</>}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CollapsibleSection>
      )}

      {activeSubtab === 'contractors' && filteredInternalContractors.length > 0 && (

        <CollapsibleSection
          storageKey="pl_section_internal_contractors"
          title="Internal Team — OutSta"
          badge={
            <>
              <Badge variant="secondary" className="text-[10px] ml-1">{filteredInternalContractors.length}</Badge>
              <Badge variant="outline" className="text-[10px] ml-1">Excluded from analytics</Badge>
            </>
          }
          collapsedSummary={`${filteredInternalContractors.length} internal members`}
          className="border-dashed"
          style={{ order: sectionOrder.indexOf('internalContractors') }}
        >
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('name')}>Member<SortIcon active={contractorSort.key === 'name'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('company')}>Company<SortIcon active={contractorSort.key === 'company'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('status')}>Status<SortIcon active={contractorSort.key === 'status'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('rate')}>Rate<SortIcon active={contractorSort.key === 'rate'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('latest')}>Latest Submission<SortIcon active={contractorSort.key === 'latest'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('hpw')}>Regular Work Hours<SortIcon active={contractorSort.key === 'hpw'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('workHours')}>Work Hours<SortIcon active={contractorSort.key === 'workHours'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('ot')}>OT<SortIcon active={contractorSort.key === 'ot'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('bonus')}>Bonus<SortIcon active={contractorSort.key === 'bonus'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground ml-auto" onClick={() => toggleContractorSort('deposit')}>Deposit<SortIcon active={contractorSort.key === 'deposit'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('approval')}>Client Approval<SortIcon active={contractorSort.key === 'approval'} dir={contractorSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleContractorSort('portal')}>Portal Account<SortIcon active={contractorSort.key === 'portal'} dir={contractorSort.dir} /></button></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInternalContractors.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.applicant?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.applicant?.email || '—'}</div>
                    </TableCell>
                    <TableCell>{c.client?.company_name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.hourly_rate != null ? `$${Number(c.hourly_rate).toFixed(2)}` : '—'}</TableCell>
                    <TableCell>
                      {c.latestTimesheet ? (
                        <div className="flex flex-col gap-0.5">
                          {c.latestTimesheet.status === 'pending_approval' ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600 w-fit">Pending</Badge>
                          ) : c.latestTimesheet.status === 'approved' ? (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600 w-fit">Approved</Badge>
                          ) : c.latestTimesheet.status === 'rejected' ? (
                            <Badge variant="outline" className="border-destructive text-destructive w-fit">Rejected</Badge>
                          ) : (
                            <Badge variant="secondary" className="capitalize w-fit">{c.latestTimesheet.status}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">Wk {formatDateShort(c.latestTimesheet.week_ending_date)}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Not submitted</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{c.hours_per_week ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet ? (() => {
                        const expected = Number(c.hours_per_week || 0);
                        const total = Number(c.latestTimesheet.total_hours);
                        const ot = Number(c.latestTimesheet.overtime_hours);
                        const regular = total - ot;
                        let colorClass = 'text-foreground';
                        if (expected > 0) {
                          if (ot > 0 || regular > expected) colorClass = 'text-emerald-600';
                          else if (regular < expected) colorClass = 'text-red-600';
                          else colorClass = 'text-blue-600';
                        }
                        return <span className={`font-medium ${colorClass}`}>{total.toFixed(2)}</span>;
                      })() : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet && c.latestTimesheet.overtime_hours > 0 ? (
                        <span className="font-medium text-emerald-600">{c.latestTimesheet.overtime_hours.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet && c.latestTimesheet.incentive_amount > 0 ? (
                        <span className="font-medium text-blue-600">${c.latestTimesheet.incentive_amount.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.latestTimesheet?.isDeposit ? (
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-amber-600">{c.latestTimesheet.depositHours.toFixed(2)}</span>
                          <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1 py-0 h-4 mt-0.5">
                            Wk {(c.latestTimesheet.weekIndex ?? 0) + 1}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.latestTimesheet ? (
                        <ClientApprovalBadge status={c.latestTimesheet.client_approval_status} reason={c.latestTimesheet.client_flag_reason} reviewedAt={c.latestTimesheet.client_reviewed_at} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!c.hasPortal ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-muted-foreground">No account</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={provisioningId === c.id || !c.applicant?.email}
                            onClick={() => handleProvisionOne(c)}
                          >
                            {provisioningId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><UserPlus className="w-3 h-3 mr-1" />Create</>}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {c.mustChange ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">Pending password change</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600">Active</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={loadingProfile}
                            onClick={async () => {
                              setLoadingProfile(true);
                              setProfileInvoices([]);
                              const [{ data, error }, { data: invoices }] = await Promise.all([
                                supabase
                                  .from('contractor_assignments')
                                  .select('*, applicant:applicants_prescreen(full_name, email, location, phone), client:clients(company_name, industry)')
                                  .eq('id', c.id)
                                  .maybeSingle(),
                                supabase
                                  .from('contractor_timesheets')
                                  .select('id, week_ending_date, total_hours, overtime_hours, incentive_amount, status, submitted_at, daily_hours')
                                  .eq('contractor_assignment_id', c.id)
                                  .order('week_ending_date', { ascending: false }),
                              ]);
                              setLoadingProfile(false);
                              if (error || !data) {
                                toast({ title: 'Failed to load profile', description: error?.message, variant: 'destructive' });
                                return;
                              }
                              setProfileContractor(data);
                              setProfileInvoices(invoices || []);
                            }}
                          >
                            <Eye className="w-3 h-3 mr-1" />Profile
                          </Button>
                          {c.mustChange && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={resendingId === c.id || !c.applicant?.email}
                              onClick={() => handleResendCredentials(c)}
                              title="Resend portal credentials email"
                            >
                              {resendingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Mail className="w-3 h-3 mr-1" />Resend</>}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={resettingId === c.id || !c.applicant?.email}
                            onClick={() => handleResetPassword(c)}
                            title="Reset password to default and email new credentials"
                          >
                            {resettingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><KeyRound className="w-3 h-3 mr-1" />Reset PW</>}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleSection>
      )}

      {activeSubtab === 'submissions' && (
      <CollapsibleSection
        storageKey="pl_section_timesheets"
        title="Timesheet Submissions"
        badge={<Badge variant="secondary" className="text-[10px] ml-1">{filtered.length}</Badge>}
        collapsedSummary={`${filtered.length} submissions · ${totalHoursAll.toFixed(2)}h`}
        style={{ order: sectionOrder.indexOf('timesheets') }}
        rightSlot={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 text-primary h-8 overflow-hidden">
              <button
                type="button"
                className="px-2 h-full hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => {
                  const base = weekMonday ?? getLastCompletedMonday();
                  const prev = new Date(base); prev.setDate(prev.getDate() - 7);
                  setWeekMonday(prev);
                }}
                aria-label="Previous week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Popover open={weekPickerOpen} onOpenChange={setWeekPickerOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="px-3 h-full text-xs font-medium whitespace-nowrap hover:bg-primary/10 min-w-[200px]">
                    {weekMonday
                      ? `${format(weekMonday, 'EEE MMM d')} – ${format(new Date(weekMonday.getTime() + 6 * 86400000), 'EEE MMM d, yyyy')}`
                      : 'All weeks'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
                  <div className="p-2 border-b flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setWeekMonday(null); setWeekPickerOpen(false); }}>
                      All weeks
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setWeekMonday(getLastCompletedMonday()); setWeekPickerOpen(false); }}>
                      Last week
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setWeekMonday(getCurrentWeekMonday()); setWeekPickerOpen(false); }}>
                      Current week
                    </Button>
                  </div>
                  <Calendar
                    mode="single"
                    selected={weekMonday ?? undefined}
                    onSelect={(d) => { if (d) { setWeekMonday(mondayOf(d)); setWeekPickerOpen(false); } }}
                    disabled={(d) => mondayOf(d).getTime() > mondayOf(new Date()).getTime()}
                    weekStartsOn={1}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                className="px-2 h-full hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!weekMonday || mondayOf(new Date()).getTime() <= weekMonday.getTime()}
                onClick={() => {
                  if (!weekMonday) return;
                  const next = new Date(weekMonday); next.setDate(next.getDate() + 7);
                  if (next.getTime() > mondayOf(new Date()).getTime()) return;
                  setWeekMonday(next);
                }}
                aria-label="Next week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Select value={hoursFilter} onValueChange={(v) => setHoursFilter(v as any)}>
              <SelectTrigger className={`h-8 w-[170px] text-xs ${hoursFilter !== 'all' ? 'border-amber-500 text-amber-700 dark:text-amber-400' : ''}`}>
                <SelectValue placeholder="Hours filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All hours</SelectItem>
                <SelectItem value="mismatch">Mismatch (OT or Under)</SelectItem>
                <SelectItem value="over">Overtime only</SelectItem>
                <SelectItem value="under">Undertime only</SelectItem>
                <SelectItem value="bonus">With bonus</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="client:pending">Client: Pending</SelectItem>
                <SelectItem value="client:approved">Client: Approved</SelectItem>
                <SelectItem value="client:flagged">Client: Flagged</SelectItem>
                <SelectItem value="outsta:pending">OutSta: Pending</SelectItem>
                <SelectItem value="outsta:approved">OutSta: Approved</SelectItem>
                <SelectItem value="outsta:flagged">OutSta: Flagged</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-60">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search submissions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={handleExtractCSV}
              disabled={loading || filtered.length === 0}
              title="Download current submissions as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Extract
            </Button>
          </div>
        }
      >
        <div className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No timesheet submissions yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('name')}>Contractor<SortIcon active={tsSort.key === 'name'} dir={tsSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('company')}>Company<SortIcon active={tsSort.key === 'company'} dir={tsSort.dir} /></button></TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('week')}>Week Ending<SortIcon active={tsSort.key === 'week'} dir={tsSort.dir} /></button></TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('hours')}>Hours<SortIcon active={tsSort.key === 'hours'} dir={tsSort.dir} /></button></TableHead>
                  <TableHead className="text-right">Deposit</TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('ot')}>OT<SortIcon active={tsSort.key === 'ot'} dir={tsSort.dir} /></button></TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                  <TableHead className="text-right"><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('incentives')}>Bonus<SortIcon active={tsSort.key === 'incentives'} dir={tsSort.dir} /></button></TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('status')}>Status<SortIcon active={tsSort.key === 'status'} dir={tsSort.dir} /></button></TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead><button className="inline-flex items-center hover:text-foreground" onClick={() => toggleTsSort('submitted')}>Submitted<SortIcon active={tsSort.key === 'submitted'} dir={tsSort.dir} /></button></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const dep = computeDeposit(r);
                  return (
                    <TableRow key={r.id} className={r.status === 'pending_approval' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                      <TableCell>
                        <div className="font-medium">{r.contractor?.applicant?.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.contractor?.applicant?.email}</div>
                      </TableCell>
                      <TableCell>{r.contractor?.client?.company_name || '—'}</TableCell>
                      
                      <TableCell>{formatDate(r.week_ending_date)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {(() => {
                          const expected = Number(r.contractor?.hours_per_week || 0);
                          const total = Number(r.total_hours);
                          let cls = '';
                          let title = '';
                          if (expected > 0) {
                            if (total < expected) { cls = 'text-red-600'; title = `Below target (${expected}h)`; }
                            else if (total > expected) { cls = 'text-emerald-600'; title = `Above target (${expected}h)`; }
                            else { title = `Meets target (${expected}h)`; }
                          }
                          return <span className={cls} title={title}>{total.toFixed(2)}</span>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        {dep.isDeposit ? (
                          <div className="flex flex-col items-end">
                            <span className="font-medium text-amber-600">{dep.depositHours.toFixed(2)}</span>
                            <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1 py-0 h-4 mt-0.5">
                              Wk {(dep.weekIndex ?? 0) + 1} deposit
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{Number(r.overtime_hours).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">{r.contractor?.hourly_rate != null ? `$${(Number(r.total_hours) * Number(r.contractor.hourly_rate)).toFixed(2)}` : '—'}</TableCell>
                      <TableCell className="text-right">${Number(r.incentive_amount || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setViewTimesheet(r)}>
                          <Eye className="w-3 h-3 mr-1" />View
                        </Button>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const clientHasPortal = r.contractor?.client_id
                            ? clientPortalClientIds.has(r.contractor.client_id)
                            : false;
                          const cs = r.client_approval_status || 'pending';
                          const os = r.outsta_status || 'pending';
                          return (
                            <div className="flex flex-col gap-1 items-start">
                              {clientHasPortal ? (
                                <StatusPill status={cs} prefix="Client" />
                              ) : (
                                <span className="text-[10px] italic text-muted-foreground">No client portal</span>
                              )}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={updatingOutstaId === r.id}
                                    className="focus:outline-none focus:ring-2 focus:ring-ring rounded-full"
                                    title="Click to change OutSta status"
                                  >
                                    <StatusPill status={os} prefix="OutSta" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-40 p-1">
                                  {(['pending', 'approved', 'flagged'] as const).map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => handleOutstaStatusChange(r, opt)}
                                      className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center justify-between ${os === opt ? 'bg-accent/60 font-medium' : ''}`}
                                    >
                                      <span className="capitalize">{opt}</span>
                                      {os === opt && <Check className="w-3 h-3" />}
                                    </button>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs">
                        <div className="truncate">{renderNotesWithLinks(r.notes)}</div>
                        <div className="mt-1">
                          <PayoneerMatchBadge
                            notes={r.notes}
                            timesheetId={r.id}
                            invoice={r.contractor?.hourly_rate != null ? Number(r.total_hours) * Number(r.contractor.hourly_rate) + Number(r.incentive_amount || 0) : null}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.submitted_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </CollapsibleSection>
      )}

      {activeSubtab === 'submissions' && weekMonday && (() => {
        const weekStart = new Date(weekMonday); weekStart.setHours(0,0,0,0);
        const weekEnd = new Date(weekMonday); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23,59,59,999);
        const submittedIds = new Set(
          externalRows
            .filter((r) => {
              const we = r.week_ending_date ? new Date(r.week_ending_date + 'T12:00:00').getTime() : 0;
              return we >= weekStart.getTime() && we <= weekEnd.getTime();
            })
            .map((r) => r.contractor_assignment_id)
        );
        const nonSubmitters = externalContractors
          .filter((c) => ['active', 'rendering'].includes((c.status || '').toLowerCase()))
          .filter((c) => !submittedIds.has(c.id))
          .filter((c) => {
            if (!c.start_date) return true;
            const sd = parseDateOnly(c.start_date + 'T12:00:00').getTime();
            return sd <= weekEnd.getTime();
          })
          .filter((c) => {
            const q = (search || '').toLowerCase();
            if (!q) return true;
            return (
              c.applicant?.full_name?.toLowerCase().includes(q) ||
              c.applicant?.email?.toLowerCase().includes(q) ||
              c.client?.company_name?.toLowerCase().includes(q)
            );
          })
          .sort((a, b) =>
            (a.client?.company_name || '').localeCompare(b.client?.company_name || '') ||
            (a.applicant?.full_name || '').localeCompare(b.applicant?.full_name || '')
          );
        const weekEndLabel = format(weekEnd, 'MMM d, yyyy');
        return (
          <CollapsibleSection
            storageKey="pl_section_non_submitters"
            title="Did Not Submit"
            badge={
              <>
                <Badge variant="secondary" className="text-[10px] ml-1">{nonSubmitters.length}</Badge>
                <Badge variant="outline" className="text-[10px] ml-1 border-amber-500 text-amber-600">Week ending {weekEndLabel}</Badge>
              </>
            }
            collapsedSummary={`${nonSubmitters.length} contractors missing for week ending ${weekEndLabel}`}
            className="border-dashed border-amber-300"
          >
            <div className="p-0">
              {nonSubmitters.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  All active contractors submitted timesheets for this week.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contractor</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead className="text-right">Target Hours/wk</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nonSubmitters.map((c) => (
                      <TableRow key={c.id} className="bg-red-50/40 dark:bg-red-950/10">
                        <TableCell>
                          <div className="font-medium">{c.applicant?.full_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{c.applicant?.email}</div>
                        </TableCell>
                        <TableCell>{c.client?.company_name || '—'}</TableCell>
                        <TableCell className="text-sm">{c.job_title || '—'}</TableCell>
                        <TableCell className="text-right">{c.hours_per_week ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-red-500 text-red-600 text-[10px]">
                            Missing
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CollapsibleSection>
        );
      })()}



      {activeSubtab === 'submissions' && filteredInternal.length > 0 && (

        <CollapsibleSection
          storageKey="pl_section_internal_timesheets"
          title="Internal Team Submissions — OutSta"
          badge={
            <>
              <Badge variant="secondary" className="text-[10px] ml-1">{filteredInternal.length}</Badge>
              <Badge variant="outline" className="text-[10px] ml-1">Excluded from analytics</Badge>
            </>
          }
          collapsedSummary={`${filteredInternal.length} internal submissions`}
          className="border-dashed"
          style={{ order: sectionOrder.indexOf('internalTimesheets') }}
        >
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Week Ending</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInternal.map((r) => (
                  <TableRow key={r.id} className={r.status === 'pending_approval' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                    <TableCell>
                      <div className="font-medium">{r.contractor?.applicant?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.contractor?.applicant?.email}</div>
                    </TableCell>
                    <TableCell>{formatDate(r.week_ending_date)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {(() => {
                        const expected = Number(r.contractor?.hours_per_week || 0);
                        const total = Number(r.total_hours);
                        let cls = '';
                        let title = '';
                        if (expected > 0) {
                          if (total < expected) { cls = 'text-red-600'; title = `Below target (${expected}h)`; }
                          else if (total > expected) { cls = 'text-emerald-600'; title = `Above target (${expected}h)`; }
                          else { title = `Meets target (${expected}h)`; }
                        }
                        return <span className={cls} title={title}>{total.toFixed(2)}</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">{Number(r.overtime_hours).toFixed(2)}</TableCell>
                    <TableCell className="text-right">${Number(r.incentive_amount || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      {r.status === 'pending_approval' ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-600">Pending approval</Badge>
                      ) : r.status === 'approved' ? (
                        <Badge variant="outline" className="border-emerald-500 text-emerald-600">Approved</Badge>
                      ) : r.status === 'rejected' ? (
                        <Badge variant="outline" className="border-destructive text-destructive">Rejected</Badge>
                      ) : (
                        <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.submitted_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setViewTimesheet(r)}>
                          <Eye className="w-3 h-3 mr-1" />View
                        </Button>
                        {r.status === 'pending_approval' && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => handleDecision(r, 'approved')}>
                              <Check className="w-3 h-3 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleDecision(r, 'rejected')}>
                              <X className="w-3 h-3 mr-1" />Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleSection>
      )}
      </div>

      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reorder Sections</DialogTitle>
            <DialogDescription>Choose the order in which sections appear on your dashboard. Saved per browser.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {sectionOrder.map((id, idx) => {
              const def = SECTION_DEFS.find((s) => s.id === id);
              if (!def) return null;
              return (
                <div key={id} className="flex items-center justify-between rounded-md border p-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-center">{idx + 1}</span>
                    <span className="text-sm font-medium">{def.label}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={idx === 0} onClick={() => moveSection(idx, -1)}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={idx === sectionOrder.length - 1} onClick={() => moveSection(idx, 1)}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetSectionOrder}>Reset to default</Button>
            <Button onClick={() => setReorderOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTimesheet} onOpenChange={(o) => { if (!o) setViewTimesheet(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Timesheet Submission</DialogTitle>
            <DialogDescription>
              {viewTimesheet?.contractor?.applicant?.full_name} — Week ending {viewTimesheet ? formatDate(viewTimesheet.week_ending_date) : ''}
            </DialogDescription>
          </DialogHeader>
          {viewTimesheet && (() => {
            const r = viewTimesheet;
            const dailyEntries: Array<[string, any]> = r.daily_hours ? Object.entries(r.daily_hours) : [];
            const dayKeys = dailyEntries.map(([k]) => k).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
            const isDated = dayKeys.length > 0;
            const orderedDays = isDated
              ? dayKeys.map((k) => [k, r.daily_hours![k]] as [string, any])
              : dailyEntries;
            const expectedWeekly = Number(r.contractor?.hours_per_week || 0);
            const weeklyDiff = expectedWeekly > 0 ? Number(r.total_hours) - expectedWeekly : 0;
            const dep = computeDeposit(r);
            const fmtDayLabel = (k: string) => isDated ? formatDateWithWeekday(k) : k.charAt(0).toUpperCase() + k.slice(1);
            return (
              <div className="space-y-4 text-sm py-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                  <ProfileField label="Contractor" value={r.contractor?.applicant?.full_name} />
                  <ProfileField label="Email" value={r.contractor?.applicant?.email} />
                  <ProfileField label="Company" value={r.contractor?.client?.company_name} />
                  <ProfileField label="Job title" value={r.contractor?.job_title} />
                  <ProfileField label="Week ending" value={formatDate(r.week_ending_date)} />
                  <ProfileField label="Submitted" value={formatDateTime(r.submitted_at)} />
                  <ProfileField label="Total hours" value={Number(r.total_hours).toFixed(2)} />
                  <ProfileField label="Overtime" value={Number(r.overtime_hours).toFixed(2)} />
                  <ProfileField label="Invoice amount" value={r.contractor?.hourly_rate != null ? `$${(Number(r.total_hours) * Number(r.contractor.hourly_rate)).toFixed(2)}` : '—'} />
                  <ProfileField label="Bonus" value={`$${Number(r.incentive_amount || 0).toFixed(2)}`} />
                  <ProfileField label="Target hours/week" value={expectedWeekly ? `${expectedWeekly}` : null} />
                  <ProfileField label="Variance" value={expectedWeekly ? `${weeklyDiff > 0 ? '+' : ''}${weeklyDiff.toFixed(2)}h` : null} />
                  <ProfileField label="Status" value={r.status} />
                </div>

                {dep.isDeposit && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <div className="text-xs font-medium text-amber-700">Security deposit week</div>
                    <div className="text-sm">{dep.depositHours.toFixed(2)}h held as Wk {(dep.weekIndex ?? 0) + 1} deposit</div>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-sm mb-2">Daily Breakdown</h4>
                  {orderedDays.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No daily breakdown recorded.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Day</TableHead>
                            <TableHead className="text-right">Hours</TableHead>
                            <TableHead>Log In / Log Out</TableHead>
                            <TableHead>Reason / Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderedDays.map(([k, v]) => {
                            const hrs = Number((v as any)?.hours || 0);
                            const reason = (v as any)?.reason;
                            const isOver = hrs > 10;
                            return (
                              <TableRow key={k}>
                                <TableCell className="font-medium">{fmtDayLabel(k)}</TableCell>
                                <TableCell className={`text-right ${isOver ? 'text-amber-600 font-medium' : ''}`}>{hrs.toFixed(2)}</TableCell>
                                <TableCell className="text-sm">{reason || <span className="text-muted-foreground">—</span>}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {r.notes && (
                  <div>
                    <h4 className="font-semibold text-sm mb-1">Submission Notes</h4>
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap break-words">{renderNotesWithLinks(r.notes)}</div>
                    <div className="mt-2">
                      <PayoneerMatchBadge
                        notes={r.notes}
                        timesheetId={r.id}
                        invoice={r.contractor?.hourly_rate != null ? Number(r.total_hours) * Number(r.contractor.hourly_rate) + Number(r.incentive_amount || 0) : null}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            {viewTimesheet?.status === 'pending_approval' && (
              <>
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => { handleDecision(viewTimesheet, 'rejected'); setViewTimesheet(null); }}>
                  <X className="w-4 h-4 mr-1" />Reject
                </Button>
                <Button variant="outline" className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => { handleDecision(viewTimesheet, 'approved'); setViewTimesheet(null); }}>
                  <Check className="w-4 h-4 mr-1" />Approve
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setViewTimesheet(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!profileContractor} onOpenChange={(o) => { if (!o) { setProfileContractor(null); setProfileInvoices([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My Profile</DialogTitle>
            <DialogDescription>Contractor's portal profile details.</DialogDescription>
          </DialogHeader>
          {profileContractor && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm py-2">
                <ProfileField label="Full name" value={profileContractor.applicant?.full_name} />
                <ProfileField label="Email" value={profileContractor.applicant?.email} />
                <ProfileField label="Phone" value={profileContractor.applicant?.phone} />
                <ProfileField label="Job title" value={profileContractor.job_title} />
                <ProfileField label="Company" value={profileContractor.client?.company_name} />
                <ProfileField label="Regular work shift" value={profileContractor.regular_work_shift} />
                <ProfileField label="Work days" value={Array.isArray(profileContractor.work_days) && profileContractor.work_days.length > 0 ? profileContractor.work_days.join(', ') : null} />
                <ProfileField label="Hours per week" value={profileContractor.hours_per_week != null ? `${profileContractor.hours_per_week} hrs` : null} />
                <ProfileField label="Current rate" value={profileContractor.hourly_rate != null ? `$${Number(profileContractor.hourly_rate).toFixed(2)}/hr` : null} />
                <ProfileField label="Start date" value={profileContractor.start_date ? format(parseDateOnly(profileContractor.start_date), 'MMM d, yyyy') : null} />
                <ProfileField
                  label="Break / Lunch"
                  value={
                    profileContractor.break_duration_minutes && profileContractor.break_duration_minutes > 0
                      ? `${profileContractor.break_duration_minutes % 60 === 0 ? profileContractor.break_duration_minutes / 60 + ' hr' : profileContractor.break_duration_minutes + ' min'} · ${profileContractor.break_is_paid ? 'Paid (included)' : 'Unpaid (deducted)'}`
                      : null
                  }
                />
              </div>

              <div className="mt-4 flex items-start justify-between gap-4 rounded-md border p-3 bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor="sunday-exclude-toggle" className="text-sm font-medium cursor-pointer">
                    Exclude Sunday from billing
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When on, hours this contractor logs on Sundays are silently excluded from invoice totals and overtime detection.
                  </p>
                </div>
                <Switch
                  id="sunday-exclude-toggle"
                  checked={Boolean(profileContractor.sunday_hours_excluded)}
                  onCheckedChange={async (checked) => {
                    const prev = Boolean(profileContractor.sunday_hours_excluded);
                    setProfileContractor({ ...profileContractor, sunday_hours_excluded: checked });
                    const { error } = await supabase
                      .from('contractor_assignments')
                      .update({ sunday_hours_excluded: checked })
                      .eq('id', profileContractor.id);
                    if (error) {
                      setProfileContractor({ ...profileContractor, sunday_hours_excluded: prev });
                      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
                    } else {
                      toast({ title: checked ? 'Sunday excluded from billing' : 'Sunday included in billing' });
                    }
                  }}
                />
              </div>

              {/* Break / Lunch admin controls */}
              {(() => {
                const mins: number | null = profileContractor.break_duration_minutes ?? null;
                const isPaid: boolean | null = profileContractor.break_is_paid ?? null;
                const enabled = mins != null && mins > 0;
                const showHours = enabled && mins! % 60 === 0;
                const displayValue = enabled ? (showHours ? mins! / 60 : mins!) : '';
                const unit: 'minutes' | 'hours' = showHours ? 'hours' : 'minutes';

                const saveBreak = async (nextMinutes: number | null, nextIsPaid: boolean | null) => {
                  const prev = { mins, isPaid };
                  setProfileContractor({
                    ...profileContractor,
                    break_duration_minutes: nextMinutes,
                    break_is_paid: nextIsPaid,
                  });
                  const { error } = await supabase
                    .from('contractor_assignments')
                    .update({ break_duration_minutes: nextMinutes, break_is_paid: nextIsPaid })
                    .eq('id', profileContractor.id);
                  if (error) {
                    setProfileContractor({
                      ...profileContractor,
                      break_duration_minutes: prev.mins,
                      break_is_paid: prev.isPaid,
                    });
                    toast({ title: 'Failed to update break', description: error.message, variant: 'destructive' });
                  } else {
                    toast({ title: 'Break setting saved' });
                  }
                };

                return (
                  <div className="mt-4 space-y-3 rounded-md border p-3 bg-muted/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Break / Lunch</Label>
                        <p className="text-xs text-muted-foreground">
                          If unpaid, this break is automatically deducted from each day's billable hours when the contractor logs time.
                        </p>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            // Default: 60 minutes, unpaid
                            saveBreak(60, false);
                          } else {
                            saveBreak(null, null);
                          }
                        }}
                      />
                    </div>
                    {enabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Break duration</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step={unit === 'hours' ? '0.25' : '1'}
                              value={displayValue}
                              onChange={(e) => {
                                const num = Number(e.target.value);
                                if (isNaN(num) || num < 0) return;
                                const newMins = unit === 'hours' ? Math.round(num * 60) : Math.round(num);
                                saveBreak(newMins, isPaid ?? false);
                              }}
                              className="w-28"
                            />
                            <div className="inline-flex rounded-md border overflow-hidden">
                              {(['minutes', 'hours'] as const).map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => {
                                    if (u === unit) return;
                                    // Convert current minutes to new unit display, but keep stored minutes the same
                                    // (toggle only changes input scale on next render via showHours derivation).
                                    // To force the unit, nudge the stored minutes to be non-divisible/divisible.
                                    if (u === 'hours' && mins != null && mins % 60 !== 0) {
                                      saveBreak(Math.round(mins / 60) * 60, isPaid ?? false);
                                    } else if (u === 'minutes' && mins != null && mins % 60 === 0) {
                                      // keep value; just force minutes display by adding 0 — no-op, so leave as is
                                    }
                                  }}
                                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${unit === u ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Break type</Label>
                          <div className="inline-flex rounded-md border overflow-hidden">
                            <button
                              type="button"
                              onClick={() => saveBreak(mins, false)}
                              className={`px-3 py-1.5 text-xs font-medium transition-colors ${isPaid === false ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                            >
                              Unpaid (deducted)
                            </button>
                            <button
                              type="button"
                              onClick={() => saveBreak(mins, true)}
                              className={`px-3 py-1.5 text-xs font-medium transition-colors ${isPaid === true ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                            >
                              Paid (included)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="mt-4">
                <h4 className="font-semibold text-sm mb-2">Invoice History</h4>
                {profileInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No submitted invoices yet.</p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date range</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead className="text-right">OT</TableHead>
                          <TableHead className="text-right">Bonus</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Submitted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profileInvoices.map((inv) => {
                          const rate = Number(profileContractor.hourly_rate || 0);
                          const total = Number(inv.total_hours || 0) * rate + Number(inv.overtime_hours || 0) + Number(inv.incentive_amount || 0);
                          // Compute date range from daily_hours keys, fallback to week_ending - 6 days
                          let rangeLabel = '—';
                          const dh = inv.daily_hours && typeof inv.daily_hours === 'object' ? inv.daily_hours : null;
                          const dayKeys = dh ? Object.keys(dh).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort() : [];
                          let startDate: Date | null = null;
                          let endDate: Date | null = null;
                          if (dayKeys.length > 0) {
                            startDate = new Date(dayKeys[0]);
                            endDate = new Date(dayKeys[dayKeys.length - 1]);
                          } else if (inv.week_ending_date) {
                            endDate = new Date(inv.week_ending_date);
                            startDate = new Date(endDate);
                            startDate.setDate(startDate.getDate() - 6);
                          }
                          if (startDate && endDate) {
                            const sameYear = startDate.getFullYear() === endDate.getFullYear();
                            rangeLabel = `${format(startDate, sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
                          }
                          return (
                            <TableRow key={inv.id}>
                              <TableCell className="whitespace-nowrap">{rangeLabel}</TableCell>
                              <TableCell className="text-right">{Number(inv.total_hours || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">{Number(inv.overtime_hours || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">${Number(inv.incentive_amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right font-medium">${total.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={inv.status === 'submitted' ? 'default' : 'secondary'} className="capitalize">
                                  {inv.status || '—'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {inv.submitted_at ? formatDate(inv.submitted_at) : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProfileContractor(null); setProfileInvoices([]); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
