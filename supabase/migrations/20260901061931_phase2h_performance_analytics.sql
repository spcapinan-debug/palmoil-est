-- Phase 2H: read-only canonical Performance / Plan vs Actual analytics.
-- Verified Result snapshots are authoritative. Payroll is reconciliation evidence only.
begin;

create or replace function public.phase2h_normalize_unit(p_unit text)
returns text
language sql immutable security invoker set search_path=''
as $phase2h_unit$
  select case
    when lower(btrim(coalesce(p_unit,''))) in ('tree','trees','ต้น') then 'tree'
    when lower(btrim(coalesce(p_unit,''))) in ('rai','ไร่') then 'rai'
    when lower(btrim(coalesce(p_unit,''))) in ('kg','kilogram','kilograms','กก.','กก') then 'kg'
    when lower(btrim(coalesce(p_unit,''))) in ('ton','tons','tonne','ตัน') then 'ton'
    when lower(btrim(coalesce(p_unit,''))) in ('trip','trips','เที่ยว') then 'trip'
    when lower(btrim(coalesce(p_unit,''))) in ('hour','hours','hr','ชั่วโมง') then 'hour'
    when lower(btrim(coalesce(p_unit,''))) in ('day','days','วัน') then 'day'
    when lower(btrim(coalesce(p_unit,''))) in ('fixed','job','งาน','เหมา') then 'fixed'
    else nullif(lower(btrim(coalesce(p_unit,''))), '')
  end;
$phase2h_unit$;

