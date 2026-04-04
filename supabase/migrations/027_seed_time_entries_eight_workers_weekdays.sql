-- Richer demo punches: up to 8 named workers, staggered shift times, weekdays only (no Sat/Sun).
-- Does not modify 023. Safe to re-run: skips employee + clock + calendar days that already have a punch.

insert into public.employees (full_name, email, role, location_id, status)
select 'Sam R.', 'sam.r@example.com', 'Employee', 'a0000000-0000-4000-8000-000000000001'::uuid, 'active'
where not exists (select 1 from public.employees e where e.email = 'sam.r@example.com');

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
  e.location_id,
  tc.id,
  (day_d::timestamp + sh.t_in) at time zone 'utc',
  case
    when sh.t_out > sh.t_in then (day_d::timestamp + sh.t_out) at time zone 'utc'
    else ((day_d + interval '1 day')::date::timestamp + sh.t_out) at time zone 'utc'
  end,
  'closed',
  case
    when sh.t_out > sh.t_in then (day_d::timestamp + sh.t_out) at time zone 'utc'
    else ((day_d + interval '1 day')::date::timestamp + sh.t_out) at time zone 'utc'
  end
from public.employees e
inner join public.time_clocks tc
  on tc.location_id = e.location_id
  and tc.slug = 'main'
  and tc.status = 'active'
inner join (
  values
    ('alex.p@example.com', time '13:00', time '21:00'),
    ('jamie.l@example.com', time '14:30', time '22:30'),
    ('riley.k@example.com', time '12:00', time '20:00'),
    ('morgan.t@example.com', time '15:00', time '23:00'),
    ('casey.r@example.com', time '10:00', time '18:00'),
    ('jordan.m@example.com', time '11:30', time '19:30'),
    ('taylor.s@example.com', time '09:00', time '17:00'),
    ('sam.r@example.com', time '16:00', time '00:00')
) as sh(email, t_in, t_out) on lower(e.email) = lower(sh.email)
cross join lateral (
  select gs::date as day_d
  from generate_series(
    (date_trunc('week', now()::timestamptz))::date - 7,
    (date_trunc('week', now()::timestamptz))::date + 6,
    interval '1 day'
  ) as gs
) days
where e.status = 'active'
  and extract(isodow from day_d) between 1 and 5
  and not exists (
    select 1
    from public.time_entries t
    where t.employee_id = e.id
      and t.time_clock_id = tc.id
      and (t.clock_in_at at time zone 'utc')::date = day_d
  );

-- Flagship trio may already have 023 rows (14:00–22:00 UTC). Align to staggered demo times.
update public.time_entries t
set
  clock_in_at = v.ci,
  clock_out_at = v.co,
  approved_at = v.co
from (
  select
    e.id as eid,
    day_d::date as d,
    (day_d::timestamp + time '13:00') at time zone 'utc' as ci,
    (day_d::timestamp + time '21:00') at time zone 'utc' as co
  from public.employees e
  cross join lateral (
    select gs::date as day_d
    from generate_series(
      (date_trunc('week', now()::timestamptz))::date - 7,
      (date_trunc('week', now()::timestamptz))::date + 6,
      interval '1 day'
    ) as gs
  ) days
  where e.email = 'alex.p@example.com'
    and extract(isodow from day_d) between 1 and 5
) v
where t.employee_id = v.eid
  and (t.clock_in_at at time zone 'utc')::date = v.d
  and t.archived_at is null;

update public.time_entries t
set
  clock_in_at = v.ci,
  clock_out_at = v.co,
  approved_at = v.co
from (
  select
    e.id as eid,
    day_d::date as d,
    (day_d::timestamp + time '14:30') at time zone 'utc' as ci,
    (day_d::timestamp + time '22:30') at time zone 'utc' as co
  from public.employees e
  cross join lateral (
    select gs::date as day_d
    from generate_series(
      (date_trunc('week', now()::timestamptz))::date - 7,
      (date_trunc('week', now()::timestamptz))::date + 6,
      interval '1 day'
    ) as gs
  ) days
  where e.email = 'jamie.l@example.com'
    and extract(isodow from day_d) between 1 and 5
) v
where t.employee_id = v.eid
  and (t.clock_in_at at time zone 'utc')::date = v.d
  and t.archived_at is null;

update public.time_entries t
set
  clock_in_at = v.ci,
  clock_out_at = v.co,
  approved_at = v.co
from (
  select
    e.id as eid,
    day_d::date as d,
    (day_d::timestamp + time '12:00') at time zone 'utc' as ci,
    (day_d::timestamp + time '20:00') at time zone 'utc' as co
  from public.employees e
  cross join lateral (
    select gs::date as day_d
    from generate_series(
      (date_trunc('week', now()::timestamptz))::date - 7,
      (date_trunc('week', now()::timestamptz))::date + 6,
      interval '1 day'
    ) as gs
  ) days
  where e.email = 'riley.k@example.com'
    and extract(isodow from day_d) between 1 and 5
) v
where t.employee_id = v.eid
  and (t.clock_in_at at time zone 'utc')::date = v.d
  and t.archived_at is null;
