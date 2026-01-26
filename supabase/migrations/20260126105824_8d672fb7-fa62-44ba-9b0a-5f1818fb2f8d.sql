-- Add status_changed_at column to track when status was changed
ALTER TABLE public.contractor_assignments 
ADD COLUMN status_changed_at timestamp with time zone DEFAULT now();

-- Create trigger function to update status_changed_at when status changes
CREATE OR REPLACE FUNCTION public.update_contractor_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER contractor_status_change_trigger
BEFORE UPDATE ON public.contractor_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_contractor_status_changed_at();