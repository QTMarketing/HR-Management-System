-- Scale seed: 8 additional stores × 10 active employees (80 people) for MVP usability testing.
-- Also seeds main time clocks, dashboard KPI rows, attendance trend rows, and light activity/staff rows.
-- Re-run safe: fixed UUIDs + NOT EXISTS guards.
-- Run after 038.

-- --- Locations (deterministic ids) ---
insert into public.locations (id, name, slug, sort_order, chain_id)
values
  ('b0000000-0000-4000-8000-000000000101', 'Loadtest Store 01', 'loadtest-store-01', 10, 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000102', 'Loadtest Store 02', 'loadtest-store-02', 11, 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000103', 'Loadtest Store 03', 'loadtest-store-03', 12, 'c0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000104', 'Loadtest Store 04', 'loadtest-store-04', 13, 'c0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000105', 'Loadtest Store 05', 'loadtest-store-05', 14, 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000106', 'Loadtest Store 06', 'loadtest-store-06', 15, 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000107', 'Loadtest Store 07', 'loadtest-store-07', 16, 'c0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000108', 'Loadtest Store 08', 'loadtest-store-08', 17, 'c0000000-0000-4000-8000-000000000002')
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  sort_order = excluded.sort_order,
  chain_id = excluded.chain_id;

-- --- Main clock per new store ---
insert into public.time_clocks (location_id, name, slug, status, sort_order)
select l.id, l.name || ' — Main clock', 'main', 'active', 1
from public.locations l
where l.id in (
  'b0000000-0000-4000-8000-000000000101',
  'b0000000-0000-4000-8000-000000000102',
  'b0000000-0000-4000-8000-000000000103',
  'b0000000-0000-4000-8000-000000000104',
  'b0000000-0000-4000-8000-000000000105',
  'b0000000-0000-4000-8000-000000000106',
  'b0000000-0000-4000-8000-000000000107',
  'b0000000-0000-4000-8000-000000000108'
)
on conflict (location_id, slug) do nothing;

-- --- Dashboard KPI snapshot (one row per store); headcount reconciled below ---
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
select v.lid,
  10,
  4 + (v.n % 3),
  (v.n % 2),
  30.5 + (v.n % 4),
  '—',
  case when v.n % 4 = 0 then 'Watch late arrivals' else '—' end,
  6 + (v.n % 4),
  (v.n % 2),
  3 + (v.n % 3),
  88.0 + (v.n % 5),
  (v.n % 2)
from (
  values
    (1, 'b0000000-0000-4000-8000-000000000101'::uuid),
    (2, 'b0000000-0000-4000-8000-000000000102'::uuid),
    (3, 'b0000000-0000-4000-8000-000000000103'::uuid),
    (4, 'b0000000-0000-4000-8000-000000000104'::uuid),
    (5, 'b0000000-0000-4000-8000-000000000105'::uuid),
    (6, 'b0000000-0000-4000-8000-000000000106'::uuid),
    (7, 'b0000000-0000-4000-8000-000000000107'::uuid),
    (8, 'b0000000-0000-4000-8000-000000000108'::uuid)
) as v(n, lid)
on conflict (location_id) do update set
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

-- --- Roster: 10 people per loadtest store (emp 1 = store manager) ---
insert into public.employees (
  full_name,
  first_name,
  last_name,
  email,
  role,
  location_id,
  status
)
select
  nm.fn || ' ' || nm.ln,
  nm.fn,
  nm.ln,
  format('loadtest.s%s.e%s@example.com', lpad(s.sn::text, 2, '0'), lpad(e.n::text, 2, '0')),
  case when e.n = 1 then 'Store Manager' else 'Employee' end,
  s.lid,
  'active'
from (
  values
    (1, 'b0000000-0000-4000-8000-000000000101'::uuid),
    (2, 'b0000000-0000-4000-8000-000000000102'::uuid),
    (3, 'b0000000-0000-4000-8000-000000000103'::uuid),
    (4, 'b0000000-0000-4000-8000-000000000104'::uuid),
    (5, 'b0000000-0000-4000-8000-000000000105'::uuid),
    (6, 'b0000000-0000-4000-8000-000000000106'::uuid),
    (7, 'b0000000-0000-4000-8000-000000000107'::uuid),
    (8, 'b0000000-0000-4000-8000-000000000108'::uuid)
) as s(sn, lid)
cross join generate_series(1, 10) as e(n)
cross join lateral (
  select
    (array['Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Jamie', 'Alex', 'Sam', 'Quinn', 'Blake'])[
      1 + ((s.sn * 3 + e.n) % 10)
    ] as fn,
    (array['Nguyen', 'Reyes', 'Patel', 'Kim', 'Garcia', 'Brown', 'Lee', 'Martinez', 'Singh', 'Cohen'])[
      1 + ((s.sn + e.n * 2) % 10)
    ] as ln
) nm
where not exists (
  select 1
  from public.employees ex
  where ex.email = format('loadtest.s%s.e%s@example.com', lpad(s.sn::text, 2, '0'), lpad(e.n::text, 2, '0'))
);

