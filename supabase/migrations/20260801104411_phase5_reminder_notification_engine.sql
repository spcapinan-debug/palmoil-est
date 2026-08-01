begin;

create table if not exists public.employee_document_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references public.employee_document_types(id) on delete restrict,
  reminder_days_before integer not null,
  escalation_level integer not null default 0 check (escalation_level between 0 and 10),
  notify_employee boolean not null default false,
  notify_hr_owner boolean not null default true,
  notify_department_manager boolean not null default false,
  notify_estate_manager boolean not null default false,
  notification_channels text[] not null default array['in_app']::text[],
  repeat_interval_days integer check (repeat_interval_days is null or repeat_interval_days > 0),
  stop_after_acknowledged boolean not null default true,
  auto_open_renewal_case boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  effective_from date not null default current_date,
  effective_to date,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from),
  check (notification_channels <@ array['in_app', 'email', 'webhook']::text[]),
  unique (document_type_id, reminder_days_before, escalation_level, effective_from)
);

create table if not exists public.employee_document_reminders (
  id uuid primary key default gen_random_uuid(),
  employee_document_id uuid not null references public.employee_documents(id) on delete restrict,
  rule_id uuid not null references public.employee_document_reminder_rules(id) on delete restrict,
  reminder_date date not null,
  expiry_date date not null,
  reminder_status text not null default 'pending' check (reminder_status in (
    'pending', 'scheduled', 'acknowledged', 'snoozed', 'closed', 'failed'
  )),
  generated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by_profile_id uuid references public.profiles(id) on delete set null,
  snoozed_until timestamptz,
  closed_at timestamptz,
  closed_by_profile_id uuid references public.profiles(id) on delete set null,
  version_no integer not null default 1 check (version_no > 0),
  check ((acknowledged_at is null) = (acknowledged_by_profile_id is null)),
  check ((closed_at is null) = (closed_by_profile_id is null)),
  unique (employee_document_id, rule_id, reminder_date)
);

create table if not exists public.hr_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  employee_id uuid references public.employees(id) on delete restrict,
  document_id uuid references public.employee_documents(id) on delete restrict,
  renewal_case_id uuid references public.employee_renewal_cases(id) on delete restrict,
  reminder_id uuid references public.employee_document_reminders(id) on delete restrict,
  recipient_profile_id uuid references public.profiles(id) on delete restrict,
  recipient_employee_id uuid references public.employees(id) on delete restrict,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'webhook')),
  title text not null,
  message text not null,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  snoozed_until timestamptz,
  closed_at timestamptz,
  status text not null default 'pending' check (status in (
    'pending', 'scheduled', 'sent', 'read', 'acknowledged', 'snoozed',
    'closed', 'failed', 'cancelled'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 10),
  last_error_code text,
  idempotency_key text not null unique,
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipient_profile_id is not null or recipient_employee_id is not null)
);

create table if not exists public.hr_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  idempotency_key text not null unique,
  dry_run boolean not null default true,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  processed_count integer not null default 0 check (processed_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  triggered_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'running') = (completed_at is null))
);

create index if not exists employee_document_reminder_rules_active_idx
  on public.employee_document_reminder_rules(document_type_id, status, reminder_days_before);
create index if not exists employee_document_reminders_queue_idx
  on public.employee_document_reminders(reminder_status, reminder_date, expiry_date);
create index if not exists hr_notifications_recipient_queue_idx
  on public.hr_notifications(recipient_profile_id, status, scheduled_at desc);
create index if not exists hr_notifications_employee_idx
  on public.hr_notifications(employee_id, created_at desc);
create index if not exists hr_job_runs_job_started_idx
  on public.hr_job_runs(job_name, started_at desc);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'employee_document_reminder_rules', 'employee_document_reminders',
    'hr_notifications', 'hr_job_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
  end loop;
end
$$;

commit;
