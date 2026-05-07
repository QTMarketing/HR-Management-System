-- Phase 5 (PTO + ledger): calendar-year rollover automation.
--
-- Adds:
-- - helpers to compute years of service + cohort
-- - helper to compute PTO balance as-of timestamp
-- - owner-only RPC to run year rollover:
--   - forfeit unused vacation + sick (no carryover)
--   - grant annual entitlements per pto_entitlement_tiers
--   - enforce optional vacation max accrual cap

-- --- Helpers ---
create or replace function public.pto_employee_cohort(p_role text)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    case
      when p_role is null then 'employee'
      when lower(p_role) like '%manager%' then 'manager'
      else 'employee'
    end;
$$;

comment on function public.pto_employee_cohort(text) is
  'Maps employee.role to PTO cohort (manager vs employee).';

create or replace function public.pto_years_of_service(p_start_date date, p_as_of date)
returns int
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select greatest(0, extract(year from age(p_as_of, p_start_date))::int);
$$;

comment on function public.pto_years_of_service(date, date) is
  'Completed years of service as of a date (floor of age).';

create or replace function public.pto_balance_hours_as_of(
  p_employee_id uuid,
  p_bucket text,
  p_as_of timestamptz
)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(le.amount_hours), 0)
  from public.pto_ledger_entries le
  where le.employee_id = p_employee_id
    and le.bucket = p_bucket
    and le.effective_at <= p_as_of;
$$;

comment on function public.pto_balance_hours_as_of(uuid, text, timestamptz) is
  'PTO balance in hours (ledger sum) as of a timestamp.';

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

  -- Pick the best matching tier by min_years_of_service (<= yos).
  -- Sick uses cohort 'all'. Vacation uses manager/employee cohort.
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
  'Annual entitlement (hours) for an employee + bucket, based on tiers and years-of-service. Vacation is pro-rated by employees.fte_ratio.';

-- Idempotency: one annual_grant per employee/bucket per Jan 1 effective_at.
create unique index if not exists pto_ledger_annual_grant_unique
  on public.pto_ledger_entries (employee_id, bucket, effective_at)
  where entry_type = 'annual_grant';

-- Idempotency: allow multiple forfeits on the same timestamp for different reasons.
create unique index if not exists pto_ledger_year_end_forfeit_unique
  on public.pto_ledger_entries (employee_id, bucket, effective_at)
  where entry_type = 'forfeit' and (metadata->>'reason') = 'year_end_forfeit';

create unique index if not exists pto_ledger_cap_forfeit_unique
  on public.pto_ledger_entries (employee_id, bucket, effective_at)
  where entry_type = 'forfeit' and (metadata->>'reason') = 'cap';

