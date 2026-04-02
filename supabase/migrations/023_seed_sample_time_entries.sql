-- Sample closed punches for flagship seed employees (003) on each store's main clock.
-- Fills the previous ISO week + current ISO week (Mon–Sun × 2), weekdays only.
-- Skips employee + clock + calendar days that already have a punch (safe to re-run).

insert into public.time_entries (employee_id, location_id, time_clock_id, clock_in_at, clock_out_at, status)
select
  e.id,
  e.location_id,
  tc.id,
  (day_d::timestamp + time '14:00') at time zone 'utc',
  (day_d::timestamp + time '22:00') at time zone 'utc',
  'closed'
from public.employees e
inner join public.time_clocks tc
  on tc.location_id = e.location_id
  and tc.slug = 'main'
  and tc.status = 'active'
cross join lateral (
  select gs::date as day_d
  from generate_series(
    (date_trunc('week', now()::timestamptz))::date - 7,
    (date_trunc('week', now()::timestamptz))::date + 6,
    interval '1 day'
  ) as gs
) days
where e.status = 'active'
  and e.email in (
    'alex.p@example.com',
    'jamie.l@example.com',
    'riley.k@example.com'
  )
  and extract(isodow from day_d) between 1 and 5
  and not exists (
    select 1
    from public.time_entries t
    where t.employee_id = e.id
      and t.time_clock_id = tc.id
      and (t.clock_in_at at time zone 'utc')::date = day_d
  );
