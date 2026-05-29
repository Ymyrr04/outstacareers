ALTER TABLE public.contractor_assignments
  ADD COLUMN IF NOT EXISTS break_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS break_is_paid boolean;

COMMENT ON COLUMN public.contractor_assignments.break_duration_minutes IS 'Daily break/lunch length in minutes. NULL = no break configured (no deduction).';
COMMENT ON COLUMN public.contractor_assignments.break_is_paid IS 'TRUE = break paid (no deduction). FALSE = unpaid (deducted from billable hours). NULL = not configured.';
