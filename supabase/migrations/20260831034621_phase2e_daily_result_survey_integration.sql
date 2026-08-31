-- Phase 2E: canonical Daily Work Result + existing Survey integration.
-- Canonical results retain the Phase 2D Work Order snapshots. Legacy Work Results,
-- Inventory Issue/Use/Return, Survey, Performance and Payroll schemas remain compatible.
begin;

alter table public.work_results
  add column if not exists workflow_source text not null default 'legacy',
  add column if not exists canonical_work_order_snapshot_at timestamptz,
  add column if not exists plan_quantity_snapshot numeric,
  add column if not exists plan_unit_snapshot text,
  add column if not exists plan_labor_cost_snapshot numeric not null default 0,
  add column if not exists plan_material_cost_snapshot numeric not null default 0,
  add column if not exists plan_equipment_cost_snapshot numeric not null default 0,
  add column if not exists plan_machine_cost_snapshot numeric not null default 0,
  add column if not exists plan_fuel_cost_snapshot numeric not null default 0,
  add column if not exists plan_total_cost_snapshot numeric not null default 0,
  add column if not exists actual_labor_cost numeric not null default 0,
  add column if not exists actual_material_cost numeric not null default 0,
  add column if not exists actual_machine_cost numeric not null default 0,
  add column if not exists actual_total_cost numeric not null default 0,
  add column if not exists material_variance_pct numeric,
  add column if not exists fuel_efficiency_pct numeric,
  add column if not exists finding_count integer not null default 0,
  add column if not exists rework_required boolean not null default false,
  add column if not exists verification_snapshot_at timestamptz;

alter table public.work_results
  add constraint work_results_phase2e_costs_nonnegative
  check (
    plan_labor_cost_snapshot >= 0 and plan_material_cost_snapshot >= 0
    and plan_equipment_cost_snapshot >= 0 and plan_machine_cost_snapshot >= 0
    and plan_fuel_cost_snapshot >= 0 and plan_total_cost_snapshot >= 0
    and actual_labor_cost >= 0 and actual_material_cost >= 0
    and actual_machine_cost >= 0 and actual_fuel_cost >= 0 and actual_total_cost >= 0
  ) not valid,
  add constraint work_results_phase2e_percentages
  check (
    (quality_score is null or quality_score between 0 and 100)
    and (completion_pct is null or completion_pct between 0 and 100)
    and (survey_score_pct is null or survey_score_pct between 0 and 100)
  ) not valid;

alter table public.work_result_workers
  alter column employee_id drop not null,
  add column if not exists work_order_labor_requirement_id uuid
    references public.work_order_labor_requirements(id) on delete restrict,
  add column if not exists work_order_worker_assignment_id uuid
    references public.work_order_workers(id) on delete restrict,
  add column if not exists contractor_id uuid
    references public.contractors(id) on delete restrict,
  add column if not exists payee_type text,
  add column if not exists rate_uom text,
  add column if not exists calculation_method text,
  add column if not exists rate_category text,
  add column if not exists affects_payroll boolean not null default true,
  add column if not exists rate_snapshot_at timestamptz,
  add column if not exists allocation_group_key text,
  add column if not exists is_driver boolean not null default false;

alter table public.work_result_workers
  drop constraint if exists work_result_workers_work_result_id_employee_id_work_date_key;

alter table public.work_result_workers
  add constraint work_result_workers_phase2e_identity
  check (
    (employee_id is not null and contractor_id is null)
    or (employee_id is null and contractor_id is not null)
  ) not valid,
  add constraint work_result_workers_phase2e_quality
  check (
    (individual_quality_pct is null or individual_quality_pct between 0 and 100)
    and (individual_completion_pct is null or individual_completion_pct between 0 and 100)
  ) not valid,
  add constraint work_result_workers_phase2e_allocation
  check (quantity_allocation_method in (
    'manual', 'equal', 'individual', 'team_pool', 'piece_rate',
    'hourly', 'daily', 'driver', 'contractor'
  )) not valid;

create unique index if not exists work_result_workers_legacy_employee_unique
  on public.work_result_workers (work_result_id, employee_id, work_date)
  where work_order_labor_requirement_id is null and employee_id is not null;
create unique index if not exists work_result_workers_canonical_employee_unique
  on public.work_result_workers (
    work_result_id, work_order_labor_requirement_id, employee_id, work_date
  )
  where work_order_labor_requirement_id is not null and employee_id is not null;
create unique index if not exists work_result_workers_canonical_contractor_unique
  on public.work_result_workers (
    work_result_id, work_order_labor_requirement_id, contractor_id, work_date
  )
  where work_order_labor_requirement_id is not null and contractor_id is not null;
create index if not exists work_result_workers_requirement_idx
  on public.work_result_workers (work_order_labor_requirement_id, work_result_id);

alter table public.work_result_vehicle_usage
  add column if not exists work_order_resource_requirement_id uuid
    references public.work_order_resource_requirements(id) on delete restrict,
  add column if not exists work_order_resource_assignment_id uuid
    references public.work_order_resource_assignments(id) on delete restrict,
  add column if not exists driver_work_result_worker_id uuid
    references public.work_result_workers(id) on delete restrict,
  add column if not exists planned_vehicle_id_snapshot uuid
    references public.vehicles(id) on delete set null,
  add column if not exists planned_fuel_liters_snapshot numeric not null default 0,
  add column if not exists fuel_metric_basis_snapshot text,
  add column if not exists fuel_standard_rate_snapshot numeric,
  add column if not exists fuel_unit_cost_snapshot numeric,
  add column if not exists issued_fuel_liter numeric not null default 0,
  add column if not exists fuel_variance_pct numeric,
  add column if not exists vehicle_variance_reason text;

alter table public.work_result_vehicle_usage
  add constraint work_result_vehicle_usage_phase2e_fuel_nonnegative
  check (
    planned_fuel_liters_snapshot >= 0 and issued_fuel_liter >= 0
    and allocated_fuel_liter >= 0 and fuel_cost_amount >= 0
  ) not valid,
  add constraint work_result_vehicle_usage_phase2e_fuel_basis
  check (
    fuel_metric_basis_snapshot is null
    or fuel_metric_basis_snapshot in ('L/hour', 'km/L', 'L/rai', 'L/ton')
  ) not valid;

create unique index if not exists work_result_vehicle_usage_requirement_unique
  on public.work_result_vehicle_usage (work_result_id, work_order_resource_requirement_id)
  where work_order_resource_requirement_id is not null;

create or replace function public.phase2e_is_present(p_attendance text)
returns boolean
language sql immutable security invoker set search_path = ''
as $phase2e_present$
  select coalesce(lower(p_attendance), 'present') in ('present', 'late', 'half_day');
$phase2e_present$;

