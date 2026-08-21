create or replace function public.notify_slack_calendar_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/send-slack-notification',
    headers := '{"Content-Type": "application/json"}'::jsonb,
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
$$;

drop trigger if exists trg_notify_slack_calendar_event on public.calendar_events;
create trigger trg_notify_slack_calendar_event
after insert on public.calendar_events
for each row execute function public.notify_slack_calendar_event();