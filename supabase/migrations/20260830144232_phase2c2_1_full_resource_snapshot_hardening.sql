-- Phase 2C.2.1: harden canonical Planning resource snapshots against real rule data.
-- This migration does not create Work Orders or modify Survey, Performance, or Payroll records.
begin;

alter table public.activities
  add column require_equipment boolean not null default false;

alter table public.budget_rate_blocks
  add column source_type text not null default 'manual',
  add column source_rule_id uuid references public.budget_rate_rules(id) on delete set null,
  add column source_resolution_rate numeric,
  add column source_resolution_snapshot jsonb;

alter table public.budget_rate_blocks
  add constraint budget_rate_blocks_source_type_valid
  check (source_type in ('manual', 'rule_resolution'));

create unique index budget_rate_blocks_rate_block_unique
  on public.budget_rate_blocks (budget_rate_id, block_id)
  where block_id is not null;

create or replace view public.v_budget_rate_block_materialization_readiness
with (security_invoker = true)
as
with resolution as (
  select
    rate.id as budget_rate_id,
    count(resolved.block_id)::integer as resolution_count,
    count(*) filter (where resolved.top_priority_match_count <> 1)::integer as conflict_count,
    coalesce(sum(resolved.area_rai), 0)::numeric as resolved_area_rai,
    coalesce(sum(resolved.tree_count), 0)::numeric as resolved_tree_count
  from public.budget_activity_rates rate
  left join public.v_budget_rate_rule_resolution resolved on resolved.rule_id = rate.rule_id
  group by rate.id
), validation as (
  select rate.id as budget_rate_id, count(issue.*)::integer as issue_count
  from public.budget_activity_rates rate
  left join public.v_budget_rate_rule_validation_issues issue on issue.rule_id = rate.rule_id
  group by rate.id
), facts as (
  select
    rate.*,
    coalesce(resolution.resolution_count, 0) as resolution_count,
    coalesce(resolution.conflict_count, 0) as conflict_count,
    coalesce(validation.issue_count, 0) as issue_count,
    resolution.resolved_area_rai,
    resolution.resolved_tree_count,
    greatest(abs(coalesce(rate.area_rai, 0)) * 0.005, 1::numeric) as area_tolerance_rai,
    greatest(abs(coalesce(rate.tree_count, 0)) * 0.005, 50::numeric) as tree_tolerance_count
  from public.budget_activity_rates rate
  left join resolution on resolution.budget_rate_id = rate.id
  left join validation on validation.budget_rate_id = rate.id
)
select
  facts.id as budget_rate_id,
  facts.rate_code,
  facts.budget_year_id,
  facts.fiscal_year,
  facts.activity_id,
  facts.activity_code,
  facts.rule_set_id,
  facts.rule_id,
  facts.approval_status,
  facts.status,
  facts.is_current,
  facts.rule_sync_status,
  facts.area_rai as source_area_rai,
  facts.tree_count as source_tree_count,
  facts.resolved_area_rai,
  facts.resolved_tree_count,
  facts.area_tolerance_rai,
  facts.tree_tolerance_count,
  facts.resolution_count,
  facts.conflict_count,
  facts.issue_count,
  case
    when facts.approval_status is distinct from 'approved'
      or facts.status is distinct from 'active'
      or facts.is_current is distinct from true
      or facts.rule_sync_status is distinct from 'synced'
      then 'RATE_NOT_READY'
    when facts.rule_id is null then 'RULE_NOT_LINKED'
    when facts.resolution_count = 0 then 'RULE_NO_RESOLUTION'
    when facts.issue_count > 0 then 'RULE_VALIDATION_ISSUE'
    when facts.conflict_count > 0 then 'RULE_TOP_PRIORITY_CONFLICT'
    when facts.area_rai is null or facts.tree_count is null then 'SOURCE_TOTAL_MISSING'
    when abs(facts.area_rai - facts.resolved_area_rai) > facts.area_tolerance_rai
      or abs(facts.tree_count - facts.resolved_tree_count) > facts.tree_tolerance_count
      then 'BUDGET_RATE_BLOCK_SOURCE_VARIANCE_REVIEW_REQUIRED'
    else 'READY'
  end as readiness_status
from facts;