create or replace function public.phase2e_earning_amount(
  p_calculation_method text,
  p_rate_uom text,
  p_rate_amount numeric,
  p_attendance text,
  p_actual_hours numeric,
  p_actual_quantity numeric
) returns numeric
language sql immutable security invoker set search_path = ''
as $phase2e_earning$
  select round(case
    when not public.phase2e_is_present(p_attendance) then 0
    when lower(coalesce(p_calculation_method, '') || ' ' || coalesce(p_rate_uom, ''))
      ~ '(hour|ชั่วโมง)' then greatest(coalesce(p_actual_hours, 0), 0) * greatest(coalesce(p_rate_amount, 0), 0)
    when lower(coalesce(p_calculation_method, '') || ' ' || coalesce(p_rate_uom, ''))
      ~ '(day|วัน)' then
      (case when lower(coalesce(p_attendance, '')) = 'half_day' then 0.5 else 1 end)
      * greatest(coalesce(p_rate_amount, 0), 0)
    when lower(coalesce(p_calculation_method, '')) ~ '(fixed|work_order|เหมาจ่าย)' then
      greatest(coalesce(nullif(p_actual_quantity, 0), 1), 0) * greatest(coalesce(p_rate_amount, 0), 0)
    else greatest(coalesce(p_actual_quantity, 0), 0) * greatest(coalesce(p_rate_amount, 0), 0)
  end, 2);
$phase2e_earning$;

create or replace function public.phase2e_fuel_variance_pct(
  p_metric_basis text,
  p_standard numeric,
  p_actual_fuel numeric,
  p_engine_hours numeric,
  p_distance_km numeric,
  p_actual_rai numeric,
  p_actual_ton numeric
) returns numeric
language sql immutable security invoker set search_path = ''
as $phase2e_fuel_variance$
  select case
    when coalesce(p_standard, 0) <= 0 or coalesce(p_actual_fuel, 0) <= 0 then null
    when p_metric_basis = 'L/hour' and coalesce(p_engine_hours, 0) > 0
      then round((((p_actual_fuel / p_engine_hours) - p_standard) / p_standard) * 100, 2)
    when p_metric_basis = 'km/L' and coalesce(p_distance_km, 0) > 0
      then round(((p_standard - (p_distance_km / p_actual_fuel)) / p_standard) * 100, 2)
    when p_metric_basis = 'L/rai' and coalesce(p_actual_rai, 0) > 0
      then round((((p_actual_fuel / p_actual_rai) - p_standard) / p_standard) * 100, 2)
    when p_metric_basis = 'L/ton' and coalesce(p_actual_ton, 0) > 0
      then round((((p_actual_fuel / p_actual_ton) - p_standard) / p_standard) * 100, 2)
    else null
  end;
$phase2e_fuel_variance$;

create or replace function public.guard_phase2e_canonical_result()
returns trigger
language plpgsql security invoker set search_path = ''
as $phase2e_result_guard$
declare
  v_work_order_id uuid := case when tg_op = 'DELETE' then old.work_order_id else new.work_order_id end;
  v_canonical boolean;
begin
  select wo.workflow_source = 'canonical_planning' into v_canonical
  from public.work_orders wo where wo.id = v_work_order_id;
  if not coalesce(v_canonical, false) then return coalesce(new, old); end if;
  if current_setting('app.phase2e_daily_action', true) = 'on' then return coalesce(new, old); end if;
  if tg_op <> 'UPDATE' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_ACTION_REQUIRED';
  end if;
  if new.result_status is distinct from old.result_status
    or new.actual_start_at is distinct from old.actual_start_at
    or new.actual_end_at is distinct from old.actual_end_at
    or new.actual_quantity is distinct from old.actual_quantity
    or new.actual_unit is distinct from old.actual_unit
    or new.actual_area_rai is distinct from old.actual_area_rai
    or new.actual_tree_count is distinct from old.actual_tree_count
    or new.total_labor_hours is distinct from old.total_labor_hours
    or new.completion_pct is distinct from old.completion_pct
    or new.quality_score is distinct from old.quality_score
    or new.actual_fuel_liter is distinct from old.actual_fuel_liter
    or new.actual_fuel_cost is distinct from old.actual_fuel_cost
    or new.workflow_source is distinct from old.workflow_source
    or new.canonical_work_order_snapshot_at is distinct from old.canonical_work_order_snapshot_at
    or new.plan_quantity_snapshot is distinct from old.plan_quantity_snapshot
    or new.plan_unit_snapshot is distinct from old.plan_unit_snapshot
    or new.plan_labor_cost_snapshot is distinct from old.plan_labor_cost_snapshot
    or new.plan_material_cost_snapshot is distinct from old.plan_material_cost_snapshot
    or new.plan_equipment_cost_snapshot is distinct from old.plan_equipment_cost_snapshot
    or new.plan_machine_cost_snapshot is distinct from old.plan_machine_cost_snapshot
    or new.plan_fuel_cost_snapshot is distinct from old.plan_fuel_cost_snapshot
    or new.plan_total_cost_snapshot is distinct from old.plan_total_cost_snapshot
    or new.actual_labor_cost is distinct from old.actual_labor_cost
    or new.actual_material_cost is distinct from old.actual_material_cost
    or new.actual_machine_cost is distinct from old.actual_machine_cost
    or new.actual_total_cost is distinct from old.actual_total_cost
    or new.verification_snapshot_at is distinct from old.verification_snapshot_at
  then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_ACTION_REQUIRED';
  end if;
  return new;
end
$phase2e_result_guard$;

drop trigger if exists guard_phase2e_canonical_result on public.work_results;
create trigger guard_phase2e_canonical_result
before insert or update or delete on public.work_results for each row
execute function public.guard_phase2e_canonical_result();

create or replace function public.guard_phase2e_canonical_result_detail()
returns trigger
language plpgsql security invoker set search_path = ''
as $phase2e_detail_guard$
declare
  v_result_id uuid := case when tg_op = 'DELETE' then old.work_result_id else new.work_result_id end;
  v_status text;
  v_source text;
begin
  select wr.result_status, wo.workflow_source into v_status, v_source
  from public.work_results wr
  join public.work_orders wo on wo.id = wr.work_order_id
  where wr.id = v_result_id;
  if v_source is distinct from 'canonical_planning' then return coalesce(new, old); end if;
  if current_setting('app.phase2e_daily_action', true) is distinct from 'on' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_ACTION_REQUIRED';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_NOT_DRAFT';
  end if;
  return coalesce(new, old);
end
$phase2e_detail_guard$;

drop trigger if exists guard_phase2e_work_result_worker on public.work_result_workers;
create trigger guard_phase2e_work_result_worker
before insert or update or delete on public.work_result_workers for each row
execute function public.guard_phase2e_canonical_result_detail();

drop trigger if exists guard_phase2e_work_result_vehicle on public.work_result_vehicle_usage;
create trigger guard_phase2e_work_result_vehicle
before insert or update or delete on public.work_result_vehicle_usage for each row
execute function public.guard_phase2e_canonical_result_detail();

create or replace function public.get_or_create_canonical_work_result(
  p_work_order_id uuid,
  p_result_date date default current_date,
  p_profile_id uuid default null
) returns public.work_results
language plpgsql security invoker set search_path = ''
as $phase2e_create_result$
declare
  v_order public.work_orders%rowtype;
  v_result public.work_results%rowtype;
  v_sequence integer;
  v_result_no text;
