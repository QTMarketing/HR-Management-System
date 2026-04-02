-- HR-facing employee number (Connecteam-style "Employee ID"); optional unique per org later.

alter table public.employees add column if not exists employee_code text;

comment on column public.employees.employee_code is 'Display employee / payroll ID (distinct from auth user id).';
