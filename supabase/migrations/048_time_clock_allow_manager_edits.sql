-- Phase 1 governance: allow managers to adjust punch times per time clock.

alter table public.time_clocks
  add column if not exists allow_manager_edits boolean not null default true;

comment on column public.time_clocks.allow_manager_edits is
  'When false, manager time entry adjustments are blocked for this clock.';

