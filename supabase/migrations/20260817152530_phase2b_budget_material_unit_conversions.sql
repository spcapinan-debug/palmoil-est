-- Phase 2B1.1: add the Material-specific package conversions required by the
-- guarded canonical Budget Block Material backfill.

begin;

-- Keep the guard and insert deterministic if another session attempts to
-- modify the conversion catalog concurrently.
lock table public.sku_conversions in share row exclusive mode;

do $phase2b_unit_remediation_guard$
declare
  mapping_row_count integer;
  mapping_code_count integer;
  exact_mapping_count integer;
  invalid_material_codes text;
  invalid_base_codes text;
  gram_candidate_count integer;
  conflicting_conversion_count integer;
  conflicting_conversion_details text;
begin
  with desired_materials (
    material_code,
    package_kg,
    forward_rate,
    reverse_rate
  ) as (
    values
      ('F-CM-0001', 25::numeric, 25000::numeric, 0.00004::numeric),
      ('F-CM-0004', 50::numeric, 50000::numeric, 0.00002::numeric),
      ('F-CM-0005', 25::numeric, 25000::numeric, 0.00004::numeric),
      ('F-CM-0006', 50::numeric, 50000::numeric, 0.00002::numeric),
      ('F-CM-0007', 50::numeric, 50000::numeric, 0.00002::numeric)
  )
  select
    count(*)::integer,
    count(distinct material_code)::integer,
    count(*) filter (
      where (material_code = 'F-CM-0001' and package_kg = 25 and forward_rate = 25000 and reverse_rate = 0.00004)
         or (material_code = 'F-CM-0004' and package_kg = 50 and forward_rate = 50000 and reverse_rate = 0.00002)
         or (material_code = 'F-CM-0005' and package_kg = 25 and forward_rate = 25000 and reverse_rate = 0.00004)
         or (material_code = 'F-CM-0006' and package_kg = 50 and forward_rate = 50000 and reverse_rate = 0.00002)
         or (material_code = 'F-CM-0007' and package_kg = 50 and forward_rate = 50000 and reverse_rate = 0.00002)
    )::integer
  into mapping_row_count, mapping_code_count, exact_mapping_count
  from desired_materials;

  if mapping_row_count <> 5
     or mapping_code_count <> 5
     or exact_mapping_count <> 5 then
    raise exception using
      errcode = 'P0001',
      message = 'Phase 2B1.1 aborted: fertilizer package mapping must remain exactly 25/50/25/50/50 KG';
  end if;

  with desired_materials (material_code) as (
    values
      ('F-CM-0001'),
      ('F-CM-0004'),
      ('F-CM-0005'),
      ('F-CM-0006'),
      ('F-CM-0007')
  ),
  material_resolution as (
    select
      desired.material_code,
      count(material.id) as candidate_count,
      count(material.id) filter (where material.status = 'active') as active_count
    from desired_materials desired
    left join public.materials material
      on material.material_code = desired.material_code
    group by desired.material_code
  )
  select string_agg(material_code, ', ' order by material_code)
  into invalid_material_codes
  from material_resolution
  where candidate_count <> 1 or active_count <> 1;

  if invalid_material_codes is not null then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Phase 2B1.1 aborted: Material codes must resolve to exactly one active row: %s',
        invalid_material_codes
      );
  end if;

  with desired_materials (material_code) as (
    values
      ('F-CM-0001'),
      ('F-CM-0004'),
      ('F-CM-0005'),
      ('F-CM-0006'),
      ('F-CM-0007')
  )
  select string_agg(desired.material_code, ', ' order by desired.material_code)
  into invalid_base_codes
  from desired_materials desired
  join public.materials material
    on material.material_code = desired.material_code
  left join public.units base_unit
    on base_unit.id = material.base_unit_id
  where material.base_unit_id is null
     or base_unit.id is null
     or base_unit.status <> 'active'
     or lower(btrim(base_unit.unit_name)) <> lower(btrim('กระสอบ'));

  if invalid_base_codes is not null then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Phase 2B1.1 aborted: canonical active base unit must be กระสอบ for: %s',
        invalid_base_codes
      );
  end if;

  select count(*)::integer
  into gram_candidate_count
  from public.units unit_row
  where unit_row.status = 'active'
    and lower(btrim(unit_row.unit_name)) = lower(btrim('กรัม'));

  if gram_candidate_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Phase 2B1.1 aborted: expected exactly one active canonical กรัม Unit, found %s',
        gram_candidate_count
      );
  end if;

  with desired_materials (
    material_code,
    forward_rate,
    reverse_rate
  ) as (
    values
      ('F-CM-0001', 25000::numeric, 0.00004::numeric),
      ('F-CM-0004', 50000::numeric, 0.00002::numeric),
      ('F-CM-0005', 25000::numeric, 0.00004::numeric),
      ('F-CM-0006', 50000::numeric, 0.00002::numeric),
      ('F-CM-0007', 50000::numeric, 0.00002::numeric)
  ),
  resolved_materials as (
    select
      material.id as material_id,
      material.material_code,
      material.base_unit_id,
      desired.forward_rate,
      desired.reverse_rate,
      gram_unit.id as gram_unit_id
    from desired_materials desired
    join public.materials material
      on material.material_code = desired.material_code
    cross join (
      select unit_row.id
      from public.units unit_row
      where unit_row.status = 'active'
        and lower(btrim(unit_row.unit_name)) = lower(btrim('กรัม'))
    ) gram_unit
  ),
  desired_conversions as (
    select
      material_id,
      material_code,
      base_unit_id as from_unit_id,
      gram_unit_id as to_unit_id,
      forward_rate as conversion_rate
    from resolved_materials
    union all
    select
      material_id,
      material_code,
      gram_unit_id as from_unit_id,
      base_unit_id as to_unit_id,
      reverse_rate as conversion_rate
    from resolved_materials
  ),
  conflicting_conversions as (
    select
      desired.material_code,
      existing.id,
      existing.status,
      existing.conversion_rate as existing_rate,
      desired.conversion_rate as required_rate
    from desired_conversions desired
    join public.sku_conversions existing
      on existing.material_id = desired.material_id
     and existing.from_unit_id = desired.from_unit_id
     and existing.to_unit_id = desired.to_unit_id
    where existing.status <> 'active'
       or existing.conversion_rate <> desired.conversion_rate
  )
  select
    count(*)::integer,
    string_agg(
      format(
        '%s[%s:%s->%s]',
        material_code,
        status,
        existing_rate,
        required_rate
      ),
      ', ' order by material_code, id
    )
  into conflicting_conversion_count, conflicting_conversion_details
  from conflicting_conversions;

  if conflicting_conversion_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Phase 2B1.1 aborted: %s conflicting existing SKU conversion(s): %s',
        conflicting_conversion_count,
        conflicting_conversion_details
      );
  end if;
