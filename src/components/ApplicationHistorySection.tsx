import { Badge } from '@/components/ui/badge';
import { RotateCcw, Briefcase, Calendar, Star } from 'lucide-react';
import { format } from 'date-fns';
import { useApplicationHistory } from '@/hooks/useApplicationHistory';
import { formatDate } from "@/lib/dateFormat";

interface ApplicationHistorySectionProps {
  email: string;
  currentId: string;
  phone?: string | null;
}

const statusColor = (status: string) => {
  switch (status) {
    case 'Hired': return 'bg-green-600';
    case 'Reject': return 'bg-red-500';
    case 'Archived': return 'bg-gray-500';
    case 'Interview': return 'bg-purple-600';
    case 'Shortlisted': return 'bg-blue-600';
    default: return 'bg-muted-foreground';
  }
};

export function ApplicationHistorySection({ email, currentId, phone }: ApplicationHistorySectionProps) {
  const { otherApplications, loading } = useApplicationHistory(email, currentId, phone);

  if (loading || otherApplications.length === 0) return null;

  return (
    <div className="p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-lg border border-orange-200/50 dark:border-orange-800/30">
      <div className="flex items-center gap-2 mb-3">
        <RotateCcw className="w-4 h-4 text-orange-600" />
        <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
          Application History ({otherApplications.length} other {otherApplications.length === 1 ? 'application' : 'applications'})
        </span>
      </div>

      <div className="space-y-2">
        {otherApplications.map(app => (
          <div key={app.id} className="flex items-center justify-between p-2 bg-background/60 rounded-md text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="font-medium truncate">{app.job_title}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {app.total_score != null && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Star className="w-3 h-3" />
                  {app.total_score}
                </Badge>
              )}
              <Badge className={`${statusColor(app.status)} text-white text-xs`}>
                {app.status}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(app.submitted_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
