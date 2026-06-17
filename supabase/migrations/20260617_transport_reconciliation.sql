create extension if not exists "pgcrypto";

create table if not exists transport_sync_runs (
  id uuid primary key default gen_random_uuid(),
  sync_key text not null unique,
  reason text,
  source_payload jsonb not null default '{}'::jsonb,
  source_record_count integer not null default 0,
  mill_record_count integer not null default 0,
  clear_record_count integer not null default 0,
  reconcile_record_count integer not null default 0,
  date_min date,
  date_max date,
  created_at timestamptz not null default now()
);

create table if not exists transport_source_records (
  id uuid primary key default gen_random_uuid(),
  record_key text not null unique,
  sync_key text,
  source_row integer,
  doc_no text,
  in_out_type text,
  doc_date date,
  factory_doc_no text,
  car_license text,
  yard text,
  standard text,
  area_group text,
  supplier_name text,
  net_weight numeric not null default 0,
  factory_net_weight numeric not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists transport_clear_ramp_log (
  id uuid primary key default gen_random_uuid(),
  clear_date date not null unique,
  clear_pr numeric not null default 0,
  clear_tk numeric not null default 0,
  clear_pr_set boolean not null default false,
  clear_tk_set boolean not null default false,
  garden_balance numeric not null default 0,
  takuk_balance numeric not null default 0,
  loss_ramp numeric not null default 0,
  loss_transport numeric not null default 0,
  loss_pr_ramp numeric not null default 0,
  loss_pr_transport numeric not null default 0,
  loss_tk_ramp numeric not null default 0,
  loss_tk_transport numeric not null default 0,
  note text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists transport_mill_weight_records (
  id uuid primary key default gen_random_uuid(),
  record_key text not null unique,
  source_row integer,
  doc_key text,
  wp_doc_no text,
  doc_date date,
  customer_code text,
  customer_name text,
  car_license text,
  net_weight numeric not null default 0,
  grade text,
  product text,
  price_per_unit numeric not null default 0,
  total_pay numeric not null default 0,
  rspo_flag text,
  category text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists transport_mill_reconciliations (
  id uuid primary key default gen_random_uuid(),
  doc_key text not null unique,
  reconcile_date date,
  source_doc_no text,
  factory_doc_no text,
  customer_name text,
  car_license text,
  yard text,
  category text,
  grade text,
  source_weight numeric not null default 0,
  source_factory_weight numeric not null default 0,
  mill_weight numeric not null default 0,
  destination_weight numeric not null default 0,
  diff_source numeric not null default 0,
  diff_factory numeric not null default 0,
  loss_rate numeric not null default 0,
  status text,
  destination_source text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists transport_source_records_doc_date_idx on transport_source_records(doc_date);
create index if not exists transport_source_records_factory_doc_idx on transport_source_records(factory_doc_no);
create index if not exists transport_clear_ramp_log_date_idx on transport_clear_ramp_log(clear_date);
create index if not exists transport_mill_weight_records_doc_date_idx on transport_mill_weight_records(doc_date);
create index if not exists transport_mill_weight_records_doc_key_idx on transport_mill_weight_records(doc_key);
create index if not exists transport_mill_reconciliations_date_idx on transport_mill_reconciliations(reconcile_date);
create index if not exists transport_mill_reconciliations_category_idx on transport_mill_reconciliations(category);
create index if not exists transport_mill_reconciliations_status_idx on transport_mill_reconciliations(status);

alter table transport_sync_runs enable row level security;
alter table transport_source_records enable row level security;
alter table transport_clear_ramp_log enable row level security;
alter table transport_mill_weight_records enable row level security;
alter table transport_mill_reconciliations enable row level security;

drop policy if exists "authenticated read transport sync runs" on transport_sync_runs;
drop policy if exists "authenticated read transport source records" on transport_source_records;
drop policy if exists "authenticated read transport clear ramp" on transport_clear_ramp_log;
drop policy if exists "authenticated read transport mill records" on transport_mill_weight_records;
drop policy if exists "authenticated read transport reconciliations" on transport_mill_reconciliations;

create policy "authenticated read transport sync runs" on transport_sync_runs for select to authenticated using (true);
create policy "authenticated read transport source records" on transport_source_records for select to authenticated using (true);
create policy "authenticated read transport clear ramp" on transport_clear_ramp_log for select to authenticated using (true);
create policy "authenticated read transport mill records" on transport_mill_weight_records for select to authenticated using (true);
create policy "authenticated read transport reconciliations" on transport_mill_reconciliations for select to authenticated using (true);
