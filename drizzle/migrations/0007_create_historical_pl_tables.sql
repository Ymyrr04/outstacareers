CREATE TABLE public.historical_pl_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  filename text,
  column_map jsonb,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.historical_pl_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.historical_pl_batches(id) ON DELETE CASCADE,
  week_label text,
  week_start date,
  week_end date,
  contractor_name text,
  company text,
  hours numeric,
  contractor_rate numeric,
  client_rate numeric,
  contractor_cost numeric,
  client_billing numeric,
  margin numeric,
  raw jsonb
);

CREATE INDEX historical_pl_rows_batch_id_idx ON public.historical_pl_rows (batch_id);
CREATE INDEX historical_pl_rows_week_start_idx ON public.historical_pl_rows (week_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_pl_batches TO authenticated;
GRANT ALL ON public.historical_pl_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_pl_rows TO authenticated;
GRANT ALL ON public.historical_pl_rows TO service_role;

ALTER TABLE public.historical_pl_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_pl_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage historical PL batches" ON public.historical_pl_batches
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage historical PL rows" ON public.historical_pl_rows
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));