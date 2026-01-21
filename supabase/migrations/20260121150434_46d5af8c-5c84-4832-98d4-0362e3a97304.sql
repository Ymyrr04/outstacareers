-- Create client_hiring_requests table for Kanban pipeline tracking
CREATE TABLE public.client_hiring_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'high' CHECK (priority IN ('high', 'low')),
  industry TEXT,
  client_status TEXT NOT NULL DEFAULT 'new' CHECK (client_status IN ('new', 'existing')),
  pipeline_stage TEXT NOT NULL DEFAULT 'backlog' CHECK (pipeline_stage IN ('backlog', 'sourcing', 'pitch', 'scheduled_interview', 'closed')),
  source TEXT,
  start_date DATE,
  target_end_date DATE,
  assigned_admin_id UUID,
  notes TEXT,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_hiring_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can view client hiring requests"
ON public.client_hiring_requests
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert client hiring requests"
ON public.client_hiring_requests
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update client hiring requests"
ON public.client_hiring_requests
FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete client hiring requests"
ON public.client_hiring_requests
FOR DELETE
USING (is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_client_hiring_requests_updated_at
BEFORE UPDATE ON public.client_hiring_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_hiring_requests;