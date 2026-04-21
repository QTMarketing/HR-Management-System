-- Keep Time Clocks aligned with store lifecycle after seeding real stores.
-- 1) Archive clocks that belong to archived locations (old/demo stores).
-- 2) Ensure every running/not_running location has a default 'main' clock.

-- 1) Archive clocks under archived stores.
update public.time_clocks tc
set status = 'archived'
from public.locations l
where tc.location_id = l.id
  and l.status = 'archived'
  and tc.status <> 'archived';

-- 2) Create a main clock for every active store (running + not_running).
insert into public.time_clocks (location_id, name, slug, status, sort_order)
select
  l.id,
  l.name || ' — Main clock',
  'main',
  'active',
  1
from public.locations l
where l.status in ('running', 'not_running')
on conflict (location_id, slug) do update set
  name = excluded.name,
  status = case
    when public.time_clocks.status = 'archived' then 'archived'
    else excluded.status
  end,
  sort_order = excluded.sort_order;

