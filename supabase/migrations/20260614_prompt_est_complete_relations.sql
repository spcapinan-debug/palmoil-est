create extension if not exists "pgcrypto";

create table if not exists public.team_activity_skills (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  skill_level text not null default 'standard',
  rate_group text,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, activity_id)
);

create table if not exists public.survey_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text unique not null,
  template_name text not null,
  activity_id uuid references public.activities(id) on delete set null,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.survey_templates(id) on delete cascade,
  question_code text not null,
  question_text text not null,
  answer_type text not null default 'number',
  required boolean not null default false,
  sort_order integer not null default 0,
  choice_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (template_id, question_code)
);

create table if not exists public.planned_work_materials (
  id uuid primary key default gen_random_uuid(),
  planned_work_item_id uuid not null references public.planned_work_items(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  planned_quantity numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  estimated_unit_cost numeric not null default 0,
  estimated_amount numeric generated always as (planned_quantity * estimated_unit_cost) stored,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_order_workers (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  role text,
  planned_hours numeric not null default 0,
  actual_hours numeric not null default 0,
  rate numeric not null default 0,
  amount numeric generated always as (actual_hours * rate) stored,
  status text not null default 'assigned',
  created_at timestamptz not null default now(),
  unique (work_order_id, employee_id)
);

create table if not exists public.work_order_materials (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  planned_quantity numeric not null default 0,
  issued_quantity numeric not null default 0,
  used_quantity numeric not null default 0,
  returned_quantity numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_code text unique not null,
  vehicle_name text not null,
  vehicle_type text,
  plate_no text,
  default_driver_id uuid references public.employees(id) on delete set null,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_order_machines (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_employee_id uuid references public.employees(id) on delete set null,
  planned_hours numeric not null default 0,
  actual_hours numeric not null default 0,
  fuel_plan_liter numeric not null default 0,
  fuel_actual_liter numeric not null default 0,
  status text not null default 'assigned',
  created_at timestamptz not null default now()
);

create table if not exists public.work_order_approvals (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  approval_level integer not null default 1,
  approver_profile_id uuid references public.profiles(id) on delete set null,
  decision text not null default 'pending',
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (work_order_id, approval_level)
);

create table if not exists public.work_order_qr_codes (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  qr_token text unique not null,
  expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (work_order_id)
);

create table if not exists public.work_order_locations (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  location_type text not null default 'planned',
  gps_lat numeric,
  gps_lng numeric,
  accuracy_meter numeric,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create table if not exists public.work_order_status_logs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  changed_at timestamptz not null default now()
);

create table if not exists public.bin_locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  bin_code text not null,
  bin_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (warehouse_id, bin_code)
);

create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  from_unit_id uuid not null references public.units(id) on delete restrict,
  to_unit_id uuid not null references public.units(id) on delete restrict,
  conversion_rate numeric not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (from_unit_id, to_unit_id)
);

create table if not exists public.sku_conversions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  from_unit_id uuid not null references public.units(id) on delete restrict,
  to_unit_id uuid not null references public.units(id) on delete restrict,
  conversion_rate numeric not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (material_id, from_unit_id, to_unit_id)
);

create table if not exists public.material_lots (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  lot_no text not null,
  expiry_date date,
  received_quantity numeric not null default 0,
  remaining_quantity numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (material_id, lot_no)
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  receipt_date date not null default current_date,
  supplier_name text,
  document_no text,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_lot_id uuid references public.material_lots(id) on delete set null,
  quantity numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  unit_cost numeric not null default 0,
  amount numeric generated always as (quantity * unit_cost) stored
);

