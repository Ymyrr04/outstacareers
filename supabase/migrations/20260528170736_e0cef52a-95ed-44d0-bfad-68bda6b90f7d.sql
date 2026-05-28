ALTER TABLE public.contractor_timesheets
  ADD COLUMN IF NOT EXISTS outsta_status text NOT NULL DEFAULT 'pending';

-- Seed sensible initial values from existing admin status column
UPDATE public.contractor_timesheets
   SET outsta_status = CASE
       WHEN status = 'approved' THEN 'approved'
       WHEN status = 'rejected' THEN 'flagged'
       ELSE 'pending'
   END
 WHERE outsta_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_contractor_timesheets_outsta_status
  ON public.contractor_timesheets(outsta_status);