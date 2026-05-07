-- Phase 0/1 policy words: per-clock general policies (Connecteam-style).
-- Keeps these as simple persisted settings; enforcement can be layered later.

alter table public.time_clocks
  add column if not exists work_days int[] not null default '{1,2,3,4,5}';

alter table public.time_clocks
  add column if not exists work_hours_start time not null default '09:00';

alter table public.time_clocks
  add column if not exists work_hours_end time not null default '17:00';

alter table public.time_clocks
  add column if not exists daily_limit_enabled boolean not null default false;

alter table public.time_clocks
  add column if not exists daily_limit_hours numeric not null default 12;

alter table public.time_clocks
  add column if not exists auto_clock_out_enabled boolean not null default false;

alter table public.time_clocks
  add column if not exists auto_clock_out_after_hours numeric not null default 16;

comment on column public.time_clocks.work_days is
  'Work days of week: 0=Sun..6=Sat. Used for UI defaults and policy context.';

comment on column public.time_clocks.work_hours_start is
  'Default workday start time for policy/reference (not a schedule).';

comment on column public.time_clocks.work_hours_end is
  'Default workday end time for policy/reference (not a schedule).';

comment on column public.time_clocks.daily_limit_enabled is
  'When true, UI can warn when a punch exceeds daily_limit_hours.';

comment on column public.time_clocks.daily_limit_hours is
  'Max allowed hours per day before warning/flagging (policy).';

comment on column public.time_clocks.auto_clock_out_enabled is
  'When true, long open punches can be auto-closed after auto_clock_out_after_hours.';

comment on column public.time_clocks.auto_clock_out_after_hours is
  'Hours after clock-in when auto clock-out should occur (policy).';

