-- Create clients (companies) table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  address TEXT,
  notes TEXT,
  billing_status TEXT DEFAULT 'active' CHECK (billing_status IN ('active', 'pending', 'overdue', 'paused', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client contacts table
CREATE TABLE public.client_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contractor assignments table (links applicants to clients)
CREATE TABLE public.contractor_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  job_title TEXT,
  hourly_rate DECIMAL(10, 2),
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'terminated')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client communication logs
CREATE TABLE public.client_communications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  communication_type TEXT NOT NULL CHECK (communication_type IN ('email', 'call', 'meeting', 'note')),
  subject TEXT,
  content TEXT,
  communication_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_communications ENABLE ROW LEVEL SECURITY;

-- RLS policies for clients
CREATE POLICY "Admins can view clients" ON public.clients FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert clients" ON public.clients FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update clients" ON public.clients FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete clients" ON public.clients FOR DELETE USING (is_admin(auth.uid()));

-- RLS policies for client_contacts
CREATE POLICY "Admins can view client contacts" ON public.client_contacts FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client contacts" ON public.client_contacts FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client contacts" ON public.client_contacts FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client contacts" ON public.client_contacts FOR DELETE USING (is_admin(auth.uid()));

-- RLS policies for contractor_assignments
CREATE POLICY "Admins can view contractor assignments" ON public.contractor_assignments FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert contractor assignments" ON public.contractor_assignments FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update contractor assignments" ON public.contractor_assignments FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete contractor assignments" ON public.contractor_assignments FOR DELETE USING (is_admin(auth.uid()));

-- RLS policies for client_communications
CREATE POLICY "Admins can view client communications" ON public.client_communications FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client communications" ON public.client_communications FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client communications" ON public.client_communications FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client communications" ON public.client_communications FOR DELETE USING (is_admin(auth.uid()));

-- Create indexes for better performance
CREATE INDEX idx_client_contacts_client_id ON public.client_contacts(client_id);
CREATE INDEX idx_contractor_assignments_client_id ON public.contractor_assignments(client_id);
CREATE INDEX idx_contractor_assignments_applicant_id ON public.contractor_assignments(applicant_id);
CREATE INDEX idx_client_communications_client_id ON public.client_communications(client_id);

-- Create trigger for updated_at on clients
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on client_contacts
CREATE TRIGGER update_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on contractor_assignments
CREATE TRIGGER update_contractor_assignments_updated_at
  BEFORE UPDATE ON public.contractor_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();