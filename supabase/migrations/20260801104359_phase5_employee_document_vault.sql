begin;

create table if not exists public.employee_document_types (
  id uuid primary key default gen_random_uuid(),
  document_type_code text not null unique,
  document_type_name_th text not null,
  document_type_name_en text,
  category text not null,
  nationality_filter text[],
  worker_type_filter text[],
  is_required boolean not null default false,
  has_issue_date boolean not null default true,
  has_expiry_date boolean not null default false,
  requires_document_number boolean not null default false,
  default_reminder_days jsonb not null default '[]'::jsonb,
  verification_required boolean not null default true,
  legal_basis_reference text,
  legal_verified_at timestamptz,
  legal_verified_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  sort_order integer not null default 100 check (sort_order >= 0),
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (document_type_code ~ '^[a-z0-9][a-z0-9_\-]{1,79}$'),
  check (jsonb_typeof(default_reminder_days) = 'array'),
  check (legal_verified_at is null or legal_verified_by_profile_id is not null)
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  document_type_id uuid not null references public.employee_document_types(id) on delete restrict,
  document_number_masked text,
  document_number_hash text,
  issuing_country text,
  issuing_authority text,
  issue_date date,
  expiry_date date,
  status text not null default 'draft' check (status in (
    'draft', 'active', 'due_soon', 'expired', 'in_renewal',
    'renewed', 'cancelled', 'archived'
  )),
  verification_status text not null default 'unverified' check (verification_status in (
    'unverified', 'pending', 'verified', 'rejected'
  )),
  verified_by_profile_id uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  renewal_required boolean not null default false,
  renewal_case_id uuid,
  current_version_id uuid,
  note text,
  version_no integer not null default 1 check (version_no > 0),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by_profile_id uuid references public.profiles(id) on delete set null,
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  check ((verified_at is null) = (verified_by_profile_id is null)),
  check ((archived_at is null) = (archived_by_profile_id is null)),
  check (document_number_hash is null or document_number_hash ~ '^[a-f0-9]{64}$')
);

create table if not exists public.employee_document_versions (
  id uuid primary key default gen_random_uuid(),
  employee_document_id uuid not null references public.employee_documents(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  storage_bucket text not null default 'employee-documents' check (storage_bucket = 'employee-documents'),
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  file_extension text not null check (file_extension in ('pdf', 'jpg', 'jpeg', 'png', 'webp')),
  file_size bigint not null check (file_size > 0 and file_size <= 15728640),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  valid_from date,
  valid_to date,
  is_current boolean not null default true,
  replacement_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  archived_by_profile_id uuid references public.profiles(id) on delete set null,
  check (storage_path ~ ('^employees/[0-9a-f-]{36}/[a-z0-9_\-]+/[0-9a-f-]{36}/v[0-9]+\.' || file_extension || '$')),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check ((archived_at is null) = (archived_by_profile_id is null)),
  unique (employee_document_id, version_no)
);

alter table public.employee_documents
  drop constraint if exists employee_documents_current_version_id_fkey;
alter table public.employee_documents
  add constraint employee_documents_current_version_id_fkey
  foreign key (current_version_id) references public.employee_document_versions(id) on delete restrict;

create table if not exists public.employee_document_requirements (
  id uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references public.employee_document_types(id) on delete restrict,
  nationality text,
  worker_type text,
  employee_type text,
  position_id uuid references public.positions(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  employment_status text,
  effective_from date not null,
  effective_to date,
  is_required boolean not null default true,
  status text not null default 'active' check (status in ('draft', 'active', 'inactive', 'archived')),
  version_no integer not null default 1 check (version_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists employee_document_types_status_sort_idx
  on public.employee_document_types(status, sort_order, document_type_code);
create index if not exists employee_documents_employee_status_expiry_idx
  on public.employee_documents(employee_id, status, expiry_date);
create index if not exists employee_documents_type_expiry_idx
  on public.employee_documents(document_type_id, expiry_date) where archived_at is null;
create unique index if not exists employee_documents_number_hash_idx
  on public.employee_documents(document_type_id, document_number_hash)
  where document_number_hash is not null and archived_at is null;
create unique index if not exists employee_document_versions_one_current_idx
  on public.employee_document_versions(employee_document_id) where is_current is true and archived_at is null;
create index if not exists employee_document_requirements_lookup_idx
  on public.employee_document_requirements(document_type_id, status, effective_from, effective_to);

create or replace function public.hr_finalize_document_version(
  p_document_id uuid,
  p_expected_document_version_no integer,
  p_version_no integer,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_extension text,
  p_file_size bigint,
  p_checksum_sha256 text,
  p_uploaded_by_profile_id uuid,
  p_valid_from date default null,
  p_valid_to date default null,
  p_replacement_reason text default null,
  p_issue_date date default null,
  p_expiry_date date default null
)
returns public.employee_document_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_document public.employee_documents%rowtype;
  created_version public.employee_document_versions%rowtype;
  actual_next_version integer;
begin
  select *
    into locked_document
    from public.employee_documents
   where id = p_document_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'DOCUMENT_NOT_FOUND';
  end if;
  if locked_document.version_no <> p_expected_document_version_no then
    raise exception using errcode = '40001', message = 'DOCUMENT_VERSION_CONFLICT';
  end if;

  select coalesce(max(version_no), 0) + 1
    into actual_next_version
    from public.employee_document_versions
   where employee_document_id = p_document_id;
  if p_version_no <> actual_next_version then
    raise exception using errcode = '40001', message = 'DOCUMENT_FILE_VERSION_CONFLICT';
  end if;

  update public.employee_document_versions
     set is_current = false
   where employee_document_id = p_document_id
     and is_current is true
     and archived_at is null;

  insert into public.employee_document_versions (
    employee_document_id, version_no, storage_bucket, storage_path,
    original_file_name, mime_type, file_extension, file_size,
    checksum_sha256, uploaded_by_profile_id, valid_from, valid_to,
    is_current, replacement_reason, metadata_json
  ) values (
    p_document_id, p_version_no, 'employee-documents', p_storage_path,
    p_original_file_name, p_mime_type, p_file_extension, p_file_size,
    p_checksum_sha256, p_uploaded_by_profile_id, p_valid_from, p_valid_to,
    true, p_replacement_reason, jsonb_build_object('client_mime', p_mime_type)
  )
  returning * into created_version;

  update public.employee_documents
     set current_version_id = created_version.id,
         status = 'active',
         issue_date = coalesce(p_issue_date, issue_date),
         expiry_date = coalesce(p_expiry_date, expiry_date),
         version_no = version_no + 1,
         updated_at = now()
   where id = p_document_id;

  return created_version;
end
$$;

revoke all on function public.hr_finalize_document_version(
  uuid, integer, integer, text, text, text, text, bigint, text, uuid,
  date, date, text, date, date
) from public, anon, authenticated;
grant execute on function public.hr_finalize_document_version(
  uuid, integer, integer, text, text, text, text, bigint, text, uuid,
  date, date, text, date, date
) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.employee_document_versions is
  'Immutable document-version metadata. File replacement creates a new row and storage object.';
comment on column public.employee_documents.document_number_masked is
  'Masked display value only. Full document numbers must not be returned by list APIs.';

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'employee_document_types', 'employee_documents',
    'employee_document_versions', 'employee_document_requirements'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
  end loop;
end
$$;

commit;
