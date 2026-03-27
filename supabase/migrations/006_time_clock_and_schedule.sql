-- After 005. Time entries + shift schedule; extends Users seed for stores 2–3.

-- --- More employees (for Store LP & Store 18) ---
insert into public.employees (full_name, email, role, location_id, status)
select v.full_name, v.email, v.role, v.location_id, v.status
from (
  values
    ('Morgan T.', 'morgan.t@example.com', 'Shift Lead', 'a0000000-0000-4000-8000-000000000002'::uuid, 'active'),
    ('Casey R.', 'casey.r@example.com', 'Employee', 'a0000000-0000-4000-8000-000000000002'::uuid, 'active'),
    ('Jordan M.', 'jordan.m@example.com', 'Store Manager', 'a0000000-0000-4000-8000-000000000003'::uuid, 'active'),
    ('Taylor S.', 'taylor.s@example.com', 'Employee', 'a0000000-0000-4000-8000-000000000003'::uuid, 'active')
) as v(full_name, email, role, location_id, status)
where not exists (select 1 from public.employees e where e.email = v.email);

-- --- Time clock: punch pairs ---
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  constraint time_entries_clock_out_after_in check (
    clock_out_at is null or clock_out_at >= clock_in_at
  )
);

create index if not exists time_entries_location_clock_in_idx
  on public.time_entries (location_id, clock_in_at desc);

create index if not exists time_entries_employee_open_idx
  on public.time_entries (employee_id)
  where clock_out_at is null;

alter table public.time_entries enable row level security;

drop policy if exists "time_entries_select_auth" on public.time_entries;
create policy "time_entries_select_auth"
  on public.time_entries for select to authenticated using (true);

drop policy if exists "time_entries_insert_auth" on public.time_entries;
create policy "time_entries_insert_auth"
  on public.time_entries for insert to authenticated with check (true);

drop policy if exists "time_entries_update_auth" on public.time_entries;
create policy "time_entries_update_auth"
  on public.time_entries for update to authenticated using (true) with check (true);

drop policy if exists "time_entries_select_anon" on public.time_entries;
create policy "time_entries_select_anon"
  on public.time_entries for select to anon using (true);

drop policy if exists "time_entries_insert_anon" on public.time_entries;
create policy "time_entries_insert_anon"
  on public.time_entries for insert to anon with check (true);

drop policy if exists "time_entries_update_anon" on public.time_entries;
create policy "time_entries_update_anon"
  on public.time_entries for update to anon using (true) with check (true);

-- --- Schedule: planned shifts ---
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  shift_start timestamptz not null,
  shift_end timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint shifts_end_after_start check (shift_end > shift_start)
);

create index if not exists shifts_location_start_idx
  on public.shifts (location_id, shift_start);

alter table public.shifts enable row level security;

drop policy if exists "shifts_select_auth" on public.shifts;
create policy "shifts_select_auth"
  on public.shifts for select to authenticated using (true);

drop policy if exists "shifts_select_anon" on public.shifts;
create policy "shifts_select_anon"
  on public.shifts for select to anon using (true);

-- --- Seed shifts (five days from today, server TZ) ---
insert into public.shifts (employee_id, location_id, shift_start, shift_end, notes)
select e.id, e.location_id,
  date_trunc('day', now()) + (s.off * interval '1 day') + interval '9 hours',
  date_trunc('day', now()) + (s.off * interval '1 day') + interval '17 hours',
  'Regular shift'
from public.employees e
cross join (values (0), (1), (2), (3), (4)) as s(off)
where e.email in (
  'alex.p@example.com',
  'jamie.l@example.com',
  'morgan.t@example.com',
  'jordan.m@example.com'
)
and not exists (
  select 1 from public.shifts sh
  where sh.employee_id = e.id
    and (sh.shift_start at time zone 'utc')::date =
        (date_trunc('day', now()) + (s.off * interval '1 day'))::date
);

-- --- Optional seed: one closed time entry (demo) ---
insert into public.time_entries (employee_id, location_id, clock_in_at, clock_out_at, status)
select e.id, e.location_id,
  now() - interval '8 hours',
  now() - interval '1 hour',
  'closed'
from public.employees e
where e.email = 'jamie.l@example.com'
  and not exists (
    select 1 from public.time_entries t
    where t.employee_id = e.id and t.clock_in_at > now() - interval '2 days'
  );

-- --- Activity log: allow inserts from app (clock in/out) ---
drop policy if exists "activity_events_insert_auth" on public.activity_events;
create policy "activity_events_insert_auth"
  on public.activity_events for insert to authenticated with check (true);

drop policy if exists "activity_events_insert_anon" on public.activity_events;
create policy "activity_events_insert_anon"
  on public.activity_events for insert to anon with check (true);
