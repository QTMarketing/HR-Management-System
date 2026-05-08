-- Atomic clock-in / clock-out — one transaction per punch.
--
-- Why:
-- The JS server actions previously did 2–3 separate writes per punch:
--   clockIn:  insert time_entries, then insert activity_events
--   clockOut: update time_entries, then update open break, then insert activity_events
-- If the second/third statement failed (network blip, transient RLS, etc.)
-- the punch survived but the audit feed went silent. Owners noticed: the
-- "Who-Did-What" log could miss entries that nonetheless billed payroll.
--
-- Fix:
-- Move the writes into Postgres functions that run in a single implicit
-- transaction. Either every row lands or none does. The RPC interface keeps
-- all the validation (RBAC, geofence, smart-group gate, employee status,
-- categorization) in JS where it belongs — these functions are the *write*
-- boundary, not a policy boundary.
--
-- Security:
-- Both functions are SECURITY INVOKER, so RLS still applies as the calling
-- user. We REVOKE PUBLIC and GRANT EXECUTE only to authenticated, mirroring
-- the rest of the app.

-- ---------------------------------------------------------------------------
-- clock_in_with_audit
-- ---------------------------------------------------------------------------
-- Inserts the time_entries row and the matching activity_events audit entry
-- in one transaction. Returns the new time_entries.id so the action can
-- continue (e.g. revalidate per-clock paths). Caller already enforces:
--   - employee belongs to this location (or is Owner)
--   - clock is active and matches `time_clock_id.location_id`
--   - geofence (Haversine) when configured + not bypassed
--   - smart-group gate
--   - employee not already on an open shift
-- so this function is intentionally trustful of its inputs.

create or replace function public.clock_in_with_audit(
  p_employee_id uuid,
  p_location_id uuid,
  p_time_clock_id uuid,
  p_punch_source text,
  p_client_request_id text,
  p_clock_in_lat double precision,
  p_clock_in_lng double precision,
  p_job_code_id uuid,
  p_location_code_id uuid,
  p_employee_label text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_entry_id uuid;
  v_now timestamptz := now();
begin
  insert into public.time_entries (
    employee_id,
    location_id,
    time_clock_id,
    clock_in_at,
    status,
    punch_source,
    job_code_id,
    location_code_id,
    client_request_id,
    clock_in_lat,
    clock_in_lng
  )
  values (
    p_employee_id,
    p_location_id,
    p_time_clock_id,
    v_now,
    'open',
    coalesce(p_punch_source, 'web'),
    p_job_code_id,
    p_location_code_id,
    p_client_request_id,
    p_clock_in_lat,
    p_clock_in_lng
  )
  returning id into v_entry_id;

  insert into public.activity_events (
    employee_label,
    action,
    status,
    location_id,
    occurred_at
  )
  values (
    coalesce(nullif(trim(p_employee_label), ''), 'Employee'),
    'Clock in',
    'ok',
    p_location_id,
    v_now
  );

  return v_entry_id;
end;
$$;

revoke all on function public.clock_in_with_audit(
  uuid, uuid, uuid, text, text, double precision, double precision, uuid, uuid, text
) from public;

grant execute on function public.clock_in_with_audit(
  uuid, uuid, uuid, text, text, double precision, double precision, uuid, uuid, text
) to authenticated;

comment on function public.clock_in_with_audit is
  'Atomic clock-in: inserts time_entries + activity_events in one transaction. Returns the new time_entries.id. Validation lives in the JS server action; this function is the write boundary only.';

-- ---------------------------------------------------------------------------
-- clock_out_with_audit
-- ---------------------------------------------------------------------------
-- Closes the punch, ends any open break, and writes the audit row — all in
-- one transaction. Idempotent: a second call on an already-closed entry is
-- a no-op (we update WHERE clock_out_at IS NULL, and skip the audit insert
-- if no row was affected). This protects against the classic mobile
-- double-click "did it really save?" scenario.

create or replace function public.clock_out_with_audit(
  p_entry_id uuid,
  p_location_id uuid,
  p_clock_out_lat double precision,
  p_clock_out_lng double precision,
  p_employee_label text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_updated_id uuid;
begin
  update public.time_entries
     set clock_out_at = v_now,
         status = 'closed',
         -- coalesce so a clock-out without GPS doesn't blank an existing
         -- saved coordinate (e.g. saved at clock-in)
         clock_out_lat = coalesce(p_clock_out_lat, clock_out_lat),
         clock_out_lng = coalesce(p_clock_out_lng, clock_out_lng)
   where id = p_entry_id
     and clock_out_at is null
     and archived_at is null
   returning id into v_updated_id;

  if v_updated_id is null then
    -- Already closed (idempotent re-submit) or archived. Don't audit.
    return false;
  end if;

  -- Close any open break with the clock-out timestamp so the rollup
  -- doesn't keep counting break minutes after the shift ended.
  update public.time_entry_breaks
     set ended_at = v_now
   where time_entry_id = p_entry_id
     and ended_at is null;

  insert into public.activity_events (
    employee_label,
    action,
    status,
    location_id,
    occurred_at
  )
  values (
    coalesce(nullif(trim(p_employee_label), ''), 'Employee'),
    'Clock out',
    'ok',
    p_location_id,
    v_now
  );

  return true;
end;
$$;

revoke all on function public.clock_out_with_audit(
  uuid, uuid, double precision, double precision, text
) from public;

grant execute on function public.clock_out_with_audit(
  uuid, uuid, double precision, double precision, text
) to authenticated;

comment on function public.clock_out_with_audit is
  'Atomic clock-out: closes time_entries, ends any open break, inserts the activity_events audit row — all in one transaction. Returns true if a row was actually closed (false on idempotent replay).';
