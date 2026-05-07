-- Enable RLS for shared code lists (job_codes, location_codes)
-- These tables are org-wide lists used by the Time Clock UI.

alter table public.job_codes enable row level security;
alter table public.location_codes enable row level security;

-- Readable by any authenticated user (UI dropdowns).
drop policy if exists "job_codes_select_auth" on public.job_codes;
create policy "job_codes_select_auth"
  on public.job_codes for select to authenticated
  using (true);

drop policy if exists "location_codes_select_auth" on public.location_codes;
create policy "location_codes_select_auth"
  on public.location_codes for select to authenticated
  using (true);

-- Writes restricted to org owners for now (admin UI can come later).
drop policy if exists "job_codes_write_owner_only" on public.job_codes;
create policy "job_codes_write_owner_only"
  on public.job_codes for all to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

drop policy if exists "location_codes_write_owner_only" on public.location_codes;
create policy "location_codes_write_owner_only"
  on public.location_codes for all to authenticated
  using (public.is_org_owner())
  with check (public.is_org_owner());

