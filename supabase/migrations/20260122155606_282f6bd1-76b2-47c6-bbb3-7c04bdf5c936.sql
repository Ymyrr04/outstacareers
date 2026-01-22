-- Create table for admin tab permissions
CREATE TABLE public.admin_tab_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tab_id TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tab_id)
);

-- Enable RLS
ALTER TABLE public.admin_tab_permissions ENABLE ROW LEVEL SECURITY;

-- Policies: Only super_admins can manage permissions, admins can view their own
CREATE POLICY "Admins can view own permissions"
  ON public.admin_tab_permissions
  FOR SELECT
  USING (auth.uid() = user_id OR is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert permissions"
  ON public.admin_tab_permissions
  FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update permissions"
  ON public.admin_tab_permissions
  FOR UPDATE
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete permissions"
  ON public.admin_tab_permissions
  FOR DELETE
  USING (is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_admin_tab_permissions_updated_at
  BEFORE UPDATE ON public.admin_tab_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default permissions for all current admins (all tabs visible)
INSERT INTO public.admin_tab_permissions (user_id, tab_id, can_view)
SELECT ur.user_id, tabs.tab_id, true
FROM public.user_roles ur
CROSS JOIN (
  VALUES ('jobs'), ('applicants'), ('recruiter-dash'), ('pipeline'), ('clients'), ('contractors'), ('analytics')
) AS tabs(tab_id)
WHERE ur.role IN ('admin', 'super_admin')
ON CONFLICT (user_id, tab_id) DO NOTHING;