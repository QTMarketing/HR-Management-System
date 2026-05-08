-- Add `employees.rehired_at` for the "boomerang employee" workflow.
--
-- When an archived employee is restored from the app (via the new
-- `restoreEmployee` server action), we stamp `rehired_at = now()` so HR can
-- distinguish their original `employment_start_date` from the date they came
-- back. `archived_at` is cleared by the same action so the row reappears in
-- active queries.
--
-- Idempotent + non-destructive:
--   - Uses `if not exists` so re-running doesn't error.
--   - Nullable, no default — never touches existing rows.
--   - Has no implications for RLS or any view.

alter table public.employees
  add column if not exists rehired_at timestamptz;

comment on column public.employees.rehired_at is
  'Timestamp set when an archived employee is restored to active status. Lets HR show "Rehired" alongside the original employment_start_date for boomerang employees. NULL for everyone who has never been archived.';
