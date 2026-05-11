-- Region (chain) level payroll defaults.
--
-- East and West stores have historically run on different payroll calendars
-- (Thursday vs Monday week start; offset bi-weekly anchors). Migration 053
-- bulk-applied those defaults to every clock as a one-off. This migration
-- promotes that decision into a first-class table so Owners can edit the
-- region default in the UI and have it propagate to every clock in that chain.
--
-- Idempotent: safe to run multiple times.

create table if not exists public.chain_payroll_defaults (
  chain_id uuid primary key references public.chains(id) on delete cascade,
  -- One of: 'weekly' | 'bi_weekly' | 'monthly' | 'semi_monthly'.
  -- Kept as text to mirror time_clocks.timesheet_period_kind and avoid an enum
  -- migration when new cadences are added.
  timesheet_period_kind text not null default 'bi_weekly'
    check (timesheet_period_kind in ('weekly', 'bi_weekly', 'monthly', 'semi_monthly')),
  -- 0=Sunday … 6=Saturday. Mirrors time_clocks config payload.
  week_starts_on smallint not null default 1
    check (week_starts_on between 0 and 6),
  -- Bi-weekly epoch (the end-of-last-pay-period date as the user types it in
  -- the form; stored as a local calendar date). For non-bi_weekly cadences
  -- this may still be set so the value is sticky if the user toggles back.
  biweekly_anchor_start date,
  -- Mirrors `timesheet_period_config.monthly_ends_on` semantics.
  -- Allowed: '26'..'30' or 'last_day'. Optional.
  monthly_ends_on text
    check (monthly_ends_on is null
           or monthly_ends_on in ('26','27','28','29','30','last_day')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null
);

create index if not exists chain_payroll_defaults_updated_at_idx
  on public.chain_payroll_defaults (updated_at desc);

comment on table public.chain_payroll_defaults is
  'Region-level (chain) payroll defaults. Owner-edited; bulk-applied to every time_clock in the chain on save.';

alter table public.chain_payroll_defaults enable row level security;

drop policy if exists "chain_payroll_defaults_select_auth" on public.chain_payroll_defaults;
create policy "chain_payroll_defaults_select_auth"
  on public.chain_payroll_defaults for select to authenticated using (true);

drop policy if exists "chain_payroll_defaults_select_anon" on public.chain_payroll_defaults;
create policy "chain_payroll_defaults_select_anon"
  on public.chain_payroll_defaults for select to anon using (true);

drop policy if exists "chain_payroll_defaults_insert_auth" on public.chain_payroll_defaults;
create policy "chain_payroll_defaults_insert_auth"
  on public.chain_payroll_defaults for insert to authenticated with check (true);

drop policy if exists "chain_payroll_defaults_update_auth" on public.chain_payroll_defaults;
create policy "chain_payroll_defaults_update_auth"
  on public.chain_payroll_defaults for update to authenticated using (true) with check (true);

-- Seed initial rows for the two existing chains using the legacy values
-- that migration 053 established. Idempotent: on conflict, keep existing.
insert into public.chain_payroll_defaults
  (chain_id, timesheet_period_kind, week_starts_on, biweekly_anchor_start)
values
  -- East: Thursday start, bi-weekly anchored at 2025-12-25
  ('c0000000-0000-4000-8000-000000000001', 'bi_weekly', 4, date '2025-12-25'),
  -- West: Monday start, bi-weekly anchored at 2025-12-15
  ('c0000000-0000-4000-8000-000000000002', 'bi_weekly', 1, date '2025-12-15')
on conflict (chain_id) do nothing;
