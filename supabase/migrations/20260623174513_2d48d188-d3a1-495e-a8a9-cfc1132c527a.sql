ALTER TABLE public.contractor_assignments
  ADD COLUMN IF NOT EXISTS hired_via text,
  ADD COLUMN IF NOT EXISTS hired_from_stage text;

COMMENT ON COLUMN public.contractor_assignments.hired_via IS
  'Internal pipeline that produced the hire. Conventional values: recruitment_funnel, client_pipeline, sales_pipeline, talent_scout, external_scout, talent_pool, manual_import, rehire.';

COMMENT ON COLUMN public.contractor_assignments.hired_from_stage IS
  'Last applicant status/pipeline stage before the hire was recorded.';

UPDATE public.contractor_assignments ca
SET hired_via = 'manual_import'
FROM public.applicants_prescreen a
WHERE ca.applicant_id = a.id
  AND ca.hired_via IS NULL
  AND a.apply_url = 'manual-entry';

UPDATE public.contractor_assignments
SET hired_via = 'rehire'
WHERE hired_via IS NULL
  AND source ILIKE '%rehire%';

UPDATE public.contractor_assignments ca
SET hired_from_stage = sub.from_status
FROM (
  SELECT DISTINCT ON (h.applicant_id)
    h.applicant_id,
    h.from_status
  FROM public.applicant_status_history h
  WHERE h.from_status IS NOT NULL
    AND h.from_status <> 'Hired'
  ORDER BY h.applicant_id, h.created_at DESC
) sub
WHERE ca.applicant_id = sub.applicant_id
  AND ca.hired_from_stage IS NULL;