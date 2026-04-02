-- Directory / bulk add: reporting line + mobile + DOB for new hires.

alter table public.employees add column if not exists direct_manager_id uuid references public.employees(id) on delete set null;
alter table public.employees add column if not exists mobile_phone text;
alter table public.employees add column if not exists birth_date date;

create index if not exists employees_direct_manager_idx on public.employees (direct_manager_id);

comment on column public.employees.direct_manager_id is 'Usually the Store Manager for the employee''s location.';
comment on column public.employees.mobile_phone is 'E.164-style string from bulk add (dial + national digits).';

-- Dev parity: allow inserts from app (dashboard uses anon in demo)
drop policy if exists "employees_insert_auth" on public.employees;
create policy "employees_insert_auth"
  on public.employees for insert to authenticated with check (true);

drop policy if exists "employees_insert_anon" on public.employees;
create policy "employees_insert_anon"
  on public.employees for insert to anon with check (true);
