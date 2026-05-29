import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TimesheetTutorialDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How weekly timesheets work</DialogTitle>
          <DialogDescription>
            A quick walkthrough for submitting your hours the right way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm leading-relaxed">
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-amber-900 dark:text-amber-200">
            <strong>Before you start:</strong> Submit one timesheet per workweek, and make sure your hours
            <em> match what you invoiced the client</em>. The portal compares your entered hours to your weekly
            target (set in your Profile) and asks for context when there's a mismatch.
          </div>

          <section>
            <h3 className="font-semibold text-foreground mb-1">Step 1 &mdash; Pick the date range</h3>
            <p className="text-muted-foreground">
              Click <strong>Date range</strong> and pick <strong>From</strong> and <strong>To</strong>.
              Default is the current Monday&ndash;Sunday. For partial weeks, pick only the days you worked.
              One timesheet per week &mdash; don't combine multiple weeks.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">Step 2 &mdash; Enter hours per day</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong>Normal day</strong> &mdash; enter the hours (e.g. 8 or 10).</li>
              <li><strong>Day off / weekend</strong> &mdash; leave blank or enter 0.</li>
              <li><strong>Worked over your daily target</strong> &mdash; enter the actual hours and add a short reason.</li>
              <li><strong>Worked under your daily target</strong> &mdash; enter the actual hours and add a reason.</li>
              <li><strong>Approved leave</strong> &mdash; enter 0 and reference your leave application in the reason.</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-1">Hours must be between 0 and 24 per day.</p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">Step 3 &mdash; Match your weekly target</h3>
            <p className="text-muted-foreground">
              The form shows your <strong>Total hours</strong> next to your <strong>Expected weekly hours</strong>
              (within a 15-minute tolerance):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-1">
              <li><strong>Match</strong> &mdash; you're good to submit.</li>
              <li><strong>Over target</strong> &mdash; extra hours become incentive/overtime; add a reason on the over days.</li>
              <li><strong>Under target</strong> &mdash; add a reason on the days that came in short.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">Step 4 &mdash; Incentives (optional)</h3>
            <p className="text-muted-foreground">
              If you have an agreed bonus or extra amount, fill <strong>Incentive amount</strong> and add a short
              note explaining what it is (e.g. <em>"Performance bonus from client"</em>). The note is required when there's an amount.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">Break / Lunch deduction</h3>
            <p className="text-muted-foreground">
              In your <strong>Profile</strong> under <strong>Break / Lunch</strong>, set your usual break duration
              (e.g. <em>30 min</em> or <em>1 hr</em>) and mark it as <strong>Paid</strong> or <strong>Unpaid</strong>:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-1">
              <li><strong>Unpaid</strong> &mdash; the break is automatically deducted from each day's billable hours
                whenever you fill in both <em>Time in</em> and <em>Time out</em>.</li>
              <li><strong>Paid</strong> &mdash; nothing is deducted; your raw hours stay as-is.</li>
              <li>If your logged hours are shorter than the break, billable hours show <strong>0</strong> (never negative).</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-1">
              Hover the <strong>ℹ</strong> on the <strong>Total hours</strong> column to see the raw hours and the deduction applied.
            </p>
          </section>



          <section>
            <h3 className="font-semibold text-foreground mb-1">Step 5 &mdash; Submit and confirm</h3>
            <p className="text-muted-foreground">
              Click <strong>Submit timesheet</strong>. A confirmation dialog appears with two checkboxes &mdash; tick both:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-1">
              <li>I have informed the client about these hours.</li>
              <li>The hours match what I invoiced the client for this period.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">Editing a submitted timesheet</h3>
            <p className="text-muted-foreground">
              In <strong>Submission history</strong> below the form, click the pencil icon on a row.
              The form re-opens with your saved values &mdash; make changes and click <strong>Save</strong>.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-foreground mb-1">Status meanings</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><Badge variant="secondary" className="mr-1">Submitted</Badge> received, queued for admin review</li>
              <li><Badge className="bg-emerald-600 mr-1">Approved</Badge> locked in for payroll</li>
              <li><Badge variant="destructive" className="mr-1">Needs revision</Badge> open it, fix it, resubmit</li>
            </ul>
          </section>

          <section className="rounded-md border bg-muted/40 p-3">
            <h3 className="font-semibold text-foreground mb-1">Quick tips</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Submit by <strong>end of day Sunday</strong> for the week that just ended.</li>
              <li>Update your <strong>Profile</strong> if your weekly hours target or shift changes.</li>
              <li>All times referenced in the portal are <strong>Eastern Time (EST)</strong>.</li>
              <li>Don't combine multiple weeks into one submission.</li>
            </ul>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
