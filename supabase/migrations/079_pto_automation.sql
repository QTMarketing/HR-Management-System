-- PTO automation: run history + scheduled job support (service role).

-- --- Automation toggles on policy -------------------------------------------

alter table public.pto_policies
  add column if not exists year_rollover_auto_enabled boolean not null default true,
  add column if not exists monthly_cashout_auto_enabled boolean not null default false;

comment on column public.pto_policies.year_rollover_auto_enabled is
  'When true, daily cron may run calendar-year rollover on Jan 1 (policy timezone).';
comment on column public.pto_policies.monthly_cashout_auto_enabled is
  'When true, daily cron may run vacation cash-out on configured day of month.';

-- --- Run log ------------------------------------------------------------------

create table if not exists public.pto_automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('year_rollover', 'monthly_cashout')),
  period_key text not null,
  status text not null check (status in ('running', 'success', 'failed', 'skipped')),
  triggered_by text not null check (triggered_by in ('manual', 'scheduled', 'cron')),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists pto_automation_runs_started_at_idx
  on public.pto_automation_runs (started_at desc);

comment on table public.pto_automation_runs is
  'Audit log for automated and manual PTO batch jobs (year rollover, monthly cash-out).';

alter table public.pto_automation_runs enable row level security;

drop policy if exists "pto_automation_runs_select_owner" on public.pto_automation_runs;
create policy "pto_automation_runs_select_owner"
  on public.pto_automation_runs for select to authenticated
  using (public.is_org_owner());

-- --- Allow service-role cron to call batch RPCs --------------------------------

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
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_org_owner() then
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

-- Patch monthly cash-out RPC (service_role bypass; keeps January window from 078).
create or replace function public.pto_run_monthly_vacation_cashout(
  p_year int,
  p_month int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pol record;
  v_effective_at timestamptz;
  asof_prev timestamptz;
  emp record;
  bal numeric;
  inserted int := 0;
  hours_paid numeric := 0;
  month_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_org_owner() then
    raise exception 'forbidden';
  end if;

  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'invalid year: %', p_year;
  end if;
  if p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'invalid month: %', p_month;
  end if;

  select p.id, p.timezone,
         p.vacation_cashout_enabled,
         p.vacation_cashout_day,
         p.vacation_cashout_min_balance_hours,
         p.january_payout_window_days
  into pol
  from public.pto_policies p
  order by p.created_at asc
  limit 1;

  if pol.id is null then
    raise exception 'missing pto_policies row';
  end if;

  if pol.vacation_cashout_enabled is distinct from true then
    return jsonb_build_object(
      'ok', false,
      'error', 'Vacation cash-out is disabled in policy.'
    );
  end if;

  if coalesce(pol.january_payout_window_days, 0) > 0 and p_month <> 1 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Vacation pay-outs are only allowed in January under the current policy. '
            || 'Set january_payout_window_days = 0 on pto_policies to disable this restriction.'
    );
  end if;

  if coalesce(pol.january_payout_window_days, 0) > 0
     and p_month = 1
     and pol.vacation_cashout_day > pol.january_payout_window_days then
    return jsonb_build_object(
      'ok', false,
      'error', format(
        'Cash-out day (%s) is outside the January pay-out window (%s days). Fix the policy first.',
        pol.vacation_cashout_day,
        pol.january_payout_window_days
      )
    );
  end if;

  v_effective_at := make_timestamp(p_year, p_month, pol.vacation_cashout_day, 0, 0, 0) at time zone pol.timezone;
  asof_prev := v_effective_at - interval '1 second';
  month_key := to_char((v_effective_at at time zone pol.timezone)::date, 'YYYY-MM');

  for emp in
    select e.id
    from public.employees e
    where e.status = 'active'
  loop
    bal := public.pto_balance_hours_as_of(emp.id, 'vacation', asof_prev);
    if bal is null then bal := 0; end if;
    if bal <= 0 then
      continue;
    end if;
    if pol.vacation_cashout_min_balance_hours is not null and bal < pol.vacation_cashout_min_balance_hours then
      continue;
    end if;

    insert into public.pto_ledger_entries (
      employee_id, bucket, entry_type, amount_hours, effective_at, policy_id, created_by, notes, metadata
    )
    values (
      emp.id,
      'vacation',
      'payout',
      -bal,
      v_effective_at,
      pol.id,
      public.current_employee_id(),
      'Monthly vacation cash-out',
      jsonb_build_object(
        'reason', 'monthly_cashout',
        'month', month_key,
        'as_of', asof_prev
      )
    )
    on conflict (employee_id, bucket, effective_at)
    where entry_type = 'payout' and (metadata->>'reason') = 'monthly_cashout'
    do nothing;

    if found then
      inserted := inserted + 1;
      hours_paid := hours_paid + bal;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'year', p_year,
    'month', p_month,
    'effective_at', v_effective_at,
    'payouts_inserted', inserted,
    'hours_paid_out', hours_paid
  );
end;
$$;
