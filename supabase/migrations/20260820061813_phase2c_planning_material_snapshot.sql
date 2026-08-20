-- Phase 2C: canonical Planning Material snapshot schema and transactional RPCs.
-- Additive local implementation only. Historical Planning and Work Order rows are not backfilled.

begin;

alter table public.planned_work_items
  add column source_budget_year_id text,
  add column source_budget_activity_rate_id text,
  add column source_budget_rate_block_id text,
  add column planning_request_key text;

alter table public.planned_work_items
  add constraint planned_work_items_source_budget_year_fkey
    foreign key (source_budget_year_id)
    references public.budget_years(id)
    on delete restrict,
  add constraint planned_work_items_source_budget_activity_rate_fkey
    foreign key (source_budget_activity_rate_id)
    references public.budget_activity_rates(id)
    on delete restrict,
  add constraint planned_work_items_source_budget_rate_block_fkey
    foreign key (source_budget_rate_block_id)
    references public.budget_rate_blocks(id)
    on delete restrict,
  add constraint planned_work_items_canonical_lineage_complete
    check (
      (
        source_budget_year_id is null
        and source_budget_activity_rate_id is null
        and source_budget_rate_block_id is null
        and planning_request_key is null
      )
      or
      (
        source_budget_year_id is not null
        and source_budget_activity_rate_id is not null
        and source_budget_rate_block_id is not null
        and nullif(btrim(planning_request_key), '') is not null
      )
    ),
  add constraint planned_work_items_planning_request_key_not_blank
    check (planning_request_key is null or nullif(btrim(planning_request_key), '') is not null);

create index planned_work_items_source_budget_year_idx
  on public.planned_work_items (source_budget_year_id);
create index planned_work_items_source_budget_activity_rate_idx
  on public.planned_work_items (source_budget_activity_rate_id);
create index planned_work_items_source_budget_rate_block_idx
  on public.planned_work_items (source_budget_rate_block_id);
create unique index planned_work_items_planning_request_key_uidx
  on public.planned_work_items (planning_request_key)
  where planning_request_key is not null;

comment on column public.planned_work_items.source_budget_year_id is
  'Canonical Budget Year selected for a new Planning item. Nullable for historical compatibility.';
comment on column public.planned_work_items.source_budget_activity_rate_id is
  'Canonical Budget Activity Rate selected for a new Planning item. Nullable for historical compatibility.';
comment on column public.planned_work_items.source_budget_rate_block_id is
  'Canonical Budget Rate Block selected for a new Planning item. Nullable for historical compatibility.';
comment on column public.planned_work_items.planning_request_key is
  'Caller-supplied stable idempotency key for canonical Planning creation; never derived from timestamps.';

alter table public.planned_work_materials
  add column source_budget_rate_block_material_id uuid,
  add column snapshot_source_type text,
  add column snapshot_usage_basis text,
  add column snapshot_usage_rate numeric,
  add column snapshot_basis_quantity numeric,
  add column snapshot_unit_cost numeric,
  add column snapshot_amount_per_basis numeric,
  add column snapshot_at timestamptz;

alter table public.planned_work_materials
  add constraint planned_work_materials_source_budget_block_material_fkey
    foreign key (source_budget_rate_block_material_id)
    references public.budget_rate_block_materials(id)
    on delete restrict,
  add constraint planned_work_materials_item_material_unique
    unique (planned_work_item_id, material_id),
  add constraint planned_work_materials_planned_quantity_nonnegative
    check (planned_quantity >= 0),
  add constraint planned_work_materials_estimated_unit_cost_nonnegative
    check (estimated_unit_cost >= 0),
  add constraint planned_work_materials_estimated_amount_nonnegative
    check (estimated_amount >= 0),
  add constraint planned_work_materials_snapshot_usage_basis_valid
    check (
      snapshot_usage_basis is null
      or snapshot_usage_basis in ('tree_count', 'area_rai', 'manual_qty', 'bag_count')
    ),
  add constraint planned_work_materials_snapshot_unit_cost_nonnegative
    check (snapshot_unit_cost is null or snapshot_unit_cost >= 0),
  add constraint planned_work_materials_snapshot_amount_nonnegative
    check (snapshot_amount_per_basis is null or snapshot_amount_per_basis >= 0),
  add constraint planned_work_materials_canonical_snapshot_complete
    check (
      snapshot_source_type is distinct from 'canonical_budget_block_material'
      or (
        source_budget_rate_block_material_id is not null
        and snapshot_usage_basis is not null
        and snapshot_usage_rate is not null
        and snapshot_usage_rate > 0
        and snapshot_basis_quantity is not null
        and snapshot_basis_quantity >= 0
        and unit_id is not null
        and planned_quantity >= 0
        and snapshot_at is not null
      )
    );

