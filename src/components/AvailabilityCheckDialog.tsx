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
  const send = () => {
    // Close immediately; the email goes out in the background.
    onOpenChange(false);
    supabase.functions
      .invoke('send-availability-check', { body: { applicantId } })
      .then(({ error }) => {
        if (error) throw error;
        toast.success(`Availability check sent to ${applicantEmail}`);
        onSent?.();
      })
      .catch(() => {
        toast.error('Failed to send availability check');
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Check Availability</DialogTitle>
          <DialogDescription>Send to {applicantName} ({applicantEmail})</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The email will come from <span className="font-medium text-foreground">OutSta Recruitment</span>.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send}>Send check</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
