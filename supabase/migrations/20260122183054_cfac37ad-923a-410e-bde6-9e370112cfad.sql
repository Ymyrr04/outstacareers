-- Add hours_per_week column to client_hiring_requests
ALTER TABLE public.client_hiring_requests 
ADD COLUMN hours_per_week text;