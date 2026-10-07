ALTER TABLE public.contractor_timesheets ADD COLUMN IF NOT EXISTS pl_actual_hours numeric NULL;
ALTER TABLE public.contractor_assignments ADD COLUMN IF NOT EXISTS pl_standard_hours numeric NULL;
COMMENT ON COLUMN public.contractor_timesheets.pl_actual_hours IS 'Internal P&L-only override of actual hours; never shown to or used by the contractor portal.';
COMMENT ON COLUMN public.contractor_assignments.pl_standard_hours IS 'Internal P&L-only override of standard hours; never used by the contractor portal.';