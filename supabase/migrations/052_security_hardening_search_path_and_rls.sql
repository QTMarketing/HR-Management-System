-- Security hardening for launch:
-- 1) Fix "Function Search Path Mutable" lints by pinning search_path.
-- 2) Tighten a few overly-permissive RLS policies that were added for dev parity.

-- ---- 1) search_path hardening (Supabase linter 0011) ----
-- Use `public, pg_temp` to avoid unexpected object resolution.
alter function public.is_store_manager() set search_path = public, pg_temp;
alter function public.enforce_shift_layer_option_matches_layer() set search_path = public, pg_temp;
alter function public.current_user_email() set search_path = public, pg_temp;
alter function public.current_employee_id() set search_path = public, pg_temp;
alter function public.is_org_owner() set search_path = public, pg_temp;
alter function public.can_edit_location(uuid) set search_path = public, pg_temp;
alter function public.can_view_location(uuid) set search_path = public, pg_temp;

-- ---- 2) RLS hardening (Supabase linter 0024) ----
-- Remove anonymous write access on core tables.

-- Activity events: inserts should come only from authenticated app sessions.
drop policy if exists "activity_events_insert_anon" on public.activity_events;
drop policy if exists "activity_events_insert_auth" on public.activity_events;
create policy "activity_events_insert_auth"
  on public.activity_events for insert to authenticated
  with check (public.can_view_location(location_id));

-- Employees: only authenticated staff with elevated rights should insert/update.
drop policy if exists "employees_insert_anon" on public.employees;
drop policy if exists "employees_update_anon" on public.employees;

drop policy if exists "employees_insert_auth" on public.employees;
create policy "employees_insert_auth"
  on public.employees for insert to authenticated
  with check (public.is_org_owner() or public.is_store_manager());

drop policy if exists "employees_update_auth" on public.employees;
create policy "employees_update_auth"
  on public.employees for update to authenticated
  using (public.is_org_owner() or public.is_store_manager())
  with check (public.is_org_owner() or public.is_store_manager());

-- Time clocks: prevent anon writes; restrict authenticated writes to store editors.
drop policy if exists "time_clocks_insert_anon" on public.time_clocks;
drop policy if exists "time_clocks_update_anon" on public.time_clocks;
drop policy if exists "time_clocks_delete_anon" on public.time_clocks;

drop policy if exists "time_clocks_insert_auth" on public.time_clocks;
create policy "time_clocks_insert_auth"
  on public.time_clocks for insert to authenticated
  with check (public.can_edit_location(location_id));

drop policy if exists "time_clocks_update_auth" on public.time_clocks;
create policy "time_clocks_update_auth"
  on public.time_clocks for update to authenticated
  using (public.can_edit_location(location_id))
  with check (public.can_edit_location(location_id));

drop policy if exists "time_clocks_delete_auth" on public.time_clocks;
create policy "time_clocks_delete_auth"
  on public.time_clocks for delete to authenticated
  using (public.can_edit_location(location_id));

-- Security audit: never allow anon inserts (and avoid unrestricted authenticated inserts).
drop policy if exists "security_audit_events_insert_anon" on public.security_audit_events;
drop policy if exists "security_audit_events_insert_auth" on public.security_audit_events;
create policy "security_audit_events_insert_auth"
  on public.security_audit_events for insert to authenticated
  with check (public.is_org_owner());

-- Company holidays: writes should be owner-only.
drop policy if exists "company_holidays_write_auth" on public.company_holidays;
create policy "company_holidays_write_auth"
  on public.company_holidays for all to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

