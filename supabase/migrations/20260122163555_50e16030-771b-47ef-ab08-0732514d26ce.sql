-- Create trigger function to auto-set is_hiring when high-priority pipeline request is added
CREATE OR REPLACE FUNCTION public.auto_enable_hiring_on_pipeline_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- When a high-priority hiring request is created or updated, set is_hiring = true for that client
  IF NEW.priority = 'high' AND NEW.client_id IS NOT NULL THEN
    UPDATE public.clients
    SET is_hiring = true, updated_at = now()
    WHERE id = NEW.client_id AND (is_hiring = false OR is_hiring IS NULL);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for INSERT
CREATE TRIGGER trigger_auto_enable_hiring_on_insert
AFTER INSERT ON public.client_hiring_requests
FOR EACH ROW
EXECUTE FUNCTION public.auto_enable_hiring_on_pipeline_request();

-- Create trigger for UPDATE (in case priority is changed to high)
CREATE TRIGGER trigger_auto_enable_hiring_on_update
AFTER UPDATE OF priority, client_id ON public.client_hiring_requests
FOR EACH ROW
EXECUTE FUNCTION public.auto_enable_hiring_on_pipeline_request();