alter table public.historical_pl_batches
  add column source text not null default 'upload',
  add column updated_at timestamptz not null default now();