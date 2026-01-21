-- Create table for comment reactions
CREATE TABLE public.hiring_request_comment_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.hiring_request_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.hiring_request_comment_reactions ENABLE ROW LEVEL SECURITY;

-- Admins can view all reactions
CREATE POLICY "Admins can view reactions"
ON public.hiring_request_comment_reactions
FOR SELECT
USING (is_admin(auth.uid()));

-- Admins can add reactions
CREATE POLICY "Admins can add reactions"
ON public.hiring_request_comment_reactions
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Admins can remove own reactions
CREATE POLICY "Admins can remove own reactions"
ON public.hiring_request_comment_reactions
FOR DELETE
USING (is_admin(auth.uid()) AND user_id = auth.uid());