create or replace view public.v_phase2h_performance_result
with (security_invoker=true) as
with worker_actual as (
  select worker.work_result_id,
    count(*) filter (where public.phase2e_is_present(worker.attendance_status))::integer as actual_headcount,
    count(distinct worker.employee_id) filter (where worker.employee_id is not null)::integer as employee_count,
    count(distinct worker.contractor_id) filter (where worker.contractor_id is not null)::integer as contractor_count,
    coalesce(sum(worker.actual_hours) filter (where public.phase2e_is_present(worker.attendance_status)),0) as actual_labor_hours,
    coalesce(sum(worker.earning_amount) filter (where worker.employee_id is not null),0) as employee_operational_labor_cost,
    coalesce(sum(worker.earning_amount) filter (where worker.contractor_id is not null),0) as contractor_operational_cost,
    count(*) filter (where worker.is_driver)::integer as driver_line_count
  from public.work_result_workers worker
  group by worker.work_result_id
), planned_labor as (
  select requirement.work_order_id,
    coalesce(sum(requirement.planned_headcount),0) as planned_headcount,
    coalesce(sum(case when lower(coalesce(requirement.payee_type,''))='contractor' then 0 else requirement.planned_amount end),0) as planned_employee_labor_cost,
    coalesce(sum(case when lower(coalesce(requirement.payee_type,''))='contractor' then requirement.planned_amount else 0 end),0) as planned_contractor_cost,
    coalesce(sum(case when requirement.rate_basis='hour_count' then requirement.planned_basis_quantity else 0 end),0) as planned_labor_hours
  from public.work_order_labor_requirements requirement
  group by requirement.work_order_id
), material_actual as (
  select material.work_result_id,
    coalesce(sum(material.actual_quantity * coalesce(material.snapshot_unit_cost,0)),0) as actual_material_consumption_cost,
    coalesce(sum(material.issued_quantity),0) as issued_quantity,
    coalesce(sum(material.actual_quantity),0) as used_quantity,
    coalesce(sum(material.result_returned_quantity),0) as returned_quantity,
    coalesce(sum(material.outstanding_quantity),0) as outstanding_quantity,
    coalesce(avg(material.variance_pct),0) as material_variance_pct
  from public.v_canonical_result_material_variance material
  group by material.work_result_id
), resource_actual as (
  select resource.work_result_id,
    coalesce(sum(resource.actual_resource_cost) filter (where resource.resource_type='equipment'),0) as actual_equipment_cost,
    coalesce(sum(resource.actual_resource_cost) filter (where resource.resource_type in ('machine','vehicle')),0) as actual_machine_vehicle_cost,
    coalesce(sum(resource.actual_hours),0) as actual_machine_hours,
    coalesce(sum(resource.actual_km),0) as actual_distance_km,
    coalesce(sum(resource.actual_rai),0) as actual_resource_rai,
    coalesce(sum(resource.actual_tree_count),0) as actual_resource_tree_count,
    coalesce(avg(resource.utilization_variance_pct),0) as resource_variance_pct
  from public.v_canonical_result_resource_variance resource
  where resource.resource_type<>'fuel'
  group by resource.work_result_id
), fuel_actual as (
  select fuel.work_result_id,
    coalesce(sum(fuel.issued_fuel_liter),0) as issued_fuel_liters,
    coalesce(sum(fuel.actual_fuel_liters),0) as actual_fuel_liters,
    coalesce(sum(fuel.actual_fuel_cost),0) as actual_fuel_cost,
    coalesce(avg(fuel.variance_pct),0) as fuel_variance_pct,
    jsonb_agg(jsonb_build_object(
      'vehicle_id',fuel.vehicle_id,'basis',fuel.primary_kpi,
      'standard',fuel.primary_standard_rate,'actual',fuel.primary_actual_rate,
      'variance_pct',fuel.primary_variance_pct
    ) order by fuel.vehicle_id) filter (where fuel.work_result_vehicle_usage_id is not null) as fuel_kpis
  from public.v_canonical_result_fuel_variance fuel
  group by fuel.work_result_id
), survey_actual as (
  select response.work_result_id,
    count(*)::integer as survey_response_count,
    count(*) filter (where response.status in ('verified','closed'))::integer as survey_completed_count,
    coalesce(avg(response.score_pct) filter (where response.status in ('verified','closed')),0) as survey_score_pct,
    bool_and(coalesce(response.pass_status,'pending')<>'failed') filter (where response.status in ('verified','closed')) as survey_passed,
    array_agg(response.id order by response.id) as survey_response_ids
  from public.survey_responses response
  where response.work_result_id is not null
  group by response.work_result_id
), finding_actual as (
  select response.work_result_id,
    count(finding.id)::integer as finding_count,
    count(finding.id) filter (where finding.status not in ('resolved','verified','cancelled'))::integer as unresolved_finding_count,
    count(finding.id) filter (where lower(coalesce(finding.severity,'')) in ('high','critical','major'))::integer as severe_finding_count
  from public.survey_responses response
  join public.survey_findings finding on finding.response_id=response.id
  where response.work_result_id is not null
  group by response.work_result_id
), base as (
  select result.id as work_result_id,result.work_order_id,work_order.work_order_no,
    work_order.planned_work_item_id,item.annual_plan_id,plan.plan_year,plan.plan_name,
    result.result_date,extract(year from result.result_date)::integer as calendar_year,
    extract(month from result.result_date)::integer as calendar_month,
    result.result_status,work_order.status as work_order_status,
    work_order.estate_id,estate.estate_code,estate.estate_name,
    work_order.block_id,block.block_code,block.block_name,block.area_rai as block_area_rai,
    block.tree_count as block_tree_count,block.planting_year,block.rspo_status,
    work_order.activity_id,activity.activity_code,activity.activity_name,
    activity.activity_group_id,activity_group.group_code as activity_group_code,
    activity_group.group_name as activity_group_name,
    work_order.team_id,team.team_code,team.team_name,
    work_order.contractor_id,contractor.contractor_code,contractor.contractor_name,
    result.plan_quantity_snapshot as planned_quantity,result.plan_unit_snapshot as planned_unit,
    public.phase2h_normalize_unit(result.plan_unit_snapshot) as planned_unit_basis,
    case when result.result_status in ('verified','closed') then result.actual_quantity end as actual_verified_quantity,
    case when result.result_status in ('verified','closed') then public.phase2h_normalize_unit(result.actual_unit) end as actual_unit_basis,
    coalesce(planned_labor.planned_headcount,0) as planned_headcount,
    coalesce(planned_labor.planned_labor_hours,0) as planned_labor_hours,
    coalesce(planned_labor.planned_employee_labor_cost,0) as planned_employee_labor_cost,
    coalesce(planned_labor.planned_contractor_cost,0) as planned_contractor_cost,
    result.plan_material_cost_snapshot as planned_material_cost,
    result.plan_equipment_cost_snapshot as planned_equipment_cost,
    result.plan_machine_cost_snapshot as planned_machine_vehicle_cost,
    result.plan_fuel_cost_snapshot as planned_fuel_cost,
    coalesce(worker_actual.actual_headcount,0) as actual_headcount,
    coalesce(worker_actual.employee_count,0) as employee_count,
    coalesce(worker_actual.contractor_count,0) as contractor_count,
    coalesce(worker_actual.actual_labor_hours,0) as actual_labor_hours,
    coalesce(worker_actual.employee_operational_labor_cost,0) as employee_operational_labor_cost,
    coalesce(worker_actual.contractor_operational_cost,0) as contractor_operational_cost,
    coalesce(worker_actual.driver_line_count,0) as driver_line_count,
    coalesce(material_actual.actual_material_consumption_cost,0) as actual_material_consumption_cost,
    coalesce(material_actual.issued_quantity,0) as material_issued_quantity,
    coalesce(material_actual.used_quantity,0) as material_used_quantity,
    coalesce(material_actual.returned_quantity,0) as material_returned_quantity,
    coalesce(material_actual.outstanding_quantity,0) as material_outstanding_quantity,
    coalesce(material_actual.material_variance_pct,0) as material_variance_pct,
    coalesce(resource_actual.actual_equipment_cost,0) as actual_equipment_cost,
    coalesce(resource_actual.actual_machine_vehicle_cost,0) as actual_machine_vehicle_cost,
    coalesce(resource_actual.actual_machine_hours,0) as actual_machine_hours,
    coalesce(resource_actual.actual_distance_km,0) as actual_distance_km,
    coalesce(resource_actual.actual_resource_rai,0) as actual_resource_rai,
    coalesce(resource_actual.actual_resource_tree_count,0) as actual_resource_tree_count,
    coalesce(resource_actual.resource_variance_pct,0) as resource_variance_pct,
    coalesce(fuel_actual.issued_fuel_liters,0) as issued_fuel_liters,
    coalesce(fuel_actual.actual_fuel_liters,0) as actual_fuel_liters,
    coalesce(fuel_actual.actual_fuel_cost,0) as actual_fuel_cost,
    coalesce(fuel_actual.fuel_variance_pct,0) as fuel_variance_pct,
    coalesce(fuel_actual.fuel_kpis,'[]'::jsonb) as fuel_kpis,
    work_order.survey_required,
    coalesce(survey_actual.survey_response_count,0) as survey_response_count,
    coalesce(survey_actual.survey_completed_count,0) as survey_completed_count,
    coalesce(survey_actual.survey_score_pct,result.survey_score_pct,0) as survey_score_pct,
    survey_actual.survey_passed,
    coalesce(survey_actual.survey_response_ids,array[]::uuid[]) as survey_response_ids,
    coalesce(finding_actual.finding_count,result.finding_count,0) as finding_count,
    coalesce(finding_actual.unresolved_finding_count,0) as unresolved_finding_count,
    coalesce(finding_actual.severe_finding_count,0) as severe_finding_count,
    result.quality_score,result.completion_pct,result.rework_required,result.rework_quantity,
    result.verification_snapshot_at,
    result.result_status in ('verified','closed') and result.verification_snapshot_at is not null as is_verified_actual
  from public.work_results result
  join public.work_orders work_order on work_order.id=result.work_order_id
  join public.planned_work_items item on item.id=work_order.planned_work_item_id
  join public.annual_work_plans plan on plan.id=item.annual_plan_id
  left join public.estates estate on estate.id=work_order.estate_id
  left join public.blocks block on block.id=work_order.block_id
  left join public.activities activity on activity.id=work_order.activity_id
  left join public.activity_groups activity_group on activity_group.id=activity.activity_group_id
  left join public.teams team on team.id=work_order.team_id
  left join public.contractors contractor on contractor.id=work_order.contractor_id
  left join worker_actual on worker_actual.work_result_id=result.id
  left join planned_labor on planned_labor.work_order_id=work_order.id
  left join material_actual on material_actual.work_result_id=result.id
  left join resource_actual on resource_actual.work_result_id=result.id
  left join fuel_actual on fuel_actual.work_result_id=result.id
  left join survey_actual on survey_actual.work_result_id=result.id
  left join finding_actual on finding_actual.work_result_id=result.id
  where work_order.workflow_source='canonical_planning'
    and result.workflow_source='canonical_work_order'
)
select base.*,
  planned_employee_labor_cost+planned_contractor_cost+planned_material_cost
    +planned_equipment_cost+planned_machine_vehicle_cost+planned_fuel_cost as planned_operational_cost,
  case when is_verified_actual then employee_operational_labor_cost+contractor_operational_cost
    +actual_material_consumption_cost+actual_equipment_cost+actual_machine_vehicle_cost+actual_fuel_cost end
    as actual_operational_cost,
  case when is_verified_actual and planned_unit_basis=actual_unit_basis
    then actual_verified_quantity-planned_quantity end as quantity_variance,
  case when is_verified_actual and planned_quantity>0 and planned_unit_basis=actual_unit_basis
    then round(actual_verified_quantity/planned_quantity*100,4) end as calculated_completion_pct,
  case when is_verified_actual and actual_labor_hours>0
    then round(actual_verified_quantity/actual_labor_hours,4) end as quantity_per_labor_hour,
  case when is_verified_actual and actual_headcount>0
    then round(actual_verified_quantity/actual_headcount,4) end as quantity_per_worker_day,
  case when is_verified_actual and actual_labor_hours>0
    then round(actual_resource_rai/actual_labor_hours,4) end as rai_per_labor_hour,
  case when is_verified_actual and actual_labor_hours>0
    then round(actual_resource_tree_count/actual_labor_hours,4) end as trees_per_labor_hour,
  case when is_verified_actual and actual_verified_quantity>0
    then round((employee_operational_labor_cost+contractor_operational_cost
      +actual_material_consumption_cost+actual_equipment_cost+actual_machine_vehicle_cost+actual_fuel_cost)
      /actual_verified_quantity,4) end as actual_cost_per_output_unit,
  case when is_verified_actual and block_area_rai>0
    then round((employee_operational_labor_cost+contractor_operational_cost
      +actual_material_consumption_cost+actual_equipment_cost+actual_machine_vehicle_cost+actual_fuel_cost)
      /block_area_rai,4) end as actual_cost_per_rai,
  case when is_verified_actual and block_tree_count>0
    then round((employee_operational_labor_cost+contractor_operational_cost
      +actual_material_consumption_cost+actual_equipment_cost+actual_machine_vehicle_cost+actual_fuel_cost)
      /block_tree_count,4) end as actual_cost_per_tree,
  case
    when result_status in ('draft','submitted') then 'actual_'||result_status
    when is_verified_actual and survey_required and survey_completed_count=0 then 'survey_pending'
    when is_verified_actual then 'verified'
    else 'planned_only'
  end as data_completeness_status
