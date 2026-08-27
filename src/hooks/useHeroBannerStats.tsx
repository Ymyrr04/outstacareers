import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';

export interface HeroBannerStats {
  loading: boolean;
  // Applicants / funnel
  totalApplicants: number;
  newApplicantsThisWeek: number;
  statusCounts: Record<string, number>;
  regionCounts: { philippines: number; latam: number; global: number };
  // Contracts
  awaitingCountersign: number;
  sentThisMonth: number;
  fullySigned: number;
  // Calendar
  activitiesToday: number;
  activitiesTodayByAdmin: { name: string; count: number }[];
  // Sales
  totalLeads: number;
  weightedPipelineValue: number;
  leadStageCounts: Record<string, number>;
  // Clients / contractors
  activeClients: number;
  activeContractors: number;
  contractorClients: number;
  contractorRegions: { name: string; count: number }[];
  // PL
  plWeekEnding: string | null;
  plSubmitted: number;
  plTotalHours: number;
  plOtHours: number;
  plBonus: number;
  // Analytics
  totalHires: number;
  retentionRate: number;
  avgStayDays: number;
  bestAdmin: string;
  // Client pipeline
  pendingTimesheets: number;
  flaggedTimesheets: number;
  // Post-hire
  postHireTotal: number;
  postHireOnboarding: number;
  postHireActive: number;
  postHireReview: number;
  // Talent scout
  activeRoles: number;
  talentPoolCount: number;
  benchCount: number;
  // External scout
  externalSourcedThisMonth: number;
  // Workflow
  activeTasks: number;
  completedThisWeek: number;
  // Permissions
  adminUsersTotal: number;
  superAdminCount: number;
  adminCount: number;
  viewerCount: number;
}

const emptyStats: HeroBannerStats = {
  loading: true,
  totalApplicants: 0,
  newApplicantsThisWeek: 0,
  statusCounts: {},
  regionCounts: { philippines: 0, latam: 0, global: 0 },
  awaitingCountersign: 0,
  sentThisMonth: 0,
  fullySigned: 0,
  activitiesToday: 0,
  activitiesTodayByAdmin: [],
  totalLeads: 0,
  weightedPipelineValue: 0,
  leadStageCounts: {},
  activeClients: 0,
  activeContractors: 0,
  contractorClients: 0,
  contractorRegions: [],
  plWeekEnding: null,
  plSubmitted: 0,
  plTotalHours: 0,
  plOtHours: 0,
  plBonus: 0,
  totalHires: 0,
  retentionRate: 0,
  avgStayDays: 0,
  bestAdmin: '—',
  pendingTimesheets: 0,
  flaggedTimesheets: 0,
  postHireTotal: 0,
  postHireOnboarding: 0,
  postHireActive: 0,
  postHireReview: 0,
  activeRoles: 0,
  talentPoolCount: 0,
  benchCount: 0,
  externalSourcedThisMonth: 0,
  activeTasks: 0,
  completedThisWeek: 0,
  adminUsersTotal: 0,
  superAdminCount: 0,
  adminCount: 0,
  viewerCount: 0,
};

const ET = 'America/New_York';

/** Today's date in ET as YYYY-MM-DD */
export const etToday = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts;
};

const LATAM = [
  'mexico', 'méxico', 'colombia', 'el salvador', 'guatemala', 'honduras', 'nicaragua',
  'costa rica', 'panama', 'dominican republic', 'venezuela', 'peru', 'argentina',
  'brazil', 'chile', 'ecuador', 'bolivia', 'uruguay', 'paraguay', 'managua', 'san salvador',
];

const classifyCountry = (raw: string | null): 'Philippines' | 'Latin America' | 'Other' => {
  const c = (raw || '').toLowerCase();
  if (!c) return 'Other';
  if (c.includes('philip') || c.includes('philpp') || c.includes('manila') || c.includes('cavite')) return 'Philippines';
  if (LATAM.some((l) => c.includes(l))) return 'Latin America';
  return 'Other';
};

