-- Smart groups (Connecteam-style): segments → groups → members, admins, module assignments.
-- Run after 009. Assignments link groups to time clocks and schedule (per location).

-- --- Segments (folder; optional per-location scope, null = all stores in view) ---
create table if not exists public.group_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color_token text not null default 'slate'
    check (color_token in ('slate', 'violet', 'amber', 'blue', 'rose', 'emerald')),
  sort_order int not null default 0,
  location_id uuid references public.locations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists group_segments_location_id_idx on public.group_segments (location_id);

-- --- Groups within a segment ---
create table if not exists public.smart_groups (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.group_segments(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists smart_groups_segment_id_idx on public.smart_groups (segment_id);

-- --- Manual membership (MVP; rule-based smart rules can extend later) ---
create table if not exists public.smart_group_members (
  smart_group_id uuid not null references public.smart_groups(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (smart_group_id, employee_id)
);

create index if not exists smart_group_members_employee_id_idx on public.smart_group_members (employee_id);

-- --- Group administrators (Connecteam "Administrated by") ---
create table if not exists public.smart_group_admins (
  smart_group_id uuid not null references public.smart_groups(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (smart_group_id, employee_id)
);

-- --- Module assignments: Time Clock or Schedule at a location ---
create table if not exists public.smart_group_assignments (
  id uuid primary key default gen_random_uuid(),
  smart_group_id uuid not null references public.smart_groups(id) on delete cascade,
  assignment_type text not null check (assignment_type in ('time_clock', 'schedule')),
  time_clock_id uuid references public.time_clocks(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint smart_group_assignments_time_clock_shape check (
    assignment_type <> 'time_clock'
    or (time_clock_id is not null and location_id is null)
  ),
  constraint smart_group_assignments_schedule_shape check (
    assignment_type <> 'schedule'
    or (location_id is not null and time_clock_id is null)
  )
);

create unique index if not exists smart_group_assignments_unique_clock
  on public.smart_group_assignments (smart_group_id, time_clock_id)
  where assignment_type = 'time_clock' and time_clock_id is not null;

create unique index if not exists smart_group_assignments_unique_schedule
  on public.smart_group_assignments (smart_group_id, location_id)
  where assignment_type = 'schedule' and location_id is not null;

-- --- RLS (parity with time_clocks / employees dev anon) ---
alter table public.group_segments enable row level security;
alter table public.smart_groups enable row level security;
alter table public.smart_group_members enable row level security;
alter table public.smart_group_admins enable row level security;
alter table public.smart_group_assignments enable row level security;

drop policy if exists "group_segments_select_auth" on public.group_segments;
create policy "group_segments_select_auth"
  on public.group_segments for select to authenticated using (true);

drop policy if exists "group_segments_insert_auth" on public.group_segments;
create policy "group_segments_insert_auth"
  on public.group_segments for insert to authenticated with check (true);

drop policy if exists "group_segments_update_auth" on public.group_segments;
create policy "group_segments_update_auth"
  on public.group_segments for update to authenticated using (true) with check (true);

drop policy if exists "group_segments_delete_auth" on public.group_segments;
create policy "group_segments_delete_auth"
  on public.group_segments for delete to authenticated using (true);

drop policy if exists "group_segments_select_anon" on public.group_segments;
create policy "group_segments_select_anon"
  on public.group_segments for select to anon using (true);

drop policy if exists "group_segments_insert_anon" on public.group_segments;
create policy "group_segments_insert_anon"
  on public.group_segments for insert to anon with check (true);

drop policy if exists "group_segments_update_anon" on public.group_segments;
create policy "group_segments_update_anon"
  on public.group_segments for update to anon using (true) with check (true);

drop policy if exists "group_segments_delete_anon" on public.group_segments;
create policy "group_segments_delete_anon"
  on public.group_segments for delete to anon using (true);

drop policy if exists "smart_groups_select_auth" on public.smart_groups;
create policy "smart_groups_select_auth"
  on public.smart_groups for select to authenticated using (true);

drop policy if exists "smart_groups_insert_auth" on public.smart_groups;
create policy "smart_groups_insert_auth"
  on public.smart_groups for insert to authenticated with check (true);

drop policy if exists "smart_groups_update_auth" on public.smart_groups;
create policy "smart_groups_update_auth"
  on public.smart_groups for update to authenticated using (true) with check (true);

drop policy if exists "smart_groups_delete_auth" on public.smart_groups;
create policy "smart_groups_delete_auth"
  on public.smart_groups for delete to authenticated using (true);

drop policy if exists "smart_groups_select_anon" on public.smart_groups;
create policy "smart_groups_select_anon"
  on public.smart_groups for select to anon using (true);

drop policy if exists "smart_groups_insert_anon" on public.smart_groups;
create policy "smart_groups_insert_anon"
  on public.smart_groups for insert to anon with check (true);

drop policy if exists "smart_groups_update_anon" on public.smart_groups;
create policy "smart_groups_update_anon"
  on public.smart_groups for update to anon using (true) with check (true);

drop policy if exists "smart_groups_delete_anon" on public.smart_groups;
create policy "smart_groups_delete_anon"
  on public.smart_groups for delete to anon using (true);

drop policy if exists "smart_group_members_select_auth" on public.smart_group_members;
create policy "smart_group_members_select_auth"
  on public.smart_group_members for select to authenticated using (true);

drop policy if exists "smart_group_members_insert_auth" on public.smart_group_members;
create policy "smart_group_members_insert_auth"
  on public.smart_group_members for insert to authenticated with check (true);

drop policy if exists "smart_group_members_delete_auth" on public.smart_group_members;
create policy "smart_group_members_delete_auth"
  on public.smart_group_members for delete to authenticated using (true);

drop policy if exists "smart_group_members_select_anon" on public.smart_group_members;
create policy "smart_group_members_select_anon"
  on public.smart_group_members for select to anon using (true);

drop policy if exists "smart_group_members_insert_anon" on public.smart_group_members;
create policy "smart_group_members_insert_anon"
  on public.smart_group_members for insert to anon with check (true);

drop policy if exists "smart_group_members_delete_anon" on public.smart_group_members;
create policy "smart_group_members_delete_anon"
  on public.smart_group_members for delete to anon using (true);

drop policy if exists "smart_group_admins_select_auth" on public.smart_group_admins;
create policy "smart_group_admins_select_auth"
  on public.smart_group_admins for select to authenticated using (true);

drop policy if exists "smart_group_admins_insert_auth" on public.smart_group_admins;
create policy "smart_group_admins_insert_auth"
  on public.smart_group_admins for insert to authenticated with check (true);

drop policy if exists "smart_group_admins_delete_auth" on public.smart_group_admins;
create policy "smart_group_admins_delete_auth"
  on public.smart_group_admins for delete to authenticated using (true);

drop policy if exists "smart_group_admins_select_anon" on public.smart_group_admins;
create policy "smart_group_admins_select_anon"
  on public.smart_group_admins for select to anon using (true);

drop policy if exists "smart_group_admins_insert_anon" on public.smart_group_admins;
create policy "smart_group_admins_insert_anon"
  on public.smart_group_admins for insert to anon with check (true);

drop policy if exists "smart_group_admins_delete_anon" on public.smart_group_admins;
create policy "smart_group_admins_delete_anon"
  on public.smart_group_admins for delete to anon using (true);

drop policy if exists "smart_group_assignments_select_auth" on public.smart_group_assignments;
create policy "smart_group_assignments_select_auth"
  on public.smart_group_assignments for select to authenticated using (true);

drop policy if exists "smart_group_assignments_insert_auth" on public.smart_group_assignments;
create policy "smart_group_assignments_insert_auth"
  on public.smart_group_assignments for insert to authenticated with check (true);

drop policy if exists "smart_group_assignments_delete_auth" on public.smart_group_assignments;
create policy "smart_group_assignments_delete_auth"
  on public.smart_group_assignments for delete to authenticated using (true);

drop policy if exists "smart_group_assignments_select_anon" on public.smart_group_assignments;
create policy "smart_group_assignments_select_anon"
  on public.smart_group_assignments for select to anon using (true);

drop policy if exists "smart_group_assignments_insert_anon" on public.smart_group_assignments;
create policy "smart_group_assignments_insert_anon"
  on public.smart_group_assignments for insert to anon with check (true);

drop policy if exists "smart_group_assignments_delete_anon" on public.smart_group_assignments;
create policy "smart_group_assignments_delete_anon"
  on public.smart_group_assignments for delete to anon using (true);

-- --- Seed (idempotent) ---
insert into public.group_segments (id, name, color_token, sort_order, location_id)
values
  ('b1000000-0000-4000-8000-000000000001', 'Store roles', 'slate', 1, null),
  ('b1000000-0000-4000-8000-000000000002', 'Operations', 'violet', 2, null)
on conflict (id) do nothing;

insert into public.smart_groups (id, segment_id, name, sort_order, created_by)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'Cashiers',
    1,
    (select id from public.employees where email = 'alex.p@example.com' limit 1)
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'Shift leads',
    2,
    (select id from public.employees where email = 'riley.k@example.com' limit 1)
  ),
  (
    'b2000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000002',
    'Night crew',
    1,
    null
  )
on conflict (id) do nothing;

insert into public.smart_group_members (smart_group_id, employee_id)
select 'b2000000-0000-4000-8000-000000000001', e.id
from public.employees e
where e.email in ('jamie.l@example.com', 'casey.r@example.com')
on conflict do nothing;

insert into public.smart_group_members (smart_group_id, employee_id)
select 'b2000000-0000-4000-8000-000000000002', e.id
from public.employees e
where e.email in ('alex.p@example.com', 'morgan.t@example.com')
on conflict do nothing;

insert into public.smart_group_admins (smart_group_id, employee_id)
select 'b2000000-0000-4000-8000-000000000001', e.id
from public.employees e
where e.email = 'riley.k@example.com'
on conflict do nothing;

insert into public.smart_group_admins (smart_group_id, employee_id)
select 'b2000000-0000-4000-8000-000000000002', e.id
from public.employees e
where e.email in ('riley.k@example.com', 'jordan.m@example.com')
on conflict do nothing;

-- Assign main Downtown clock to Cashiers; Schedule at Downtown + Store LP for Shift leads
insert into public.smart_group_assignments (id, smart_group_id, assignment_type, time_clock_id, location_id)
select
  'b3000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'time_clock',
  tc.id,
  null
from public.time_clocks tc
join public.locations l on l.id = tc.location_id
where l.slug = 'downtown-flagship' and tc.slug = 'main'
limit 1
on conflict (id) do nothing;

insert into public.smart_group_assignments (id, smart_group_id, assignment_type, time_clock_id, location_id)
values
  (
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'schedule',
    null,
    'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'b3000000-0000-4000-8000-000000000003',
    'b2000000-0000-4000-8000-000000000002',
    'schedule',
    null,
    'a0000000-0000-4000-8000-000000000002'
  )
on conflict (id) do nothing;
