-- Today tab: one row per employee = their most recent punch on this clock (not every historical punch).

create or replace function public.time_entries_latest_per_employee_for_clock(
  p_time_clock_id uuid,
  p_location_id uuid
)
returns setof public.time_entries
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (t.employee_id) t.*
  from public.time_entries t
  where t.time_clock_id = p_time_clock_id
    and t.location_id = p_location_id
    and t.archived_at is null
  order by t.employee_id, t.clock_in_at desc;
$$;

comment on function public.time_entries_latest_per_employee_for_clock(uuid, uuid) is
  'Latest non-archived punch per employee for a clock (used by Time Clock Today table).';
