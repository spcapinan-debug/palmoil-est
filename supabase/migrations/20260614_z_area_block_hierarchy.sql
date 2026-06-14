create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid references public.estates(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  plot_id uuid references public.plots(id) on delete cascade,
  block_code text not null,
  block_name text,
  ap_code text not null default '',
  area_rai numeric not null default 0,
  area_hectare numeric,
  planting_year integer,
  palm_age integer,
  tree_count integer not null default 0,
  tree_per_rai numeric generated always as (case when area_rai > 0 then tree_count::numeric / area_rai else 0 end) stored,
  palm_variety text,
  terrain_type text,
  rspo_status text,
  productive_status text,
  hcv_status boolean not null default false,
  gps_lat numeric,
  gps_lng numeric,
  map_boundary jsonb,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plot_id, block_code)
);

alter table public.blocks enable row level security;

alter table public.plots
  add column if not exists plot_group_id uuid references public.plot_groups(id) on delete set null;

alter table public.planned_work_items
  add column if not exists block_id uuid references public.blocks(id) on delete set null,
  add column if not exists ap_code text;

alter table public.work_orders
  add column if not exists block_id uuid references public.blocks(id) on delete set null,
  add column if not exists ap_code text;

alter table public.budget_rates
  add column if not exists plot_id uuid references public.plots(id) on delete set null,
  add column if not exists block_id uuid references public.blocks(id) on delete set null,
  add column if not exists ap_code text;

alter table public.cost_entries
  add column if not exists block_id uuid references public.blocks(id) on delete set null,
  add column if not exists ap_code text;

alter table public.user_access_scopes
  add column if not exists block_id uuid references public.blocks(id) on delete cascade;

insert into public.blocks (
  estate_id,
  zone_id,
  plot_id,
  block_code,
  block_name,
  ap_code,
  area_rai,
  area_hectare,
  planting_year,
  palm_age,
  tree_count,
  palm_variety,
  terrain_type,
  rspo_status,
  productive_status,
  hcv_status,
  gps_lat,
  gps_lng,
  map_boundary,
  status,
  note
)
select
  p.estate_id,
  p.zone_id,
  p.id,
  p.plot_code,
  coalesce(p.plot_name, p.plot_code),
  p.plot_code,
  p.area_rai,
  p.area_hectare,
  p.planting_year,
  p.palm_age,
  p.tree_count,
  p.palm_variety,
  p.terrain_type,
  p.rspo_status,
  p.productive_status,
  p.hcv_status,
  p.gps_lat,
  p.gps_lng,
  p.map_boundary,
  p.status,
  p.note
from public.plots p
where not exists (
  select 1
  from public.blocks b
  where b.plot_id = p.id
    and b.block_code = p.plot_code
);

update public.planned_work_items pwi
set block_id = b.id,
    ap_code = b.ap_code
from public.blocks b
where pwi.block_id is null
  and pwi.plot_id = b.plot_id;

update public.work_orders wo
set block_id = b.id,
    ap_code = b.ap_code
from public.blocks b
where wo.block_id is null
  and wo.plot_id = b.plot_id;

update public.budget_rates br
set block_id = b.id,
    ap_code = b.ap_code
from public.blocks b
where br.block_id is null
  and br.plot_id = b.plot_id;

update public.cost_entries ce
set block_id = b.id,
    ap_code = b.ap_code
from public.blocks b
where ce.block_id is null
  and ce.plot_id = b.plot_id;

create index if not exists blocks_estate_id_idx on public.blocks (estate_id);
create index if not exists blocks_zone_id_idx on public.blocks (zone_id);
create index if not exists blocks_plot_id_idx on public.blocks (plot_id);
create index if not exists blocks_ap_code_idx on public.blocks (ap_code);
create index if not exists plots_plot_group_id_idx on public.plots (plot_group_id);
create index if not exists planned_work_items_block_id_idx on public.planned_work_items (block_id);
create index if not exists work_orders_block_id_idx on public.work_orders (block_id);
create index if not exists budget_rates_plot_id_idx on public.budget_rates (plot_id);
create index if not exists budget_rates_block_id_idx on public.budget_rates (block_id);
create index if not exists cost_entries_block_id_idx on public.cost_entries (block_id);
create index if not exists user_access_scopes_block_id_idx on public.user_access_scopes (block_id);

drop policy if exists "authenticated read blocks" on public.blocks;
create policy "authenticated read blocks" on public.blocks
for select to authenticated
using (true);

drop policy if exists "authenticated write blocks" on public.blocks;
create policy "authenticated write blocks" on public.blocks
for all to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('super_admin','director','estate_manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('super_admin','director','estate_manager')
  )
);
