-- Ensure pto_employee_balances always returns BOTH buckets per employee
-- (vacation + sick), even when the employee has no ledger entries yet.
--
-- security_invoker ensures RLS is applied for the querying user.

create or replace view public.pto_employee_balances
with (security_invoker = true) as
with buckets as (
  select unnest(array['vacation'::text, 'sick'::text]) as bucket
)
select
  e.id as employee_id,
  b.bucket,
  coalesce(sum(le.amount_hours) filter (where le.effective_at <= now()), 0) as balance_hours
from public.employees e
cross join buckets b
left join public.pto_ledger_entries le
  on le.employee_id = e.id
  and le.bucket = b.bucket
group by e.id, b.bucket;

