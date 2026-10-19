CREATE TABLE public.stage_note_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 stage text NOT NULL,
 content text NOT NULL DEFAULT '' CHECK (length(content) <= 100000),
 questions text[] NOT NULL DEFAULT '{}' CHECK (cardinality(questions) <= 30),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.stage_note_templates TO authenticated;
GRANT ALL ON public.stage_note_templates TO service_role;
ALTER TABLE public.stage_note_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read shared note templates" ON public.stage_note_templates FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins save shared note templates" ON public.stage_note_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Admins delete shared note templates" ON public.stage_note_templates FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX stage_note_templates_stage_idx ON public.stage_note_templates(stage);