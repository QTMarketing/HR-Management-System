-- Fix: PL/pgSQL variable `effective_at` shadowed column name in ON CONFLICT target.

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
