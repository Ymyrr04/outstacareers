import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, TrendingDown, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoleKanbanFunnel } from '@/components/RoleKanbanFunnel';
import { FunnelKPICards } from '@/components/funnel/FunnelKPICards';
import { FunnelBarChart } from '@/components/funnel/FunnelBarChart';
import { StageTimingBreakdown, type StageTiming, type TransitionTiming } from '@/components/funnel/StageTimingBreakdown';

const FUNNEL_STAGES = [
  'For Review',
  'Qualified',
  'For Interview',

  'SIV',
  'Pitch',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject',
  'Talent Pool',
] as const;

const RECRUITMENT_STATUSES = new Set(FUNNEL_STAGES);

const getStageDisplayName = (stage: string): string => {
  if (stage === 'Talent Pool') return 'Bench';
  if (stage === 'Bench') return 'Talent Pipeline';
  return stage;
};

// Stages where a candidate is no longer actively progressing through the pipeline.
// Time spent here (and transitions into them) is excluded from "active pipeline" timing metrics.
const TERMINAL_STAGES = new Set<string>(['Hired', 'Reject', 'Archived', 'Talent Pool', 'Bench']);

interface RoleFunnelData {
  jobTitle: string;
  total: number;
  stages: Record<string, number>;
  historicalStages: Record<string, number>;
}

// Returns a heatmap background color based on intensity (0-1)
function getHeatmapColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return '';
  const intensity = count / maxCount;
  if (intensity > 0.7) return 'bg-primary/25';
  if (intensity > 0.4) return 'bg-primary/15';
  if (intensity > 0.15) return 'bg-primary/8';
  return '';
}

