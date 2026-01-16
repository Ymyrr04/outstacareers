-- Drop the existing check constraint
ALTER TABLE public.contractor_assignments DROP CONSTRAINT IF EXISTS contractor_assignments_status_check;

-- Add updated check constraint with all status values
ALTER TABLE public.contractor_assignments ADD CONSTRAINT contractor_assignments_status_check 
CHECK (status IN ('active', 'scheduled', 'rendering', 'resigned', 'terminated'));