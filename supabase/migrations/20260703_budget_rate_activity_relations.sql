-- Budget rate model:
-- 1 budget_activity_rates row = 1 activity rate.
-- Many blocks, materials, and worker/team/allowance/deduction lines attach through child tables.

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

create index if not exists idx_budget_rate_blocks_rate on public.budget_rate_blocks(budget_rate_id);
create index if not exists idx_budget_rate_blocks_block on public.budget_rate_blocks(block_id);
create index if not exists idx_budget_rate_blocks_terrain on public.budget_rate_blocks(terrain_code);

alter table public.budget_activity_rates
  add column if not exists area_scope_type text default 'multi_block';

comment on table public.budget_rate_blocks is
  'Blocks covered by one activity budget rate. One rate can cover many blocks for planning and payroll calculations.';

drop view if exists public.budget_activity_rate_editor;

create or replace view public.budget_activity_rate_editor
with (security_invoker = true)
as
select
  r.id,
  r.fiscal_year,
  r.rate_code,
  r.activity_group_name,
  r.activity_code,
  r.activity_name,
  r.rate_type,
  r.calculation_method,
  r.comparison_basis,
  r.unit_name,
  r.rate_amount,
  r.rate_text,
  r.area_scope_type,
  count(distinct b.id) as block_count,
  string_agg(distinct b.terrain_code, ', ' order by b.terrain_code) as terrain_codes,
  coalesce(sum(b.area_rai), r.area_rai) as area_rai,
  coalesce(sum(b.tree_count), r.tree_count) as tree_count,
  r.effective_from,
  r.effective_to,
  r.approval_status,
  r.status,
  r.note,
  r.updated_at
from public.budget_activity_rates r
left join public.budget_rate_blocks b on b.budget_rate_id = r.id
group by r.id;

comment on view public.budget_activity_rate_editor is
  'Editor projection for activity-level budget rates with child block totals.';
