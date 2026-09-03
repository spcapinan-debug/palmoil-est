-- Phase 2C.2.1 real-data UAT body.
-- The runner must prepend the Phase 2C.2 migrations and BEGIN; this file always rolls back.
create temporary table phase2c21_uat_results (
  case_code text primary key,
  result text not null,
  detail text not null
) on commit drop;

do $phase2c21_uat$
declare
  v_actor uuid;
  v_activity uuid;
  v_year text;
  v_anchor_rate text := 'budget-rate-mr8lkrnb-1';
  v_anchor_block_rate text;
  v_block uuid;
  v_plan uuid;
  v_item uuid;
  v_gate_plan uuid;
  v_gate_item uuid;
  v_labor_payload jsonb;
  v_ready_count integer;
  v_before_count integer;
  v_after_count integer;
  v_selected_count integer;
  v_position_count integer;
  v_rate_line_count integer;
  v_work_orders_before bigint;
  v_work_orders_after bigint;
  v_error text;
begin
  select id into v_actor from public.profiles where status = 'active' order by created_at nulls last limit 1;
  if v_actor is null then raise exception 'UAT_ACTIVE_ACTOR_REQUIRED'; end if;
  select count(*) into v_work_orders_before from public.work_orders;

  -- A: WE02 has multiple independently reconciled READY Rate sets and sync is idempotent.
  select count(*) into v_ready_count
  from public.v_budget_rate_block_materialization_readiness
  where activity_code = 'WE02' and readiness_status = 'READY';
  if v_ready_count < 2 then raise exception 'UAT_WE02_MULTI_RATE_READY_EXPECTED, got %', v_ready_count; end if;
  perform public.sync_budget_rate_rule_blocks(readiness.budget_rate_id)
  from public.v_budget_rate_block_materialization_readiness readiness
  where readiness.activity_code = 'WE02' and readiness.readiness_status = 'READY';
  select count(*) into v_before_count from public.budget_rate_blocks block_rate
  join public.v_budget_rate_block_materialization_readiness readiness on readiness.budget_rate_id = block_rate.budget_rate_id
  where readiness.activity_code = 'WE02' and readiness.readiness_status = 'READY' and block_rate.source_type = 'rule_resolution';
  perform public.sync_budget_rate_rule_blocks(readiness.budget_rate_id)
  from public.v_budget_rate_block_materialization_readiness readiness
  where readiness.activity_code = 'WE02' and readiness.readiness_status = 'READY';
  select count(*) into v_after_count from public.budget_rate_blocks block_rate
  join public.v_budget_rate_block_materialization_readiness readiness on readiness.budget_rate_id = block_rate.budget_rate_id
  where readiness.activity_code = 'WE02' and readiness.readiness_status = 'READY' and block_rate.source_type = 'rule_resolution';
  if v_before_count = 0 or v_before_count <> v_after_count then raise exception 'UAT_WE02_SYNC_NOT_IDEMPOTENT %/%', v_before_count, v_after_count; end if;
  insert into phase2c21_uat_results values ('A', 'PASS', format('WE02 READY=%s, materialized=%s, repeat=%s', v_ready_count, v_before_count, v_after_count));

  -- B: LP03 reconciles and materializes against the same rule engine.
  select count(*) into v_ready_count from public.v_budget_rate_block_materialization_readiness
  where activity_code = 'LP03' and readiness_status = 'READY';
  if v_ready_count < 1 then raise exception 'UAT_LP03_READY_EXPECTED'; end if;
  perform public.sync_budget_rate_rule_blocks(readiness.budget_rate_id)
  from public.v_budget_rate_block_materialization_readiness readiness
  where readiness.activity_code = 'LP03' and readiness.readiness_status = 'READY';
  select count(*) into v_after_count from public.budget_rate_blocks block_rate
  join public.v_budget_rate_block_materialization_readiness readiness on readiness.budget_rate_id = block_rate.budget_rate_id
  where readiness.activity_code = 'LP03' and readiness.readiness_status = 'READY' and block_rate.source_type = 'rule_resolution';
  if v_after_count = 0 then raise exception 'UAT_LP03_MATERIALIZATION_EXPECTED'; end if;
  insert into phase2c21_uat_results values ('B', 'PASS', format('LP03 READY=%s, materialized=%s', v_ready_count, v_after_count));

  -- C: known PL08 source/resolution variance fails closed with the canonical code.
  select readiness_status into v_error from public.v_budget_rate_block_materialization_readiness
  where budget_rate_id = 'budget-rate-mr5338gy-1';
  if v_error is distinct from 'BUDGET_RATE_BLOCK_SOURCE_VARIANCE_REVIEW_REQUIRED' then
    raise exception 'UAT_PL08_VARIANCE_STATUS_EXPECTED, got %', v_error;
  end if;
  begin
    perform public.sync_budget_rate_rule_blocks('budget-rate-mr5338gy-1');
    raise exception 'UAT_PL08_SYNC_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'BUDGET_RATE_BLOCK_SOURCE_VARIANCE_REVIEW_REQUIRED' then raise; end if;
  end;
  insert into phase2c21_uat_results values ('C', 'PASS', v_error);

  select rate.activity_id, rate.budget_year_id into v_activity, v_year
  from public.budget_activity_rates rate where rate.id = v_anchor_rate;
  select block_rate.id, block_rate.block_id into v_anchor_block_rate, v_block
  from public.budget_rate_blocks block_rate
  where block_rate.budget_rate_id = v_anchor_rate and block_rate.source_type = 'rule_resolution'
  order by block_rate.id limit 1;
  if v_anchor_block_rate is null then raise exception 'UAT_ANCHOR_BLOCK_REQUIRED'; end if;

  v_plan := (public.create_canonical_annual_work_plan(
    2569, 'WEBTEST-UAT-P2C21-APPROVE', v_actor, 'WEBTEST-UAT-P2C21-PLAN-APPROVE'
  )->'annual_work_plan'->>'id')::uuid;
  v_item := (public.create_canonical_planned_work_item_snapshot(
    v_plan, v_year, v_anchor_rate, v_anchor_block_rate, v_block, v_activity,
    'WEBTEST-UAT-P2C21-ITEM-APPROVE', v_actor, null, current_date, current_date,
    null, null, null, 100, 'tree', 1000, null, 'planned', 'rollback UAT', null
  )->'planned_work_item'->>'id')::uuid;

  -- I (draft half): refresh requires an explicit request and succeeds only while draft.
  perform public.refresh_canonical_planned_work_item_snapshot(v_item, v_actor, 'WEBTEST-UAT-P2C21-REFRESH-DRAFT');

  select jsonb_agg(jsonb_build_object(
    'id', picked.id, 'selected_for_plan', true, 'planned_headcount', 1,
    'planned_basis_quantity', greatest(picked.planned_basis_quantity, 1)
  ) order by picked.role_position)
  into v_labor_payload
  from (
    select distinct on (labor.role_position) labor.id, labor.role_position, labor.planned_basis_quantity
    from public.planned_work_labor_requirements labor
    where labor.planned_work_item_id = v_item and labor.rate_basis is not null
    order by labor.role_position, labor.source_budget_activity_rate_id, labor.source_budget_rate_role_id
    limit 2
  ) picked;
  if jsonb_array_length(coalesce(v_labor_payload, '[]'::jsonb)) < 2 then raise exception 'UAT_TWO_POSITIONS_REQUIRED'; end if;
  perform public.update_canonical_planned_resource_requirements(v_item, v_actor, v_labor_payload, '[]'::jsonb);

  -- D: one Plan Item keeps two independent source Role/Rate rows and two positions selected.
  select count(*), count(distinct role_position), count(distinct source_budget_rate_role_id)
  into v_selected_count, v_position_count, v_rate_line_count
  from public.planned_work_labor_requirements
  where planned_work_item_id = v_item and selected_for_plan;
  if v_selected_count < 2 or v_position_count < 2 or v_rate_line_count < 2 then
    raise exception 'UAT_MULTI_RATE_SELECTION_FAILED selected=% positions=% rates=%', v_selected_count, v_position_count, v_rate_line_count;
  end if;
  insert into phase2c21_uat_results values ('D', 'PASS', format('selected=%s, positions=%s, source Rate lines=%s', v_selected_count, v_position_count, v_rate_line_count));

  -- E: WE02 does not require Material, so a valid Labor-only item can approve.
  update public.activities set require_worker = true, require_material = false,
    require_equipment = false, require_machine = false, require_fuel = false
  where id = v_activity;
  perform public.approve_canonical_annual_work_plan(v_plan, v_actor);
  if (select status from public.annual_work_plans where id = v_plan) <> 'approved' then raise exception 'UAT_LABOR_ONLY_APPROVAL_FAILED'; end if;
  insert into phase2c21_uat_results values ('E', 'PASS', 'require_material=false approved with zero required Material');

  -- H: an approved snapshot is immutable even through the explicit requirement action.
  begin
    perform public.update_canonical_planned_resource_requirements(v_item, v_actor, v_labor_payload, '[]'::jsonb);
    raise exception 'UAT_APPROVED_UPDATE_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'PLANNING_PLAN_FROZEN' then raise; end if;
  end;
  insert into phase2c21_uat_results values ('H', 'PASS', v_error);

  -- I (approved half): refresh is rejected after approval.
  begin
    perform public.refresh_canonical_planned_work_item_snapshot(v_item, v_actor, 'WEBTEST-UAT-P2C21-REFRESH-FROZEN');
    raise exception 'UAT_APPROVED_REFRESH_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'PLANNING_PLAN_FROZEN' then raise; end if;
  end;
  insert into phase2c21_uat_results values ('I', 'PASS', 'explicit draft refresh passed; approved refresh returned PLANNING_PLAN_FROZEN');

  -- A second draft Plan isolates missing-resource approval gates F and G.
  v_gate_plan := (public.create_canonical_annual_work_plan(
    2569, 'WEBTEST-UAT-P2C21-GATES', v_actor, 'WEBTEST-UAT-P2C21-PLAN-GATES'
  )->'annual_work_plan'->>'id')::uuid;
  v_gate_item := (public.create_canonical_planned_work_item_snapshot(
    v_gate_plan, v_year, v_anchor_rate, v_anchor_block_rate, v_block, v_activity,
    'WEBTEST-UAT-P2C21-ITEM-GATES', v_actor, null, current_date, current_date,
    null, null, null, 100, 'tree', 1000, null, 'planned', 'rollback gate UAT', null
  )->'planned_work_item'->>'id')::uuid;
  select jsonb_agg(jsonb_build_object(
    'id', picked.id, 'selected_for_plan', true, 'planned_headcount', 1,
    'planned_basis_quantity', greatest(picked.planned_basis_quantity, 1)
  )) into v_labor_payload
  from (select id, planned_basis_quantity from public.planned_work_labor_requirements
        where planned_work_item_id = v_gate_item and rate_basis is not null order by id limit 1) picked;
  perform public.update_canonical_planned_resource_requirements(v_gate_item, v_actor, v_labor_payload, '[]'::jsonb);
  perform set_config('app.phase2c_snapshot_rpc', 'on', true);
  delete from public.planned_work_materials where planned_work_item_id = v_gate_item;

  -- F: authoritative Material missing is blocked only when Activity Master requires it.
  update public.activities set require_material = true, require_machine = false, require_fuel = false where id = v_activity;
  begin
    perform public.approve_canonical_annual_work_plan(v_gate_plan, v_actor);
    raise exception 'UAT_REQUIRED_MATERIAL_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE' then raise; end if;
  end;
  insert into phase2c21_uat_results values ('F', 'PASS', v_error);

  -- G: Machine and Fuel have independent fail-closed Activity Master gates.
  update public.activities set require_material = false, require_machine = true, require_fuel = false where id = v_activity;
  begin
    perform public.approve_canonical_annual_work_plan(v_gate_plan, v_actor);
    raise exception 'UAT_REQUIRED_MACHINE_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'PLANNING_MACHINE_REQUIREMENT_REQUIRED' then raise; end if;
  end;
  update public.activities set require_machine = false, require_fuel = true where id = v_activity;
  begin
    perform public.approve_canonical_annual_work_plan(v_gate_plan, v_actor);
    raise exception 'UAT_REQUIRED_FUEL_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'PLANNING_FUEL_REQUIREMENT_REQUIRED' then raise; end if;
  end;
  insert into phase2c21_uat_results values ('G', 'PASS', 'Machine missing and Fuel basis/standard/liters missing were independently blocked');

  -- J: Phase 2C.2.1 exposes no canonical Create Work Order path and creates no WO row.
  select count(*) into v_work_orders_after from public.work_orders;
  if v_work_orders_after <> v_work_orders_before then raise exception 'UAT_WORK_ORDER_COUNT_CHANGED %/%', v_work_orders_before, v_work_orders_after; end if;
  if exists (
    select 1 from pg_proc proc join pg_namespace ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public' and proc.proname ~ 'create_canonical.*work_order'
  ) then raise exception 'UAT_CANONICAL_CREATE_WORK_ORDER_FOUND'; end if;
  insert into phase2c21_uat_results values ('J', 'PASS', format('Work Order count unchanged at %s; no canonical Create Work Order RPC', v_work_orders_after));
end
$phase2c21_uat$;

select case_code, result, detail from phase2c21_uat_results order by case_code;
rollback;
