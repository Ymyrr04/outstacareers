-- Create comments table for hiring requests
CREATE TABLE public.hiring_request_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.client_hiring_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hiring_request_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view comments"
ON public.hiring_request_comments
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert comments"
ON public.hiring_request_comments
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update own comments"
ON public.hiring_request_comments
FOR UPDATE
USING (is_admin(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Admins can delete own comments"
ON public.hiring_request_comments
FOR DELETE
USING (is_admin(auth.uid()) AND user_id = auth.uid());

-- Add index for faster lookups
CREATE INDEX idx_hiring_request_comments_request_id ON public.hiring_request_comments(request_id);

-- Add trigger for updated_at
CREATE TRIGGER update_hiring_request_comments_updated_at
BEFORE UPDATE ON public.hiring_request_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.hiring_request_comments;