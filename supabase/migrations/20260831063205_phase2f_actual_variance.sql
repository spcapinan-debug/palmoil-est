-- Phase 2F: canonical Actual / Variance read model.
-- Additive only. Frozen Planning/Work Order snapshots, legacy Daily Result,
-- Inventory, Survey, Performance, Payroll, and transport workflows are not mutated.
begin;

-- Vehicle Master owns the operational meter contract. These columns already
-- exist in some environments; IF NOT EXISTS keeps this branch replay-safe.
alter table public.vehicles
  add column if not exists fuel_measurement_basis text not null default 'engine_hours',
  add column if not exists requires_hour_meter boolean not null default false,
  add column if not exists requires_odometer boolean not null default false,
  add column if not exists standard_liter_per_hour numeric,
  add column if not exists standard_km_per_liter numeric,
  add column if not exists standard_liter_per_rai numeric,
  add column if not exists standard_liter_per_ton numeric;

alter table public.work_result_vehicle_usage
  add column if not exists fuel_measurement_basis_snapshot text,
  add column if not exists requires_hour_meter_snapshot boolean not null default false,
  add column if not exists requires_odometer_snapshot boolean not null default false,
  add column if not exists actual_weight_ton numeric not null default 0;

do $phase2f_constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'vehicles_phase2f_fuel_measurement_basis'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles add constraint vehicles_phase2f_fuel_measurement_basis
      check (fuel_measurement_basis in ('engine_hours', 'distance_km')) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'work_result_vehicle_usage_phase2f_measurement_basis'
      and conrelid = 'public.work_result_vehicle_usage'::regclass
  ) then
    alter table public.work_result_vehicle_usage
      add constraint work_result_vehicle_usage_phase2f_measurement_basis
      check (
        fuel_measurement_basis_snapshot is null
        or fuel_measurement_basis_snapshot in ('engine_hours', 'distance_km')
      ) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'work_result_vehicle_usage_phase2f_actual_weight_nonnegative'
      and conrelid = 'public.work_result_vehicle_usage'::regclass
  ) then
    alter table public.work_result_vehicle_usage
      add constraint work_result_vehicle_usage_phase2f_actual_weight_nonnegative
      check (actual_weight_ton >= 0) not valid;
  end if;
end
$phase2f_constraints$;

create or replace function public.guard_phase2f_vehicle_measurement_snapshot()
returns trigger
language plpgsql security invoker set search_path = ''
as $phase2f_vehicle_measurement_guard$
declare
  v_canonical boolean;
  v_basis text;
  v_requires_hour boolean;
  v_requires_odometer boolean;
begin
  select wo.workflow_source = 'canonical_planning' into v_canonical
  from public.work_orders wo where wo.id = new.work_order_id;
  if not coalesce(v_canonical, false) then return new; end if;

  if tg_op = 'INSERT' then
    select vehicle.fuel_measurement_basis,
      vehicle.requires_hour_meter,
      vehicle.requires_odometer
    into v_basis, v_requires_hour, v_requires_odometer
    from public.vehicles vehicle where vehicle.id = new.vehicle_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'WORK_RESULT_VEHICLE_NOT_ASSIGNED';
    end if;
    new.fuel_measurement_basis_snapshot := v_basis;
    new.requires_hour_meter_snapshot := coalesce(v_requires_hour, false);
    new.requires_odometer_snapshot := coalesce(v_requires_odometer, false);
  elsif new.fuel_measurement_basis_snapshot is distinct from old.fuel_measurement_basis_snapshot
    or new.requires_hour_meter_snapshot is distinct from old.requires_hour_meter_snapshot
    or new.requires_odometer_snapshot is distinct from old.requires_odometer_snapshot
  then
    raise exception using errcode = 'P0001',
      message = 'WORK_RESULT_VEHICLE_MEASUREMENT_SNAPSHOT_FROZEN';
  end if;

  if (new.start_hour_meter is null) <> (new.end_hour_meter is null)
    or (new.start_odometer is null) <> (new.end_odometer is null)
    or (new.start_hour_meter is not null and new.end_hour_meter < new.start_hour_meter)
    or (new.start_odometer is not null and new.end_odometer < new.start_odometer)
  then
    raise exception using errcode = 'P0001', message = 'WORK_RESULT_RESOURCE_METER_INVALID';
  end if;
  if new.start_hour_meter is not null then
    new.engine_hours := round(new.end_hour_meter - new.start_hour_meter, 3);
  end if;
  if new.start_odometer is not null then
    new.distance_km := round(new.end_odometer - new.start_odometer, 3);
  end if;
  if coalesce(new.actual_weight_ton, 0) < 0 then
    raise exception using errcode = 'P0001', message = 'WORK_RESULT_RESOURCE_ACTUAL_NEGATIVE';
  end if;
  return new;
