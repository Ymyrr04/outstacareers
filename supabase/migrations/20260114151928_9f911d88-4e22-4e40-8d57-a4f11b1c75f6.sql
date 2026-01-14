-- Add device type column to track where applicants applied from
ALTER TABLE public.applicants_prescreen 
ADD COLUMN device_type text NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.applicants_prescreen.device_type IS 'Device type used during application: mobile or desktop';