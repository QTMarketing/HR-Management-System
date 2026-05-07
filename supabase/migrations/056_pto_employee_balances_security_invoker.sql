-- Supabase Security Advisor: "Security Definer View" on pto_employee_balances.
-- Use security_invoker so RLS on employees / pto_ledger_entries applies to the caller.

alter view public.pto_employee_balances set (security_invoker = true);