export function useHeroBannerStats(enabled: boolean = true): HeroBannerStats {
  const [stats, setStats] = useState<HeroBannerStats>(emptyStats);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      const today = etToday();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      // Applicants can exceed the 1000-row limit - page through them
      const fetchApplicants = async () => {
        const rows: any[] = [];
        for (let from = 0; from < 30000; from += 1000) {
          const { data, error } = await supabase
            .from('applicants_prescreen')
            .select('status, created_at, job_id')
            .order('created_at', { ascending: false })
            .range(from, from + 999);
          if (error || !data || data.length === 0) break;
          rows.push(...data);
          if (data.length < 1000) break;
        }
        return rows;
      };

      const [
        applicants,
        jobsRes,
        envelopesRes,
        eventsRes,
        leadsRes,
        clientsRes,
        assignmentsRes,
        timesheetsRes,
      ] = await Promise.all([
        fetchApplicants(),
        supabase.from('jobs').select('id, region'),
        supabase.from('contract_envelopes').select('status, sent_at, countersigned_at, countersign_sent_at'),
        supabase.from('calendar_events').select('assigned_to, claimed_by, event_date').eq('event_date', today),
        supabase.from('sales_leads').select('stage, estimated_hires, likelihood_to_close'),
        supabase.from('clients').select('id'),
        supabase.from('contractor_assignments').select('id, client_id, status, country, start_date, end_date, hired_by'),
        supabase.from('contractor_timesheets').select('contractor_assignment_id, week_ending_date, total_hours, overtime_hours, incentive_amount').order('week_ending_date', { ascending: false }).limit(2000),
      ]);

      if (cancelled) return;

      // --- Applicants ---
      const jobRegion = new Map<string, string>();
      for (const j of (jobsRes.data || []) as any[]) jobRegion.set(j.id, j.region || '');
      const statusCounts: Record<string, number> = {};
      const regionCounts = { philippines: 0, latam: 0, global: 0 };
      let newApplicantsThisWeek = 0;
      for (const a of applicants) {
        const s = a.status || 'For Review';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
        if (a.created_at && a.created_at >= weekAgo) newApplicantsThisWeek++;
        const region = jobRegion.get(a.job_id) || '';
        if (region === 'philippines') regionCounts.philippines++;
        else if (region === 'latin-america') regionCounts.latam++;
        else regionCounts.global++;
      }


      // --- Contracts ---
      const envelopes = (envelopesRes.data || []) as any[];
      let awaitingCountersign = 0, sentThisMonth = 0, fullySigned = 0;
      for (const e of envelopes) {
        if (e.countersigned_at) fullySigned++;
        else if (e.status === 'signed') awaitingCountersign++;
        if (e.sent_at && new Date(e.sent_at) >= monthStart) sentThisMonth++;
      }

      // --- Calendar ---
      const events = (eventsRes.data || []) as any[];
      const byAdmin: Record<string, number> = {};
      const toOwnerList = (value: unknown): string[] => {
        if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
        if (typeof value === 'string' && value.trim()) return [value];
        return [];
      };
      for (const ev of events) {
        const owners = [...toOwnerList(ev.assigned_to), ...toOwnerList(ev.claimed_by)];
        if (owners.length === 0) {
          byAdmin['Up for grabs'] = (byAdmin['Up for grabs'] || 0) + 1;
          continue;
        }
        for (const owner of owners) {
          const name = getAdminDisplayName(owner, 'Unassigned');
          byAdmin[name] = (byAdmin[name] || 0) + 1;
        }
      }
      const activitiesTodayByAdmin = Object.entries(byAdmin)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // --- Sales ---
      const leads = (leadsRes.data || []) as any[];
      const leadStageCounts: Record<string, number> = {};
      let weightedPipelineValue = 0;
      for (const l of leads) {
        const stage = l.stage || 'Unknown';
        leadStageCounts[stage] = (leadStageCounts[stage] || 0) + 1;
        const hires = Number(l.estimated_hires || 0);
        const likelihood = Number(l.likelihood_to_close || 0);
        weightedPipelineValue += hires * 3 * 50 * 52 * (likelihood / 100);
      }

      // --- Contractors / clients ---
      const assignments = (assignmentsRes.data || []) as any[];
      const active = assignments.filter((a) => a.status === 'active');
      const clientIds = new Set(active.map((a) => a.client_id).filter(Boolean));
      const regionMap: Record<string, number> = {};
      for (const a of active) {
        const r = classifyCountry(a.country);
        regionMap[r] = (regionMap[r] || 0) + 1;
      }
      const contractorRegions = Object.entries(regionMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // --- Analytics ---
      const totalHires = assignments.length;
      const retentionRate = totalHires > 0 ? Math.round((active.length / totalHires) * 100) : 0;
      const stays = assignments
        .filter((a) => a.start_date)
        .map((a) => {
          const start = new Date(a.start_date).getTime();
          const end = a.end_date ? new Date(a.end_date).getTime() : Date.now();
          return Math.max(0, Math.round((end - start) / 86400000));
        });
      const avgStayDays = stays.length ? Math.round(stays.reduce((s, v) => s + v, 0) / stays.length) : 0;
      const hiredByCounts: Record<string, number> = {};
      for (const a of assignments) {
        if (!a.hired_by) continue;
        const name = getAdminDisplayName(String(a.hired_by), '');
        if (!name) continue;
        hiredByCounts[name] = (hiredByCounts[name] || 0) + 1;
      }
      const bestEntry = Object.entries(hiredByCounts).sort((a, b) => b[1] - a[1])[0];
      const bestAdmin = bestEntry ? `${bestEntry[0]} · ${bestEntry[1]} hires` : '—';

      // --- PL ---
      const timesheets = (timesheetsRes.data || []) as any[];
      const plWeekEnding = timesheets[0]?.week_ending_date || null;
      const weekRows = plWeekEnding ? timesheets.filter((t) => t.week_ending_date === plWeekEnding) : [];
      const plSubmitted = new Set(weekRows.map((t) => t.contractor_assignment_id)).size;
      const plTotalHours = weekRows.reduce((s, t) => s + Number(t.total_hours || 0), 0);
      const plOtHours = weekRows.reduce((s, t) => s + Number(t.overtime_hours || 0), 0);
      const plBonus = weekRows.reduce((s, t) => s + Number(t.incentive_amount || 0), 0);

      setStats({
        loading: false,
        totalApplicants: applicants.length,
        newApplicantsThisWeek,
        statusCounts,
        regionCounts,
        awaitingCountersign,
        sentThisMonth,
        fullySigned,
        activitiesToday: events.length,
        activitiesTodayByAdmin,
        totalLeads: leads.length,
        weightedPipelineValue,
        leadStageCounts,
        activeClients: clientIds.size,
        activeContractors: active.length,
        contractorClients: clientIds.size,
        contractorRegions,
        plWeekEnding,
        plSubmitted,
        plTotalHours,
        plOtHours,
        plBonus,
        totalHires,
        retentionRate,
        avgStayDays,
        bestAdmin,
      });
    };

    run().catch(() => {
      if (!cancelled) setStats((s) => ({ ...s, loading: false }));
    });

    return () => { cancelled = true; };
  }, [enabled]);

  return stats;
}
