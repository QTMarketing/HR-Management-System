-- Phase 5 (PTO + ledger): editable policy settings + Owner-only RLS for policy edits.
--
-- Adds Connecteam-style policy rules to pto_policies:
--   * Workdays (which days of the week count as work days; default Mon-Fri)
--   * Sick balance cap (mirrors vacation cap)
--   * Per-bucket min / max request length, in hours
-- Also unlocks Owner-only writes on pto_policies and pto_entitlement_tiers
-- so the new policy editor can persist changes.

-- --- New columns on pto_policies ------------------------------------------------

alter table public.pto_policies
  add column if not exists work_day_sun boolean not null default false,
  add column if not exists work_day_mon boolean not null default true,
  add column if not exists work_day_tue boolean not null default true,
  add column if not exists work_day_wed boolean not null default true,
  add column if not exists work_day_thu boolean not null default true,
  add column if not exists work_day_fri boolean not null default true,
  add column if not exists work_day_sat boolean not null default false,
  add column if not exists sick_max_accrual_hours numeric,
  add column if not exists vacation_min_request_hours numeric,
  add column if not exists vacation_max_request_hours numeric,
  add column if not exists sick_min_request_hours numeric,
  add column if not exists sick_max_request_hours numeric;

-- Sanity ranges: caps must be non-negative; min/max request must be non-negative;
-- when both min and max are set, min <= max.

alter table public.pto_policies
  drop constraint if exists pto_policies_sick_max_accrual_chk;
alter table public.pto_policies
  add constraint pto_policies_sick_max_accrual_chk
  check (sick_max_accrual_hours is null or sick_max_accrual_hours >= 0);

alter table public.pto_policies
  drop constraint if exists pto_policies_vacation_request_range_chk;
alter table public.pto_policies
  add constraint pto_policies_vacation_request_range_chk
  check (
    (vacation_min_request_hours is null or vacation_min_request_hours >= 0)
    and (vacation_max_request_hours is null or vacation_max_request_hours >= 0)
    and (
      vacation_min_request_hours is null
      or vacation_max_request_hours is null
      or vacation_min_request_hours <= vacation_max_request_hours
    )
  );

alter table public.pto_policies
  drop constraint if exists pto_policies_sick_request_range_chk;
alter table public.pto_policies
  add constraint pto_policies_sick_request_range_chk
  check (
    (sick_min_request_hours is null or sick_min_request_hours >= 0)
    and (sick_max_request_hours is null or sick_max_request_hours >= 0)
    and (
      sick_min_request_hours is null
      or sick_max_request_hours is null
      or sick_min_request_hours <= sick_max_request_hours
    )
  );

-- Existing vacation cap should also be non-negative (was nullable, no constraint).
alter table public.pto_policies
  drop constraint if exists pto_policies_vacation_max_accrual_chk;
alter table public.pto_policies
  add constraint pto_policies_vacation_max_accrual_chk
  check (vacation_max_accrual_hours is null or vacation_max_accrual_hours >= 0);

-- --- RLS: Owner-only writes ----------------------------------------------------

drop policy if exists "pto_policies_update_owner" on public.pto_policies;
create policy "pto_policies_update_owner"
  on public.pto_policies for update to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

drop policy if exists "pto_policies_insert_owner" on public.pto_policies;
create policy "pto_policies_insert_owner"
  on public.pto_policies for insert to authenticated
  with check (public.is_org_owner());

drop policy if exists "pto_policies_delete_owner" on public.pto_policies;
create policy "pto_policies_delete_owner"
  on public.pto_policies for delete to authenticated
  using (public.is_org_owner());

drop policy if exists "pto_entitlement_tiers_insert_owner" on public.pto_entitlement_tiers;
create policy "pto_entitlement_tiers_insert_owner"
  on public.pto_entitlement_tiers for insert to authenticated
  with check (public.is_org_owner());

drop policy if exists "pto_entitlement_tiers_update_owner" on public.pto_entitlement_tiers;
create policy "pto_entitlement_tiers_update_owner"
  on public.pto_entitlement_tiers for update to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

drop policy if exists "pto_entitlement_tiers_delete_owner" on public.pto_entitlement_tiers;
create policy "pto_entitlement_tiers_delete_owner"
  on public.pto_entitlement_tiers for delete to authenticated
  using (public.is_org_owner());

comment on column public.pto_policies.work_day_mon is
  'When true, Monday counts toward calendar-day deductions for time off (Connecteam-style work-day mask).';
comment on column public.pto_policies.sick_max_accrual_hours is
  'Optional balance cap for sick time. NULL = unlimited.';
comment on column public.pto_policies.vacation_min_request_hours is
  'Minimum vacation request length in hours. NULL = no minimum.';
comment on column public.pto_policies.vacation_max_request_hours is
  'Maximum vacation request length in hours. NULL = no maximum.';
comment on column public.pto_policies.sick_min_request_hours is
  'Minimum sick request length in hours. NULL = no minimum.';
comment on column public.pto_policies.sick_max_request_hours is
  'Maximum sick request length in hours. NULL = no maximum.';
