-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to call the edge function daily at midnight UTC
SELECT cron.schedule(
  'process-scheduled-contractors',
  '0 0 * * *', -- Run at midnight UTC every day
  $$
  SELECT
    net.http_post(
      url:=current_setting('app.settings.supabase_url') || '/functions/v1/process-scheduled-contractors',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body:='{}'::jsonb
    ) AS request_id;
  $$
);