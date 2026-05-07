-- Phase 5 (PTO + ledger): append-only PTO ledger + policy config.
--
-- This migration intentionally focuses on data primitives:
-- - PTO buckets: vacation + sick
-- - Policy tables to express years-of-service ladders
-- - Append-only ledger for accrual/usage/forfeit/payout events
-- - A simple balance view for "as-of now"
--
-- Wiring ledger usage to time_off_records approvals will be added in a follow-up migration.

-- --- Employees: add FTE ratio for part-time pro-rata ---
alter table public.employees
  add column if not exists fte_ratio numeric not null default 1;

comment on column public.employees.fte_ratio is
  '0..1 ratio used for PTO pro-rata (1 = full-time). Source of truth defined by HR.';

alter table public.employees
  drop constraint if exists employees_fte_ratio_range_check;

alter table public.employees
  add constraint employees_fte_ratio_range_check
  check (fte_ratio > 0 and fte_ratio <= 1);

-- --- PTO policies (org-wide defaults; can be extended later to per-chain/per-location) ---
create table if not exists public.pto_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Default PTO policy',
  timezone text not null default 'UTC',
  standard_day_hours numeric not null default 8,
  -- Vacation cap: max balance allowed (in hours). NULL means "no cap enforced yet".
  vacation_max_accrual_hours numeric,
  january_payout_window_days int not null default 31,
  created_at timestamptz not null default now()
);

comment on table public.pto_policies is
  'PTO policy configuration. Ledger is source of truth for balances.';

-- --- PTO entitlement tiers (calendar-year grant amounts expressed by years of service) ---
create table if not exists public.pto_entitlement_tiers (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.pto_policies(id) on delete cascade,
  bucket text not null,
  cohort text not null,
  min_years_of_service int not null,
  annual_hours numeric not null,
  created_at timestamptz not null default now(),
  constraint pto_entitlement_tiers_bucket_check
    check (bucket in ('vacation', 'sick')),
  constraint pto_entitlement_tiers_cohort_check
    check (cohort in ('employee', 'manager', 'all')),
  constraint pto_entitlement_tiers_min_years_check
    check (min_years_of_service >= 0),
  constraint pto_entitlement_tiers_annual_hours_check
    check (annual_hours >= 0)
);

create unique index if not exists pto_entitlement_tiers_unique
  on public.pto_entitlement_tiers (policy_id, bucket, cohort, min_years_of_service);

comment on table public.pto_entitlement_tiers is
  'Annual PTO entitlement by bucket/cohort/years-of-service. Service years computed from employees.employment_start_date.';

-- Seed default policy + tiers (safe to run multiple times).
insert into public.pto_policies (id, name)
values ('f0000000-0000-4000-8000-000000000001', 'Default PTO policy')
on conflict (id) do update set name = excluded.name;

-- Default ladder assumptions (can be edited later in UI/admin tooling):
-- - Sick: 5 days/year after 2 years of service (no carryover).
-- - Vacation managers: 5 days after 1 year, +1 day per year to 10 days at 6+ years.
-- - Vacation employees: 5 days after 2 years, +1 day per year to 10 days at 7+ years.
-- Expressed in hours using standard_day_hours = 8 for the default policy.
with cfg as (
  select p.id as policy_id, p.standard_day_hours as d
  from public.pto_policies p
  where p.id = 'f0000000-0000-4000-8000-000000000001'::uuid
)
insert into public.pto_entitlement_tiers (policy_id, bucket, cohort, min_years_of_service, annual_hours)
select cfg.policy_id, v.bucket, v.cohort, v.min_years, (v.annual_days * cfg.d) as annual_hours
from cfg
join (
  values
    ('sick', 'all', 2, 5),
    ('vacation', 'manager', 1, 5),
    ('vacation', 'manager', 2, 6),
    ('vacation', 'manager', 3, 7),
    ('vacation', 'manager', 4, 8),
    ('vacation', 'manager', 5, 9),
    ('vacation', 'manager', 6, 10),
    ('vacation', 'employee', 2, 5),
    ('vacation', 'employee', 3, 6),
    ('vacation', 'employee', 4, 7),
    ('vacation', 'employee', 5, 8),
    ('vacation', 'employee', 6, 9),
    ('vacation', 'employee', 7, 10)
) as v(bucket, cohort, min_years, annual_days)
  on true
