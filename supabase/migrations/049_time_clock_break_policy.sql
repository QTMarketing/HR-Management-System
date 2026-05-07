-- Phase 2 policy: Connecteam-style break settings (manual + automatic).
-- Stores policy only; enforcement can be layered in punch totals later.

alter table public.time_clocks
  add column if not exists breaks_mode text not null default 'manual'
    check (breaks_mode in ('disabled', 'manual', 'automatic'));

alter table public.time_clocks
  add column if not exists breaks_manual_rules jsonb not null default '[]'::jsonb;

alter table public.time_clocks
  add column if not exists breaks_auto_rules jsonb not null default '[]'::jsonb;

comment on column public.time_clocks.breaks_mode is
  'disabled hides break UI; manual shows start/end break; automatic uses deduction rules (policy).';

comment on column public.time_clocks.breaks_manual_rules is
  'Array of manual break templates: label, paid/unpaid, duration_minutes, every_hours, restrict_early_return.';

comment on column public.time_clocks.breaks_auto_rules is
  'Array of automatic deduction rules: deduct_minutes after_daily_hours.';

