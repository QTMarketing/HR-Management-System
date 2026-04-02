-- Per-clock timesheet / pay-period display (weekly, monthly, semi-monthly, custom split).

alter table public.time_clocks
  add column if not exists timesheet_period_kind text not null default 'weekly'
    check (timesheet_period_kind in ('weekly', 'monthly', 'semi_monthly', 'custom'));

alter table public.time_clocks
  add column if not exists timesheet_period_config jsonb;

comment on column public.time_clocks.timesheet_period_kind is
  'Default timesheet range for this clock: weekly (Mon–Sun), monthly, semi_monthly (split day), or custom (split day).';

comment on column public.time_clocks.timesheet_period_config is
  'JSON: { "split_after_day": 15 } — day inclusive end of first half; second half is next day through month end. Used for semi_monthly and custom.';
