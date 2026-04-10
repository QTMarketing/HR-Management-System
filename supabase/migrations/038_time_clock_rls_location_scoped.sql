-- Time clock: tighten RLS (Option A) — same helpers as schedule (035).
-- Owners: all stores. Store leads + employees at store: view; store leads + owners: manage punches/time off at that store.
-- Employees: own punches/breaks (clock in/out, breaks) and own time-off requests while pending.
--
-- Run after 037.

-- --- time_entries ---
drop policy if exists "time_entries_select_auth" on public.time_entries;
drop policy if exists "time_entries_insert_auth" on public.time_entries;
drop policy if exists "time_entries_update_auth" on public.time_entries;
drop policy if exists "time_entries_select_anon" on public.time_entries;
drop policy if exists "time_entries_insert_anon" on public.time_entries;
drop policy if exists "time_entries_update_anon" on public.time_entries;
drop policy if exists "time_entries_delete_denied_anon" on public.time_entries;

create policy "time_entries_select_location_scoped"
  on public.time_entries for select to authenticated
  using (
    public.can_view_location(location_id)
    or employee_id = public.current_employee_id()
  );

create policy "time_entries_insert_location_scoped"
  on public.time_entries for insert to authenticated
  with check (
    (
      public.can_edit_location(location_id)
      and exists (
        select 1
        from public.employees e
        where e.id = employee_id
          and e.location_id = location_id
      )
    )
    or (
      employee_id = public.current_employee_id()
      and public.can_view_location(location_id)
      and exists (
        select 1
        from public.employees e
        where e.id = employee_id
          and e.location_id = location_id
      )
    )
  );

create policy "time_entries_update_location_scoped"
  on public.time_entries for update to authenticated
  using (
    public.can_edit_location(location_id)
    or employee_id = public.current_employee_id()
  )
  with check (
    (
      public.can_edit_location(location_id)
      and exists (
        select 1
        from public.employees e
        where e.id = employee_id
          and e.location_id = location_id
      )
    )
    or (
      employee_id = public.current_employee_id()
      and exists (
        select 1
        from public.employees e
        where e.id = employee_id
          and e.location_id = location_id
      )
    )
  );

-- --- time_entry_breaks (inherit access via parent punch) ---
drop policy if exists "time_entry_breaks_select_auth" on public.time_entry_breaks;
drop policy if exists "time_entry_breaks_insert_auth" on public.time_entry_breaks;
drop policy if exists "time_entry_breaks_update_auth" on public.time_entry_breaks;
drop policy if exists "time_entry_breaks_select_anon" on public.time_entry_breaks;
drop policy if exists "time_entry_breaks_insert_anon" on public.time_entry_breaks;
drop policy if exists "time_entry_breaks_update_anon" on public.time_entry_breaks;

create policy "time_entry_breaks_select_location_scoped"
  on public.time_entry_breaks for select to authenticated
  using (
    exists (
      select 1
      from public.time_entries t
      where t.id = time_entry_breaks.time_entry_id
        and (
          public.can_view_location(t.location_id)
          or t.employee_id = public.current_employee_id()
        )
    )
  );

create policy "time_entry_breaks_insert_location_scoped"
  on public.time_entry_breaks for insert to authenticated
  with check (
    exists (
      select 1
      from public.time_entries t
      where t.id = time_entry_breaks.time_entry_id
        and (
          public.can_edit_location(t.location_id)
          or t.employee_id = public.current_employee_id()
        )
    )
  );

create policy "time_entry_breaks_update_location_scoped"
  on public.time_entry_breaks for update to authenticated
  using (
    exists (
      select 1
      from public.time_entries t
      where t.id = time_entry_breaks.time_entry_id
        and (
          public.can_edit_location(t.location_id)
          or t.employee_id = public.current_employee_id()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.time_entries t
      where t.id = time_entry_breaks.time_entry_id
        and (
          public.can_edit_location(t.location_id)
          or t.employee_id = public.current_employee_id()
        )
    )
  );

-- --- time_off_records ---
drop policy if exists "time_off_records_select_auth" on public.time_off_records;
drop policy if exists "time_off_records_insert_auth" on public.time_off_records;
drop policy if exists "time_off_records_update_auth" on public.time_off_records;
drop policy if exists "time_off_records_select_anon" on public.time_off_records;
drop policy if exists "time_off_records_insert_anon" on public.time_off_records;
drop policy if exists "time_off_records_update_anon" on public.time_off_records;

create policy "time_off_records_select_location_scoped"
  on public.time_off_records for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or (
      status = 'approved'
      and public.can_view_location(location_id)
    )
    or (
      status = 'pending'
      and public.can_edit_location(location_id)
    )
    or (
      status = 'denied'
      and public.can_edit_location(location_id)
    )
  );

create policy "time_off_records_insert_location_scoped"
  on public.time_off_records for insert to authenticated
  with check (
    exists (
      select 1
      from public.employees e
      where e.id = employee_id
        and e.location_id = location_id
    )
    and (
      (
        public.can_edit_location(location_id)
        and status = 'approved'
        and request_source = 'manager'
      )
      or (
        employee_id = public.current_employee_id()
        and status = 'pending'
        and request_source = 'employee'
        and public.can_view_location(location_id)
      )
    )
  );

create policy "time_off_records_update_manager_location_scoped"
  on public.time_off_records for update to authenticated
  using (
    public.can_edit_location(location_id)
    and exists (
      select 1
      from public.employees e
      where e.id = employee_id
        and e.location_id = location_id
    )
  )
  with check (
    public.can_edit_location(location_id)
    and exists (
      select 1
      from public.employees e
      where e.id = employee_id
        and e.location_id = location_id
    )
  );

create policy "time_off_records_update_employee_pending_scoped"
  on public.time_off_records for update to authenticated
  using (
    employee_id = public.current_employee_id()
    and request_source = 'employee'
    and status = 'pending'
  )
  with check (
    employee_id = public.current_employee_id()
    and request_source = 'employee'
    and status = 'pending'
  );

create policy "time_off_records_delete_location_scoped"
  on public.time_off_records for delete to authenticated
  using (
    public.can_edit_location(location_id)
    and exists (
      select 1
      from public.employees e
      where e.id = employee_id
        and e.location_id = location_id
    )
  );
