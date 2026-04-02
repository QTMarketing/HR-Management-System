-- Append-only style log for high-trust actions (owners changing access, promotions, store leads).
-- Row visibility is still broad under RLS for dev; the app only links this page to org owners.

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_employee_id uuid references public.employees(id) on delete set null,
  action text not null,
  target_employee_id uuid references public.employees(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists security_audit_events_created_at_idx
  on public.security_audit_events (created_at desc);

comment on table public.security_audit_events is 'Governance audit: admin_access, promotions, location store lead.';

alter table public.security_audit_events enable row level security;

drop policy if exists "security_audit_events_select_auth" on public.security_audit_events;
create policy "security_audit_events_select_auth"
  on public.security_audit_events for select to authenticated using (true);

drop policy if exists "security_audit_events_insert_auth" on public.security_audit_events;
create policy "security_audit_events_insert_auth"
  on public.security_audit_events for insert to authenticated with check (true);

drop policy if exists "security_audit_events_insert_anon" on public.security_audit_events;
create policy "security_audit_events_insert_anon"
  on public.security_audit_events for insert to anon with check (true);
