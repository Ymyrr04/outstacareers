-- Drop the old check constraint that only allowed the original 5 stages
ALTER TABLE public.client_hiring_requests DROP CONSTRAINT client_hiring_requests_pipeline_stage_check;

-- The pipeline_stage values are now managed by the pipeline_stages table,
-- so we don't need a check constraint anymore. 
-- If desired, a foreign key could be added later, but for flexibility we'll leave it unconstrained.