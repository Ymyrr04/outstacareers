-- Create table for custom pipeline stages
CREATE TABLE public.pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  emoji TEXT,
  stage_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view pipeline stages" 
ON public.pipeline_stages FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert pipeline stages" 
ON public.pipeline_stages FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update pipeline stages" 
ON public.pipeline_stages FOR UPDATE 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete non-system pipeline stages" 
ON public.pipeline_stages FOR DELETE 
USING (is_admin(auth.uid()) AND is_system = false);

-- Insert default system stages
INSERT INTO public.pipeline_stages (name, slug, emoji, stage_order, is_system) VALUES
  ('Backlog', 'backlog', NULL, 0, true),
  ('Sourcing & Screening', 'sourcing', '⏳', 1, true),
  ('Pitch', 'pitch', '🚀', 2, true),
  ('Scheduled Interview', 'scheduled_interview', '🤝', 3, true),
  ('Closed', 'closed', NULL, 4, true);

-- Add index for ordering
CREATE INDEX idx_pipeline_stages_order ON public.pipeline_stages(stage_order);

-- Add trigger for updated_at
CREATE TRIGGER update_pipeline_stages_updated_at
BEFORE UPDATE ON public.pipeline_stages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for pipeline stages
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;