-- Phase 5: employee time-off requests (pending) + manager approve/deny (UPDATE).

alter table public.time_off_records
  add column if not exists request_source text not null default 'manager';

alter table public.time_off_records
  drop constraint if exists time_off_records_request_source_check;

alter table public.time_off_records
  add constraint time_off_records_request_source_check
  check (request_source in ('manager', 'employee'));

alter table public.time_off_records
  add column if not exists employee_notes text;

alter table public.time_off_records
  add column if not exists reviewed_by uuid references public.employees (id) on delete set null;

alter table public.time_off_records
  add column if not exists reviewed_at timestamptz;

comment on column public.time_off_records.request_source is
  'manager = recorded by manager as approved; employee = self-serve, starts pending.';
comment on column public.time_off_records.employee_notes is 'Optional note from employee on a request.';
comment on column public.time_off_records.reviewed_by is 'Manager who approved or denied a pending request.';

alter table public.time_off_records enable row level security;

drop policy if exists "time_off_records_update_auth" on public.time_off_records;
create policy "time_off_records_update_auth"
  on public.time_off_records for update to authenticated using (true) with check (true);

drop policy if exists "time_off_records_update_anon" on public.time_off_records;
create policy "time_off_records_update_anon"
  on public.time_off_records for update to anon using (true) with check (true);
