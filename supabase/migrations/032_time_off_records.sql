-- Phase 5 (initial): manager-logged time off from the timecard drawer (approved by default).
-- Balances / employee self-serve requests are future work.

create table if not exists public.time_off_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  time_off_type text not null,
  all_day boolean not null default false,
  start_at timestamptz not null,
  end_at timestamptz not null,
  total_hours numeric,
  days_of_leave numeric,
  manager_notes text,
  recorded_by uuid references public.employees (id) on delete set null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  constraint time_off_records_end_after_start check (end_at >= start_at)
);

comment on table public.time_off_records is
  'Time away from work: manager entries from time clock timecard; PTO ledger and employee requests later.';

create index if not exists time_off_records_location_employee_start_idx
  on public.time_off_records (location_id, employee_id, start_at desc);

alter table public.time_off_records enable row level security;

drop policy if exists "time_off_records_select_auth" on public.time_off_records;
create policy "time_off_records_select_auth"
  on public.time_off_records for select to authenticated using (true);

drop policy if exists "time_off_records_insert_auth" on public.time_off_records;
create policy "time_off_records_insert_auth"
  on public.time_off_records for insert to authenticated with check (true);

drop policy if exists "time_off_records_select_anon" on public.time_off_records;
create policy "time_off_records_select_anon"
  on public.time_off_records for select to anon using (true);

drop policy if exists "time_off_records_insert_anon" on public.time_off_records;
create policy "time_off_records_insert_anon"
  on public.time_off_records for insert to anon with check (true);
