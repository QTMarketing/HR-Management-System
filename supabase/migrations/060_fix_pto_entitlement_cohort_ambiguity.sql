-- Fix: "column reference cohort is ambiguous" in pto_entitlement_hours_for_employee.
-- Root cause: local variable name `cohort` conflicts with pto_entitlement_tiers.cohort.

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
  select e.id, e.role, e.employment_start_date, e.fte_ratio
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

  emp_cohort := public.pto_employee_cohort(emp.role);
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

  if p_bucket = 'vacation' then
    hours := hours * coalesce(emp.fte_ratio, 1);
  end if;

  return greatest(0, hours);
end;
$$;

