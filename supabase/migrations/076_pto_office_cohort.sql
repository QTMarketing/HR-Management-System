-- Phase 5 (PTO + ledger): add the **office** vacation cohort.
--
-- Why:
-- HR's vacation policy distinguishes three groups, but the original PTO
-- schema only modelled "store manager" vs. "store employee":
--
--   Office:       1y -> 5d, 2y -> 10d, 5y -> 15d, 10y -> 20d  (non-linear)
--   Store mgr:    5d at 1y, +1/yr to 10d at 6y               (linear)
--   Store emp:    5d at 2y, +1/yr to 10d at 7y               (linear)
--
-- Without this migration office staff were silently being given the
-- *store employee* ladder (no entitlement until year 2, capped at 10
-- days), which is wrong. This migration:
--
--   1. Relaxes the cohort check on pto_entitlement_tiers to allow
--      'office'.
--   2. Adds an explicit `employees.pto_cohort` override column so HR can
--      classify edge cases (Owner / HR / Accountant / etc.) without
--      relying on role-string heuristics.
--   3. Teaches `pto_employee_cohort()` to detect office roles by keyword
--      (HR, Accountant, Office, Admin, Corporate, …) when no override
--      is set.
--   4. Updates `pto_entitlement_hours_for_employee()` to prefer the
--      explicit override.
--   5. Seeds the office tier ladder for the default policy.
--
-- Idempotent — safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Relax cohort check on tiers
-- ---------------------------------------------------------------------------
alter table public.pto_entitlement_tiers
  drop constraint if exists pto_entitlement_tiers_cohort_check;

alter table public.pto_entitlement_tiers
  add constraint pto_entitlement_tiers_cohort_check
  check (cohort in ('employee', 'manager', 'office', 'all'));

-- ---------------------------------------------------------------------------
-- 2. Add an explicit PTO classification override on employees
-- ---------------------------------------------------------------------------
alter table public.employees
  add column if not exists pto_cohort text;

alter table public.employees
  drop constraint if exists employees_pto_cohort_check;

alter table public.employees
  add constraint employees_pto_cohort_check
  check (pto_cohort is null or pto_cohort in ('office', 'manager', 'employee'));

comment on column public.employees.pto_cohort is
  'Optional explicit PTO classification override. NULL means "auto-detect from role" (pto_employee_cohort).';

-- ---------------------------------------------------------------------------
-- 3. Smarter cohort resolver (recognises "office" roles by keyword)
-- ---------------------------------------------------------------------------
create or replace function public.pto_employee_cohort(p_role text)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    case
      -- "Office" group: HR, accountants, finance, admin, corporate, etc.
      -- Uses `\w*` so the regex catches "Administrator" / "Administration",
      -- "Coordinator" / "Coordinators", etc. — not just the bare keyword.
      when p_role is not null and lower(p_role) ~
           '(office|\bhr\b|human[\s-]?resources|accountant\w*|finance\w*|payroll\w*|corporate\w*|head[\s-]?office|admin\w*|executive\w*|coordinator\w*|analyst\w*|controller\w*|bookkeep\w*|hq)'
        then 'office'
      -- Anyone with "manager" in their title is a store manager.
      when p_role is not null and lower(p_role) like '%manager%'
        then 'manager'
      -- Everyone else defaults to the store-employee ladder.
      else 'employee'
    end;
$$;

comment on function public.pto_employee_cohort(text) is
  'Maps employee.role to PTO cohort (office / manager / employee). Uses keyword heuristics — explicit override lives on employees.pto_cohort.';

-- ---------------------------------------------------------------------------
-- 4. Entitlement function prefers the explicit override
-- ---------------------------------------------------------------------------
create or replace function public.pto_entitlement_hours_for_employee(
  p_employee_id uuid,
  p_bucket text,
  p_as_of date
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  emp record;
  pol record;
  emp_cohort text;
  yos int;
  hours numeric;
begin
  select e.id, e.role, e.employment_start_date, e.fte_ratio, e.pto_cohort
  into emp
  from public.employees e
  where e.id = p_employee_id;

  if emp.id is null then
    return 0;
  end if;

  select p.id, p.standard_day_hours
  into pol
  from public.pto_policies p
  order by p.created_at asc
  limit 1;

  -- Explicit override beats the role heuristic. Useful for owners /
  -- back-office staff whose `role` text doesn't match the keyword regex.
  emp_cohort := coalesce(nullif(trim(emp.pto_cohort), ''), public.pto_employee_cohort(emp.role));
  yos := public.pto_years_of_service(emp.employment_start_date, p_as_of);

  select t.annual_hours
  into hours
  from public.pto_entitlement_tiers t
  where t.policy_id = pol.id
    and t.bucket = p_bucket
    and t.min_years_of_service <= yos
    and (
      (p_bucket = 'sick' and t.cohort = 'all')
      or (p_bucket = 'vacation' and t.cohort = emp_cohort)
    )
  order by t.min_years_of_service desc
  limit 1;

  hours := coalesce(hours, 0);

  -- Policy text says part-time pro-rata applies to vacation; sick is not mentioned.
  if p_bucket = 'vacation' then
    hours := hours * coalesce(emp.fte_ratio, 1);
  end if;

  return greatest(0, hours);
end;
$$;

comment on function public.pto_entitlement_hours_for_employee(uuid, text, date) is
  'Annual entitlement (hours) for an employee + bucket. Prefers explicit employees.pto_cohort override, otherwise infers from role. Vacation is pro-rated by employees.fte_ratio.';

-- ---------------------------------------------------------------------------
-- 5. Seed the office vacation ladder for the default policy
-- ---------------------------------------------------------------------------
-- HR policy:
--   1 year of service  -> 5 days
--   2 years            -> 10 days
--   5 years            -> 15 days
--   10+ years          -> 20 days
-- Office sick leave is unchanged (cohort = 'all' already covers everyone).
with cfg as (
  select p.id as policy_id, p.standard_day_hours as d
  from public.pto_policies p
  where p.id = 'f0000000-0000-4000-8000-000000000001'::uuid
)
insert into public.pto_entitlement_tiers (policy_id, bucket, cohort, min_years_of_service, annual_hours)
select cfg.policy_id, 'vacation'::text, 'office'::text, v.min_years, (v.annual_days * cfg.d) as annual_hours
from cfg
join (
  values
    (1, 5),
    (2, 10),
    (5, 15),
    (10, 20)
) as v(min_years, annual_days)
  on true
on conflict (policy_id, bucket, cohort, min_years_of_service)
do update set annual_hours = excluded.annual_hours;
