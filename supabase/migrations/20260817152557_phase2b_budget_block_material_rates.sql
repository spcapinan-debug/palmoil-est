-- Phase 2B1: additive canonical Block + Material Budget rates.
-- Legacy Budget tables remain available during the runtime transition.

begin;

create table if not exists public.budget_rate_block_materials (
  id uuid primary key default gen_random_uuid(),
  budget_rate_block_id text not null
    references public.budget_rate_blocks(id) on delete cascade,
  material_id uuid not null
    references public.materials(id) on delete restrict,
  usage_basis text not null,
  usage_rate numeric not null,
  unit_id uuid not null
    references public.units(id) on delete restrict,
  unit_cost numeric,
  amount_per_basis numeric,
  source_budget_rate_material_id text
    references public.budget_rate_materials(id) on delete set null,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint budget_rate_block_materials_usage_rate_positive
    check (usage_rate > 0),
  constraint budget_rate_block_materials_unit_cost_nonnegative
    check (unit_cost is null or unit_cost >= 0),
  constraint budget_rate_block_materials_amount_nonnegative
    check (amount_per_basis is null or amount_per_basis >= 0),
  constraint budget_rate_block_materials_usage_basis_valid
    check (usage_basis in ('tree_count', 'area_rai', 'manual_qty', 'bag_count')),
  constraint budget_rate_block_materials_status_valid
    check (status in ('active', 'inactive')),
  constraint budget_rate_block_materials_block_material_unique
    unique (budget_rate_block_id, material_id)
);

-- The legacy Budget relation keys are text primary keys. These two lineage
-- columns intentionally match their referenced key types; canonical Material,
-- Unit, profile, and row identities remain UUIDs.
comment on column public.budget_rate_block_materials.budget_rate_block_id is
  'Canonical parent Budget Block relation. Text matches the legacy parent primary-key type.';
comment on column public.budget_rate_block_materials.source_budget_rate_material_id is
  'Lineage to the shared legacy Budget material row. Text matches the legacy parent primary-key type.';
comment on column public.budget_rate_block_materials.unit_id is
  'Canonical usage-unit identity. Legacy usage_unit text is used only by the guarded migration resolver.';
comment on table public.budget_rate_block_materials is
  'Canonical per-Block Material usage rate owned by Budget. Activity is inherited through the Budget header.';

create index if not exists budget_rate_block_materials_block_idx
  on public.budget_rate_block_materials (budget_rate_block_id);
create index if not exists budget_rate_block_materials_material_idx
  on public.budget_rate_block_materials (material_id);
create index if not exists budget_rate_block_materials_unit_idx
  on public.budget_rate_block_materials (unit_id);
create index if not exists budget_rate_block_materials_source_idx
  on public.budget_rate_block_materials (source_budget_rate_material_id);

alter table public.budget_rate_block_materials enable row level security;

do $phase2b_policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'budget_rate_block_materials'
      and policyname = 'authenticated read budget_rate_block_materials'
  ) then
    execute 'create policy "authenticated read budget_rate_block_materials"
      on public.budget_rate_block_materials
      for select to authenticated using (true)';
  end if;
end
$phase2b_policy$;

revoke all on table public.budget_rate_block_materials from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.budget_rate_block_materials from authenticated;
grant select on table public.budget_rate_block_materials to authenticated;
grant all on table public.budget_rate_block_materials to service_role;

-- A Material-compatible unit graph begins with the Material base unit and
-- active SKU conversion endpoints, then adds only active Unit conversion
-- endpoints directly connected to those anchors. The normalized legacy name
-- must match exactly one active compatible Unit.
do $phase2b_backfill_guard$
declare
  unresolved_count integer;
  unresolved_ids text;
  duplicate_count integer;
  invalid_source_count integer;
