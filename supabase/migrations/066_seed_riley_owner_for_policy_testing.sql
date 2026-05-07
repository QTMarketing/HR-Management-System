-- Test seed: promote the test account (Riley K.) to Org Owner so the time off
-- policy editor is reachable while RBAC is enabled.
--
-- The Time Off policy editor (Vacation policy / Sick policy buttons on /time-off)
-- is gated to Owners only — both in the UI (canEditPolicy check) and at the
-- database (RLS policies on pto_policies / pto_entitlement_tiers).
--
-- Riley was previously seeded as a Store Manager, which is appropriate for
-- everyday testing but blocks access to the policy editor. This migration
-- bumps the role so the test session has Owner powers.
--
-- For a real production rollout, replace this with whoever the actual
-- Org Owner should be (typically a single founder / HR director).

update public.employees
set
  role = 'Org Owner',
  permissions_label = 'All features'
where email = 'riley.k@example.com';
