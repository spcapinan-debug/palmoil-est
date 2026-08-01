begin;

create table if not exists public.employee_leave_types (
  id uuid primary key default gen_random_uuid(),
  leave_type_code text not null unique,
  leave_type_name_th text not null,
  leave_type_name_en text,
  paid_status text not null default 'configured' check (paid_status in ('paid', 'unpaid', 'configured')),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  sort_order integer not null default 100 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_leave_policies (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references public.employee_leave_types(id) on delete restrict,
  policy_name text not null,
  employee_type text,
  worker_type text,
  entitlement_days numeric(8,2) check (entitlement_days is null or entitlement_days >= 0),
  accrual_rule_json jsonb not null default '{}'::jsonb,
  payroll_rule_json jsonb not null default '{}'::jsonb,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.employee_leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.employee_leave_types(id) on delete restrict,
  policy_id uuid references public.employee_leave_policies(id) on delete restrict,
  balance_year integer not null check (balance_year between 2000 and 3000),
  opening_days numeric(8,2) not null default 0,
  accrued_days numeric(8,2) not null default 0,
  used_days numeric(8,2) not null default 0,
  adjusted_days numeric(8,2) not null default 0,
  version_no integer not null default 1 check (version_no > 0),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, balance_year)
);

create table if not exists public.employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.employee_leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  requested_days numeric(8,2) not null check (requested_days > 0),
  reason text,
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'approved', 'rejected', 'cancelled'
  )),
  payroll_effect_status text not null default 'pending' check (payroll_effect_status in (
    'pending', 'included', 'excluded', 'not_applicable'
  )),
  version_no integer not null default 1 check (version_no > 0),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.employee_leave_approvals (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.employee_leave_requests(id) on delete restrict,
  approval_step integer not null check (approval_step > 0),
  approver_profile_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  unique (leave_request_id, approval_step),
  check ((decision = 'pending') = (decided_at is null))
);

create table if not exists public.employee_leave_history (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.employee_leave_requests(id) on delete restrict,
  previous_status text,
  new_status text not null,
  changed_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  changed_at timestamptz not null default now(),
  check (previous_status is distinct from new_status)
);

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  course_name_th text not null,
  course_name_en text,
  provider_name text,
  validity_days integer check (validity_days is null or validity_days > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_training_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  course_id uuid not null references public.training_courses(id) on delete restrict,
  started_on date,
  completed_on date,
  result_status text not null default 'registered' check (result_status in (
    'registered', 'in_progress', 'passed', 'failed', 'cancelled'
  )),
  score numeric(8,2),
  evidence_document_version_id uuid references public.employee_document_versions(id) on delete restrict,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (completed_on is null or started_on is null or completed_on >= started_on)
);

create table if not exists public.employee_certifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  course_id uuid references public.training_courses(id) on delete restrict,
  certification_code text not null,
  certification_name text not null,
  issued_on date,
  expires_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'expired', 'revoked', 'archived')),
  document_id uuid references public.employee_documents(id) on delete restrict,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

create table if not exists public.certification_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  certification_code text not null,
  reminder_days_before integer not null,
  notification_channels text[] not null default array['in_app']::text[],
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  effective_from date not null,
  effective_to date,
  check (effective_to is null or effective_to >= effective_from),
  check (notification_channels <@ array['in_app', 'email', 'webhook']::text[]),
  unique (certification_code, reminder_days_before, effective_from)
);

create table if not exists public.medical_exam_types (
  id uuid primary key default gen_random_uuid(),
  exam_type_code text not null unique,
  exam_type_name_th text not null,
  exam_type_name_en text,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_medical_exams (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  exam_type_id uuid not null references public.medical_exam_types(id) on delete restrict,
  exam_date date not null,
  next_exam_date date,
  fitness_status text not null check (fitness_status in (
    'pending', 'fit', 'fit_with_restrictions', 'temporarily_unfit', 'unfit'
  )),
  diagnosis_reference_token text,
  provider_name text,
  document_id uuid references public.employee_documents(id) on delete restrict,
  note_sensitive text,
  version_no integer not null default 1 check (version_no > 0),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_exam_date is null or next_exam_date >= exam_date)
);

create table if not exists public.employee_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  asset_type text not null,
  asset_reference text not null,
  assigned_on date not null,
  returned_on date,
  status text not null default 'assigned' check (status in ('assigned', 'returned', 'lost', 'damaged', 'archived')),
  note text,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (returned_on is null or returned_on >= assigned_on)
);

create table if not exists public.employee_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  employee_id uuid not null references public.employees(id) on delete restrict,
  case_type text not null check (case_type in ('commendation', 'warning', 'disciplinary', 'grievance', 'investigation')),
  title text not null,
  summary_sensitive text,
  status text not null default 'open' check (status in ('draft', 'open', 'under_review', 'resolved', 'closed', 'archived')),
  opened_on date not null default current_date,
  closed_on date,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  version_no integer not null default 1 check (version_no > 0),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_on is null or closed_on >= opened_on)
);

create table if not exists public.employee_case_actions (
  id uuid primary key default gen_random_uuid(),
  employee_case_id uuid not null references public.employee_cases(id) on delete restrict,
  action_type text not null,
  action_date date not null,
  action_summary_sensitive text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_case_attachments (
  id uuid primary key default gen_random_uuid(),
  employee_case_id uuid not null references public.employee_cases(id) on delete restrict,
  document_version_id uuid not null references public.employee_document_versions(id) on delete restrict,
  attachment_type text not null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (employee_case_id, document_version_id)
);

create index if not exists employee_leave_policies_effective_idx
  on public.employee_leave_policies(leave_type_id, status, effective_from, effective_to);
create index if not exists employee_leave_requests_employee_dates_idx
  on public.employee_leave_requests(employee_id, start_date, end_date, status);
create index if not exists employee_leave_approvals_queue_idx
  on public.employee_leave_approvals(approver_profile_id, decision, created_at);
create index if not exists employee_training_records_employee_idx
  on public.employee_training_records(employee_id, completed_on desc);
create index if not exists employee_certifications_expiry_idx
  on public.employee_certifications(status, expires_on, employee_id);
create index if not exists employee_medical_exams_employee_date_idx
  on public.employee_medical_exams(employee_id, exam_date desc);
create index if not exists employee_asset_assignments_employee_status_idx
  on public.employee_asset_assignments(employee_id, status, assigned_on desc);
create index if not exists employee_cases_employee_status_idx
  on public.employee_cases(employee_id, status, opened_on desc);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'employee_leave_types', 'employee_leave_policies', 'employee_leave_balances',
    'employee_leave_requests', 'employee_leave_approvals', 'employee_leave_history',
    'training_courses', 'employee_training_records', 'employee_certifications',
    'certification_reminder_rules', 'medical_exam_types', 'employee_medical_exams',
    'employee_asset_assignments', 'employee_cases', 'employee_case_actions',
    'employee_case_attachments'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
  end loop;
end
$$;

commit;
