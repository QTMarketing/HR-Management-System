-- Optional demo: one open punch so “Clocked in now” and the active list are non-empty in dev.
-- Skips if this employee already has an open punch on the main clock.

insert into public.time_entries (employee_id, location_id, time_clock_id, clock_in_at, clock_out_at, status)
select
  e.id,
  e.location_id,
  tc.id,
  now() - interval '2 hours 15 minutes',
  null,
  'open'
from public.employees e
inner join public.time_clocks tc
  on tc.location_id = e.location_id
  and tc.slug = 'main'
  and tc.status = 'active'
where e.email = 'jamie.l@example.com'
  and e.status = 'active'
  and not exists (
    select 1
    from public.time_entries t
    where t.employee_id = e.id
      and t.time_clock_id = tc.id
      and t.archived_at is null
      and t.clock_out_at is null
  );