on conflict (policy_id, bucket, cohort, min_years_of_service)
do update set annual_hours = excluded.annual_hours;

-- --- PTO ledger (append-only) ---
create table if not exists public.pto_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  bucket text not null,
  entry_type text not null,
  amount_hours numeric not null,
  effective_at timestamptz not null,
  -- Optional linkage for auditability
  time_off_record_id uuid references public.time_off_records(id) on delete set null,
  policy_id uuid references public.pto_policies(id) on delete set null,
  created_by uuid references public.employees(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pto_ledger_entries_bucket_check
    check (bucket in ('vacation', 'sick')),
  constraint pto_ledger_entries_entry_type_check
    check (
      entry_type in (
        'annual_grant',
        'usage',
        'adjustment',
        'forfeit',
        'payout',
        'termination_payout',
        'termination_forfeit',
        'opening_balance'
      )
    ),
  constraint pto_ledger_entries_amount_nonzero
    check (amount_hours <> 0)
);

create index if not exists pto_ledger_entries_employee_bucket_effective_idx
  on public.pto_ledger_entries (employee_id, bucket, effective_at desc);

create index if not exists pto_ledger_entries_time_off_record_idx
  on public.pto_ledger_entries (time_off_record_id);

comment on table public.pto_ledger_entries is
  'Append-only ledger for PTO. Balance is sum(amount_hours) per employee/bucket.';

-- --- Balance view (as-of now) ---
-- security_invoker: enforce RLS on underlying tables for the querying user (not the view owner).
create or replace view public.pto_employee_balances
with (security_invoker = true) as
with buckets as (
  select unnest(array['vacation'::text, 'sick'::text]) as bucket
)
select
  e.id as employee_id,
  b.bucket,
  coalesce(sum(le.amount_hours) filter (where le.effective_at <= now()), 0) as balance_hours
from public.employees e
cross join buckets b
left join public.pto_ledger_entries le
  on le.employee_id = e.id
  and le.bucket = b.bucket
group by e.id, b.bucket;

comment on view public.pto_employee_balances is
  'Current PTO balance in hours per employee/bucket (computed from pto_ledger_entries).';

-- --- RLS ---
alter table public.pto_policies enable row level security;
alter table public.pto_entitlement_tiers enable row level security;
alter table public.pto_ledger_entries enable row level security;

-- Policies + tiers: readable to authenticated; writable later (Owner-only) when UI is added.
drop policy if exists "pto_policies_select_auth" on public.pto_policies;
create policy "pto_policies_select_auth"
  on public.pto_policies for select to authenticated using (true);

drop policy if exists "pto_entitlement_tiers_select_auth" on public.pto_entitlement_tiers;
create policy "pto_entitlement_tiers_select_auth"
  on public.pto_entitlement_tiers for select to authenticated using (true);

-- Ledger: employee can see own; managers/owners can see for locations they can edit.
drop policy if exists "pto_ledger_entries_select_scoped" on public.pto_ledger_entries;
create policy "pto_ledger_entries_select_scoped"
  on public.pto_ledger_entries for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or exists (
      select 1
      from public.employees e
      where e.id = pto_ledger_entries.employee_id
        and public.can_edit_location(e.location_id)
    )
  );

-- Inserts/updates/deletes are intentionally restricted for now (future: Owner/HR tooling).
drop policy if exists "pto_ledger_entries_insert_denied" on public.pto_ledger_entries;
create policy "pto_ledger_entries_insert_denied"
  on public.pto_ledger_entries for insert to authenticated with check (false);

drop policy if exists "pto_ledger_entries_update_denied" on public.pto_ledger_entries;
create policy "pto_ledger_entries_update_denied"
  on public.pto_ledger_entries for update to authenticated using (false) with check (false);

drop policy if exists "pto_ledger_entries_delete_denied" on public.pto_ledger_entries;
create policy "pto_ledger_entries_delete_denied"
  on public.pto_ledger_entries for delete to authenticated using (false);

