-- Manager approval for closed punches (pending until approved_at is set).

alter table public.time_entries
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.employees (id) on delete set null;

comment on column public.time_entries.approved_at is 'When a manager approved this closed punch; null means pending review.';
comment on column public.time_entries.approved_by is 'Employee id of the approver (manager).';

-- Legacy + seeded closed rows: treat as already approved so existing payroll views stay consistent.
update public.time_entries
set
  approved_at = clock_out_at
where status = 'closed'
  and clock_out_at is not null
  and approved_at is null;
