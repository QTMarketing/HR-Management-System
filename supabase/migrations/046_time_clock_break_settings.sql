-- Phase 2 follow-up: persist per-clock break feature toggles.
-- We already store breaks in time_entry_breaks; this adds settings to control visibility and paid-break option.

alter table public.time_clocks
  add column if not exists breaks_enabled boolean not null default true;

alter table public.time_clocks
  add column if not exists allow_paid_breaks boolean not null default true;

comment on column public.time_clocks.breaks_enabled is
  'When false, break UI is hidden and employees cannot start breaks on this clock.';

comment on column public.time_clocks.allow_paid_breaks is
  'When false, employees can only start unpaid breaks (paid option hidden).';

