-- Job titles catalog + per-employee assignments (primary/secondary).
-- Run after 039.

-- --- Helpers ---
-- Mirror app semantics: Store Managers are considered "admins" for HR operations.
create or replace function public.is_store_manager()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.employees e
    where e.id = public.current_employee_id()
      and lower(replace(trim(coalesce(e.role, '')), ' ', '_')) in ('store_manager')
  );
$$;

-- --- Job titles ---
create table if not exists public.job_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists job_titles_name_unique
  on public.job_titles (lower(trim(name)));

alter table public.job_titles enable row level security;

drop policy if exists "job_titles_select_auth" on public.job_titles;
create policy "job_titles_select_auth"
  on public.job_titles for select to authenticated using (true);

drop policy if exists "job_titles_write_admin_owner" on public.job_titles;
create policy "job_titles_write_admin_owner"
  on public.job_titles for all to authenticated
  using (public.is_org_owner() or public.is_store_manager())
  with check (public.is_org_owner() or public.is_store_manager());

-- --- Employee job title assignments (rank: 1 = primary, 2 = secondary) ---
create table if not exists public.employee_job_titles (
  employee_id uuid not null references public.employees(id) on delete cascade,
  job_title_id uuid not null references public.job_titles(id) on delete restrict,
  rank int not null check (rank in (1,2)),
  created_at timestamptz not null default now(),
  primary key (employee_id, rank)
);

create unique index if not exists employee_job_titles_employee_job_unique
  on public.employee_job_titles (employee_id, job_title_id);

alter table public.employee_job_titles enable row level security;

drop policy if exists "employee_job_titles_select_auth" on public.employee_job_titles;
create policy "employee_job_titles_select_auth"
  on public.employee_job_titles for select to authenticated using (true);

drop policy if exists "employee_job_titles_write_admin_owner" on public.employee_job_titles;
create policy "employee_job_titles_write_admin_owner"
  on public.employee_job_titles for all to authenticated
  using (public.is_org_owner() or public.is_store_manager())
  with check (public.is_org_owner() or public.is_store_manager());

-- --- Seed/backfill from existing employees.title ---
-- Seed unique title strings as job_titles.
insert into public.job_titles (name)
select distinct trim(e.title) as name
from public.employees e
where e.title is not null
  and trim(e.title) <> ''
on conflict (lower(trim(name))) do nothing;

-- Assign as primary where employee has no primary assignment yet.
insert into public.employee_job_titles (employee_id, job_title_id, rank)
select
  e.id,
  jt.id,
  1 as rank
from public.employees e
join public.job_titles jt
  on lower(trim(jt.name)) = lower(trim(e.title))
where e.title is not null
  and trim(e.title) <> ''
  and not exists (
    select 1 from public.employee_job_titles ejt
    where ejt.employee_id = e.id and ejt.rank = 1
  )
on conflict (employee_id, rank) do nothing;

