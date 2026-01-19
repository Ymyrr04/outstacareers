-- Add UPDATE policy for admins on email_replies table
CREATE POLICY "Admins can update email replies" 
ON public.email_replies 
FOR UPDATE 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));