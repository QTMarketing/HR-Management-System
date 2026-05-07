-- Align bi-weekly time clock periods to legacy East/West calendars (2026 PDFs).
--
-- West: payroll starts Monday 12/15/2025 (Mon–Sun × 2)
-- East: payroll starts Thursday 12/25/2025 (Thu–Wed × 2)
--
-- This sets:
-- - timesheet_period_kind = 'bi_weekly'
-- - timesheet_period_config.week_starts_on
-- - timesheet_period_config.biweekly_anchor_start (YYYY-MM-DD)
--
-- Safe to run multiple times.

-- Ensure we don't crash on NULL config.
update public.time_clocks
set timesheet_period_config = coalesce(timesheet_period_config, '{}'::jsonb)
where timesheet_period_config is null;

-- West clocks (chain_id ...0002)
update public.time_clocks tc
set
  timesheet_period_kind = 'bi_weekly',
  timesheet_period_config =
    jsonb_set(
      jsonb_set(coalesce(tc.timesheet_period_config, '{}'::jsonb), '{week_starts_on}', '1'::jsonb, true),
      '{biweekly_anchor_start}', '"2025-12-15"'::jsonb, true
    )
from public.locations l
where l.id = tc.location_id
  and l.chain_id = 'c0000000-0000-4000-8000-000000000002'::uuid;

-- East clocks (chain_id ...0001)
update public.time_clocks tc
set
  timesheet_period_kind = 'bi_weekly',
  timesheet_period_config =
    jsonb_set(
      jsonb_set(coalesce(tc.timesheet_period_config, '{}'::jsonb), '{week_starts_on}', '4'::jsonb, true),
      '{biweekly_anchor_start}', '"2025-12-25"'::jsonb, true
    )
from public.locations l
where l.id = tc.location_id
  and l.chain_id = 'c0000000-0000-4000-8000-000000000001'::uuid;