create index planned_work_materials_source_budget_block_material_idx
  on public.planned_work_materials (source_budget_rate_block_material_id);
create unique index planned_work_materials_item_source_budget_material_uidx
  on public.planned_work_materials (
    planned_work_item_id,
    source_budget_rate_block_material_id
  )
  where source_budget_rate_block_material_id is not null;

comment on column public.planned_work_materials.source_budget_rate_block_material_id is
  'Direct authoritative canonical Budget Block Material source. Nullable for historical compatibility.';
comment on column public.planned_work_materials.snapshot_source_type is
  'Explicit snapshot origin. New canonical rows use canonical_budget_block_material.';
comment on column public.planned_work_materials.snapshot_usage_basis is
  'Frozen canonical usage basis used by Planning.';
comment on column public.planned_work_materials.snapshot_usage_rate is
  'Frozen canonical usage rate used by Planning.';
comment on column public.planned_work_materials.snapshot_basis_quantity is
  'Frozen Block tree_count or area_rai used to reproduce planned_quantity.';
comment on column public.planned_work_materials.snapshot_unit_cost is
  'Exact nullable canonical unit_cost source value. NULL is distinct from zero.';
comment on column public.planned_work_materials.snapshot_amount_per_basis is
  'Exact nullable canonical amount_per_basis source value. NULL is distinct from zero.';
comment on column public.planned_work_materials.snapshot_at is
  'Transaction timestamp at which the canonical Planning Material snapshot was created or refreshed.';

create or replace function public.guard_canonical_planning_item_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $phase2c_item_guard$
declare
  v_expected_plan_count integer := 0;
  v_locked_plan_count integer := 0;
  v_plan record;
  v_is_canonical boolean;
begin
  if tg_op = 'INSERT' then
    v_is_canonical :=
      new.planning_request_key is not null
      or new.source_budget_year_id is not null
      or new.source_budget_activity_rate_id is not null
      or new.source_budget_rate_block_id is not null;
  elsif tg_op = 'DELETE' then
    v_is_canonical :=
      old.planning_request_key is not null
      or old.source_budget_year_id is not null
      or old.source_budget_activity_rate_id is not null
      or old.source_budget_rate_block_id is not null;
  else
    v_is_canonical :=
      new.planning_request_key is not null
      or new.source_budget_year_id is not null
      or new.source_budget_activity_rate_id is not null
      or new.source_budget_rate_block_id is not null
      or old.planning_request_key is not null
      or old.source_budget_year_id is not null
      or old.source_budget_activity_rate_id is not null
      or old.source_budget_rate_block_id is not null;
  end if;

  if not v_is_canonical then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select count(distinct plan_id)::integer
  into v_expected_plan_count
  from unnest(array[
    case when tg_op <> 'INSERT' then old.annual_plan_id else null end,
    case when tg_op <> 'DELETE' then new.annual_plan_id else null end
  ]::uuid[]) as selected(plan_id)
  where selected.plan_id is not null;

  for v_plan in
    select annual_plan.id, annual_plan.status
    from public.annual_work_plans annual_plan
    where annual_plan.id in (
      select distinct selected.plan_id
      from unnest(array[
        case when tg_op <> 'INSERT' then old.annual_plan_id else null end,
        case when tg_op <> 'DELETE' then new.annual_plan_id else null end
      ]::uuid[]) as selected(plan_id)
      where selected.plan_id is not null
    )
    order by annual_plan.id
    for update
  loop
    v_locked_plan_count := v_locked_plan_count + 1;
    if v_plan.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
    end if;
  end loop;

  if v_expected_plan_count = 0 or v_locked_plan_count <> v_expected_plan_count then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;

  if current_setting('app.phase2c_snapshot_rpc', true) is distinct from 'on' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ACTION_REQUIRED';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$phase2c_item_guard$;

