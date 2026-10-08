CREATE OR REPLACE FUNCTION public.delete_my_timesheet(_timesheet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.contractor_timesheets%ROWTYPE;
  base timestamptz;
  local_day date;
  cand timestamptz;
  lock_at timestamptz := NULL;
  flagged boolean;
  both_approved boolean;
BEGIN
  SELECT * INTO t FROM public.contractor_timesheets WHERE id = _timesheet_id;
  IF NOT FOUND OR t.contractor_assignment_id IS DISTINCT FROM public.get_my_contractor_assignment_id() THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  flagged := t.client_approval_status = 'flagged' OR t.outsta_status = 'flagged' OR t.status IN ('rejected','flagged');
  both_approved := t.client_approval_status = 'approved' AND (t.outsta_status = 'approved' OR t.status = 'approved');

  base := (t.week_ending_date::timestamp) AT TIME ZONE 'America/New_York';
  IF t.submitted_at IS NOT NULL AND t.submitted_at > base THEN base := t.submitted_at; END IF;
  local_day := (base AT TIME ZONE 'America/New_York')::date;
  FOR i IN 0..8 LOOP
    IF EXTRACT(DOW FROM local_day + i) = 0 THEN
      cand := ((local_day + i)::timestamp + time '12:00') AT TIME ZONE 'America/New_York';
      IF cand > base THEN lock_at := cand; EXIT; END IF;
    END IF;
  END LOOP;
  IF lock_at IS NULL THEN lock_at := base + interval '7 days'; END IF;

  IF both_approved OR NOT (now() < lock_at OR flagged) THEN
    RAISE EXCEPTION 'This timesheet is locked and can no longer be deleted';
  END IF;

  DELETE FROM public.contractor_timesheets WHERE id = _timesheet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_timesheet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_timesheet(uuid) TO authenticated;