-- Locations: full store details + manual running status + archive metadata.
-- Run after 040.

alter table public.locations
  add column if not exists status text not null default 'running';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'locations_status_check'
  ) then
    alter table public.locations
      add constraint locations_status_check check (status in ('running', 'not_running', 'archived'));
  end if;
end $$;

alter table public.locations
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists phone text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists hours jsonb not null default '{}'::jsonb,
  add column if not exists geofence_lat double precision,
  add column if not exists geofence_lng double precision,
  add column if not exists geofence_radius_m int,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.employees(id) on delete set null;

create index if not exists locations_status_idx on public.locations (status);

-- Backfill: any rows without status become running.
update public.locations set status = 'running' where status is null or trim(status) = '';

-- Policies: keep reads authenticated; allow inserts/updates for authenticated in dev.
-- Server actions enforce RBAC for production behavior.
drop policy if exists "locations_insert_authenticated" on public.locations;
create policy "locations_insert_authenticated"
  on public.locations for insert to authenticated with check (true);

drop policy if exists "locations_update_authenticated" on public.locations;
create policy "locations_update_authenticated"
  on public.locations for update to authenticated using (true) with check (true);

