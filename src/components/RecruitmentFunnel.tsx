import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, TrendingDown, Upload, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  'For Review': { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', badge: 'bg-blue-500' },
  'For Interview': { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800', badge: 'bg-indigo-500' },
  'SIV': { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800', badge: 'bg-violet-500' },
  'Client Interview': { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800', badge: 'bg-purple-500' },
  'Hired': { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', badge: 'bg-emerald-500' },
  'Bench': { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-500' },
  'Reject': { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800', badge: 'bg-red-400' },
  'Talent Pool': { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800', badge: 'bg-teal-500' },
};

interface ImportLog {
  id: string;
  total_records: number;
  success_count: number;
  error_count: number;
  source_filename: string | null;
  notes: string | null;
  created_at: string;
}

export const RecruitmentFunnel = () => {
  const [applicants, setApplicants] = useState<{ job_title: string; status: string; pre_archive_status: string | null }[]>([]);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
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

      const { data: logs } = await supabase
        .from('contractor_import_logs')
        .select('*')
        .order('created_at', { ascending: false });
      setImportLogs((logs as ImportLog[]) || []);

      setLoading(false);
    };
    fetchAll();
  }, []);

  // Build per-stage data: { stageName -> { roleName -> count }[] sorted by count desc }
  const stageData = useMemo(() => {
    const roleStageMap: Record<string, Record<string, number>> = {};

    for (const a of applicants) {
      const effectiveStatus = a.status === 'Archive' || a.status === 'Archived'
        ? (a.pre_archive_status || a.status)
        : a.status;
      if (!RECRUITMENT_STATUSES.has(effectiveStatus as any)) continue;
      const title = a.job_title || 'Unknown';
      if (!roleStageMap[title]) roleStageMap[title] = {};
      roleStageMap[title][effectiveStatus] = (roleStageMap[title][effectiveStatus] || 0) + 1;
    }

    // Filter roles that are 100% Hired only
    const validRoles = Object.entries(roleStageMap).filter(([, stages]) => {
      const keys = Object.keys(stages);
      return !(keys.length === 1 && keys[0] === 'Hired');
    });

    const result: Record<string, { role: string; count: number }[]> = {};
    const stageTotals: Record<string, number> = {};

    for (const stage of FUNNEL_STAGES) {
      const roles: { role: string; count: number }[] = [];
      let stageTotal = 0;
      for (const [roleName, stages] of validRoles) {
        const count = stages[stage] || 0;
        if (count > 0) {
          if (searchTerm && !roleName.toLowerCase().includes(searchTerm.toLowerCase())) continue;
          roles.push({ role: roleName, count });
          stageTotal += count;
        }
      }
      roles.sort((a, b) => b.count - a.count);
      result[stage] = roles;
      stageTotals[stage] = stageTotal;
    }

    return { columns: result, totals: stageTotals };
  }, [applicants, searchTerm]);

  const grandTotal = useMemo(() => applicants.length, [applicants]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Recruitment Funnel</h2>
          <Badge variant="secondary">{grandTotal} total applicants</Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 w-48 text-sm"
          />
        </div>
      </div>

      {/* Kanban columns */}
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4 min-w-max">
          {FUNNEL_STAGES.map((stage) => {
            const colors = STAGE_COLORS[stage];
            const roles = stageData.columns[stage];
            const total = stageData.totals[stage];

            return (
              <div
                key={stage}
                className={cn(
                  'flex flex-col w-[200px] shrink-0 rounded-lg border',
                  colors.border,
                  colors.bg
                )}
              >
                {/* Column header */}
                <div className="p-3 border-b border-inherit">
                  <div className="flex items-center justify-between">
                    <h3 className={cn('text-sm font-semibold', colors.text)}>{stage}</h3>
                    <span className={cn(
                      'text-xs font-bold text-white rounded-full px-2 py-0.5',
                      colors.badge
                    )}>
                      {total}
                    </span>
                  </div>
                </div>

                {/* Role cards */}
                <ScrollArea className="flex-1 max-h-[400px]">
                  <div className="p-2 space-y-1.5">
                    {roles.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-4">No applicants</p>
                    ) : (
                      roles.map(({ role, count }) => (
                        <div
                          key={role}
                          className="bg-card rounded-md p-2 shadow-sm border border-border/50 hover:shadow-md transition-shadow"
                        >
                          <p className="text-xs font-medium truncate leading-tight" title={role}>
                            {role}
                          </p>
                          <p className={cn('text-lg font-bold mt-0.5', colors.text)}>{count}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Import History */}
      <ImportHistory importLogs={importLogs} />
    </div>
  );
};

const ImportHistory = ({ importLogs }: { importLogs: ImportLog[] }) => (
  <div className="mt-8 space-y-3">
    <div className="flex items-center gap-2">
      <Upload className="w-5 h-5 text-primary" />
      <h2 className="text-lg font-semibold">Contractor Import History</h2>
      <Badge variant="secondary">{importLogs.length} imports</Badge>
    </div>

    {importLogs.length === 0 ? (
      <p className="text-sm text-muted-foreground text-center py-6">No import batches recorded yet.</p>
    ) : (
      <div className="space-y-2">
        {importLogs.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium">
                    {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                  </div>
                  {log.source_filename && (
                    <span className="text-xs text-muted-foreground">{log.source_filename}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-sm font-medium">{log.success_count}</span>
                  </div>
                  {log.error_count > 0 && (
                    <div className="flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-sm font-medium">{log.error_count}</span>
                    </div>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {log.total_records} total
                  </Badge>
                </div>
              </div>
              {log.notes && (
                <p className="text-xs text-muted-foreground mt-1">{log.notes}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    )}
  </div>
);