create table if not exists public.goods_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text unique not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete set null,
  issue_date date not null default current_date,
  issued_to_employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goods_issue_lines (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.goods_issues(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_lot_id uuid references public.material_lots(id) on delete set null,
  bin_id uuid references public.bin_locations(id) on delete set null,
  quantity numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  unit_cost numeric not null default 0,
  amount numeric generated always as (quantity * unit_cost) stored
);

create table if not exists public.goods_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text unique not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete set null,
  return_date date not null default current_date,
  returned_by_employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.goods_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.goods_returns(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  condition_note text
);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text unique not null,
  from_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  to_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_no text unique not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  adjustment_quantity numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  reason text,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  count_no text unique not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  count_date date not null default current_date,
  counted_by uuid references public.employees(id) on delete set null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references public.stock_counts(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  system_quantity numeric not null default 0,
  counted_quantity numeric not null default 0,
  variance_quantity numeric generated always as (counted_quantity - system_quantity) stored,
  unit_id uuid references public.units(id) on delete set null,
  note text
);

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  bin_id uuid references public.bin_locations(id) on delete set null,
  material_id uuid not null references public.materials(id) on delete cascade,
  material_lot_id uuid references public.material_lots(id) on delete set null,
  quantity_on_hand numeric not null default 0,
  unit_id uuid references public.units(id) on delete set null,
  last_count_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_tanks (
  id uuid primary key default gen_random_uuid(),
  tank_code text unique not null,
  tank_name text not null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  capacity_liter numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_requisitions (
  id uuid primary key default gen_random_uuid(),
  requisition_no text unique not null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  requested_liter numeric not null default 0,
  requested_by uuid references public.employees(id) on delete set null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_issues (
  id uuid primary key default gen_random_uuid(),
  fuel_requisition_id uuid not null references public.fuel_requisitions(id) on delete cascade,
  issue_no text unique not null,
  tank_id uuid references public.fuel_tanks(id) on delete set null,
  issued_liter numeric not null default 0,
  issued_by uuid references public.employees(id) on delete set null,
  status text not null default 'issued',
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_period_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  work_result_id uuid references public.work_results(id) on delete set null,
  gross_amount numeric not null default 0,
  deduction_amount numeric not null default 0,
  allowance_amount numeric not null default 0,
  net_amount numeric generated always as (gross_amount - deduction_amount + allowance_amount) stored,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_rates (
  id uuid primary key default gen_random_uuid(),
  rate_code text unique not null,
  activity_id uuid not null references public.activities(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  rate_type text not null default 'daily',
  unit_id uuid references public.units(id) on delete set null,
  rate_amount numeric not null default 0,
  effective_start_date date,
  effective_end_date date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.overtime_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text unique not null,
  rule_name text not null,
  multiplier numeric not null default 1,
  start_time time,
  end_time time,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_overtime_records (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  overtime_rule_id uuid references public.overtime_rules(id) on delete set null,
  ot_date date not null default current_date,
  ot_hours numeric not null default 0,
  amount numeric not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.deduction_types (
  id uuid primary key default gen_random_uuid(),
  deduction_code text unique not null,
  deduction_name text not null,
  calculation_type text not null default 'fixed',
  default_amount numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_deductions (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  deduction_type_id uuid not null references public.deduction_types(id) on delete restrict,
  amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.allowance_types (
  id uuid primary key default gen_random_uuid(),
  allowance_code text unique not null,
  allowance_name text not null,
  calculation_type text not null default 'fixed',
  default_amount numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_allowances (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  allowance_type_id uuid not null references public.allowance_types(id) on delete restrict,
  amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_access_scopes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  estate_id uuid references public.estates(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete cascade,
  plot_id uuid references public.plots(id) on delete cascade,
  scope_type text not null default 'read',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value text,
  value_json jsonb not null default '{}'::jsonb,
  setting_group text,
  description text,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  report_key text not null,
  report_name text not null,
  module_key text,
  export_format text not null default 'Excel',
  filter_json jsonb not null default '{}'::jsonb,
  file_url text,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);

alter table public.warehouses add column if not exists keeper_employee_id uuid references public.employees(id) on delete set null;

alter table public.stock_transactions add column if not exists quantity_in numeric not null default 0;
alter table public.stock_transactions add column if not exists quantity_out numeric not null default 0;
alter table public.stock_transactions add column if not exists unit_id uuid references public.units(id) on delete set null;

alter table public.budget_rates add column if not exists budget_rate_code text;
alter table public.budget_rates add column if not exists fiscal_year integer not null default 2569;
alter table public.budget_rates add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.budget_rates add column if not exists unit_id uuid references public.units(id) on delete set null;
alter table public.budget_rates add column if not exists rate_type text;
alter table public.budget_rates add column if not exists rate_amount numeric;
update public.budget_rates set rate_amount = coalesce(rate_amount, rate), rate_type = coalesce(rate_type, budget_type) where rate_amount is null or rate_type is null;

alter table public.contractor_period_estimates add column if not exists estimate_code text;
alter table public.contractor_period_estimates add column if not exists fiscal_year integer not null default 2569;
alter table public.contractor_period_estimates add column if not exists period_month integer;

alter table public.cost_entries add column if not exists estate_id uuid references public.estates(id) on delete set null;
alter table public.cost_entries add column if not exists status text not null default 'posted';

alter table public.permissions add column if not exists permission_key text;
alter table public.permissions add column if not exists permission_name text;
alter table public.permissions add column if not exists module_key text;
alter table public.permissions add column if not exists action_key text;
alter table public.permissions add column if not exists status text not null default 'active';
update public.permissions
set permission_key = coalesce(permission_key, code),
    permission_name = coalesce(permission_name, name),
    module_key = coalesce(module_key, module),
    action_key = coalesce(action_key, action)
where permission_key is null or permission_name is null or module_key is null or action_key is null;

alter table public.role_permissions add column if not exists is_allowed boolean not null default true;
alter table public.role_permissions add column if not exists status text not null default 'active';

alter table public.audit_logs add column if not exists changed_by uuid references public.profiles(id) on delete set null;
alter table public.audit_logs add column if not exists changed_at timestamptz not null default now();
alter table public.audit_logs add column if not exists entity_table text;
alter table public.audit_logs add column if not exists entity_id text;
alter table public.audit_logs add column if not exists note text;

alter table public.attachments add column if not exists entity_table text;
alter table public.attachments add column if not exists entity_id text;
alter table public.attachments add column if not exists status text not null default 'active';

create index if not exists idx_team_activity_skills_team on public.team_activity_skills(team_id);
create index if not exists idx_team_activity_skills_activity on public.team_activity_skills(activity_id);
create index if not exists idx_planned_work_materials_item on public.planned_work_materials(planned_work_item_id);
create index if not exists idx_work_order_workers_work_order on public.work_order_workers(work_order_id);
create index if not exists idx_work_order_materials_work_order on public.work_order_materials(work_order_id);
create index if not exists idx_work_order_machines_work_order on public.work_order_machines(work_order_id);
create index if not exists idx_work_order_approvals_work_order on public.work_order_approvals(work_order_id);
create index if not exists idx_work_order_status_logs_work_order on public.work_order_status_logs(work_order_id);
create index if not exists idx_stock_transactions_lookup on public.stock_transactions(warehouse_id, material_id, transaction_date);
create index if not exists idx_stock_balances_lookup on public.stock_balances(warehouse_id, material_id);
create unique index if not exists ux_stock_balances_scope on public.stock_balances (
  warehouse_id,
  coalesce(bin_id, '00000000-0000-0000-0000-000000000000'::uuid),
  material_id,
  coalesce(material_lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists idx_payroll_period_lines_period on public.payroll_period_lines(payroll_period_id);
create index if not exists idx_payroll_period_lines_employee on public.payroll_period_lines(employee_id);
create index if not exists idx_budget_rates_lookup on public.budget_rates(fiscal_year, estate_id, activity_id);
create unique index if not exists ux_budget_rates_code on public.budget_rates(budget_rate_code) where budget_rate_code is not null;
create unique index if not exists ux_permissions_permission_key on public.permissions(permission_key) where permission_key is not null;
create index if not exists idx_cost_entries_lookup on public.cost_entries(cost_date, estate_id, activity_id);
create index if not exists idx_user_access_scopes_profile on public.user_access_scopes(profile_id);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'team_activity_skills','survey_templates','survey_questions','planned_work_materials',
    'work_order_workers','work_order_materials','vehicles','work_order_machines',
    'work_order_approvals','work_order_qr_codes','work_order_locations','work_order_status_logs',
    'bin_locations','unit_conversions','sku_conversions','material_lots','goods_receipts',
    'goods_receipt_lines','goods_issues','goods_issue_lines','goods_returns','goods_return_lines',
    'stock_transfers','stock_adjustments','stock_counts','stock_count_lines','stock_balances',
    'fuel_tanks','fuel_requisitions','fuel_issues','payroll_period_lines','payroll_rates',
    'overtime_rules','payroll_overtime_records','deduction_types','payroll_deductions',
    'allowance_types','payroll_allowances','user_access_scopes','system_settings','report_exports'
  ] loop
    execute format('alter table public.%1$I enable row level security', tbl);
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

insert into public.deduction_types (deduction_code, deduction_name, calculation_type, default_amount)
values
  ('DED-LATE', 'มาสาย', 'fixed', 50),
  ('DED-ABSENT', 'ขาดงาน', 'per_day', 1)
on conflict (deduction_code) do nothing;

insert into public.allowance_types (allowance_code, allowance_name, calculation_type, default_amount)
values
  ('ALL-FOOD', 'ค่าอาหาร', 'fixed', 0),
  ('ALL-TRAVEL', 'ค่าเดินทาง', 'fixed', 0)
on conflict (allowance_code) do nothing;

insert into public.system_settings (setting_key, setting_value, setting_group, description)
values
  ('mobile.gps_radius_meter', '100', 'mobile', 'รัศมีตรวจสอบตำแหน่งเมื่อเช็คอินงาน'),
  ('payroll.default_overtime_multiplier', '1.5', 'payroll', 'ตัวคูณ OT เริ่มต้น'),
  ('inventory.allow_negative_stock', 'false', 'inventory', 'อนุญาตให้จ่ายเกินยอดคงเหลือหรือไม่')
on conflict (setting_key) do nothing;
