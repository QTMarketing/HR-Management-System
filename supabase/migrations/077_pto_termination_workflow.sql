-- Phase 5 (PTO + ledger): termination payout / forfeit automation.
--
-- HR policy:
--   - Resignation / Layoff / Retirement → unused vacation is paid out
--   - Termination for cause              → unused vacation is forfeited
--
-- The ledger schema already has the right entry types (termination_payout
-- + termination_forfeit) and the employee profile UI already knows how to
-- render them. What was missing:
--   1. A `termination_reason` field so we know which branch to run.
--   2. A `termination_at` audit timestamp.
--   3. An idempotent RPC + a status trigger that automatically emits the
--      correct ledger row when an Owner flips an employee inactive.
--
-- Sick days are *never* paid out on termination — HR policy says they're
-- forfeited along with all other unused sick balance. We honour that by
-- only touching the vacation bucket here.
--
-- Idempotent — safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Termination columns on employees
-- ---------------------------------------------------------------------------
alter table public.employees
  add column if not exists termination_reason text;

alter table public.employees
  add column if not exists termination_at timestamptz;

alter table public.employees
  drop constraint if exists employees_termination_reason_check;

alter table public.employees
  add constraint employees_termination_reason_check
  check (
    termination_reason is null
    or termination_reason in ('resignation', 'layoff', 'retirement', 'for_cause')
  );

comment on column public.employees.termination_reason is
  'Why the employee left. Drives PTO payout vs. forfeit on termination. NULL while active.';
comment on column public.employees.termination_at is
  'When the employee was marked inactive (sets the effective_at on the auto-emitted ledger entry).';

-- ---------------------------------------------------------------------------
-- 2. Idempotency: one termination ledger row per employee/bucket
-- ---------------------------------------------------------------------------
create unique index if not exists pto_ledger_termination_unique
  on public.pto_ledger_entries (employee_id, bucket)
  where entry_type in ('termination_payout', 'termination_forfeit');

-- ---------------------------------------------------------------------------
-- 3. Settlement: internal worker + owner-gated public RPC
-- ---------------------------------------------------------------------------
-- The actual ledger write happens in `pto_settle_termination_internal()`.
-- That function has *no* authorization gate so it can be called from the
-- BEFORE-UPDATE trigger below regardless of who's doing the status flip.
--
-- Why this is safe: `termination_reason` itself is only ever set through
-- the Owner-gated server action `updateEmployeeProfile()`. Without a
-- reason set, the internal function is a no-op. So a non-Owner can never
-- *cause* a settlement; they can only allow one to complete that an
-- Owner already authorized by setting the reason.
--
-- The public `pto_apply_termination()` wrapper keeps its is_org_owner()
-- gate for future "Apply termination" buttons or scripted calls.
create or replace function public.pto_settle_termination_internal(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  emp record;
  pol record;
  bal numeric;
  effective_at timestamptz;
  entry_type text;
  inserted_id uuid;
begin
  select e.id, e.status, e.termination_reason, e.termination_at, e.full_name
  into emp
  from public.employees e
  where e.id = p_employee_id;

  if emp.id is null then
    raise exception 'employee not found: %', p_employee_id;
  end if;

  if emp.termination_reason is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'No termination reason set; cannot apply payout/forfeit.'
    );
  end if;

  select p.id, p.timezone
  into pol
  from public.pto_policies p
  order by p.created_at asc
  limit 1;

  effective_at := coalesce(emp.termination_at, now());
  bal := public.pto_balance_hours_as_of(emp.id, 'vacation', effective_at);
  if bal is null then bal := 0; end if;

  -- Voluntary separations (resignation / layoff / retirement) pay out.
  -- For-cause terminations forfeit.
  if emp.termination_reason in ('resignation', 'layoff', 'retirement') then
    entry_type := 'termination_payout';
  else
    entry_type := 'termination_forfeit';
  end if;

  if bal <= 0 then
    return jsonb_build_object(
      'ok', true,
      'employee_id', emp.id,
      'reason', emp.termination_reason,
      'entry_type', entry_type,
      'hours', 0,
      'noop', true,
      'note', 'No positive vacation balance — nothing to settle.'
    );
  end if;

  insert into public.pto_ledger_entries (
    employee_id,
    bucket,
    entry_type,
    amount_hours,
    effective_at,
    policy_id,
    created_by,
    notes,
    metadata
  )
  values (
    emp.id,
    'vacation',
    entry_type,
    -bal,
    effective_at,
    pol.id,
    public.current_employee_id(),
    case entry_type
      when 'termination_payout' then 'Termination payout: ' || coalesce(emp.termination_reason, 'voluntary')
      else 'Termination forfeit: ' || coalesce(emp.termination_reason, 'for cause')
    end,
    jsonb_build_object('reason', emp.termination_reason)
  )
  on conflict do nothing
  returning id into inserted_id;

  return jsonb_build_object(
    'ok', true,
    'employee_id', emp.id,
    'reason', emp.termination_reason,
    'entry_type', entry_type,
    'hours', bal,
    'ledger_entry_id', inserted_id,
    'noop', inserted_id is null
  );
