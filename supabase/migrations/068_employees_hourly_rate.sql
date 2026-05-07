-- Track A (Payable hours rollup): add hourly_rate to employees.
--
-- Nullable on purpose. Until HR enters real wages, the payroll calculator
-- (`lib/payroll/payable-hours.ts`) substitutes a clearly-marked DEMO fallback
-- and the Time Sheets UI surfaces a "DEMO RATE — UPDATE IN PROFILE" badge so
-- the placeholder cannot leak into a real payroll export by accident.
--
-- Rate is in the org's local currency, per hour worked. No FX, no shift
-- differential, no tax model — those land in later phases.

alter table public.employees
  add column if not exists hourly_rate numeric;

alter table public.employees
  drop constraint if exists employees_hourly_rate_nonnegative_chk;

alter table public.employees
  add constraint employees_hourly_rate_nonnegative_chk
  check (hourly_rate is null or hourly_rate >= 0);

comment on column public.employees.hourly_rate is
  'Hourly wage in org local currency. NULL = unset; payroll calculator falls back to a marked DEMO rate until HR enters the real number.';
