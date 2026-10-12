ALTER TABLE public.rm_resources ADD COLUMN IF NOT EXISTS char_count integer;
UPDATE public.rm_resources SET char_count = length(content_text) WHERE char_count IS NULL;

CREATE OR REPLACE FUNCTION public.set_rm_resource_char_count()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.char_count := length(coalesce(NEW.content_text, ''));
  RETURN NEW;
END $$;

CREATE TRIGGER rm_resources_char_count
BEFORE INSERT OR UPDATE OF content_text ON public.rm_resources
FOR EACH ROW EXECUTE FUNCTION public.set_rm_resource_char_count();

GRANT UPDATE ON public.rm_resources TO authenticated;
CREATE POLICY "Admins update resources" ON public.rm_resources
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));