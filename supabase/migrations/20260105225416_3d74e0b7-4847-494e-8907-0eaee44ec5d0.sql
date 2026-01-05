-- Interview sessions table to track each applicant's interview
CREATE TABLE public.interview_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Scores (populated after AI assessment)
  experience_score INTEGER CHECK (experience_score >= 0 AND experience_score <= 100),
  technical_score INTEGER CHECK (technical_score >= 0 AND technical_score <= 100),
  communication_score INTEGER CHECK (communication_score >= 0 AND communication_score <= 100),
  situational_score INTEGER CHECK (situational_score >= 0 AND situational_score <= 100),
  personality_score INTEGER CHECK (personality_score >= 0 AND personality_score <= 100),
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- AI assessment
  ai_summary TEXT,
  ai_strengths TEXT[],
  ai_concerns TEXT[],
  ai_assessment_details JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Interview questions table
CREATE TABLE public.interview_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('voice', 'text', 'multiple_choice')),
  question_order INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  question_context TEXT, -- Why this question was generated (for AI transparency)
  
  -- For multiple choice questions
  options JSONB, -- Array of {id, label, value} objects
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Interview answers table
CREATE TABLE public.interview_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  
  -- Different answer types
  voice_recording_url TEXT,
  voice_duration_seconds INTEGER,
  text_answer TEXT,
  selected_option_id TEXT, -- For multiple choice
  
  -- AI assessment of individual answer
  ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
  ai_feedback TEXT,
  
  answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_answers ENABLE ROW LEVEL SECURITY;

-- RLS policies for interview_sessions
CREATE POLICY "Admins can view all interview sessions"
ON public.interview_sessions FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can update interview sessions"
ON public.interview_sessions FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Public can insert interview sessions during application"
ON public.interview_sessions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update own interview sessions"
ON public.interview_sessions FOR UPDATE
USING (true);

-- RLS policies for interview_questions
CREATE POLICY "Admins can view all interview questions"
ON public.interview_questions FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Public can view interview questions"
ON public.interview_questions FOR SELECT
USING (true);

CREATE POLICY "Public can insert interview questions"
ON public.interview_questions FOR INSERT
WITH CHECK (true);

-- RLS policies for interview_answers
CREATE POLICY "Admins can view all interview answers"
ON public.interview_answers FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Public can insert interview answers"
ON public.interview_answers FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can view own interview answers"
ON public.interview_answers FOR SELECT
USING (true);

-- Create indexes for performance
CREATE INDEX idx_interview_sessions_applicant ON public.interview_sessions(applicant_id);
CREATE INDEX idx_interview_sessions_job ON public.interview_sessions(job_id);
CREATE INDEX idx_interview_sessions_status ON public.interview_sessions(status);
CREATE INDEX idx_interview_questions_session ON public.interview_questions(session_id);
CREATE INDEX idx_interview_questions_section ON public.interview_questions(section);
CREATE INDEX idx_interview_answers_session ON public.interview_answers(session_id);
CREATE INDEX idx_interview_answers_question ON public.interview_answers(question_id);

-- Trigger for updated_at
CREATE TRIGGER update_interview_sessions_updated_at
BEFORE UPDATE ON public.interview_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();