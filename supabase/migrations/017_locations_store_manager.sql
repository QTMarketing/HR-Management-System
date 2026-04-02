-- Canonical store lead (HR / org chart). App RBAC still uses employees.role + admin_access for product permissions.

alter table public.locations
  add column if not exists manager_employee_id uuid references public.employees(id) on delete set null;

create index if not exists locations_manager_employee_id_idx on public.locations (manager_employee_id);

comment on column public.locations.manager_employee_id is 'Primary accountable Store Manager for this location (org chart).';

-- Server actions enforce org-level gates (ORG_OWNER); DB stays permissive for dev parity with employees policies.

drop policy if exists "locations_update_authenticated" on public.locations;
create policy "locations_update_authenticated"
  on public.locations for update to authenticated using (true) with check (true);
