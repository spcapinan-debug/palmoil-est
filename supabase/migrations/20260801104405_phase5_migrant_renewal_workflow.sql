begin;

create table if not exists public.employee_migrant_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete restrict,
  nationality text not null,
  native_name text,
  passport_reference_masked text,
  foreign_identity_reference_masked text,
  border_entry_reference_masked text,
  employer_reference text,
  recruitment_channel text,
  broker_or_agency_name text,
  arrival_date date,
  permitted_work_location text,
  permitted_job_category text,
  preferred_language text,
  interpreter_required boolean not null default false,
  current_compliance_status text not null default 'not_assessed' check (current_compliance_status in (
    'not_assessed', 'compliant', 'action_required', 'in_renewal', 'non_compliant', 'archived'
  )),
  assigned_hr_profile_id uuid references public.profiles(id) on delete set null,
  note text,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.employee_renewal_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  employee_id uuid not null references public.employees(id) on delete restrict,
  document_id uuid not null references public.employee_documents(id) on delete restrict,
  renewal_type text not null,
  current_expiry_date date,
  target_completion_date date,
  status text not null default 'draft' check (status in (
    'draft', 'preparing_documents', 'waiting_employee', 'waiting_manager',
    'appointment_scheduled', 'submitted', 'waiting_authority',
    'additional_documents_required', 'approved', 'rejected', 'completed',
    'cancelled', 'overdue'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_hr_profile_id uuid references public.profiles(id) on delete set null,
  submitted_date date,
  appointment_date date,
  completed_date date,
  new_document_id uuid references public.employee_documents(id) on delete restrict,
  estimated_cost numeric(14,2) check (estimated_cost is null or estimated_cost >= 0),
  actual_cost numeric(14,2) check (actual_cost is null or actual_cost >= 0),
  note text,
  version_no integer not null default 1 check (version_no > 0),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_date is null or status in ('completed', 'cancelled'))
);

alter table public.employee_documents
  drop constraint if exists employee_documents_renewal_case_id_fkey;
alter table public.employee_documents
  add constraint employee_documents_renewal_case_id_fkey
  foreign key (renewal_case_id) references public.employee_renewal_cases(id) on delete set null;

create table if not exists public.employee_renewal_tasks (
  id uuid primary key default gen_random_uuid(),
  renewal_case_id uuid not null references public.employee_renewal_cases(id) on delete restrict,
  task_code text not null,
  task_name text not null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  responsible_employee_id uuid references public.employees(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  status text not null default 'pending' check (status in (
    'pending', 'in_progress', 'blocked', 'completed', 'cancelled'
  )),
  evidence_document_version_id uuid references public.employee_document_versions(id) on delete restrict,
  note text,
  sort_order integer not null default 100 check (sort_order >= 0),
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (responsible_profile_id is not null or responsible_employee_id is not null),
  check ((status = 'completed') = (completed_at is not null)),
  unique (renewal_case_id, task_code)
);

create table if not exists public.employee_renewal_case_history (
  id uuid primary key default gen_random_uuid(),
  renewal_case_id uuid not null references public.employee_renewal_cases(id) on delete restrict,
  previous_status text,
  new_status text not null,
  changed_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  reason text not null,
  check (previous_status is distinct from new_status)
);

create index if not exists employee_migrant_profiles_compliance_idx
  on public.employee_migrant_profiles(current_compliance_status, assigned_hr_profile_id);
create index if not exists employee_renewal_cases_pipeline_idx
  on public.employee_renewal_cases(status, priority, target_completion_date);
create index if not exists employee_renewal_cases_employee_idx
  on public.employee_renewal_cases(employee_id, created_at desc);
create unique index if not exists employee_renewal_cases_open_document_idx
  on public.employee_renewal_cases(document_id)
  where status not in ('completed', 'cancelled', 'rejected');
create index if not exists employee_renewal_tasks_due_idx
  on public.employee_renewal_tasks(status, due_date, responsible_profile_id);
create index if not exists employee_renewal_history_case_idx
  on public.employee_renewal_case_history(renewal_case_id, changed_at desc);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'employee_migrant_profiles', 'employee_renewal_cases',
    'employee_renewal_tasks', 'employee_renewal_case_history'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
  end loop;
end
$$;

commit;
