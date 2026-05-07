-- Track C (Payroll rules + unified export): payroll_policies.
--
-- One row per scope:
--   * `location_id IS NULL`  → the global default (org-wide).
--   * `location_id IS NOT NULL` → store-specific override; falls back to the global row when absent.
--
-- Lookup contract (used by `lib/payroll/payable-hours.ts` + the unified payroll
-- CSV builder): pick the most-specific row that matches the time clock's
-- location, otherwise the global row.
--
-- Owner-only writes via RLS. Reads are open to authenticated users so the
-- timesheet panel and labor reports can compute hours without a privileged
-- gate.

create table if not exists public.payroll_policies (
  id uuid primary key default gen_random_uuid(),
  /** NULL = global default. NOT NULL = store-specific override. */
  location_id uuid references public.locations(id) on delete cascade,
  /** Hours of *worked* time per week above which excess is OT-eligible. */
  weekly_ot_threshold numeric not null default 40,
  /** Optional daily threshold (e.g. CA 8h). NULL = no daily OT. */
  daily_ot_threshold numeric,
  /** Multiplier applied to OT hours. Default 1.5x (time-and-a-half). */
  ot_multiplier numeric not null default 1.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_policies_weekly_ot_chk
    check (weekly_ot_threshold is null or weekly_ot_threshold >= 0),
  constraint payroll_policies_daily_ot_chk
    check (daily_ot_threshold is null or daily_ot_threshold >= 0),
  constraint payroll_policies_multiplier_chk
    check (ot_multiplier >= 1)
);

comment on table public.payroll_policies is
  'Per-location overtime config. NULL location_id = global default; lookup is "most specific match wins".';

-- Exactly one global row.
create unique index if not exists payroll_policies_global_unique
  on public.payroll_policies ((coalesce(location_id::text, 'GLOBAL')))
  where location_id is null;

-- Exactly one row per non-null location.
create unique index if not exists payroll_policies_location_unique
  on public.payroll_policies (location_id)
  where location_id is not null;

create or replace function public.touch_payroll_policies_updated_at()
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

drop trigger if exists payroll_policies_touch_updated_at on public.payroll_policies;
create trigger payroll_policies_touch_updated_at
  before update on public.payroll_policies
  for each row execute function public.touch_payroll_policies_updated_at();

-- --- RLS ----------------------------------------------------------------------

alter table public.payroll_policies enable row level security;

drop policy if exists "payroll_policies_select_auth" on public.payroll_policies;
create policy "payroll_policies_select_auth"
  on public.payroll_policies for select to authenticated
  using (true);

drop policy if exists "payroll_policies_insert_owner" on public.payroll_policies;
create policy "payroll_policies_insert_owner"
  on public.payroll_policies for insert to authenticated
  with check (public.is_org_owner());

drop policy if exists "payroll_policies_update_owner" on public.payroll_policies;
create policy "payroll_policies_update_owner"
  on public.payroll_policies for update to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

drop policy if exists "payroll_policies_delete_owner" on public.payroll_policies;
create policy "payroll_policies_delete_owner"
  on public.payroll_policies for delete to authenticated
  using (public.is_org_owner());

-- --- Seed the default global row ---------------------------------------------

insert into public.payroll_policies (location_id, weekly_ot_threshold, daily_ot_threshold, ot_multiplier)
select null, 40, null, 1.5
where not exists (
  select 1 from public.payroll_policies where location_id is null
);
