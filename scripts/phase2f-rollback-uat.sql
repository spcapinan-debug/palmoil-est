-- Phase 2F real-data UAT body.
-- Runner: BEGIN; Phase 2C.2/2C.2.1/2D/2E/2F migrations without wrappers;
-- Phase 2D UAT body; Phase 2E UAT cases A-S closed before its Close/ROLLBACK;
-- the Phase 2E fuel fixture is issued 40 L and actual consumption 32 L;
-- then this file. The final ROLLBACK restores schema and data.
create temporary table phase2f_uat_results (
  case_code text primary key, result text not null, detail text not null
) on commit drop;

do $phase2f_uat$
declare
  v_order uuid; v_result uuid; v_actor uuid; v_material uuid; v_unit uuid;
  v_plan numeric; v_issue uuid; v_line uuid; v_warehouse uuid; v_bin uuid;
  v_before_issue bigint; v_before_usage bigint; v_before_result bigint; v_frozen numeric;
  v_vehicle uuid; v_requirement uuid;
  v_result_q uuid; v_result_r uuid; v_result_s uuid; v_result_t uuid;
  v_q_standard numeric; v_q_basis text; v_error text;
begin
  select wo.id, wr.id, wo.created_by_profile_id
  into v_order, v_result, v_actor
  from public.work_orders wo
  join public.work_results wr on wr.work_order_id=wo.id
  where wo.canonical_create_request_key='WEBTEST-UAT-P2D-CREATE'
    and wr.workflow_source='canonical_work_order'
  order by wr.created_at desc limit 1;
  if v_result is null then raise exception 'PHASE2E_UAT_RESULT_REQUIRED'; end if;

  select count(*) into v_before_issue from public.goods_issues;
  select count(*) into v_before_usage from public.goods_issue_daily_usage;
  select count(*) into v_before_result from public.work_results;

  -- A/C: the Phase 2E fixture is 80 percent Used and 20 percent Returned.
  if not exists (
    select 1 from public.v_canonical_result_material_variance
    where work_result_id=v_result and inventory_reconciled
      and variance_status='under' and actual_quantity=cumulative_actual_quantity
      and abs(issued_quantity-cumulative_actual_quantity-returned_quantity-outstanding_quantity)<=0.000001
  ) then raise exception 'P2F_A_C_MATERIAL_RECONCILIATION_FAILED'; end if;
  insert into phase2f_uat_results values
    ('A','PASS','Issued = Used + Returned + Outstanding with conversion snapshot'),
    ('C','PASS','Returned quantity is excluded from Actual and under-use remains visible');

  -- B: add a fully consumed 25 percent issue so cumulative Actual becomes 105 percent.
  select material_id,unit_id,planned_quantity into v_material,v_unit,v_plan
  from public.work_order_materials where work_order_id=v_order order by id limit 1;
  select warehouse_id,bin_id into v_warehouse,v_bin
  from public.goods_issue_lines gil join public.goods_issues gi on gi.id=gil.issue_id
  where gi.work_order_id=v_order order by gi.created_at,gil.id limit 1;
  insert into public.goods_issues(
    issue_no,warehouse_id,work_order_id,work_result_id,issue_date,status,
    created_by,requested_by_profile_id,approved_by_profile_id,approved_at,
    posted_by_profile_id,posted_at,issue_start_date,issue_end_date,
    allow_multi_day,usage_status,note
  ) values (
    'WEBTEST-UAT-P2F-GI-OVER',v_warehouse,v_order,v_result,current_date,'posted',
    v_actor,v_actor,v_actor,transaction_timestamp(),v_actor,transaction_timestamp(),
    current_date,current_date,true,'open','rollback over-use'
  ) returning id into v_issue;
  insert into public.goods_issue_lines(
    issue_id,material_id,bin_id,quantity,unit_id,unit_cost,
    requested_quantity,requested_unit_id,base_quantity,base_unit_id,conversion_rate_snapshot
  ) values (
    v_issue,v_material,v_bin,round(v_plan*0.25,4),v_unit,10,
    round(v_plan*0.25,4),v_unit,round(v_plan*0.25,4),v_unit,1
  ) returning id into v_line;
  perform public.record_goods_issue_daily_usage(
    v_issue,v_line,current_date,v_result,v_material,round(v_plan*0.25,4),v_unit,
    v_actor,'rollback use','WEBTEST-UAT-P2F-USE-OVER'
  );
  if not exists (
    select 1 from public.v_canonical_result_material_variance
    where work_result_id=v_result and material_id=v_material
      and inventory_reconciled and variance_status='over' and abs(variance_pct-5)<=0.01
  ) then raise exception 'P2F_B_MATERIAL_OVER_FAILED'; end if;
  insert into phase2f_uat_results values
    ('B','PASS','Cumulative Material Actual 105 percent reports Over and +5 percent');

  -- D/E/F: requirement-level headcount, allocation, and frozen Rate lineage.
  if not exists (select 1 from public.v_canonical_result_labor_variance
    where work_result_id=v_result and planned_headcount>0 and actual_headcount>0)
  then raise exception 'P2F_D_HEADCOUNT_FAILED'; end if;
  insert into phase2f_uat_results values
    ('D','PASS','Labor view exposes planned and actual headcount per Rate line');
  if exists (select 1 from public.v_canonical_result_labor_variance
    where work_result_id=v_result and abs(actual_quantity-100)>0.001)
  then raise exception 'P2F_E_ALLOCATION_FAILED'; end if;
  insert into phase2f_uat_results values
    ('E','PASS','Worker allocations aggregate to Result Actual for every Rate line');
  select frozen_rate_amount into v_frozen
  from public.v_canonical_result_labor_variance
  where work_result_id=v_result order by work_order_labor_requirement_id limit 1;
  if v_frozen is distinct from (
    select rate_amount from public.work_result_workers
    where work_result_id=v_result order by work_order_labor_requirement_id limit 1
  ) then raise exception 'P2F_F_FROZEN_RATE_FAILED'; end if;
  insert into phase2f_uat_results values
    ('F','PASS','Variance uses the frozen Result/WO Rate after Rate Master mutation');

  -- G/H/I: exact resource assignment and fuel consumption separate from issue/refill.
  if not exists (select 1 from public.v_canonical_result_resource_variance
    where work_result_id=v_result and work_order_resource_assignment_id is not null
      and assigned_vehicle_id=actual_vehicle_id)
  then raise exception 'P2F_G_RESOURCE_TRACE_FAILED'; end if;
  insert into phase2f_uat_results values
    ('G','PASS','Equipment/Vehicle Actual retains WO assignment lineage');
  if not exists (select 1 from public.v_canonical_result_fuel_variance
    where work_result_id=v_result and actual_fuel_liters=32 and actual_liter_per_hour=4)
  then raise exception 'P2F_H_FUEL_EFFICIENCY_FAILED'; end if;
  insert into phase2f_uat_results values
    ('H','PASS','Fuel 32 L over 8 engine hours reports 4 L/hour');
  if not exists (select 1 from public.v_canonical_result_fuel_variance
    where work_result_id=v_result and actual_fuel_liters=32
      and actual_liter_per_hour=4)
  then raise exception 'P2F_I_REFILL_AS_ACTUAL_FAILED'; end if;
  insert into phase2f_uat_results values
    ('I','PASS','Fuel view reads canonical Actual consumption; explicit issue separation is exercised in U');

  -- J-M reuse the exact Phase 2E runtime gates already exercised in this transaction.
  if not exists(select 1 from phase2e_uat_results where case_code='L' and result='PASS')
  then raise exception 'P2F_J_MATERIAL_GUARD_FAILED'; end if;
  if not exists(select 1 from phase2e_uat_results where case_code='K' and result='PASS')
  then raise exception 'P2F_K_LABOR_GUARD_FAILED'; end if;
  if not exists(select 1 from phase2e_uat_results where case_code='M' and result='PASS')
  then raise exception 'P2F_L_MACHINE_FUEL_GUARD_FAILED'; end if;
  if not exists(select 1 from phase2e_uat_results where case_code='Q' and result='PASS')
  then raise exception 'P2F_M_SURVEY_GUARD_FAILED'; end if;
  insert into phase2f_uat_results values
    ('J','PASS','Missing required Material is blocked'),
    ('K','PASS','Missing required Labor is blocked'),
    ('L','PASS','Missing required Machine/Fuel is blocked'),
    ('M','PASS','Phase 2E Survey resolver and verification guard remain authoritative');

  -- N/O: legacy remains readable; canonical views retain typed source FKs.
  if not exists(select 1 from phase2e_uat_results where case_code='S' and result='PASS')
  then raise exception 'P2F_N_LEGACY_FAILED'; end if;
  insert into phase2f_uat_results values ('N','PASS','Legacy Daily Result remains available');
  if not exists (
    select 1 from public.v_canonical_result_material_variance material
    join public.v_canonical_result_labor_variance labor
      on labor.work_result_id=material.work_result_id
    where material.work_result_id=v_result
      and material.source_budget_rate_block_material_id is not null
      and material.source_planned_work_material_id is not null
      and material.work_order_material_id is not null
      and material.planned_work_item_id is not null
      and labor.source_budget_rate_role_id is not null
      and labor.source_planned_work_labor_requirement_id is not null
  ) then raise exception 'P2F_O_TYPED_LINEAGE_FAILED'; end if;
  insert into phase2f_uat_results values
    ('O','PASS','Typed Budget -> Plan -> WO -> Result lineage is complete');

  if (select count(*) from public.goods_issues)<>v_before_issue+1
    or (select count(*) from public.goods_issue_daily_usage)<>v_before_usage+1
  then raise exception 'P2F_P_TRANSACTION_DELTA_FAILED'; end if;
  insert into phase2f_uat_results values
    ('P','PASS','Phase 2F transaction delta is exact; final ROLLBACK restores counts');

  select usage.vehicle_id, usage.work_order_resource_requirement_id
  into v_vehicle, v_requirement
  from public.work_result_vehicle_usage usage
  where usage.work_result_id=v_result
  order by usage.id limit 1;
  if v_vehicle is null or v_requirement is null then
    raise exception 'P2F_Q_V_CANONICAL_VEHICLE_FIXTURE_REQUIRED';
  end if;

  -- Q: Hour Meter is authoritative for an engine-hours vehicle.
  update public.vehicles set fuel_measurement_basis='engine_hours',
    requires_hour_meter=true,requires_odometer=false where id=v_vehicle;
  perform set_config('app.phase2d_canonical_create','on',true);
  update public.work_order_resource_requirements
  set fuel_metric_basis='L/hour',fuel_standard_rate=4 where id=v_requirement;
  perform set_config('app.phase2d_canonical_create','off',true);
  update public.work_orders set status='in_progress' where id=v_order;
  select id into v_result_q from public.get_or_create_canonical_work_result(
    v_order,current_date+1,v_actor
  );
  perform public.save_canonical_work_result_draft_phase2f(
    v_result_q,v_actor,jsonb_build_object('actual_quantity',100),
    '[]'::jsonb,jsonb_build_array(jsonb_build_object(
      'work_order_resource_requirement_id',v_requirement,
      'vehicle_id',v_vehicle,
      'start_hour_meter',100,
      'end_hour_meter',108,
      'actual_fuel_liter',32,
      'issued_fuel_liter',40
    ))
  );
  perform public.phase2f_validate_vehicle_measurements(v_result_q);
  if not exists (
    select 1 from public.v_canonical_result_fuel_variance
    where work_result_id=v_result_q
      and fuel_measurement_basis_snapshot='engine_hours'
      and requires_hour_meter_snapshot and not requires_odometer_snapshot
      and engine_hours=8 and actual_fuel_liters=32
      and actual_liter_per_hour=4 and primary_kpi='L/hour'
      and primary_actual_rate=4 and primary_standard_rate=4
      and primary_variance_status='on_plan'
  ) then raise exception 'P2F_Q_HOUR_METER_KPI_FAILED'; end if;
  insert into phase2f_uat_results values
    ('Q','PASS','32 L / 8 engine hours = 4 L/hour; Odometer is not required');

  -- R: Odometer is authoritative for a distance vehicle.
  update public.vehicles set fuel_measurement_basis='distance_km',
    requires_hour_meter=false,requires_odometer=true where id=v_vehicle;
  perform set_config('app.phase2d_canonical_create','on',true);
  update public.work_order_resource_requirements
  set fuel_metric_basis='km/L',fuel_standard_rate=4 where id=v_requirement;
  perform set_config('app.phase2d_canonical_create','off',true);
  select id into v_result_r from public.get_or_create_canonical_work_result(
    v_order,current_date+2,v_actor
  );
  perform public.save_canonical_work_result_draft_phase2f(
    v_result_r,v_actor,jsonb_build_object('actual_quantity',100),
    '[]'::jsonb,jsonb_build_array(jsonb_build_object(
      'work_order_resource_requirement_id',v_requirement,
      'vehicle_id',v_vehicle,
      'start_odometer',1000,
      'end_odometer',1160,
      'actual_fuel_liter',40
    ))
  );
  perform public.phase2f_validate_vehicle_measurements(v_result_r);
  if not exists (
    select 1 from public.v_canonical_result_fuel_variance
    where work_result_id=v_result_r
      and fuel_measurement_basis_snapshot='distance_km'
      and not requires_hour_meter_snapshot and requires_odometer_snapshot
      and distance_km=160 and actual_fuel_liters=40
      and actual_km_per_liter=4 and primary_kpi='km/L'
      and primary_actual_rate=4 and primary_standard_rate=4
      and primary_variance_status='on_plan'
  ) then raise exception 'P2F_R_ODOMETER_KPI_FAILED'; end if;
  insert into phase2f_uat_results values
    ('R','PASS','160 km / 40 L = 4 km/L; Hour Meter is not required');

  -- S: a dual-meter vehicle snapshots and validates both operational bases.
  update public.vehicles set fuel_measurement_basis='engine_hours',
    requires_hour_meter=true,requires_odometer=true where id=v_vehicle;
  perform set_config('app.phase2d_canonical_create','on',true);
  update public.work_order_resource_requirements
  set fuel_metric_basis='L/hour',fuel_standard_rate=4 where id=v_requirement;
  perform set_config('app.phase2d_canonical_create','off',true);
  select id into v_result_s from public.get_or_create_canonical_work_result(
    v_order,current_date+3,v_actor
  );
  perform public.save_canonical_work_result_draft_phase2f(
    v_result_s,v_actor,jsonb_build_object('actual_quantity',100),
    '[]'::jsonb,jsonb_build_array(jsonb_build_object(
      'work_order_resource_requirement_id',v_requirement,
      'vehicle_id',v_vehicle,
      'start_hour_meter',200,
      'end_hour_meter',208,
      'start_odometer',2000,
      'end_odometer',2160,
      'actual_fuel_liter',32
    ))
  );
  perform public.phase2f_validate_vehicle_measurements(v_result_s);
  if not exists (
    select 1 from public.work_result_vehicle_usage
    where work_result_id=v_result_s and requires_hour_meter_snapshot
      and requires_odometer_snapshot and engine_hours=8 and distance_km=160
  ) then raise exception 'P2F_S_DUAL_METER_FAILED'; end if;
  insert into phase2f_uat_results values
    ('S','PASS','Vehicle requiring both meters retains and validates hour and km readings');

  -- T: missing a required meter blocks the Result status transition.
  update public.vehicles set fuel_measurement_basis='engine_hours',
    requires_hour_meter=true,requires_odometer=false where id=v_vehicle;
  select id into v_result_t from public.get_or_create_canonical_work_result(
    v_order,current_date+4,v_actor
  );
  begin
    perform set_config('app.phase2e_daily_action','on',true);
    update public.work_results set result_status='submitted' where id=v_result_t;
    raise exception 'P2F_T_REQUIRED_METER_SHOULD_BLOCK';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'WORK_RESULT_HOUR_METER_REQUIRED' then raise; end if;
  end;
  perform set_config('app.phase2e_daily_action','off',true);
  if (select result_status from public.work_results where id=v_result_t)<>'draft'
  then raise exception 'P2F_T_STATUS_CHANGED'; end if;
  insert into phase2f_uat_results values
    ('T','PASS','Missing required Hour Meter blocks submit and leaves Result draft');

  -- U: issue/refill remains distinct from Actual consumption.
  if not exists (
    select 1 from public.v_canonical_result_fuel_variance
    where work_result_id=v_result_q
      and issued_fuel_liter=40 and actual_fuel_liters=32
  ) then raise exception 'P2F_U_ISSUED_COUNTED_AS_ACTUAL'; end if;
  insert into phase2f_uat_results values
    ('U','PASS','Issued 40 L remains separate from Actual consumption 32 L');

  -- V: later Vehicle Master edits cannot rewrite the Result/WO frozen standard.
  select fuel_standard_rate_snapshot,fuel_metric_basis_snapshot
  into v_q_standard,v_q_basis
  from public.work_result_vehicle_usage where work_result_id=v_result_q;
  update public.vehicles set fuel_measurement_basis='distance_km',
    requires_hour_meter=false,requires_odometer=true,
    standard_liter_per_hour=99,standard_km_per_liter=99
  where id=v_vehicle;
  if not exists (
    select 1 from public.work_result_vehicle_usage
    where work_result_id=v_result_q
      and fuel_standard_rate_snapshot=v_q_standard
      and fuel_metric_basis_snapshot=v_q_basis
      and fuel_measurement_basis_snapshot='engine_hours'
      and requires_hour_meter_snapshot and not requires_odometer_snapshot
  ) then raise exception 'P2F_V_RESULT_SNAPSHOT_CHANGED'; end if;
  if not exists (
    select 1 from public.work_order_resource_requirements
    where id=v_requirement and fuel_metric_basis='L/hour' and fuel_standard_rate=4
  ) then raise exception 'P2F_V_WO_STANDARD_CHANGED'; end if;
  if (select count(*) from public.work_results)<>v_before_result+4
  then raise exception 'P2F_V_RESULT_DELTA_FAILED'; end if;
  insert into phase2f_uat_results values
    ('V','PASS','Vehicle Master change leaves frozen WO/Result fuel standard and meter snapshot unchanged');
end
$phase2f_uat$;

select case_code,result,detail from phase2f_uat_results order by case_code;
rollback;
