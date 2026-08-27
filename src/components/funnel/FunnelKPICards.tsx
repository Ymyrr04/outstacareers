import { Users, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { StatCard } from '@/components/StatCard';

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
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        accent="cyan"
        icon={Users}
        label="Total in Pipeline"
        value={totalActive.toLocaleString()}
      />
      <StatCard
        accent="blue"
        icon={TrendingUp}
        label="Overall Hire Rate"
        value={`${overallConversionRate.toFixed(1)}%`}
      />
      <StatCard
        accent="amber"
        icon={AlertTriangle}
        label="Top Bottleneck"
        value={bottleneckStage || '—'}
      />
      <StatCard
        accent="blue"
        icon={Clock}
        label="Avg Days in Pipeline"
        value={avgDaysInPipeline > 0 ? `${avgDaysInPipeline}d` : '—'}
      />
    </div>
  );
};
