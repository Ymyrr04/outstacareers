CREATE TABLE public.markbot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  title text,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.markbot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.markbot_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  sources jsonb,
  blocked boolean DEFAULT false,
  log_id uuid,
  rating smallint,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX markbot_messages_conv_created_idx ON public.markbot_messages (conversation_id, created_at);
CREATE INDEX markbot_conversations_admin_idx ON public.markbot_conversations (admin_user_id, updated_at DESC);

GRANT SELECT, DELETE ON public.markbot_conversations TO authenticated;
GRANT SELECT ON public.markbot_messages TO authenticated;
GRANT ALL ON public.markbot_conversations TO service_role;
GRANT ALL ON public.markbot_messages TO service_role;

ALTER TABLE public.markbot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markbot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read own Markbot conversations" ON public.markbot_conversations
  FOR SELECT TO authenticated USING (admin_user_id = auth.uid() AND public.is_admin(auth.uid()));
CREATE POLICY "Admins delete own Markbot conversations" ON public.markbot_conversations
  FOR DELETE TO authenticated USING (admin_user_id = auth.uid() AND public.is_admin(auth.uid()));
CREATE POLICY "Admins read messages of own Markbot conversations" ON public.markbot_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.markbot_conversations c
    WHERE c.id = conversation_id AND c.admin_user_id = auth.uid() AND public.is_admin(auth.uid())));

SELECT cron.schedule('markbot-conversation-retention', '15 7 * * *',
  $$DELETE FROM public.markbot_conversations WHERE updated_at < now() - interval '90 days'$$);