end
$phase2f_vehicle_measurement_guard$;

drop trigger if exists guard_phase2f_vehicle_measurement_snapshot
  on public.work_result_vehicle_usage;
create trigger guard_phase2f_vehicle_measurement_snapshot
before insert or update on public.work_result_vehicle_usage for each row
execute function public.guard_phase2f_vehicle_measurement_snapshot();

create or replace function public.phase2f_validate_vehicle_measurements(p_result_id uuid)
returns void
language plpgsql security invoker set search_path = ''
as $phase2f_validate_vehicle_measurements$
begin
  if exists (
    select 1 from public.work_result_vehicle_usage usage
    where usage.work_result_id = p_result_id
      and usage.requires_hour_meter_snapshot
      and (usage.start_hour_meter is null or usage.end_hour_meter is null)
  ) then
    raise exception using errcode = 'P0001', message = 'WORK_RESULT_HOUR_METER_REQUIRED';
  end if;
  if exists (
    select 1 from public.work_result_vehicle_usage usage
    where usage.work_result_id = p_result_id
      and usage.requires_odometer_snapshot
      and (usage.start_odometer is null or usage.end_odometer is null)
  ) then
    raise exception using errcode = 'P0001', message = 'WORK_RESULT_ODOMETER_REQUIRED';
  end if;
end
$phase2f_validate_vehicle_measurements$;

create or replace function public.guard_phase2f_result_vehicle_measurements()
returns trigger
language plpgsql security invoker set search_path = ''
as $phase2f_result_vehicle_measurements$
begin
  if new.workflow_source = 'canonical_work_order'
    and new.result_status is distinct from old.result_status
    and new.result_status in ('submitted', 'verified', 'closed')
  then
    perform public.phase2f_validate_vehicle_measurements(new.id);
  end if;
  return new;
end
$phase2f_result_vehicle_measurements$;

drop trigger if exists guard_phase2f_result_vehicle_measurements on public.work_results;
create trigger guard_phase2f_result_vehicle_measurements
before update on public.work_results for each row
execute function public.guard_phase2f_result_vehicle_measurements();