-- --- Store lead on org chart (first store manager row per loadtest location) ---
update public.locations l
set manager_employee_id = s.mid
from (
  select distinct on (e.location_id) e.location_id, e.id as mid
  from public.employees e
  where e.location_id in (
    'b0000000-0000-4000-8000-000000000101',
    'b0000000-0000-4000-8000-000000000102',
    'b0000000-0000-4000-8000-000000000103',
    'b0000000-0000-4000-8000-000000000104',
    'b0000000-0000-4000-8000-000000000105',
    'b0000000-0000-4000-8000-000000000106',
    'b0000000-0000-4000-8000-000000000107',
    'b0000000-0000-4000-8000-000000000108'
  )
    and lower(trim(e.role)) like '%store%manager%'
  order by e.location_id, e.id asc
) s
where l.id = s.location_id
  and l.manager_employee_id is null;

-- --- Attendance trend (7 days) cloned from flagship pattern, per new store ---
insert into public.attendance_trend_points (location_id, day_index, day_label, on_time_pct)
select loc.new_id,
  p.day_index,
  p.day_label,
  least(
    100::numeric,
    greatest(0::numeric, p.on_time_pct - 1 + ((hashtext(loc.new_id::text) + p.day_index) % 4))
  )
from public.attendance_trend_points p
cross join (
  values
    ('b0000000-0000-4000-8000-000000000101'::uuid),
    ('b0000000-0000-4000-8000-000000000102'::uuid),
    ('b0000000-0000-4000-8000-000000000103'::uuid),
    ('b0000000-0000-4000-8000-000000000104'::uuid),
    ('b0000000-0000-4000-8000-000000000105'::uuid),
    ('b0000000-0000-4000-8000-000000000106'::uuid),
    ('b0000000-0000-4000-8000-000000000107'::uuid),
    ('b0000000-0000-4000-8000-000000000108'::uuid)
) as loc(new_id)
where p.location_id = 'a0000000-0000-4000-8000-000000000001'
  and not exists (
    select 1
    from public.attendance_trend_points x
    where x.location_id = loc.new_id
      and x.day_index = p.day_index
  );

-- --- Light activity + staff rows (so home dashboard lists are not empty for new stores) ---
insert into public.activity_events (employee_label, action, status, occurred_at, location_id)
select v.employee_label, v.action, v.status::text, now() - v.ago, v.location_id
from (
  values
    ('Loadtest — Floor lead', 'Clock in', 'ok', interval '45 minutes', 'b0000000-0000-4000-8000-000000000101'::uuid),
    ('Loadtest — Shift A', 'Break end', 'info', interval '2 hours', 'b0000000-0000-4000-8000-000000000102'::uuid),
    ('Loadtest — Shift B', 'Clock in', 'late', interval '3 hours', 'b0000000-0000-4000-8000-000000000103'::uuid)
) as v(employee_label, action, status, ago, location_id)
where not exists (
  select 1
  from public.activity_events e
  where e.location_id = v.location_id
    and e.employee_label = v.employee_label
    and e.action = v.action
);

insert into public.staff_updates (employee_label, update_text, status, created_at, location_id)
select v.employee_label, v.update_text, v.status::text, now() - v.ago, v.location_id
from (
  values
    ('Loadtest — HR sample', 'Availability updated', 'approved', interval '90 minutes', 'b0000000-0000-4000-8000-000000000101'::uuid),
    ('Loadtest — HR sample', 'Overtime pre-approval', 'review', interval '3 hours', 'b0000000-0000-4000-8000-000000000102'::uuid),
    ('Loadtest — HR sample', 'PTO block request', 'pending', interval '5 hours', 'b0000000-0000-4000-8000-000000000103'::uuid)
) as v(employee_label, update_text, status, ago, location_id)
where not exists (
  select 1
  from public.staff_updates s
  where s.location_id = v.location_id
    and s.employee_label = v.employee_label
    and s.update_text = v.update_text
);

-- --- Ensure every location has a KPI row (so the app never falls back to demo for missing metrics) ---
insert into public.dashboard_location_metrics (location_id)
select l.id
from public.locations l
where not exists (
  select 1 from public.dashboard_location_metrics d where d.location_id = l.id
);

-- --- Single source of truth for headcount on dashboard KPI table (all locations) ---
update public.dashboard_location_metrics d
set
  total_employees = c.cnt,
  updated_at = now()
from (
  select
    l.id as location_id,
    count(e.id) filter (where e.status = 'active')::int as cnt
  from public.locations l
  left join public.employees e on e.location_id = l.id
  group by l.id
) c
where d.location_id = c.location_id;
