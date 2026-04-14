import { useState, useMemo, useEffect } from 'react';
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

const FUNNEL_STAGES = [
  'For Review',
  'For Interview',
  'SIV',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject',
  'Talent Pool',
] as const;

const RECRUITMENT_STATUSES = new Set(FUNNEL_STAGES);

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
  const [applicants, setApplicants] = useState<{ job_title: string; status: string; pre_archive_status: string | null; submitted_at: string }[]>([]);
  const [historyData, setHistoryData] = useState<{ job_title: string; to_status: string; applicant_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'pipeline' | 'name' | 'total'>('pipeline');
  const [jobStatusFilter, setJobStatusFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [activeJobTitles, setActiveJobTitles] = useState<Set<string> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchSelected, setSearchSelected] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      let all: { job_title: string; status: string; pre_archive_status: string | null; submitted_at: string }[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('applicants_prescreen')
          .select('job_title, status, pre_archive_status, submitted_at')
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      setApplicants(all);

      let histAll: { applicant_id: string; to_status: string; job_title: string }[] = [];
      from = 0;
      while (true) {
        const { data } = await supabase
          .from('applicant_status_history')
          .select('applicant_id, to_status, applicants_prescreen!inner(job_title)')
          .range(from, from + batchSize - 1) as { data: any[] | null };
        if (!data || data.length === 0) break;
        histAll = histAll.concat(
          data.map((d: any) => ({
            applicant_id: d.applicant_id,
            to_status: d.to_status,
            job_title: d.applicants_prescreen?.job_title || 'Unknown',
          }))
        );
        if (data.length < batchSize) break;
        from += batchSize;
      }

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
  }, []);

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
      });

    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      results = results.filter((role) => role.jobTitle.toLowerCase().includes(query));
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
  }, [applicants, historyData, searchTerm, sortBy, jobStatusFilter, activeJobTitles, dateFrom, dateTo]);

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
    const actionableStages = ['For Review', 'For Interview', 'SIV', 'Client Interview', 'Bench'] as const;
    let bottleneckStage = '';
    let bottleneckCount = 0;
    for (const stage of actionableStages) {
      const c = stageTotals[stage]?.current || 0;
      if (c > bottleneckCount) {
        bottleneckCount = c;
        bottleneckStage = stage;
      }
    }

    return { totalActive, overallConversionRate, bottleneckStage, avgDaysInPipeline: 0 };
  }, [roleFunnels, stageTotals]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RoleKanbanFunnel roles={roleFunnels.map(r => r.jobTitle)} onRoleSelect={(role) => { setSearchTerm(role); setSearchSelected(true); }} />

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
            <div className="relative group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
              <Input
                placeholder="Search roles..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSearchSelected(false); }}
                className="pl-8 h-8 w-52 text-sm"
              />
              {searchTerm && !searchSelected && (() => {
                const query = searchTerm.toLowerCase().trim();
                const allRoleNames = Array.from(new Set(applicants.map(a => a.job_title?.trim()).filter(Boolean))).sort();
                // Hide if exact match exists
                if (allRoleNames.some(r => r.toLowerCase() === query)) return null;
                const suggestions = allRoleNames.filter(r => r.toLowerCase().includes(query));
                if (suggestions.length === 0) return null;
                return (
                  <div className="absolute top-full right-0 mt-1 w-96 max-h-72 overflow-y-auto bg-popover border border-border rounded-md shadow-lg z-50">
                    {suggestions.slice(0, 10).map((role) => (
                      <button
                        key={role}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent truncate"
                        onClick={() => { setSearchTerm(role); setSearchSelected(true); }}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                );
              })()}
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
                            <span className="text-xs font-semibold text-foreground">{stage}</span>
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
                    <TableRow key={role.jobTitle}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        <div className="max-w-[240px] truncate" title={role.jobTitle}>
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
