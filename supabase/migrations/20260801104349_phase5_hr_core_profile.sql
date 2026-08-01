begin;

create table if not exists public.employee_personal_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete restrict,
  title text,
  first_name_th text,
  last_name_th text,
  first_name_en text,
  last_name_en text,
  first_name_native text,
  last_name_native text,
  gender text,
  birth_date date,
  marital_status text,
  blood_group text,
  religion text,
  nationality text,
  native_language text,
  preferred_language text not null default 'th',
  photo_path text,
  note text,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (photo_path is null or photo_path !~ '^(https?:)?//')
);

create table if not exists public.employee_addresses (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  address_type text not null check (address_type in ('registered', 'current', 'work', 'other')),
  address_line text not null,
  subdistrict text,
  district text,
  province text,
  postal_code text,
  country text not null default 'TH',
  is_current boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.employee_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  contact_name text not null,
  relationship text not null,
  phone text not null,
  address text,
  preferred_language text not null default 'th',
  priority_no integer not null default 1 check (priority_no > 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  unique (employee_id, priority_no)
);

create table if not exists public.employee_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  bank_code text not null,
  account_name text not null,
  account_reference_token text,
  account_number_last4 text not null check (account_number_last4 ~ '^[0-9A-Za-z]{4}$'),
  branch_name text,
  status text not null default 'active' check (status in ('draft', 'active', 'inactive', 'archived')),
  effective_from date not null default current_date,
  effective_to date,
  verified_by_profile_id uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from),
  check ((verified_at is null) = (verified_by_profile_id is null))
);

comment on column public.employee_bank_accounts.account_reference_token is
  'Provider-managed token only. Never store a raw or custom-encrypted account number.';

create table if not exists public.employee_dependents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  dependent_name text not null,
  relationship text not null,
  birth_date date,
  identification_reference_masked text,
  benefit_eligible boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.employee_status_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  previous_status text,
  new_status text not null,
  effective_date date not null,
  reason text not null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (previous_status is distinct from new_status)
);

create index if not exists employee_addresses_employee_current_idx
  on public.employee_addresses(employee_id, is_current, effective_from desc);
create index if not exists employee_emergency_contacts_employee_status_idx
  on public.employee_emergency_contacts(employee_id, status, priority_no);
create unique index if not exists employee_bank_accounts_one_active_idx
  on public.employee_bank_accounts(employee_id) where status = 'active' and effective_to is null;
create index if not exists employee_dependents_employee_status_idx
  on public.employee_dependents(employee_id, status);
create index if not exists employee_status_history_employee_effective_idx
  on public.employee_status_history(employee_id, effective_date desc, created_at desc);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'employee_personal_profiles', 'employee_addresses', 'employee_emergency_contacts',
    'employee_bank_accounts', 'employee_dependents', 'employee_status_history'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
  end loop;
end
$$;

commit;
