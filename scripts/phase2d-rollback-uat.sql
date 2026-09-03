-- Phase 2D real-data UAT body. The runner prepends Phase 2C.2/2C.2.1/2D DDL,
-- strips their transaction wrappers, starts one outer BEGIN, then executes this body.
-- Every fixture and schema change is rolled back by the final statement.
create temporary table phase2d_uat_results (
  case_code text primary key, result text not null, detail text not null
) on commit drop;

do $phase2d_uat$
declare
  v_actor uuid; v_activity uuid; v_year text; v_rate text := 'budget-rate-mr8lkrnb-1';
  v_rate_block text; v_block uuid; v_plan uuid; v_item uuid; v_order uuid;
  v_vehicle_preferred uuid; v_vehicle_actual uuid; v_contractor uuid;
  v_employee1 uuid; v_employee2 uuid; v_employee3 uuid;
  v_material uuid; v_unit uuid; v_source_material uuid;
  v_labor1 uuid; v_labor2 uuid; v_equipment uuid; v_vehicle_req uuid;
  v_labor_payload jsonb; v_resource_payload jsonb; v_result jsonb; v_error text;
  v_before bigint; v_after bigint; v_survey_before bigint; v_survey_after bigint;
  v_performance_before bigint; v_performance_after bigint; v_rate_before numeric;
  v_total_before numeric; v_total_after numeric; v_historical uuid;
