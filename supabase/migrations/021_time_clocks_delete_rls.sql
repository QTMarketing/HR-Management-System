-- Allow deleting time clocks when no time_entries reference them (RESTRICT on punches).

drop policy if exists "time_clocks_delete_auth" on public.time_clocks;
create policy "time_clocks_delete_auth"
  on public.time_clocks for delete to authenticated using (true);

drop policy if exists "time_clocks_delete_anon" on public.time_clocks;
create policy "time_clocks_delete_anon"
  on public.time_clocks for delete to anon using (true);
