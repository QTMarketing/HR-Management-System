-- Allow bi-weekly (14-day, Mon-aligned) timesheet periods on time clocks.

alter table public.time_clocks
  drop constraint if exists time_clocks_timesheet_period_kind_check;

alter table public.time_clocks
  add constraint time_clocks_timesheet_period_kind_check
  check (
    timesheet_period_kind in (
      'weekly',
      'bi_weekly',
      'monthly',
      'semi_monthly',
      'custom'
    )
  );

comment on column public.time_clocks.timesheet_period_kind is
  'Default timesheet range: weekly (Mon–Sun), bi_weekly (14 days), monthly, semi_monthly, or custom split.';
