-- Optional, after 007: adds one archived time clock so the "Archived" tab shows a card in the UI.
-- Safe to skip in production or edit names.

insert into public.time_clocks (location_id, name, slug, status, sort_order)
select
  id,
  name || ' — Old kiosk (archived)',
  'old-kiosk-archived',
  'archived',
  99
from public.locations
where slug = 'store-18'
on conflict (location_id, slug) do nothing;
