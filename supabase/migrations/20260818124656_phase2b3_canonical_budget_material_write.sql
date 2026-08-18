-- Phase 2B3B: transactional canonical per-Block Material Budget writes.
-- This migration is additive and must be reviewed before it is applied.

begin;

create or replace function public.apply_budget_block_material_rates(
  p_operation text,
  p_budget_year_id text,
  p_budget_activity_rate_id text,
  p_budget_rate_block_ids text[],
  p_material_id uuid,
  p_usage_basis text,
  p_usage_rate numeric,
  p_unit_id uuid,
  p_actor_profile_id uuid,
  p_unit_cost numeric default null,
  p_amount_per_basis numeric default null,
  p_status text default 'active',
  p_note text default null,
  p_row_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2b3_rpc$
declare
  v_block_ids text[];
  v_expected_count integer;
  v_actual_count integer;
  v_existing public.budget_rate_block_materials%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_compatible boolean := false;
begin
  if p_operation is null or p_operation not in ('create', 'update', 'deactivate', 'bulk_apply') then
    raise exception using errcode = 'P0001', message = 'INVALID_BUDGET_MATERIAL_OPERATION';
  end if;

  if p_usage_basis is null or p_usage_basis not in ('tree_count', 'area_rai', 'manual_qty', 'bag_count') then
    raise exception using errcode = 'P0001', message = 'INVALID_BUDGET_USAGE_BASIS';
  end if;
  if p_usage_rate is null or p_usage_rate <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_BUDGET_USAGE_RATE';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_BUDGET_UNIT_COST';
  end if;
  if p_amount_per_basis is not null and p_amount_per_basis < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_BUDGET_AMOUNT_PER_BASIS';
  end if;
  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception using errcode = 'P0001', message = 'INVALID_BUDGET_MATERIAL_STATUS';
  end if;

  if p_actor_profile_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  perform 1
  from public.budget_years budget_year
  where budget_year.id = p_budget_year_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'BUDGET_YEAR_NOT_FOUND';
  end if;

  perform 1
  from public.budget_activity_rates budget_rate
  where budget_rate.id = p_budget_activity_rate_id
    and budget_rate.budget_year_id = p_budget_year_id
  for key share;
  if not found then
    if exists (
      select 1 from public.budget_activity_rates budget_rate
      where budget_rate.id = p_budget_activity_rate_id
    ) then
      raise exception using errcode = 'P0001', message = 'BUDGET_ACTIVITY_YEAR_MISMATCH';
    end if;
    raise exception using errcode = 'P0001', message = 'BUDGET_ACTIVITY_RATE_NOT_FOUND';
  end if;

  select coalesce(array_agg(distinct block_id order by block_id), '{}'::text[])
  into v_block_ids
  from unnest(coalesce(p_budget_rate_block_ids, '{}'::text[])) as selected(block_id)
  where nullif(btrim(selected.block_id), '') is not null;

  v_expected_count := cardinality(v_block_ids);
  if v_expected_count = 0 then
    raise exception using errcode = 'P0001', message = 'BUDGET_RATE_BLOCK_REQUIRED';
  end if;
  if p_operation in ('update', 'deactivate') and v_expected_count <> 1 then
    raise exception using errcode = 'P0001', message = 'SINGLE_BUDGET_RATE_BLOCK_REQUIRED';
  end if;
  if p_operation = 'create' and v_expected_count <> 1 then
    raise exception using errcode = 'P0001', message = 'SINGLE_BUDGET_RATE_BLOCK_REQUIRED';
  end if;

  perform 1
  from public.budget_rate_blocks budget_block
  where budget_block.id = any(v_block_ids)
  for key share;

  select count(*)::integer
  into v_actual_count
  from public.budget_rate_blocks budget_block
  where budget_block.id = any(v_block_ids);
  if v_actual_count <> v_expected_count then
    raise exception using errcode = 'P0001', message = 'BUDGET_RATE_BLOCK_NOT_FOUND';
  end if;
  if exists (
    select 1
    from public.budget_rate_blocks budget_block
    where budget_block.id = any(v_block_ids)
      and budget_block.budget_rate_id <> p_budget_activity_rate_id
  ) then
    raise exception using errcode = 'P0001', message = 'BUDGET_BLOCK_ACTIVITY_MISMATCH';
  end if;

  perform 1
  from public.materials material
  where material.id = p_material_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.materials material
    where material.id = p_material_id and material.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'MATERIAL_INACTIVE';
  end if;

  perform 1
  from public.units unit_row
  where unit_row.id = p_unit_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'UNIT_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.units unit_row
    where unit_row.id = p_unit_id and unit_row.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'UNIT_INACTIVE';
  end if;

  with material_unit_anchors as (
    select material.base_unit_id as unit_id
    from public.materials material
    where material.id = p_material_id
      and material.base_unit_id is not null
    union
    select conversion.from_unit_id
    from public.sku_conversions conversion
    where conversion.material_id = p_material_id
      and conversion.status = 'active'
    union
    select conversion.to_unit_id
    from public.sku_conversions conversion
    where conversion.material_id = p_material_id
      and conversion.status = 'active'
  ),
  material_compatible_units as (
    select anchor.unit_id
    from material_unit_anchors anchor
    union
    select conversion.from_unit_id
    from public.unit_conversions conversion
    join material_unit_anchors anchor
      on conversion.from_unit_id = anchor.unit_id
      or conversion.to_unit_id = anchor.unit_id
    where conversion.status = 'active'
    union
    select conversion.to_unit_id
    from public.unit_conversions conversion
    join material_unit_anchors anchor
      on conversion.from_unit_id = anchor.unit_id
      or conversion.to_unit_id = anchor.unit_id
    where conversion.status = 'active'
  )
  select exists (
    select 1
    from material_compatible_units compatible
    where compatible.unit_id = p_unit_id
  )
  into v_compatible;

  if not v_compatible then
    raise exception using errcode = 'P0001', message = 'MATERIAL_UNIT_INCOMPATIBLE';
  end if;

  if p_operation in ('update', 'deactivate') then
    if p_row_id is null then
      raise exception using errcode = 'P0001', message = 'BUDGET_BLOCK_MATERIAL_ROW_REQUIRED';
    end if;
    select target.*
    into v_existing
    from public.budget_rate_block_materials target
    where target.id = p_row_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'BUDGET_BLOCK_MATERIAL_NOT_FOUND';
    end if;
    if v_existing.budget_rate_block_id <> v_block_ids[1] then
      raise exception using errcode = 'P0001', message = 'BUDGET_BLOCK_MATERIAL_PARENT_MISMATCH';
    end if;
  end if;

  if p_operation in ('create', 'bulk_apply') then
    if exists (
      select 1
      from public.budget_rate_block_materials existing
      where existing.budget_rate_block_id = any(v_block_ids)
        and existing.material_id = p_material_id
    ) then
      raise exception using errcode = 'P0001', message = 'BUDGET_BLOCK_MATERIAL_DUPLICATE';
    end if;

    with inserted as (
      insert into public.budget_rate_block_materials (
        budget_rate_block_id,
        material_id,
        usage_basis,
        usage_rate,
        unit_id,
        unit_cost,
        amount_per_basis,
        status,
        note,
        created_by,
        updated_by
      )
      select
        selected.block_id,
        p_material_id,
        p_usage_basis,
        p_usage_rate,
        p_unit_id,
        p_unit_cost,
        p_amount_per_basis,
        p_status,
        nullif(btrim(p_note), ''),
        p_actor_profile_id,
        p_actor_profile_id
      from unnest(v_block_ids) as selected(block_id)
      returning *
    )
    select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
    into v_rows
    from inserted;
  elsif p_operation = 'update' then
    if exists (
      select 1
      from public.budget_rate_block_materials existing
      where existing.budget_rate_block_id = v_block_ids[1]
        and existing.material_id = p_material_id
        and existing.id <> p_row_id
    ) then
      raise exception using errcode = 'P0001', message = 'BUDGET_BLOCK_MATERIAL_DUPLICATE';
    end if;

    with updated as (
      update public.budget_rate_block_materials as target
      set material_id = p_material_id,
          usage_basis = p_usage_basis,
          usage_rate = p_usage_rate,
          unit_id = p_unit_id,
          unit_cost = p_unit_cost,
          amount_per_basis = p_amount_per_basis,
          status = p_status,
          note = nullif(btrim(p_note), ''),
          updated_by = p_actor_profile_id,
          updated_at = now()
      where target.id = p_row_id
      returning *
    )
    select coalesce(jsonb_agg(to_jsonb(updated)), '[]'::jsonb)
    into v_rows
    from updated;
  else
    with deactivated as (
      update public.budget_rate_block_materials as target
      set status = 'inactive',
          note = coalesce(nullif(btrim(p_note), ''), target.note),
          updated_by = p_actor_profile_id,
          updated_at = now()
      where target.id = p_row_id
      returning *
    )
    select coalesce(jsonb_agg(to_jsonb(deactivated)), '[]'::jsonb)
    into v_rows
    from deactivated;
  end if;

  return jsonb_build_object(
    'operation', p_operation,
    'count', jsonb_array_length(v_rows),
    'rows', v_rows
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'BUDGET_BLOCK_MATERIAL_DUPLICATE';
end
$phase2b3_rpc$;

comment on function public.apply_budget_block_material_rates(
  text, text, text, text[], uuid, text, numeric, uuid, uuid,
  numeric, numeric, text, text, uuid
) is
  'Atomic service-only create, update, deactivate, and multi-Block apply for canonical Budget Material rates.';

revoke all on function public.apply_budget_block_material_rates(
  text, text, text, text[], uuid, text, numeric, uuid, uuid,
  numeric, numeric, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.apply_budget_block_material_rates(
  text, text, text, text[], uuid, text, numeric, uuid, uuid,
  numeric, numeric, text, text, uuid
) to service_role;

commit;
