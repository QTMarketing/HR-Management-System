-- Replace demo stores with real East/West stores from public/Stores.csv.
-- Strategy: archive existing locations (do not delete, to avoid breaking history),
-- then insert/upsert real locations and seed placeholder employees per store.
--
-- Placeholder employees can later be set to status='archived' when real employee data is imported.

-- 1) Archive existing locations (keeps history intact).
update public.locations
set
  status = 'archived',
  archived_at = coalesce(archived_at, now())
where status is distinct from 'archived';

-- 2) Insert real locations.
-- Naming rule: store number is the name (e.g. '128'), except named sites keep their name.
-- We store the CSV "Location" field in address_line1 (free-form) for now.

-- East numbered stores
insert into public.locations (name, slug, sort_order, chain_id, status, address_line1, timezone, hours)
select v.name, v.slug, v.sort_order, 'c0000000-0000-4000-8000-000000000001'::uuid, 'running', v.address, 'UTC', '{}'::jsonb
from (
  values
    ('118', 'store-118', 118, '34911 Hwy 96'),
    ('119', 'store-119', 119, '13391 FM1013'),
    ('123', 'store-123', 123, '12234 HWY 190 E'),
    ('124', 'store-124', 124, '102 N Wheeler'),
    ('125', 'store-125', 125, '200 Hwy 87'),
    ('127', 'store-127', 127, '898 N Wheeler St'),
    ('128', 'store-128', 128, '12183 N Wheeler St'),
    ('18',  'store-18',  18,  '105 Broadway'),
    ('51',  'store-51',  51,  '504 Front Street'),
    ('94',  'store-94',  94,  '509 S Washington Ave'),
    ('96',  'store-96',  96,  '1011 E End Blvd N'),
    ('97',  'store-97',  97,  '2700 Victory Dr.'),
    ('99',  'store-99',  99,  '5601 E End Blvd S'),
    ('101', 'store-101', 101, '6182 State Highway 300 (East Mountain)'),
    ('102', 'store-102', 102, '4665 E US Highway 80'),
    ('104', 'store-104', 104, '101 E US Highway 80'),
    ('106', 'store-106', 106, '308 E Goode St'),
    ('110', 'store-110', 110, '1105 Business Hwy 37 N')
) as v(name, slug, sort_order, address)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  chain_id = excluded.chain_id,
  status = excluded.status,
  address_line1 = excluded.address_line1;

-- East named sites
insert into public.locations (name, slug, sort_order, chain_id, status, address_line1, timezone, hours)
select v.name, v.slug, v.sort_order, 'c0000000-0000-4000-8000-000000000001'::uuid, 'running', v.address, 'UTC', '{}'::jsonb
from (
  values
    ('Pot of Gold Beer Distributor', 'pot-of-gold-beer-distributor', 1001, '911 W ARCH STREET, COAL TOWNSHIP 17866 PA'),
    ('Irish Isle Provisions', 'irish-isle-provisions', 1002, '911 W ARCH STREET, COAL TOWNSHIP 17866 PA'),
    ('Lama Wholesale', 'lama-wholesale', 1003, '1501 PIPELINE RD E, STE B BEDFORD 76022 TX'),
    ('Field Visit', 'field-visit', 1004, null),
    ('HQ--Time Clock', 'hq-time-clock', 1005, null),
    ('LP Food Mart', 'lp-food-mart', 1006, null)
) as v(name, slug, sort_order, address)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  chain_id = excluded.chain_id,
  status = excluded.status,
  address_line1 = excluded.address_line1;

-- West numbered stores
insert into public.locations (name, slug, sort_order, chain_id, status, address_line1, timezone, hours)
select v.name, v.slug, v.sort_order, 'c0000000-0000-4000-8000-000000000002'::uuid, 'running', v.address, 'UTC', '{}'::jsonb
from (
  values
    ('67',  'store-67',  67,  '8109 Indiana Ave'),
    ('68',  'store-68',  68,  '2318 19th St'),
    ('73',  'store-73',  73,  '2455 Kermit Highway'),
    ('77',  'store-77',  77,  '1509 FM 1936'),
    ('78',  'store-78',  78,  '13920 W Highway 80 E'),
    ('79',  'store-79',  79,  '801 Golder Ave'),
    ('80',  'store-80',  80,  '1523 Harless Ave'),
    ('81',  'store-81',  81,  '4324 Andrews Hwy'),
    ('82',  'store-82',  82,  '4401 W Illinois St'),
    ('83',  'store-83',  83,  '300 Owens St'),
    ('108', 'store-108', 108, '317 N Dixie Blvd'),
    ('109', 'store-109', 109, '721 N County Rd W')
) as v(name, slug, sort_order, address)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  chain_id = excluded.chain_id,
  status = excluded.status,
  address_line1 = excluded.address_line1;

-- Other
insert into public.locations (name, slug, sort_order, chain_id, status, address_line1, timezone, hours)
values ('QT29', 'qt29', 2001, 'c0000000-0000-4000-8000-000000000002'::uuid, 'running', '5101 Little Rd', 'UTC', '{}'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  chain_id = excluded.chain_id,
  status = excluded.status,
  address_line1 = excluded.address_line1;

-- 3) Seed placeholder employees: 3 per running store.
-- Use NULL email so these never conflict with real employee emails.
-- Mark them by added_by='Seed' so they can be archived later.

with running_locations as (
  select id, name, sort_order
  from public.locations
  where status = 'running'
),
seed_rows as (
  select
    l.id as location_id,
    l.name as store_name,
    n as idx
  from running_locations l
  cross join (values (1), (2), (3)) as t(n)
)
insert into public.employees (full_name, email, role, title, location_id, status, added_by)
select
  format('Demo %s — %s', idx, store_name) as full_name,
  null as email,
  case when idx = 1 then 'Store Manager' when idx = 2 then 'Shift Lead' else 'Employee' end as role,
  case when idx = 1 then 'Store Manager' when idx = 2 then 'Shift Lead' else 'Employee' end as title,
  location_id,
  'active',
  'Seed'
from seed_rows s
where not exists (
  select 1
  from public.employees e
  where e.added_by = 'Seed'
    and e.location_id = s.location_id
    and e.full_name = format('Demo %s — %s', s.idx, s.store_name)
);

