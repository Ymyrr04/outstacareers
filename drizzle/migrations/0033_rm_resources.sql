CREATE TABLE public.rm_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_path text,
  file_name text,
  mime_type text,
  content_text text NOT NULL DEFAULT '',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rm_resources TO authenticated;
GRANT ALL ON public.rm_resources TO service_role;
ALTER TABLE public.rm_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read resources" ON public.rm_resources FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins add resources" ON public.rm_resources FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "Admins delete resources" ON public.rm_resources FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER knowledge_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.rm_resources
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('resource');
CREATE POLICY "Admins read rm files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'rm-resources' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins upload rm files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'rm-resources' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins delete rm files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'rm-resources' AND public.is_admin(auth.uid()));