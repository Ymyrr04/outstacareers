CREATE OR REPLACE FUNCTION public.notify_slack_calendar_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  perform net.http_post(
    url := 'https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/send-slack-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oeHRhdmphYmFidHJjcmtnbmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTQ1NTksImV4cCI6MjA4MTk5MDU1OX0.VQ3ofdnujl4tsh3JZ9c5xAarVIgNj7RdIWkrh_i494A',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oeHRhdmphYmFidHJjcmtnbmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTQ1NTksImV4cCI6MjA4MTk5MDU1OX0.VQ3ofdnujl4tsh3JZ9c5xAarVIgNj7RdIWkrh_i494A'
    ),
    body := jsonb_build_object(
      'type', 'calendar_activity',
      'activityTitle', new.title,
      'eventType', new.event_type,
      'eventDate', to_char(new.event_date, 'YYYY-MM-DD'),
      'startTime', new.start_time,
      'endTime', new.end_time,
      'createdById', new.created_by,
      'assignedToIds', coalesce(to_jsonb(new.assigned_to), '[]'::jsonb),
      'activityDescription', new.description,
      'pipelineLinkName', coalesce(new.pipeline_link->>'name', null)
    )
  );
  return new;
end;
$function$;