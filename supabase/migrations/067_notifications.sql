-- Phase 6 (Notifications): per-employee in-app notifications.
--
-- Powers the notification bell in the top nav. Schedule publish is the first
-- producer (see app/actions/schedule.ts -> publishDraftShiftsForWeek), but the
-- shape is generic so future producers (PTO approvals, late punches) can reuse it.
--
-- RLS rules:
--   * Employees see only their own notifications.
--   * Employees can mark their own notifications as read (update is_read).
--   * Inserts come from the application server (action/admin paths). Owners and
--     store managers can insert; the publish action filters notifications to
--     employees of the publishing scope before inserting.
--   * Deletes are owner-only (cleanup utility).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  message text not null,
  /** Optional URL the bell row links to (e.g. /schedule/board?week=...). */
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_employee_unread_idx
  on public.notifications (employee_id, is_read, created_at desc);

create index if not exists notifications_employee_recent_idx
  on public.notifications (employee_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (employee_id = public.current_employee_id());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

drop policy if exists "notifications_insert_managers" on public.notifications;
create policy "notifications_insert_managers"
  on public.notifications for insert to authenticated
  with check (public.is_org_owner() or public.is_store_manager());

drop policy if exists "notifications_delete_owner" on public.notifications;
create policy "notifications_delete_owner"
  on public.notifications for delete to authenticated
  using (public.is_org_owner());

comment on table public.notifications is
  'Per-employee in-app notifications surfaced by the header bell.';
comment on column public.notifications.link is
  'Optional href the bell row should navigate to when clicked (e.g. /schedule/board?week=YYYY-MM-DD).';
