create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.areas (
  id text primary key default gen_random_uuid()::text,
  area_code text unique not null,
  area_name text not null,
  area_level text not null check (area_level in ('estate','zone','plot','block')),
  parent_area_id text references public.areas(id) on delete set null,
  estate_id uuid,
  zone_id uuid,
  plot_id uuid,
  plot_group_id uuid references public.plot_groups(id) on delete set null,
  ap_code text,
  area_rai numeric,
  planting_year integer,
  tree_count integer,
  rspo_status text,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id text primary key default gen_random_uuid()::text,
  person_code text unique not null,
  full_name text not null,
  person_type text not null,
  nationality text,
  payment_type text,
  department_id uuid,
  default_housing_unit_id uuid,
  default_activity_group_id uuid references public.activity_groups(id) on delete set null,
  position text,
  default_role text,
  daily_wage numeric,
  monthly_salary numeric,
  contract_rate numeric,
  normal_hours_per_day numeric,
  hourly_wage_rate numeric,
  phone text,
  start_date date,
  effective_from date not null default current_date,
  effective_to date,
  version_no integer not null default 1,
  is_current boolean not null default true,
  previous_version_id text references public.people(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_housing_assignments (
  id text primary key default gen_random_uuid()::text,
  person_id text references public.people(id) on delete cascade,
  housing_unit_id uuid,
  start_date date not null,
  end_date date,
  occupant_count integer,
  share_utility_percent numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_wage_codes (
  id text primary key default gen_random_uuid()::text,
  activity_id uuid references public.activities(id) on delete cascade,
  wage_code_id uuid,
  is_primary boolean not null default false,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_master (
  id text primary key default gen_random_uuid()::text,
  item_code text unique not null,
  item_name text not null,
  item_type text not null,
  category_name text,
  unit_name text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  fuel_type text,
  plate_no text,
  capacity numeric,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_material_rates (
  id text primary key default gen_random_uuid()::text,
  activity_id uuid references public.activities(id) on delete cascade,
  item_id text references public.inventory_master(id) on delete cascade,
  usage_rate numeric,
  usage_unit text,
  usage_basis text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_plans (
  id text primary key default gen_random_uuid()::text,
  plan_code text unique not null,
  plan_name text,
  plan_level text not null default 'task',
  parent_plan_id text references public.work_plans(id) on delete cascade,
  fiscal_year integer,
  estate_id text references public.areas(id) on delete set null,
  block_id text references public.areas(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  planned_start_date date,
  planned_end_date date,
  planned_quantity numeric,
  planned_unit text,
  status text not null default 'planned',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_materials (
  id text primary key default gen_random_uuid()::text,
  plan_id text references public.work_plans(id) on delete cascade,
  item_id text references public.inventory_master(id) on delete set null,
  planned_quantity numeric,
  unit_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_order_resources (
  id text primary key default gen_random_uuid()::text,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  resource_type text not null,
  person_id text references public.people(id) on delete set null,
  item_id text references public.inventory_master(id) on delete set null,
  planned_quantity numeric,
  actual_quantity numeric,
  unit_name text,
  rate_snapshot numeric,
  amount_snapshot numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_documents (
  id text primary key default gen_random_uuid()::text,
  document_no text unique not null,
  document_type text not null,
  document_date date not null default current_date,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  status text not null default 'draft',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_document_lines (
  id text primary key default gen_random_uuid()::text,
  document_id text references public.inventory_documents(id) on delete cascade,
  item_id text references public.inventory_master(id) on delete set null,
  quantity numeric not null default 0,
  unit_name text,
  unit_cost numeric,
  line_amount numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_lines (
  id text primary key default gen_random_uuid()::text,
  payroll_period_id uuid references public.payroll_periods(id) on delete cascade,
  person_id text references public.people(id) on delete set null,
  line_type text not null default 'wage',
  work_order_id uuid references public.work_orders(id) on delete set null,
  quantity numeric,
  unit_name text,
  rate_snapshot numeric,
  amount numeric,
  payee_snapshot_name text,
  nationality_snapshot text,
  payment_type_snapshot text,
  normal_hours_snapshot numeric,
  master_version_id text,
  calculated_at date not null default current_date,
  is_locked boolean not null default true,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_rules (
  id text primary key default gen_random_uuid()::text,
  rule_code text unique not null,
  rule_name text not null,
  rule_type text not null,
  calculation_method text,
  default_amount numeric,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_scopes (
  id text primary key default gen_random_uuid()::text,
  profile_id uuid references public.profiles(id) on delete cascade,
  area_id text references public.areas(id) on delete cascade,
  scope_type text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_logs (
  id text primary key default gen_random_uuid()::text,
  entity_table text not null,
  entity_id text not null,
  event_type text not null,
  from_status text,
  to_status text,
  decision text,
  approval_level integer,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_date date,
  note text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_versions (
  id text primary key default gen_random_uuid()::text,
  entity_table text not null,
  entity_id text not null,
  business_key text,
  previous_entity_id text,
  version_no integer not null default 1,
  effective_from date,
  effective_to date,
  locked_target text,
  change_note text,
  changed_at date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists areas_parent_area_id_idx on public.areas(parent_area_id);
create index if not exists areas_area_level_idx on public.areas(area_level);
create index if not exists areas_ap_code_idx on public.areas(ap_code);
create index if not exists people_person_type_idx on public.people(person_type);
create index if not exists people_is_current_idx on public.people(is_current);
create index if not exists activity_material_rates_activity_id_idx on public.activity_material_rates(activity_id);
create index if not exists work_plans_block_id_idx on public.work_plans(block_id);
create index if not exists work_order_resources_work_order_id_idx on public.work_order_resources(work_order_id);
create index if not exists payroll_lines_payroll_period_id_idx on public.payroll_lines(payroll_period_id);
create index if not exists approval_logs_entity_idx on public.approval_logs(entity_table, entity_id);
create index if not exists master_versions_entity_idx on public.master_versions(entity_table, entity_id);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'areas','people','person_housing_assignments','activity_wage_codes','activity_material_rates',
    'inventory_master','inventory_documents','inventory_document_lines','work_plans','plan_materials',
    'work_order_resources','payroll_lines','payroll_rules','access_scopes','approval_logs','master_versions'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "authenticated read %1$s" on public.%1$I', tbl);
    execute format('create policy "authenticated read %1$s" on public.%1$I for select to authenticated using (true)', tbl);
    execute format('drop policy if exists "authenticated write %1$s" on public.%1$I', tbl);
    execute format('create policy "authenticated write %1$s" on public.%1$I for all to authenticated using (true) with check (true)', tbl);
  end loop;
end $$;

