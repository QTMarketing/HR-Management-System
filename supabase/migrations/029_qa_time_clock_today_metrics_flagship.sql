-- QA demo: populate Today KPIs + Schedule column for Downtown Flagship main clock.
-- Assumes DB session timezone is UTC (typical Supabase) so “today” matches Vercel Node (TZ=UTC).
-- Deletes only UTC-today shifts + time entries for four seed emails at flagship / main clock, then re-seeds.
-- Do not run against production if those users have real punches today.

with flagship as (
  select 'a0000000-0000-4000-8000-000000000001'::uuid as id
)
delete from public.shifts s
where s.location_id = (select id from flagship)
  and (s.shift_start at time zone 'utc')::date = ((now() at time zone 'utc')::date)
  and s.employee_id in (
    select e.id
    from public.employees e
    where e.email in (
      'alex.p@example.com',
      'jamie.l@example.com',
      'riley.k@example.com',
      'sam.r@example.com'
    )
  );

with main_clock as (
  select tc.id as clock_id, tc.location_id
  from public.time_clocks tc
  where tc.location_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    and tc.slug = 'main'
    and tc.status = 'active'
  limit 1
)
delete from public.time_entries t
where t.time_clock_id = (select clock_id from main_clock)
  and (t.clock_in_at at time zone 'utc')::date = ((now() at time zone 'utc')::date)
  and t.employee_id in (
    select e.id
    from public.employees e
    where e.email in (
      'alex.p@example.com',
      'jamie.l@example.com',
      'riley.k@example.com',
      'sam.r@example.com'
    )
  );

-- d0 = start of UTC day (timestamptz)
insert into public.shifts (employee_id, location_id, shift_start, shift_end, notes)
select
  e.id,
  f.id,
  d.d0 + interval '14 hours',
  d.d0 + interval '22 hours',
  'QA: opening shift'
from public.employees e
cross join (select 'a0000000-0000-4000-8000-000000000001'::uuid as id) f
cross join (select date_trunc('day', now()) as d0) d
where e.email in ('alex.p@example.com', 'jamie.l@example.com', 'riley.k@example.com')
  and e.location_id = f.id
  and e.status = 'active';

insert into public.shifts (employee_id, location_id, shift_start, shift_end, notes)
select
  e.id,
  f.id,
  d.d0 + interval '15 hours',
  d.d0 + interval '23 hours',
  'QA: closing shift'
from public.employees e
cross join (select 'a0000000-0000-4000-8000-000000000001'::uuid as id) f
cross join (select date_trunc('day', now()) as d0) d
where e.email = 'sam.r@example.com'
  and e.location_id = f.id
  and e.status = 'active';

-- Jamie: late in + late out (running late). Alex: late in, on-time out. Riley + Sam: open (clocked in now).
insert into public.time_entries (
  employee_id,
  location_id,
  time_clock_id,
  clock_in_at,
  clock_out_at,
  status,
  approved_at
)
select
  e.id,
  mc.location_id,
  mc.clock_id,
  d.d0 + interval '14 hours 25 minutes',
  d.d0 + interval '23 hours 30 minutes',
  'closed',
  d.d0 + interval '23 hours 30 minutes'
from public.employees e
cross join (
  select tc.id as clock_id, tc.location_id
  from public.time_clocks tc
  where tc.location_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    and tc.slug = 'main'
    and tc.status = 'active'
  limit 1
) mc
cross join (select date_trunc('day', now()) as d0) d
where e.email = 'jamie.l@example.com'
  and e.status = 'active';

insert into public.time_entries (
  employee_id,
  location_id,
  time_clock_id,
  clock_in_at,
  clock_out_at,
  status,
  approved_at
)
select
  e.id,
  mc.location_id,
  mc.clock_id,
  d.d0 + interval '14 hours 3 minutes',
  d.d0 + interval '21 hours',
  'closed',
  d.d0 + interval '21 hours'
from public.employees e
cross join (
  select tc.id as clock_id, tc.location_id
  from public.time_clocks tc
  where tc.location_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    and tc.slug = 'main'
    and tc.status = 'active'
  limit 1
) mc
cross join (select date_trunc('day', now()) as d0) d
where e.email = 'alex.p@example.com'
  and e.status = 'active';

insert into public.time_entries (
  employee_id,
  location_id,
  time_clock_id,
  clock_in_at,
  clock_out_at,
  status,
  approved_at
)
select
  e.id,
  mc.location_id,
  mc.clock_id,
  d.d0 + interval '14 hours 20 minutes',
  null,
  'open',
  null
from public.employees e
cross join (
  select tc.id as clock_id, tc.location_id
  from public.time_clocks tc
  where tc.location_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    and tc.slug = 'main'
    and tc.status = 'active'
  limit 1
) mc
cross join (select date_trunc('day', now()) as d0) d
where e.email = 'riley.k@example.com'
  and e.status = 'active';

insert into public.time_entries (
  employee_id,
  location_id,
  time_clock_id,
  clock_in_at,
  clock_out_at,
  status,
  approved_at
)
select
  e.id,
  mc.location_id,
  mc.clock_id,
  d.d0 + interval '15 hours' + interval '45 seconds',
  null,
  'open',
  null
from public.employees e
cross join (
  select tc.id as clock_id, tc.location_id
  from public.time_clocks tc
  where tc.location_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    and tc.slug = 'main'
    and tc.status = 'active'
  limit 1
) mc
cross join (select date_trunc('day', now()) as d0) d
where e.email = 'sam.r@example.com'
  and e.status = 'active';