create or replace function public.sync_budget_rate_rule_blocks(p_budget_rate_id text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $phase2c21_rule_sync$
declare
  v_rate public.budget_activity_rates%rowtype;
  v_readiness public.v_budget_rate_block_materialization_readiness%rowtype;
  v_count integer := 0;
begin
  select * into v_rate
  from public.budget_activity_rates
  where id = p_budget_rate_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'BUDGET_RATE_NOT_FOUND';
  end if;

  select * into v_readiness
  from public.v_budget_rate_block_materialization_readiness
  where budget_rate_id = p_budget_rate_id;

  if v_readiness.readiness_status <> 'READY' then
    if v_readiness.readiness_status = 'BUDGET_RATE_BLOCK_SOURCE_VARIANCE_REVIEW_REQUIRED' then
      raise exception using errcode = 'P0001', message = 'BUDGET_RATE_BLOCK_SOURCE_VARIANCE_REVIEW_REQUIRED';
    end if;
    raise exception using errcode = 'P0001',
      message = 'BUDGET_RATE_BLOCK_RECONCILIATION_REQUIRED',
      detail = coalesce(v_readiness.readiness_status, 'READINESS_NOT_FOUND');
  end if;

  if exists (
    select 1
    from public.v_budget_rate_rule_resolution resolved
    join public.budget_rate_blocks existing
      on existing.budget_rate_id = p_budget_rate_id
     and existing.block_id = resolved.block_id
     and existing.source_type <> 'rule_resolution'
    where resolved.rule_id = v_rate.rule_id
  ) then
    raise exception using errcode = 'P0001', message = 'BUDGET_RATE_BLOCK_MANUAL_CONFLICT';
  end if;

  delete from public.budget_rate_blocks block_rate
  where block_rate.budget_rate_id = p_budget_rate_id
    and block_rate.source_type = 'rule_resolution'
    and not exists (
      select 1 from public.v_budget_rate_rule_resolution resolved
      where resolved.rule_id = v_rate.rule_id and resolved.block_id = block_rate.block_id
    );

  insert into public.budget_rate_blocks (
    id, budget_rate_id, block_id, terrain_code, block_name, ap_code, rspo_status,
    area_rai, tree_count, status, note, created_at, updated_at,
    source_type, source_rule_id, source_resolution_rate, source_resolution_snapshot
  )
  select
    'rule-block-' || md5(v_rate.id || ':' || resolved.block_id::text),
    v_rate.id,
    resolved.block_id,
    coalesce(block.terrain_type, 'rule'),
    block.block_name,
    resolved.ap_code,
    resolved.rspo_status,
    resolved.area_rai,
    resolved.tree_count,
    'active',
    'Materialized from budget rule resolution',
    transaction_timestamp(),
    transaction_timestamp(),
    'rule_resolution',
    v_rate.rule_id,
    resolved.resolved_rate,
    jsonb_build_object(
      'rule_set_id', resolved.rule_set_id,
      'rule_id', resolved.rule_id,
      'block_id', resolved.block_id,
      'priority', resolved.priority,
      'top_priority_match_count', resolved.top_priority_match_count,
      'area_rai', resolved.area_rai,
      'tree_count', resolved.tree_count,
      'materialized_at', transaction_timestamp()
    )
  from public.v_budget_rate_rule_resolution resolved
  join public.blocks block on block.id = resolved.block_id and block.status = 'active'
  where resolved.rule_id = v_rate.rule_id
    and resolved.top_priority_match_count = 1
    and public.budget_rule_matches_block(v_rate.rule_id, resolved.block_id, v_rate.fiscal_year)
  on conflict (budget_rate_id, block_id) where block_id is not null
  do update set
    terrain_code = excluded.terrain_code,
    block_name = excluded.block_name,
    ap_code = excluded.ap_code,
    rspo_status = excluded.rspo_status,
    area_rai = excluded.area_rai,
    tree_count = excluded.tree_count,
    status = 'active',
    note = excluded.note,
    updated_at = excluded.updated_at,
    source_rule_id = excluded.source_rule_id,
    source_resolution_rate = excluded.source_resolution_rate,
    source_resolution_snapshot = excluded.source_resolution_snapshot
  where budget_rate_blocks.source_type = 'rule_resolution';

  select count(*)::integer into v_count
  from public.budget_rate_blocks block_rate
  where block_rate.budget_rate_id = p_budget_rate_id
    and block_rate.source_type = 'rule_resolution'
    and block_rate.status = 'active';
  if v_count <> v_readiness.resolution_count then
    raise exception using errcode = 'P0001', message = 'BUDGET_RATE_BLOCK_MATERIALIZATION_INCOMPLETE';
  end if;
  return v_count;
end
$phase2c21_rule_sync$;

create or replace function public.sync_all_ready_budget_rate_blocks()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c21_rule_sync_all$
declare
  v_row record;
  v_ready integer := 0;
  v_review integer := 0;
  v_blocks integer := 0;
begin
  for v_row in
    select * from public.v_budget_rate_block_materialization_readiness
    where readiness_status = 'READY'
    order by budget_rate_id
  loop
    begin
      v_blocks := v_blocks + public.sync_budget_rate_rule_blocks(v_row.budget_rate_id);
      v_ready := v_ready + 1;
    exception when others then
      v_review := v_review + 1;
    end;
  end loop;
  return jsonb_build_object('ready_rate_sets', v_ready, 'review_required', v_review, 'materialized_blocks', v_blocks);
end
$phase2c21_rule_sync_all$;

create table public.budget_rate_resource_requirements (
  id uuid primary key default gen_random_uuid(),
  budget_rate_id text not null references public.budget_activity_rates(id) on delete cascade,
  resource_type text not null check (resource_type in ('equipment', 'machine', 'vehicle', 'fuel')),
  resource_code text,
  resource_name text not null,
  preferred_vehicle_id uuid references public.vehicles(id) on delete set null,
  preferred_vehicle_type text,
  quantity_basis text not null check (quantity_basis in ('unit', 'hour', 'km', 'rai', 'ton')),
  default_planned_quantity numeric not null default 0 check (default_planned_quantity >= 0),
  resource_rate_amount numeric check (resource_rate_amount >= 0),
  resource_rate_uom text,
  calculation_method text,
  fuel_required boolean not null default false,
  fuel_metric_basis text check (fuel_metric_basis is null or fuel_metric_basis in ('L/hour', 'km/L', 'L/rai', 'L/ton')),
  fuel_standard_rate numeric check (fuel_standard_rate is null or fuel_standard_rate > 0),
  fuel_unit_cost numeric check (fuel_unit_cost is null or fuel_unit_cost >= 0),
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_resource_fuel_complete check (
    not fuel_required or (fuel_metric_basis is not null and fuel_standard_rate is not null)
  )
);

create index budget_rate_resource_requirements_rate_idx
  on public.budget_rate_resource_requirements (budget_rate_id, resource_type, status);
alter table public.budget_rate_resource_requirements enable row level security;

create table public.planned_work_labor_requirements (
  id uuid primary key default gen_random_uuid(),
  planned_work_item_id uuid not null references public.planned_work_items(id) on delete cascade,
  source_budget_rate_role_id text not null references public.budget_rate_roles(id) on delete restrict,
  source_budget_activity_rate_id text not null references public.budget_activity_rates(id) on delete restrict,
  role_position text not null,
  worker_group_name text,
  rate_amount numeric not null check (rate_amount >= 0),
  uom text not null,
  calculation_method text,
  rate_basis text,
  rate_category text,
  payee_type text,
  affects_payroll boolean not null default true,
  selected_for_plan boolean not null default false,
  planned_headcount numeric not null default 0 check (planned_headcount >= 0),
  planned_basis_quantity numeric not null default 0 check (planned_basis_quantity >= 0),
  estimated_amount numeric not null default 0 check (estimated_amount >= 0),
  snapshot_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint planned_labor_selection_complete check (
    not selected_for_plan or (planned_headcount > 0 and planned_basis_quantity > 0)
  )
);

create index planned_work_labor_requirements_item_idx
  on public.planned_work_labor_requirements (planned_work_item_id, selected_for_plan);
create index planned_work_labor_requirements_source_idx
  on public.planned_work_labor_requirements (source_budget_rate_role_id);
alter table public.planned_work_labor_requirements enable row level security;

create table public.planned_work_resource_requirements (
  id uuid primary key default gen_random_uuid(),
  planned_work_item_id uuid not null references public.planned_work_items(id) on delete cascade,
  source_budget_resource_requirement_id uuid not null references public.budget_rate_resource_requirements(id) on delete restrict,
  source_budget_activity_rate_id text not null references public.budget_activity_rates(id) on delete restrict,
  resource_type text not null check (resource_type in ('equipment', 'machine', 'vehicle', 'fuel')),
  resource_code text,
  resource_name text not null,
  preferred_vehicle_id uuid references public.vehicles(id) on delete set null,
  preferred_vehicle_type text,
  selected_for_plan boolean not null default false,
  planned_quantity numeric not null default 0 check (planned_quantity >= 0),
  quantity_basis text not null check (quantity_basis in ('unit', 'hour', 'km', 'rai', 'ton')),
  planned_hours numeric not null default 0 check (planned_hours >= 0),
  planned_km numeric not null default 0 check (planned_km >= 0),
  planned_rai numeric not null default 0 check (planned_rai >= 0),
  planned_ton numeric not null default 0 check (planned_ton >= 0),
  resource_rate_amount numeric check (resource_rate_amount is null or resource_rate_amount >= 0),
  resource_rate_uom text,
  calculation_method text,
  estimated_resource_cost numeric not null default 0 check (estimated_resource_cost >= 0),
  fuel_required boolean not null default false,
  fuel_metric_basis text check (fuel_metric_basis is null or fuel_metric_basis in ('L/hour', 'km/L', 'L/rai', 'L/ton')),
  fuel_standard_rate numeric check (fuel_standard_rate is null or fuel_standard_rate > 0),
  planned_fuel_liters numeric not null default 0 check (planned_fuel_liters >= 0),
  fuel_unit_cost numeric check (fuel_unit_cost is null or fuel_unit_cost >= 0),
  fuel_estimated_cost numeric not null default 0 check (fuel_estimated_cost >= 0),
  snapshot_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint planned_resource_selection_complete check (
    not selected_for_plan or planned_quantity > 0
  ),
  constraint planned_resource_fuel_complete check (
    not (selected_for_plan and fuel_required)
    or (fuel_metric_basis is not null and fuel_standard_rate is not null and planned_fuel_liters > 0)
  )
);

create index planned_work_resource_requirements_item_idx
  on public.planned_work_resource_requirements (planned_work_item_id, resource_type, selected_for_plan);
alter table public.planned_work_resource_requirements enable row level security;

create or replace function public.guard_canonical_planning_requirement_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $phase2c21_requirement_guard$
declare
  v_item_id uuid;
  v_plan_status text;
begin
  v_item_id := case when tg_op = 'DELETE' then old.planned_work_item_id else new.planned_work_item_id end;
  select annual_plan.status into v_plan_status
  from public.planned_work_items item
  join public.annual_work_plans annual_plan on annual_plan.id = item.annual_plan_id
  where item.id = v_item_id
  for update of annual_plan;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;
  if v_plan_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;
  if current_setting('app.phase2c_snapshot_rpc', true) is distinct from 'on'
    and current_setting('app.phase2c_requirement_rpc', true) is distinct from 'on'
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ACTION_REQUIRED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$phase2c21_requirement_guard$;

create trigger guard_planned_labor_requirement_insert before insert on public.planned_work_labor_requirements
for each row execute function public.guard_canonical_planning_requirement_mutation();
create trigger guard_planned_labor_requirement_update before update on public.planned_work_labor_requirements
for each row execute function public.guard_canonical_planning_requirement_mutation();
create trigger guard_planned_labor_requirement_delete before delete on public.planned_work_labor_requirements
for each row execute function public.guard_canonical_planning_requirement_mutation();
create trigger guard_planned_resource_requirement_insert before insert on public.planned_work_resource_requirements
for each row execute function public.guard_canonical_planning_requirement_mutation();
create trigger guard_planned_resource_requirement_update before update on public.planned_work_resource_requirements
for each row execute function public.guard_canonical_planning_requirement_mutation();
create trigger guard_planned_resource_requirement_delete before delete on public.planned_work_resource_requirements
for each row execute function public.guard_canonical_planning_requirement_mutation();

create or replace function public.planning_basis_quantity(
  p_basis text,
  p_target_quantity numeric,
  p_target_unit text,
  p_area_rai numeric,
  p_tree_count numeric
)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $phase2c21_basis_quantity$
select greatest(coalesce(case p_basis
  when 'tree_count' then p_tree_count
  when 'area_rai' then p_area_rai
  when 'weight_ton' then case when lower(coalesce(p_target_unit, '')) ~ '(ตัน|ton)' then p_target_quantity end
  when 'day_count' then case when lower(coalesce(p_target_unit, '')) ~ '(วัน|day)' then p_target_quantity else 1 end
  when 'hour_count' then case when lower(coalesce(p_target_unit, '')) ~ '(ชั่วโมง|ชม|hour|hr)' then p_target_quantity else 1 end
  when 'fixed' then 1
end, 0), 0)
$phase2c21_basis_quantity$;

create or replace function public.planning_labor_estimated_amount(
  p_rate numeric,
  p_basis text,
  p_basis_quantity numeric,
  p_headcount numeric
)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $phase2c21_labor_amount$
select greatest(coalesce(p_rate, 0), 0) * greatest(coalesce(p_basis_quantity, 0), 0)
  * case when p_basis in ('day_count', 'hour_count', 'fixed') then greatest(coalesce(p_headcount, 0), 0) else 1 end
$phase2c21_labor_amount$;

create or replace function public.sync_ready_budget_rate_blocks_for_activity(
  p_budget_year_id text,
  p_activity_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $phase2c21_activity_sync$
declare
  v_rate record;
  v_count integer := 0;
begin
  for v_rate in
    select readiness.budget_rate_id
    from public.v_budget_rate_block_materialization_readiness readiness
    where readiness.budget_year_id = p_budget_year_id
      and readiness.activity_id = p_activity_id
      and readiness.readiness_status = 'READY'
    order by readiness.budget_rate_id
  loop
    v_count := v_count + public.sync_budget_rate_rule_blocks(v_rate.budget_rate_id);
  end loop;
  return v_count;
end
$phase2c21_activity_sync$;

create or replace function public.refresh_planned_full_resource_snapshot_cache(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $phase2c21_refresh_cache$
declare
  v_labor jsonb;
  v_resources jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', labor.id,
    'source_budget_rate_role_id', labor.source_budget_rate_role_id,
    'source_budget_activity_rate_id', labor.source_budget_activity_rate_id,
    'role_position', labor.role_position,
    'worker_group_name', labor.worker_group_name,
    'rate_amount', labor.rate_amount,
    'uom', labor.uom,
    'calculation_method', labor.calculation_method,
    'rate_basis', labor.rate_basis,
    'rate_category', labor.rate_category,
    'payee_type', labor.payee_type,
    'affects_payroll', labor.affects_payroll,
    'selected_for_plan', labor.selected_for_plan,
    'planned_headcount', labor.planned_headcount,
    'planned_basis_quantity', labor.planned_basis_quantity,
    'estimated_amount', labor.estimated_amount,
    'snapshot_at', labor.snapshot_at
  ) order by labor.source_budget_activity_rate_id, labor.source_budget_rate_role_id), '[]'::jsonb)
  into v_labor
  from public.planned_work_labor_requirements labor
  where labor.planned_work_item_id = p_item_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', resource.id,
    'source_budget_resource_requirement_id', resource.source_budget_resource_requirement_id,
    'source_budget_activity_rate_id', resource.source_budget_activity_rate_id,
    'resource_type', resource.resource_type,
    'resource_code', resource.resource_code,
    'resource_name', resource.resource_name,
    'preferred_vehicle_id', resource.preferred_vehicle_id,
    'preferred_vehicle_type', resource.preferred_vehicle_type,
    'selected_for_plan', resource.selected_for_plan,
    'planned_quantity', resource.planned_quantity,
    'quantity_basis', resource.quantity_basis,
    'planned_hours', resource.planned_hours,
    'planned_km', resource.planned_km,
    'planned_rai', resource.planned_rai,
    'planned_ton', resource.planned_ton,
    'resource_rate_amount', resource.resource_rate_amount,
    'resource_rate_uom', resource.resource_rate_uom,
    'calculation_method', resource.calculation_method,
    'estimated_resource_cost', resource.estimated_resource_cost,
    'fuel_required', resource.fuel_required,
    'fuel_metric_basis', resource.fuel_metric_basis,
    'fuel_standard_rate', resource.fuel_standard_rate,
    'planned_fuel_liters', resource.planned_fuel_liters,
    'fuel_unit_cost', resource.fuel_unit_cost,
    'fuel_estimated_cost', resource.fuel_estimated_cost,
    'snapshot_at', resource.snapshot_at
  ) order by resource.resource_type, resource.source_budget_activity_rate_id, resource.id), '[]'::jsonb)
  into v_resources
  from public.planned_work_resource_requirements resource
  where resource.planned_work_item_id = p_item_id;

  update public.planned_work_items
  set planned_labor_rate_snapshot = v_labor,
      planned_resource_rate_snapshot = v_resources,
      updated_at = transaction_timestamp()
  where id = p_item_id;
