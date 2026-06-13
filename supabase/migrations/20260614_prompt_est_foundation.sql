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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid null,
  full_name text,
  role text not null default 'viewer',
  avatar_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estates (
  id uuid primary key default gen_random_uuid(),
  estate_code text unique not null,
  estate_name text not null,
  company_name text,
  address text,
  manager_id uuid,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid references public.estates(id) on delete cascade,
  zone_code text not null,
  zone_name text not null,
  supervisor_id uuid,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  unique (estate_id, zone_code)
);

create table if not exists public.plots (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid references public.estates(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  plot_code text unique not null,
  plot_name text,
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
  updated_at timestamptz not null default now()
);

create table if not exists public.plot_groups (
  id uuid primary key default gen_random_uuid(),
  group_code text unique,
  group_name text,
  group_type text,
  condition_json jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  note text
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique not null,
  full_name text not null,
  nickname text,
  nationality text,
  id_card_no text,
  phone text,
  employee_type text,
  position text,
  default_role text,
  daily_wage numeric not null default 0,
  status text not null default 'active',
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  contractor_code text unique not null,
  contractor_name text not null,
  contact_person text,
  phone text,
  address text,
  tax_id text,
  contractor_type text,
  default_activity_group_id uuid,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_code text unique not null,
  team_name text not null,
  team_type text,
  supervisor_employee_id uuid references public.employees(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  default_activity_group_id uuid,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  member_role text,
  start_date date,
  end_date date,
  is_active boolean not null default true
);

create table if not exists public.activity_groups (
  id uuid primary key default gen_random_uuid(),
  group_code text unique not null,
  group_name text not null,
  description text,
  status text not null default 'active',
  sort_order integer
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  activity_group_id uuid references public.activity_groups(id) on delete set null,
  activity_code text unique not null,
  activity_name text not null,
  default_unit text,
  work_type text,
  require_material boolean not null default false,
  require_machine boolean not null default false,
  require_worker boolean not null default true,
  require_fuel boolean not null default false,
  allow_mobile_record boolean not null default true,
  allow_piece_rate boolean not null default false,
  allow_team_pool_rate boolean not null default false,
  allow_driver_rate boolean not null default false,
  status text not null default 'active',
  sort_order integer
);

create table if not exists public.material_categories (
  id uuid primary key default gen_random_uuid(),
  category_code text unique not null,
  category_name text not null,
  status text not null default 'active'
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  unit_code text unique not null,
  unit_name text not null,
  base_unit text,
  conversion_rate numeric not null default 1,
  status text not null default 'active'
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  material_code text unique not null,
  material_name text not null,
  category_id uuid references public.material_categories(id) on delete set null,
  base_unit_id uuid references public.units(id) on delete set null,
  status text not null default 'active'
);

create table if not exists public.activity_material_usage_rates (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete cascade,
  material_id uuid references public.materials(id) on delete cascade,
  usage_basis text,
  usage_rate numeric not null default 0,
  usage_unit text,
  effective_start_date date,
  effective_end_date date,
  status text not null default 'active'
);

create table if not exists public.annual_work_plans (
  id uuid primary key default gen_random_uuid(),
  plan_year integer not null,
  estate_id uuid references public.estates(id) on delete set null,
  plan_name text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  note text
);

create table if not exists public.planned_work_items (
  id uuid primary key default gen_random_uuid(),
  annual_plan_id uuid references public.annual_work_plans(id) on delete cascade,
  plot_id uuid references public.plots(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  planned_start_date date,
  planned_end_date date,
  recurrence_type text,
  recurrence_interval integer,
  repeat_after_last_done_days integer,
  target_quantity numeric,
  target_unit text,
  planned_budget numeric,
  suggested_team_id uuid references public.teams(id) on delete set null,
  status text not null default 'planned',
  note text
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  work_order_no text unique not null,
  planned_work_item_id uuid references public.planned_work_items(id) on delete set null,
  estate_id uuid references public.estates(id) on delete set null,
  plot_id uuid references public.plots(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  scheduled_date date,
  manager_id uuid references public.profiles(id) on delete set null,
  supervisor_employee_id uuid references public.employees(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  status text not null default 'draft',
  planned_quantity numeric,
  planned_unit text,
  planned_labor_cost numeric not null default 0,
  planned_material_cost numeric not null default 0,
  planned_fuel_cost numeric not null default 0,
  planned_machine_cost numeric not null default 0,
  planned_total_cost numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_attendance (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references public.work_orders(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_lat numeric,
  check_in_lng numeric,
  check_out_lat numeric,
  check_out_lng numeric,
  check_in_photo_url text,
  check_out_photo_url text,
  attendance_status text,
  recorded_by uuid references public.profiles(id) on delete set null,
  note text
);

create table if not exists public.work_results (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references public.work_orders(id) on delete cascade,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  actual_quantity numeric,
  actual_unit text,
  result_status text not null default 'draft',
  submitted_by uuid references public.profiles(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  note text
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text unique not null,
  warehouse_name text not null,
  status text not null default 'active'
);

create table if not exists public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.materials(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  transaction_type text not null,
  quantity numeric not null default 0,
  unit_cost numeric not null default 0,
  transaction_date date not null default current_date,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_code text unique not null,
  period_name text,
  start_date date,
  end_date date,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.budget_rates (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid references public.estates(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  plot_group_id uuid references public.plot_groups(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  budget_type text not null,
  unit text,
  rate numeric not null default 0,
  effective_start_date date,
  effective_end_date date,
  status text not null default 'active'
);

create table if not exists public.contractor_period_estimates (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  estate_id uuid references public.estates(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  estimate_date date,
  estimated_quantity numeric,
  estimated_unit text,
  estimated_rate numeric,
  estimated_amount numeric,
  actual_quantity numeric,
  actual_amount numeric,
  deduction_amount numeric,
  allowance_amount numeric,
  net_amount numeric,
  status text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  note text
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text,
  module text,
  action text,
  description text
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text,
  permission_id uuid references public.permissions(id) on delete cascade
);

create table if not exists public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references public.work_orders(id) on delete set null,
  work_result_id uuid references public.work_results(id) on delete set null,
  plot_id uuid references public.plots(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  cost_type text,
  amount numeric,
  source_table text,
  source_id uuid,
  cost_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text,
  module_name text,
  table_name text,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  module_name text,
  record_id uuid,
  file_name text,
  file_type text,
  file_url text,
  storage_path text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.estates enable row level security;
alter table public.zones enable row level security;
alter table public.plots enable row level security;
alter table public.plot_groups enable row level security;
alter table public.employees enable row level security;
alter table public.contractors enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.activity_groups enable row level security;
alter table public.activities enable row level security;
alter table public.material_categories enable row level security;
alter table public.units enable row level security;
alter table public.materials enable row level security;
alter table public.activity_material_usage_rates enable row level security;
alter table public.annual_work_plans enable row level security;
alter table public.planned_work_items enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_attendance enable row level security;
alter table public.work_results enable row level security;
alter table public.warehouses enable row level security;
alter table public.stock_transactions enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.budget_rates enable row level security;
alter table public.contractor_period_estimates enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.cost_entries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.attachments enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'estates','zones','plots','plot_groups','employees','contractors','teams','team_members',
    'activity_groups','activities','material_categories','units','materials','activity_material_usage_rates',
    'annual_work_plans','planned_work_items','work_orders','work_attendance','work_results','warehouses',
    'stock_transactions','payroll_periods','budget_rates','contractor_period_estimates','permissions',
    'role_permissions','cost_entries','audit_logs','attachments'
  ] loop
    execute format('drop policy if exists "authenticated read %1$s" on public.%1$I', tbl);
    execute format('create policy "authenticated read %1$s" on public.%1$I for select to authenticated using (true)', tbl);
    execute format('drop policy if exists "authenticated write %1$s" on public.%1$I', tbl);
    execute format('create policy "authenticated write %1$s" on public.%1$I for all to authenticated using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = ''active'' and p.role in (''super_admin'',''director'',''estate_manager'',''store_officer'',''fuel_officer'',''accounting''))
    ) with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = ''active'' and p.role in (''super_admin'',''director'',''estate_manager'',''store_officer'',''fuel_officer'',''accounting''))
    )', tbl);
  end loop;
end $$;

drop policy if exists "authenticated read profiles" on public.profiles;
create policy "authenticated read profiles" on public.profiles
for select to authenticated
using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

insert into public.activity_groups (group_code, group_name, sort_order)
values
  ('AG01', 'เตรียมพื้นที่', 1),
  ('AG02', 'กำจัดวัชพืช', 2),
  ('AG03', 'ใส่ปุ๋ย', 3),
  ('AG04', 'เก็บเกี่ยว', 4),
  ('AG05', 'ขนส่ง', 5)
on conflict (group_code) do nothing;

insert into public.units (unit_code, unit_name, base_unit, conversion_rate)
values
  ('kg', 'กิโลกรัม', 'kg', 1),
  ('bag25', 'กระสอบ 25 กก.', 'kg', 25),
  ('rai', 'ไร่', 'rai', 1),
  ('ton', 'ตัน', 'kg', 1000)
on conflict (unit_code) do nothing;

insert into public.estates (estate_code, estate_name, company_name)
values ('SPC', 'SPC Estate', 'SPC')
on conflict (estate_code) do nothing;

insert into storage.buckets (id, name, public)
values
  ('employee-photos', 'employee-photos', false),
  ('work-order-qr', 'work-order-qr', false),
  ('attendance-photos', 'attendance-photos', false),
  ('work-result-photos', 'work-result-photos', false),
  ('material-issue-photos', 'material-issue-photos', false),
  ('fuel-photos', 'fuel-photos', false),
  ('deduction-evidence', 'deduction-evidence', false),
  ('survey-evidence', 'survey-evidence', false),
  ('payroll-exports', 'payroll-exports', false),
  ('report-exports', 'report-exports', false),
  ('inventory-documents', 'inventory-documents', false)
on conflict (id) do nothing;
