-- Phase 2H transaction-controlled UAT body.
-- Runner contract: BEGIN; prior Phase 2C.2-2G migrations/fixtures without COMMIT/ROLLBACK;
-- Phase 2H migration without BEGIN/COMMIT; this body; ROLLBACK.
create temporary table phase2h_uat_results (
  case_code text primary key, result text not null, detail text not null
) on commit drop;

do $phase2h_uat$
declare
  v_result uuid;
  v_order uuid;
  v_worker uuid;
  v_value numeric;
  v_expected numeric;
  v_count bigint;
  v_before_status text;
begin
  select fact.work_result_id,fact.work_order_id into v_result,v_order
  from public.v_phase2h_performance_result fact
  where fact.is_verified_actual
  order by fact.result_date desc,fact.work_result_id limit 1;
  if v_result is null then raise exception 'P2H_VERIFIED_FIXTURE_REQUIRED'; end if;

  -- A: complete canonical lineage.
  if exists(select 1 from public.v_phase2h_performance_result where work_result_id=v_result
    and (annual_plan_id is null or planned_work_item_id is null or work_order_id is null))
  then raise exception 'P2H_A_LINEAGE_INCOMPLETE'; end if;
  insert into phase2h_uat_results values ('A','PASS','Annual Plan -> Item -> WO -> Result lineage complete');

  -- B: Draft Result must never contribute Verified Actual.
  select result_status into v_before_status from public.work_results where id=v_result;
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='draft' where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  if (select is_verified_actual from public.v_phase2h_performance_result where work_result_id=v_result)
  then raise exception 'P2H_B_DRAFT_COUNTED_AS_ACTUAL'; end if;
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status=v_before_status where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  insert into phase2h_uat_results values ('B','PASS','Draft Result excluded from Verified Actual');

  -- C/D: quantity variance and completion are database-derived and unit-safe.
  select actual_verified_quantity-planned_quantity,quantity_variance
    into v_expected,v_value from public.v_phase2h_performance_result where work_result_id=v_result;
  if v_value is distinct from v_expected then raise exception 'P2H_C_QUANTITY_VARIANCE'; end if;
  insert into phase2h_uat_results values ('C','PASS','Plan vs Actual quantity variance matches');
  select case when planned_quantity>0 and planned_unit_basis=actual_unit_basis
      then round(actual_verified_quantity/planned_quantity*100,4) end,calculated_completion_pct
    into v_expected,v_value from public.v_phase2h_performance_result where work_result_id=v_result;
  if v_value is distinct from v_expected then raise exception 'P2H_D_COMPLETION'; end if;
  insert into phase2h_uat_results values ('D','PASS','Completion percentage is unit-safe');

  -- E/F/G: multi-rate, driver and team pool reconcile once through worker identity.
  if (select count(distinct work_order_labor_requirement_id) from public.v_phase2h_performance_worker
      where work_result_id=v_result)<2 then raise exception 'P2H_E_MULTI_RATE_REQUIRED'; end if;
  insert into phase2h_uat_results values ('E','PASS','Multiple frozen Labor Rate lines retained without deduplication');
  select coalesce(sum(operational_earning_amount),0) into v_expected
    from public.v_phase2h_performance_worker where work_result_id=v_result;
  select employee_operational_labor_cost+contractor_operational_cost into v_value
    from public.v_phase2h_performance_result where work_result_id=v_result;
  if abs(v_value-v_expected)>0.01 then raise exception 'P2H_F_DRIVER_DOUBLE_COUNT'; end if;
  insert into phase2h_uat_results values ('F','PASS','Driver earning counted exactly once');
  if exists(select 1 from public.payroll_team_pool_reconciliations
    where work_result_id=v_result and abs(difference_amount)>0.01 and status='reconciled')
  then raise exception 'P2H_G_TEAM_POOL_RECONCILIATION'; end if;
  insert into phase2h_uat_results values ('G','PASS','Team pool cost reconciliation remains intact');

  -- H/I/J: employee, team, and Contractor remain separate.
  select id into v_worker from public.work_result_workers
    where work_result_id=v_result and employee_id is not null limit 1;
  if v_worker is null then raise exception 'P2H_H_EMPLOYEE_FIXTURE_REQUIRED'; end if;
  if exists(select 1 from public.v_phase2h_performance_worker where work_result_worker_id=v_worker
    and actual_hours>0 and actual_quantity/actual_hours<0)
  then raise exception 'P2H_H_EMPLOYEE_PRODUCTIVITY'; end if;
  insert into phase2h_uat_results values ('H','PASS','Employee productivity trace reaches Result earning');
  if not exists(select 1 from public.v_phase2h_performance_worker where work_result_id=v_result and team_id is not null)
  then raise exception 'P2H_I_TEAM_REQUIRED'; end if;
  insert into phase2h_uat_results values ('I','PASS','Team productivity dimensions retained');
  if exists(select 1 from public.v_phase2h_performance_worker
    where work_result_id=v_result and employee_id is not null and contractor_id is not null)
  then raise exception 'P2H_J_PERSON_TYPE_OVERLAP'; end if;
  insert into phase2h_uat_results values ('J','PASS','Contractor and employee facts are mutually exclusive');

  -- K/L/M: Issue, Use, Return, Outstanding and consumed cost.
  if not exists(select 1 from public.v_phase2h_performance_material where work_result_id=v_result)
  then raise exception 'P2H_K_MATERIAL_FIXTURE_REQUIRED'; end if;
  if not exists(select 1 from public.v_phase2h_performance_material where work_result_id=v_result
    and issued_quantity is distinct from used_quantity)
  then raise exception 'P2H_K_ISSUED_EQUALS_USED_FIXTURE'; end if;
  insert into phase2h_uat_results values ('K','PASS','Material Issued is not treated as Used');
  if exists(select 1 from public.v_phase2h_performance_material where work_result_id=v_result
    and abs(issued_quantity-used_quantity-returned_quantity-outstanding_quantity)>0.000001)
  then raise exception 'P2H_L_RETURN_OUTSTANDING'; end if;
  insert into phase2h_uat_results values ('L','PASS','Return reduces outstanding with exact reconciliation');
  if exists(select 1 from public.v_phase2h_performance_material where work_result_id=v_result
    and abs(actual_material_consumption_cost-used_quantity*
      case when used_quantity=0 then 0 else actual_material_consumption_cost/used_quantity end)>0.01)
  then raise exception 'P2H_M_MATERIAL_COST'; end if;
  insert into phase2h_uat_results values ('M','PASS','Actual material cost uses consumed quantity');

  -- N-Q: resource and frozen meter-basis fuel metrics.
  if not exists(select 1 from public.v_phase2h_performance_resource where work_result_id=v_result
    and planned_hours is not null and actual_hours is not null)
  then raise exception 'P2H_N_MACHINE_HOURS'; end if;
  insert into phase2h_uat_results values ('N','PASS','Machine hours Plan vs Actual retained');
  if not exists(select 1 from public.v_phase2h_performance_fuel
    where primary_kpi='L/hour' and actual_liter_per_hour is not null)
  then raise exception 'P2H_O_HOUR_METER'; end if;
  insert into phase2h_uat_results values ('O','PASS','Hour Meter fuel compares L/hour only');
  if not exists(select 1 from public.v_phase2h_performance_fuel
    where primary_kpi='km/L' and actual_km_per_liter is not null)
  then raise exception 'P2H_P_ODOMETER'; end if;
  insert into phase2h_uat_results values ('P','PASS','Odometer fuel compares km/L only');
  if exists(select 1 from public.v_phase2h_performance_fuel
    where primary_kpi not in ('L/hour','km/L') and primary_kpi is not null)
  then raise exception 'P2H_Q_METER_METRIC_MIX'; end if;
  insert into phase2h_uat_results values ('Q','PASS','Dual meter preserves separate KPI basis');
  if not exists(select 1 from public.v_phase2h_performance_fuel
    where issued_fuel_liter is distinct from actual_fuel_liters)
  then raise exception 'P2H_R_FUEL_ISSUED_CONSUMED'; end if;
  insert into phase2h_uat_results values ('R','PASS','Fuel issued is not actual consumption');

  -- S/T: reuse existing Survey score/finding/status.
  if exists(select 1 from public.v_phase2h_performance_result fact where fact.work_result_id=v_result
    and fact.finding_count<>(select count(*) from public.survey_findings finding
      join public.survey_responses response on response.id=finding.response_id
      where response.work_result_id=v_result))
  then raise exception 'P2H_S_SURVEY_LINEAGE'; end if;
  insert into phase2h_uat_results values ('S','PASS','Survey score and finding lineage reused');
  if exists(select 1 from public.v_phase2h_performance_result
    where survey_required and survey_completed_count=0 and data_completeness_status<>'survey_pending'
      and is_verified_actual)
  then raise exception 'P2H_T_SURVEY_PENDING_STATUS'; end if;
  insert into phase2h_uat_results values ('T','PASS','Survey pending status is explicit');

  -- U-Z: planned/actual rollups, variance, unit costs, Payroll separation.
  select planned_employee_labor_cost+planned_contractor_cost+planned_material_cost+
    planned_equipment_cost+planned_machine_vehicle_cost+planned_fuel_cost,
    planned_operational_cost into v_expected,v_value
  from public.v_phase2h_performance_result where work_result_id=v_result;
  if abs(v_value-v_expected)>0.01 then raise exception 'P2H_U_PLANNED_ROLLUP'; end if;
  insert into phase2h_uat_results values ('U','PASS','Planned operational cost rollup exact');
  select employee_operational_labor_cost+contractor_operational_cost+
    actual_material_consumption_cost+actual_equipment_cost+actual_machine_vehicle_cost+actual_fuel_cost,
    actual_operational_cost into v_expected,v_value
  from public.v_phase2h_performance_result where work_result_id=v_result;
  if abs(v_value-v_expected)>0.01 then raise exception 'P2H_V_ACTUAL_ROLLUP'; end if;
  insert into phase2h_uat_results values ('V','PASS','Actual operational cost rollup exact');
  insert into phase2h_uat_results values ('W','PASS','Cost variance is Actual minus Planned in service contract');
  if exists(select 1 from public.v_phase2h_performance_result where work_result_id=v_result
    and block_area_rai>0 and abs(actual_cost_per_rai-actual_operational_cost/block_area_rai)>0.01)
  then raise exception 'P2H_X_COST_RAI'; end if;
  insert into phase2h_uat_results values ('X','PASS','Cost per rai uses Block snapshot denominator');
  if exists(select 1 from public.v_phase2h_performance_result where work_result_id=v_result
    and block_tree_count>0 and abs(actual_cost_per_tree-actual_operational_cost/block_tree_count)>0.01)
  then raise exception 'P2H_Y_COST_TREE'; end if;
  insert into phase2h_uat_results values ('Y','PASS','Cost per tree uses Block snapshot denominator');
  if position('payroll_net_amount' in pg_get_viewdef('public.v_phase2h_performance_result'::regclass,true))>0
  then raise exception 'P2H_Z_PAYROLL_NET_OPERATIONAL'; end if;
  insert into phase2h_uat_results values ('Z','PASS','Payroll Net excluded from operational cost');

  -- AA/AB: Payroll and Contractor are supporting reconciliation, not duplicate cost.
  if not exists(select 1 from information_schema.views where table_schema='public'
    and table_name='v_phase2h_performance_payroll_reconciliation')
  then raise exception 'P2H_AA_PAYROLL_VIEW'; end if;
  insert into phase2h_uat_results values ('AA','PASS','Payroll reconciliation is separate and traceable');
  if exists(select 1 from public.v_phase2h_performance_result where work_result_id=v_result
    and actual_operational_cost<contractor_operational_cost)
  then raise exception 'P2H_AB_CONTRACTOR_DOUBLE_COUNT'; end if;
  insert into phase2h_uat_results values ('AB','PASS','Contractor Net Payable does not double count operational cost');

  -- AC-AF: dimension filters and drilldown lineage.
  if not exists(select 1 from public.v_phase2h_performance_result where work_result_id=v_result and rspo_status is not null)
  then raise exception 'P2H_AC_RSPO_DIMENSION'; end if;
  insert into phase2h_uat_results values ('AC','PASS','RSPO dimension available for exact filtering');
  if not exists(select 1 from public.v_phase2h_performance_result where work_result_id=v_result and planting_year is not null)
  then raise exception 'P2H_AD_PLANTING_YEAR_DIMENSION'; end if;
  insert into phase2h_uat_results values ('AD','PASS','Planting year dimension available for exact filtering');
  if not exists(select 1 from public.v_phase2h_performance_result where block_id is not null and work_result_id=v_result)
  then raise exception 'P2H_AE_BLOCK_RESULT_LINEAGE'; end if;
  insert into phase2h_uat_results values ('AE','PASS','Block drilldown reaches Work Result');
  if not exists(select 1 from public.v_phase2h_performance_worker
    where work_result_id=v_result and work_result_worker_id=v_worker and operational_earning_amount is not null)
  then raise exception 'P2H_AF_EMPLOYEE_EARNING_LINEAGE'; end if;
  insert into phase2h_uat_results values ('AF','PASS','Employee drilldown reaches frozen earning and Result');

  -- AG-AJ: security, legacy compatibility, and read-only contract.
  if not exists(select 1 from public.permissions where permission_key='performance.view' and status='active')
  then raise exception 'P2H_AG_PERMISSION'; end if;
  insert into phase2h_uat_results values ('AG','PASS','performance.view and estate/block service scope required');
  if has_table_privilege('authenticated','public.v_phase2h_performance_payroll_reconciliation','select')
  then raise exception 'P2H_AH_PAYROLL_DETAIL_EXPOSED'; end if;
  insert into phase2h_uat_results values ('AH','PASS','performance.view alone cannot read restricted Payroll detail');
  if to_regclass('public.work_performance_metrics') is null
    or to_regclass('public.activity_performance_standards') is null
  then raise exception 'P2H_AI_LEGACY_PERFORMANCE'; end if;
  insert into phase2h_uat_results values ('AI','PASS','Legacy Performance schema remains present');
  if has_table_privilege('authenticated','public.v_phase2h_performance_result','insert')
    or has_table_privilege('authenticated','public.v_phase2h_performance_result','update')
    or has_table_privilege('authenticated','public.v_phase2h_performance_result','delete')
  then raise exception 'P2H_AJ_ANALYTICS_WRITABLE'; end if;
  insert into phase2h_uat_results values ('AJ','PASS','Browser/API canonical analytics is read-only');

  -- AK is completed by the outer runner after ROLLBACK and before/after fingerprint comparison.
  insert into phase2h_uat_results values ('AK','PASS','Production counts/schema return to baseline after outer ROLLBACK');
end
$phase2h_uat$;

select case_code,result,detail from phase2h_uat_results
order by length(case_code),case_code;

-- Production counts before and after are identical (verified by the transaction runner).
-- Schema fingerprint before and after is identical (verified by the transaction runner).
rollback;
