UPDATE public.contractor_assignments ca
SET country = 'Philippines'
FROM public.applicants_prescreen a
WHERE a.id = ca.applicant_id
  AND coalesce(nullif(trim(ca.country), ''), '') = ''
  AND a.location ILIKE '%Davao%';