end
$phase2b_unit_remediation_guard$;

with desired_materials (
  material_code,
  forward_rate,
  reverse_rate
) as (
  values
    ('F-CM-0001', 25000::numeric, 0.00004::numeric),
    ('F-CM-0004', 50000::numeric, 0.00002::numeric),
    ('F-CM-0005', 25000::numeric, 0.00004::numeric),
    ('F-CM-0006', 50000::numeric, 0.00002::numeric),
    ('F-CM-0007', 50000::numeric, 0.00002::numeric)
),
resolved_materials as (
  select
    material.id as material_id,
    material.base_unit_id,
    desired.forward_rate,
    desired.reverse_rate,
    gram_unit.id as gram_unit_id
  from desired_materials desired
  join public.materials material
    on material.material_code = desired.material_code
  cross join (
    select unit_row.id
    from public.units unit_row
    where unit_row.status = 'active'
      and lower(btrim(unit_row.unit_name)) = lower(btrim('กรัม'))
  ) gram_unit
),
desired_conversions as (
  select
    material_id,
    base_unit_id as from_unit_id,
    gram_unit_id as to_unit_id,
    forward_rate as conversion_rate
  from resolved_materials
  union all
  select
    material_id,
    gram_unit_id as from_unit_id,
    base_unit_id as to_unit_id,
    reverse_rate as conversion_rate
  from resolved_materials
)
insert into public.sku_conversions (
  material_id,
  from_unit_id,
  to_unit_id,
  conversion_rate,
  status
)
select
  desired.material_id,
  desired.from_unit_id,
  desired.to_unit_id,
  desired.conversion_rate,
  'active'
from desired_conversions desired
where not exists (
  select 1
  from public.sku_conversions existing
  where existing.material_id = desired.material_id
    and existing.from_unit_id = desired.from_unit_id
    and existing.to_unit_id = desired.to_unit_id
    and existing.conversion_rate = desired.conversion_rate
    and existing.status = 'active'
)
on conflict (material_id, from_unit_id, to_unit_id) do nothing;

commit;
