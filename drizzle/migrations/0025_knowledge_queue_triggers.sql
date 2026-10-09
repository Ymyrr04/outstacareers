CREATE OR REPLACE FUNCTION public.enqueue_knowledge_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.knowledge_dirty_queue (source_type, source_id, action)
    VALUES (
      TG_ARGV[0],
      CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
      CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END
    )
    ON CONFLICT (source_type, source_id) WHERE processed_at IS NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_knowledge_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER knowledge_enqueue_cv_ins AFTER INSERT ON public.applicants_prescreen
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('cv');
CREATE TRIGGER knowledge_enqueue_cv_upd AFTER UPDATE ON public.applicants_prescreen
  FOR EACH ROW WHEN (NEW.cv_text IS DISTINCT FROM OLD.cv_text) EXECUTE FUNCTION public.enqueue_knowledge_change('cv');
CREATE TRIGGER knowledge_enqueue_cv_del AFTER DELETE ON public.applicants_prescreen
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('cv');

CREATE TRIGGER knowledge_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.applicant_notes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('applicant_note');
CREATE TRIGGER knowledge_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.candidate_additional_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('additional_profile');
CREATE TRIGGER knowledge_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.hiring_request_comments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('hiring_comment');
CREATE TRIGGER knowledge_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.calendar_event_comments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('calendar_comment');

CREATE TRIGGER knowledge_enqueue_ins AFTER INSERT OR DELETE ON public.interview_answers
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('interview_answer');
CREATE TRIGGER knowledge_enqueue_upd AFTER UPDATE OF text_answer ON public.interview_answers
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_change('interview_answer');