create or replace function public.save_canonical_work_result_draft_phase2f(
  p_result_id uuid,
  p_actor_profile_id uuid,
  p_header jsonb default '{}'::jsonb,
  p_workers jsonb default '[]'::jsonb,
  p_vehicles jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $phase2f_save_result$
declare
  v_saved jsonb;
  v_row jsonb;
begin
  v_saved := public.save_canonical_work_result_draft(
    p_result_id, p_actor_profile_id, p_header, p_workers, p_vehicles
  );
  perform set_config('app.phase2e_daily_action', 'on', true);
  for v_row in select value from jsonb_array_elements(coalesce(p_vehicles, '[]'::jsonb))
  loop
    update public.work_result_vehicle_usage
    set actual_weight_ton = greatest(
          coalesce(nullif(v_row->>'actual_weight_ton', '')::numeric, 0), 0
        ),
        fuel_variance_pct = public.phase2e_fuel_variance_pct(
          fuel_metric_basis_snapshot, fuel_standard_rate_snapshot,
          allocated_fuel_liter, engine_hours, distance_km, actual_area_rai,
          greatest(coalesce(nullif(v_row->>'actual_weight_ton', '')::numeric, 0), 0)
        ),
        updated_at = transaction_timestamp()
    where work_result_id = p_result_id
      and work_order_resource_requirement_id =
        nullif(v_row->>'work_order_resource_requirement_id', '')::uuid;
  end loop;
  update public.work_results result
  set fuel_efficiency_pct = (
        select round(avg(100 - usage.fuel_variance_pct), 2)
        from public.work_result_vehicle_usage usage
        where usage.work_result_id = result.id
          and usage.fuel_variance_pct is not null
      ),
      updated_at = transaction_timestamp()
  where result.id = p_result_id;
  perform set_config('app.phase2e_daily_action', 'off', true);
  return v_saved;
end
$phase2f_save_result$;

create or replace function public.phase2f_variance_pct(
  p_planned numeric,
  p_actual numeric
) returns numeric
language sql immutable security invoker set search_path = ''
as $phase2f_variance_pct$
  select case
    when p_planned is null or p_actual is null or p_planned = 0 then null
    else round(((p_actual - p_planned) / p_planned) * 100, 4)
  end;
$phase2f_variance_pct$;

create or replace function public.phase2f_variance_status(
  p_planned numeric,
  p_actual numeric,
  p_complete boolean default true
) returns text
language sql immutable security invoker set search_path = ''
as $phase2f_variance_status$
  select case
    when not coalesce(p_complete, false) or p_planned is null or p_actual is null then 'incomplete'
    when abs(p_actual - p_planned) <= 0.000001 then 'on_plan'
    when p_actual > p_planned then 'over'
    else 'under'
  end;
$phase2f_variance_status$;

create or replace view public.v_canonical_result_material_variance
with (security_invoker = true)
as
with raw as (
  select
    result.id as work_result_id,
    result.work_order_id,
    result.result_date,
    result.result_status,
    work_order.planned_work_item_id,
    planned.annual_plan_id,
    material.id as work_order_material_id,
    material.source_planned_work_material_id,
    planned_material.source_budget_rate_block_material_id,
    material.material_id,
    material.unit_id as planned_unit_id,
    unit.unit_name as planned_unit_name,
    material_master.base_unit_id,
    base_unit.unit_name as base_unit_name,
    coalesce(
      planned_material.snapshot_usage_rate * planned_material.snapshot_basis_quantity,
      planned_material.planned_quantity,
      material.planned_quantity
    ) as budget_quantity_snapshot,
    material.planned_quantity,
    material.snapshot_usage_basis,
    material.snapshot_usage_rate,
    material.snapshot_basis_quantity,
    material.snapshot_unit_cost,
    material.planned_amount,
    material.snapshot_at,
    coalesce(activity.require_material, false) as material_required,
    coalesce(issue.issued_quantity, 0) as issued_quantity,
    issue.issue_unit_ids,
    issue.issue_units,
    issue.conversion_snapshots,
    coalesce(issue.conversion_complete, true) as issue_conversion_complete,
    coalesce(result_use.actual_quantity, 0) as actual_quantity,
    coalesce(cumulative_use.actual_quantity, 0) as cumulative_actual_quantity,
    coalesce(result_return.returned_quantity, 0) as result_returned_quantity,
    coalesce(cumulative_return.returned_quantity, 0) as returned_quantity
  from public.work_results result
  join public.work_orders work_order on work_order.id = result.work_order_id
  join public.planned_work_items planned on planned.id = work_order.planned_work_item_id
  join public.work_order_materials material on material.work_order_id = work_order.id
  left join public.planned_work_materials planned_material
    on planned_material.id = material.source_planned_work_material_id
  join public.materials material_master on material_master.id = material.material_id
  left join public.units unit on unit.id = material.unit_id
  left join public.units base_unit on base_unit.id = material_master.base_unit_id
  left join public.activities activity on activity.id = work_order.activity_id
  left join lateral (
    select
      coalesce(sum(
        issue_line.quantity * public.material_conversion_rate(
          issue_line.material_id, issue_line.unit_id, material.unit_id
        )
      ), 0) as issued_quantity,
      array_agg(distinct issue_line.unit_id) as issue_unit_ids,
      array_agg(distinct issue_unit.unit_name) as issue_units,
      jsonb_agg(jsonb_build_object(
        'goods_issue_id', issue_header.id,
        'goods_issue_line_id', issue_line.id,
        'issue_unit_id', issue_line.unit_id,
        'requested_quantity', issue_line.requested_quantity,
        'requested_unit_id', issue_line.requested_unit_id,
        'base_quantity', issue_line.base_quantity,
        'base_unit_id', issue_line.base_unit_id,
        'conversion_rate_snapshot', issue_line.conversion_rate_snapshot,
        'rounding_difference', issue_line.rounding_difference
      ) order by issue_header.issue_date, issue_line.id) as conversion_snapshots,
      bool_and(public.material_conversion_rate(
        issue_line.material_id, issue_line.unit_id, material.unit_id
      ) is not null) as conversion_complete
    from public.goods_issues issue_header
    join public.goods_issue_lines issue_line on issue_line.issue_id = issue_header.id
    left join public.units issue_unit on issue_unit.id = issue_line.unit_id
    where issue_header.work_order_id = work_order.id
      and issue_header.status = 'posted'
      and issue_line.material_id = material.material_id
  ) issue on true
  left join lateral (
    select coalesce(sum(
      usage.quantity * public.material_conversion_rate(
        usage.material_id, usage.unit_id, material.unit_id
      )
    ), 0) as actual_quantity
    from public.goods_issue_daily_usage usage
    where usage.work_result_id = result.id
      and usage.material_id = material.material_id
      and usage.status = 'posted'
  ) result_use on true
  left join lateral (
    select coalesce(sum(
      usage.quantity * public.material_conversion_rate(
        usage.material_id, usage.unit_id, material.unit_id
      )
    ), 0) as actual_quantity
    from public.goods_issue_daily_usage usage
    where usage.work_order_id = work_order.id
      and usage.material_id = material.material_id
      and usage.status = 'posted'
  ) cumulative_use on true
  left join lateral (
    select coalesce(sum(
      return_line.quantity * public.material_conversion_rate(
        return_line.material_id, return_line.unit_id, material.unit_id
      )
    ), 0) as returned_quantity
    from public.goods_returns return_header
    join public.goods_return_lines return_line on return_line.return_id = return_header.id
    where return_header.work_result_id = result.id
      and return_header.status = 'posted'
      and return_line.material_id = material.material_id
  ) result_return on true
  left join lateral (
    select coalesce(sum(
      return_line.quantity * public.material_conversion_rate(
        return_line.material_id, return_line.unit_id, material.unit_id
      )
    ), 0) as returned_quantity
    from public.goods_returns return_header
    join public.goods_return_lines return_line on return_line.return_id = return_header.id
    where return_header.work_order_id = work_order.id
      and return_header.status = 'posted'
      and return_line.material_id = material.material_id
  ) cumulative_return on true
  where work_order.workflow_source = 'canonical_planning'
    and result.workflow_source = 'canonical_work_order'
), calculated as (
  select raw.*,
    greatest(issued_quantity - cumulative_actual_quantity - returned_quantity, 0)
      as outstanding_quantity
  from raw
)
select
  calculated.*,
  cumulative_actual_quantity - planned_quantity as difference_quantity,
  public.phase2f_variance_pct(planned_quantity, cumulative_actual_quantity)
    as variance_pct,
  issued_quantity - cumulative_actual_quantity - returned_quantity - outstanding_quantity
    as reconciliation_difference,
  abs(issued_quantity - cumulative_actual_quantity - returned_quantity - outstanding_quantity)
      <= 0.000001
    and issue_conversion_complete as inventory_reconciled,
  public.phase2f_variance_status(
    planned_quantity,
    cumulative_actual_quantity,
    issue_conversion_complete
      and abs(issued_quantity - cumulative_actual_quantity - returned_quantity - outstanding_quantity)
        <= 0.000001
      and (not material_required or actual_quantity > 0)
  ) as variance_status
from calculated;

create or replace view public.v_canonical_result_labor_variance
with (security_invoker = true)
as
select
  result.id as work_result_id,
  result.work_order_id,
  result.result_date,
  result.result_status,
  work_order.planned_work_item_id,
  requirement.id as work_order_labor_requirement_id,
  requirement.source_planned_work_labor_requirement_id,
  requirement.source_budget_rate_role_id,
  requirement.source_budget_activity_rate_id,
  requirement.role_position,
  requirement.worker_group_name,
  requirement.rate_amount as frozen_rate_amount,
  requirement.uom as frozen_rate_uom,
  requirement.calculation_method,
  requirement.rate_basis,
  requirement.rate_category,
  requirement.payee_type,
  requirement.affects_payroll,
  requirement.snapshot_at as frozen_rate_snapshot_at,
  requirement.planned_headcount,
  actual.actual_headcount,
  requirement.planned_headcount - actual.actual_headcount as headcount_variance,
  requirement.planned_basis_quantity as planned_quantity,
  actual.actual_quantity,
  actual.actual_quantity - requirement.planned_basis_quantity as quantity_variance,
  coalesce(nullif(assignment.planned_hours, 0),
    case when requirement.rate_basis = 'hour_count'
      then requirement.planned_basis_quantity else 0 end) as planned_hours,
  actual.actual_hours,
  actual.actual_hours - coalesce(nullif(assignment.planned_hours, 0),
    case when requirement.rate_basis = 'hour_count'
      then requirement.planned_basis_quantity else 0 end) as hours_variance,
  requirement.planned_amount as planned_cost,
  actual.actual_earning as actual_cost,
  actual.actual_earning - requirement.planned_amount as cost_variance,
  public.phase2f_variance_pct(requirement.planned_amount, actual.actual_earning)
    as cost_variance_pct,
  actual.allocation_methods,
  actual.employee_count,
  actual.contractor_count,
  actual.driver_count,
  actual.frozen_rate_reconciled,
  public.phase2f_variance_status(
    requirement.planned_basis_quantity,
    actual.actual_quantity,
    actual.actual_headcount > 0 and actual.frozen_rate_reconciled
  ) as variance_status
from public.work_results result
join public.work_orders work_order on work_order.id = result.work_order_id
join public.work_order_labor_requirements requirement
  on requirement.work_order_id = work_order.id
left join lateral (
  select coalesce(sum(worker_assignment.planned_hours), 0) as planned_hours
  from public.work_order_workers worker_assignment
  where worker_assignment.work_order_id = work_order.id
    and worker_assignment.work_order_labor_requirement_id = requirement.id
    and worker_assignment.status <> 'cancelled'
) assignment on true
left join lateral (
  select
    count(*) filter (where public.phase2e_is_present(worker.attendance_status))::numeric
      as actual_headcount,
    count(*) filter (where worker.employee_id is not null)::integer as employee_count,
    count(*) filter (where worker.contractor_id is not null)::integer as contractor_count,
    count(*) filter (where worker.is_driver)::integer as driver_count,
    coalesce(sum(worker.actual_quantity)
      filter (where public.phase2e_is_present(worker.attendance_status)), 0) as actual_quantity,
    coalesce(sum(worker.actual_hours)
      filter (where public.phase2e_is_present(worker.attendance_status)), 0) as actual_hours,
    coalesce(sum(worker.earning_amount), 0) as actual_earning,
    array_agg(distinct worker.quantity_allocation_method)
      filter (where worker.quantity_allocation_method is not null) as allocation_methods,
    coalesce(bool_and(
      worker.rate_amount = requirement.rate_amount
      and worker.work_order_labor_requirement_id = requirement.id
    ), true) as frozen_rate_reconciled
  from public.work_result_workers worker
  where worker.work_result_id = result.id
    and worker.work_order_labor_requirement_id = requirement.id
) actual on true
where work_order.workflow_source = 'canonical_planning'
  and result.workflow_source = 'canonical_work_order';

create or replace view public.v_canonical_result_resource_variance
with (security_invoker = true)
as
with raw as (
  select
    result.id as work_result_id,
    result.work_order_id,
    result.result_date,
    result.result_status,
    work_order.planned_work_item_id,
    requirement.id as work_order_resource_requirement_id,
    requirement.source_planned_work_resource_requirement_id,
    requirement.source_budget_resource_requirement_id,
    requirement.source_budget_activity_rate_id,
    requirement.resource_type,
    requirement.resource_code,
    requirement.resource_name,
    requirement.quantity_basis,
    requirement.preferred_vehicle_id,
    requirement.preferred_vehicle_type,
    assignment.id as work_order_resource_assignment_id,
    assignment.selected_vehicle_id as assigned_vehicle_id,
    usage.id as work_result_vehicle_usage_id,
    usage.vehicle_id as actual_vehicle_id,
    usage.driver_work_result_worker_id,
    usage.start_at,
    usage.end_at,
    coalesce(assignment.planned_quantity, requirement.planned_quantity) as planned_quantity,
    coalesce(assignment.planned_hours, requirement.planned_hours) as planned_hours,
    coalesce(assignment.planned_km, requirement.planned_km) as planned_km,
    coalesce(assignment.planned_rai, requirement.planned_rai) as planned_rai,
    coalesce(assignment.planned_ton, requirement.planned_ton) as planned_ton,
    usage.actual_quantity,
    usage.actual_unit,
    usage.working_hours as actual_hours,
    usage.engine_hours,
    usage.distance_km as actual_km,
    usage.actual_area_rai as actual_rai,
    usage.actual_tree_count,
    requirement.resource_rate_amount as frozen_resource_rate,
    requirement.resource_rate_uom,
    requirement.calculation_method,
    requirement.planned_resource_cost,
    requirement.snapshot_at,
    case requirement.quantity_basis
      when 'hour' then coalesce(assignment.planned_hours, requirement.planned_hours)
      when 'km' then coalesce(assignment.planned_km, requirement.planned_km)
      when 'rai' then coalesce(assignment.planned_rai, requirement.planned_rai)
      when 'ton' then coalesce(assignment.planned_ton, requirement.planned_ton)
      else coalesce(assignment.planned_quantity, requirement.planned_quantity)
    end as planned_basis_quantity,
    case requirement.quantity_basis
      when 'hour' then usage.working_hours
      when 'km' then usage.distance_km
      when 'rai' then usage.actual_area_rai
      when 'ton' then usage.actual_quantity
      else usage.actual_quantity
    end as actual_basis_quantity
  from public.work_results result
  join public.work_orders work_order on work_order.id = result.work_order_id
  join public.work_order_resource_requirements requirement
    on requirement.work_order_id = work_order.id
  left join public.work_order_resource_assignments assignment
    on assignment.work_order_resource_requirement_id = requirement.id
  left join public.work_result_vehicle_usage usage
    on usage.work_result_id = result.id
    and usage.work_order_resource_requirement_id = requirement.id
  where work_order.workflow_source = 'canonical_planning'
    and result.workflow_source = 'canonical_work_order'
)
select
  raw.*,
  actual_basis_quantity - planned_basis_quantity as basis_difference,
  public.phase2f_variance_pct(planned_basis_quantity, actual_basis_quantity)
    as utilization_variance_pct,
  coalesce(actual_basis_quantity, 0) * coalesce(frozen_resource_rate, 0)
    as actual_resource_cost,
  coalesce(actual_basis_quantity, 0) * coalesce(frozen_resource_rate, 0)
    - planned_resource_cost as resource_cost_variance,
  public.phase2f_variance_status(
    planned_basis_quantity, actual_basis_quantity, work_result_vehicle_usage_id is not null
  ) as variance_status
from raw;

create or replace view public.v_canonical_result_fuel_variance
with (security_invoker = true)
as
with raw as (
  select
    result.id as work_result_id,
    result.work_order_id,
    result.result_date,
    result.result_status,
    requirement.id as work_order_resource_requirement_id,
    requirement.source_planned_work_resource_requirement_id,
    requirement.source_budget_resource_requirement_id,
    usage.work_order_resource_assignment_id,
    usage.id as work_result_vehicle_usage_id,
    usage.vehicle_id,
    usage.driver_work_result_worker_id,
    requirement.fuel_required,
    usage.fuel_measurement_basis_snapshot,
    usage.requires_hour_meter_snapshot,
    usage.requires_odometer_snapshot,
    usage.fuel_metric_basis_snapshot,
    usage.fuel_standard_rate_snapshot,
    usage.planned_fuel_liters_snapshot as planned_fuel_liters,
    usage.issued_fuel_liter,
    usage.allocated_fuel_liter as actual_fuel_liters,
    usage.fuel_unit_cost_snapshot,
    usage.fuel_cost_amount as actual_fuel_cost,
    usage.engine_hours,
    usage.working_hours,
    usage.distance_km,
    usage.actual_area_rai,
    usage.actual_weight_ton,
    coalesce(activity.require_fuel, false) as activity_requires_fuel,
    case usage.fuel_metric_basis_snapshot
      when 'L/hour' then usage.fuel_standard_rate_snapshot * usage.engine_hours
      when 'km/L' then case when usage.fuel_standard_rate_snapshot > 0
        then usage.distance_km / usage.fuel_standard_rate_snapshot end
      when 'L/rai' then usage.fuel_standard_rate_snapshot * usage.actual_area_rai
      when 'L/ton' then usage.fuel_standard_rate_snapshot * usage.actual_weight_ton
    end as standard_expected_fuel_liters
  from public.work_results result
  join public.work_orders work_order on work_order.id = result.work_order_id
  join public.work_order_resource_requirements requirement
    on requirement.work_order_id = work_order.id
  left join public.activities activity on activity.id = work_order.activity_id
  left join public.work_result_vehicle_usage usage
    on usage.work_result_id = result.id
    and usage.work_order_resource_requirement_id = requirement.id
  where work_order.workflow_source = 'canonical_planning'
    and result.workflow_source = 'canonical_work_order'
    and (
      requirement.fuel_required
      or requirement.resource_type = 'fuel'
      or requirement.planned_fuel_liters > 0
    )
), metrics as (
  select raw.*,
    case fuel_measurement_basis_snapshot
      when 'engine_hours' then 'L/hour'
      when 'distance_km' then 'km/L'
    end as primary_kpi,
    case when engine_hours > 0 then round(actual_fuel_liters / engine_hours, 4) end
      as actual_liter_per_hour,
    case when distance_km > 0 then round(actual_fuel_liters / distance_km, 4) end
      as actual_liter_per_km,
    case when actual_fuel_liters > 0 then round(distance_km / actual_fuel_liters, 4) end
      as actual_km_per_liter,
    case when actual_area_rai > 0 then round(actual_fuel_liters / actual_area_rai, 4) end
      as actual_liter_per_rai,
    case when actual_weight_ton > 0
      then round(actual_fuel_liters / actual_weight_ton, 4) end
      as actual_liter_per_ton
  from raw
), expected as (
  select metrics.*,
    coalesce(standard_expected_fuel_liters, nullif(planned_fuel_liters, 0))
      as expected_fuel_liters,
    case
      when primary_kpi = fuel_metric_basis_snapshot then fuel_standard_rate_snapshot
    end as primary_standard_rate,
    case primary_kpi
      when 'L/hour' then actual_liter_per_hour
      when 'km/L' then actual_km_per_liter
    end as primary_actual_rate
  from metrics
), compared as (
  select expected.*,
    public.phase2e_fuel_variance_pct(
      primary_kpi, primary_standard_rate, actual_fuel_liters,
      engine_hours, distance_km, actual_area_rai, actual_weight_ton
    ) as primary_variance_pct
  from expected
)
select
  compared.*,
  case
    when primary_actual_rate is null or primary_standard_rate is null then 'incomplete'
    when abs(primary_variance_pct) <= 0.000001 then 'on_plan'
    when primary_variance_pct > 0 then 'over'
    else 'under'
  end as primary_variance_status,
  case when expected_fuel_liters is null then null
    else actual_fuel_liters - expected_fuel_liters end as fuel_difference_liters,
  public.phase2f_variance_pct(expected_fuel_liters, actual_fuel_liters)
    as variance_pct,
  public.phase2f_variance_status(
    expected_fuel_liters,
    actual_fuel_liters,
    work_result_vehicle_usage_id is not null
      and (not activity_requires_fuel or actual_fuel_liters > 0)
      and expected_fuel_liters is not null
  ) as variance_status,
  case when expected_fuel_liters is null then 'actual_only'
    when standard_expected_fuel_liters is not null then 'frozen_standard'
    else 'planned_fuel_snapshot' end as expected_source
from compared;

create or replace view public.v_canonical_result_variance_summary
with (security_invoker = true)
as
with line_summary as (
  select work_result_id, work_order_id, result_date, 'labor'::text as category,
    count(*)::integer as line_count,
    sum(planned_cost) as planned_value,
    sum(actual_cost) as actual_value,
    count(*) filter (where variance_status = 'incomplete')::integer as incomplete_count,
    count(*) filter (where variance_status = 'over')::integer as over_count,
    count(*) filter (where variance_status = 'under')::integer as under_count
  from public.v_canonical_result_labor_variance
  group by work_result_id, work_order_id, result_date
  union all
  select work_result_id, work_order_id, result_date, 'material',
    count(*)::integer,
    sum(planned_amount),
    sum(cumulative_actual_quantity * coalesce(snapshot_unit_cost, 0)),
    count(*) filter (where variance_status = 'incomplete')::integer,
    count(*) filter (where variance_status = 'over')::integer,
    count(*) filter (where variance_status = 'under')::integer
  from public.v_canonical_result_material_variance
  group by work_result_id, work_order_id, result_date
  union all
  select work_result_id, work_order_id, result_date, 'equipment',
    count(*)::integer,
    sum(planned_resource_cost),
    sum(actual_resource_cost),
    count(*) filter (where variance_status = 'incomplete')::integer,
    count(*) filter (where variance_status = 'over')::integer,
    count(*) filter (where variance_status = 'under')::integer
  from public.v_canonical_result_resource_variance
  where resource_type <> 'fuel'
  group by work_result_id, work_order_id, result_date
  union all
  select work_result_id, work_order_id, result_date, 'fuel',
    count(*)::integer,
    sum(planned_fuel_liters * coalesce(fuel_unit_cost_snapshot, 0)),
    sum(actual_fuel_cost),
    count(*) filter (where variance_status = 'incomplete')::integer,
    count(*) filter (where variance_status = 'over')::integer,
    count(*) filter (where variance_status = 'under')::integer
  from public.v_canonical_result_fuel_variance
  group by work_result_id, work_order_id, result_date
)
select
  line_summary.*,
  actual_value - planned_value as difference_value,
  public.phase2f_variance_pct(planned_value, actual_value) as variance_pct,
  case
    when incomplete_count > 0 then 'incomplete'
    when over_count > 0 then 'over'
    when under_count > 0 then 'under'
    else 'on_plan'
  end as variance_status
from line_summary;

create or replace view public.v_canonical_work_order_variance_summary
with (security_invoker = true)
as
with ranked as (
  select summary.*,
    row_number() over (
      partition by summary.work_order_id, summary.category
      order by summary.result_date desc, summary.work_result_id desc
    ) as result_rank
  from public.v_canonical_result_variance_summary summary
)
select
  work_order_id,
  work_result_id as latest_work_result_id,
  result_date as latest_result_date,
  category,
  line_count,
  planned_value,
  actual_value,
  difference_value,
  variance_pct,
  incomplete_count,
  over_count,
  under_count,
  variance_status
from ranked
where result_rank = 1;

revoke all on function public.phase2f_variance_pct(numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.phase2f_variance_status(numeric, numeric, boolean)
  from public, anon, authenticated;
revoke all on function public.guard_phase2f_vehicle_measurement_snapshot()
  from public, anon, authenticated;
revoke all on function public.phase2f_validate_vehicle_measurements(uuid)
  from public, anon, authenticated;
revoke all on function public.guard_phase2f_result_vehicle_measurements()
  from public, anon, authenticated;
revoke all on function public.save_canonical_work_result_draft_phase2f(
  uuid, uuid, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.phase2f_variance_pct(numeric, numeric) to service_role;
grant execute on function public.phase2f_variance_status(numeric, numeric, boolean) to service_role;
grant execute on function public.save_canonical_work_result_draft_phase2f(
  uuid, uuid, jsonb, jsonb, jsonb
) to service_role;

revoke all on public.v_canonical_result_material_variance,
  public.v_canonical_result_labor_variance,
  public.v_canonical_result_resource_variance,
  public.v_canonical_result_fuel_variance,
  public.v_canonical_result_variance_summary,
  public.v_canonical_work_order_variance_summary
from public, anon, authenticated;

grant select on public.v_canonical_result_material_variance,
  public.v_canonical_result_labor_variance,
  public.v_canonical_result_resource_variance,
  public.v_canonical_result_fuel_variance,
  public.v_canonical_result_variance_summary,
  public.v_canonical_work_order_variance_summary
to service_role;

comment on view public.v_canonical_result_material_variance is
  'Typed Budget -> Plan -> WO -> Issue/Use/Return variance. Actual is posted Daily Usage, never issued quantity.';
comment on view public.v_canonical_result_labor_variance is
  'Planned versus actual labor by immutable Work Order Labor Requirement and frozen Result Rate.';
comment on view public.v_canonical_result_resource_variance is
  'Planned/assigned/actual equipment and vehicle variance retaining Work Order assignment lineage.';
comment on view public.v_canonical_result_fuel_variance is
  'Actual fuel consumption and Vehicle Master primary KPI versus canonical frozen standard; issue/refill is separate.';
comment on view public.v_canonical_result_variance_summary is
  'Read-only Daily Result Actual/Variance summary for Labor, Material, Equipment, and Fuel.';
comment on view public.v_canonical_work_order_variance_summary is
  'Latest canonical Daily Result variance summary surfaced on the Work Order without changing frozen baselines.';

commit;
