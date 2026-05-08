-- Remaining-features migration (PTO ledger insert RLS + per-location payroll docs).
--
-- Schema state coming into this migration:
--   * `public.pto_ledger_entries` already exists (migration 054). It has rich
--     column shape: bucket, entry_type, amount_hours, effective_at,
--     time_off_record_id, policy_id, created_by, notes, metadata. We do NOT
--     create a second `pto_ledger` table — that would split history.
--   * `public.payroll_policies` already supports per-location overrides via
--     a nullable `location_id` (migration 070). The lookup contract
--     ("most-specific match wins, otherwise global") is already enforced by
--     `lib/payroll/policy.ts → getActivePayrollPolicy`. No schema change is
--     needed here for store-specific payroll policies.
--
-- What this migration changes:
--   1. Loosens the `pto_ledger_entries` insert RLS so Owners (and managers
--      of the target employee's location) can record manual *adjustment*
--      entries from the app. Other entry types (annual_grant, usage,
--      forfeit, payout, etc.) stay locked behind security-definer RPCs.
--   2. Documents the per-location payroll-policies contract for future
--      readers. No DDL change needed for that surface.
--
-- Safety:
--   - Idempotent (drop policy if exists … create policy …).
--   - No DROP TABLE / DROP COLUMN. No data migration.
--   - Reverts cleanly by replacing the new policies with the original
--     `with check (false)` deny.

-- --- pto_ledger_entries: allow scoped INSERT for adjustments ------------------

drop policy if exists "pto_ledger_entries_insert_denied" on public.pto_ledger_entries;
drop policy if exists "pto_ledger_entries_insert_adjustments" on public.pto_ledger_entries;

create policy "pto_ledger_entries_insert_adjustments"
  on public.pto_ledger_entries
  for insert
  to authenticated
  with check (
    -- Only the manual "adjustment" type is exposed to app inserts.
    entry_type = 'adjustment'
    -- Audit trail: row must record the actor as `created_by`.
    and created_by = public.current_employee_id()
    and (
      -- Owners can adjust anyone.
      public.is_org_owner()
      or
      -- Managers can adjust employees they edit (same location scope rule
      -- already used by the SELECT policy and other RLS in the codebase).
      exists (
        select 1
        from public.employees e
        where e.id = pto_ledger_entries.employee_id
          and public.can_edit_location(e.location_id)
      )
    )
  );

comment on policy "pto_ledger_entries_insert_adjustments" on public.pto_ledger_entries is
  'App-level inserts are restricted to manual adjustments by Owners or managers of the target employee''s location. All other entry types still flow through security-definer RPCs.';

-- --- payroll_policies: documentation only -----------------------------------
--
-- No DDL: per-location overrides already live in `payroll_policies.location_id`
-- with a partial unique index (one row per non-null location, one global row
-- with location_id IS NULL). The lookup contract is "specific row wins,
-- otherwise global" — see `lib/payroll/policy.ts` and `lib/payroll/payable-hours.ts`.

comment on table public.payroll_policies is
  'Per-location overtime config. NULL location_id = global default; lookup is "most specific match wins". Owners can edit both global and per-store rows; per-store is exposed via the PTO Admin → Payroll & OT Rules card with a Location selector.';
