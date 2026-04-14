import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, AlertTriangle, Clock } from 'lucide-react';

interface FunnelKPICardsProps {
  totalActive: number;
  overallConversionRate: number;
  bottleneckStage: string;
  avgDaysInPipeline: number;
}

export const FunnelKPICards = ({
  totalActive,
  overallConversionRate,
  bottleneckStage,
  avgDaysInPipeline,
}: FunnelKPICardsProps) => {
  const cards = [
    {
      label: 'Total in Pipeline',
      value: totalActive.toLocaleString(),
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Overall Hire Rate',
      value: `${overallConversionRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Top Bottleneck',
      value: bottleneckStage || '—',
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      small: bottleneckStage.length > 14,
    },
    {
      label: 'Avg Days in Pipeline',
      value: avgDaysInPipeline > 0 ? `${avgDaysInPipeline}d` : '—',
      icon: Clock,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.label} className="border-border/60">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${card.bg}`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                {card.label}
              </p>
              <p className={`text-lg font-bold leading-tight ${card.small ? 'text-sm' : ''}`}>
                {card.value}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
