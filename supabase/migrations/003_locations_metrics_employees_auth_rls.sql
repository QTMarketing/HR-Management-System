-- Run in Supabase SQL Editor after 001 + 002.
-- Adds locations, dashboard metrics, employees; restricts dashboard reads to authenticated users.

-- --- Locations ---
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0
);

insert into public.locations (id, name, slug, sort_order)
values
  ('a0000000-0000-4000-8000-000000000001', 'Downtown Flagship', 'downtown-flagship', 1),
  ('a0000000-0000-4000-8000-000000000002', 'Store LP', 'store-lp', 2),
  ('a0000000-0000-4000-8000-000000000003', 'Store 18', 'store-18', 3)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  sort_order = excluded.sort_order;

alter table public.locations enable row level security;

drop policy if exists "locations_select_authenticated" on public.locations;
create policy "locations_select_authenticated"
  on public.locations for select to authenticated using (true);

-- --- KPI + operations snapshot (one row per location) ---
create table if not exists public.dashboard_location_metrics (
  location_id uuid primary key references public.locations(id) on delete cascade,
  total_employees int not null default 0,
  active_now int not null default 0,
  late_arrivals int not null default 0,
  avg_weekly_hours numeric(5,2) not null default 0,
  active_now_trend_text text,
  late_arrivals_trend_text text,
  scheduled_today int not null default 0,
  late_clock_ins int not null default 0,
  clocked_in_now int not null default 0,
  total_attendance_pct numeric(5,2) not null default 0,
  late_clock_outs int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.dashboard_location_metrics (
  location_id,
  total_employees,
  active_now,
  late_arrivals,
  avg_weekly_hours,
  active_now_trend_text,
  late_arrivals_trend_text,
  scheduled_today,
  late_clock_ins,
  clocked_in_now,
  total_attendance_pct,
  late_clock_outs
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    128,
    28,
    3,
    32.4,
    '+4% vs yesterday',
    'Needs attention',
    42,
    3,
    28,
    94.0,
    1
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    45,
    12,
    1,
    31.0,
    '—',
    '—',
    20,
    0,
    12,
    91.0,
    0
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    38,
    9,
    2,
    33.1,
    '—',
    '—',
    18,
    1,
    9,
    89.0,
    0
  )
on conflict (location_id) do update set
  total_employees = excluded.total_employees,
  active_now = excluded.active_now,
  late_arrivals = excluded.late_arrivals,
  avg_weekly_hours = excluded.avg_weekly_hours,
  active_now_trend_text = excluded.active_now_trend_text,
  late_arrivals_trend_text = excluded.late_arrivals_trend_text,
  scheduled_today = excluded.scheduled_today,
  late_clock_ins = excluded.late_clock_ins,
  clocked_in_now = excluded.clocked_in_now,
  total_attendance_pct = excluded.total_attendance_pct,
  late_clock_outs = excluded.late_clock_outs,
  updated_at = now();

alter table public.dashboard_location_metrics enable row level security;

drop policy if exists "dashboard_metrics_select_auth" on public.dashboard_location_metrics;
create policy "dashboard_metrics_select_auth"
  on public.dashboard_location_metrics for select to authenticated using (true);

-- --- Employees (Users module seed) ---
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  role text not null default 'Employee',
  location_id uuid references public.locations(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index if not exists employees_location_id_idx on public.employees (location_id);

insert into public.employees (full_name, email, role, location_id, status)
select v.full_name, v.email, v.role, v.location_id, v.status
from (
  values
    ('Alex P.', 'alex.p@example.com', 'Shift Lead', 'a0000000-0000-4000-8000-000000000001'::uuid, 'active'),
    ('Jamie L.', 'jamie.l@example.com', 'Employee', 'a0000000-0000-4000-8000-000000000001'::uuid, 'active'),
    ('Riley K.', 'riley.k@example.com', 'Store Manager', 'a0000000-0000-4000-8000-000000000001'::uuid, 'active')
) as v(full_name, email, role, location_id, status)
where not exists (
  select 1 from public.employees e where e.email = v.email
);

alter table public.employees enable row level security;

drop policy if exists "employees_select_auth" on public.employees;
create policy "employees_select_auth"
  on public.employees for select to authenticated using (true);

-- --- Tighten earlier tables: authenticated only (anon can no longer read dashboard data) ---
drop policy if exists "activity_events_select_anon" on public.activity_events;
drop policy if exists "activity_events_select_auth" on public.activity_events;
create policy "activity_events_select_auth"
  on public.activity_events for select to authenticated using (true);

drop policy if exists "attendance_trend_select_anon" on public.attendance_trend_points;
drop policy if exists "attendance_trend_select_auth" on public.attendance_trend_points;
create policy "attendance_trend_select_auth"
  on public.attendance_trend_points for select to authenticated using (true);

drop policy if exists "staff_updates_select_anon" on public.staff_updates;
drop policy if exists "staff_updates_select_auth" on public.staff_updates;
create policy "staff_updates_select_auth"
  on public.staff_updates for select to authenticated using (true);
