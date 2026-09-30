ALTER TABLE public.contractor_assignments
  ADD COLUMN IF NOT EXISTS deposit_per_week numeric NULL,
  ADD COLUMN IF NOT EXISTS deposit_per_week_unit text NOT NULL DEFAULT 'hours';
COMMENT ON COLUMN public.contractor_assignments.deposit_per_week IS 'Deposit taken per week (hours or USD per deposit_per_week_unit). NULL = full standard hours per week (default 2-week deposit).';