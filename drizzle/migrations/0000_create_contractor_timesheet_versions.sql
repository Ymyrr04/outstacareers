CREATE TABLE public.contractor_timesheet_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id UUID NOT NULL,
  contractor_assignment_id UUID,
  week_ending_date DATE,
  total_hours NUMERIC,
  overtime_hours NUMERIC,
  incentive_amount NUMERIC,
  notes TEXT,
  daily_hours JSONB,
  status TEXT,
  outsta_status TEXT,
  client_approval_status TEXT,
  submitted_at TIMESTAMPTZ,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID
);

CREATE INDEX idx_ts_versions_timesheet ON public.contractor_timesheet_versions (timesheet_id, replaced_at DESC);

GRANT SELECT ON public.contractor_timesheet_versions TO authenticated;
GRANT ALL ON public.contractor_timesheet_versions TO service_role;

ALTER TABLE public.contractor_timesheet_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view timesheet versions"
ON public.contractor_timesheet_versions
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.snapshot_timesheet_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.daily_hours IS DISTINCT FROM NEW.daily_hours
     OR OLD.total_hours IS DISTINCT FROM NEW.total_hours
     OR OLD.overtime_hours IS DISTINCT FROM NEW.overtime_hours
     OR OLD.incentive_amount IS DISTINCT FROM NEW.incentive_amount
     OR OLD.notes IS DISTINCT FROM NEW.notes THEN
    INSERT INTO public.contractor_timesheet_versions (
      timesheet_id, contractor_assignment_id, week_ending_date, total_hours,
      overtime_hours, incentive_amount, notes, daily_hours, status,
      outsta_status, client_approval_status, submitted_at, changed_by
    ) VALUES (
      OLD.id, OLD.contractor_assignment_id, OLD.week_ending_date, OLD.total_hours,
      OLD.overtime_hours, OLD.incentive_amount, OLD.notes, OLD.daily_hours, OLD.status,
      OLD.outsta_status, OLD.client_approval_status, OLD.submitted_at, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_timesheet_version
BEFORE UPDATE ON public.contractor_timesheets
FOR EACH ROW EXECUTE FUNCTION public.snapshot_timesheet_version();