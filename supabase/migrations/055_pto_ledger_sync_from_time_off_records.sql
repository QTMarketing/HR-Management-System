-- Phase 5 (PTO + ledger): sync approved time off -> PTO ledger usage entries.
--
-- Writes ONE (idempotent) `usage` entry per approved time_off_records row, for:
-- - time_off_type = 'PTO'        => bucket 'vacation'
-- - time_off_type = 'Sick leave' => bucket 'sick'
--
-- Other time_off_types are ignored by the PTO ledger for now.

-- Ensure we can link usage entries back to time_off_records without duplicates.
create unique index if not exists pto_ledger_entries_one_usage_per_time_off_record
  on public.pto_ledger_entries (time_off_record_id)
  where entry_type = 'usage';

-- Compute intended usage hours for a time_off_record.
create or replace function public.pto_usage_hours_for_time_off_record(p_time_off_record_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  pol record;
  hrs numeric;
begin
  select
    tor.id,
    tor.all_day,
    tor.start_at,
    tor.end_at,
    tor.total_hours,
    tor.days_of_leave
  into r
  from public.time_off_records tor
  where tor.id = p_time_off_record_id;

  if r.id is null then
    raise exception 'time_off_record not found: %', p_time_off_record_id;
  end if;

  select p.standard_day_hours
  into pol
  from public.pto_policies p
  order by p.created_at asc
  limit 1;

  if pol.standard_day_hours is null then
    pol.standard_day_hours := 8;
  end if;

  if r.total_hours is not null and r.total_hours > 0 then
    hrs := r.total_hours;
  elsif r.days_of_leave is not null and r.days_of_leave > 0 then
    hrs := r.days_of_leave * pol.standard_day_hours;
  elsif r.all_day then
    -- For all-day rows without explicit hours/days, default to one standard day.
    hrs := pol.standard_day_hours;
  else
    hrs := extract(epoch from (r.end_at - r.start_at)) / 3600.0;
  end if;

  if hrs is null or hrs <= 0 then
    raise exception 'invalid computed hours for time_off_record %', p_time_off_record_id;
  end if;

  return hrs;
end;
$$;

comment on function public.pto_usage_hours_for_time_off_record(uuid) is
  'Compute usage hours for a time_off_record using total_hours, days_of_leave, or duration; falls back to policy standard_day_hours.';

-- Upsert the ledger usage row for an approved PTO/sick time_off_record.
create or replace function public.pto_upsert_usage_from_time_off_record(p_time_off_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tor record;
  bucket text;
  usage_hours numeric;
  signed_amount numeric;
  pol_id uuid;
begin
  select
    id,
    employee_id,
    time_off_type,
    status,
    start_at,
    end_at
  into tor
  from public.time_off_records
  where id = p_time_off_record_id;

  if tor.id is null then
    return;
  end if;

  -- Only post ledger usage when approved.
  if tor.status <> 'approved' then
    return;
  end if;

  if tor.time_off_type = 'PTO' then
    bucket := 'vacation';
  elsif tor.time_off_type = 'Sick leave' then
    bucket := 'sick';
  else
    return;
  end if;

  usage_hours := public.pto_usage_hours_for_time_off_record(tor.id);
  signed_amount := -usage_hours;

  select p.id
  into pol_id
  from public.pto_policies p
  order by p.created_at asc
  limit 1;

  insert into public.pto_ledger_entries (
    employee_id,
    bucket,
    entry_type,
    amount_hours,
    effective_at,
    time_off_record_id,
    policy_id,
    created_by,
    notes,
    metadata
  )
  values (
    tor.employee_id,
    bucket,
    'usage',
    signed_amount,
    -- Use the start timestamp as the effective time for the usage.
    tor.start_at,
    tor.id,
    pol_id,
    public.current_employee_id(),
    null,
    jsonb_build_object('source', 'time_off_records', 'time_off_type', tor.time_off_type)
  )
  on conflict (time_off_record_id)
  where entry_type = 'usage'
  do update set
    amount_hours = excluded.amount_hours,
    effective_at = excluded.effective_at,
    bucket = excluded.bucket,
    policy_id = excluded.policy_id,
    metadata = excluded.metadata;
end;
$$;

comment on function public.pto_upsert_usage_from_time_off_record(uuid) is
  'Insert/update the single PTO ledger usage entry for an approved PTO/sick time_off_record.';

-- Trigger: whenever a time_off_record is inserted/updated, attempt to upsert ledger usage.
create or replace function public.trg_time_off_records_sync_pto_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- On INSERT: manager rows are approved immediately; employee requests are pending.
  -- On UPDATE: manager approves pending rows; edits to an approved row should update usage amount.
  perform public.pto_upsert_usage_from_time_off_record(new.id);
  return new;
end;
$$;

drop trigger if exists time_off_records_sync_pto_ledger on public.time_off_records;
create trigger time_off_records_sync_pto_ledger
after insert or update of status, total_hours, days_of_leave, start_at, end_at, all_day, time_off_type
on public.time_off_records
for each row
execute function public.trg_time_off_records_sync_pto_ledger();

