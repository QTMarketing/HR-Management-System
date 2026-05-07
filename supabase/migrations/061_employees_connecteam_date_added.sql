-- Store Connecteam "Date added" separately from `created_at`.
-- Keeps import/debug history intact while preserving source metadata.

alter table public.employees
  add column if not exists connecteam_date_added date;

