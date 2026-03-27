-- After 004. Adds location_id to dashboard-adjacent tables + Realtime for activity.
-- Run in Supabase SQL Editor in order with other migrations.

-- --- activity_events: scope by location ---
alter table public.activity_events
  add column if not exists location_id uuid references public.locations(id) on delete cascade;

update public.activity_events
set location_id = 'a0000000-0000-4000-8000-000000000001'
where location_id is null;

alter table public.activity_events
  alter column location_id set not null;

create index if not exists activity_events_location_occurred_idx
  on public.activity_events (location_id, occurred_at desc);

-- Extra seed per location (skip if already present)
insert into public.activity_events (employee_label, action, status, occurred_at, location_id)
select v.employee_label, v.action, v.status, now() - v.ago, v.location_id
from (
  values
    ('Morgan T.', 'Clock in', 'ok', interval '1 hour', 'a0000000-0000-4000-8000-000000000002'::uuid),
    ('Casey R.', 'Break start', 'info', interval '90 minutes', 'a0000000-0000-4000-8000-000000000002'::uuid),
    ('Jordan M.', 'Clock in', 'late', interval '2 hours', 'a0000000-0000-4000-8000-000000000003'::uuid)
) as v(employee_label, action, status, ago, location_id)
where not exists (
  select 1 from public.activity_events e
  where e.location_id = v.location_id and e.employee_label = v.employee_label
    and e.action = v.action
);

-- --- staff_updates: scope by location ---
alter table public.staff_updates
  add column if not exists location_id uuid references public.locations(id) on delete cascade;

update public.staff_updates
set location_id = 'a0000000-0000-4000-8000-000000000001'
where location_id is null;

alter table public.staff_updates
  alter column location_id set not null;

create index if not exists staff_updates_location_created_idx
  on public.staff_updates (location_id, created_at desc);

insert into public.staff_updates (employee_label, update_text, status, created_at, location_id)
select v.employee_label, v.update_text, v.status::text, now() - v.ago, v.location_id
from (
  values
    ('Morgan T.', 'Shift swap', 'approved', interval '1 hour', 'a0000000-0000-4000-8000-000000000002'::uuid),
    ('Casey R.', 'Overtime request', 'review', interval '3 hours', 'a0000000-0000-4000-8000-000000000002'::uuid),
    ('Jordan M.', 'Availability update', 'pending', interval '4 hours', 'a0000000-0000-4000-8000-000000000003'::uuid)
) as v(employee_label, update_text, status, ago, location_id)
where not exists (
  select 1 from public.staff_updates s
  where s.location_id = v.location_id and s.employee_label = v.employee_label
    and s.update_text = v.update_text
);

-- --- attendance_trend_points: one row per (location, day) ---
alter table public.attendance_trend_points
  add column if not exists location_id uuid references public.locations(id) on delete cascade;

update public.attendance_trend_points
set location_id = 'a0000000-0000-4000-8000-000000000001'
where location_id is null;

-- Old migration enforced unique(day_index) globally — drop before adding per-location rows.
alter table public.attendance_trend_points
  drop constraint if exists attendance_trend_points_day_index_key;

drop index if exists attendance_trend_points_day_index_key;

delete from public.attendance_trend_points
where location_id in (
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003'
);

insert into public.attendance_trend_points (location_id, day_index, day_label, on_time_pct)
select 'a0000000-0000-4000-8000-000000000002'::uuid, day_index, day_label,
  least(100::numeric, greatest(0::numeric, on_time_pct - 2 + (day_index % 3)))
from public.attendance_trend_points
where location_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.attendance_trend_points (location_id, day_index, day_label, on_time_pct)
select 'a0000000-0000-4000-8000-000000000003'::uuid, day_index, day_label,
  least(100::numeric, greatest(0::numeric, on_time_pct - 4 + (day_index % 2)))
from public.attendance_trend_points
where location_id = 'a0000000-0000-4000-8000-000000000001';

alter table public.attendance_trend_points
  alter column location_id set not null;

create unique index if not exists attendance_trend_points_location_day_uidx
  on public.attendance_trend_points (location_id, day_index);

-- --- Realtime: postgres changes for activity feed ---
do $body$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_events'
  ) then
    execute 'alter publication supabase_realtime add table public.activity_events';
  end if;
end $body$;

alter table public.activity_events replica identity full;
