-- Track B (Pay-period close lock): pay_periods table + database-level lock trigger.
--
-- The contract:
--   * One row per concrete pay period instance per time clock (e.g. "Clock 18,
--     2026-04-13 → 2026-04-26").
--   * `status = 'locked'` snapshots the period for payroll. While a period is
--     locked, the database itself blocks any insert / update / delete on
--     `time_entries` whose `clock_in_at` falls inside it. This is enforced by
--     a trigger so it survives any RLS bypass / direct SQL / future API surface.
--   * Owners are the only role that can lock or unlock (RLS).
--
-- Unlocking is a deliberate Owner action — there is no "auto-unlock". This
-- mirrors what payroll teams expect from Connecteam / ADP "close period".

-- --- pay_periods --------------------------------------------------------------

create table if not exists public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  time_clock_id uuid not null references public.time_clocks(id) on delete cascade,
  /** Inclusive local-calendar dates. */
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'locked')),
  locked_at timestamptz,
  locked_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pay_periods_end_after_start_chk check (end_date >= start_date),
  constraint pay_periods_lock_metadata_chk check (
    (status = 'locked' and locked_at is not null)
    or (status = 'open' and locked_at is null and locked_by is null)
  )
);

comment on table public.pay_periods is
  'Concrete pay-period instances per time clock. status=locked snapshots the period for payroll; trigger blocks time_entries writes inside any locked period.';

create unique index if not exists pay_periods_unique_per_clock
  on public.pay_periods (time_clock_id, start_date, end_date);

create index if not exists pay_periods_clock_status_idx
  on public.pay_periods (time_clock_id, status, start_date desc);

-- Keep updated_at honest.
create or replace function public.touch_pay_periods_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pay_periods_touch_updated_at on public.pay_periods;
create trigger pay_periods_touch_updated_at
  before update on public.pay_periods
  for each row execute function public.touch_pay_periods_updated_at();

-- --- RLS: read for managers/owners, write Owner-only ------------------------

alter table public.pay_periods enable row level security;

drop policy if exists "pay_periods_select_managers" on public.pay_periods;
create policy "pay_periods_select_managers"
  on public.pay_periods for select to authenticated
  using (
    public.is_org_owner()
    or exists (
      select 1 from public.time_clocks tc
      where tc.id = pay_periods.time_clock_id
        and public.can_view_location(tc.location_id)
    )
  );

drop policy if exists "pay_periods_insert_owner" on public.pay_periods;
create policy "pay_periods_insert_owner"
  on public.pay_periods for insert to authenticated
  with check (public.is_org_owner());

drop policy if exists "pay_periods_update_owner" on public.pay_periods;
create policy "pay_periods_update_owner"
  on public.pay_periods for update to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

drop policy if exists "pay_periods_delete_owner" on public.pay_periods;
create policy "pay_periods_delete_owner"
  on public.pay_periods for delete to authenticated
  using (public.is_org_owner());

-- --- The lock trigger on time_entries ---------------------------------------
--
-- Logic:
--   * On INSERT: block if NEW.clock_in_at falls inside a locked pay_period for
--     the same time_clock_id.
--   * On UPDATE: block if either OLD or NEW clock_in_at falls inside a locked
--     period. Catches both "edit a locked punch" and "move a punch into a
--     locked period". Also blocks status changes (approval flips, archives).
--   * On DELETE: block if OLD.clock_in_at falls inside a locked period.

create or replace function public.assert_time_entry_not_in_locked_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clock_in timestamptz;
  v_clock_id uuid;
  v_period record;
begin
  if tg_op = 'DELETE' then
    v_clock_in := old.clock_in_at;
    v_clock_id := old.time_clock_id;
  else
    v_clock_in := new.clock_in_at;
    v_clock_id := new.time_clock_id;
  end if;

  if v_clock_id is null or v_clock_in is null then
    -- No clock or no timestamp = nothing to compare against. Allow.
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select pp.start_date, pp.end_date
    into v_period
    from public.pay_periods pp
   where pp.time_clock_id = v_clock_id
     and pp.status = 'locked'
     and (v_clock_in at time zone 'UTC')::date between pp.start_date and pp.end_date
   limit 1;

  if v_period.start_date is not null then
    raise exception
      'Time entry is inside a locked pay period (% to %). Unlock the period before editing.',
      v_period.start_date, v_period.end_date
      using errcode = 'P0001';
  end if;

  -- For UPDATE, also block when the *previous* clock_in_at was inside a locked period
  -- (covers "drag this old punch out of the locked window").
  if tg_op = 'UPDATE' then
    select pp.start_date, pp.end_date
      into v_period
      from public.pay_periods pp
     where pp.time_clock_id = old.time_clock_id
       and pp.status = 'locked'
       and (old.clock_in_at at time zone 'UTC')::date between pp.start_date and pp.end_date
     limit 1;

    if v_period.start_date is not null then
      raise exception
        'Time entry was inside a locked pay period (% to %). Unlock the period before editing.',
        v_period.start_date, v_period.end_date
        using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.assert_time_entry_not_in_locked_period() is
  'Blocks any insert/update/delete on time_entries whose clock_in_at falls inside a locked pay_periods row for the same time_clock_id.';

drop trigger if exists time_entries_block_locked_period on public.time_entries;
create trigger time_entries_block_locked_period
  before insert or update or delete on public.time_entries
  for each row execute function public.assert_time_entry_not_in_locked_period();
