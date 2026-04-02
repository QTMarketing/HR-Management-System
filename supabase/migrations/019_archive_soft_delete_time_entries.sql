-- Soft-archive time punches; forbid hard deletes for employees and time_entries (defense in depth).

alter table public.time_entries
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.employees(id) on delete set null;

comment on column public.time_entries.archived_at is 'When set, punch is archived (hidden from active payroll views), not deleted.';

create index if not exists time_entries_active_clock_idx
  on public.time_entries (time_clock_id, clock_in_at desc)
  where archived_at is null;

-- Block DELETE — use archive (set archived_at) instead.
drop policy if exists "time_entries_delete_denied_auth" on public.time_entries;
create policy "time_entries_delete_denied_auth"
  on public.time_entries for delete to authenticated using (false);

drop policy if exists "time_entries_delete_denied_anon" on public.time_entries;
create policy "time_entries_delete_denied_anon"
  on public.time_entries for delete to anon using (false);

drop policy if exists "employees_delete_denied_auth" on public.employees;
create policy "employees_delete_denied_auth"
  on public.employees for delete to authenticated using (false);

drop policy if exists "employees_delete_denied_anon" on public.employees;
create policy "employees_delete_denied_anon"
  on public.employees for delete to anon using (false);
