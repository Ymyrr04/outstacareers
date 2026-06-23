ALTER TABLE public.contractor_assignments
  ADD COLUMN IF NOT EXISTS hired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contractor_assignments.hired_by IS
  'Admin user who created or finalized this contractor hire.';

-- Backfill from status history: pick the admin who moved candidate to Hired
UPDATE public.contractor_assignments ca
SET hired_by = sub.changed_by
FROM (
  SELECT DISTINCT ON (h.applicant_id)
    h.applicant_id,
    h.changed_by
  FROM public.applicant_status_history h
  WHERE h.to_status = 'Hired'
    AND h.changed_by IS NOT NULL
  ORDER BY h.applicant_id, h.created_at DESC
) sub
WHERE ca.applicant_id = sub.applicant_id
  AND ca.hired_by IS NULL;