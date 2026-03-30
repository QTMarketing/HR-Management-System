-- Connecteam-style schedule: shift groups, jobs (role rows with colors), assignments, publish state.
-- Run after 011. Backfills existing shifts from migration 006.

-- --- Shift groups (e.g. "Evening shift", "Morning shift") per location ---
create table if not exists public.schedule_shift_groups (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

create index if not exists schedule_shift_groups_location_idx
  on public.schedule_shift_groups (location_id, sort_order);

-- --- Jobs / roles rendered as row headers (color carries to cards) ---
create table if not exists public.schedule_jobs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  color_hex text not null default '#64748b',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

create index if not exists schedule_jobs_location_idx
  on public.schedule_jobs (location_id, sort_order);

-- --- Many assigns per shift (MVP: mirrors single employee_id) ---
create table if not exists public.shift_assignments (
  shift_id uuid not null references public.shifts(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (shift_id, employee_id)
);

create index if not exists shift_assignments_employee_idx
  on public.shift_assignments (employee_id);

-- --- Extend shifts ---
alter table public.shifts add column if not exists shift_group_id uuid references public.schedule_shift_groups(id) on delete set null;
alter table public.shifts add column if not exists job_id uuid references public.schedule_jobs(id) on delete set null;
alter table public.shifts add column if not exists is_published boolean not null default true;
alter table public.shifts add column if not exists slots_total int not null default 2
  check (slots_total >= 1 and slots_total <= 99);
alter table public.shifts add column if not exists notify_badge_count int not null default 1
  check (notify_badge_count >= 0 and notify_badge_count <= 99);

-- Seed groups & jobs for every location
insert into public.schedule_shift_groups (location_id, name, sort_order)
select l.id, v.name, v.ord
from public.locations l
cross join (
  values
    ('Evening shift', 0),
    ('Morning shift', 1),
    ('Ungrouped shifts', 2)
) as v(name, ord)
on conflict (location_id, name) do nothing;

insert into public.schedule_jobs (location_id, name, color_hex, sort_order)
select l.id, v.name, v.color, v.ord
from public.locations l
cross join (
  values
    ('Shift manager', '#7f1d1d', 0),
    ('Server', '#16a34a', 1),
    ('Bartender', '#2563eb', 2)
) as v(name, color, ord)
on conflict (location_id, name) do nothing;

-- Backfill shift_group_id: default Evening shift
update public.shifts s
set shift_group_id = g.id
from public.schedule_shift_groups g
where s.shift_group_id is null
  and g.location_id = s.location_id
  and g.name = 'Evening shift';

-- Backfill job_id from employee role (deterministic)
update public.shifts s
set job_id = j.id
from public.schedule_jobs j,
  public.employees e
where s.job_id is null
  and e.id = s.employee_id
  and j.location_id = s.location_id
  and j.name = case
    when lower(coalesce(e.role, '')) like '%manager%' then 'Shift manager'
    when lower(coalesce(e.role, '')) like '%lead%' then 'Shift manager'
    when abs(hashtext(s.id::text)) % 2 = 0 then 'Server'
    else 'Bartender'
  end;

insert into public.shift_assignments (shift_id, employee_id)
select s.id, s.employee_id
from public.shifts s
on conflict (shift_id, employee_id) do nothing;

-- Demo: a few unpublished shifts (Publish button count) + Connecteam-style afternoon times
update public.shifts s
set
  is_published = false,
  shift_start = date_trunc('day', s.shift_start) + interval '13 hours',
  shift_end = date_trunc('day', s.shift_end) + interval '19 hours',
  slots_total = 2,
  notify_badge_count = 1
from (
  select id from public.shifts order by shift_start asc limit 3
) u
where s.id = u.id;

alter table public.schedule_shift_groups enable row level security;
alter table public.schedule_jobs enable row level security;
alter table public.shift_assignments enable row level security;

-- --- RLS (dev parity: authenticated + anon, full CRUD) ---
drop policy if exists "schedule_shift_groups_select_auth" on public.schedule_shift_groups;
drop policy if exists "schedule_shift_groups_all_auth" on public.schedule_shift_groups;
drop policy if exists "schedule_shift_groups_select_anon" on public.schedule_shift_groups;
drop policy if exists "schedule_shift_groups_all_anon" on public.schedule_shift_groups;
create policy "schedule_shift_groups_all_auth"
  on public.schedule_shift_groups for all to authenticated using (true) with check (true);
create policy "schedule_shift_groups_all_anon"
  on public.schedule_shift_groups for all to anon using (true) with check (true);

drop policy if exists "schedule_jobs_select_auth" on public.schedule_jobs;
drop policy if exists "schedule_jobs_all_auth" on public.schedule_jobs;
drop policy if exists "schedule_jobs_select_anon" on public.schedule_jobs;
drop policy if exists "schedule_jobs_all_anon" on public.schedule_jobs;
create policy "schedule_jobs_all_auth"
  on public.schedule_jobs for all to authenticated using (true) with check (true);
create policy "schedule_jobs_all_anon"
  on public.schedule_jobs for all to anon using (true) with check (true);

drop policy if exists "shift_assignments_select_auth" on public.shift_assignments;
drop policy if exists "shift_assignments_all_auth" on public.shift_assignments;
drop policy if exists "shift_assignments_select_anon" on public.shift_assignments;
drop policy if exists "shift_assignments_all_anon" on public.shift_assignments;
create policy "shift_assignments_all_auth"
  on public.shift_assignments for all to authenticated using (true) with check (true);
create policy "shift_assignments_all_anon"
  on public.shift_assignments for all to anon using (true) with check (true);

drop policy if exists "shifts_insert_auth" on public.shifts;
create policy "shifts_insert_auth"
  on public.shifts for insert to authenticated with check (true);
drop policy if exists "shifts_update_auth" on public.shifts;
create policy "shifts_update_auth"
  on public.shifts for update to authenticated using (true) with check (true);
drop policy if exists "shifts_delete_auth" on public.shifts;
create policy "shifts_delete_auth"
  on public.shifts for delete to authenticated using (true);
drop policy if exists "shifts_insert_anon" on public.shifts;
create policy "shifts_insert_anon"
  on public.shifts for insert to anon with check (true);
drop policy if exists "shifts_update_anon" on public.shifts;
create policy "shifts_update_anon"
  on public.shifts for update to anon using (true) with check (true);
drop policy if exists "shifts_delete_anon" on public.shifts;
create policy "shifts_delete_anon"
  on public.shifts for delete to anon using (true);
