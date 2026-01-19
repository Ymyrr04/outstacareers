-- Create a function to auto-disable is_hiring when client has active contractor
CREATE OR REPLACE FUNCTION public.auto_disable_hiring_on_active_contractor()
RETURNS TRIGGER AS $$
BEGIN
  -- When a contractor becomes active, set is_hiring to false for that client
  IF NEW.status = 'active' THEN
    UPDATE public.clients
    SET is_hiring = false, updated_at = now()
    WHERE id = NEW.client_id AND is_hiring = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger on contractor_assignments for INSERT and UPDATE
CREATE TRIGGER auto_disable_hiring_trigger
AFTER INSERT OR UPDATE OF status ON public.contractor_assignments
FOR EACH ROW
EXECUTE FUNCTION public.auto_disable_hiring_on_active_contractor();