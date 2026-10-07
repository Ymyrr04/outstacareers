import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface PaymentProcessNoticeProps {
  firstName: string;
  busy: boolean;
  error: string | null;
  onAcknowledge: () => void;
}

export function PaymentProcessNotice({ firstName, busy, error, onAcknowledge }: PaymentProcessNoticeProps) {
  const [read, setRead] = useState(false);
  return (
    <Dialog open>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b p-5 sm:p-6 text-left">
          <DialogTitle className="leading-normal">Weekly payment process update</DialogTitle>
          <DialogDescription>Starting Friday, October 16, 2026</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 text-sm leading-relaxed text-foreground" tabIndex={0} aria-label="Payment process announcement">
          <PaymentProcessAnnouncement firstName={firstName} />
        </div>
        <div className="shrink-0 border-t p-5 sm:p-6 space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox id="payment-notice-read" checked={read} onCheckedChange={(value) => setRead(value === true)} disabled={busy} />
            <Label htmlFor="payment-notice-read" className="leading-relaxed cursor-pointer">I have read and acknowledge this payment process update.</Label>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={!read || busy} onClick={onAcknowledge}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Acknowledge and continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function PaymentProcessAnnouncement({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-5 text-sm leading-relaxed text-foreground">
          <p>Hi {firstName},</p>
          <p>We have some exciting news to share about how your weekly payments will be processed moving forward!</p>
          <p>We have officially improved our payment process to make things faster, simpler, and easier for everyone.</p>
          <section className="space-y-2">
            <h3 className="font-semibold">When This Starts:</h3>
            <p>This Friday, nothing changes. Please continue to send your Payoneer payment request as usual, it will be processed normally.</p>
            <p>Starting next Friday, the new process below takes effect.</p>
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold">Here is what changes:</h3>
            <div className="space-y-1"><h4 className="font-semibold">Old Process:</h4><p>You had to send a Payoneer payment request, copy the request link, and submit it along with your timesheet.</p></div>
            <div className="space-y-1"><h4 className="font-semibold">New Process:</h4><p>You now only need to submit your weekly timesheet. You no longer need to send a payment request on Payoneer at all!</p></div>
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold">What to Expect on Processing Day:</h3>
            <p>Starting next week, if you still send a payment request on Payoneer, it will simply be dismissed. This is expected and nothing to worry about. Your payment is still being processed on our end and you will still receive it within the same timeframe as before, 2 to 3 business days, anywhere between Tuesday and Friday.</p>
            <p>Processing will still happen on Tuesdays, however this is now a fully automated process. Because of this, it is extremely important that you submit your timesheet accurately and before the deadline. Late or inaccurate submissions may cause you to miss that week's processing cycle.</p>
          </section>
          <p><strong>Important Reminder:</strong> If you miss the deadline for a given week, you are still required to submit your timesheet for that week. Skipping it will not only delay that week's payment, it will also cause the following week to not be processed as well.</p>
          <p>We are excited about this update as it simplifies the process significantly on your end. If you have any questions, please do not hesitate to reach out!</p>
    </div>
  );
}
