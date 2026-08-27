CREATE TABLE public.contractor_legal_doc_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_assignment_id UUID NOT NULL REFERENCES public.contractor_assignments(id) ON DELETE CASCADE,
  doc_types TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.contractor_legal_doc_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_legal_doc_requests TO authenticated;
GRANT ALL ON public.contractor_legal_doc_requests TO service_role;

ALTER TABLE public.contractor_legal_doc_requests ENABLE ROW LEVEL SECURITY;

-- Contractors (portal login is anon; identified via contractor_assignment_id) can create and view their own requests
CREATE POLICY "Contractors can create their own legal doc requests"
ON public.contractor_legal_doc_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_my_contractor_assignment(contractor_assignment_id));

CREATE POLICY "Contractors can view their own legal doc requests"
ON public.contractor_legal_doc_requests
FOR SELECT
TO anon, authenticated
USING (public.is_my_contractor_assignment(contractor_assignment_id));

-- Admins can view and manage all requests
CREATE POLICY "Admins can view all legal doc requests"
ON public.contractor_legal_doc_requests
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update legal doc requests"
ON public.contractor_legal_doc_requests
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_contractor_legal_doc_requests_updated_at
BEFORE UPDATE ON public.contractor_legal_doc_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();