create trigger guard_canonical_planning_item_insert
before insert on public.planned_work_items
for each row
when (
  new.planning_request_key is not null
  or new.source_budget_year_id is not null
  or new.source_budget_activity_rate_id is not null
  or new.source_budget_rate_block_id is not null
)
execute function public.guard_canonical_planning_item_mutation();

create trigger guard_canonical_planning_item_lineage_update
before update of
  annual_plan_id,
  activity_id,
  block_id,
  source_budget_year_id,
  source_budget_activity_rate_id,
  source_budget_rate_block_id,
  planning_request_key
on public.planned_work_items
for each row
when (
  old.planning_request_key is not null
  or old.source_budget_year_id is not null
  or old.source_budget_activity_rate_id is not null
  or old.source_budget_rate_block_id is not null
  or new.planning_request_key is not null
  or new.source_budget_year_id is not null
  or new.source_budget_activity_rate_id is not null
  or new.source_budget_rate_block_id is not null
)
execute function public.guard_canonical_planning_item_mutation();

create trigger guard_canonical_planning_item_delete
before delete on public.planned_work_items
for each row
when (
  old.planning_request_key is not null
  or old.source_budget_year_id is not null
  or old.source_budget_activity_rate_id is not null
  or old.source_budget_rate_block_id is not null
)
execute function public.guard_canonical_planning_item_mutation();

create or replace function public.guard_canonical_planning_material_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $phase2c_material_guard$
declare
  v_item_id uuid;
  v_plan_status text;
  v_is_canonical boolean;
begin
  v_item_id := case when tg_op = 'DELETE' then old.planned_work_item_id else new.planned_work_item_id end;
  if tg_op = 'INSERT' then
    v_is_canonical := new.snapshot_source_type = 'canonical_budget_block_material';
  elsif tg_op = 'DELETE' then
    v_is_canonical := old.snapshot_source_type = 'canonical_budget_block_material';
  else
    v_is_canonical :=
      new.snapshot_source_type = 'canonical_budget_block_material'
      or old.snapshot_source_type = 'canonical_budget_block_material';
  end if;

  if not v_is_canonical then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select annual_plan.status
  into v_plan_status
  from public.planned_work_items planned_item
  join public.annual_work_plans annual_plan
    on annual_plan.id = planned_item.annual_plan_id
  where planned_item.id = v_item_id
  for update of annual_plan;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;
  if v_plan_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;
  if current_setting('app.phase2c_snapshot_rpc', true) is distinct from 'on' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ACTION_REQUIRED';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$phase2c_material_guard$;

create trigger guard_canonical_planning_material_insert
before insert on public.planned_work_materials
for each row
when (new.snapshot_source_type = 'canonical_budget_block_material')
execute function public.guard_canonical_planning_material_mutation();

create trigger guard_canonical_planning_material_update
before update on public.planned_work_materials
for each row
when (
  old.snapshot_source_type = 'canonical_budget_block_material'
  or new.snapshot_source_type = 'canonical_budget_block_material'
)
execute function public.guard_canonical_planning_material_mutation();

create trigger guard_canonical_planning_material_delete
before delete on public.planned_work_materials
for each row
when (old.snapshot_source_type = 'canonical_budget_block_material')
execute function public.guard_canonical_planning_material_mutation();

