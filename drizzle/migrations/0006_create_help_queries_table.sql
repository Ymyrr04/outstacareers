create table public.help_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  matched boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, insert on public.help_queries to authenticated;
grant all on public.help_queries to service_role;

alter table public.help_queries enable row level security;

create policy "Authenticated users can insert help queries"
on public.help_queries for insert to authenticated
with check (true);

create policy "Authenticated users can read help queries"
on public.help_queries for select to authenticated
using (true);