from base;

create or replace view public.v_phase2h_performance_worker
with (security_invoker=true) as
select fact.annual_plan_id,fact.planned_work_item_id,fact.work_order_id,fact.work_order_no,
  fact.work_result_id,fact.result_date,fact.estate_id,fact.block_id,fact.activity_group_id,
  fact.activity_id,fact.activity_code,fact.activity_name,
  coalesce(fact.team_id,worker.team_id,member.team_id) as team_id,
  team_dimension.team_code,team_dimension.team_name,
  worker.id as work_result_worker_id,worker.work_order_labor_requirement_id,
  requirement.source_planned_work_labor_requirement_id,requirement.source_budget_rate_role_id,
  worker.employee_id,employee.employee_code,employee.full_name,
  worker.contractor_id,contractor.contractor_code,contractor.contractor_name,
  case when worker.contractor_id is not null then 'contractor' else 'employee' end as person_type,
  worker.worker_role,worker.attendance_status,worker.actual_hours,worker.actual_quantity,worker.actual_unit,
  public.phase2h_normalize_unit(worker.actual_unit) as actual_unit_basis,
  worker.quantity_allocation_method,worker.is_driver,worker.rate_amount as frozen_rate_amount,
  worker.earning_amount as operational_earning_amount,worker.individual_quality_pct,
  worker.individual_completion_pct,fact.survey_score_pct,fact.finding_count,
  fact.unresolved_finding_count,fact.rework_required,fact.is_verified_actual
