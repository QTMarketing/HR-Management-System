-- Phase 2: breaks as first-class rows tied to a work punch (`time_entries`).
-- Paid vs unpaid drives rollup; at most one open break per punch.

create table if not exists public.time_entry_breaks (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  is_paid boolean not null default false,
  created_at timestamptz not null default now(),
  constraint time_entry_breaks_end_after_start check (ended_at is null or ended_at >= started_at)
);

comment on table public.time_entry_breaks is
  'Break intervals during an open or closed work punch; unpaid breaks subtract from paid work time in rollups.';
comment on column public.time_entry_breaks.is_paid is
  'When true, break minutes count as paid; when false, they are unpaid (typical meal).';

create unique index if not exists time_entry_breaks_one_open_per_entry
  on public.time_entry_breaks (time_entry_id)
  where ended_at is null;

create index if not exists time_entry_breaks_entry_started_idx
  on public.time_entry_breaks (time_entry_id, started_at);

alter table public.time_entry_breaks enable row level security;

drop policy if exists "time_entry_breaks_select_auth" on public.time_entry_breaks;
create policy "time_entry_breaks_select_auth"
  on public.time_entry_breaks for select to authenticated using (true);

drop policy if exists "time_entry_breaks_insert_auth" on public.time_entry_breaks;
create policy "time_entry_breaks_insert_auth"
  on public.time_entry_breaks for insert to authenticated with check (true);

drop policy if exists "time_entry_breaks_update_auth" on public.time_entry_breaks;
create policy "time_entry_breaks_update_auth"
  on public.time_entry_breaks for update to authenticated using (true) with check (true);

drop policy if exists "time_entry_breaks_select_anon" on public.time_entry_breaks;
create policy "time_entry_breaks_select_anon"
  on public.time_entry_breaks for select to anon using (true);

drop policy if exists "time_entry_breaks_insert_anon" on public.time_entry_breaks;
create policy "time_entry_breaks_insert_anon"
  on public.time_entry_breaks for insert to anon with check (true);

drop policy if exists "time_entry_breaks_update_anon" on public.time_entry_breaks;
create policy "time_entry_breaks_update_anon"
  on public.time_entry_breaks for update to anon using (true) with check (true);
