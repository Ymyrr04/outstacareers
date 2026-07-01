ALTER TABLE public.checkin_templates_library
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'checklist',
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS subject text;

ALTER TABLE public.checkin_templates_library
  ALTER COLUMN sections DROP NOT NULL;