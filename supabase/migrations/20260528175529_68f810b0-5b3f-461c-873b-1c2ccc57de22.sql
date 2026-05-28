ALTER TABLE public.contractor_assignments
ADD COLUMN IF NOT EXISTS work_days text[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri']::text[];