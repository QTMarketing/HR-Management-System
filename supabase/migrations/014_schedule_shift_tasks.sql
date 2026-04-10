-- Shift tasks (Connecteam-like checklist items per scheduled shift)
-- Run after 013.

create table if not exists public.shift_tasks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  title text not null,
  is_completed boolean not null default false,
  -- Optional ordering within a shift (lower first)
  sort_order int not null default 0,
  -- Completion metadata (optional)
  completed_at timestamptz,
  completed_by_employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shift_tasks_shift_idx
  on public.shift_tasks (shift_id, created_at);

create index if not exists shift_tasks_shift_sort_idx
  on public.shift_tasks (shift_id, sort_order, created_at);

create index if not exists shift_tasks_completed_by_idx
  on public.shift_tasks (completed_by_employee_id)
  where completed_by_employee_id is not null;

alter table public.shift_tasks enable row level security;

drop policy if exists "shift_tasks_all_auth" on public.shift_tasks;
drop policy if exists "shift_tasks_all_anon" on public.shift_tasks;

create policy "shift_tasks_all_auth"
  on public.shift_tasks for all to authenticated using (true) with check (true);

create policy "shift_tasks_all_anon"
  on public.shift_tasks for all to anon using (true) with check (true);

-- Notes:
-- - App can treat `is_completed=true` with `completed_at` set as the canonical “done” state.
-- - For stricter production RBAC, replace these permissive policies with checks that
--   join through `shifts` and enforce schedule edit/view permissions.

