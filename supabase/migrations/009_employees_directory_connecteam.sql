-- Connecteam-style Users / Admins / Archived directory fields.
-- Run after 008.

-- Allow archived lifecycle (inactive retained for legacy rows).
alter table public.employees drop constraint if exists employees_status_check;
alter table public.employees
  add constraint employees_status_check check (status in ('active', 'inactive', 'archived'));

alter table public.employees add column if not exists first_name text;
alter table public.employees add column if not exists last_name text;
alter table public.employees add column if not exists title text;
alter table public.employees add column if not exists employment_start_date date;
alter table public.employees add column if not exists team text;
alter table public.employees add column if not exists department text;
alter table public.employees add column if not exists kiosk_code text;
alter table public.employees add column if not exists last_login timestamptz;
alter table public.employees add column if not exists added_by text;
alter table public.employees add column if not exists archived_at timestamptz;
alter table public.employees add column if not exists archived_by text;
-- Admin tab (Connecteam-style; Store Manager rows in app)
alter table public.employees add column if not exists access_level text;
alter table public.employees add column if not exists managed_groups text;
alter table public.employees add column if not exists permissions_label text;
alter table public.employees add column if not exists admin_tab_enabled boolean not null default false;

-- Backfill names from full_name (when columns still empty)
update public.employees e
set
  first_name = case
    when position(' ' in trim(e.full_name)) > 0 then trim(split_part(trim(e.full_name), ' ', 1))
    else trim(e.full_name)
  end,
  last_name = case
    when position(' ' in trim(e.full_name)) > 0
      then nullif(trim(substring(trim(e.full_name) from position(' ' in trim(e.full_name)) + 1)), '')
    else null
  end
where e.first_name is null or trim(coalesce(e.first_name, '')) = '';

update public.employees e
set title = coalesce(nullif(trim(e.title), ''), e.role)
where e.title is null or trim(coalesce(e.title, '')) = '';

update public.employees e
set employment_start_date = coalesce(e.employment_start_date, (e.created_at at time zone 'utc')::date);

update public.employees e
set team = coalesce(nullif(trim(e.team), ''), l.name)
from public.locations l
where e.location_id = l.id
  and (e.team is null or trim(coalesce(e.team, '')) = '');

update public.employees e
set department = coalesce(nullif(trim(e.department), ''), 'Retail')
where e.department is null or trim(coalesce(e.department, '')) = '';

update public.employees e
set kiosk_code = coalesce(
  nullif(trim(e.kiosk_code), ''),
  upper(substring(replace(e.id::text, '-', '') from 1 for 6))
)
where e.kiosk_code is null or trim(coalesce(e.kiosk_code, '')) = '';

update public.employees e
set added_by = coalesce(nullif(trim(e.added_by), ''), 'System')
where e.added_by is null or trim(coalesce(e.added_by, '')) = '';

-- Store managers: admin profile defaults
update public.employees e
set
  access_level = coalesce(nullif(trim(e.access_level), ''), 'Store admin'),
  managed_groups = coalesce(nullif(trim(e.managed_groups), ''), 'All groups'),
  permissions_label = coalesce(nullif(trim(e.permissions_label), ''), 'All features'),
  admin_tab_enabled = true
where lower(trim(e.role)) like '%store%manager%';
