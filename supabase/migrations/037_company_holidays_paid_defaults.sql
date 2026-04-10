-- Company holidays: paid defaults
-- Run after 036.

alter table public.company_holidays
  add column if not exists is_paid boolean not null default true;

-- Common default: 8 paid hours for full-day holidays.
alter table public.company_holidays
  add column if not exists paid_hours numeric;

update public.company_holidays
set paid_hours = coalesce(paid_hours, 8)
where is_paid = true and paid_hours is null;

