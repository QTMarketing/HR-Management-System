-- Company holidays (automated calendar markers)
-- Run after 035.

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  -- Optional: if you later want "observed" dates when a holiday falls on weekend.
  observed_date date,
  -- Optional future: location-specific holidays
  location_id uuid references public.locations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists company_holidays_date_idx
  on public.company_holidays (holiday_date);

-- Ensure one holiday per date per location (NULL location_id means "org-wide").
-- NOTE: constraints can't use expressions; use a unique index instead.
create unique index if not exists company_holidays_unique_date_location_idx
  on public.company_holidays (
    holiday_date,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.company_holidays enable row level security;

-- Readable by authenticated users (so Schedule/Time Clock can display it).
drop policy if exists "company_holidays_select_auth" on public.company_holidays;
create policy "company_holidays_select_auth"
  on public.company_holidays for select to authenticated using (true);

-- Owner-only writes (enforced later by stricter RBAC/RLS if desired).
drop policy if exists "company_holidays_write_auth" on public.company_holidays;
create policy "company_holidays_write_auth"
  on public.company_holidays for all to authenticated using (true) with check (true);

-- Seed 2026 holidays (as provided).
insert into public.company_holidays (holiday_date, name)
values
  ('2026-01-01'::date, 'New Year''s Day'),
  ('2026-05-25'::date, 'Memorial Day'),
  ('2026-07-04'::date, 'Independence Day'),
  ('2026-09-07'::date, 'Labor Day'),
  ('2026-11-26'::date, 'Thanksgiving Day'),
  ('2026-12-25'::date, 'Christmas Day')
on conflict do nothing;

