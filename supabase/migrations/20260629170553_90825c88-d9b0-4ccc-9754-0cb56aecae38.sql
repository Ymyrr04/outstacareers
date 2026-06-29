CREATE POLICY "Client portal can view leave for their contractors"
ON public.contractor_leave_applications
FOR SELECT
USING (
  contractor_assignment_id IN (
    SELECT id FROM public.contractor_assignments
    WHERE client_id = public.get_my_client_id()
  )
);