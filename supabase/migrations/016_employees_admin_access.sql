-- Per–Store Manager module access (Connecteam-style). Null = all modules (legacy).

alter table public.employees add column if not exists admin_access jsonb;

comment on column public.employees.admin_access is 'Granular sidebar access for Store Managers; null means all modules.';
