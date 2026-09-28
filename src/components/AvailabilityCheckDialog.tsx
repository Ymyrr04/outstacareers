import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AvailabilityCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  onSent?: () => void;
}

export function AvailabilityCheckDialog({ open, onOpenChange, applicantId, applicantName, applicantEmail, onSent }: AvailabilityCheckDialogProps) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-availability-check', {
        body: { applicantId },
      });
      if (error) throw error;
      toast.success(`Availability check sent to ${applicantEmail}`);
      onOpenChange(false);
      onSent?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send availability check');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Check Availability</DialogTitle>
          <DialogDescription>Send to {applicantName} ({applicantEmail})</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The email will come from <span className="font-medium text-foreground">OutSta Recruitment</span>.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
