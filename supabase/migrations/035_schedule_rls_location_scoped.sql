-- Schedule: tighten RLS to match app RBAC (Option A)
-- Owners can edit all stores; Store Managers can edit only their store (locations.manager_employee_id).
-- Everyone can read only their store’s schedule data.
--
-- Run after 034.

-- --- Helpers (email-based identity: app matches auth user email to employees.email) ---
create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
stable
as $$
  select e.id
  from public.employees e
  where e.email is not null
    and lower(e.email) = public.current_user_email()
  limit 1;
$$;

create or replace function public.is_org_owner()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.employees e
    where e.id = public.current_employee_id()
      and lower(replace(trim(coalesce(e.role, '')), ' ', '_')) in ('owner', 'org_owner', 'organization_owner')
  );
$$;

create or replace function public.can_edit_location(p_location_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_org_owner()
    or exists (
      select 1
      from public.locations l
      where l.id = p_location_id
        and l.manager_employee_id = public.current_employee_id()
    );
$$;

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
      from public.locations l
      where l.id = p_location_id
        and l.manager_employee_id = public.current_employee_id()
    );
$$;

-- --- Shifts ---
drop policy if exists "shifts_select_auth" on public.shifts;
drop policy if exists "shifts_select_anon" on public.shifts;
drop policy if exists "shifts_insert_auth" on public.shifts;
drop policy if exists "shifts_update_auth" on public.shifts;
drop policy if exists "shifts_delete_auth" on public.shifts;
drop policy if exists "shifts_insert_anon" on public.shifts;
drop policy if exists "shifts_update_anon" on public.shifts;
drop policy if exists "shifts_delete_anon" on public.shifts;

create policy "shifts_select_location_scoped"
  on public.shifts for select to authenticated
  using (public.can_view_location(location_id));

create policy "shifts_insert_location_scoped"
  on public.shifts for insert to authenticated
  with check (public.can_edit_location(location_id));

create policy "shifts_update_location_scoped"
  on public.shifts for update to authenticated
  using (public.can_edit_location(location_id))
  with check (public.can_edit_location(location_id));

create policy "shifts_delete_location_scoped"
  on public.shifts for delete to authenticated
  using (public.can_edit_location(location_id));

-- --- Shift assignments (join through shifts for location) ---
drop policy if exists "shift_assignments_all_auth" on public.shift_assignments;
drop policy if exists "shift_assignments_all_anon" on public.shift_assignments;
drop policy if exists "shift_assignments_select_auth" on public.shift_assignments;
drop policy if exists "shift_assignments_select_anon" on public.shift_assignments;

create policy "shift_assignments_select_location_scoped"
  on public.shift_assignments for select to authenticated
  using (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_assignments.shift_id
        and public.can_view_location(s.location_id)
    )
  );

create policy "shift_assignments_insert_location_scoped"
  on public.shift_assignments for insert to authenticated
  with check (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_assignments.shift_id
        and public.can_edit_location(s.location_id)
    )
  );

create policy "shift_assignments_delete_location_scoped"
  on public.shift_assignments for delete to authenticated
  using (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_assignments.shift_id
        and public.can_edit_location(s.location_id)
    )
  );

-- --- Schedule jobs / groups (read scoped; write owner-only) ---
drop policy if exists "schedule_jobs_all_auth" on public.schedule_jobs;
drop policy if exists "schedule_jobs_all_anon" on public.schedule_jobs;
drop policy if exists "schedule_shift_groups_all_auth" on public.schedule_shift_groups;
drop policy if exists "schedule_shift_groups_all_anon" on public.schedule_shift_groups;

create policy "schedule_jobs_select_location_scoped"
  on public.schedule_jobs for select to authenticated
  using (public.can_view_location(location_id));

create policy "schedule_jobs_write_owner_only"
  on public.schedule_jobs for insert to authenticated
  with check (public.is_org_owner());

create policy "schedule_jobs_update_owner_only"
  on public.schedule_jobs for update to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

create policy "schedule_jobs_delete_owner_only"
  on public.schedule_jobs for delete to authenticated
  using (public.is_org_owner());

create policy "schedule_shift_groups_select_location_scoped"
  on public.schedule_shift_groups for select to authenticated
  using (public.can_view_location(location_id));

create policy "schedule_shift_groups_write_owner_only"
  on public.schedule_shift_groups for insert to authenticated
  with check (public.is_org_owner());

create policy "schedule_shift_groups_update_owner_only"
  on public.schedule_shift_groups for update to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

create policy "schedule_shift_groups_delete_owner_only"
  on public.schedule_shift_groups for delete to authenticated
  using (public.is_org_owner());

-- --- Shift tasks (join through shifts for location) ---
drop policy if exists "shift_tasks_all_auth" on public.shift_tasks;
drop policy if exists "shift_tasks_all_anon" on public.shift_tasks;

create policy "shift_tasks_select_location_scoped"
  on public.shift_tasks for select to authenticated
  using (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_tasks.shift_id
        and public.can_view_location(s.location_id)
    )
  );

create policy "shift_tasks_insert_location_scoped"
  on public.shift_tasks for insert to authenticated
  with check (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_tasks.shift_id
        and public.can_edit_location(s.location_id)
    )
  );

create policy "shift_tasks_update_location_scoped"
  on public.shift_tasks for update to authenticated
  using (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_tasks.shift_id
        and public.can_edit_location(s.location_id)
    )
  )
  with check (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_tasks.shift_id
        and public.can_edit_location(s.location_id)
    )
  );

create policy "shift_tasks_delete_location_scoped"
  on public.shift_tasks for delete to authenticated
  using (
    exists (
      select 1
      from public.shifts s
      where s.id = shift_tasks.shift_id
        and public.can_edit_location(s.location_id)
    )
  );

-- --- Employee unavailability (location scoped) ---
drop policy if exists "employee_unavailability_all_auth" on public.employee_unavailability;
drop policy if exists "employee_unavailability_all_anon" on public.employee_unavailability;

create policy "employee_unavailability_select_location_scoped"
  on public.employee_unavailability for select to authenticated
  using (public.can_view_location(location_id));

create policy "employee_unavailability_insert_location_scoped"
  on public.employee_unavailability for insert to authenticated
  with check (public.can_edit_location(location_id));

create policy "employee_unavailability_update_location_scoped"
  on public.employee_unavailability for update to authenticated
  using (public.can_edit_location(location_id))
  with check (public.can_edit_location(location_id));

create policy "employee_unavailability_delete_location_scoped"
  on public.employee_unavailability for delete to authenticated
  using (public.can_edit_location(location_id));

