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




export const RecruitmentFunnel = () => {
  const [applicants, setApplicants] = useState<{ job_title: string; status: string; pre_archive_status: string | null }[]>([]);
  const [historyData, setHistoryData] = useState<{ job_title: string; to_status: string; applicant_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'pipeline' | 'name' | 'total'>('pipeline');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      // Fetch current applicants
      let all: { job_title: string; status: string; pre_archive_status: string | null }[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('applicants_prescreen')
          .select('job_title, status, pre_archive_status')
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      setApplicants(all);

      // Fetch historical pass-through counts (applicant_id + to_status joined with job_title)
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

      // Aggregate: count distinct applicants per job_title + to_status
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

  const roleFunnels = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};

    for (const applicant of applicants) {
      const effectiveStatus = applicant.status === 'Archive' || applicant.status === 'Archived'
        ? (applicant.pre_archive_status || applicant.status)
        : applicant.status;

      if (!RECRUITMENT_STATUSES.has(effectiveStatus as (typeof FUNNEL_STAGES)[number])) continue;

      const title = applicant.job_title || 'Unknown';
      if (!map[title]) map[title] = {};
      map[title][effectiveStatus] = (map[title][effectiveStatus] || 0) + 1;
    }

    // Build historical map: role -> stage -> count
    const histMap: Record<string, Record<string, number>> = {};
    for (const h of historyData) {
      if (!RECRUITMENT_STATUSES.has(h.to_status as (typeof FUNNEL_STAGES)[number])) continue;
      if (!histMap[h.job_title]) histMap[h.job_title] = {};
      histMap[h.job_title][h.to_status] = (histMap[h.job_title][h.to_status] || 0) + h.applicant_count;
    }

    // Merge all role names from both sources
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
  }, [applicants, historyData, searchTerm, sortBy]);

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

  const grandTotal = useMemo(() => applicants.length, [applicants]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Per-role Kanban pipeline — default at top */}
      <RoleKanbanFunnel roles={roleFunnels.map(r => r.jobTitle)} />

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between gap-3 w-full flex-wrap cursor-pointer group">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingDown className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Recruitment Funnel</h2>
              <Badge variant="secondary">{grandTotal} total applicants</Badge>
              <Badge variant="outline">{roleFunnels.length} roles</Badge>
            </div>
            <ChevronDown className={cn(
              'w-5 h-5 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search roles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 w-52 text-sm"
              />
            </div>

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

          <Card>
            <CardContent className="p-0">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="sticky left-0 z-20 min-w-[260px] bg-muted/40">
                      Role
                    </TableHead>
                    {FUNNEL_STAGES.map((stage) => {
                      const totals = stageTotals[stage] || { current: 0, historical: 0 };
                      return (
                        <TableHead key={stage} className="min-w-[120px] text-center">
                          <div className="flex flex-col items-center gap-1 py-1">
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
                          </div>
                        </TableHead>
                      );
                    })}
                    <TableHead className="min-w-[96px] text-center">Total</TableHead>
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

                      {FUNNEL_STAGES.map((stage) => {
                        const currentCount = role.stages[stage] || 0;
                        const historicalCount = role.historicalStages[stage] || 0;

                        return (
                          <TableCell key={stage} className="text-center">
                            <div className="mx-auto flex flex-col items-center gap-0.5">
                              <div
                                className={cn(
                                  'flex h-8 w-14 items-center justify-center rounded-md border text-sm font-semibold',
                                  currentCount > 0
                                    ? 'border-border bg-accent/10 text-foreground'
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

                      <TableCell className="text-center">
                        <Badge variant="secondary">{role.total}</Badge>
                      </TableCell>
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
