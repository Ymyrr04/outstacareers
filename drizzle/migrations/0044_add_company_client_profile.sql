ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_profile text;
COMMENT ON COLUMN public.clients.client_profile IS 'Company summary description shown in the Client Profile tab';
COMMENT ON COLUMN public.client_contacts.client_profile IS 'DEPRECATED: unused; client profile belongs to public.clients.client_profile';