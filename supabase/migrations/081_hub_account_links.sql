-- Hub ↔ HR account linkage (CPS-aligned SSO identity map).
-- Maps QuickTrack Hub user id (JWT sub) to local employees row.

create table if not exists public.hub_account_links (
  id uuid primary key default gen_random_uuid(),
  hub_user_id text not null,
  employee_id uuid not null references public.employees (id) on delete cascade,
  hub_email text not null,
  linked_via text not null default 'email_auto'
    check (linked_via in ('hub_user_id', 'email_auto', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_account_links_hub_user_id_key unique (hub_user_id),
  constraint hub_account_links_employee_id_key unique (employee_id)
);

create index if not exists hub_account_links_employee_id_idx
  on public.hub_account_links (employee_id);

alter table public.hub_account_links enable row level security;

-- SSO consume uses service role; no authenticated policies on this table.
