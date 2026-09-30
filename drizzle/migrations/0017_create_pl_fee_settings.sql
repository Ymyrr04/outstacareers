create table public.pl_fee_settings (
  singleton boolean primary key default true check (singleton),
  expense_pct numeric not null default 1,
  income_pct numeric not null default 3,
  updated_at timestamptz default now()
);
insert into public.pl_fee_settings default values;

grant select, update on public.pl_fee_settings to authenticated;
grant all on public.pl_fee_settings to service_role;

alter table public.pl_fee_settings enable row level security;

create policy "Admins can read fee settings"
on public.pl_fee_settings for select to authenticated
using (public.is_admin(auth.uid()));

create policy "Admins can update fee settings"
on public.pl_fee_settings for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));