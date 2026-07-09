create table if not exists public.budget_rate_blocks (
  id text primary key,
  budget_rate_id text not null references public.budget_activity_rates(id) on delete cascade,
  block_id uuid references public.blocks(id) on delete set null,
  terrain_code text not null,
  block_name text,
  estate_name text,
  zone_name text,
  plot_group_code text,
  ap_code text,
  rspo_status text,
  area_rai numeric,
  tree_count numeric,
  status text default 'active',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.budget_rate_materials (
  id text primary key,
  budget_rate_id text not null references public.budget_activity_rates(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  material_name text not null,
  usage_quantity numeric,
  usage_unit text,
  usage_basis text,
  unit_cost numeric,
  amount_per_basis numeric,
  status text default 'active',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_budget_rate_blocks_rate on public.budget_rate_blocks(budget_rate_id);
create index if not exists idx_budget_rate_blocks_block on public.budget_rate_blocks(block_id);
create index if not exists idx_budget_rate_blocks_terrain on public.budget_rate_blocks(terrain_code);
create index if not exists idx_budget_rate_materials_rate on public.budget_rate_materials(budget_rate_id);
create index if not exists idx_budget_rate_materials_material on public.budget_rate_materials(material_id);

alter table public.budget_rate_blocks enable row level security;
alter table public.budget_rate_materials enable row level security;

drop policy if exists "authenticated read budget_rate_blocks" on public.budget_rate_blocks;
create policy "authenticated read budget_rate_blocks" on public.budget_rate_blocks
  for select to authenticated using (true);

drop policy if exists "authenticated write budget_rate_blocks" on public.budget_rate_blocks;
create policy "authenticated write budget_rate_blocks" on public.budget_rate_blocks
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read budget_rate_materials" on public.budget_rate_materials;
create policy "authenticated read budget_rate_materials" on public.budget_rate_materials
  for select to authenticated using (true);

drop policy if exists "authenticated write budget_rate_materials" on public.budget_rate_materials;
create policy "authenticated write budget_rate_materials" on public.budget_rate_materials
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.budget_rate_blocks to authenticated;
grant select, insert, update, delete on public.budget_rate_materials to authenticated;

alter table public.work_order_materials add column if not exists note text;

comment on table public.budget_rate_blocks is
  'Blocks covered by one activity budget rate. One rate can cover many blocks for planning and payroll calculations.';

comment on table public.budget_rate_materials is
  'Material usage lines attached to one activity budget rate.';
