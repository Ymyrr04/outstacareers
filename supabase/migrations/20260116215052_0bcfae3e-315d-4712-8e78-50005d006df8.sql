-- Add is_hiring boolean field to clients table
ALTER TABLE public.clients ADD COLUMN is_hiring boolean DEFAULT false;