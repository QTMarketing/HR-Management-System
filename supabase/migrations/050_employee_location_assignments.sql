-- Multi-store access: allow employees to work across multiple stores.
-- Keep `employees.location_id` as "home store", and add explicit assignments for additional stores.
--
-- Owners remain global via `public.is_org_owner()`.
-- Run after 035 (functions) and after locations/employees exist.

create table if not exists public.employee_location_assignments (
  employee_id uuid not null references public.employees(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.employees(id) on delete set null,
  note text,
  primary key (employee_id, location_id)
);

create index if not exists employee_location_assignments_location_id_idx
  on public.employee_location_assignments (location_id);

alter table public.employee_location_assignments enable row level security;

drop policy if exists "employee_location_assignments_select_self_or_owner" on public.employee_location_assignments;
create policy "employee_location_assignments_select_self_or_owner"
  on public.employee_location_assignments for select to authenticated
  using (
    public.is_org_owner()
    or employee_id = public.current_employee_id()
  );

-- Management UI comes later; keep writes owner-only for now.
drop policy if exists "employee_location_assignments_write_owner_only" on public.employee_location_assignments;
create policy "employee_location_assignments_write_owner_only"
  on public.employee_location_assignments for all to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

-- Extend location visibility to include assigned stores.
create or replace function public.can_view_location(p_location_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_org_owner()
    or exists (
      select 1
      from public.employees e
      where e.id = public.current_employee_id()
        and e.location_id = p_location_id
    )
    or exists (
      select 1
      from public.employee_location_assignments a
      where a.employee_id = public.current_employee_id()
        and a.location_id = p_location_id
    )
    or exists (
      select 1
      from public.locations l
      where l.id = p_location_id
        and l.manager_employee_id = public.current_employee_id()
    );
$$;

