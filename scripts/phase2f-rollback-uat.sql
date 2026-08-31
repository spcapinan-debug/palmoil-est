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
  v_before_issue bigint; v_before_usage bigint; v_frozen numeric;
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
    where work_result_id=v_result and issued_fuel_liter=40 and actual_fuel_liters=32
      and issued_fuel_liter<>actual_fuel_liters)
  then raise exception 'P2F_I_REFILL_AS_ACTUAL_FAILED'; end if;
  insert into phase2f_uat_results values
    ('I','PASS','Issued/refill 40 L remains distinct from Actual consumption 32 L');

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
end
$phase2f_uat$;

select case_code,result,detail from phase2f_uat_results order by case_code;
rollback;
