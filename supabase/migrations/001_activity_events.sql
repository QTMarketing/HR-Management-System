-- Run this in Supabase: SQL Editor → New query → Paste → Run
-- Or: Dashboard → SQL → paste → Run

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  employee_label text not null,
  action text not null,
  status text not null check (status in ('ok', 'late', 'info')),
  occurred_at timestamptz not null default now()
);

create index if not exists activity_events_occurred_at_idx
  on public.activity_events (occurred_at desc);

alter table public.activity_events enable row level security;

-- Dashboard reads with the anon key (browser/server client)
drop policy if exists "activity_events_select_anon" on public.activity_events;
create policy "activity_events_select_anon"
  on public.activity_events
  for select
  to anon, authenticated
  using (true);

-- Seed demo rows (optional — remove if you prefer empty state)
insert into public.activity_events (employee_label, action, status, occurred_at)
values
  ('Alex P.', 'Clock in', 'ok', now() - interval '2 hours'),
  ('Jamie L.', 'Clock in', 'late', now() - interval '3 hours'),
  ('Riley K.', 'PTO request', 'info', now() - interval '4 hours'),
  ('Sam D.', 'Clock out', 'ok', now() - interval '5 hours');
