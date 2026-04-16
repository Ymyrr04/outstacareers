import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StageTiming {
  stage: string;
  avgDays: number;
  sampleSize: number;
}

export interface TransitionTiming {
  fromStatus: string;
  toStatus: string;
  avgDays: number;
  sampleSize: number;
}

interface StageTimingBreakdownProps {
  stageTimings: StageTiming[];
  transitionTimings: TransitionTiming[];
}

const formatDays = (d: number) => {
  if (d < 1) return `${(d * 24).toFixed(1)}h`;
  if (d < 10) return `${d.toFixed(1)}d`;
  return `${Math.round(d)}d`;
};

// Color intensity by relative duration (0-1)
const intensityColor = (days: number, max: number) => {
  if (max === 0) return '';
  const ratio = days / max;
  if (ratio > 0.7) return 'text-amber-600 dark:text-amber-400 font-semibold';
  if (ratio > 0.4) return 'text-foreground font-medium';
  return 'text-muted-foreground';
};

export const StageTimingBreakdown = ({
  stageTimings,
  transitionTimings,
}: StageTimingBreakdownProps) => {
  const maxStageDays = Math.max(...stageTimings.map((s) => s.avgDays), 0);
  const maxTransitionDays = Math.max(...transitionTimings.map((t) => t.avgDays), 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Avg time per stage */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Avg Time Spent in Each Stage
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            How long candidates sit in each stage before moving on (or to now if still there).
          </p>
        </CardHeader>
        <CardContent className="pt-2">
          {stageTimings.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Not enough history data yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {stageTimings.map((s) => (
                <div
                  key={s.stage}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{s.stage}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      n={s.sampleSize}
                    </Badge>
                  </div>
                  <span className={cn('text-sm tabular-nums', intensityColor(s.avgDays, maxStageDays))}>
                    {formatDays(s.avgDays)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top transitions */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-primary" />
            Avg Time per Stage Transition
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Time between consecutive stage changes — slowest transitions first.
          </p>
        </CardHeader>
        <CardContent className="pt-2">
          {transitionTimings.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Not enough history data yet.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {transitionTimings.map((t) => (
                <div
                  key={`${t.fromStatus}→${t.toStatus}`}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-1.5 min-w-0 text-sm">
                    <span className="truncate">{t.fromStatus}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{t.toStatus}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                      n={t.sampleSize}
                    </Badge>
                  </div>
                  <span className={cn('text-sm tabular-nums shrink-0', intensityColor(t.avgDays, maxTransitionDays))}>
                    {formatDays(t.avgDays)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
