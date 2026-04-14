import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, TrendingDown, Upload, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

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
  const [sortBy, setSortBy] = useState<'pipeline' | 'name' | 'total'>('pipeline');

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

    let results: RoleFunnelData[] = Object.entries(map)
      .map(([jobTitle, stages]) => ({
        jobTitle,
        total: Object.values(stages).reduce((sum, count) => sum + count, 0),
        stages,
      }))
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
  }, [applicants, searchTerm, sortBy]);

  const stageTotals = useMemo(
    () =>
      FUNNEL_STAGES.reduce<Record<string, number>>((acc, stage) => {
        acc[stage] = roleFunnels.reduce((sum, role) => sum + (role.stages[stage] || 0), 0);
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <TrendingDown className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Recruitment Funnel</h2>
          <Badge variant="secondary">{grandTotal} total applicants</Badge>
          <Badge variant="outline">{roleFunnels.length} roles</Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      <Card>
        <CardContent className="p-0">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky left-0 z-20 min-w-[260px] bg-muted/40">
                  Role
                </TableHead>
                {FUNNEL_STAGES.map((stage) => (
                  <TableHead key={stage} className="min-w-[120px] text-center">
                    <div className="flex flex-col items-center gap-1 py-1">
                      <span className="text-xs font-semibold text-foreground">{stage}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {stageTotals[stage] || 0}
                      </Badge>
                    </div>
                  </TableHead>
                ))}
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
                    const count = role.stages[stage] || 0;
                    const hasApplicants = count > 0;

                    return (
                      <TableCell key={stage} className="text-center">
                        <div
                          className={cn(
                            'mx-auto flex h-10 w-16 items-center justify-center rounded-md border text-sm font-semibold transition-colors',
                            hasApplicants
                              ? 'border-border bg-accent/10 text-foreground'
                              : 'border-border/60 bg-muted/40 text-muted-foreground'
                          )}
                        >
                          {count}
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

      <p className="text-xs text-muted-foreground">
        Each row is one role, so you can scan across the stages and compare how applicants moved through the pipeline.
      </p>

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
      <p className="py-6 text-center text-sm text-muted-foreground">No import batches recorded yet.</p>
    ) : (
      <div className="space-y-2">
        {importLogs.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-3">
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
                    <CheckCircle className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-medium">{log.success_count}</span>
                  </div>

                  {log.error_count > 0 && (
                    <div className="flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-destructive" />
                      <span className="text-sm font-medium">{log.error_count}</span>
                    </div>
                  )}

                  <Badge variant="outline" className="text-[10px]">
                    {log.total_records} total
                  </Badge>
                </div>
              </div>

              {log.notes && (
                <p className="mt-1 text-xs text-muted-foreground">{log.notes}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    )}
  </div>
);