from public.v_phase2h_performance_result fact
join public.work_result_workers worker on worker.work_result_id=fact.work_result_id
join public.work_order_labor_requirements requirement on requirement.id=worker.work_order_labor_requirement_id
left join public.employees employee on employee.id=worker.employee_id
left join public.contractors contractor on contractor.id=worker.contractor_id
left join lateral (
  select membership.team_id
  from public.team_members membership
  where membership.employee_id=worker.employee_id and membership.is_active
  order by membership.start_date desc nulls last,membership.id
  limit 1
) member on true
left join public.teams team_dimension
  on team_dimension.id=coalesce(fact.team_id,worker.team_id,member.team_id);

create or replace view public.v_phase2h_performance_material
with (security_invoker=true) as
select fact.annual_plan_id,fact.planned_work_item_id,fact.work_order_id,fact.work_order_no,
  fact.work_result_id,fact.result_date,fact.estate_id,fact.block_id,fact.activity_id,
  material.work_order_material_id,material.source_planned_work_material_id,
  material.material_id,master.material_code,master.material_name,
  material.planned_unit_id,material.planned_unit_name,material.planned_quantity,
  material.issued_quantity,material.actual_quantity as used_quantity,
  material.result_returned_quantity as returned_quantity,material.outstanding_quantity,
  material.difference_quantity as variance_quantity,material.variance_pct,
  material.planned_amount as planned_material_cost,
  material.actual_quantity*coalesce(material.snapshot_unit_cost,0) as actual_material_consumption_cost,
  material.inventory_reconciled,material.variance_status,fact.is_verified_actual
