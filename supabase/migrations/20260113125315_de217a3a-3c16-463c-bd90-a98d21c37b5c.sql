-- Grant SELECT permission on user_roles to anon so security definer functions can work
-- This only grants table-level permission; RLS still controls row access
GRANT SELECT ON public.user_roles TO anon;

-- Also add a policy for the has_role function to work for anon users
-- The function itself is security definer, so we need a policy that allows the function owner to read
CREATE POLICY "Allow function access to user_roles"
  ON public.user_roles
  FOR SELECT
  TO anon
  USING (false); -- Anon users cannot directly read rows, but the security definer function can