end;
$$;

comment on function public.pto_settle_termination_internal(uuid) is
  'Trusted worker: writes the termination payout/forfeit ledger entry. Called by the employees status trigger; bypasses is_org_owner because the gate lives on writing employees.termination_reason.';

-- Lock the worker down so direct callers can't bypass the gate.
revoke all on function public.pto_settle_termination_internal(uuid) from public;
revoke all on function public.pto_settle_termination_internal(uuid) from authenticated;

-- Public Owner-gated wrapper. Same return shape; suitable for direct
-- invocation from server actions / admin scripts.
create or replace function public.pto_apply_termination(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_org_owner() then
    raise exception 'forbidden';
  end if;
  return public.pto_settle_termination_internal(p_employee_id);
end;
$$;

comment on function public.pto_apply_termination(uuid) is
  'Owner-only RPC wrapper around pto_settle_termination_internal. Idempotent.';

-- ---------------------------------------------------------------------------
-- 4. Trigger: auto-apply on status flip to inactive
-- ---------------------------------------------------------------------------
-- When an Owner sets `employees.status = 'inactive'` AND
-- `termination_reason` is non-null, automatically run the RPC. Skips
-- gracefully when either condition isn't met (e.g. the row is just being
-- archived without a stated reason — HR can apply manually later).
create or replace function public.pto_on_employee_termination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  -- Only fire when transitioning into a terminated state, OR when a
  -- reason is being added to an already-inactive row. Either way:
  --   final state must be (status != 'active' AND termination_reason is set).
  if not (new.status in ('inactive', 'archived') and new.termination_reason is not null) then
    return new;
  end if;

  -- Skip if no actual change of intent (status/reason both unchanged).
  if old.status = new.status
     and old.termination_reason is not distinct from new.termination_reason then
    return new;
  end if;

  -- Default termination_at to "now" if the row didn't get an explicit
  -- timestamp set. We do this with a separate update so the trigger sees
  -- the value on the new row even though we're inside the BEFORE/AFTER.
  if new.termination_at is null then
    new.termination_at := now();
  end if;

  -- Call the *internal* worker (no is_org_owner gate) so the settlement
  -- still runs when a non-Owner (e.g. Store Manager) is the one flipping
  -- status. The gate that matters lives on writing `termination_reason`,
  -- which is enforced server-side in updateEmployeeProfile().
  --
  -- Don't let a flaky settlement block the status flip. Errors land in
  -- the postgres log instead of bubbling up to the UI.
  begin
    result := public.pto_settle_termination_internal(new.id);
    raise notice 'pto_settle_termination_internal(%) -> %', new.id, result;
  exception when others then
    raise warning 'pto_settle_termination_internal failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_pto_on_employee_termination on public.employees;
create trigger trg_pto_on_employee_termination
  before update of status, termination_reason
  on public.employees
  for each row
  execute function public.pto_on_employee_termination();

comment on function public.pto_on_employee_termination() is
  'BEFORE UPDATE trigger: auto-applies PTO termination payout/forfeit when an employee is set inactive with a stated reason.';
