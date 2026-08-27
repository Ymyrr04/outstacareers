import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RotateCcw, Briefcase, Calendar, Star } from 'lucide-react';
import { format } from 'date-fns';
import { useApplicationHistory } from '@/hooks/useApplicationHistory';

interface ApplicationHistoryBadgeProps {
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

export function ApplicationHistoryBadge({ email, currentId, phone }: ApplicationHistoryBadgeProps) {
  const { otherApplications, totalApplications } = useApplicationHistory(email, currentId, phone);
  const [open, setOpen] = useState(false);

  if (otherApplications.length === 0) return null;

  return (
    <>
      <Badge
        variant="outline"
        className="border-transparent bg-[#FAEEDA] text-[#633806] text-[9px] font-medium px-1.5 py-px rounded-lg gap-1 cursor-pointer hover:bg-[#F3DFB8] transition-colors"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <RotateCcw className="w-2.5 h-2.5" />
        {totalApplications}x applied
      </Badge>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="w-4 h-4 text-orange-600" />
              Application History ({totalApplications} total)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {otherApplications.map(app => (
              <div key={app.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-md text-sm">
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
                    {format(new Date(app.submitted_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
