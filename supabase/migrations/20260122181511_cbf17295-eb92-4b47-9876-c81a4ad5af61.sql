-- Update the priority check constraint to include 'medium'
ALTER TABLE public.client_hiring_requests 
DROP CONSTRAINT IF EXISTS client_hiring_requests_priority_check;

ALTER TABLE public.client_hiring_requests 
ADD CONSTRAINT client_hiring_requests_priority_check 
CHECK (priority IN ('high', 'medium', 'low'));