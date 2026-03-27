-- Run in Supabase SQL Editor (after 001_activity_events.sql)
-- Attendance chart + Recent staff updates — read via anon for dashboard dev

create table if not exists public.attendance_trend_points (
  id serial primary key,
  day_index smallint not null unique check (day_index >= 0 and day_index <= 6),
  day_label text not null,
  on_time_pct numeric(5,2) not null check (on_time_pct >= 0 and on_time_pct <= 100)
);

alter table public.attendance_trend_points enable row level security;

drop policy if exists "attendance_trend_select_anon" on public.attendance_trend_points;
create policy "attendance_trend_select_anon"
  on public.attendance_trend_points
  for select
  to anon, authenticated
  using (true);

insert into public.attendance_trend_points (day_index, day_label, on_time_pct)
values
  (0, 'M', 88),
  (1, 'T', 92),
  (2, 'W', 85),
  (3, 'T', 94),
  (4, 'F', 90),
  (5, 'S', 78),
  (6, 'S', 82)
on conflict (day_index) do update set
  day_label = excluded.day_label,
  on_time_pct = excluded.on_time_pct;

create table if not exists public.staff_updates (
  id uuid primary key default gen_random_uuid(),
  employee_label text not null,
  update_text text not null,
  status text not null check (status in ('approved', 'review', 'pending')),
  created_at timestamptz not null default now()
);

create index if not exists staff_updates_created_at_idx
  on public.staff_updates (created_at desc);

alter table public.staff_updates enable row level security;

drop policy if exists "staff_updates_select_anon" on public.staff_updates;
create policy "staff_updates_select_anon"
  on public.staff_updates
  for select
  to anon, authenticated
  using (true);

insert into public.staff_updates (employee_label, update_text, status, created_at)
values
  ('Alex P.', 'Schedule change', 'approved', now() - interval '2 hours'),
  ('Jamie L.', 'Missed punch', 'review', now() - interval '3 hours'),
  ('Riley K.', 'PTO request', 'pending', now() - interval '5 hours');
