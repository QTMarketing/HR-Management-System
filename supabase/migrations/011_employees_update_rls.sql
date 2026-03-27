-- Allow updating employees from the app (promote to admin, etc.).
-- Dev: anon + authenticated; tighten to authenticated-only in production if needed.

drop policy if exists "employees_update_auth" on public.employees;
create policy "employees_update_auth"
  on public.employees for update to authenticated using (true) with check (true);

drop policy if exists "employees_update_anon" on public.employees;
create policy "employees_update_anon"
  on public.employees for update to anon using (true) with check (true);
