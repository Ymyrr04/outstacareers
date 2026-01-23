-- Add closed_at column to track when a hiring request was closed
ALTER TABLE public.client_hiring_requests
ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE;