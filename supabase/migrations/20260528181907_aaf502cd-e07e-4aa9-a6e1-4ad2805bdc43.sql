ALTER TABLE public.contractor_assignments ALTER COLUMN work_days DROP DEFAULT;
UPDATE public.contractor_assignments SET work_days = '{}'::text[];