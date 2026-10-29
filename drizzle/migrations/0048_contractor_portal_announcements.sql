CREATE TABLE public.portal_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200), body_html text NOT NULL DEFAULT '' CHECK (length(body_html)<=100000), published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_announcements TO authenticated;
GRANT ALL ON public.portal_announcements TO service_role;
ALTER TABLE public.portal_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcement_admin ON public.portal_announcements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY announcement_contractor_read ON public.portal_announcements FOR SELECT TO authenticated USING (published_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.contractor_portal_users WHERE user_id=auth.uid() AND disabled_at IS NULL));
CREATE TRIGGER announcement_updated BEFORE UPDATE ON public.portal_announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.portal_announcement_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), announcement_id uuid NOT NULL REFERENCES public.portal_announcements(id) ON DELETE CASCADE, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 255), path text NOT NULL UNIQUE CHECK (length(path)<=500), mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation')), size integer NOT NULL CHECK(size>0 AND size<=20971520), CHECK (path LIKE announcement_id::text || '/%')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_announcement_files TO authenticated;
GRANT ALL ON public.portal_announcement_files TO service_role;
ALTER TABLE public.portal_announcement_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcement_files_admin ON public.portal_announcement_files FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY announcement_files_read ON public.portal_announcement_files FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.portal_announcements a WHERE a.id=announcement_id AND a.published_at IS NOT NULL) AND EXISTS (SELECT 1 FROM public.contractor_portal_users WHERE user_id=auth.uid() AND disabled_at IS NULL));
CREATE TABLE public.portal_announcement_reads (
 user_id uuid NOT NULL DEFAULT auth.uid(), announcement_id uuid NOT NULL REFERENCES public.portal_announcements(id) ON DELETE CASCADE, published_at timestamptz NOT NULL, read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, announcement_id, published_at)
);
GRANT SELECT, INSERT ON public.portal_announcement_reads TO authenticated;
GRANT ALL ON public.portal_announcement_reads TO service_role;
ALTER TABLE public.portal_announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcement_reads_own ON public.portal_announcement_reads FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY announcement_reads_insert ON public.portal_announcement_reads FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.portal_announcements a WHERE a.id=announcement_id AND a.published_at=portal_announcement_reads.published_at AND a.published_at IS NOT NULL) AND EXISTS (SELECT 1 FROM public.contractor_portal_users WHERE user_id=auth.uid() AND disabled_at IS NULL));
CREATE POLICY announcement_storage_admin ON storage.objects FOR ALL TO authenticated USING (bucket_id='portal-announcements' AND public.is_admin(auth.uid())) WITH CHECK (bucket_id='portal-announcements' AND public.is_admin(auth.uid()));
CREATE POLICY announcement_storage_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='portal-announcements' AND EXISTS (SELECT 1 FROM public.portal_announcement_files f JOIN public.portal_announcements a ON a.id=f.announcement_id WHERE f.path=name AND a.published_at IS NOT NULL) AND EXISTS (SELECT 1 FROM public.contractor_portal_users WHERE user_id=auth.uid() AND disabled_at IS NULL));