begin
  select id into v_actor from public.profiles where status='active' order by created_at nulls last limit 1;
  select count(*) into v_before from public.work_orders;
  select count(*) into v_survey_before from public.survey_responses;
  select count(*) into v_performance_before from public.work_performance_metrics;
  if v_actor is null then raise exception 'UAT_ACTIVE_ACTOR_REQUIRED'; end if;

  perform public.sync_budget_rate_rule_blocks(v_rate);
  select rate.activity_id, rate.budget_year_id into v_activity, v_year
  from public.budget_activity_rates rate where rate.id=v_rate;
  select id, block_id into v_rate_block, v_block from public.budget_rate_blocks
  where budget_rate_id=v_rate and source_type='rule_resolution' order by id limit 1;
  select id into v_vehicle_preferred from public.vehicles where status='active' order by id limit 1;
  select id into v_vehicle_actual from public.vehicles where status='active' and id<>v_vehicle_preferred order by id limit 1;
  select id into v_employee1 from public.employees where status='active' order by id limit 1;
  select id into v_employee2 from public.employees where status='active' and id<>v_employee1 order by id limit 1;
  select id into v_employee3 from public.employees where status='active' and id not in (v_employee1,v_employee2) order by id limit 1;
  select id, base_unit_id into v_material, v_unit from public.materials
  where status='active' and base_unit_id is not null order by id limit 1;
  if v_rate_block is null or v_vehicle_actual is null or v_employee3 is null or v_material is null then
    raise exception 'UAT_REAL_MASTER_FIXTURE_INCOMPLETE';
  end if;

  insert into public.contractors(contractor_code, contractor_name, contractor_type, status, note)
  values ('WEBTEST-UAT-P2D-CONTRACTOR','WEBTEST UAT Phase 2D Contractor','labor_equipment','active','rollback only')
  returning id into v_contractor;
  insert into public.budget_rate_block_materials(
    budget_rate_block_id,material_id,usage_basis,usage_rate,unit_id,unit_cost,amount_per_basis,status,note,created_by,updated_by
  ) values (v_rate_block,v_material,'tree_count',0.25,v_unit,10,2.5,'active','WEBTEST-UAT-P2D',v_actor,v_actor)
  returning id into v_source_material;
  insert into public.budget_rate_resource_requirements(
    budget_rate_id,resource_type,resource_code,resource_name,quantity_basis,default_planned_quantity,
    resource_rate_amount,resource_rate_uom,calculation_method,fuel_required,status,note
  ) values (v_rate,'equipment','WEBTEST-EQ','UAT Equipment','unit',1,125,'baht/unit','quantity',false,'active','rollback only');
  insert into public.budget_rate_resource_requirements(
    budget_rate_id,resource_type,resource_code,resource_name,preferred_vehicle_id,preferred_vehicle_type,
    quantity_basis,default_planned_quantity,resource_rate_amount,resource_rate_uom,calculation_method,
    fuel_required,fuel_metric_basis,fuel_standard_rate,fuel_unit_cost,status,note
  ) values (v_rate,'vehicle','WEBTEST-VEH','UAT Vehicle',v_vehicle_preferred,'tractor',
    'hour',8,300,'baht/hour','hours',true,'L/hour',4,35,'active','rollback only');
  update public.activities set require_worker=true,require_material=true,require_equipment=true,require_machine=true,require_fuel=true
  where id=v_activity;

  v_plan := (public.create_canonical_annual_work_plan(2569,'WEBTEST-UAT-P2D',v_actor,'WEBTEST-UAT-P2D-PLAN')->'annual_work_plan'->>'id')::uuid;
  v_item := (public.create_canonical_planned_work_item_snapshot(
    v_plan,v_year,v_rate,v_rate_block,v_block,v_activity,'WEBTEST-UAT-P2D-ITEM',v_actor,
    null,current_date,current_date+1,null,null,null,100,'tree',1000,null,'planned','rollback Phase 2D UAT',null
  )->'planned_work_item'->>'id')::uuid;

  select id into v_labor1 from public.planned_work_labor_requirements
  where planned_work_item_id=v_item and rate_basis is not null order by role_position,id limit 1;
  select id into v_labor2 from public.planned_work_labor_requirements
  where planned_work_item_id=v_item and rate_basis is not null and id<>v_labor1 order by role_position,id limit 1;
  select id into v_equipment from public.planned_work_resource_requirements
  where planned_work_item_id=v_item and resource_type='equipment' limit 1;
  select id into v_vehicle_req from public.planned_work_resource_requirements
  where planned_work_item_id=v_item and resource_type='vehicle' limit 1;
  if v_labor2 is null or v_equipment is null or v_vehicle_req is null then raise exception 'UAT_SNAPSHOT_FIXTURE_INCOMPLETE'; end if;
  v_labor_payload := jsonb_build_array(
    jsonb_build_object('id',v_labor1,'selected_for_plan',true,'planned_headcount',2,'planned_basis_quantity',8),
    jsonb_build_object('id',v_labor2,'selected_for_plan',true,'planned_headcount',2,'planned_basis_quantity',8)
  );
  v_resource_payload := jsonb_build_array(
    jsonb_build_object('id',v_equipment,'selected_for_plan',true,'planned_quantity',1),
    jsonb_build_object('id',v_vehicle_req,'selected_for_plan',true,'planned_quantity',8,'planned_hours',8,'planned_fuel_liters',32,'fuel_unit_cost',35)
  );
  perform public.update_canonical_planned_resource_requirements(v_item,v_actor,v_labor_payload,v_resource_payload);

  -- A: draft Planning is rejected.
  begin
    perform public.create_canonical_work_order_from_planned_item(v_item,v_actor,'WEBTEST-UAT-P2D-DRAFT',current_date,null);
    raise exception 'UAT_DRAFT_CREATE_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'PLANNING_CANONICAL_WORK_ORDER_NOT_READY' then raise; end if;
  end;
  insert into phase2d_uat_results values ('A','PASS','Draft Plan returned PLANNING_CANONICAL_WORK_ORDER_NOT_READY');

  perform public.approve_canonical_annual_work_plan(v_plan,v_actor);
  if public.canonical_work_order_eligibility(v_item)<>'READY' then raise exception 'UAT_SCHEDULER_NOT_READY'; end if;
  if not exists(select 1 from public.v_canonical_work_order_scheduler_queue where planned_work_item_id=v_item and eligibility_status='READY') then raise exception 'UAT_QUEUE_ROW_MISSING'; end if;
  insert into phase2d_uat_results values ('B','PASS','Approved full snapshot is READY in Scheduler queue');

  v_result := public.create_canonical_work_order_from_planned_item(v_item,v_actor,'WEBTEST-UAT-P2D-CREATE',current_date,'rollback UAT');
  v_order := (v_result->'work_order'->>'id')::uuid;
  if (select status from public.work_orders where id=v_order)<>'draft' then raise exception 'UAT_INITIAL_STATUS_NOT_DRAFT'; end if;
  if (select count(*) from public.work_orders where planned_work_item_id=v_item)<>1 then raise exception 'UAT_ONE_TO_ONE_FAILED'; end if;
  insert into phase2d_uat_results values ('C','PASS','One Planned Item created exactly one draft Work Order');

  v_result := public.create_canonical_work_order_from_planned_item(v_item,v_actor,'WEBTEST-UAT-P2D-RETRY',current_date,null);
  if (v_result->'work_order'->>'id')::uuid<>v_order or coalesce((v_result->>'already_exists')::boolean,false)<>true then raise exception 'UAT_IDEMPOTENT_RETRY_FAILED'; end if;
  insert into phase2d_uat_results values ('D','PASS','Retry returned the same Work Order');

  if (select count(*) from public.work_order_labor_requirements where work_order_id=v_order)<>2 then raise exception 'UAT_LABOR_COPY_COUNT'; end if;
  if exists((select source_planned_work_labor_requirement_id,rate_amount,uom,planned_headcount,planned_basis_quantity,planned_amount from public.work_order_labor_requirements where work_order_id=v_order)
    except (select id,rate_amount,uom,planned_headcount,planned_basis_quantity,estimated_amount from public.planned_work_labor_requirements where planned_work_item_id=v_item and selected_for_plan)) then raise exception 'UAT_LABOR_COPY_MISMATCH'; end if;
  insert into phase2d_uat_results values ('E','PASS','2 positions / 2 independent Rate lines copied without deduplication');

  select rate_amount into v_rate_before from public.work_order_labor_requirements where id=(select id from public.work_order_labor_requirements where work_order_id=v_order order by id limit 1);
  update public.budget_rate_roles set rate_amount=rate_amount+999 where id=(select source_budget_rate_role_id from public.work_order_labor_requirements where work_order_id=v_order order by id limit 1);
  if (select rate_amount from public.work_order_labor_requirements where work_order_id=v_order order by id limit 1)<>v_rate_before then raise exception 'UAT_WO_RATE_CHANGED'; end if;
  begin update public.work_order_labor_requirements set rate_amount=rate_amount+1 where work_order_id=v_order; raise exception 'UAT_IMMUTABLE_RATE_SHOULD_FAIL';
  exception when sqlstate 'P0001' then get stacked diagnostics v_error=message_text; if v_error<>'CANONICAL_WORK_ORDER_SNAPSHOT_FROZEN' then raise; end if; end;
  insert into phase2d_uat_results values ('F','PASS','Master Rate change did not alter immutable WO Rate Snapshot');

  if exists((select source_planned_work_material_id,material_id,unit_id,planned_quantity,planned_amount from public.work_order_materials where work_order_id=v_order)
    except (select id,material_id,unit_id,planned_quantity,estimated_amount from public.planned_work_materials where planned_work_item_id=v_item)) then raise exception 'UAT_MATERIAL_COPY_MISMATCH'; end if;
  insert into phase2d_uat_results values ('G','PASS','Material quantity/unit/cost/source lineage matches Planning');

  if exists((select source_planned_work_resource_requirement_id,resource_type,preferred_vehicle_id,planned_quantity,planned_hours,planned_fuel_liters,planned_resource_cost,planned_fuel_cost from public.work_order_resource_requirements where work_order_id=v_order)
    except (select id,resource_type,preferred_vehicle_id,planned_quantity,planned_hours,planned_fuel_liters,estimated_resource_cost,fuel_estimated_cost from public.planned_work_resource_requirements where planned_work_item_id=v_item and selected_for_plan)) then raise exception 'UAT_RESOURCE_COPY_MISMATCH'; end if;
  insert into phase2d_uat_results values ('H','PASS','Equipment/Vehicle/Fuel baselines match Planning');

  -- N: exercise each submit gate before completing the draft.
  begin perform public.submit_canonical_work_order(v_order,v_actor,null,null); raise exception 'UAT_MISSING_WORKER_SHOULD_FAIL';
  exception when sqlstate 'P0001' then get stacked diagnostics v_error=message_text; if v_error<>'WORK_ORDER_WORKER_ASSIGNMENT_REQUIRED' then raise; end if; end;
  perform public.update_canonical_work_order_draft(v_order,v_actor,current_date,current_date+1,null,null,null,
    jsonb_build_array(
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor1),'employee_id',v_employee1,'assigned_headcount',1),
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor1),'employee_id',v_employee2,'assigned_headcount',1),
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor2),'employee_id',v_employee3,'assigned_headcount',1),
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor2),'contractor_id',v_contractor,'assigned_headcount',1)
    ),'[]'::jsonb);
  begin perform public.submit_canonical_work_order(v_order,v_actor,null,null); raise exception 'UAT_MISSING_EQUIPMENT_SHOULD_FAIL';
  exception when sqlstate 'P0001' then get stacked diagnostics v_error=message_text; if v_error<>'WORK_ORDER_EQUIPMENT_ASSIGNMENT_REQUIRED' then raise; end if; end;
  perform public.update_canonical_work_order_draft(v_order,v_actor,current_date,current_date+1,null,null,v_contractor,
    (select jsonb_agg(jsonb_build_object('labor_requirement_id',work_order_labor_requirement_id,'employee_id',employee_id,'contractor_id',contractor_id,'assigned_headcount',assigned_headcount)) from public.work_order_workers where work_order_id=v_order),
    jsonb_build_array(jsonb_build_object('resource_requirement_id',(select id from public.work_order_resource_requirements where source_planned_work_resource_requirement_id=v_equipment),'contractor_id',v_contractor)));
  begin perform public.submit_canonical_work_order(v_order,v_actor,null,null); raise exception 'UAT_MISSING_MACHINE_SHOULD_FAIL';
  exception when sqlstate 'P0001' then get stacked diagnostics v_error=message_text; if v_error<>'WORK_ORDER_MACHINE_ASSIGNMENT_REQUIRED' then raise; end if; end;

  select planned_total_cost into v_total_before from public.work_orders where id=v_order;
  perform public.update_canonical_work_order_draft(v_order,v_actor,current_date,current_date+1,null,v_employee3,v_contractor,
    jsonb_build_array(
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor1),'employee_id',v_employee1,'assigned_headcount',1),
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor1),'employee_id',v_employee2,'assigned_headcount',1),
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor2),'employee_id',v_employee3,'assigned_headcount',1),
      jsonb_build_object('labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor2),'contractor_id',v_contractor,'assigned_headcount',1)
    ),jsonb_build_array(
      jsonb_build_object('resource_requirement_id',(select id from public.work_order_resource_requirements where source_planned_work_resource_requirement_id=v_equipment),'contractor_id',v_contractor),
      jsonb_build_object('resource_requirement_id',(select id from public.work_order_resource_requirements where source_planned_work_resource_requirement_id=v_vehicle_req),'selected_vehicle_id',v_vehicle_actual,'driver_employee_id',v_employee1,'driver_labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor1),'planned_fuel_liters',0,'vehicle_variance_reason','actual tractor available')
    ));
  begin perform public.submit_canonical_work_order(v_order,v_actor,null,null); raise exception 'UAT_MISSING_FUEL_SHOULD_FAIL';
  exception when sqlstate 'P0001' then get stacked diagnostics v_error=message_text; if v_error<>'WORK_ORDER_FUEL_PLAN_REQUIRED' then raise; end if; end;
  perform set_config('app.phase2d_canonical_create','on',true); delete from public.work_order_materials where work_order_id=v_order; perform set_config('app.phase2d_canonical_create','off',true);
  begin perform public.submit_canonical_work_order(v_order,v_actor,null,null); raise exception 'UAT_MISSING_MATERIAL_SHOULD_FAIL';
  exception when sqlstate 'P0001' then get stacked diagnostics v_error=message_text; if v_error<>'WORK_ORDER_MATERIAL_SNAPSHOT_REQUIRED' then raise; end if; end;
  perform set_config('app.phase2d_canonical_create','on',true);
  insert into public.work_order_materials(work_order_id,material_id,planned_quantity,unit_id,status,source_planned_work_material_id,snapshot_usage_basis,snapshot_usage_rate,snapshot_basis_quantity,snapshot_unit_cost,snapshot_amount_per_basis,planned_amount,snapshot_at)
  select v_order,material_id,planned_quantity,unit_id,'planned',id,snapshot_usage_basis,snapshot_usage_rate,snapshot_basis_quantity,snapshot_unit_cost,snapshot_amount_per_basis,estimated_amount,snapshot_at from public.planned_work_materials where planned_work_item_id=v_item;
  perform set_config('app.phase2d_canonical_create','off',true);
  insert into phase2d_uat_results values ('N','PASS','Worker, Material, Equipment, Machine and Fuel missing gates independently blocked Submit');

  -- Final valid operational selection.
  perform public.update_canonical_work_order_draft(v_order,v_actor,current_date,current_date+1,null,v_employee3,v_contractor,
    (select jsonb_agg(jsonb_build_object('labor_requirement_id',work_order_labor_requirement_id,'employee_id',employee_id,'contractor_id',contractor_id,'assigned_headcount',assigned_headcount)) from public.work_order_workers where work_order_id=v_order),
    jsonb_build_array(
      jsonb_build_object('resource_requirement_id',(select id from public.work_order_resource_requirements where source_planned_work_resource_requirement_id=v_equipment),'contractor_id',v_contractor),
      jsonb_build_object('resource_requirement_id',(select id from public.work_order_resource_requirements where source_planned_work_resource_requirement_id=v_vehicle_req),'selected_vehicle_id',v_vehicle_actual,'driver_employee_id',v_employee1,'driver_labor_requirement_id',(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor1),'planned_fuel_liters',32,'vehicle_variance_reason','actual tractor available')
    ));
  if (select count(*) from public.work_order_workers where work_order_id=v_order and work_order_labor_requirement_id=(select id from public.work_order_labor_requirements where source_planned_work_labor_requirement_id=v_labor1))<>2 then raise exception 'UAT_MULTI_EMPLOYEE_ASSIGNMENT'; end if;
  insert into phase2d_uat_results values ('I','PASS','Two actual employees assigned to one Labor Requirement');
  if (select count(*) from public.work_order_resource_assignments where work_order_id=v_order and driver_work_order_worker_id is not null)<>1 then raise exception 'UAT_DRIVER_LINK'; end if;
  select planned_total_cost into v_total_after from public.work_orders where id=v_order;
  if v_total_after<>v_total_before then raise exception 'UAT_DRIVER_DOUBLE_COST'; end if;
  insert into phase2d_uat_results values ('J','PASS','Driver links Labor assignment to Vehicle without changing wage/total cost');
  if not exists(select 1 from public.work_order_workers where work_order_id=v_order and employee_id is not null) or not exists(select 1 from public.work_order_workers where work_order_id=v_order and contractor_id=v_contractor) then raise exception 'UAT_MIXED_ASSIGNMENT'; end if;
  insert into phase2d_uat_results values ('K','PASS','Employee + contractor labor/equipment coexist in one WO');
  if not exists(select 1 from public.work_order_resource_assignments where work_order_id=v_order and selected_vehicle_id=v_vehicle_actual and vehicle_variance_reason is not null and changed_by=v_actor) then raise exception 'UAT_VEHICLE_VARIANCE_AUDIT'; end if;
  if (select preferred_vehicle_id from public.planned_work_resource_requirements where id=v_vehicle_req)<>v_vehicle_preferred then raise exception 'UAT_PLANNING_VEHICLE_CHANGED'; end if;
  insert into phase2d_uat_results values ('L','PASS','Actual vehicle differs with reason/audit; Planning preferred vehicle unchanged');
  if (select planned_total_cost from public.work_orders where id=v_order)<>(select planned_labor_cost+planned_material_cost+planned_equipment_cost+planned_machine_cost+planned_fuel_cost from public.work_orders where id=v_order) then raise exception 'UAT_COST_ROLLUP'; end if;
  insert into phase2d_uat_results values ('M','PASS','Cost rollup matches five non-duplicated components; contractor remains a labor subset');
  perform public.submit_canonical_work_order(v_order,v_actor,null,'UAT valid submit');

  select id into v_historical from public.work_orders where workflow_source<>'canonical_planning' order by created_at limit 1;
  update public.work_orders set note=note where id=v_historical;
  insert into phase2d_uat_results values ('O','PASS','Historical Work Order remained writable through legacy-compatible path');
  if (select source_type from public.planned_work_items where id=v_item)<>'canonical_budget' then raise exception 'UAT_CANONICAL_LINEAGE'; end if;
  insert into phase2d_uat_results values ('P','PASS','Canonical lineage retained; legacy action fail-closed code is covered by server regression');

  select count(*) into v_survey_after from public.survey_responses;
  select count(*) into v_performance_after from public.work_performance_metrics;
  if v_survey_after<>v_survey_before or v_performance_after<>v_performance_before then raise exception 'UAT_DOWNSTREAM_TABLE_CHANGED'; end if;
  insert into phase2d_uat_results values ('Q','PASS','Survey and Performance row counts unchanged');
  select count(*) into v_after from public.work_orders;
  if v_after<>v_before+1 then raise exception 'UAT_TRANSACTION_WO_COUNT_EXPECTED %/%',v_before,v_after; end if;
  insert into phase2d_uat_results values ('R','PASS',format('Inside transaction Work Orders %s -> %s; final ROLLBACK restores %s',v_before,v_after,v_before));
end
$phase2d_uat$;

select case_code,result,detail from phase2d_uat_results order by case_code;
rollback;