begin
  if p_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_profile_id and p.status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;
  if p_result_date is null then
    raise exception using errcode = 'P0001', message = 'WORK_RESULT_DATE_REQUIRED';
  end if;

  select * into v_order from public.work_orders where id = p_work_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_ORDER_NOT_FOUND'; end if;
  if v_order.workflow_source is distinct from 'canonical_planning' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_REQUIRED';
  end if;

  select * into v_result
  from public.work_results
  where work_order_id = p_work_order_id and result_date = p_result_date
    and result_status in ('draft', 'submitted')
  order by sequence_no desc, created_at desc
  limit 1;
  if found then return v_result; end if;

  if v_order.status not in ('dispatched', 'in_progress') then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_NOT_DISPATCHED';
  end if;
  if not exists (
    select 1 from public.work_order_labor_requirements
    where work_order_id = v_order.id
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_LABOR_REQUIREMENT_NOT_FOUND'; end if;

  select coalesce(max(sequence_no), 0) + 1 into v_sequence
  from public.work_results where work_order_id = p_work_order_id and result_date = p_result_date;
  v_result_no := 'WR-' || to_char(p_result_date, 'YYYYMMDD') || '-'
    || right(replace(p_work_order_id::text, '-', ''), 8) || '-' || lpad(v_sequence::text, 2, '0');

  perform set_config('app.phase2e_daily_action', 'on', true);
  insert into public.work_results (
    work_order_id, result_no, result_date, sequence_no, source_type,
    actual_unit, result_status, created_by_profile_id, workflow_source,
    canonical_work_order_snapshot_at, plan_quantity_snapshot, plan_unit_snapshot,
    plan_labor_cost_snapshot, plan_material_cost_snapshot,
    plan_equipment_cost_snapshot, plan_machine_cost_snapshot,
    plan_fuel_cost_snapshot, plan_total_cost_snapshot, created_at, updated_at
  ) values (
    v_order.id, v_result_no, p_result_date, v_sequence, 'canonical_work_order',
    v_order.planned_unit, 'draft', p_profile_id, 'canonical_work_order',
    v_order.planning_snapshot_at, v_order.planned_quantity, v_order.planned_unit,
    v_order.planned_labor_cost, v_order.planned_material_cost,
    v_order.planned_equipment_cost, v_order.planned_machine_cost,
    v_order.planned_fuel_cost, v_order.planned_total_cost,
    transaction_timestamp(), transaction_timestamp()
  ) returning * into v_result;

  insert into public.work_result_workers (
    work_result_id, employee_id, contractor_id, team_id, work_date,
    worker_role, attendance_status, actual_hours, actual_quantity, actual_unit,
    rate_type, rate_amount, earning_amount, quantity_allocation_method,
    is_quantity_estimated, work_order_labor_requirement_id,
    work_order_worker_assignment_id, payee_type, rate_uom,
    calculation_method, rate_category, affects_payroll, rate_snapshot_at,
    allocation_group_key, is_driver, created_at, updated_at
  )
  select
    v_result.id, wow.employee_id, wow.contractor_id, v_order.team_id, p_result_date,
    requirement.role_position, 'present', 0, 0, v_order.planned_unit,
    requirement.rate_basis, requirement.rate_amount, 0,
    case
      when exists (select 1 from public.work_order_resource_assignments ra
        where ra.driver_work_order_worker_id = wow.id) then 'driver'
      when wow.assignment_type = 'contractor' then 'contractor'
      when lower(coalesce(requirement.calculation_method, '') || ' ' || requirement.uom) ~ '(hour|ชั่วโมง)' then 'hourly'
      when lower(coalesce(requirement.calculation_method, '') || ' ' || requirement.uom) ~ '(day|วัน)' then 'daily'
      when lower(coalesce(requirement.calculation_method, '')) ~ '(team|pool|ทีม)' then 'team_pool'
      else 'piece_rate'
    end,
    false, requirement.id, wow.id, requirement.payee_type, requirement.uom,
    requirement.calculation_method, requirement.rate_category,
    requirement.affects_payroll, requirement.snapshot_at,
    requirement.id::text,
    exists (select 1 from public.work_order_resource_assignments ra
      where ra.driver_work_order_worker_id = wow.id),
    transaction_timestamp(), transaction_timestamp()
  from public.work_order_workers wow
  join public.work_order_labor_requirements requirement
    on requirement.id = wow.work_order_labor_requirement_id
  where wow.work_order_id = v_order.id and wow.status <> 'cancelled';

  insert into public.work_result_vehicle_usage (
    work_result_id, work_order_id, vehicle_id, driver_employee_id,
    distance_km, engine_hours, working_hours, idle_hours, actual_area_rai,
    actual_tree_count, actual_quantity, actual_unit, allocation_basis_value,
    allocated_fuel_liter, fuel_cost_amount, allocation_method, status,
    work_order_resource_requirement_id, work_order_resource_assignment_id,
    driver_work_result_worker_id, planned_vehicle_id_snapshot,
    planned_fuel_liters_snapshot, fuel_metric_basis_snapshot,
    fuel_standard_rate_snapshot, fuel_unit_cost_snapshot,
    issued_fuel_liter, vehicle_variance_reason, created_at, updated_at
  )
  select
    v_result.id, v_order.id, assignment.selected_vehicle_id,
    driver_result.employee_id,
    0, 0, 0, 0, 0, 0, 0, v_order.planned_unit, 0,
    0, 0, 'canonical_work_order', 'draft',
    requirement.id, assignment.id, driver_result.id,
    assignment.selected_vehicle_id, assignment.planned_fuel_liters,
    requirement.fuel_metric_basis, requirement.fuel_standard_rate,
    requirement.fuel_unit_cost, 0, assignment.vehicle_variance_reason,
    transaction_timestamp(), transaction_timestamp()
  from public.work_order_resource_assignments assignment
  join public.work_order_resource_requirements requirement
    on requirement.id = assignment.work_order_resource_requirement_id
  left join public.work_result_workers driver_result
    on driver_result.work_result_id = v_result.id
    and driver_result.work_order_worker_assignment_id = assignment.driver_work_order_worker_id
  where assignment.work_order_id = v_order.id
    and assignment.selected_vehicle_id is not null;

  if v_order.status = 'dispatched' then
    update public.work_orders set status = 'in_progress',
      updated_at = transaction_timestamp(), last_action_at = transaction_timestamp()
    where id = v_order.id;
    insert into public.work_order_status_logs (
      work_order_id, from_status, to_status, changed_by, note, changed_at
    ) values (
      v_order.id, 'dispatched', 'in_progress', p_profile_id,
      'Canonical Daily Work Result started', transaction_timestamp()
    );
  end if;
  perform set_config('app.phase2e_daily_action', 'off', true);
  return v_result;
end
$phase2e_create_result$;

create or replace function public.save_canonical_work_result_draft(
  p_result_id uuid,
  p_actor_profile_id uuid,
  p_header jsonb default '{}'::jsonb,
  p_workers jsonb default '[]'::jsonb,
  p_vehicles jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $phase2e_save_result$
declare
  v_result public.work_results%rowtype;
  v_order public.work_orders%rowtype;
  v_worker public.work_result_workers%rowtype;
  v_usage public.work_result_vehicle_usage%rowtype;
  v_row jsonb;
  v_allocation text;
  v_start timestamptz;
  v_end timestamptz;
  v_start_odometer numeric;
  v_end_odometer numeric;
  v_start_meter numeric;
  v_end_meter numeric;
  v_distance numeric;
  v_engine_hours numeric;
  v_working_hours numeric;
  v_actual_fuel numeric;
  v_issued_fuel numeric;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_profile_id and p.status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;
  if jsonb_typeof(coalesce(p_header, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workers, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_vehicles, '[]'::jsonb)) <> 'array'
  then raise exception using errcode = 'P0001', message = 'WORK_RESULT_PAYLOAD_INVALID'; end if;

  select * into v_result from public.work_results where id = p_result_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_RESULT_NOT_FOUND'; end if;
  select * into v_order from public.work_orders where id = v_result.work_order_id;
  if v_order.workflow_source is distinct from 'canonical_planning'
    or v_result.workflow_source is distinct from 'canonical_work_order'
  then raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_REQUIRED'; end if;
  if v_result.result_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_NOT_DRAFT';
  end if;

  v_start := nullif(p_header->>'actual_start_at', '')::timestamptz;
  v_end := nullif(p_header->>'actual_end_at', '')::timestamptz;
  if (v_start is null) <> (v_end is null) or (v_start is not null and v_end <= v_start) then
    raise exception using errcode = 'P0001', message = 'INVALID_RESULT_TIME';
  end if;

  perform set_config('app.phase2e_daily_action', 'on', true);
  update public.work_results
  set actual_start_at = v_start,
      actual_end_at = v_end,
      actual_quantity = nullif(p_header->>'actual_quantity', '')::numeric,
      actual_unit = coalesce(nullif(p_header->>'actual_unit', ''), plan_unit_snapshot),
      actual_area_rai = nullif(p_header->>'actual_area_rai', '')::numeric,
      actual_tree_count = nullif(p_header->>'actual_tree_count', '')::integer,
      working_minutes = nullif(p_header->>'working_minutes', '')::integer,
      stoppage_minutes = nullif(p_header->>'stoppage_minutes', '')::integer,
      quality_score = nullif(p_header->>'quality_score', '')::numeric,
      completion_pct = nullif(p_header->>'completion_pct', '')::numeric,
      rework_quantity = nullif(p_header->>'rework_quantity', '')::numeric,
      weather_condition = nullif(p_header->>'weather_condition', ''),
      terrain_condition = nullif(p_header->>'terrain_condition', ''),
      note = nullif(p_header->>'note', ''),
      updated_at = transaction_timestamp()
  where id = v_result.id returning * into v_result;

  if coalesce(v_result.actual_quantity, 0) < 0
    or coalesce(v_result.actual_area_rai, 0) < 0
    or coalesce(v_result.actual_tree_count, 0) < 0
  then raise exception using errcode = 'P0001', message = 'WORK_RESULT_ACTUAL_NEGATIVE'; end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_workers, '[]'::jsonb))
  loop
    select * into v_worker
    from public.work_result_workers
    where work_result_id = v_result.id
      and work_order_labor_requirement_id is not null
      and (
        (nullif(v_row->>'work_result_worker_id', '') is not null
          and id = nullif(v_row->>'work_result_worker_id', '')::uuid)
        or (nullif(v_row->>'work_order_worker_assignment_id', '') is not null
          and work_order_worker_assignment_id =
            nullif(v_row->>'work_order_worker_assignment_id', '')::uuid)
      )
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'WORK_RESULT_LABOR_LINE_NOT_FOUND';
    end if;
    v_allocation := coalesce(nullif(v_row->>'quantity_allocation_method', ''), v_worker.quantity_allocation_method);
    if v_allocation not in (
      'manual', 'equal', 'individual', 'team_pool', 'piece_rate',
      'hourly', 'daily', 'driver', 'contractor'
    ) then raise exception using errcode = 'P0001', message = 'WORK_RESULT_ALLOCATION_METHOD_INVALID'; end if;

    update public.work_result_workers
    set attendance_status = coalesce(nullif(v_row->>'attendance_status', ''), 'present'),
        actual_hours = greatest(coalesce(nullif(v_row->>'actual_hours', '')::numeric, 0), 0),
        actual_quantity = greatest(coalesce(nullif(v_row->>'actual_quantity', '')::numeric, 0), 0),
        actual_unit = coalesce(nullif(v_row->>'actual_unit', ''), v_result.actual_unit),
        actual_area_rai = greatest(coalesce(nullif(v_row->>'actual_area_rai', '')::numeric, 0), 0),
        actual_tree_count = greatest(coalesce(nullif(v_row->>'actual_tree_count', '')::integer, 0), 0),
        individual_quality_pct = nullif(v_row->>'individual_quality_pct', '')::numeric,
        individual_completion_pct = nullif(v_row->>'individual_completion_pct', '')::numeric,
        quantity_allocation_method = v_allocation,
        is_quantity_estimated = coalesce((v_row->>'is_quantity_estimated')::boolean, false),
        note = nullif(v_row->>'note', ''),
        earning_amount = public.phase2e_earning_amount(
          calculation_method, rate_uom, rate_amount,
          coalesce(nullif(v_row->>'attendance_status', ''), 'present'),
          greatest(coalesce(nullif(v_row->>'actual_hours', '')::numeric, 0), 0),
          greatest(coalesce(nullif(v_row->>'actual_quantity', '')::numeric, 0), 0)
        ),
        updated_at = transaction_timestamp()
    where id = v_worker.id;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(p_vehicles, '[]'::jsonb))
  loop
    select * into v_usage
    from public.work_result_vehicle_usage
    where work_result_id = v_result.id
      and work_order_resource_requirement_id =
        nullif(v_row->>'work_order_resource_requirement_id', '')::uuid
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'WORK_RESULT_RESOURCE_LINE_NOT_FOUND';
    end if;
    if nullif(v_row->>'vehicle_id', '')::uuid is distinct from v_usage.planned_vehicle_id_snapshot then
      raise exception using errcode = 'P0001', message = 'WORK_RESULT_VEHICLE_NOT_ASSIGNED';
    end if;
    v_start := nullif(v_row->>'start_at', '')::timestamptz;
    v_end := nullif(v_row->>'end_at', '')::timestamptz;
    if (v_start is null) <> (v_end is null) or (v_start is not null and v_end <= v_start) then
      raise exception using errcode = 'P0001', message = 'INVALID_VEHICLE_TIME';
    end if;
    v_start_odometer := nullif(v_row->>'start_odometer', '')::numeric;
    v_end_odometer := nullif(v_row->>'end_odometer', '')::numeric;
    v_start_meter := nullif(v_row->>'start_hour_meter', '')::numeric;
    v_end_meter := nullif(v_row->>'end_hour_meter', '')::numeric;
    if (v_start_odometer is not null and v_end_odometer is not null and v_end_odometer < v_start_odometer)
      or (v_start_meter is not null and v_end_meter is not null and v_end_meter < v_start_meter)
    then raise exception using errcode = 'P0001', message = 'WORK_RESULT_RESOURCE_METER_INVALID'; end if;
    v_distance := coalesce(
      nullif(v_row->>'distance_km', '')::numeric,
      case when v_start_odometer is not null and v_end_odometer is not null
        then v_end_odometer - v_start_odometer else 0 end
    );
    v_engine_hours := coalesce(
      nullif(v_row->>'engine_hours', '')::numeric,
      case when v_start_meter is not null and v_end_meter is not null
        then v_end_meter - v_start_meter else 0 end
    );
    v_working_hours := coalesce(
      nullif(v_row->>'working_hours', '')::numeric,
      case when v_start is not null and v_end is not null
        then extract(epoch from (v_end - v_start)) / 3600 else 0 end
    );
    v_issued_fuel := greatest(coalesce(nullif(v_row->>'issued_fuel_liter', '')::numeric, 0), 0);
    if nullif(v_row->>'opening_fuel_liter', '') is not null
      and nullif(v_row->>'closing_fuel_liter', '') is not null
    then
      v_actual_fuel := nullif(v_row->>'opening_fuel_liter', '')::numeric
        + v_issued_fuel - nullif(v_row->>'closing_fuel_liter', '')::numeric;
    else
      v_actual_fuel := coalesce(nullif(v_row->>'actual_fuel_liter', '')::numeric, 0);
    end if;
    if least(v_distance, v_engine_hours, v_working_hours, v_actual_fuel) < 0 then
      raise exception using errcode = 'P0001', message = 'WORK_RESULT_RESOURCE_ACTUAL_NEGATIVE';
    end if;

    update public.work_result_vehicle_usage
    set driver_employee_id = coalesce(
          (select wrw.employee_id from public.work_result_workers wrw
            where wrw.id = driver_work_result_worker_id),
          driver_employee_id
        ),
        start_at = v_start,
        end_at = v_end,
        start_odometer = v_start_odometer,
        end_odometer = v_end_odometer,
        start_hour_meter = v_start_meter,
        end_hour_meter = v_end_meter,
        distance_km = round(v_distance, 3),
        engine_hours = round(v_engine_hours, 3),
        working_hours = round(v_working_hours, 3),
        idle_hours = greatest(coalesce(nullif(v_row->>'idle_hours', '')::numeric, 0), 0),
        actual_area_rai = greatest(coalesce(nullif(v_row->>'actual_area_rai', '')::numeric, 0), 0),
        actual_tree_count = greatest(coalesce(nullif(v_row->>'actual_tree_count', '')::integer, 0), 0),
        actual_quantity = greatest(coalesce(nullif(v_row->>'actual_quantity', '')::numeric, 0), 0),
        actual_unit = coalesce(nullif(v_row->>'actual_unit', ''), v_result.actual_unit),
        allocation_basis_value = greatest(coalesce(nullif(v_row->>'allocation_basis_value', '')::numeric, 0), 0),
        issued_fuel_liter = v_issued_fuel,
        allocated_fuel_liter = round(v_actual_fuel, 3),
        fuel_cost_amount = round(v_actual_fuel * coalesce(fuel_unit_cost_snapshot, 0), 2),
        fuel_variance_pct = public.phase2e_fuel_variance_pct(
          fuel_metric_basis_snapshot, fuel_standard_rate_snapshot, v_actual_fuel,
          v_engine_hours, v_distance,
          greatest(coalesce(nullif(v_row->>'actual_area_rai', '')::numeric, 0), 0),
          greatest(coalesce(nullif(v_row->>'actual_quantity', '')::numeric, 0), 0)
        ),
        note = nullif(v_row->>'note', ''),
        updated_at = transaction_timestamp()
    where id = v_usage.id;
  end loop;

  update public.work_results result
  set worker_count = (
        select count(*) from public.work_result_workers worker
        where worker.work_result_id = result.id and public.phase2e_is_present(worker.attendance_status)
      ),
      total_labor_hours = coalesce((
        select sum(worker.actual_hours) from public.work_result_workers worker
        where worker.work_result_id = result.id and public.phase2e_is_present(worker.attendance_status)
      ), 0),
      actual_labor_cost = coalesce((
        select sum(worker.earning_amount) from public.work_result_workers worker
        where worker.work_result_id = result.id
      ), 0),
      actual_fuel_liter = coalesce((
        select sum(usage.allocated_fuel_liter) from public.work_result_vehicle_usage usage
        where usage.work_result_id = result.id
      ), 0),
      actual_fuel_cost = coalesce((
        select sum(usage.fuel_cost_amount) from public.work_result_vehicle_usage usage
        where usage.work_result_id = result.id
      ), 0),
      fuel_efficiency_pct = (
        select round(avg(100 - usage.fuel_variance_pct), 2)
        from public.work_result_vehicle_usage usage
        where usage.work_result_id = result.id and usage.fuel_variance_pct is not null
      ),
      updated_at = transaction_timestamp()
  where result.id = v_result.id
  returning * into v_result;
  perform set_config('app.phase2e_daily_action', 'off', true);

  return jsonb_build_object(
    'result', to_jsonb(v_result),
    'worker_count', (select count(*) from public.work_result_workers where work_result_id = v_result.id),
    'vehicle_count', (select count(*) from public.work_result_vehicle_usage where work_result_id = v_result.id)
  );