from public.v_phase2h_performance_result fact
join public.v_canonical_result_material_variance material on material.work_result_id=fact.work_result_id
left join public.materials master on master.id=material.material_id;

create or replace view public.v_phase2h_performance_resource
with (security_invoker=true) as
select fact.annual_plan_id,fact.planned_work_item_id,fact.work_order_id,fact.work_order_no,
  fact.work_result_id,fact.result_date,fact.estate_id,fact.block_id,fact.activity_id,
  resource.work_order_resource_requirement_id,resource.source_planned_work_resource_requirement_id,
  resource.resource_type,resource.resource_code,resource.resource_name,resource.quantity_basis,
  resource.assigned_vehicle_id,resource.actual_vehicle_id,vehicle.vehicle_code,vehicle.vehicle_name,
  resource.driver_work_result_worker_id,resource.planned_basis_quantity,resource.actual_basis_quantity,
  resource.planned_hours,resource.actual_hours,resource.planned_km,resource.actual_km,
  resource.planned_rai,resource.actual_rai,resource.planned_ton,resource.actual_quantity,
  resource.planned_resource_cost,resource.actual_resource_cost,resource.resource_cost_variance,
  resource.utilization_variance_pct,resource.variance_status,fact.is_verified_actual
from public.v_phase2h_performance_result fact
join public.v_canonical_result_resource_variance resource on resource.work_result_id=fact.work_result_id
left join public.vehicles vehicle on vehicle.id=resource.actual_vehicle_id;

