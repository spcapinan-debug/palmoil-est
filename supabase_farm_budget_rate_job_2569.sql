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

create table if not exists public.budget_rate_import_rows (
  id text primary key,
  budget_year_id text references public.budget_years(id) on delete set null,
  source_sheet text,
  source_row integer,
  estate_name text,
  zone_name text,
  plot_group_code text,
  terrain_code text,
  area_rai numeric,
  tree_count numeric,
  rspo_status text,
  payroll_department_code text,
  payroll_department_name text,
  ap_code text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_budget_activity_rates_year on public.budget_activity_rates(fiscal_year);
create index if not exists idx_budget_activity_rates_activity_id on public.budget_activity_rates(activity_id);
create index if not exists idx_budget_activity_rates_block_id on public.budget_activity_rates(block_id);
create index if not exists idx_budget_activity_rates_activity on public.budget_activity_rates(activity_group_name, activity_name);
create index if not exists idx_budget_activity_rates_terrain on public.budget_activity_rates(terrain_code);
create index if not exists idx_budget_activity_rates_ap on public.budget_activity_rates(ap_code);
create index if not exists idx_budget_rate_materials_rate on public.budget_rate_materials(budget_rate_id);
create index if not exists idx_budget_rate_roles_rate on public.budget_rate_roles(budget_rate_id);
create index if not exists idx_budget_rate_roles_line_type on public.budget_rate_roles(line_type, rate_category);

alter table public.budget_years enable row level security;
alter table public.budget_activity_rates enable row level security;
alter table public.budget_rate_materials enable row level security;
alter table public.budget_rate_roles enable row level security;
alter table public.budget_rate_import_rows enable row level security;
