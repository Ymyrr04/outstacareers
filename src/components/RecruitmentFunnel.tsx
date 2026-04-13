import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, TrendingDown, Users } from 'lucide-react';
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
  'Archive',
] as const;

const STAGE_COLORS: Record<string, string> = {
  'For Review': 'bg-blue-500',
  'For Interview': 'bg-indigo-500',
  'SIV': 'bg-violet-500',
  'Client Interview': 'bg-purple-500',
  'Hired': 'bg-emerald-500',
  'Bench': 'bg-amber-500',
  'Reject': 'bg-red-400',
  'Talent Pool': 'bg-teal-500',
  'Archive': 'bg-gray-400',
};

interface RoleFunnelData {
  jobTitle: string;
  total: number;
  stages: Record<string, number>;
}

export const RecruitmentFunnel = () => {
  const [applicants, setApplicants] = useState<{ job_title: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'total' | 'name'>('total');

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      let all: { job_title: string; status: string }[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('applicants_prescreen')
          .select('job_title, status')
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      setApplicants(all);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const roleFunnels = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const a of applicants) {
      const title = a.job_title || 'Unknown';
      if (!map[title]) map[title] = {};
      map[title][a.status] = (map[title][a.status] || 0) + 1;
    }

    let results: RoleFunnelData[] = Object.entries(map).map(([jobTitle, stages]) => ({
      jobTitle,
      total: Object.values(stages).reduce((s, v) => s + v, 0),
      stages,
    }));

    if (searchTerm) {
      results = results.filter(r =>
        r.jobTitle.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    results.sort((a, b) =>
      sortBy === 'total' ? b.total - a.total : a.jobTitle.localeCompare(b.jobTitle)
    );

    return results;
  }, [applicants, searchTerm, sortBy]);

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
          <Badge variant="outline">{roleFunnels.length} roles</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search roles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 w-48 text-sm"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'total' | 'name')}>
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Most applicants</SelectItem>
              <SelectItem value="name">A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stage legend */}
      <div className="flex flex-wrap gap-2">
        {FUNNEL_STAGES.map(stage => (
          <div key={stage} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-sm', STAGE_COLORS[stage])} />
            <span className="text-[11px] text-muted-foreground">{stage}</span>
          </div>
        ))}
      </div>

      {/* Funnel cards */}
      <div className="space-y-2">
        {roleFunnels.map((role) => (
          <FunnelRow key={role.jobTitle} role={role} grandTotal={grandTotal} />
        ))}
        {roleFunnels.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No roles found</p>
        )}
      </div>
    </div>
  );
};

const FunnelRow = ({ role, grandTotal }: { role: RoleFunnelData; grandTotal: number }) => {
  const [expanded, setExpanded] = useState(false);

  // Ordered stages with counts
  const stageData = FUNNEL_STAGES.map(stage => ({
    stage,
    count: role.stages[stage] || 0,
  })).filter(s => s.count > 0);

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-sm',
        expanded && 'ring-1 ring-primary/30'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {/* Title and count */}
          <div className="min-w-[180px] flex items-center gap-2">
            <span className="font-medium text-sm truncate">{role.jobTitle}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">{role.total}</Badge>
          </div>

          {/* Funnel bar */}
          <div className="flex-1 flex h-6 rounded overflow-hidden bg-muted/30">
            {stageData.map(({ stage, count }) => {
              const pct = (count / role.total) * 100;
              return (
                <div
                  key={stage}
                  className={cn('h-full transition-all relative group', STAGE_COLORS[stage])}
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? '4px' : '0' }}
                  title={`${stage}: ${count} (${pct.toFixed(1)}%)`}
                >
                  {pct >= 8 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium">
                      {count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 pt-3 border-t grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {FUNNEL_STAGES.map(stage => {
              const count = role.stages[stage] || 0;
              const pct = role.total > 0 ? ((count / role.total) * 100).toFixed(1) : '0';
              return (
                <div key={stage} className="text-center">
                  <div className={cn('text-lg font-bold', count === 0 && 'text-muted-foreground/40')}>
                    {count}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{stage}</div>
                  <div className="text-[9px] text-muted-foreground/60">{pct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
