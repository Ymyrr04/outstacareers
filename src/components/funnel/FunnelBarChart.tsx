import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts';

interface FunnelBarChartProps {
  stageTotals: Record<string, { current: number; historical: number }>;
  stages: readonly string[];
}

export const FunnelBarChart = ({ stageTotals, stages }: FunnelBarChartProps) => {
  const chartData = useMemo(() => {
    const totalPipeline = stages.reduce((sum, s) => sum + (stageTotals[s]?.current || 0), 0) || 1;

    return stages.map((stage) => {
      const t = stageTotals[stage] || { current: 0, historical: 0 };
      // Show % of total pipeline (distribution), not misleading stage-to-stage conversion
      const pctOfTotal = (t.current / totalPipeline) * 100;

      return {
        stage: stage.length > 12 ? stage.slice(0, 11) + '…' : stage,
        fullStage: stage,
        current: t.current,
        historical: t.historical,
        distribution: Math.round(pctOfTotal),
      };
    });
  }, [stageTotals, stages]);

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Pipeline Funnel Overview</h3>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Current
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary/30 inline-block" /> Historical
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 bg-amber-500 inline-block rounded" /> Distribution %
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs">
                    <p className="font-semibold mb-1">{d.fullStage}</p>
                    <p>Current: <span className="font-bold">{d.current}</span></p>
                    {d.historical > 0 && (
                      <p>Historical pass-through: <span className="font-bold">{d.historical}</span></p>
                    )}
                    <p>% of pipeline: <span className="font-bold">{d.distribution}%</span></p>
                  </div>
                );
              }}
            />
            <Bar yAxisId="left" dataKey="current" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={32} />
            <Bar yAxisId="left" dataKey="historical" fill="hsl(var(--primary) / 0.25)" radius={[4, 4, 0, 0]} barSize={32} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="distribution"
              stroke="hsl(38, 92%, 50%)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(38, 92%, 50%)' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
