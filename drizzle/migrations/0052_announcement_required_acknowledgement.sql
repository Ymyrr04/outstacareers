ALTER TABLE public.portal_announcements ADD COLUMN requires_acknowledgement boolean NOT NULL DEFAULT false;
ALTER TABLE public.portal_announcement_reads ADD COLUMN acknowledged boolean NOT NULL DEFAULT false;
GRANT UPDATE ON public.portal_announcement_reads TO authenticated;
DROP POLICY announcement_reads_insert ON public.portal_announcement_reads;
CREATE POLICY announcement_reads_insert ON public.portal_announcement_reads FOR INSERT TO authenticated WITH CHECK (
 user_id = auth.uid()
 AND EXISTS (SELECT 1 FROM public.portal_announcements a WHERE a.id = portal_announcement_reads.announcement_id AND COALESCE(a.published_at,a.sample_at) = portal_announcement_reads.published_at AND (a.published_at IS NOT NULL OR (a.sample_at IS NOT NULL AND a.sample_user_id = auth.uid())) AND (NOT a.requires_acknowledgement OR portal_announcement_reads.acknowledged))
 AND EXISTS (SELECT 1 FROM public.contractor_portal_users c WHERE c.user_id = auth.uid() AND c.disabled_at IS NULL)
);
CREATE POLICY announcement_reads_update ON public.portal_announcement_reads FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (
 user_id = auth.uid()
 AND EXISTS (SELECT 1 FROM public.portal_announcements a WHERE a.id = portal_announcement_reads.announcement_id AND COALESCE(a.published_at,a.sample_at) = portal_announcement_reads.published_at AND (a.published_at IS NOT NULL OR (a.sample_at IS NOT NULL AND a.sample_user_id = auth.uid())) AND (NOT a.requires_acknowledgement OR portal_announcement_reads.acknowledged))
 AND EXISTS (SELECT 1 FROM public.contractor_portal_users c WHERE c.user_id = auth.uid() AND c.disabled_at IS NULL)
);