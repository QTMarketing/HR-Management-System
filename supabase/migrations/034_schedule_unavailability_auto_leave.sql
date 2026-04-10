-- Schedule: employee unavailability (blocks scheduling) with optional auto-linked leave record.
-- Run after 033.

create table if not exists public.employee_unavailability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  -- When created from the schedule UI, we also create an approved time_off_record.
  time_off_record_id uuid references public.time_off_records(id) on delete set null,
  created_by_employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_unavailability_end_after_start check (end_at > start_at)
);

create index if not exists employee_unavailability_employee_start_idx
  on public.employee_unavailability (employee_id, start_at desc);

create index if not exists employee_unavailability_location_start_idx
  on public.employee_unavailability (location_id, start_at desc);

alter table public.employee_unavailability enable row level security;

-- Dev parity policies (tighten later with RBAC joins through shifts/locations).
drop policy if exists "employee_unavailability_all_auth" on public.employee_unavailability;
drop policy if exists "employee_unavailability_all_anon" on public.employee_unavailability;

create policy "employee_unavailability_all_auth"
  on public.employee_unavailability for all to authenticated using (true) with check (true);

create policy "employee_unavailability_all_anon"
  on public.employee_unavailability for all to anon using (true) with check (true);

