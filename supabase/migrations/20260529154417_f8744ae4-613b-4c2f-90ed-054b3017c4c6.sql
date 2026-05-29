ALTER TABLE public.contractor_assignments
  ADD COLUMN IF NOT EXISTS sunday_hours_excluded boolean NOT NULL DEFAULT false;

UPDATE public.contractor_assignments ca
SET sunday_hours_excluded = true
WHERE applicant_id IN (
  SELECT id FROM public.applicants_prescreen
  WHERE lower(email) = 'curadang29@gmail.com'
);