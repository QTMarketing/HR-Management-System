-- Allow app server actions to create/update time_clocks (dev parity with time_entries).
-- RBAC is enforced in Next.js actions; DB stays permissive for authenticated/anon like 006.

drop policy if exists "time_clocks_insert_auth" on public.time_clocks;
create policy "time_clocks_insert_auth"
  on public.time_clocks for insert to authenticated with check (true);

drop policy if exists "time_clocks_update_auth" on public.time_clocks;
create policy "time_clocks_update_auth"
  on public.time_clocks for update to authenticated using (true) with check (true);

drop policy if exists "time_clocks_insert_anon" on public.time_clocks;
create policy "time_clocks_insert_anon"
  on public.time_clocks for insert to anon with check (true);

drop policy if exists "time_clocks_update_anon" on public.time_clocks;
create policy "time_clocks_update_anon"
  on public.time_clocks for update to anon using (true) with check (true);