create or replace view public.v_phase2h_performance_fuel
with (security_invoker=true) as
select fact.annual_plan_id,fact.planned_work_item_id,fact.work_order_id,fact.work_order_no,
  fact.work_result_id,fact.result_date,fact.estate_id,fact.block_id,fact.activity_id,
  fuel.work_order_resource_requirement_id,fuel.work_result_vehicle_usage_id,fuel.vehicle_id,
  vehicle.vehicle_code,vehicle.vehicle_name,fuel.fuel_measurement_basis_snapshot,
  fuel.requires_hour_meter_snapshot,fuel.requires_odometer_snapshot,fuel.primary_kpi,
  fuel.primary_standard_rate,fuel.primary_actual_rate,fuel.primary_variance_pct,
  fuel.actual_liter_per_hour,fuel.actual_km_per_liter,fuel.actual_liter_per_rai,
  fuel.actual_liter_per_ton,fuel.planned_fuel_liters,fuel.issued_fuel_liter,
  fuel.actual_fuel_liters,fuel.actual_fuel_cost,fuel.variance_status,fact.is_verified_actual
from public.v_phase2h_performance_result fact
join public.v_canonical_result_fuel_variance fuel on fuel.work_result_id=fact.work_result_id
left join public.vehicles vehicle on vehicle.id=fuel.vehicle_id;

create or replace view public.v_phase2h_performance_payroll_reconciliation
with (security_invoker=true) as
select summary.id as payroll_summary_id,summary.payroll_period_id,period.period_code,
  period.estate_id,summary.employee_id,employee.employee_code,employee.full_name,
  count(distinct earning.work_result_id)::integer as source_result_count,
  coalesce(sum(worker.earning_amount),0) as operational_labor_cost,
  coalesce(sum(earning.amount),0) as payroll_gross_source_amount,
  summary.gross_amount as payroll_gross_amount,summary.net_amount as payroll_net_amount,
  summary.allowance_amount,summary.deduction_amount,
  coalesce(sum(earning.amount),0)-coalesce(sum(worker.earning_amount),0) as gross_reconciliation_difference,
  case
    when count(distinct earning.work_result_id)=0 then 'missing_source'
    when abs(coalesce(sum(earning.amount),0)-coalesce(sum(worker.earning_amount),0))>0.01 then 'difference'
    when exists(select 1 from public.payroll_team_pool_reconciliations pool
      where pool.payroll_period_id=period.id and pool.status<>'reconciled') then 'review_required'
    else 'matched'
  end as variance_state
from public.payroll_employee_summaries summary
join public.payroll_periods period on period.id=summary.payroll_period_id
join public.employees employee on employee.id=summary.employee_id
left join public.payroll_earning_lines earning on earning.payroll_summary_id=summary.id
left join public.work_result_workers worker on worker.id=earning.work_result_worker_id
group by summary.id,period.id,employee.id;

revoke all on function public.phase2h_normalize_unit(text) from public,anon,authenticated;
grant execute on function public.phase2h_normalize_unit(text) to service_role;

revoke all on public.v_phase2h_performance_result,
  public.v_phase2h_performance_worker,
  public.v_phase2h_performance_material,
  public.v_phase2h_performance_resource,
  public.v_phase2h_performance_fuel,
  public.v_phase2h_performance_payroll_reconciliation
from public,anon,authenticated;
grant select on public.v_phase2h_performance_result,
  public.v_phase2h_performance_worker,
  public.v_phase2h_performance_material,
  public.v_phase2h_performance_resource,
  public.v_phase2h_performance_fuel,
  public.v_phase2h_performance_payroll_reconciliation
to service_role;

comment on view public.v_phase2h_performance_result is
  'Read-only canonical Performance fact. Draft/submitted Results retain status but never contribute verified Actual metrics.';
comment on view public.v_phase2h_performance_payroll_reconciliation is
  'Restricted Payroll reconciliation evidence; Payroll Net is never used as Activity operational cost.';

commit;
