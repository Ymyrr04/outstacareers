CREATE TABLE public.contractor_import_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_by uuid,
  total_records integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  source_filename text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view import logs"
ON public.contractor_import_logs FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert import logs"
ON public.contractor_import_logs FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete import logs"
ON public.contractor_import_logs FOR DELETE
USING (is_admin(auth.uid()));