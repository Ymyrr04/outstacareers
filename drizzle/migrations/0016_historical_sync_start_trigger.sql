create or replace function enforce_sync_start() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from historical_pl_batches b
    where b.id = new.batch_id and b.source = 'timesheet_sync'
  ) and (new.week_start is null or new.week_start < date '2026-09-21') then
    raise exception 'Synced weeks cannot start before 2026-09-21';
  end if;
  return new;
end $$;

create trigger historical_sync_start
before insert or update on historical_pl_rows
for each row execute function enforce_sync_start();