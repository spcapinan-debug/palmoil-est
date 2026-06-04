create extension if not exists "pgcrypto";

create table if not exists est_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  operation_zone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_blocks (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references est_areas(id) on delete set null,
  block_code text not null unique,
  palm_year text,
  rai numeric default 0,
  tree_count numeric default 0,
  trees_per_rai numeric default 0,
  hectare numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_workers (
  id uuid primary key default gen_random_uuid(),
  worker_code text unique,
  full_name text not null,
  worker_type text,
  team_zone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_contractors (
  id uuid primary key default gen_random_uuid(),
  contractor_code text unique,
  name text not null,
  activity_scope text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_activities (
  id uuid primary key default gen_random_uuid(),
  activity_code text unique,
  activity_group text not null,
  name text not null,
  unit text,
  default_rate numeric default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_budget_lines (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null default 2569,
  source_sheet text not null,
  activity_id uuid references est_activities(id) on delete set null,
  block_id uuid references est_blocks(id) on delete set null,
  activity_group text,
  rai numeric default 0,
  tree_count numeric default 0,
  planned_quantity numeric default 0,
  rate numeric default 0,
  labor_cost numeric default 0,
  material_quantity numeric default 0,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_work_plans (
  id uuid primary key default gen_random_uuid(),
  plan_no text unique,
  fiscal_year int not null,
  plan_month int,
  activity_id uuid references est_activities(id) on delete set null,
  block_id uuid references est_blocks(id) on delete set null,
  planned_start date,
  planned_end date,
  planned_workers numeric default 0,
  planned_budget numeric default 0,
  status text not null default 'planned',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_work_orders (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid references est_work_plans(id) on delete set null,
  wo_no text unique,
  work_date date not null,
  supervisor_id uuid references est_workers(id) on delete set null,
  contractor_id uuid references est_contractors(id) on delete set null,
  status text not null default 'scheduled',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_daily_entries (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references est_work_orders(id) on delete cascade,
  work_date date not null,
  block_id uuid references est_blocks(id) on delete set null,
  activity_id uuid references est_activities(id) on delete set null,
  quantity numeric default 0,
  worker_count numeric default 0,
  bunch_count numeric default 0,
  weight_ton numeric default 0,
  deduction_total numeric default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_payroll_lines (
  id uuid primary key default gen_random_uuid(),
  daily_entry_id uuid references est_daily_entries(id) on delete cascade,
  worker_id uuid references est_workers(id) on delete set null,
  pay_type text not null default 'normal',
  rate numeric default 0,
  quantity numeric default 0,
  amount numeric default 0,
  deduction numeric default 0,
  overtime numeric default 0,
  leave_hours numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists est_master_records (
  id uuid primary key default gen_random_uuid(),
  local_id text unique,
  category text not null,
  target_table text,
  payload jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table est_areas enable row level security;
alter table est_blocks enable row level security;
alter table est_workers enable row level security;
alter table est_contractors enable row level security;
alter table est_activities enable row level security;
alter table est_budget_lines enable row level security;
alter table est_work_plans enable row level security;
alter table est_work_orders enable row level security;
alter table est_daily_entries enable row level security;
alter table est_payroll_lines enable row level security;
alter table est_master_records enable row level security;

create policy "authenticated read est" on est_areas for select to authenticated using (true);
create policy "authenticated read blocks" on est_blocks for select to authenticated using (true);
create policy "authenticated read workers" on est_workers for select to authenticated using (true);
create policy "authenticated read contractors" on est_contractors for select to authenticated using (true);
create policy "authenticated read activities" on est_activities for select to authenticated using (true);
create policy "authenticated read budget" on est_budget_lines for select to authenticated using (true);
create policy "authenticated read plans" on est_work_plans for select to authenticated using (true);
create policy "authenticated read orders" on est_work_orders for select to authenticated using (true);
create policy "authenticated read daily" on est_daily_entries for select to authenticated using (true);
create policy "authenticated read payroll" on est_payroll_lines for select to authenticated using (true);
create policy "authenticated read master records" on est_master_records for select to authenticated using (true);

create policy "authenticated write est" on est_areas for all to authenticated using (true) with check (true);
create policy "authenticated write blocks" on est_blocks for all to authenticated using (true) with check (true);
create policy "authenticated write workers" on est_workers for all to authenticated using (true) with check (true);
create policy "authenticated write contractors" on est_contractors for all to authenticated using (true) with check (true);
create policy "authenticated write activities" on est_activities for all to authenticated using (true) with check (true);
create policy "authenticated write budget" on est_budget_lines for all to authenticated using (true) with check (true);
create policy "authenticated write plans" on est_work_plans for all to authenticated using (true) with check (true);
create policy "authenticated write orders" on est_work_orders for all to authenticated using (true) with check (true);
create policy "authenticated write daily" on est_daily_entries for all to authenticated using (true) with check (true);
create policy "authenticated write payroll" on est_payroll_lines for all to authenticated using (true) with check (true);
create policy "authenticated write master records" on est_master_records for all to authenticated using (true) with check (true);
