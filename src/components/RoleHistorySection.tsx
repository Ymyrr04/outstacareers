import { Badge } from '@/components/ui/badge';
import { Briefcase, History } from 'lucide-react';
import { format } from 'date-fns';
import { formatDateShort } from "@/lib/dateFormat";

interface RoleHistorySectionProps {
  currentJobTitle: string;
  originalJobTitle: string | null;
  reprofiledAt: string | null;
}

export function RoleHistorySection({
  currentJobTitle,
  originalJobTitle,
  reprofiledAt,
}: RoleHistorySectionProps) {
  const wasReprofiled = originalJobTitle && originalJobTitle !== currentJobTitle;

  if (!wasReprofiled) {
    return null;
  }

  return (
    <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-lg border border-purple-200/50 dark:border-purple-800/30">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Role History</span>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Original Role:</span>
          <Badge variant="outline" className="font-normal">
            <Briefcase className="w-3 h-3 mr-1" />
            {originalJobTitle}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Current Role:</span>
          <Badge className="bg-purple-600 font-normal">
            <Briefcase className="w-3 h-3 mr-1" />
            {currentJobTitle}
          </Badge>
        </div>
        
        {reprofiledAt && (
          <p className="text-xs text-muted-foreground pt-1 border-t">
            Reprofiled on {formatDateShort(reprofiledAt)}
          </p>
        )}
      </div>
    </div>
  );
}
