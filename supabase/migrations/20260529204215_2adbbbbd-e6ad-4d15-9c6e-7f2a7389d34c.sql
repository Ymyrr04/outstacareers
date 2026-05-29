CREATE POLICY "Client portal can delete own contractor timesheets"
ON public.contractor_timesheets
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.contractor_assignments ca
    WHERE ca.id = contractor_timesheets.contractor_assignment_id
      AND ca.client_id = public.get_my_client_id()
  )
);