end
$phase2c21_refresh_cache$;

create or replace function public.populate_canonical_planning_full_resource_snapshot(
  item_id uuid,
  snap_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $phase2c21_populate$
declare
  v_item public.planned_work_items%rowtype;
  v_block public.blocks%rowtype;
  v_resolution jsonb;
begin
  if current_setting('app.phase2c_snapshot_rpc', true) is distinct from 'on' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ACTION_REQUIRED';
  end if;

  select * into v_item from public.planned_work_items where id = item_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;
  select * into v_block from public.blocks where id = v_item.block_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_BLOCK_NOT_FOUND';
  end if;

  perform public.sync_ready_budget_rate_blocks_for_activity(v_item.source_budget_year_id, v_item.activity_id);

  if not exists (
    select 1 from public.budget_rate_blocks block_rate
    where block_rate.id = v_item.source_budget_rate_block_id
      and block_rate.budget_rate_id = v_item.source_budget_activity_rate_id
      and block_rate.block_id = v_item.block_id
      and block_rate.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_BUDGET_BLOCK_RESOLUTION_REQUIRED';
  end if;

  delete from public.planned_work_labor_requirements where planned_work_item_id = item_id;
  delete from public.planned_work_resource_requirements where planned_work_item_id = item_id;

  insert into public.planned_work_labor_requirements (
    planned_work_item_id, source_budget_rate_role_id, source_budget_activity_rate_id,
    role_position, worker_group_name, rate_amount, uom, calculation_method, rate_basis,
    rate_category, payee_type, affects_payroll, selected_for_plan, planned_headcount,
    planned_basis_quantity, estimated_amount, snapshot_at, updated_at
  )
  select
    item_id,
    role.id,
    rate.id,
    coalesce(nullif(role.role_name, ''), nullif(role.worker_group_name, ''), 'worker'),
    role.worker_group_name,
    coalesce(role.rate_amount, rate.rate_amount),
    coalesce(nullif(role.uom, ''), nullif(rate.unit_name, '')),
    coalesce(role.calculation_method, rate.calculation_method),
    public.planning_rate_basis(
      coalesce(role.uom, rate.unit_name),
      coalesce(role.calculation_method, rate.calculation_method),
      rate.comparison_basis
    ),
    role.rate_category,
    role.payee_type,
    coalesce(role.affects_payroll, true),
    false,
    0,
    public.planning_basis_quantity(
      public.planning_rate_basis(
        coalesce(role.uom, rate.unit_name),
        coalesce(role.calculation_method, rate.calculation_method),
        rate.comparison_basis
      ),
      v_item.target_quantity,
      v_item.target_unit,
      v_block.area_rai,
      v_block.tree_count
    ),
    0,
    snap_at,
    snap_at
  from public.budget_activity_rates rate
  join public.v_budget_rate_block_materialization_readiness readiness
    on readiness.budget_rate_id = rate.id and readiness.readiness_status = 'READY'
  join public.budget_rate_blocks block_rate
    on block_rate.budget_rate_id = rate.id
   and block_rate.block_id = v_item.block_id
   and block_rate.status = 'active'
  join public.budget_rate_roles role
    on role.budget_rate_id = rate.id and role.status = 'active'
  where rate.budget_year_id = v_item.source_budget_year_id
    and rate.activity_id = v_item.activity_id
    and rate.approval_status = 'approved'
    and rate.status = 'active'
    and rate.is_current is true
    and rate.rule_sync_status = 'synced'
  order by rate.id, role.id;

  insert into public.planned_work_resource_requirements (
    planned_work_item_id, source_budget_resource_requirement_id, source_budget_activity_rate_id,
    resource_type, resource_code, resource_name, preferred_vehicle_id, preferred_vehicle_type,
    selected_for_plan, planned_quantity, quantity_basis, planned_hours, planned_km, planned_rai,
    planned_ton, resource_rate_amount, resource_rate_uom, calculation_method,
    estimated_resource_cost, fuel_required, fuel_metric_basis, fuel_standard_rate,
    planned_fuel_liters, fuel_unit_cost, fuel_estimated_cost, snapshot_at, updated_at
  )
  select
    item_id,
    source.id,
    rate.id,
    source.resource_type,
    source.resource_code,
    source.resource_name,
    source.preferred_vehicle_id,
    source.preferred_vehicle_type,
    false,
    source.default_planned_quantity,
    source.quantity_basis,
    case when source.quantity_basis = 'hour' then source.default_planned_quantity else 0 end,
    case when source.quantity_basis = 'km' then source.default_planned_quantity else 0 end,
    case when source.quantity_basis = 'rai' then source.default_planned_quantity else 0 end,
    case when source.quantity_basis = 'ton' then source.default_planned_quantity else 0 end,
    source.resource_rate_amount,
    source.resource_rate_uom,
    source.calculation_method,
    coalesce(source.resource_rate_amount, 0) * source.default_planned_quantity,
    source.fuel_required,
    source.fuel_metric_basis,
    source.fuel_standard_rate,
    0,
    source.fuel_unit_cost,
    0,
    snap_at,
    snap_at
  from public.budget_rate_resource_requirements source
  join public.budget_activity_rates rate on rate.id = source.budget_rate_id
  join public.v_budget_rate_block_materialization_readiness readiness
    on readiness.budget_rate_id = rate.id and readiness.readiness_status = 'READY'
  join public.budget_rate_blocks block_rate
    on block_rate.budget_rate_id = rate.id
   and block_rate.block_id = v_item.block_id
   and block_rate.status = 'active'
  where source.status = 'active'
    and rate.budget_year_id = v_item.source_budget_year_id
    and rate.activity_id = v_item.activity_id
    and rate.approval_status = 'approved'
    and rate.status = 'active'
    and rate.is_current is true
    and rate.rule_sync_status = 'synced'
  order by source.resource_type, rate.id, source.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_budget_activity_rate_id', rate.id,
    'source_budget_rate_block_id', block_rate.id,
    'source_rule_id', block_rate.source_rule_id,
    'block_id', block_rate.block_id,
    'area_rai', block_rate.area_rai,
    'tree_count', block_rate.tree_count,
    'resolved_rate', block_rate.source_resolution_rate
  ) order by rate.id), '[]'::jsonb)
  into v_resolution
  from public.budget_activity_rates rate
  join public.v_budget_rate_block_materialization_readiness readiness
    on readiness.budget_rate_id = rate.id and readiness.readiness_status = 'READY'
  join public.budget_rate_blocks block_rate
    on block_rate.budget_rate_id = rate.id
   and block_rate.block_id = v_item.block_id
   and block_rate.status = 'active'
  where rate.budget_year_id = v_item.source_budget_year_id
    and rate.activity_id = v_item.activity_id;

  update public.planned_work_items
  set budget_block_resolution_snapshot = jsonb_build_object(
        'anchor_budget_activity_rate_id', v_item.source_budget_activity_rate_id,
        'anchor_budget_rate_block_id', v_item.source_budget_rate_block_id,
        'block_id', v_item.block_id,
        'rate_set', v_resolution,
        'snapshot_at', snap_at
      ),
      resource_snapshot_reconciliation_status = 'matched',
      resource_snapshot_reconciliation_errors = '[]'::jsonb,
      full_resource_snapshot_at = snap_at
  where id = item_id;

  perform public.refresh_planned_full_resource_snapshot_cache(item_id);
