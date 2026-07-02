create table if not exists public.budget_years (
  id text primary key,
  fiscal_year text not null unique,
  budget_name text not null,
  effective_from date,
  effective_to date,
  source_file text,
  source_sheet text,
  status text default 'active',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.budget_activity_rates (
  id text primary key,
  budget_year_id text references public.budget_years(id) on delete set null,
  fiscal_year text not null,
  rate_code text not null unique,
  activity_id uuid references public.activities(id) on delete set null,
  activity_code text,
  activity_name text not null,
  activity_group_name text,
  rate_type text,
  area_scope_type text default 'block',
  estate_name text,
  zone_name text,
  plot_group_code text,
  block_id uuid references public.blocks(id) on delete set null,
  terrain_code text,
  ap_code text,
  payroll_department_code text,
  payroll_department_name text,
  rspo_status text,
  area_rai numeric,
  tree_count numeric,
  unit_name text,
  calculation_method text,
  comparison_basis text,
  rate_amount numeric,
  rate_text text,
  source_file text,
  source_sheet text,
  source_column text,
  source_row integer,
  mapping_rule text,
  effective_from date,
  effective_to date,
  version_no integer default 1,
  is_current boolean default true,
  approval_status text default 'approved',
  status text default 'active',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.budget_rate_materials (
  id text primary key,
  budget_rate_id text references public.budget_activity_rates(id) on delete cascade,
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

create table if not exists public.budget_rate_roles (
  id text primary key,
  budget_rate_id text references public.budget_activity_rates(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  worker_group_name text not null,
  line_type text default 'wage',
  rate_category text,
  payee_type text,
  role_name text,
  rate_amount numeric,
  uom text,
  rate_text text,
  calculation_method text,
  is_hourly_enabled boolean default false,
  affects_payroll boolean default true,
  approval_required boolean default false,
  survey_template_id uuid references public.survey_templates(id) on delete set null,
  status text default 'active',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.budget_rate_roles add column if not exists line_type text default 'wage';
alter table public.budget_rate_roles add column if not exists rate_category text;
alter table public.budget_rate_roles add column if not exists uom text;
alter table public.budget_rate_roles add column if not exists is_hourly_enabled boolean default false;
alter table public.budget_rate_roles add column if not exists affects_payroll boolean default true;
alter table public.budget_rate_roles add column if not exists approval_required boolean default false;
alter table public.budget_rate_roles add column if not exists survey_template_id uuid references public.survey_templates(id) on delete set null;

create index if not exists idx_budget_activity_rates_year on public.budget_activity_rates(fiscal_year);
create index if not exists idx_budget_activity_rates_activity_id on public.budget_activity_rates(activity_id);
create index if not exists idx_budget_activity_rates_block_id on public.budget_activity_rates(block_id);
create index if not exists idx_budget_activity_rates_activity on public.budget_activity_rates(activity_group_name, activity_name);
create index if not exists idx_budget_activity_rates_terrain on public.budget_activity_rates(terrain_code);
create index if not exists idx_budget_activity_rates_ap on public.budget_activity_rates(ap_code);
create index if not exists idx_budget_rate_blocks_rate on public.budget_rate_blocks(budget_rate_id);
create index if not exists idx_budget_rate_blocks_block on public.budget_rate_blocks(block_id);
create index if not exists idx_budget_rate_blocks_terrain on public.budget_rate_blocks(terrain_code);
create index if not exists idx_budget_rate_materials_rate on public.budget_rate_materials(budget_rate_id);
create index if not exists idx_budget_rate_roles_rate on public.budget_rate_roles(budget_rate_id);
create index if not exists idx_budget_rate_roles_line_type on public.budget_rate_roles(line_type, rate_category);

comment on table public.budget_activity_rates is
  'Full budget/rate table. Source and mapping columns are retained for import traceability; the app edit form uses the compact public.budget_activity_rate_editor view field set.';

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
  'Compact field set for editing budget/rate records in the web app without exposing import/source/system columns.';

alter table public.budget_years enable row level security;
alter table public.budget_activity_rates enable row level security;
alter table public.budget_rate_blocks enable row level security;
alter table public.budget_rate_materials enable row level security;
alter table public.budget_rate_roles enable row level security;
