import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
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
  const { user } = useAuth();
  const [senderName, setSenderName] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setSenderName(getAdminDisplayName(user?.email, 'OutSta Recruitment'));
  }, [open, user?.email]);

  const send = async () => {
    const name = senderName.trim();
    if (!name || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-availability-check', {
        body: { applicantId, senderName: name },
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
        <div className="space-y-2">
          <Label htmlFor="availability-sender-name">Sender name</Label>
          <Input id="availability-sender-name" value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={80} autoFocus onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void send(); } }} />
          <p className="text-xs text-muted-foreground">Shown beside your email address in the candidate’s inbox.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || !senderName.trim()}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}