end
$phase2c21_populate$;

create or replace function public.update_canonical_planned_resource_requirements(
  p_planned_work_item_id uuid,
  p_actor_profile_id uuid,
  p_labor_requirements jsonb,
  p_resource_requirements jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c21_update_requirements$
declare
  v_plan_status text;
  v_labor jsonb := coalesce(p_labor_requirements, '[]'::jsonb);
  v_resources jsonb := coalesce(p_resource_requirements, '[]'::jsonb);
  v_selected_labor integer := 0;
  v_selected_resources integer := 0;
  v_labor_cost numeric := 0;
  v_resource_cost numeric := 0;
  v_fuel_cost numeric := 0;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles where id = p_actor_profile_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;
  if jsonb_typeof(v_labor) <> 'array' or jsonb_typeof(v_resources) <> 'array' then
    raise exception using errcode = 'P0001', message = 'PLANNING_REQUIREMENT_PAYLOAD_INVALID';
  end if;

  select annual_plan.status into v_plan_status
  from public.planned_work_items item
  join public.annual_work_plans annual_plan on annual_plan.id = item.annual_plan_id
  where item.id = p_planned_work_item_id and item.source_type = 'canonical_budget'
  for update of annual_plan;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;
  if v_plan_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  if (select count(*) from jsonb_to_recordset(v_labor) as input(id uuid))
    <> (select count(distinct input.id) from jsonb_to_recordset(v_labor) as input(id uuid))
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_LABOR_REQUIREMENT_DUPLICATE';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_labor) as input(id uuid)
    where not exists (
      select 1 from public.planned_work_labor_requirements labor
      where labor.id = input.id and labor.planned_work_item_id = p_planned_work_item_id
    )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_LABOR_REQUIREMENT_NOT_FOUND';
  end if;
  if (select count(*) from jsonb_to_recordset(v_resources) as input(id uuid))
    <> (select count(distinct input.id) from jsonb_to_recordset(v_resources) as input(id uuid))
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_RESOURCE_REQUIREMENT_DUPLICATE';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_resources) as input(id uuid)
    where not exists (
      select 1 from public.planned_work_resource_requirements resource
      where resource.id = input.id and resource.planned_work_item_id = p_planned_work_item_id
    )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_RESOURCE_REQUIREMENT_NOT_FOUND';
  end if;

  perform set_config('app.phase2c_requirement_rpc', 'on', true);
  perform set_config('app.phase2c_snapshot_rpc', 'on', true);

  update public.planned_work_labor_requirements
  set selected_for_plan = false,
      planned_headcount = 0,
      planned_basis_quantity = 0,
      estimated_amount = 0,
      updated_at = transaction_timestamp()
  where planned_work_item_id = p_planned_work_item_id;

  update public.planned_work_labor_requirements labor
  set selected_for_plan = coalesce(input.selected_for_plan, false),
      planned_headcount = case when coalesce(input.selected_for_plan, false) then coalesce(input.planned_headcount, 0) else 0 end,
      planned_basis_quantity = case when coalesce(input.selected_for_plan, false) then coalesce(input.planned_basis_quantity, 0) else 0 end,
      estimated_amount = case when coalesce(input.selected_for_plan, false)
        then public.planning_labor_estimated_amount(
          labor.rate_amount, labor.rate_basis, input.planned_basis_quantity, input.planned_headcount
        ) else 0 end,
      updated_at = transaction_timestamp()
  from jsonb_to_recordset(v_labor) as input(
    id uuid,
    selected_for_plan boolean,
    planned_headcount numeric,
    planned_basis_quantity numeric
  )
  where labor.id = input.id and labor.planned_work_item_id = p_planned_work_item_id;

  update public.planned_work_resource_requirements
  set selected_for_plan = false,
      planned_quantity = 0,
      planned_hours = 0,
      planned_km = 0,
      planned_rai = 0,
      planned_ton = 0,
      estimated_resource_cost = 0,
      planned_fuel_liters = 0,
      fuel_estimated_cost = 0,
      updated_at = transaction_timestamp()
  where planned_work_item_id = p_planned_work_item_id;

  update public.planned_work_resource_requirements resource
  set selected_for_plan = coalesce(input.selected_for_plan, false),
      planned_quantity = case when coalesce(input.selected_for_plan, false) then coalesce(input.planned_quantity, 0) else 0 end,
      planned_hours = case when coalesce(input.selected_for_plan, false) then coalesce(input.planned_hours, 0) else 0 end,
      planned_km = case when coalesce(input.selected_for_plan, false) then coalesce(input.planned_km, 0) else 0 end,
      planned_rai = case when coalesce(input.selected_for_plan, false) then coalesce(input.planned_rai, 0) else 0 end,
      planned_ton = case when coalesce(input.selected_for_plan, false) then coalesce(input.planned_ton, 0) else 0 end,
      estimated_resource_cost = case when coalesce(input.selected_for_plan, false)
        then coalesce(resource.resource_rate_amount, 0) * coalesce(input.planned_quantity, 0) else 0 end,
      planned_fuel_liters = case when coalesce(input.selected_for_plan, false) and resource.fuel_required then
        coalesce(input.planned_fuel_liters,
          case resource.fuel_metric_basis
            when 'L/hour' then coalesce(input.planned_hours, 0) * resource.fuel_standard_rate
            when 'km/L' then coalesce(input.planned_km, 0) / nullif(resource.fuel_standard_rate, 0)
            when 'L/rai' then coalesce(input.planned_rai, 0) * resource.fuel_standard_rate
            when 'L/ton' then coalesce(input.planned_ton, 0) * resource.fuel_standard_rate
          end, 0)
        else 0 end,
      fuel_unit_cost = coalesce(input.fuel_unit_cost, resource.fuel_unit_cost),
      fuel_estimated_cost = case when coalesce(input.selected_for_plan, false) and resource.fuel_required then
        coalesce(input.planned_fuel_liters,
          case resource.fuel_metric_basis
            when 'L/hour' then coalesce(input.planned_hours, 0) * resource.fuel_standard_rate
            when 'km/L' then coalesce(input.planned_km, 0) / nullif(resource.fuel_standard_rate, 0)
            when 'L/rai' then coalesce(input.planned_rai, 0) * resource.fuel_standard_rate
            when 'L/ton' then coalesce(input.planned_ton, 0) * resource.fuel_standard_rate
          end, 0) * coalesce(input.fuel_unit_cost, resource.fuel_unit_cost, 0)
        else 0 end,
      updated_at = transaction_timestamp()
  from jsonb_to_recordset(v_resources) as input(
    id uuid,
    selected_for_plan boolean,
    planned_quantity numeric,
    planned_hours numeric,
    planned_km numeric,
    planned_rai numeric,
    planned_ton numeric,
    planned_fuel_liters numeric,
    fuel_unit_cost numeric
  )
  where resource.id = input.id and resource.planned_work_item_id = p_planned_work_item_id;

  perform public.refresh_planned_full_resource_snapshot_cache(p_planned_work_item_id);

  select count(*)::integer, coalesce(sum(estimated_amount), 0)
  into v_selected_labor, v_labor_cost
  from public.planned_work_labor_requirements
  where planned_work_item_id = p_planned_work_item_id and selected_for_plan;
  select count(*)::integer, coalesce(sum(estimated_resource_cost), 0), coalesce(sum(fuel_estimated_cost), 0)
  into v_selected_resources, v_resource_cost, v_fuel_cost
  from public.planned_work_resource_requirements
  where planned_work_item_id = p_planned_work_item_id and selected_for_plan;

  return jsonb_build_object(
    'planned_work_item_id', p_planned_work_item_id,
    'selected_labor_count', v_selected_labor,
    'selected_resource_count', v_selected_resources,
    'labor_cost', v_labor_cost,
    'resource_cost', v_resource_cost,
    'fuel_cost', v_fuel_cost
  );
end
$phase2c21_update_requirements$;

create or replace function public.approve_canonical_annual_work_plan(
  p_annual_plan_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c21_approve$
declare
  v_plan public.annual_work_plans%rowtype;
  v_item_count integer := 0;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles where id = p_actor_profile_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;
  select * into v_plan from public.annual_work_plans where id = p_annual_plan_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;
  if v_plan.source_type is distinct from 'canonical_budget' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;
  if v_plan.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;
  select count(*)::integer into v_item_count
  from public.planned_work_items where annual_plan_id = p_annual_plan_id;
  if v_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_EMPTY';
  end if;

  if exists (
    select 1 from public.planned_work_items item
    where item.annual_plan_id = p_annual_plan_id
      and (item.source_type is distinct from 'canonical_budget'
        or item.full_resource_snapshot_at is null
        or item.resource_snapshot_reconciliation_status is distinct from 'matched'
        or item.budget_block_resolution_snapshot is null)
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_RATE_RECONCILIATION_REQUIRED';
  end if;

  if exists (
    select 1
    from public.planned_work_items item
    join public.activities activity on activity.id = item.activity_id
    where item.annual_plan_id = p_annual_plan_id and activity.require_worker
      and not exists (
        select 1 from public.planned_work_labor_requirements labor
        where labor.planned_work_item_id = item.id
          and labor.selected_for_plan
          and labor.planned_headcount > 0
          and labor.planned_basis_quantity > 0
          and labor.rate_basis is not null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_WORKER_REQUIREMENT_REQUIRED';
  end if;

  if exists (
    select 1 from public.planned_work_labor_requirements labor
    join public.planned_work_items item on item.id = labor.planned_work_item_id
    where item.annual_plan_id = p_annual_plan_id and labor.selected_for_plan
      and (labor.rate_basis is null or labor.rate_amount < 0 or labor.planned_headcount <= 0
        or labor.planned_basis_quantity <= 0)
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_LABOR_RATE_MAPPING_REQUIRED';
  end if;

  if exists (
    select 1
    from public.planned_work_items item
    join public.activities activity on activity.id = item.activity_id
    where item.annual_plan_id = p_annual_plan_id and activity.require_material
      and not exists (
        select 1 from public.planned_work_materials material
        where material.planned_work_item_id = item.id
          and material.snapshot_source_type = 'canonical_budget_block_material'
          and material.source_budget_rate_block_material_id is not null
          and material.snapshot_usage_rate > 0
          and material.snapshot_at is not null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.planned_work_items item
    join public.activities activity on activity.id = item.activity_id
    where item.annual_plan_id = p_annual_plan_id and activity.require_equipment
      and not exists (
        select 1 from public.planned_work_resource_requirements resource
        where resource.planned_work_item_id = item.id
          and resource.selected_for_plan and resource.resource_type = 'equipment'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_EQUIPMENT_REQUIREMENT_REQUIRED';
  end if;

  if exists (
    select 1
    from public.planned_work_items item
    join public.activities activity on activity.id = item.activity_id
    where item.annual_plan_id = p_annual_plan_id and activity.require_machine
      and not exists (
        select 1 from public.planned_work_resource_requirements resource
        where resource.planned_work_item_id = item.id
          and resource.selected_for_plan and resource.resource_type in ('machine', 'vehicle')
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_MACHINE_REQUIREMENT_REQUIRED';
  end if;

  if exists (
    select 1
    from public.planned_work_items item
    join public.activities activity on activity.id = item.activity_id
    where item.annual_plan_id = p_annual_plan_id and activity.require_fuel
      and not exists (
        select 1 from public.planned_work_resource_requirements resource
        where resource.planned_work_item_id = item.id and resource.selected_for_plan
          and (resource.resource_type = 'fuel' or resource.fuel_required)
          and resource.fuel_metric_basis in ('L/hour', 'km/L', 'L/rai', 'L/ton')
          and resource.fuel_standard_rate > 0 and resource.planned_fuel_liters > 0
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_FUEL_REQUIREMENT_REQUIRED';
  end if;

  if exists (
    select 1 from public.planned_work_resource_requirements resource
    join public.planned_work_items item on item.id = resource.planned_work_item_id
    where item.annual_plan_id = p_annual_plan_id and resource.selected_for_plan
      and (resource.planned_quantity <= 0 or resource.resource_rate_amount is null
        or nullif(btrim(resource.resource_rate_uom), '') is null)
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_RESOURCE_RATE_REQUIRED';
  end if;

  if exists (
    select 1 from public.planned_work_items item
    join public.planned_work_materials material on material.planned_work_item_id = item.id
    where item.annual_plan_id = p_annual_plan_id
      and (material.snapshot_source_type is distinct from 'canonical_budget_block_material'
        or material.source_budget_rate_block_material_id is null
        or material.snapshot_usage_rate <= 0
        or material.snapshot_basis_quantity < 0
        or material.unit_id is null
        or material.planned_quantity < 0
        or material.snapshot_at is null)
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE';
  end if;

  perform set_config('app.phase2c_plan_header_rpc', 'on', true);
  update public.annual_work_plans
  set status = 'approved', approved_by = p_actor_profile_id,
      approved_at = transaction_timestamp(), updated_at = transaction_timestamp()
  where id = p_annual_plan_id returning * into v_plan;
  return jsonb_build_object('annual_work_plan', to_jsonb(v_plan), 'planned_work_item_count', v_item_count);
end
$phase2c21_approve$;

revoke all on table public.budget_rate_resource_requirements from public, anon, authenticated;
revoke all on table public.planned_work_labor_requirements from public, anon, authenticated;
revoke all on table public.planned_work_resource_requirements from public, anon, authenticated;
grant all on table public.budget_rate_resource_requirements to service_role;
grant all on table public.planned_work_labor_requirements to service_role;
grant all on table public.planned_work_resource_requirements to service_role;
grant select on public.v_budget_rate_block_materialization_readiness to service_role;
revoke all on public.v_budget_rate_block_materialization_readiness from public, anon, authenticated;

revoke all on function public.sync_budget_rate_rule_blocks(text) from public, anon, authenticated;
revoke all on function public.sync_all_ready_budget_rate_blocks() from public, anon, authenticated;
revoke all on function public.sync_ready_budget_rate_blocks_for_activity(text, uuid) from public, anon, authenticated;
revoke all on function public.guard_canonical_planning_requirement_mutation() from public, anon, authenticated;
revoke all on function public.planning_basis_quantity(text, numeric, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.planning_labor_estimated_amount(numeric, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.refresh_planned_full_resource_snapshot_cache(uuid) from public, anon, authenticated;
revoke all on function public.update_canonical_planned_resource_requirements(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.sync_budget_rate_rule_blocks(text) to service_role;
grant execute on function public.sync_all_ready_budget_rate_blocks() to service_role;
grant execute on function public.sync_ready_budget_rate_blocks_for_activity(text, uuid) to service_role;
grant execute on function public.guard_canonical_planning_requirement_mutation() to service_role;
grant execute on function public.planning_basis_quantity(text, numeric, text, numeric, numeric) to service_role;
grant execute on function public.planning_labor_estimated_amount(numeric, text, numeric, numeric) to service_role;
grant execute on function public.refresh_planned_full_resource_snapshot_cache(uuid) to service_role;
grant execute on function public.update_canonical_planned_resource_requirements(uuid, uuid, jsonb, jsonb) to service_role;

comment on view public.v_budget_rate_block_materialization_readiness is
  'Fail-closed Rule to Block readiness. Source totals remain authoritative and are never rewritten.';
comment on table public.budget_rate_resource_requirements is
  'Explicit Equipment, Machine, Vehicle, and Fuel source requirements; Material remains in budget_rate_block_materials.';
comment on table public.planned_work_labor_requirements is
  'Per-source Budget Role Planning requirements. Rows are never deduplicated by role or rate.';
comment on table public.planned_work_resource_requirements is
  'Frozen selected Equipment, Machine, Vehicle, and Fuel assumptions for a Planned Work Item.';
comment on function public.update_canonical_planned_resource_requirements(uuid, uuid, jsonb, jsonb) is
  'Explicit draft-only action for selecting multiple Labor and Resource requirements before Annual Plan approval.';

-- Backfill only READY rule sets. REVIEW_REQUIRED sets remain untouched for human reconciliation.
select public.sync_all_ready_budget_rate_blocks();

commit;
