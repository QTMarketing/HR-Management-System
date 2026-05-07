-- Employee work status metadata for scheduling/eligibility/reporting.
-- Use FTE (full-time equivalent) instead of a hard full/part toggle.

alter table public.employees
  add column if not exists fte numeric not null default 1.0,
  add column if not exists standard_hours_per_week numeric;

alter table public.employees
  add constraint employees_fte_range_chk
  check (fte > 0 and fte <= 2) not valid;

alter table public.employees
  validate constraint employees_fte_range_chk;

alter table public.employees
  add constraint employees_standard_hours_nonnegative_chk
  check (standard_hours_per_week is null or standard_hours_per_week >= 0) not valid;

alter table public.employees
  validate constraint employees_standard_hours_nonnegative_chk;

