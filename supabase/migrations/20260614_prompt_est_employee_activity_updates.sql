create extension if not exists "pgcrypto";

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  department_code varchar(50) unique not null,
  department_name varchar(255) not null,
  parent_department_id uuid references public.departments(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  cost_center_code varchar(50),
  status varchar(50) not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.housing_units (
  id uuid primary key default gen_random_uuid(),
  house_code varchar(50) unique not null,
  house_name varchar(255) not null,
  estate_id uuid references public.estates(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  house_type varchar(50),
  capacity_person integer not null default 0,
  water_meter_no varchar(80),
  electric_meter_no varchar(80),
  status varchar(50) not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.employees add column if not exists default_housing_unit_id uuid references public.housing_units(id) on delete set null;
alter table public.employees add column if not exists normal_hours_per_day numeric not null default 8;
alter table public.employees add column if not exists hourly_wage_rate numeric generated always as (
  case when normal_hours_per_day > 0 then daily_wage / normal_hours_per_day else 0 end
) stored;

create table if not exists public.employee_housing_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  housing_unit_id uuid not null references public.housing_units(id) on delete cascade,
  start_date date not null,
  end_date date,
  occupant_count integer not null default 1,
  share_utility_percent numeric not null default 100,
  status varchar(50) not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.housing_utility_charges (
  id uuid primary key default gen_random_uuid(),
  housing_unit_id uuid not null references public.housing_units(id) on delete cascade,
  billing_month varchar(7) not null,
  water_meter_start numeric not null default 0,
  water_meter_end numeric not null default 0,
  water_amount numeric not null default 0,
  electric_meter_start numeric not null default 0,
  electric_meter_end numeric not null default 0,
  electric_amount numeric not null default 0,
  total_utility_amount numeric generated always as (water_amount + electric_amount) stored,
  status varchar(50) not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (housing_unit_id, billing_month)
);

create table if not exists public.wage_codes (
  id uuid primary key default gen_random_uuid(),
  wage_code varchar(50) unique not null,
  wage_name varchar(255) not null,
  activity_group_id uuid references public.activity_groups(id) on delete set null,
  payroll_rate_type varchar(50) not null default 'piece',
  default_unit varchar(50),
  status varchar(50) not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.activities add column if not exists wage_code_id uuid references public.wage_codes(id) on delete set null;

create table if not exists public.activity_wage_code_mappings (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  wage_code_id uuid not null references public.wage_codes(id) on delete cascade,
  effective_start_date date not null,
  effective_end_date date,
  status varchar(50) not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, wage_code_id, effective_start_date)
);

create index if not exists idx_employees_department on public.employees(department_id);
create index if not exists idx_employees_housing on public.employees(default_housing_unit_id);
create index if not exists idx_employee_housing_employee on public.employee_housing_assignments(employee_id);
create index if not exists idx_employee_housing_unit on public.employee_housing_assignments(housing_unit_id);
create index if not exists idx_housing_utility_unit_month on public.housing_utility_charges(housing_unit_id, billing_month);
create index if not exists idx_activities_wage_code on public.activities(wage_code_id);
create index if not exists idx_activity_wage_mapping_activity on public.activity_wage_code_mappings(activity_id);
create index if not exists idx_activity_wage_mapping_wage on public.activity_wage_code_mappings(wage_code_id);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'departments',
    'housing_units',
    'employee_housing_assignments',
    'housing_utility_charges',
    'wage_codes',
    'activity_wage_code_mappings'
  ] loop
    execute format('alter table public.%1$I enable row level security', tbl);
    execute format('drop policy if exists "authenticated read %1$s" on public.%1$I', tbl);
    execute format('create policy "authenticated read %1$s" on public.%1$I for select to authenticated using (true)', tbl);
    execute format('drop policy if exists "authenticated write %1$s" on public.%1$I', tbl);
    execute format('create policy "authenticated write %1$s" on public.%1$I for all to authenticated using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = ''active'' and p.role in (''super_admin'',''director'',''estate_manager'',''supervisor'',''accounting''))
    ) with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = ''active'' and p.role in (''super_admin'',''director'',''estate_manager'',''supervisor'',''accounting''))
    )', tbl);
  end loop;
end $$;

insert into public.departments (department_code, department_name, cost_center_code)
values
  ('DEPT-FIELD', 'ฝ่ายสวน', 'FIELD'),
  ('DEPT-HARVEST', 'ฝ่ายเก็บเกี่ยว', 'HARVEST')
on conflict (department_code) do nothing;

insert into public.wage_codes (wage_code, wage_name, payroll_rate_type, default_unit, note)
values
  ('W-FERT', 'ค่าแรงใส่ปุ๋ย', 'piece', 'ไร่', 'ใช้ร่วมกับใส่ปุ๋ยหลายสูตร เช่น 0-0-30 และโดโลไมท์'),
  ('W-HARVEST', 'ค่าแรงเก็บเกี่ยว', 'piece', 'ตัน', null)
on conflict (wage_code) do nothing;
