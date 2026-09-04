CREATE TABLE public.auto_reply_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains','equals','starts_with')),
  subject_keyword TEXT NOT NULL,
  body_html TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_reply_rules TO authenticated;
GRANT ALL ON public.auto_reply_rules TO service_role;
ALTER TABLE public.auto_reply_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage auto reply rules" ON public.auto_reply_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER update_auto_reply_rules_updated_at BEFORE UPDATE ON public.auto_reply_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auto_reply_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID NOT NULL REFERENCES public.auto_reply_rules(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  message_id TEXT,
  thread_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_id, sender_email)
);
GRANT SELECT ON public.auto_reply_logs TO authenticated;
GRANT ALL ON public.auto_reply_logs TO service_role;
ALTER TABLE public.auto_reply_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view auto reply logs" ON public.auto_reply_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));