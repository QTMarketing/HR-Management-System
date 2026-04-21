-- Phase 3-ish: Time Clock quick setup — location tracking + categorization (Connecteam-style).
-- Adds per-clock settings for how we capture GPS and what extra dimensions are collected at clock-in.

alter table public.time_clocks
  add column if not exists location_tracking_mode text not null default 'off'
    check (location_tracking_mode in ('off', 'clock_in_out', 'breadcrumbs'));

alter table public.time_clocks
  add column if not exists require_location_for_punch boolean not null default false;

comment on column public.time_clocks.location_tracking_mode is
  'Location tracking preference: off, clock_in_out (capture GPS on clock-in/out), breadcrumbs (future live tracking).';

comment on column public.time_clocks.require_location_for_punch is
  'When true and tracking_mode != off, employee must grant GPS at punch time (even without geofence).';

alter table public.time_clocks
  add column if not exists categorization_mode text not null default 'none'
    check (categorization_mode in ('none', 'job', 'location'));

alter table public.time_clocks
  add column if not exists require_categorization boolean not null default false;

comment on column public.time_clocks.categorization_mode is
  'Optional dimension captured at clock-in: none, job, or location.';

comment on column public.time_clocks.require_categorization is
  'When true, employee must pick a code for the chosen categorization_mode before clock-in succeeds.';

-- Company-wide code lists (Option A: shared across all stores).
create table if not exists public.job_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  color_token text not null default 'slate',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists job_codes_label_key on public.job_codes (lower(label));

create table if not exists public.location_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  color_token text not null default 'slate',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists location_codes_label_key on public.location_codes (lower(label));

comment on table public.job_codes is 'Company-wide punch categorization values when categorization_mode=job.';
comment on table public.location_codes is 'Company-wide punch categorization values when categorization_mode=location.';

-- Store the chosen codes on each punch.
alter table public.time_entries
  add column if not exists location_code_id uuid references public.location_codes (id) on delete set null;

alter table public.time_entries
  add column if not exists job_code_id uuid references public.job_codes (id) on delete set null;

comment on column public.time_entries.job_code_id is 'Optional normalized job code selected at clock-in (references job_codes).';
comment on column public.time_entries.location_code_id is 'Optional normalized location code selected at clock-in (references location_codes).';

-- Minimal defaults so dropdowns are usable immediately.
insert into public.job_codes (label, color_token, sort_order)
select v.label, v.color_token, v.sort_order
from (
  values
    ('Shift manager', 'rose', 1),
    ('Sales associate', 'violet', 2),
    ('Cashier', 'blue', 3)
) as v(label, color_token, sort_order)
where not exists (
  select 1 from public.job_codes jc where lower(jc.label) = lower(v.label)
);

insert into public.location_codes (label, color_token, sort_order)
select v.label, v.color_token, v.sort_order
from (
  values
    ('Location A', 'blue', 1),
    ('Location B', 'amber', 2),
    ('Location C', 'slate', 3)
) as v(label, color_token, sort_order)
where not exists (
  select 1 from public.location_codes lc where lower(lc.label) = lower(v.label)
);

