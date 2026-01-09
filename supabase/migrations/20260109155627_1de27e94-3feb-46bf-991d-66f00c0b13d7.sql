-- Add a name column to email_templates for independent template names
ALTER TABLE public.email_templates 
ADD COLUMN name text;

-- Update existing templates: set name to subject for custom templates, or to a readable version of status_trigger for standard templates
UPDATE public.email_templates 
SET name = subject 
WHERE status_trigger LIKE 'custom_%';

UPDATE public.email_templates 
SET name = CASE status_trigger
  WHEN 'application_received' THEN 'Application Received'
  WHEN 'for_interview' THEN 'For Interview'
  WHEN 'siv' THEN 'SIV'
  WHEN 'client_interview' THEN 'Client Interview'
  WHEN 'hired' THEN 'Hired'
  WHEN 'bench' THEN 'Bench'
  WHEN 'reject' THEN 'Reject'
  WHEN 'check_availability' THEN 'Check Availability'
  WHEN 'reprofiling' THEN 'Reprofiling'
  ELSE status_trigger
END
WHERE status_trigger NOT LIKE 'custom_%';