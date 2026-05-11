-- Repair employees stranded on archived demo locations.
--
-- Migration 027 seeded demo employees (Sam R., Alex P., Jamie L., Riley K., …)
-- at the original demo location `a0000000-0000-4000-8000-000000000001`.
-- Migration 044 then archived all original demo locations and replaced them
-- with the real store roster from public/Stores.csv. The demo employee rows
-- still point at the archived locations, so the employee portal correctly
-- reports "No active time clock for your store yet" — the store doesn't
-- exist anymore.
--
-- Repair plan (idempotent, safe to re-run):
-- 1. For every NON-archived employee whose `location_id` is null OR points at
--    an archived location, reassign them to the first active store in the
--    matching chain. Chain match preserves the East/West designation that
--    the demo seed encoded.
-- 2. Defensive: ensure every active location has at least one active
--    `main` time clock. Migration 007 already does this for the locations
--    that existed at the time; this re-runs after 044's reshuffle so any
--    newly active location is covered.
--
-- This migration does not delete or rename anything; it only updates
-- foreign keys and (re-)inserts a missing "main" clock when needed.

-- 1) Ensure every active location has an active main clock.
insert into public.time_clocks (location_id, name, slug, status, sort_order)
select l.id, l.name || ' — Main clock', 'main', 'active', 1
from public.locations l
where l.status is distinct from 'archived'
on conflict (location_id, slug) do nothing;

-- Re-activate a previously archived "main" clock for active locations
-- (only happens when the parent location was archived then later restored).
update public.time_clocks tc
set status = 'active'
from public.locations l
where tc.location_id = l.id
  and tc.slug = 'main'
  and tc.status = 'archived'
  and l.status is distinct from 'archived';

-- 2) Reassign stranded employees to the first active store in their chain.
with target_store_per_chain as (
  -- Pick a deterministic "first" active store per chain so the repair is
  -- stable across re-runs (orders by sort_order then id; the `locations`
  -- table doesn't carry a created_at column, so id is the tiebreaker).
  select distinct on (l.chain_id)
    l.chain_id, l.id as location_id
  from public.locations l
  where l.status is distinct from 'archived'
  order by l.chain_id, l.sort_order, l.id
),
stranded as (
  -- An employee is stranded if they are still active in the org but their
  -- assigned store is archived OR null.
  select e.id as employee_id, e.location_id as prior_location_id, prior.chain_id as prior_chain_id
  from public.employees e
  left join public.locations prior on prior.id = e.location_id
  where coalesce(e.status, 'active') <> 'archived'
    and (e.location_id is null or prior.status = 'archived')
)
update public.employees e
set location_id = t.location_id
from stranded s
join target_store_per_chain t
  -- Prefer same chain; if the prior chain is unknown (null), fall back to
  -- the East chain so demo accounts land somewhere sensible.
  on t.chain_id = coalesce(
    s.prior_chain_id,
    'c0000000-0000-4000-8000-000000000001'::uuid
  )
where e.id = s.employee_id;
