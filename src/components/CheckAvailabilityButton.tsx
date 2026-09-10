import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CalendarCheck, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from "@/lib/dateFormat";

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
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleCheckAvailability = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-availability-check', {
        body: {
          applicantId,
          applicantEmail,
          applicantName,
        },
      });

      if (error) throw error;

      toast({
        title: 'Availability check sent',
        description: `Email sent to ${applicantEmail}`,
      });
    } catch (error: any) {
      console.error('Error sending availability check:', error);
      toast({
        title: 'Failed to send',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheckAvailability}
          disabled={sending}
          className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CalendarCheck className="w-4 h-4 mr-2" />
          )}
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
