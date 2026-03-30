-- Connecteam-style shift layers: definitions + options + per-shift values (shiftDetails-style).
-- One layer per location is marked is_board_section — drives the week board group bands.
-- schedule_shift_groups remains for legacy FKs; board prefers shift_layer_values when present.

create table if not exists public.schedule_shift_layers (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_board_section boolean not null default false,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

create unique index if not exists schedule_shift_layers_one_section_per_location_idx
  on public.schedule_shift_layers (location_id)
  where is_board_section;

create index if not exists schedule_shift_layers_location_idx
  on public.schedule_shift_layers (location_id, sort_order);

create table if not exists public.schedule_shift_layer_options (
  id uuid primary key default gen_random_uuid(),
  layer_id uuid not null references public.schedule_shift_layers(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  color_hex text,
  created_at timestamptz not null default now(),
  unique (layer_id, label)
);

create index if not exists schedule_shift_layer_options_layer_idx
  on public.schedule_shift_layer_options (layer_id, sort_order);

create table if not exists public.shift_layer_values (
  shift_id uuid not null references public.shifts(id) on delete cascade,
  layer_id uuid not null references public.schedule_shift_layers(id) on delete cascade,
  option_id uuid not null references public.schedule_shift_layer_options(id) on delete cascade,
  primary key (shift_id, layer_id)
);

create index if not exists shift_layer_values_shift_idx on public.shift_layer_values (shift_id);
create index if not exists shift_layer_values_option_idx on public.shift_layer_values (option_id);

create or replace function public.enforce_shift_layer_option_matches_layer()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.schedule_shift_layer_options o
    where o.id = new.option_id and o.layer_id = new.layer_id
  ) then
    raise exception 'shift_layer_values.option_id must belong to shift_layer_values.layer_id';
  end if;
  return new;
end;
$$;

drop trigger if exists shift_layer_values_option_layer_trg on public.shift_layer_values;
create trigger shift_layer_values_option_layer_trg
  before insert or update of layer_id, option_id on public.shift_layer_values
  for each row execute function public.enforce_shift_layer_option_matches_layer();

-- Section layer + options (mirror existing shift groups per location)
insert into public.schedule_shift_layers (location_id, name, sort_order, is_board_section)
select l.id, 'Schedule section', 0, true
from public.locations l
on conflict (location_id, name) do nothing;

insert into public.schedule_shift_layer_options (layer_id, label, sort_order)
select sec.id, g.name, g.sort_order
from public.schedule_shift_layers sec
join public.schedule_shift_groups g on g.location_id = sec.location_id
where sec.is_board_section = true
on conflict (layer_id, label) do nothing;

-- Demo: second layer (metadata only — not used for grid sections)
insert into public.schedule_shift_layers (location_id, name, sort_order, is_board_section)
select l.id, 'Department', 1, false
from public.locations l
on conflict (location_id, name) do nothing;

insert into public.schedule_shift_layer_options (layer_id, label, sort_order)
select dep.id, v.label, v.ord
from public.schedule_shift_layers dep
cross join (
  values ('Front of house', 0), ('Back of house', 1)
) as v(label, ord)
where dep.name = 'Department' and dep.is_board_section = false
on conflict (layer_id, label) do nothing;

-- Backfill per-shift section from shift_group_id → matching option label
insert into public.shift_layer_values (shift_id, layer_id, option_id)
select s.id, sec.id, o.id
from public.shifts s
join public.schedule_shift_layers sec
  on sec.location_id = s.location_id and sec.is_board_section = true
join public.schedule_shift_groups g on g.id = s.shift_group_id
join public.schedule_shift_layer_options o on o.layer_id = sec.id and o.label = g.name
on conflict (shift_id, layer_id) do nothing;

insert into public.shift_layer_values (shift_id, layer_id, option_id)
select s.id, sec.id, o.id
from public.shifts s
join public.schedule_shift_layers sec
  on sec.location_id = s.location_id and sec.is_board_section = true
join public.schedule_shift_layer_options o on o.layer_id = sec.id and o.label = 'Ungrouped shifts'
where s.shift_group_id is null
  and not exists (
    select 1 from public.shift_layer_values slv
    where slv.shift_id = s.id and slv.layer_id = sec.id
  );

-- Demo tags on optional “Department” layer (Connecteam-style extra shiftDetails)
insert into public.shift_layer_values (shift_id, layer_id, option_id)
select s.id, dep.id,
  case when abs(hashtext(s.id::text)) % 2 = 0 then foh.id else boh.id end
from public.shifts s
join public.schedule_shift_layers dep
  on dep.location_id = s.location_id and dep.name = 'Department' and dep.is_board_section = false
join public.schedule_shift_layer_options foh
  on foh.layer_id = dep.id and foh.label = 'Front of house'
join public.schedule_shift_layer_options boh
  on boh.layer_id = dep.id and boh.label = 'Back of house'
where not exists (
    select 1 from public.shift_layer_values slv
    where slv.shift_id = s.id and slv.layer_id = dep.id
  );

alter table public.schedule_shift_layers enable row level security;
alter table public.schedule_shift_layer_options enable row level security;
alter table public.shift_layer_values enable row level security;

drop policy if exists "schedule_shift_layers_all_auth" on public.schedule_shift_layers;
drop policy if exists "schedule_shift_layers_all_anon" on public.schedule_shift_layers;
create policy "schedule_shift_layers_all_auth"
  on public.schedule_shift_layers for all to authenticated using (true) with check (true);
create policy "schedule_shift_layers_all_anon"
  on public.schedule_shift_layers for all to anon using (true) with check (true);

drop policy if exists "schedule_shift_layer_options_all_auth" on public.schedule_shift_layer_options;
drop policy if exists "schedule_shift_layer_options_all_anon" on public.schedule_shift_layer_options;
create policy "schedule_shift_layer_options_all_auth"
  on public.schedule_shift_layer_options for all to authenticated using (true) with check (true);
create policy "schedule_shift_layer_options_all_anon"
  on public.schedule_shift_layer_options for all to anon using (true) with check (true);

drop policy if exists "shift_layer_values_all_auth" on public.shift_layer_values;
drop policy if exists "shift_layer_values_all_anon" on public.shift_layer_values;
create policy "shift_layer_values_all_auth"
  on public.shift_layer_values for all to authenticated using (true) with check (true);
create policy "shift_layer_values_all_anon"
  on public.shift_layer_values for all to anon using (true) with check (true);
