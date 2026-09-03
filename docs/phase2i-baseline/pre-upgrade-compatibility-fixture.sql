-- Phase 2I synthetic pre-upgrade compatibility fixture.
-- Contains no Production identities, IDs, or business transactions.
begin;

insert into public.estates (id, estate_code, estate_name, status)
values ('00000000-0000-4000-8000-000000000001', 'RC01', 'RC Synthetic Estate', 'active')
on conflict do nothing;

insert into public.blocks (
  id, estate_id, block_code, block_name, ap_code, area_rai, tree_count,
  terrain_type, status, note
) values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'RC-B01', 'RC Synthetic Block', 'RC-AP', 10, 1000, 'flat', 'active',
  'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.activities (
  id, activity_code, activity_name, default_unit, work_type,
  require_worker, require_material, require_machine, require_fuel, status
) values (
  '00000000-0000-4000-8000-000000000003',
  'RC01', 'RC Synthetic Activity', 'rai', 'maintenance',
  true, false, false, false, 'active'
) on conflict do nothing;

insert into public.budget_activity_rates (
  id, fiscal_year, rate_code, activity_id, activity_code, activity_name,
  rate_type, block_id, terrain_code, area_rai, tree_count, unit_name,
  calculation_method, rate_amount, effective_from, version_no,
  is_current, approval_status, status, note
) values (
  'phase2i-legacy-budget-rate', '2569', 'RC-RATE-01',
  '00000000-0000-4000-8000-000000000003', 'RC01', 'RC Synthetic Activity',
  'labor', '00000000-0000-4000-8000-000000000002', 'flat', 10, 1000,
  'rai', 'quantity', 125, date '2026-01-01', 1,
  true, 'approved', 'active', 'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.budget_rate_blocks (
  id, budget_rate_id, block_id, terrain_code, block_name, estate_name,
  ap_code, area_rai, tree_count, status, note
) values (
  'phase2i-legacy-budget-rate-block', 'phase2i-legacy-budget-rate',
  '00000000-0000-4000-8000-000000000002', 'flat', 'RC Synthetic Block',
  'RC Synthetic Estate', 'RC-AP', 10, 1000, 'active',
  'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.annual_work_plans (
  id, plan_year, estate_id, plan_name, status, approved_at, note, source_type
) values (
  '00000000-0000-4000-8000-000000000004', 2569,
  '00000000-0000-4000-8000-000000000001',
  'RC Synthetic Legacy Plan', 'approved', timestamptz '2026-08-01 00:00:00+00',
  'PHASE2I_SYNTHETIC_PRE_UPGRADE', 'manual'
) on conflict do nothing;

insert into public.planned_work_items (
  id, annual_plan_id, activity_id, block_id, planned_start_date,
  planned_end_date, target_quantity, target_unit, planned_budget,
  status, note, source_type
) values (
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000002',
  date '2026-08-10', date '2026-08-10', 10, 'rai', 1250,
  'planned', 'PHASE2I_SYNTHETIC_PRE_UPGRADE', 'manual'
) on conflict do nothing;

insert into public.employees (
  id, employee_code, full_name, employee_type, position, daily_wage,
  worker_type, payment_type, status, start_date
) values (
  '00000000-0000-4000-8000-000000000008',
  'RC-EMP-001', 'RC Synthetic Employee', 'employee', 'field_worker', 400,
  'employee', 'daily', 'active', date '2026-01-01'
) on conflict do nothing;

insert into public.vehicles (
  id, vehicle_code, vehicle_name, vehicle_type, status, fuel_type,
  fuel_measurement_basis, standard_liter_per_hour,
  requires_hour_meter, requires_odometer, note
) values (
  '00000000-0000-4000-8000-00000000000e',
  'RC-VEH-001', 'RC Synthetic Tractor', 'tractor', 'active', 'diesel',
  'engine_hours', 4, true, false, 'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.work_orders (
  id, work_order_no, planned_work_item_id, estate_id, activity_id, block_id,
  scheduled_date, status, planned_quantity, planned_unit,
  planned_labor_cost, planned_total_cost, note, workflow_source
) values (
  '00000000-0000-4000-8000-000000000006', 'RC-WO-LEGACY-001',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000002',
  date '2026-08-10', 'completed', 10, 'rai', 400, 400,
  'PHASE2I_SYNTHETIC_PRE_UPGRADE', 'direct'
) on conflict do nothing;