create or replace function public.populate_canonical_planning_material_snapshot(
  p_planned_work_item_id uuid,
  p_budget_year_id text,
  p_budget_activity_rate_id text,
  p_budget_rate_block_id text,
  p_block_id uuid,
  p_activity_id uuid,
  p_snapshot_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $phase2c_snapshot_populate$
declare
  v_block public.blocks%rowtype;
  v_material_count integer := 0;
begin
  perform 1
  from public.budget_years budget_year
  where budget_year.id = p_budget_year_id
    and budget_year.status = 'active'
    and budget_year.snapshot_required is true
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_BUDGET_YEAR_NOT_ELIGIBLE';
  end if;

  perform 1
  from public.budget_activity_rates budget_rate
  where budget_rate.id = p_budget_activity_rate_id
    and budget_rate.budget_year_id = p_budget_year_id
    and budget_rate.activity_id = p_activity_id
    and budget_rate.approval_status = 'approved'
    and budget_rate.status = 'active'
    and budget_rate.is_current is true
  for share;
  if not found then
    if exists (
      select 1
      from public.budget_activity_rates budget_rate
      where budget_rate.id = p_budget_activity_rate_id
        and budget_rate.budget_year_id = p_budget_year_id
        and budget_rate.activity_id is distinct from p_activity_id
    ) then
      raise exception using errcode = 'P0001', message = 'PLANNING_ACTIVITY_LINEAGE_MISMATCH';
    end if;
    raise exception using errcode = 'P0001', message = 'PLANNING_BUDGET_ACTIVITY_RATE_NOT_ELIGIBLE';
  end if;

  perform 1
  from public.budget_rate_blocks budget_block
  where budget_block.id = p_budget_rate_block_id
    and budget_block.budget_rate_id = p_budget_activity_rate_id
    and budget_block.block_id = p_block_id
    and budget_block.status = 'active'
  for update;
  if not found then
    if exists (
      select 1
      from public.budget_rate_blocks budget_block
      where budget_block.id = p_budget_rate_block_id
        and budget_block.budget_rate_id = p_budget_activity_rate_id
        and budget_block.block_id is distinct from p_block_id
    ) then
      raise exception using errcode = 'P0001', message = 'PLANNING_BLOCK_LINEAGE_MISMATCH';
    end if;
    raise exception using errcode = 'P0001', message = 'PLANNING_BUDGET_RATE_BLOCK_NOT_ELIGIBLE';
  end if;

  select block_row.*
  into v_block
  from public.blocks block_row
  where block_row.id = p_block_id
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_BLOCK_NOT_FOUND';
  end if;

  perform 1
  from public.budget_rate_block_materials source_row
  where source_row.budget_rate_block_id = p_budget_rate_block_id
  order by source_row.id
  for share;

  if not exists (
    select 1
    from public.budget_rate_block_materials source_row
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_MATERIAL_SNAPSHOT_EMPTY';
  end if;

  if exists (
    select 1
    from public.budget_rate_block_materials source_row
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
      and source_row.usage_basis in ('manual_qty', 'bag_count')
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_BASIS_NOT_SUPPORTED';
  end if;

  if exists (
    select 1
    from public.budget_rate_block_materials source_row
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
      and source_row.usage_basis not in ('tree_count', 'area_rai', 'manual_qty', 'bag_count')
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_BASIS_NOT_SUPPORTED';
  end if;

  perform 1
  from public.materials material
  where material.id in (
    select source_row.material_id
    from public.budget_rate_block_materials source_row
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
  )
  order by material.id
  for share;

  if exists (
    select 1
    from public.budget_rate_block_materials source_row
    join public.materials material on material.id = source_row.material_id
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
      and material.status <> 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'MATERIAL_INACTIVE';
  end if;

  perform 1
  from public.units unit_row
  where unit_row.id in (
    select source_row.unit_id
    from public.budget_rate_block_materials source_row
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
  )
  order by unit_row.id
  for share;

  if exists (
    select 1
    from public.budget_rate_block_materials source_row
    join public.units unit_row on unit_row.id = source_row.unit_id
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
      and unit_row.status <> 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'UNIT_INACTIVE';
  end if;

  if exists (
    select 1
    from public.budget_rate_block_materials source_row
    where source_row.budget_rate_block_id = p_budget_rate_block_id
      and source_row.status = 'active'
      and (
        (source_row.usage_basis = 'tree_count' and v_block.tree_count < 0)
        or (source_row.usage_basis = 'area_rai' and v_block.area_rai < 0)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_BASIS_QUANTITY_INVALID';
  end if;

  insert into public.planned_work_materials (
    planned_work_item_id,
    material_id,
    planned_quantity,
    unit_id,
    estimated_unit_cost,
    status,
    source_budget_rate_block_material_id,
    snapshot_source_type,
    snapshot_usage_basis,
    snapshot_usage_rate,
    snapshot_basis_quantity,
    snapshot_unit_cost,
    snapshot_amount_per_basis,
    snapshot_at
  )
  select
    p_planned_work_item_id,
    source_row.material_id,
    (
      case source_row.usage_basis
        when 'tree_count' then v_block.tree_count::numeric
        when 'area_rai' then v_block.area_rai
      end
    ) * source_row.usage_rate,
    source_row.unit_id,
    0,
    'planned',
    source_row.id,
    'canonical_budget_block_material',
    source_row.usage_basis,
    source_row.usage_rate,
    case source_row.usage_basis
      when 'tree_count' then v_block.tree_count::numeric
      when 'area_rai' then v_block.area_rai
    end,
    source_row.unit_cost,
    source_row.amount_per_basis,
    p_snapshot_at
  from public.budget_rate_block_materials source_row
  join public.materials material on material.id = source_row.material_id
  join public.units unit_row on unit_row.id = source_row.unit_id
  where source_row.budget_rate_block_id = p_budget_rate_block_id
    and source_row.status = 'active'
    and material.status = 'active'
    and unit_row.status = 'active'
  order by source_row.id;

  get diagnostics v_material_count = row_count;
  if v_material_count = 0 then
    raise exception using errcode = 'P0001', message = 'PLANNING_MATERIAL_SNAPSHOT_EMPTY';
  end if;

  return v_material_count;
end
$phase2c_snapshot_populate$;

comment on function public.populate_canonical_planning_material_snapshot(
  uuid, text, text, text, uuid, uuid, timestamptz
) is
  'Internal service-only canonical Planning Material validation, locking, calculation, and insertion helper.';

create or replace function public.create_canonical_planned_work_item_snapshot(
  p_annual_plan_id uuid,
  p_budget_year_id text,
  p_budget_activity_rate_id text,
  p_budget_rate_block_id text,
  p_block_id uuid,
  p_activity_id uuid,
  p_planning_request_key text,
  p_actor_profile_id uuid,
  p_plot_id uuid default null,
  p_planned_start_date date default null,
  p_planned_end_date date default null,
  p_recurrence_type text default null,
  p_recurrence_interval integer default null,
  p_repeat_after_last_done_days integer default null,
  p_target_quantity numeric default null,
  p_target_unit text default null,
  p_planned_budget numeric default null,
  p_suggested_team_id uuid default null,
  p_status text default 'planned',
  p_note text default null,
  p_ap_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_create_rpc$
declare
  v_item public.planned_work_items%rowtype;
  v_material_count integer := 0;
  v_request_key text := nullif(btrim(p_planning_request_key), '');
  v_snapshot_at timestamptz := transaction_timestamp();
  v_normalized_note text := nullif(btrim(p_note), '');
begin
  if v_request_key is null then
    raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REQUIRED';
  end if;

  if p_actor_profile_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select planned_item.*
  into v_item
  from public.planned_work_items planned_item
  where planned_item.planning_request_key = v_request_key
  for key share;

  if found then
    if v_item.source_type <> 'canonical_budget'
      or v_item.annual_plan_id is distinct from p_annual_plan_id
      or v_item.source_budget_year_id is distinct from p_budget_year_id
      or v_item.source_budget_activity_rate_id is distinct from p_budget_activity_rate_id
      or v_item.source_budget_rate_block_id is distinct from p_budget_rate_block_id
      or v_item.block_id is distinct from p_block_id
      or v_item.activity_id is distinct from p_activity_id
      or v_item.plot_id is distinct from p_plot_id
      or v_item.planned_start_date is distinct from p_planned_start_date
      or v_item.planned_end_date is distinct from p_planned_end_date
      or v_item.recurrence_type is distinct from p_recurrence_type
      or v_item.recurrence_interval is distinct from p_recurrence_interval
      or v_item.repeat_after_last_done_days is distinct from p_repeat_after_last_done_days
      or v_item.target_quantity is distinct from p_target_quantity
      or v_item.target_unit is distinct from p_target_unit
      or v_item.planned_budget is distinct from p_planned_budget
      or v_item.suggested_team_id is distinct from p_suggested_team_id
      or v_item.status is distinct from p_status
      or v_item.note is distinct from v_normalized_note
      or v_item.ap_code is distinct from p_ap_code
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REUSED';
    end if;

    select count(*)::integer
    into v_material_count
    from public.planned_work_materials material_snapshot
    where material_snapshot.planned_work_item_id = v_item.id
      and material_snapshot.snapshot_source_type = 'canonical_budget_block_material';

    return jsonb_build_object(
      'planned_work_item', to_jsonb(v_item),
      'material_count', v_material_count,
      'already_exists', true
    );
  end if;

  perform 1
  from public.annual_work_plans annual_plan
  where annual_plan.id = p_annual_plan_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;
  if not exists (
    select 1
    from public.annual_work_plans annual_plan
    where annual_plan.id = p_annual_plan_id
      and annual_plan.status = 'draft'
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  perform set_config('app.phase2c_snapshot_rpc', 'on', true);

  insert into public.planned_work_items (
    annual_plan_id,
    plot_id,
    activity_id,
    planned_start_date,
    planned_end_date,
    recurrence_type,
    recurrence_interval,
    repeat_after_last_done_days,
    target_quantity,
    target_unit,
    planned_budget,
    suggested_team_id,
    status,
    note,
    block_id,
    ap_code,
    source_type,
    source_budget_year_id,
    source_budget_activity_rate_id,
    source_budget_rate_block_id,
    planning_request_key,
    created_at,
    updated_at
  )
  values (
    p_annual_plan_id,
    p_plot_id,
    p_activity_id,
    p_planned_start_date,
    p_planned_end_date,
    p_recurrence_type,
    p_recurrence_interval,
    p_repeat_after_last_done_days,
    p_target_quantity,
    p_target_unit,
    p_planned_budget,
    p_suggested_team_id,
    p_status,
    v_normalized_note,
    p_block_id,
    p_ap_code,
    'canonical_budget',
    p_budget_year_id,
    p_budget_activity_rate_id,
    p_budget_rate_block_id,
    v_request_key,
    v_snapshot_at,
    v_snapshot_at
  )
  on conflict (planning_request_key)
    where planning_request_key is not null
  do nothing
  returning * into v_item;

  if not found then
    select planned_item.*
    into v_item
    from public.planned_work_items planned_item
    where planned_item.planning_request_key = v_request_key
    for key share;

    if not found
      or v_item.source_type <> 'canonical_budget'
      or v_item.annual_plan_id is distinct from p_annual_plan_id
      or v_item.source_budget_year_id is distinct from p_budget_year_id
      or v_item.source_budget_activity_rate_id is distinct from p_budget_activity_rate_id
      or v_item.source_budget_rate_block_id is distinct from p_budget_rate_block_id
      or v_item.block_id is distinct from p_block_id
      or v_item.activity_id is distinct from p_activity_id
      or v_item.plot_id is distinct from p_plot_id
      or v_item.planned_start_date is distinct from p_planned_start_date
      or v_item.planned_end_date is distinct from p_planned_end_date
      or v_item.recurrence_type is distinct from p_recurrence_type
      or v_item.recurrence_interval is distinct from p_recurrence_interval
      or v_item.repeat_after_last_done_days is distinct from p_repeat_after_last_done_days
      or v_item.target_quantity is distinct from p_target_quantity
      or v_item.target_unit is distinct from p_target_unit
      or v_item.planned_budget is distinct from p_planned_budget
      or v_item.suggested_team_id is distinct from p_suggested_team_id
      or v_item.status is distinct from p_status
      or v_item.note is distinct from v_normalized_note
      or v_item.ap_code is distinct from p_ap_code
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REUSED';
    end if;

    select count(*)::integer
    into v_material_count
    from public.planned_work_materials material_snapshot
    where material_snapshot.planned_work_item_id = v_item.id
      and material_snapshot.snapshot_source_type = 'canonical_budget_block_material';

    return jsonb_build_object(
      'planned_work_item', to_jsonb(v_item),
      'material_count', v_material_count,
      'already_exists', true
    );
  end if;

  v_material_count := public.populate_canonical_planning_material_snapshot(
    v_item.id,
    p_budget_year_id,
    p_budget_activity_rate_id,
    p_budget_rate_block_id,
    p_block_id,
    p_activity_id,
    v_snapshot_at
  );

  return jsonb_build_object(
    'planned_work_item', to_jsonb(v_item),
    'material_count', v_material_count,
    'already_exists', false
  );
end
$phase2c_create_rpc$;

comment on function public.create_canonical_planned_work_item_snapshot(
  uuid, text, text, text, uuid, uuid, text, uuid, uuid, date, date,
  text, integer, integer, numeric, text, numeric, uuid, text, text, text
) is
  'Atomic service-only creation of one canonical Planned Work Item and its complete immutable Material snapshot.';

create or replace function public.refresh_canonical_planned_work_item_snapshot(
  p_planned_work_item_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_refresh_rpc$
declare
  v_item public.planned_work_items%rowtype;
  v_annual_plan_id uuid;
  v_material_count integer := 0;
  v_snapshot_at timestamptz := transaction_timestamp();
begin
  if p_actor_profile_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select planned_item.annual_plan_id
  into v_annual_plan_id
  from public.planned_work_items planned_item
  where planned_item.id = p_planned_work_item_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;

  perform 1
  from public.annual_work_plans annual_plan
  where annual_plan.id = v_annual_plan_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;
  if not exists (
    select 1
    from public.annual_work_plans annual_plan
    where annual_plan.id = v_annual_plan_id
      and annual_plan.status = 'draft'
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  select planned_item.*
  into v_item
  from public.planned_work_items planned_item
  where planned_item.id = p_planned_work_item_id
    and planned_item.annual_plan_id = v_annual_plan_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;

  if v_item.source_type <> 'canonical_budget'
    or v_item.source_budget_year_id is null
    or v_item.source_budget_activity_rate_id is null
    or v_item.source_budget_rate_block_id is null
    or v_item.block_id is null
    or v_item.activity_id is null
    or v_item.planning_request_key is null
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;

  perform set_config('app.phase2c_snapshot_rpc', 'on', true);

  delete from public.planned_work_materials material_snapshot
  where material_snapshot.planned_work_item_id = v_item.id
    and material_snapshot.snapshot_source_type = 'canonical_budget_block_material';

  v_material_count := public.populate_canonical_planning_material_snapshot(
    v_item.id,
    v_item.source_budget_year_id,
    v_item.source_budget_activity_rate_id,
    v_item.source_budget_rate_block_id,
    v_item.block_id,
    v_item.activity_id,
    v_snapshot_at
  );

  update public.planned_work_items
  set updated_at = v_snapshot_at
  where id = v_item.id
  returning * into v_item;

  return jsonb_build_object(
    'planned_work_item', to_jsonb(v_item),
    'material_count', v_material_count,
    'snapshot_at', v_snapshot_at
  );
end
$phase2c_refresh_rpc$;

comment on function public.refresh_canonical_planned_work_item_snapshot(uuid, uuid) is
  'Atomic service-only replacement of a draft canonical Planned Work Item Material snapshot using stored parent lineage.';

revoke all on function public.guard_canonical_planning_item_mutation()
  from public, anon, authenticated;
revoke all on function public.guard_canonical_planning_material_mutation()
  from public, anon, authenticated;
revoke all on function public.populate_canonical_planning_material_snapshot(
  uuid, text, text, text, uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_canonical_planned_work_item_snapshot(
  uuid, text, text, text, uuid, uuid, text, uuid, uuid, date, date,
  text, integer, integer, numeric, text, numeric, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.refresh_canonical_planned_work_item_snapshot(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.populate_canonical_planning_material_snapshot(
  uuid, text, text, text, uuid, uuid, timestamptz
) to service_role;
grant execute on function public.create_canonical_planned_work_item_snapshot(
  uuid, text, text, text, uuid, uuid, text, uuid, uuid, date, date,
  text, integer, integer, numeric, text, numeric, uuid, text, text, text
) to service_role;
grant execute on function public.refresh_canonical_planned_work_item_snapshot(uuid, uuid)
  to service_role;

drop policy if exists "authenticated write planned_work_items"
  on public.planned_work_items;
drop policy if exists "authenticated write planned_work_materials"
  on public.planned_work_materials;

revoke all on table public.planned_work_items from anon, authenticated;
revoke all on table public.planned_work_materials from anon, authenticated;
grant select on table public.planned_work_items to authenticated;
grant select on table public.planned_work_materials to authenticated;
grant all on table public.planned_work_items to service_role;
grant all on table public.planned_work_materials to service_role;

comment on table public.planned_work_materials is
  'Planning Material snapshots. Canonical rows are action-only, Budget-lineaged, refreshable only while the annual plan is draft, and frozen after approval.';

commit;
