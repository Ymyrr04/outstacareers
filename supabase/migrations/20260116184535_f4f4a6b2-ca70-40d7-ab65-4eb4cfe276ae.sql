-- Add new columns to contractor_assignments table
ALTER TABLE public.contractor_assignments
ADD COLUMN IF NOT EXISTS hours_per_week numeric,
ADD COLUMN IF NOT EXISTS contact_number text,
ADD COLUMN IF NOT EXISTS emergency_number text,
ADD COLUMN IF NOT EXISTS timesheet_link text,
ADD COLUMN IF NOT EXISTS is_replacement boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS source text;