-- Create table for storing email replies
CREATE TABLE public.email_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  gmail_message_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_replies ENABLE ROW LEVEL SECURITY;

-- Admin can view all replies
CREATE POLICY "Admins can view email replies" 
ON public.email_replies 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for faster lookups
CREATE INDEX idx_email_replies_applicant_id ON public.email_replies(applicant_id);
CREATE INDEX idx_email_replies_gmail_message_id ON public.email_replies(gmail_message_id);