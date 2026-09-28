import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarCheck, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from "@/lib/dateFormat";
import { AvailabilityCheckDialog } from '@/components/AvailabilityCheckDialog';

interface CheckAvailabilityButtonProps {
  applicantId: string;
  applicantEmail: string;
  applicantName: string;
  isAvailable: boolean | null;
  availabilityCheckedAt: string | null;
  onUpdate: (isAvailable: boolean | null, checkedAt: string | null) => void;
}

export function CheckAvailabilityButton({
  applicantId,
  applicantEmail,
  applicantName,
  isAvailable,
  availabilityCheckedAt,
  onUpdate,
}: CheckAvailabilityButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <AvailabilityCheckDialog open={open} onOpenChange={setOpen} applicantId={applicantId} applicantName={applicantName} applicantEmail={applicantEmail} onSent={() => onUpdate(null, new Date().toISOString())} />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <CalendarCheck className="w-4 h-4 mr-2" />
          Check Availability
        </Button>
        
        {isAvailable !== null && (
          <Badge 
            variant={isAvailable ? 'default' : 'secondary'}
            className={isAvailable ? 'bg-green-600' : 'bg-gray-500'}
          >
            {isAvailable ? (
              <CheckCircle2 className="w-3 h-3 mr-1" />
            ) : (
              <XCircle className="w-3 h-3 mr-1" />
            )}
            {isAvailable ? 'Available' : 'Not Available'}
          </Badge>
        )}
      </div>
      
      {availabilityCheckedAt && (
        <p className="text-xs text-muted-foreground">
          Last checked: {formatDateTime(availabilityCheckedAt)}
        </p>
      )}
    </div>
  );
}