export const RecruitmentFunnel = () => {
  const [applicants, setApplicants] = useState<{ id: string; job_title: string; status: string; pre_archive_status: string | null; submitted_at: string }[]>([]);
  const [historyData, setHistoryData] = useState<{ job_title: string; to_status: string; applicant_count: number }[]>([]);
  // Raw history events (with from_status + created_at) for per-stage / per-transition timing analysis
  const [rawHistory, setRawHistory] = useState<{ applicant_id: string; from_status: string | null; to_status: string; created_at: string; job_title: string }[]>([]);
  // Most-recent status-change timestamp per applicant (for avg days in pipeline)
  const [lastStatusChange, setLastStatusChange] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'pipeline' | 'name' | 'total'>('pipeline');
  const [jobStatusFilter, setJobStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [activeJobTitles, setActiveJobTitles] = useState<Set<string> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetchedHistorical, setHasFetchedHistorical] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Admin-scoped role list mirrored from the pipeline above (null = no admin filter).
  const [adminScopedRoles, setAdminScopedRoles] = useState<string[] | null>(null);

  useEffect(() => {
    // Defer the heavy historical-data fetch until the user opens the collapsible.
    // This dramatically improves initial load of the Role Pipeline above.
    if (!isOpen || hasFetchedHistorical) return;

    const fetchAll = async () => {
      setLoading(true);
      setHasFetchedHistorical(true);

      let all: { id: string; job_title: string; status: string; pre_archive_status: string | null; submitted_at: string }[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('applicants_prescreen')
          .select('id, job_title, status, pre_archive_status, submitted_at')
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      setApplicants(all);

      let histAll: { applicant_id: string; from_status: string | null; to_status: string; created_at: string; job_title: string }[] = [];
      from = 0;
      while (true) {
        const { data } = await supabase
          .from('applicant_status_history')
          .select('applicant_id, from_status, to_status, created_at, applicants_prescreen!inner(job_title)')
          .range(from, from + batchSize - 1) as { data: any[] | null };
        if (!data || data.length === 0) break;
        histAll = histAll.concat(
          data.map((d: any) => ({
            applicant_id: d.applicant_id,
            from_status: d.from_status,
            to_status: d.to_status,
            created_at: d.created_at,
            job_title: d.applicants_prescreen?.job_title || 'Unknown',
          }))
        );
        if (data.length < batchSize) break;
        from += batchSize;
      }
      setRawHistory(histAll);

      // Track most-recent status-change timestamp per applicant
      const lastChange: Record<string, string> = {};
      for (const h of histAll) {
        if (!lastChange[h.applicant_id] || h.created_at > lastChange[h.applicant_id]) {
          lastChange[h.applicant_id] = h.created_at;
        }
      }
      setLastStatusChange(lastChange);

      const histMap: Record<string, Set<string>> = {};
      for (const h of histAll) {
        const key = `${h.job_title}|||${h.to_status}`;
        if (!histMap[key]) histMap[key] = new Set();
        histMap[key].add(h.applicant_id);
      }
      const histAgg = Object.entries(histMap).map(([key, ids]) => {
        const [job_title, to_status] = key.split('|||');
        return { job_title, to_status, applicant_count: ids.size };
      });
      setHistoryData(histAgg);

      setLoading(false);
    };

    fetchAll();
  }, [isOpen, hasFetchedHistorical]);

  // Fetch active job titles for filtering
  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await supabase.from('jobs').select('title, is_active');
      if (data) {
        setActiveJobTitles(new Set(data.filter(j => j.is_active).map(j => j.title)));
      }
    };
    fetchJobs();
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allRoleNames = useMemo(() =>
    Array.from(new Set(applicants.map(a => a.job_title?.trim()).filter(Boolean)))
      .filter(t => !/^\$?\d+(\.\d+)?$/.test(t))
      .sort(),
    [applicants]
  );

  const roleFunnels = useMemo(() => {
    // Resolve date range (auto-swap if reversed)
    let effectiveFrom = dateFrom;
    let effectiveTo = dateTo;
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      [effectiveFrom, effectiveTo] = [effectiveTo, effectiveFrom];
    }

    const map: Record<string, Record<string, number>> = {};

    for (const applicant of applicants) {
      // Date range filter on submitted_at
      if (effectiveFrom && applicant.submitted_at < effectiveFrom) continue;
      if (effectiveTo && applicant.submitted_at > effectiveTo + 'T23:59:59.999Z') continue;

      const effectiveStatus = applicant.status === 'Archive' || applicant.status === 'Archived'
        ? (applicant.pre_archive_status || applicant.status)
        : applicant.status;

      if (!RECRUITMENT_STATUSES.has(effectiveStatus as (typeof FUNNEL_STAGES)[number])) continue;

      const title = applicant.job_title || 'Unknown';
      if (!map[title]) map[title] = {};
      map[title][effectiveStatus] = (map[title][effectiveStatus] || 0) + 1;
    }

    const histMap: Record<string, Record<string, number>> = {};
    for (const h of historyData) {
      if (!RECRUITMENT_STATUSES.has(h.to_status as (typeof FUNNEL_STAGES)[number])) continue;
      if (!histMap[h.job_title]) histMap[h.job_title] = {};
      histMap[h.job_title][h.to_status] = (histMap[h.job_title][h.to_status] || 0) + h.applicant_count;
    }

    const allRoles = new Set([...Object.keys(map), ...Object.keys(histMap)]);

    let results: RoleFunnelData[] = Array.from(allRoles)
      .map((jobTitle) => {
        const stages = map[jobTitle] || {};
        const historicalStages = histMap[jobTitle] || {};
        return {
          jobTitle,
          total: Object.values(stages).reduce((sum, count) => sum + count, 0),
          stages,
          historicalStages,
        };
      })
      .filter((role) => {
        const stageKeys = Object.keys(role.stages);
        return !(stageKeys.length === 1 && stageKeys[0] === 'Hired');
      })
      .filter((role) => {
        if (jobStatusFilter === 'all' || !activeJobTitles) return true;
        const isActive = activeJobTitles.has(role.jobTitle);
        return jobStatusFilter === 'active' ? isActive : !isActive;
      })
      .filter((role) => {
        // Mirror the recruiter (admin) filter from the pipeline above.
        if (!adminScopedRoles) return true;
        return adminScopedRoles.includes(role.jobTitle);
      });

    if (searchTerm) {
      const query = searchTerm.trim().toLowerCase();
      results = results.filter((role) => role.jobTitle.trim().toLowerCase() === query);
    }

    results.sort((a, b) => {
      if (sortBy === 'name') return a.jobTitle.localeCompare(b.jobTitle);
      if (sortBy === 'total') return b.total - a.total;
      const aForReview = a.stages['For Review'] || 0;
      const bForReview = b.stages['For Review'] || 0;
      if (bForReview !== aForReview) return bForReview - aForReview;
      return b.total - a.total;
    });

    return results;
  }, [applicants, historyData, searchTerm, sortBy, jobStatusFilter, activeJobTitles, dateFrom, dateTo, adminScopedRoles]);

  const stageTotals = useMemo(
    () =>
      FUNNEL_STAGES.reduce<Record<string, { current: number; historical: number }>>((acc, stage) => {
        acc[stage] = {
          current: roleFunnels.reduce((sum, role) => sum + (role.stages[stage] || 0), 0),
          historical: roleFunnels.reduce((sum, role) => sum + (role.historicalStages[stage] || 0), 0),
        };
        return acc;
      }, {}),
    [roleFunnels]
  );

  // Compute max count per stage for heatmap coloring
  const stageMaxCounts = useMemo(() => {
    const maxes: Record<string, number> = {};
    for (const stage of FUNNEL_STAGES) {
      let max = 0;
      for (const role of roleFunnels) {
        const c = role.stages[stage] || 0;
        if (c > max) max = c;
      }
      maxes[stage] = max;
    }
    return maxes;
  }, [roleFunnels]);

  const grandTotal = useMemo(() => applicants.length, [applicants]);

  // KPI computations
  const kpiData = useMemo(() => {
    const totalActive = roleFunnels.reduce((s, r) => s + r.total, 0);
    const totalHired = stageTotals['Hired']?.current || 0;
    // Hire rate = hired / total in all pipeline stages (not just For Review)
    const overallConversionRate = totalActive > 0 ? (totalHired / totalActive) * 100 : 0;

    // Find bottleneck: stage with highest current count excluding end-states (Reject/Talent Pool/Hired)
    const actionableStages = ['For Review', 'For Interview', 'SIV', 'Pitch', 'Client Interview', 'Bench'] as const;
    let bottleneckStage = '';
    let bottleneckCount = 0;
    for (const stage of actionableStages) {
      const c = stageTotals[stage]?.current || 0;
      if (c > bottleneckCount) {
        bottleneckCount = c;
        bottleneckStage = stage;
      }
    }

    // Avg days in pipeline: for each applicant currently in a recruitment stage
    // within the filtered roles, compute days from submitted_at to last status
    // change (or now if no status change recorded yet).
    let effectiveFrom = dateFrom;
    let effectiveTo = dateTo;
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      [effectiveFrom, effectiveTo] = [effectiveTo, effectiveFrom];
    }
    const filteredRoleSet = new Set(roleFunnels.map(r => r.jobTitle));
    const now = Date.now();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    let totalDays = 0;
    let dayCount = 0;
    for (const a of applicants) {
      if (!filteredRoleSet.has(a.job_title || 'Unknown')) continue;
      if (effectiveFrom && a.submitted_at < effectiveFrom) continue;
      if (effectiveTo && a.submitted_at > effectiveTo + 'T23:59:59.999Z') continue;
      const effectiveStatus = a.status === 'Archive' || a.status === 'Archived'
        ? (a.pre_archive_status || a.status)
        : a.status;
      if (!RECRUITMENT_STATUSES.has(effectiveStatus as (typeof FUNNEL_STAGES)[number])) continue;
      const submittedMs = new Date(a.submitted_at).getTime();
      if (!isFinite(submittedMs)) continue;
      const lastChange = lastStatusChange[a.id];
      const endMs = lastChange ? new Date(lastChange).getTime() : now;
      const days = Math.max(0, (endMs - submittedMs) / MS_PER_DAY);
      totalDays += days;
      dayCount += 1;
    }
    const avgDaysInPipeline = dayCount > 0 ? Math.round(totalDays / dayCount) : 0;

    return { totalActive, overallConversionRate, bottleneckStage, avgDaysInPipeline };
  }, [roleFunnels, stageTotals, applicants, lastStatusChange, dateFrom, dateTo]);

  // Conversion rates: % of total pipeline in each stage (distribution view)
  // Since historical flow data is sparse (status_history trigger was added recently),
  // we show each stage as a % of the total pipeline to show distribution honestly.
  const totalPipeline = useMemo(() => {
    return FUNNEL_STAGES.reduce((sum, stage) => sum + (stageTotals[stage]?.current || 0), 0);
  }, [stageTotals]);

  const conversionRates = useMemo(() => {
    const rates: Record<string, number | null> = {};
    for (const stage of FUNNEL_STAGES) {
      const count = stageTotals[stage]?.current || 0;
      rates[stage] = totalPipeline > 0 ? (count / totalPipeline) * 100 : null;
    }
    return rates;
  }, [stageTotals, totalPipeline]);

  // Per-stage avg time + per-transition avg time, scoped to the same filters
  // (admin-scoped roles, role search, job status, date range).
  const { stageTimings, transitionTimings } = useMemo(() => {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const now = Date.now();

    // Resolve date range
    let effectiveFrom = dateFrom;
    let effectiveTo = dateTo;
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      [effectiveFrom, effectiveTo] = [effectiveTo, effectiveFrom];
    }

    // Filtered roles set (already incorporates admin / job-status / search filters)
    const filteredRoleSet = new Set(roleFunnels.map(r => r.jobTitle));

    // Quick lookup: applicant id -> { job_title, submitted_at, currentStatus }
    const applicantInfo = new Map<string, { job_title: string; submitted_at: string; currentStatus: string }>();
    for (const a of applicants) {
      const effectiveStatus = a.status === 'Archive' || a.status === 'Archived'
        ? (a.pre_archive_status || a.status)
        : a.status;
      applicantInfo.set(a.id, {
        job_title: a.job_title || 'Unknown',
        submitted_at: a.submitted_at,
        currentStatus: effectiveStatus,
      });
    }

    // Group history events per applicant (sorted asc by created_at) — only for applicants
    // whose role + submitted_at pass the filters.
    const eventsByApplicant = new Map<string, { from_status: string | null; to_status: string; created_at: string }[]>();
    for (const h of rawHistory) {
      const info = applicantInfo.get(h.applicant_id);
      if (!info) continue;
      if (!filteredRoleSet.has(info.job_title)) continue;
      if (effectiveFrom && info.submitted_at < effectiveFrom) continue;
      if (effectiveTo && info.submitted_at > effectiveTo + 'T23:59:59.999Z') continue;
      let arr = eventsByApplicant.get(h.applicant_id);
      if (!arr) {
        arr = [];
        eventsByApplicant.set(h.applicant_id, arr);
      }
      arr.push({ from_status: h.from_status, to_status: h.to_status, created_at: h.created_at });
    }

    // Per-stage durations: time from arriving in a stage until leaving it (or until now if still there)
    const stageBuckets = new Map<string, number[]>(); // stage -> array of days
    // Per-transition durations: time spent in `from` before moving to `to`
    const transitionBuckets = new Map<string, number[]>(); // "from→to" -> days

    for (const [applicantId, events] of eventsByApplicant) {
      events.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const info = applicantInfo.get(applicantId)!;

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const arrivedAt = new Date(ev.created_at).getTime();
        if (!isFinite(arrivedAt)) continue;

        const next = events[i + 1];
        const leftAt = next ? new Date(next.created_at).getTime() : now;
        if (!isFinite(leftAt)) continue;

        const days = Math.max(0, (leftAt - arrivedAt) / MS_PER_DAY);

        // Only count stages we recognize in the funnel AND that are part of the active pipeline
        // (exclude terminal stages like Hired / Reject / Archived / Talent Pool / Bench).
        if (
          RECRUITMENT_STATUSES.has(ev.to_status as (typeof FUNNEL_STAGES)[number]) &&
          !TERMINAL_STAGES.has(ev.to_status)
        ) {
          const list = stageBuckets.get(ev.to_status) || [];
          list.push(days);
          stageBuckets.set(ev.to_status, list);
        }

        // Transition: time spent in `ev.to_status` before moving to `next.to_status`.
        // Skip transitions where the source stage is terminal (candidate already exited active pipeline).
        if (next && !TERMINAL_STAGES.has(ev.to_status)) {
          const key = `${ev.to_status}→${next.to_status}`;
          const list = transitionBuckets.get(key) || [];
          list.push(days);
          transitionBuckets.set(key, list);
        }
      }
    }

    const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length;

    const stageTimings: StageTiming[] = FUNNEL_STAGES
      .map((stage) => {
        const arr = stageBuckets.get(stage) || [];
        return {
          stage,
          avgDays: arr.length > 0 ? avg(arr) : 0,
          sampleSize: arr.length,
        };
      })
      .filter((s) => s.sampleSize > 0);

    const transitionTimings: TransitionTiming[] = Array.from(transitionBuckets.entries())
      .map(([key, arr]) => {
        const [fromStatus, toStatus] = key.split('→');
        return {
          fromStatus,
          toStatus,
          avgDays: avg(arr),
          sampleSize: arr.length,
        };
      })
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 12);

    return { stageTimings, transitionTimings };
  }, [rawHistory, applicants, roleFunnels, dateFrom, dateTo]);


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RoleKanbanFunnel
        roles={roleFunnels.map(r => r.jobTitle)}
        onRoleSelect={(role) => setSearchTerm(role === '__all__' ? '' : role)}
        onFiltersChange={({ role, jobFilter, adminScopedRoles: roles }) => {
          setSearchTerm(role === '__all__' ? '' : role);
          setJobStatusFilter(jobFilter);
          setAdminScopedRoles(roles);
        }}
      />

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between gap-3 w-full flex-wrap cursor-pointer group">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingDown className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Recruitment Funnel Historical Data</h2>
              <Badge variant="secondary">{grandTotal} total applicants</Badge>
              <Badge variant="outline">{roleFunnels.length} roles</Badge>
            </div>
            <ChevronDown className={cn(
              'w-5 h-5 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 space-y-4">
          {/* KPI Cards */}
          <FunnelKPICards
            totalActive={kpiData.totalActive}
            overallConversionRate={kpiData.overallConversionRate}
            bottleneckStage={kpiData.bottleneckStage}
            avgDaysInPipeline={kpiData.avgDaysInPipeline}
          />

          {/* Funnel Bar Chart */}
          <FunnelBarChart stageTotals={stageTotals} stages={FUNNEL_STAGES} />

          {/* Per-stage and per-transition timing breakdown */}
          <StageTimingBreakdown
            stageTimings={stageTimings}
            transitionTimings={transitionTimings}
          />

          {/* Search & Sort */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-[140px] text-sm"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-[140px] text-sm"
              placeholder="To"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear
              </button>
            )}
            <div className="relative" ref={searchDropdownRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                <Input
                  placeholder="Search & select role..."
                  value={searchDropdownOpen ? roleSearchQuery : searchTerm}
                  onChange={(e) => {
                    setRoleSearchQuery(e.target.value);
                    if (!searchDropdownOpen) setSearchDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setSearchDropdownOpen(true);
                    setRoleSearchQuery('');
                  }}
                  className="pl-8 h-8 w-[280px] text-sm pr-8"
                />
                {(searchTerm || roleSearchQuery) && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs z-10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { 
                      setSearchTerm(''); 
                      setRoleSearchQuery(''); 
                      setSearchDropdownOpen(false);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {searchDropdownOpen && (
                <div 
                  className="absolute z-50 mt-1 w-[280px] rounded-md border bg-popover shadow-md overflow-hidden"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="max-h-[300px] overflow-y-auto p-1">
                    {allRoleNames
                      .filter((r) => r.toLowerCase().includes(roleSearchQuery.toLowerCase()))
                      .map((role) => (
                        <button
                          key={role}
                          className={cn(
                            'w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                            searchTerm === role && 'bg-accent/50 font-medium'
                          )}
                          onClick={() => {
                            setSearchTerm(role);
                            setSearchDropdownOpen(false);
                            setRoleSearchQuery('');
                          }}
                        >
                          {role}
                        </button>
                      ))}
                    {allRoleNames.filter((r) => r.toLowerCase().includes(roleSearchQuery.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No roles found</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Select value={jobStatusFilter} onValueChange={(value) => setJobStatusFilter(value as 'active' | 'inactive' | 'all')}>
              <SelectTrigger className="h-8 w-[130px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="active">Active Jobs</SelectItem>
                <SelectItem value="inactive">Archived Jobs</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'pipeline' | 'name' | 'total')}>
              <SelectTrigger className="h-8 w-[150px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pipeline">For Review first</SelectItem>
                <SelectItem value="total">Highest total</SelectItem>
                <SelectItem value="name">A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table with heatmap + conversion rates */}
          <Card>
            <CardContent className="p-0">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="sticky left-0 z-20 min-w-[260px] bg-muted/40">
                      Role
                    </TableHead>
                    <TableHead className="min-w-[72px] text-center sticky left-[260px] z-20 bg-muted/40">Total</TableHead>
                    {FUNNEL_STAGES.map((stage) => {
                      const totals = stageTotals[stage] || { current: 0, historical: 0 };
                      const rate = conversionRates[stage];
                      return (
                        <TableHead key={stage} className="min-w-[120px] text-center">
                          <div className="flex flex-col items-center gap-0.5 py-1">
                            <span className="text-xs font-semibold text-foreground">{getStageDisplayName(stage)}</span>
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[10px]">
                                {totals.current}
                              </Badge>
                              {totals.historical > 0 && (
                                <Badge variant="outline" className="text-[9px] text-muted-foreground" title="Historical pass-through">
                                  ↗{totals.historical}
                                </Badge>
                              )}
                            </div>
                            {rate !== null && rate > 0 && (
                              <span className={cn(
                                'text-[9px] font-medium',
                                rate >= 30 ? 'text-foreground' :
                                rate >= 5 ? 'text-muted-foreground' :
                                'text-muted-foreground/60'
                              )} title="% of total pipeline">
                                {rate.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {roleFunnels.map((role) => (
                    <TableRow key={role.jobTitle} className="cursor-pointer hover:bg-muted/60" onClick={() => { setSearchTerm(prev => prev === role.jobTitle ? '' : role.jobTitle); }}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium group-hover:bg-muted/60">
                        <div className="max-w-[240px] truncate text-primary hover:underline" title={role.jobTitle}>
                          {role.jobTitle}
                        </div>
                      </TableCell>

                      <TableCell className="text-center sticky left-[260px] z-10 bg-background">
                        <Badge variant="secondary">{role.total}</Badge>
                      </TableCell>

                      {FUNNEL_STAGES.map((stage) => {
                        const currentCount = role.stages[stage] || 0;
                        const historicalCount = role.historicalStages[stage] || 0;
                        const heatmapBg = getHeatmapColor(currentCount, stageMaxCounts[stage]);

                        return (
                          <TableCell key={stage} className="text-center">
                            <div className="mx-auto flex flex-col items-center gap-0.5">
                              <div
                                className={cn(
                                  'flex h-8 w-14 items-center justify-center rounded-md border text-sm font-semibold transition-colors',
                                  heatmapBg,
                                  currentCount > 0
                                    ? 'border-border text-foreground'
                                    : 'border-border/60 bg-muted/40 text-muted-foreground'
                                )}
                              >
                                {currentCount}
                              </div>
                              {historicalCount > 0 && (
                                <span className="text-[9px] text-muted-foreground" title="Passed through this stage historically">
                                  ↗{historicalCount}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}

                  {roleFunnels.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={FUNNEL_STAGES.length + 2} className="py-8 text-center text-sm text-muted-foreground">
                        No roles found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
