
-- 1) Client rate on contractor assignments
ALTER TABLE public.contractor_assignments
  ADD COLUMN IF NOT EXISTS client_rate numeric;

-- 2) Client review fields on timesheets
ALTER TABLE public.contractor_timesheets
  ADD COLUMN IF NOT EXISTS client_approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS client_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS client_flag_reason text,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

-- 3) client_portal_users table
CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  email text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_users TO authenticated;
GRANT ALL ON public.client_portal_users TO service_role;

ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage client portal users"
  ON public.client_portal_users
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Client users can view own mapping"
  ON public.client_portal_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Client users can update own must_change_password"
  ON public.client_portal_users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) Helper function to get the client_id for the current client portal user
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id
  FROM public.client_portal_users
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- 5) Trigger to lock timesheet on approval and stamp reviewed_at
CREATE OR REPLACE FUNCTION public.handle_client_timesheet_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_approval_status IS DISTINCT FROM OLD.client_approval_status THEN
    NEW.client_reviewed_at = now();
    IF NEW.client_approval_status = 'approved' THEN
      NEW.locked = true;
    ELSIF NEW.client_approval_status = 'pending' THEN
      NEW.locked = false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_client_timesheet_review ON public.contractor_timesheets;
CREATE TRIGGER trg_handle_client_timesheet_review
  BEFORE UPDATE ON public.contractor_timesheets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_client_timesheet_review();

-- 6) RLS — clients can read their own client record
CREATE POLICY "Client portal can view own client"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (id = get_my_client_id());

-- 7) RLS — clients can read their assigned contractors
CREATE POLICY "Client portal can view own contractor assignments"
  ON public.contractor_assignments
  FOR SELECT
  TO authenticated
  USING (client_id = get_my_client_id());

-- 8) RLS — clients can read applicants for their assigned contractors
CREATE POLICY "Client portal can view assigned applicants"
  ON public.applicants_prescreen
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contractor_assignments ca
      WHERE ca.applicant_id = applicants_prescreen.id
        AND ca.client_id = get_my_client_id()
    )
  );

-- 9) RLS — clients can read timesheets for their assigned contractors
CREATE POLICY "Client portal can view own contractor timesheets"
  ON public.contractor_timesheets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contractor_assignments ca
      WHERE ca.id = contractor_timesheets.contractor_assignment_id
        AND ca.client_id = get_my_client_id()
    )
  );

-- 10) RLS — clients can update approval fields on their contractor timesheets
CREATE POLICY "Client portal can review own contractor timesheets"
  ON public.contractor_timesheets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contractor_assignments ca
      WHERE ca.id = contractor_timesheets.contractor_assignment_id
        AND ca.client_id = get_my_client_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contractor_assignments ca
      WHERE ca.id = contractor_timesheets.contractor_assignment_id
        AND ca.client_id = get_my_client_id()
    )
  );

-- 11) Tighten contractor UPDATE: block edits on locked rows
DROP POLICY IF EXISTS "Contractors can update own timesheets" ON public.contractor_timesheets;
CREATE POLICY "Contractors can update own timesheets"
  ON public.contractor_timesheets
  FOR UPDATE
  TO authenticated
  USING (
    contractor_assignment_id = get_my_contractor_assignment_id()
    AND locked = false
  )
  WITH CHECK (
    contractor_assignment_id = get_my_contractor_assignment_id()
    AND locked = false
  );

-- 12) Audit log for client review actions
CREATE TABLE IF NOT EXISTS public.client_timesheet_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL,
  client_id uuid NOT NULL,
  reviewer_user_id uuid,
  reviewer_email text,
  event_type text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_timesheet_review_events TO authenticated;
GRANT ALL ON public.client_timesheet_review_events TO service_role;

ALTER TABLE public.client_timesheet_review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view review events"
  ON public.client_timesheet_review_events
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Client portal can insert own review events"
  ON public.client_timesheet_review_events
  FOR INSERT
  TO authenticated
  WITH CHECK (client_id = get_my_client_id() AND reviewer_user_id = auth.uid());

CREATE POLICY "Client portal can view own review events"
  ON public.client_timesheet_review_events
  FOR SELECT
  TO authenticated
  USING (client_id = get_my_client_id());

CREATE INDEX IF NOT EXISTS idx_client_review_events_timesheet ON public.client_timesheet_review_events(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_client_review_events_client ON public.client_timesheet_review_events(client_id);
