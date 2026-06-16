create extension if not exists "pgcrypto";

alter table public.employees
  add column if not exists worker_type text,
  add column if not exists payment_type text,
  add column if not exists monthly_salary numeric not null default 0,
  add column if not exists contract_rate numeric not null default 0,
  add column if not exists effective_from date not null default current_date,
  add column if not exists effective_to date,
  add column if not exists version_no integer not null default 1,
  add column if not exists is_current boolean not null default true,
  add column if not exists previous_version_id uuid references public.employees(id) on delete set null,
  add column if not exists change_reason text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_employees_worker_type on public.employees(worker_type);
create index if not exists idx_employees_payment_type on public.employees(payment_type);
create index if not exists idx_employees_current on public.employees(is_current);
create index if not exists idx_employees_previous_version on public.employees(previous_version_id);
