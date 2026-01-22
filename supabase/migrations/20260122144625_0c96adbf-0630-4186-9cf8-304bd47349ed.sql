-- Drop the existing check constraint and add a new one that includes 'returning'
ALTER TABLE public.client_hiring_requests 
DROP CONSTRAINT IF EXISTS client_hiring_requests_client_status_check;

ALTER TABLE public.client_hiring_requests 
ADD CONSTRAINT client_hiring_requests_client_status_check 
CHECK (client_status IN ('new', 'existing', 'returning'));