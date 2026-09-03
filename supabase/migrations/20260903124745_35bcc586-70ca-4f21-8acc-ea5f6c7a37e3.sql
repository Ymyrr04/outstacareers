with s as (
  select id, started_at, coalesce(completed_at, started_at + interval '90 minutes') as endt
  from public.interview_sessions
  where created_at > '2026-09-02 14:00'
    and not exists (select 1 from public.interview_answers a where a.session_id = interview_sessions.id)
), o as (
  select name, to_timestamp((substring(name from 'interview/(\d{13})-'))::bigint/1000.0) as ts
  from storage.objects
  where bucket_id = 'voice-recordings' and name ~ 'interview/\d{13}-'
), matched as (
  select distinct on (o.name) o.name, o.ts, s.id as session_id
  from o
  join s on o.ts >= s.started_at and o.ts <= s.endt
  order by o.name, s.started_at desc
), ordered as (
  select session_id, name, ts,
         row_number() over (partition by session_id order by ts) as ord
  from matched
), q as (
  insert into public.interview_questions (session_id, section, question_order, question_text, question_context, allow_paste)
  select session_id, 'voice', ord,
         'Voice question ' || ord || ' (recovered — original question text was not saved)',
         'Recovered recording', false
  from ordered
  returning id, session_id, question_order
)
insert into public.interview_answers (session_id, question_id, voice_recording_url, answered_at)
select q.session_id, q.id,
       'https://ohxtavjababtrcrkgndq.supabase.co/storage/v1/object/public/voice-recordings/' || ordered.name,
       ordered.ts
from q
join ordered on ordered.session_id = q.session_id and ordered.ord = q.question_order;