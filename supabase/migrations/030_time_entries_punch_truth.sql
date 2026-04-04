-- Phase 1: punch provenance — source, idempotency, optional GPS, job code, manager edit audit.
-- Optional store geofence on locations (clock-in validation when all three values are set).

alter table public.time_entries
  add column if not exists punch_source text not null default 'web'
    check (punch_source in ('web', 'mobile', 'kiosk', 'import', 'manager_edit'));

comment on column public.time_entries.punch_source is
  'How this punch was recorded: web, mobile, kiosk, import (seed/bulk), or manager_edit (manual punch).';

alter table public.time_entries
  add column if not exists client_request_id text;

comment on column public.time_entries.client_request_id is
  'Optional idempotency key from the client (e.g. mobile) — duplicate inserts reuse the same punch.';

create unique index if not exists time_entries_client_request_id_key
  on public.time_entries (client_request_id)
  where client_request_id is not null;

alter table public.time_entries
  add column if not exists clock_in_lat double precision,
  add column if not exists clock_in_lng double precision,
  add column if not exists clock_out_lat double precision,
  add column if not exists clock_out_lng double precision;

comment on column public.time_entries.clock_in_lat is 'WGS84 latitude at clock-in when provided.';
comment on column public.time_entries.clock_in_lng is 'WGS84 longitude at clock-in when provided.';
comment on column public.time_entries.clock_out_lat is 'WGS84 latitude at clock-out when provided.';
comment on column public.time_entries.clock_out_lng is 'WGS84 longitude at clock-out when provided.';

alter table public.time_entries
  add column if not exists job_code text;

comment on column public.time_entries.job_code is
  'Job / labor code selected at clock-in (pay rules); optional.';

alter table public.time_entries
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.employees (id) on delete set null,
  add column if not exists edit_reason text;

comment on column public.time_entries.edited_at is 'Last time a manager changed clock times in place.';
comment on column public.time_entries.edited_by is 'Manager employee who last edited times.';
comment on column public.time_entries.edit_reason is 'Why times were changed (audit).';

-- Existing rows: already defaulted to punch_source = web via NOT NULL default.

-- Optional geofence per store: when all three are set, clock-in may require GPS within radius.
alter table public.locations
  add column if not exists geofence_center_lat double precision,
  add column if not exists geofence_center_lng double precision,
  add column if not exists geofence_radius_meters int;

alter table public.locations
  drop constraint if exists locations_geofence_radius_positive;

alter table public.locations
  add constraint locations_geofence_radius_positive
  check (geofence_radius_meters is null or geofence_radius_meters > 0);

comment on column public.locations.geofence_center_lat is 'Store center latitude for optional clock-in geofence.';
comment on column public.locations.geofence_center_lng is 'Store center longitude for optional clock-in geofence.';
comment on column public.locations.geofence_radius_meters is 'Allowed distance from center for clock-in; null disables enforcement.';
