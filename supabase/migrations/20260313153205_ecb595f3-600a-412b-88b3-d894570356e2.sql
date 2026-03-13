ALTER TABLE public.scheduled_contractor_emails 
  ADD COLUMN IF NOT EXISTS total_items integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_items integer DEFAULT 0;