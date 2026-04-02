import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RotateCcw } from 'lucide-react';
import { useApplicationHistory } from '@/hooks/useApplicationHistory';

interface ApplicationHistoryBadgeProps {
  email: string;
  currentId: string;
}

export function ApplicationHistoryBadge({ email, currentId }: ApplicationHistoryBadgeProps) {
  const { otherApplications, totalApplications } = useApplicationHistory(email, currentId);

  if (otherApplications.length === 0) return null;

  const rolesList = [...new Set(otherApplications.map(a => a.job_title))].slice(0, 3);
  const moreCount = [...new Set(otherApplications.map(a => a.job_title))].length - 3;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="border-orange-400 text-orange-600 dark:text-orange-400 text-xs gap-1 cursor-help">
            <RotateCcw className="w-3 h-3" />
            {totalApplications}x applied
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px]">
          <p className="font-medium mb-1">Also applied for:</p>
          <ul className="text-xs space-y-0.5">
            {rolesList.map((role, i) => (
              <li key={i}>• {role}</li>
            ))}
            {moreCount > 0 && <li className="text-muted-foreground">+{moreCount} more roles</li>}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