end
$phase2e_save_result$;

create or replace function public.validate_canonical_work_result(
  p_result_id uuid,
  p_for_verify boolean default false
) returns void
language plpgsql security invoker set search_path = ''
as $phase2e_validate_result$
declare
  v_result public.work_results%rowtype;
  v_order public.work_orders%rowtype;
  v_activity public.activities%rowtype;
begin
  select * into v_result from public.work_results where id = p_result_id;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_RESULT_NOT_FOUND'; end if;
  select * into v_order from public.work_orders where id = v_result.work_order_id;
  if v_order.workflow_source is distinct from 'canonical_planning'
    or v_result.workflow_source is distinct from 'canonical_work_order'
  then raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_REQUIRED'; end if;
  select * into v_activity from public.activities where id = v_order.activity_id;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_ORDER_ACTIVITY_NOT_ACTIVE'; end if;
  if coalesce(v_result.actual_quantity, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'WORK_RESULT_ACTUAL_QUANTITY_REQUIRED';
  end if;

  if (coalesce(v_activity.require_worker, false)
      or coalesce(v_activity.requires_worker_detail, false)) and (
    not exists (
      select 1 from public.work_result_workers worker
      where worker.work_result_id = v_result.id
        and worker.work_order_labor_requirement_id is not null
        and public.phase2e_is_present(worker.attendance_status)
        and (worker.actual_hours > 0 or worker.actual_quantity > 0 or worker.earning_amount > 0)
    )
    or exists (
      select 1 from public.work_order_labor_requirements requirement
      where requirement.work_order_id = v_order.id
        and not exists (
          select 1 from public.work_result_workers worker
          where worker.work_result_id = v_result.id
            and worker.work_order_labor_requirement_id = requirement.id
            and public.phase2e_is_present(worker.attendance_status)
            and (worker.actual_hours > 0 or worker.actual_quantity > 0 or worker.earning_amount > 0)
        )
    )
  ) then raise exception using errcode = 'P0001', message = 'WORK_RESULT_WORKER_ACTUAL_REQUIRED'; end if;

  if exists (
    select 1
    from public.work_order_labor_requirements requirement
    where requirement.work_order_id = v_order.id
      and lower(coalesce(requirement.calculation_method, '') || ' ' || requirement.uom)
        !~ '(hour|ชั่วโมง|day|วัน|fixed|work_order|เหมาจ่าย)'
      and exists (
        select 1 from public.work_result_workers worker
        where worker.work_result_id = v_result.id
          and worker.work_order_labor_requirement_id = requirement.id
          and public.phase2e_is_present(worker.attendance_status)
      )
      and abs(coalesce((
        select sum(worker.actual_quantity)
        from public.work_result_workers worker
        where worker.work_result_id = v_result.id
          and worker.work_order_labor_requirement_id = requirement.id
          and public.phase2e_is_present(worker.attendance_status)
      ), 0) - v_result.actual_quantity) > greatest(0.001, v_result.actual_quantity * 0.0001)
  ) then raise exception using errcode = 'P0001', message = 'WORK_RESULT_QUANTITY_ALLOCATION_NOT_RECONCILED'; end if;

  if (coalesce(v_activity.require_material, false)
      or coalesce(v_activity.requires_material_detail, false))
    and not exists (
      select 1 from public.goods_issue_daily_usage usage
      where usage.work_result_id = v_result.id and usage.status = 'posted'
        and usage.quantity > 0
    )
  then raise exception using errcode = 'P0001', message = 'WORK_RESULT_MATERIAL_ACTUAL_REQUIRED'; end if;

  if (coalesce(v_activity.require_machine, false)
      or coalesce(v_activity.requires_machine_detail, false))
    and not exists (
      select 1 from public.work_result_vehicle_usage usage
      where usage.work_result_id = v_result.id
        and usage.work_order_resource_requirement_id is not null
        and (usage.working_hours > 0 or usage.engine_hours > 0
          or usage.distance_km > 0 or usage.actual_quantity > 0)
    )
  then raise exception using errcode = 'P0001', message = 'WORK_RESULT_MACHINE_ACTUAL_REQUIRED'; end if;

  if coalesce(v_activity.require_fuel, false)
    and not exists (
      select 1 from public.work_result_vehicle_usage usage
      where usage.work_result_id = v_result.id
        and usage.allocated_fuel_liter > 0
        and usage.fuel_metric_basis_snapshot in ('L/hour', 'km/L', 'L/rai', 'L/ton')
        and usage.fuel_standard_rate_snapshot > 0
    )
  then raise exception using errcode = 'P0001', message = 'WORK_RESULT_FUEL_ACTUAL_REQUIRED'; end if;

  if exists (
    select 1
    from public.work_result_vehicle_usage usage
    join public.work_result_workers driver
      on driver.id = usage.driver_work_result_worker_id
    where usage.work_result_id = v_result.id
      and (driver.work_result_id <> usage.work_result_id
        or driver.is_driver is not true
        or driver.employee_id is distinct from usage.driver_employee_id)
  ) then raise exception using errcode = 'P0001', message = 'WORK_RESULT_DRIVER_LINEAGE_INVALID'; end if;

  if p_for_verify and exists (
    with survey_context as (
      select null::uuid as employee_id, null::uuid as vehicle_id
      union
      select worker.employee_id, null::uuid
      from public.work_result_workers worker
      where worker.work_result_id = v_result.id and worker.employee_id is not null
      union
      select null::uuid, usage.vehicle_id
      from public.work_result_vehicle_usage usage
      where usage.work_result_id = v_result.id and usage.vehicle_id is not null
    ), resolved as (
      select distinct chosen.template_id, chosen.required
      from survey_context context
      cross join lateral (
        select assignment.template_id, assignment.required
        from public.survey_template_assignments assignment
        join public.survey_templates template
          on template.id = assignment.template_id and template.status = 'active'
        where assignment.status = 'active'
          and assignment.trigger_event in ('after_result', 'before_close')
          and (assignment.effective_from is null
            or assignment.effective_from <= v_result.result_date)
          and (assignment.effective_to is null
            or assignment.effective_to >= v_result.result_date)
          and (assignment.activity_id is null
            or assignment.activity_id = v_order.activity_id)
          and (assignment.block_id is null or assignment.block_id = v_order.block_id)
          and (assignment.team_id is null or assignment.team_id = v_order.team_id)
          and (assignment.vehicle_id is null
            or assignment.vehicle_id = context.vehicle_id)
          and (assignment.employee_id is null
            or assignment.employee_id = context.employee_id)
          and (
            assignment.condition_json->>'activity_group_id' is null
            or assignment.condition_json->>'activity_group_id'
              = v_activity.activity_group_id::text
          )
          and (
            assignment.condition_json->>'work_type' is null
            or lower(assignment.condition_json->>'work_type')
              = lower(coalesce(v_activity.work_type, ''))
          )
        order by (
          coalesce(assignment.priority, 0)
          + case
              when assignment.activity_id is not null then 6000
              when assignment.condition_json->>'activity_group_id' is not null then 5000
              when assignment.condition_json->>'work_type' is not null then 4000
              else 2000
            end
          + case when assignment.block_id is not null then 300 else 0 end
          + case when assignment.team_id is not null then 200 else 0 end
          + case when assignment.vehicle_id is not null then 100 else 0 end
          + case when assignment.employee_id is not null then 50 else 0 end
        ) desc, assignment.id
        limit 1
      ) chosen
    )
    select 1
    from resolved
    where resolved.required
      and not exists (
        select 1 from public.survey_responses response
        where response.work_result_id = v_result.id
          and response.template_id = resolved.template_id
          and response.status in ('verified', 'closed')
          and response.pass_status <> 'failed'
      )
  ) then raise exception using errcode = 'P0001', message = 'WORK_RESULT_SURVEY_NOT_VERIFIED'; end if;

  if p_for_verify and v_order.survey_required and not exists (
    select 1 from public.survey_responses response
    where response.work_result_id = v_result.id
      and response.status in ('verified', 'closed')
      and response.pass_status <> 'failed'
  ) then raise exception using errcode = 'P0001', message = 'WORK_RESULT_SURVEY_NOT_VERIFIED'; end if;
end
$phase2e_validate_result$;

create or replace function public.submit_canonical_work_result_phase2e(
  p_result_id uuid,
  p_actor_profile_id uuid
) returns public.work_results
language plpgsql security invoker set search_path = ''
as $phase2e_submit_result$
declare
  v_result public.work_results%rowtype;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_profile_id and p.status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;
  select * into v_result from public.work_results where id = p_result_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_RESULT_NOT_FOUND'; end if;
  if v_result.result_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_NOT_DRAFT';
  end if;
  perform public.validate_canonical_work_result(v_result.id, false);
  perform set_config('app.phase2e_daily_action', 'on', true);
  update public.work_results set result_status = 'submitted',
    submitted_by = p_actor_profile_id, submitted_at = transaction_timestamp(),
    updated_at = transaction_timestamp()
  where id = v_result.id returning * into v_result;
  perform set_config('app.phase2e_daily_action', 'off', true);
  return v_result;
end
$phase2e_submit_result$;

create or replace function public.verify_canonical_work_result_phase2e(
  p_result_id uuid,
  p_actor_profile_id uuid
) returns public.work_results
language plpgsql security invoker set search_path = ''
as $phase2e_verify_result$
declare
  v_result public.work_results%rowtype;
  v_order public.work_orders%rowtype;
  v_material_cost numeric := 0;
  v_machine_cost numeric := 0;
  v_finding_count integer := 0;
  v_survey_score numeric;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_profile_id and p.status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;
  select * into v_result from public.work_results where id = p_result_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_RESULT_NOT_FOUND'; end if;
  if v_result.result_status <> 'submitted' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_NOT_SUBMITTED';
  end if;
  select * into v_order from public.work_orders where id = v_result.work_order_id for update;
  perform public.validate_canonical_work_result(v_result.id, true);

  select coalesce(sum(usage.issue_unit_quantity * line.unit_cost), 0)
  into v_material_cost
  from public.goods_issue_daily_usage usage
  join public.goods_issue_lines line on line.id = usage.goods_issue_line_id
  where usage.work_result_id = v_result.id and usage.status = 'posted';

  select coalesce(sum(
    coalesce(requirement.resource_rate_amount, 0) * case requirement.quantity_basis
      when 'hour' then usage.working_hours
      when 'km' then usage.distance_km
      when 'rai' then usage.actual_area_rai
      when 'ton' then usage.actual_quantity
      else usage.actual_quantity
    end
  ), 0)
  into v_machine_cost
  from public.work_result_vehicle_usage usage
  join public.work_order_resource_requirements requirement
    on requirement.id = usage.work_order_resource_requirement_id
  where usage.work_result_id = v_result.id;

  select count(*) into v_finding_count
  from public.survey_findings finding
  join public.survey_responses response on response.id = finding.response_id
  where response.work_result_id = v_result.id;

  select avg(response.score_pct) into v_survey_score
  from public.survey_responses response
  where response.work_result_id = v_result.id
    and response.status in ('verified', 'closed');

  perform set_config('app.phase2e_daily_action', 'on', true);
  update public.work_results result
  set result_status = 'verified',
      verified_by = p_actor_profile_id,
      verified_at = transaction_timestamp(),
      verification_snapshot_at = transaction_timestamp(),
      actual_material_cost = round(v_material_cost, 2),
      actual_machine_cost = round(v_machine_cost, 2),
      actual_total_cost = round(
        result.actual_labor_cost + v_material_cost + v_machine_cost + result.actual_fuel_cost, 2
      ),
      material_variance_pct = (
        select round(avg(material_line.variance_pct), 2)
        from (
          select case when material.planned_quantity > 0 then
            ((coalesce((
              select sum(usage.issue_unit_quantity)
              from public.goods_issue_daily_usage usage
              join public.goods_issue_lines issue_line
                on issue_line.id = usage.goods_issue_line_id
              where usage.work_result_id = result.id
                and usage.status = 'posted'
                and issue_line.material_id = material.material_id
            ), 0) - material.planned_quantity) / material.planned_quantity) * 100
          else null end as variance_pct
          from public.work_order_materials material
          where material.work_order_id = result.work_order_id
        ) material_line
      ),
      quality_score = coalesce(
        result.quality_score,
        (select round(avg(worker.individual_quality_pct), 2)
          from public.work_result_workers worker where worker.work_result_id = result.id),
        v_survey_score
      ),
      completion_pct = coalesce(
        result.completion_pct,
        (select round(avg(worker.individual_completion_pct), 2)
          from public.work_result_workers worker where worker.work_result_id = result.id)
      ),
      survey_score_pct = coalesce(v_survey_score, result.survey_score_pct),
      finding_count = v_finding_count,
      rework_required = coalesce(result.rework_quantity, 0) > 0 or exists (
        select 1 from public.survey_responses response
        join public.survey_findings finding on finding.response_id = response.id
        where response.work_result_id = result.id
          and finding.status not in ('resolved', 'verified', 'cancelled')
      ),
      updated_at = transaction_timestamp()
  where result.id = v_result.id returning * into v_result;

  update public.work_orders
  set status = 'completed', updated_at = transaction_timestamp(),
      last_action_at = transaction_timestamp()
  where id = v_order.id and status = 'in_progress';
  if found then
    insert into public.work_order_status_logs (
      work_order_id, from_status, to_status, changed_by, note, changed_at
    ) values (
      v_order.id, 'in_progress', 'completed', p_actor_profile_id,
      'Canonical Daily Work Result verified', transaction_timestamp()
    );
  end if;
  perform set_config('app.phase2e_daily_action', 'off', true);
  return v_result;
end
$phase2e_verify_result$;

create or replace function public.close_canonical_work_result_phase2e(
  p_result_id uuid,
  p_actor_profile_id uuid
) returns public.work_results
language plpgsql security invoker set search_path = ''
as $phase2e_close_result$
declare
  v_result public.work_results%rowtype;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_profile_id and p.status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;
  select * into v_result from public.work_results where id = p_result_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_RESULT_NOT_FOUND'; end if;
  if v_result.result_status <> 'verified' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_RESULT_NOT_VERIFIED';
  end if;
  perform public.validate_canonical_work_result(v_result.id, true);
  perform set_config('app.phase2e_daily_action', 'on', true);
  update public.work_results set result_status = 'closed',
    closed_by = p_actor_profile_id, closed_at = transaction_timestamp(),
    updated_at = transaction_timestamp()
  where id = v_result.id returning * into v_result;
  update public.work_orders set status = 'closed', closed_by_profile_id = p_actor_profile_id,
    closed_at = transaction_timestamp(), updated_at = transaction_timestamp(),
    last_action_at = transaction_timestamp()
  where id = v_result.work_order_id and status = 'completed'
    and not exists (
      select 1 from public.work_results other
      where other.work_order_id = v_result.work_order_id and other.id <> v_result.id
        and other.result_status in ('draft', 'submitted', 'verified')
    );
  perform set_config('app.phase2e_daily_action', 'off', true);
  return v_result;
end
$phase2e_close_result$;

create or replace view public.v_canonical_daily_material_actual
with (security_invoker = true)
as
select
  result.id as work_result_id,
  result.work_order_id,
  material.id as work_order_material_id,
  material.material_id,
  material.unit_id,
  material.planned_quantity,
  material.issued_quantity,
  coalesce((
    select sum(public.convert_material_quantity(
      usage.material_id, usage.quantity, usage.unit_id, material.unit_id
    ))
    from public.goods_issue_daily_usage usage
    where usage.work_result_id = result.id
      and usage.material_id = material.material_id
      and usage.status = 'posted'
  ), 0) as used_quantity,
  coalesce((
    select sum(public.convert_material_quantity(
      return_line.material_id, return_line.quantity, return_line.unit_id, material.unit_id
    ))
    from public.goods_returns return_header
    join public.goods_return_lines return_line on return_line.return_id = return_header.id
    where return_header.work_result_id = result.id
      and return_header.status = 'posted'
      and return_line.material_id = material.material_id
  ), 0) as returned_quantity,
  coalesce((
    select sum(public.convert_material_quantity(
      usage.material_id, usage.quantity, usage.unit_id, material.unit_id
    ))
    from public.goods_issue_daily_usage usage
    where usage.work_result_id = result.id
      and usage.material_id = material.material_id
      and usage.status = 'posted'
  ), 0) - material.planned_quantity as variance_quantity,
  material.snapshot_unit_cost,
  material.planned_amount,
  material.snapshot_at
from public.work_results result
join public.work_orders work_order on work_order.id = result.work_order_id
join public.work_order_materials material on material.work_order_id = result.work_order_id
where work_order.workflow_source = 'canonical_planning'
  and result.workflow_source = 'canonical_work_order';

create or replace view public.v_canonical_daily_resource_actual
with (security_invoker = true)
as
select
  usage.id,
  usage.work_result_id,
  usage.work_order_id,
  usage.work_order_resource_requirement_id,
  usage.work_order_resource_assignment_id,
  requirement.resource_type,
  requirement.resource_code,
  requirement.resource_name,
  usage.planned_vehicle_id_snapshot,
  usage.vehicle_id,
  usage.driver_work_result_worker_id,
  usage.driver_employee_id,
  usage.start_at,
  usage.end_at,
  usage.start_odometer,
  usage.end_odometer,
  usage.start_hour_meter,
  usage.end_hour_meter,
  usage.distance_km,
  usage.engine_hours,
  usage.working_hours,
  usage.idle_hours,
  usage.actual_area_rai,
  usage.actual_tree_count,
  usage.actual_quantity,
  usage.actual_unit,
  usage.planned_fuel_liters_snapshot,
  usage.issued_fuel_liter,
  usage.allocated_fuel_liter as actual_fuel_liter,
  usage.fuel_unit_cost_snapshot,
  usage.fuel_cost_amount as actual_fuel_cost,
  usage.fuel_metric_basis_snapshot,
  usage.fuel_standard_rate_snapshot,
  case when usage.engine_hours > 0
    then round(usage.allocated_fuel_liter / usage.engine_hours, 4) end as actual_liter_per_hour,
  case when usage.allocated_fuel_liter > 0
    then round(usage.distance_km / usage.allocated_fuel_liter, 4) end as actual_km_per_liter,
  case when usage.actual_area_rai > 0
    then round(usage.allocated_fuel_liter / usage.actual_area_rai, 4) end as actual_liter_per_rai,
  case when usage.actual_quantity > 0
    then round(usage.allocated_fuel_liter / usage.actual_quantity, 4) end as actual_liter_per_ton,
  usage.fuel_variance_pct,
  usage.vehicle_variance_reason,
  usage.status,
  usage.note
from public.work_result_vehicle_usage usage
join public.work_results result on result.id = usage.work_result_id
join public.work_orders work_order on work_order.id = result.work_order_id
join public.work_order_resource_requirements requirement
  on requirement.id = usage.work_order_resource_requirement_id
where work_order.workflow_source = 'canonical_planning'
  and result.workflow_source = 'canonical_work_order';

create or replace view public.v_canonical_daily_performance_input
with (security_invoker = true)
as
select
  result.id as work_result_id,
  result.work_order_id,
  work_order.planned_work_item_id,
  work_order.activity_id,
  work_order.block_id,
  work_order.team_id,
  result.result_date,
  result.result_status,
  result.plan_quantity_snapshot,
  result.plan_unit_snapshot,
  result.actual_quantity,
  result.actual_unit,
  result.worker_count,
  result.total_labor_hours,
  result.actual_labor_cost,
  result.actual_material_cost,
  result.actual_machine_cost,
  result.actual_fuel_liter,
  result.actual_fuel_cost,
  result.actual_total_cost,
  result.quality_score,
  result.completion_pct,
  result.survey_score_pct,
  result.finding_count,
  result.rework_required,
  result.rework_quantity,
  result.material_variance_pct,
  result.fuel_efficiency_pct,
  result.verification_snapshot_at
from public.work_results result
join public.work_orders work_order on work_order.id = result.work_order_id
where work_order.workflow_source = 'canonical_planning'
  and result.workflow_source = 'canonical_work_order';

revoke all on public.v_canonical_daily_material_actual from public, anon, authenticated;
revoke all on public.v_canonical_daily_resource_actual from public, anon, authenticated;
revoke all on public.v_canonical_daily_performance_input from public, anon, authenticated;
grant select on public.v_canonical_daily_material_actual to service_role;
grant select on public.v_canonical_daily_resource_actual to service_role;
grant select on public.v_canonical_daily_performance_input to service_role;

revoke all on function public.phase2e_is_present(text) from public, anon, authenticated;
revoke all on function public.phase2e_earning_amount(text, text, numeric, text, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.phase2e_fuel_variance_pct(text, numeric, numeric, numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.get_or_create_canonical_work_result(uuid, date, uuid)
  from public, anon, authenticated;
revoke all on function public.save_canonical_work_result_draft(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.validate_canonical_work_result(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.submit_canonical_work_result_phase2e(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.verify_canonical_work_result_phase2e(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.close_canonical_work_result_phase2e(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.phase2e_is_present(text) to service_role;
grant execute on function public.phase2e_earning_amount(text, text, numeric, text, numeric, numeric)
  to service_role;
grant execute on function public.phase2e_fuel_variance_pct(text, numeric, numeric, numeric, numeric, numeric, numeric)
  to service_role;
grant execute on function public.get_or_create_canonical_work_result(uuid, date, uuid)
  to service_role;
grant execute on function public.save_canonical_work_result_draft(uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.validate_canonical_work_result(uuid, boolean)
  to service_role;
grant execute on function public.submit_canonical_work_result_phase2e(uuid, uuid)
  to service_role;
grant execute on function public.verify_canonical_work_result_phase2e(uuid, uuid)
  to service_role;
grant execute on function public.close_canonical_work_result_phase2e(uuid, uuid)
  to service_role;

comment on column public.work_result_workers.rate_amount is
  'Frozen Phase 2D Work Order labor requirement rate; canonical Daily Result must never refresh it from Rate Master.';
comment on column public.work_result_workers.work_order_labor_requirement_id is
  'Canonical lineage to the immutable Work Order labor requirement.';
comment on view public.v_canonical_daily_material_actual is
  'Read-only Planned vs Issue/Use/Return material result; planned snapshot is never rewritten.';
comment on view public.v_canonical_daily_performance_input is
  'Verified canonical Daily Result facts retained for the future Performance phase; no dashboard is created here.';

commit;
