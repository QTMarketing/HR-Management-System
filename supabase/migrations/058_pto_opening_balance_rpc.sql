-- Phase 5 (PTO + ledger): owner-only RPC to seed opening balances.
--
-- Rationale:
-- - pto_ledger_entries inserts are denied by RLS by default.
-- - For go-live, we need a controlled way to seed balances without relaxing table RLS.
--
-- Usage (from app or scripts): select public.pto_seed_opening_balances('[...]'::jsonb);
-- Each JSON item:
--   { "employee_id": "<uuid>", "bucket": "vacation"|"sick", "amount_hours": 12.5, "effective_at": "2026-01-01T00:00:00Z" }

create or replace function public.pto_seed_opening_balances(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count int := 0;
  v record;
  emp_id uuid;
  bucket text;
  amount_hours numeric;
  effective_at timestamptz;
begin
  if not public.is_org_owner() then
    raise exception 'forbidden';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v in
    select
      (value->>'employee_id')::uuid as employee_id,
      (value->>'bucket')::text as bucket,
      (value->>'amount_hours')::numeric as amount_hours,
      (value->>'effective_at')::timestamptz as effective_at
    from jsonb_array_elements(p_rows)
  loop
    emp_id := v.employee_id;
    bucket := v.bucket;
    amount_hours := v.amount_hours;
    effective_at := v.effective_at;

    if emp_id is null then
      raise exception 'employee_id is required';
    end if;
    if bucket is null or bucket not in ('vacation', 'sick') then
      raise exception 'invalid bucket: %', bucket;
    end if;
    if amount_hours is null or amount_hours <= 0 then
      raise exception 'amount_hours must be > 0';
    end if;
    if effective_at is null then
      effective_at := now();
    end if;

    -- Idempotency: at most one opening_balance row per employee/bucket/effective_at.
    insert into public.pto_ledger_entries (
      employee_id,
      bucket,
      entry_type,
      amount_hours,
      effective_at,
      created_by,
      metadata
    )
    values (
      emp_id,
      bucket,
      'opening_balance',
      amount_hours,
      effective_at,
      public.current_employee_id(),
      jsonb_build_object('source', 'opening_balance_seed')
    )
    on conflict do nothing;

    if found then
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end;
$$;

comment on function public.pto_seed_opening_balances(jsonb) is
  'Owner-only RPC to seed opening PTO balances into pto_ledger_entries as opening_balance rows.';

-- Make idempotency explicit.
create unique index if not exists pto_ledger_opening_balance_unique
  on public.pto_ledger_entries (employee_id, bucket, effective_at)
  where entry_type = 'opening_balance';

