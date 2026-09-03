-- Phase 2A: additive canonical activity/material usage standard hardening.
-- No data backfill. Budget, Planning, and legacy work_order_materials are untouched.

create extension if not exists btree_gist with schema extensions;

alter table public.activity_material_usage_rates
  add column unit_id uuid references public.units(id) on delete restrict,
  add column fiscal_year text,
  add column version_no integer not null default 1,
  add column approval_status text not null default 'draft',
  add column source_type text not null default 'manual',
  add column note text,
  add column created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column updated_by_profile_id uuid references public.profiles(id) on delete set null,
  add column approved_by_profile_id uuid references public.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter table public.activity_material_usage_rates
  add constraint activity_material_usage_rates_version_positive check (version_no > 0),
  add constraint activity_material_usage_rates_usage_rate_positive check (usage_rate > 0),
  add constraint activity_material_usage_rates_usage_basis_canonical check (usage_basis in ('per_tree', 'per_rai')),
  add constraint activity_material_usage_rates_approval_status_valid check (approval_status in ('draft', 'approved', 'inactive')),
  add constraint activity_material_usage_rates_status_valid check (status in ('active', 'inactive')),
  add constraint activity_material_usage_rates_effective_dates_valid
    check (effective_end_date is null or effective_end_date >= effective_start_date),
  add constraint activity_material_usage_rates_approval_fields_valid
    check ((approval_status = 'approved' and approved_by_profile_id is not null and approved_at is not null)
      or approval_status in ('draft', 'inactive')),
  add constraint activity_material_usage_rates_version_unique
    unique (activity_id, material_id, fiscal_year, version_no),
  add constraint activity_material_usage_rates_no_approved_period_overlap
    exclude using gist (
      activity_id with =,
      material_id with =,
      daterange(effective_start_date, coalesce(effective_end_date, 'infinity'::date), '[]') with &&
    ) where (approval_status = 'approved' and status = 'active');

-- The table was empty at the audited baseline, so these fields can be required
-- without a rewrite or guessed backfill.
alter table public.activity_material_usage_rates
  alter column activity_id set not null,
  alter column material_id set not null,
  alter column usage_basis set not null,
  alter column unit_id set not null,
  alter column fiscal_year set not null,
  alter column effective_start_date set not null;

create index activity_material_usage_rates_activity_idx
  on public.activity_material_usage_rates (activity_id);
create index activity_material_usage_rates_material_idx
  on public.activity_material_usage_rates (material_id);
create index activity_material_usage_rates_effective_idx
  on public.activity_material_usage_rates (approval_status, status, effective_start_date, effective_end_date);

comment on column public.activity_material_usage_rates.unit_id is
  'Canonical standard usage unit. Packaging and issue-unit conversion remains in the inventory conversion model.';
comment on column public.activity_material_usage_rates.usage_unit is
  'Legacy display-only text. Canonical writes use unit_id.';
comment on column public.activity_material_usage_rates.fiscal_year is
  'Business fiscal/standard year supplied by the approved standard workflow.';

-- Browser clients retain authenticated read access but cannot mutate this
-- protected workflow table directly. Server actions use service_role.
revoke all on table public.activity_material_usage_rates from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.activity_material_usage_rates from authenticated;
grant select on table public.activity_material_usage_rates to authenticated;
grant all on table public.activity_material_usage_rates to service_role;