insert into public.work_results (
  id, work_order_id, actual_start_at, actual_end_at, actual_quantity,
  actual_unit, result_status, result_no, result_date, source_type,
  quality_score, verified_at, actual_area_rai, worker_count,
  total_labor_hours, completion_pct, note
) values (
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000006',
  timestamptz '2026-08-10 01:00:00+00', timestamptz '2026-08-10 09:00:00+00',
  10, 'rai', 'verified', 'RC-RESULT-LEGACY-001', date '2026-08-10',
  'manual', 90, timestamptz '2026-08-10 10:00:00+00', 10, 1, 8, 100,
  'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.work_result_workers (
  id, work_result_id, employee_id, work_date, worker_role,
  attendance_status, actual_hours, actual_quantity, actual_unit,
  rate_type, rate_amount, earning_amount, individual_quality_pct,
  individual_completion_pct, note
) values (
  '00000000-0000-4000-8000-000000000009',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008', date '2026-08-10',
  'field_worker', 'present', 8, 10, 'rai', 'daily', 400, 400, 90, 100,
  'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.units (id, unit_code, unit_name, status)
values ('00000000-0000-4000-8000-00000000000a', 'RC-KG', 'RC Synthetic Kilogram', 'active')
on conflict do nothing;

insert into public.materials (
  id, material_code, material_name, base_unit_id, status
) values (
  '00000000-0000-4000-8000-00000000000b', 'RC-MAT-001',
  'RC Synthetic Material', '00000000-0000-4000-8000-00000000000a',
  'active'
) on conflict do nothing;

insert into public.warehouses (id, warehouse_code, warehouse_name, status)
values (
  '00000000-0000-4000-8000-00000000000c', 'RC-WH-001',
  'RC Synthetic Warehouse', 'active'
) on conflict do nothing;

insert into public.stock_balances (
  id, warehouse_id, material_id, quantity_on_hand, unit_id, last_count_date
) values (
  '00000000-0000-4000-8000-00000000000d',
  '00000000-0000-4000-8000-00000000000c',
  '00000000-0000-4000-8000-00000000000b', 50,
  '00000000-0000-4000-8000-00000000000a', date '2026-08-01'
) on conflict do nothing;

insert into public.survey_templates (
  id, template_code, template_name, activity_id, status, survey_scope,
  minimum_pass_pct, effective_from, note
) values (
  '00000000-0000-4000-8000-00000000000f', 'RC-SURVEY-001',
  'RC Synthetic Survey', '00000000-0000-4000-8000-000000000003',
  'active', 'work_result', 80, date '2026-01-01',
  'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.survey_responses (
  id, response_no, template_id, survey_scope, work_order_id, work_result_id,
  employee_id, vehicle_id, block_id, response_date, status,
  score_total, score_max, score_pct, pass_status, data_quality_pct,
  context_snapshot, remarks
) values (
  '00000000-0000-4000-8000-000000000010', 'RC-SR-LEGACY-001',
  '00000000-0000-4000-8000-00000000000f', 'work_result',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-00000000000e',
  '00000000-0000-4000-8000-000000000002', date '2026-08-10',
  'verified', 9, 10, 90, 'passed', 100,
  '{"fixture":"phase2i","synthetic":true}'::jsonb,
  'PHASE2I_SYNTHETIC_PRE_UPGRADE'
) on conflict do nothing;

insert into public.survey_findings (
  id, finding_no, response_id, finding_code, severity, finding_type,
  description, status
) values (
  '00000000-0000-4000-8000-000000000011', 'RC-FINDING-LEGACY-001',
  '00000000-0000-4000-8000-000000000010', 'RC-NC-001', 'low',
  'non_compliance', 'RC synthetic resolved observation', 'resolved'
) on conflict do nothing;

insert into public.payroll_periods (
  id, period_code, period_name, start_date, end_date, status,
  calculation_version, configuration_json
) values (
  '00000000-0000-4000-8000-000000000012', 'RC-PAY-2026-08',
  'RC Synthetic August 2026', date '2026-08-01', date '2026-08-31',
  'calculated', 1, '{"fixture":"phase2i","synthetic":true}'::jsonb
) on conflict do nothing;

insert into public.payroll_employee_summaries (
  id, payroll_period_id, employee_id, regular_earning, gross_amount,
  net_amount, status, calculated_at
) values (
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000008', 400, 400, 400,
  'calculated', timestamptz '2026-08-31 00:00:00+00'
) on conflict do nothing;

insert into public.payroll_earning_lines (
  id, payroll_summary_id, work_result_worker_id, work_result_id,
  earning_type, work_date, work_order_no, activity_code, quantity,
  unit, rate, amount, source_snapshot, status
) values (
  '00000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000009',
  '00000000-0000-4000-8000-000000000007',
  'daily', date '2026-08-10', 'RC-WO-LEGACY-001', 'RC01', 1,
  'day', 400, 400, '{"fixture":"phase2i","synthetic":true}'::jsonb,
  'calculated'
) on conflict do nothing;

do $phase2i_fixture_assert$
begin
  if not exists (select 1 from public.estates where id='00000000-0000-4000-8000-000000000001')
    or not exists (select 1 from public.blocks where id='00000000-0000-4000-8000-000000000002')
    or not exists (select 1 from public.activities where id='00000000-0000-4000-8000-000000000003')
    or not exists (select 1 from public.budget_activity_rates where id='phase2i-legacy-budget-rate')
    or not exists (select 1 from public.budget_rate_blocks where id='phase2i-legacy-budget-rate-block')
    or not exists (select 1 from public.annual_work_plans where id='00000000-0000-4000-8000-000000000004')
    or not exists (select 1 from public.planned_work_items where id='00000000-0000-4000-8000-000000000005')
    or not exists (select 1 from public.work_orders where id='00000000-0000-4000-8000-000000000006')
    or not exists (select 1 from public.work_results where id='00000000-0000-4000-8000-000000000007')
    or not exists (select 1 from public.work_result_workers where id='00000000-0000-4000-8000-000000000009')
    or not exists (select 1 from public.stock_balances where id='00000000-0000-4000-8000-00000000000d')
    or not exists (select 1 from public.survey_responses where id='00000000-0000-4000-8000-000000000010')
    or not exists (select 1 from public.survey_findings where id='00000000-0000-4000-8000-000000000011')
    or not exists (select 1 from public.payroll_periods where id='00000000-0000-4000-8000-000000000012')
    or not exists (select 1 from public.payroll_earning_lines where id='00000000-0000-4000-8000-000000000014')
    or not exists (select 1 from public.vehicles where id='00000000-0000-4000-8000-00000000000e') then
    raise exception 'PHASE2I_SYNTHETIC_COMPATIBILITY_FIXTURE_INCOMPLETE';
  end if;
end
$phase2i_fixture_assert$;

commit;
