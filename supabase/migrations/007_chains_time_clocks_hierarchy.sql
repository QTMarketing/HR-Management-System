-- After 006. Connecteam-style hierarchy for multi-chain retail:
--   chain (brand / operating group) → location (store) → time_clock (punch device / logical clock)
-- Punches reference time_clocks so you can add more clocks per store later (e.g. front vs warehouse).

-- --- Chains (retail banners / operating companies) ---
create table if not exists public.chains (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.chains (id, name, slug, sort_order)
values
  ('c0000000-0000-4000-8000-000000000001', 'Demo Retail East', 'demo-retail-east', 1),
  ('c0000000-0000-4000-8000-000000000002', 'Demo Retail West', 'demo-retail-west', 2)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  sort_order = excluded.sort_order;

alter table public.chains enable row level security;

drop policy if exists "chains_select_authenticated" on public.chains;
create policy "chains_select_authenticated"
  on public.chains for select to authenticated using (true);

drop policy if exists "chains_select_anon" on public.chains;
create policy "chains_select_anon"
  on public.chains for select to anon using (true);

-- --- Locations belong to one chain ---
alter table public.locations
  add column if not exists chain_id uuid references public.chains(id) on delete restrict;

update public.locations
set chain_id = 'c0000000-0000-4000-8000-000000000001'
where chain_id is null
  and id in (
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002'
  );

update public.locations
set chain_id = 'c0000000-0000-4000-8000-000000000002'
where chain_id is null
  and id = 'a0000000-0000-4000-8000-000000000003';

update public.locations
set chain_id = 'c0000000-0000-4000-8000-000000000001'
where chain_id is null;

alter table public.locations
  alter column chain_id set not null;

create index if not exists locations_chain_id_idx on public.locations (chain_id);

-- --- Time clocks (one or more per store; Connecteam "clock" cards) ---
create table if not exists public.time_clocks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (location_id, slug)
);

create index if not exists time_clocks_location_status_idx
  on public.time_clocks (location_id, status);

alter table public.time_clocks enable row level security;

drop policy if exists "time_clocks_select_authenticated" on public.time_clocks;
create policy "time_clocks_select_authenticated"
  on public.time_clocks for select to authenticated using (true);

drop policy if exists "time_clocks_select_anon" on public.time_clocks;
create policy "time_clocks_select_anon"
  on public.time_clocks for select to anon using (true);

-- Default "main" clock per existing location
insert into public.time_clocks (location_id, name, slug, status, sort_order)
select l.id, l.name || ' — Main clock', 'main', 'active', 1
from public.locations l
on conflict (location_id, slug) do nothing;

-- --- Punches belong to a time clock ---
alter table public.time_entries
  add column if not exists time_clock_id uuid references public.time_clocks(id) on delete restrict;

update public.time_entries t
set time_clock_id = tc.id
from public.time_clocks tc
where t.time_clock_id is null
  and tc.location_id = t.location_id
  and tc.slug = 'main';

-- If any row still null (should not happen), attach first clock for that location
update public.time_entries t
set time_clock_id = (
  select tc.id from public.time_clocks tc
  where tc.location_id = t.location_id and tc.status = 'active'
  order by tc.sort_order, tc.created_at
  limit 1
)
where t.time_clock_id is null;

alter table public.time_entries
  alter column time_clock_id set not null;

create index if not exists time_entries_time_clock_id_idx on public.time_entries (time_clock_id);