-- --- Owner-only rollover RPC ---
create or replace function public.pto_run_year_rollover(p_year int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pol record;
  jan1 timestamptz;
  asof_prev timestamptz;
  asof_date date;
  emp record;
  sick_ent numeric;
  vac_ent numeric;
  vac_cap numeric;
  bal numeric;
  grants int := 0;
  forfeits int := 0;
begin
  if not public.is_org_owner() then
    raise exception 'forbidden';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'invalid year: %', p_year;
  end if;

  select p.id, p.timezone, p.vacation_max_accrual_hours
  into pol
  from public.pto_policies p
  order by p.created_at asc
  limit 1;

  if pol.id is null then
    raise exception 'missing pto_policies row';
  end if;

  jan1 := make_timestamp(p_year, 1, 1, 0, 0, 0) at time zone pol.timezone;
  asof_prev := jan1 - interval '1 second';
  asof_date := (jan1 at time zone pol.timezone)::date;
  vac_cap := pol.vacation_max_accrual_hours;

  for emp in
    select e.id
    from public.employees e
    where e.status = 'active'
  loop
    -- 1) Forfeit unused from prior year (no carryover).
    -- Vacation forfeit
    bal := public.pto_balance_hours_as_of(emp.id, 'vacation', asof_prev);
    if bal > 0 then
      insert into public.pto_ledger_entries (
        employee_id, bucket, entry_type, amount_hours, effective_at, policy_id, created_by, metadata
      )
      values (
        emp.id, 'vacation', 'forfeit', -bal, jan1, pol.id, public.current_employee_id(),
        jsonb_build_object('reason', 'year_end_forfeit', 'for_year', (p_year - 1))
      )
      on conflict (employee_id, bucket, effective_at)
      where entry_type = 'forfeit' and (metadata->>'reason') = 'year_end_forfeit'
      do nothing;
      if found then forfeits := forfeits + 1; end if;
    end if;

    -- Sick forfeit
    bal := public.pto_balance_hours_as_of(emp.id, 'sick', asof_prev);
    if bal > 0 then
      insert into public.pto_ledger_entries (
        employee_id, bucket, entry_type, amount_hours, effective_at, policy_id, created_by, metadata
      )
      values (
        emp.id, 'sick', 'forfeit', -bal, jan1, pol.id, public.current_employee_id(),
        jsonb_build_object('reason', 'year_end_forfeit', 'for_year', (p_year - 1))
      )
      on conflict (employee_id, bucket, effective_at)
      where entry_type = 'forfeit' and (metadata->>'reason') = 'year_end_forfeit'
      do nothing;
      if found then forfeits := forfeits + 1; end if;
    end if;

    -- 2) Annual grants for the new year
    sick_ent := public.pto_entitlement_hours_for_employee(emp.id, 'sick', asof_date);
    if sick_ent > 0 then
      insert into public.pto_ledger_entries (
        employee_id, bucket, entry_type, amount_hours, effective_at, policy_id, created_by, metadata
      )
      values (
        emp.id, 'sick', 'annual_grant', sick_ent, jan1, pol.id, public.current_employee_id(),
        jsonb_build_object('year', p_year)
      )
      on conflict (employee_id, bucket, effective_at)
      where entry_type = 'annual_grant'
      do nothing;
      if found then grants := grants + 1; end if;
    end if;

    vac_ent := public.pto_entitlement_hours_for_employee(emp.id, 'vacation', asof_date);
    if vac_ent > 0 then
      insert into public.pto_ledger_entries (
        employee_id, bucket, entry_type, amount_hours, effective_at, policy_id, created_by, metadata
      )
      values (
        emp.id, 'vacation', 'annual_grant', vac_ent, jan1, pol.id, public.current_employee_id(),
        jsonb_build_object('year', p_year)
      )
      on conflict (employee_id, bucket, effective_at)
      where entry_type = 'annual_grant'
      do nothing;
      if found then grants := grants + 1; end if;
    end if;

    -- 3) Enforce vacation cap (if configured)
    if vac_cap is not null and vac_cap > 0 then
      bal := public.pto_balance_hours_as_of(emp.id, 'vacation', jan1);
      if bal > vac_cap then
        insert into public.pto_ledger_entries (
          employee_id, bucket, entry_type, amount_hours, effective_at, policy_id, created_by, metadata
        )
        values (
          emp.id, 'vacation', 'forfeit', -(bal - vac_cap), jan1, pol.id, public.current_employee_id(),
          jsonb_build_object('reason', 'cap', 'cap_hours', vac_cap, 'year', p_year)
        )
        on conflict (employee_id, bucket, effective_at)
        where entry_type = 'forfeit' and (metadata->>'reason') = 'cap'
        do nothing;
        if found then forfeits := forfeits + 1; end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'year', p_year,
    'effective_at', jan1,
    'grants_inserted', grants,
    'forfeits_inserted', forfeits
  );
end;
$$;

comment on function public.pto_run_year_rollover(int) is
  'Owner-only RPC: forfeit unused prior-year PTO (no carryover), grant annual entitlements for the year, and enforce optional vacation cap.';