begin
  with material_unit_anchors as (
    select m.id as material_id, m.base_unit_id as unit_id
    from public.materials m
    where m.base_unit_id is not null
    union
    select sc.material_id, sc.from_unit_id
    from public.sku_conversions sc
    where sc.status = 'active'
    union
    select sc.material_id, sc.to_unit_id
    from public.sku_conversions sc
    where sc.status = 'active'
  ),
  material_compatible_units as (
    select a.material_id, a.unit_id
    from material_unit_anchors a
    union
    select a.material_id, uc.from_unit_id
    from material_unit_anchors a
    join public.unit_conversions uc
      on uc.status = 'active'
     and (uc.from_unit_id = a.unit_id or uc.to_unit_id = a.unit_id)
    union
    select a.material_id, uc.to_unit_id
    from material_unit_anchors a
    join public.unit_conversions uc
      on uc.status = 'active'
     and (uc.from_unit_id = a.unit_id or uc.to_unit_id = a.unit_id)
  ),
  compatible_name_matches as (
    select brm.id as source_id, u.id as unit_id
    from public.budget_rate_materials brm
    join material_compatible_units compatible
      on compatible.material_id = brm.material_id
    join public.units u
      on u.id = compatible.unit_id
     and u.status = 'active'
     and lower(btrim(u.unit_name)) = lower(btrim(brm.usage_unit))
  ),
  unit_resolution as (
    select
      brm.id as source_id,
      count(distinct matches.unit_id) as candidate_count
    from public.budget_rate_materials brm
    left join compatible_name_matches matches on matches.source_id = brm.id
    group by brm.id
  )
  select
    count(*)::integer,
    string_agg(
      format('%s[%s]', source_id, candidate_count),
      ', ' order by source_id
    )
  into unresolved_count, unresolved_ids
  from unit_resolution
  where candidate_count <> 1;

  if unresolved_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Phase 2B1 backfill aborted: %s legacy Budget material unit mapping(s) are ambiguous or unmapped: %s',
        unresolved_count,
        unresolved_ids
      );
  end if;

  select count(*)::integer
  into duplicate_count
  from (
    select brm.budget_rate_id, brm.material_id
    from public.budget_rate_materials brm
    group by brm.budget_rate_id, brm.material_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Phase 2B1 backfill aborted: %s duplicate legacy Budget header/Material group(s) violate canonical uniqueness',
        duplicate_count
      );
  end if;

  select count(*)::integer
  into invalid_source_count
  from public.budget_rate_materials brm
  where brm.material_id is null
     or brm.usage_quantity is null
     or brm.usage_quantity <= 0
     or brm.usage_basis is null
     or brm.usage_basis not in ('tree_count', 'area_rai', 'manual_qty', 'bag_count')
     or brm.unit_cost < 0
     or brm.amount_per_basis < 0
     or coalesce(nullif(brm.status, ''), 'active') not in ('active', 'inactive');

  if invalid_source_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Phase 2B1 backfill aborted: %s legacy Budget material row(s) violate canonical constraints',
        invalid_source_count
      );
  end if;
end
$phase2b_backfill_guard$;

with material_unit_anchors as (
  select m.id as material_id, m.base_unit_id as unit_id
  from public.materials m
  where m.base_unit_id is not null
  union
  select sc.material_id, sc.from_unit_id
  from public.sku_conversions sc
  where sc.status = 'active'
  union
  select sc.material_id, sc.to_unit_id
  from public.sku_conversions sc
  where sc.status = 'active'
),
material_compatible_units as (
  select a.material_id, a.unit_id
  from material_unit_anchors a
  union
  select a.material_id, uc.from_unit_id
  from material_unit_anchors a
  join public.unit_conversions uc
    on uc.status = 'active'
   and (uc.from_unit_id = a.unit_id or uc.to_unit_id = a.unit_id)
  union
  select a.material_id, uc.to_unit_id
  from material_unit_anchors a
  join public.unit_conversions uc
    on uc.status = 'active'
   and (uc.from_unit_id = a.unit_id or uc.to_unit_id = a.unit_id)
),
compatible_name_matches as (
  select brm.id as source_id, u.id as unit_id
  from public.budget_rate_materials brm
  join material_compatible_units compatible
    on compatible.material_id = brm.material_id
  join public.units u
    on u.id = compatible.unit_id
   and u.status = 'active'
   and lower(btrim(u.unit_name)) = lower(btrim(brm.usage_unit))
),
safe_unit_resolution as (
  select
    brm.id as source_id,
    (array_agg(distinct matches.unit_id order by matches.unit_id))[1] as unit_id
  from public.budget_rate_materials brm
  join compatible_name_matches matches on matches.source_id = brm.id
  group by brm.id
  having count(distinct matches.unit_id) = 1
)
insert into public.budget_rate_block_materials (
  budget_rate_block_id,
  material_id,
  usage_basis,
  usage_rate,
  unit_id,
  unit_cost,
  amount_per_basis,
  source_budget_rate_material_id,
  status,
  note
)
select
  brb.id,
  brm.material_id,
  brm.usage_basis,
  brm.usage_quantity,
  resolved.unit_id,
  brm.unit_cost,
  brm.amount_per_basis,
  brm.id,
  coalesce(nullif(brm.status, ''), 'active'),
  brm.note
from public.budget_rate_blocks brb
join public.budget_activity_rates bar
  on bar.id = brb.budget_rate_id
join public.budget_rate_materials brm
  on brm.budget_rate_id = bar.id
join safe_unit_resolution resolved
  on resolved.source_id = brm.id
on conflict (budget_rate_block_id, material_id) do nothing;

commit;
