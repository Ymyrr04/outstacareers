-- Create deleted_clients archive table
CREATE TABLE public.deleted_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  address TEXT,
  notes TEXT,
  leads_from TEXT,
  company_links TEXT,
  yearly_increase BOOLEAN DEFAULT false,
  contractor_count INTEGER DEFAULT 0,
  is_hiring BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_by UUID
);

-- Enable RLS
ALTER TABLE public.deleted_clients ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view deleted clients" 
  ON public.deleted_clients FOR SELECT 
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert deleted clients" 
  ON public.deleted_clients FOR INSERT 
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can restore (delete from trash)" 
  ON public.deleted_clients FOR DELETE 
  USING (is_admin(auth.uid()));