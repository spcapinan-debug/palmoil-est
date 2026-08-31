-- Phase 2D: Approved canonical Planning -> Scheduler -> immutable Work Order baseline.
-- Additive only: historical Work Orders are not rewritten and downstream Result/Survey/Payroll
-- calculations are intentionally left unchanged.
begin;

alter table public.work_orders
  add column scheduled_end_date date,
  add column planning_snapshot_at timestamptz,
  add column canonical_create_request_key text,
  add column planned_equipment_cost numeric not null default 0,
  add column planned_contractor_cost numeric not null default 0,
  add column headcount_variance_reason text;

alter table public.work_orders
  add constraint work_orders_phase2d_costs_nonnegative
  check (
    planned_labor_cost >= 0 and planned_material_cost >= 0
    and planned_equipment_cost >= 0 and planned_machine_cost >= 0
    and planned_fuel_cost >= 0 and planned_contractor_cost >= 0
    and planned_total_cost >= 0
  ),
  add constraint work_orders_phase2d_date_range_valid
  check (scheduled_end_date is null or scheduled_date is null or scheduled_end_date >= scheduled_date);

create unique index work_orders_canonical_request_key_unique
  on public.work_orders (canonical_create_request_key)
  where canonical_create_request_key is not null;

create table public.work_order_labor_requirements (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  source_planned_work_labor_requirement_id uuid not null
    references public.planned_work_labor_requirements(id) on delete restrict,
  source_budget_rate_role_id text not null,
  source_budget_activity_rate_id text not null,
  role_position text not null,
  worker_group_name text,
  rate_amount numeric not null,
  uom text not null,
  calculation_method text,
  rate_basis text not null,
  rate_category text,
  payee_type text,
  affects_payroll boolean not null default true,
  planned_headcount numeric not null,
  planned_basis_quantity numeric not null,
  planned_amount numeric not null,
  snapshot_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (work_order_id, source_planned_work_labor_requirement_id),
  check (rate_amount >= 0),
  check (planned_headcount > 0),
  check (planned_basis_quantity > 0),
  check (planned_amount >= 0)
);
create index work_order_labor_requirements_order_idx
  on public.work_order_labor_requirements (work_order_id, role_position);
alter table public.work_order_labor_requirements enable row level security;

alter table public.work_order_materials
  add column source_planned_work_material_id uuid
    references public.planned_work_materials(id) on delete restrict,
  add column snapshot_usage_basis text,
  add column snapshot_usage_rate numeric,
  add column snapshot_basis_quantity numeric,
  add column snapshot_unit_cost numeric,
  add column snapshot_amount_per_basis numeric,
  add column planned_amount numeric,
  add column snapshot_at timestamptz;

create unique index work_order_materials_source_planned_unique
  on public.work_order_materials (work_order_id, source_planned_work_material_id)
  where source_planned_work_material_id is not null;

create table public.work_order_resource_requirements (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  source_planned_work_resource_requirement_id uuid not null
    references public.planned_work_resource_requirements(id) on delete restrict,
  source_budget_resource_requirement_id uuid,
  source_budget_activity_rate_id text not null,
  resource_type text not null,
  resource_code text,
  resource_name text not null,
  preferred_vehicle_id uuid references public.vehicles(id) on delete set null,
  preferred_vehicle_type text,
  planned_quantity numeric not null,
  quantity_basis text not null,
  planned_hours numeric not null,
  planned_km numeric not null,
  planned_rai numeric not null,
  planned_ton numeric not null,
  resource_rate_amount numeric,
  resource_rate_uom text,
  calculation_method text,
  planned_resource_cost numeric not null,
  fuel_required boolean not null default false,
  fuel_metric_basis text,
  fuel_standard_rate numeric,
  planned_fuel_liters numeric not null,
  fuel_unit_cost numeric,
  planned_fuel_cost numeric not null,
  snapshot_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (work_order_id, source_planned_work_resource_requirement_id),
  check (resource_type in ('equipment', 'machine', 'vehicle', 'fuel')),
  check (quantity_basis in ('unit', 'hour', 'km', 'rai', 'ton')),
  check (fuel_metric_basis is null or fuel_metric_basis in ('L/hour', 'km/L', 'L/rai', 'L/ton')),
  check (planned_quantity >= 0 and planned_hours >= 0 and planned_km >= 0
    and planned_rai >= 0 and planned_ton >= 0),
  check (planned_resource_cost >= 0 and planned_fuel_liters >= 0 and planned_fuel_cost >= 0)
);
create index work_order_resource_requirements_order_idx
  on public.work_order_resource_requirements (work_order_id, resource_type);
alter table public.work_order_resource_requirements enable row level security;

alter table public.work_order_workers
  alter column employee_id drop not null,
  add column work_order_labor_requirement_id uuid
    references public.work_order_labor_requirements(id) on delete restrict,
  add column contractor_id uuid references public.contractors(id) on delete restrict,
  add column assignment_type text not null default 'employee',
  add column assigned_headcount numeric not null default 1,
  add column provider_name text,
  add column updated_at timestamptz not null default now();

alter table public.work_order_workers
  add constraint work_order_workers_phase2d_assignment_type
    check (assignment_type in ('employee', 'contractor')),
  add constraint work_order_workers_phase2d_headcount_positive
    check (assigned_headcount > 0),
  add constraint work_order_workers_phase2d_identity
    check (
      (assignment_type = 'employee' and employee_id is not null and contractor_id is null)
      or (assignment_type = 'contractor' and contractor_id is not null and employee_id is null)
    ) not valid;

create unique index work_order_workers_contractor_requirement_unique
  on public.work_order_workers (work_order_id, work_order_labor_requirement_id, contractor_id)
  where contractor_id is not null and work_order_labor_requirement_id is not null;

create table public.work_order_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_resource_requirement_id uuid not null
    references public.work_order_resource_requirements(id) on delete restrict,
  selected_vehicle_id uuid references public.vehicles(id) on delete restrict,
  contractor_id uuid references public.contractors(id) on delete restrict,
  driver_work_order_worker_id uuid references public.work_order_workers(id) on delete restrict,
  planned_quantity numeric not null default 0,
  planned_hours numeric not null default 0,
  planned_km numeric not null default 0,
  planned_rai numeric not null default 0,
  planned_ton numeric not null default 0,
  planned_fuel_liters numeric not null default 0,
  vehicle_variance_reason text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, work_order_resource_requirement_id),
  check (planned_quantity >= 0 and planned_hours >= 0 and planned_km >= 0
    and planned_rai >= 0 and planned_ton >= 0 and planned_fuel_liters >= 0)
);
create index work_order_resource_assignments_vehicle_idx
  on public.work_order_resource_assignments (work_order_id, selected_vehicle_id)
  where selected_vehicle_id is not null;
alter table public.work_order_resource_assignments enable row level security;

alter table public.work_order_machines
  add column work_order_resource_requirement_id uuid
    references public.work_order_resource_requirements(id) on delete restrict,
  add column driver_work_order_worker_id uuid
    references public.work_order_workers(id) on delete restrict,
  add column preferred_vehicle_id uuid references public.vehicles(id) on delete set null,
  add column preferred_vehicle_type text,
  add column vehicle_variance_reason text,
  add column vehicle_changed_by uuid references public.profiles(id) on delete set null,
  add column vehicle_changed_at timestamptz;

create unique index work_order_machines_resource_requirement_unique
  on public.work_order_machines (work_order_id, work_order_resource_requirement_id)
  where work_order_resource_requirement_id is not null;

create or replace function public.guard_phase2d_work_order_header_snapshot()
returns trigger language plpgsql security invoker set search_path = ''
as $phase2d_header_guard$
begin
  if old.workflow_source = 'canonical_planning' and (
    new.planned_work_item_id is distinct from old.planned_work_item_id
    or new.block_id is distinct from old.block_id
    or new.plot_id is distinct from old.plot_id
    or new.activity_id is distinct from old.activity_id
    or new.ap_code is distinct from old.ap_code
    or new.planned_quantity is distinct from old.planned_quantity
    or new.planned_unit is distinct from old.planned_unit
    or new.planned_labor_cost is distinct from old.planned_labor_cost
    or new.planned_material_cost is distinct from old.planned_material_cost
    or new.planned_equipment_cost is distinct from old.planned_equipment_cost
    or new.planned_machine_cost is distinct from old.planned_machine_cost
    or new.planned_fuel_cost is distinct from old.planned_fuel_cost
    or new.planned_contractor_cost is distinct from old.planned_contractor_cost
    or new.planned_total_cost is distinct from old.planned_total_cost
    or new.workflow_source is distinct from old.workflow_source
    or new.workflow_version is distinct from old.workflow_version
    or new.planning_snapshot_at is distinct from old.planning_snapshot_at
    or new.canonical_create_request_key is distinct from old.canonical_create_request_key
  ) then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_SNAPSHOT_FROZEN';
  end if;
  return new;
end
$phase2d_header_guard$;

create trigger guard_phase2d_work_order_header_snapshot
before update on public.work_orders for each row
execute function public.guard_phase2d_work_order_header_snapshot();

create or replace function public.guard_phase2d_immutable_requirement()
returns trigger language plpgsql security invoker set search_path = ''
as $phase2d_requirement_guard$
begin
  if current_setting('app.phase2d_canonical_create', true) is distinct from 'on' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_SNAPSHOT_FROZEN';
  end if;
  return coalesce(new, old);
end
$phase2d_requirement_guard$;

create trigger guard_work_order_labor_requirement_update
before update or delete on public.work_order_labor_requirements for each row
execute function public.guard_phase2d_immutable_requirement();
create trigger guard_work_order_resource_requirement_update
before update or delete on public.work_order_resource_requirements for each row
execute function public.guard_phase2d_immutable_requirement();

create or replace function public.guard_phase2d_material_snapshot()
returns trigger language plpgsql security invoker set search_path = ''
as $phase2d_material_guard$
begin
  if old.source_planned_work_material_id is not null
    and current_setting('app.phase2d_canonical_create', true) is distinct from 'on'
    and (tg_op = 'DELETE'
    or new.source_planned_work_material_id is distinct from old.source_planned_work_material_id
    or new.material_id is distinct from old.material_id
    or new.unit_id is distinct from old.unit_id
    or new.planned_quantity is distinct from old.planned_quantity
    or new.snapshot_usage_basis is distinct from old.snapshot_usage_basis
    or new.snapshot_usage_rate is distinct from old.snapshot_usage_rate
    or new.snapshot_basis_quantity is distinct from old.snapshot_basis_quantity
    or new.snapshot_unit_cost is distinct from old.snapshot_unit_cost
    or new.snapshot_amount_per_basis is distinct from old.snapshot_amount_per_basis
    or new.planned_amount is distinct from old.planned_amount
    or new.snapshot_at is distinct from old.snapshot_at
  ) then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_MATERIAL_SNAPSHOT_FROZEN';
  end if;
  return coalesce(new, old);
end
$phase2d_material_guard$;

create trigger guard_phase2d_material_snapshot
before update or delete on public.work_order_materials for each row
execute function public.guard_phase2d_material_snapshot();

create or replace function public.guard_phase2d_worker_assignment()
returns trigger language plpgsql security invoker set search_path = ''
as $phase2d_worker_guard$
declare
  v_order_id uuid := coalesce(new.work_order_id, old.work_order_id);
  v_source text;
  v_status text;
begin
  select workflow_source, status into v_source, v_status
  from public.work_orders where id = v_order_id;
  if v_source = 'canonical_planning'
    and current_setting('app.phase2d_draft_action', true) is distinct from 'on'
  then
    if tg_op <> 'UPDATE'
      or new.work_order_labor_requirement_id is distinct from old.work_order_labor_requirement_id
      or new.employee_id is distinct from old.employee_id
      or new.contractor_id is distinct from old.contractor_id
      or new.assignment_type is distinct from old.assignment_type
      or new.assigned_headcount is distinct from old.assigned_headcount
      or new.role is distinct from old.role
      or new.planned_hours is distinct from old.planned_hours
      or new.rate is distinct from old.rate
    then
      raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_ASSIGNMENT_ACTION_REQUIRED';
    end if;
  end if;
  if v_source = 'canonical_planning'
    and current_setting('app.phase2d_draft_action', true) = 'on'
    and v_status <> 'draft'
  then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_NOT_DRAFT';
  end if;
  return coalesce(new, old);
end
$phase2d_worker_guard$;

create trigger guard_phase2d_worker_assignment
before insert or update or delete on public.work_order_workers for each row
execute function public.guard_phase2d_worker_assignment();

create or replace function public.guard_phase2d_resource_assignment()
returns trigger language plpgsql security invoker set search_path = ''
as $phase2d_resource_assignment_guard$
declare
  v_order_id uuid := coalesce(new.work_order_id, old.work_order_id);
  v_source text;
  v_status text;
begin
  select workflow_source, status into v_source, v_status
  from public.work_orders where id = v_order_id;
  if v_source = 'canonical_planning' then
    if current_setting('app.phase2d_draft_action', true) is distinct from 'on' then
      raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_ASSIGNMENT_ACTION_REQUIRED';
    end if;
    if v_status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_NOT_DRAFT';
    end if;
  end if;
  return coalesce(new, old);
end
$phase2d_resource_assignment_guard$;

create trigger guard_phase2d_resource_assignment
before insert or update or delete on public.work_order_resource_assignments for each row
execute function public.guard_phase2d_resource_assignment();

create or replace function public.guard_phase2d_machine_assignment()
returns trigger language plpgsql security invoker set search_path = ''
as $phase2d_machine_guard$
declare
  v_order_id uuid := coalesce(new.work_order_id, old.work_order_id);
  v_source text;
  v_status text;
begin
  select workflow_source, status into v_source, v_status
  from public.work_orders where id = v_order_id;
  if v_source = 'canonical_planning'
    and coalesce(new.work_order_resource_requirement_id, old.work_order_resource_requirement_id) is not null
  then
    if current_setting('app.phase2d_draft_action', true) is distinct from 'on' then
      if tg_op <> 'UPDATE'
        or new.work_order_resource_requirement_id is distinct from old.work_order_resource_requirement_id
        or new.vehicle_id is distinct from old.vehicle_id
        or new.driver_employee_id is distinct from old.driver_employee_id
        or new.driver_work_order_worker_id is distinct from old.driver_work_order_worker_id
        or new.planned_hours is distinct from old.planned_hours
        or new.fuel_plan_liter is distinct from old.fuel_plan_liter
        or new.preferred_vehicle_id is distinct from old.preferred_vehicle_id
        or new.preferred_vehicle_type is distinct from old.preferred_vehicle_type
        or new.vehicle_variance_reason is distinct from old.vehicle_variance_reason
      then
        raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_ASSIGNMENT_ACTION_REQUIRED';
      end if;
    elsif v_status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_NOT_DRAFT';
    end if;
  end if;
  return coalesce(new, old);
end
$phase2d_machine_guard$;

create trigger guard_phase2d_machine_assignment
before insert or update or delete on public.work_order_machines for each row
execute function public.guard_phase2d_machine_assignment();

-- Existing browser policies remain available only for historical/non-canonical rows.
drop policy if exists "authenticated write work_orders" on public.work_orders;
create policy "authenticated write legacy work_orders" on public.work_orders
for all to authenticated
using (
  workflow_source <> 'canonical_planning'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.status = 'active' and p.role in ('super_admin','director','estate_manager','store_officer','fuel_officer','accounting'))
)
with check (
  workflow_source <> 'canonical_planning'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.status = 'active' and p.role in ('super_admin','director','estate_manager','store_officer','fuel_officer','accounting'))
);

drop policy if exists "authenticated write work_order_workers" on public.work_order_workers;
create policy "authenticated write legacy work_order_workers" on public.work_order_workers
for all to authenticated
using (exists (
  select 1 from public.work_orders wo where wo.id = work_order_id and wo.workflow_source <> 'canonical_planning'
))
with check (exists (
  select 1 from public.work_orders wo where wo.id = work_order_id and wo.workflow_source <> 'canonical_planning'
));

drop policy if exists "authenticated write work_order_materials" on public.work_order_materials;
create policy "authenticated write legacy work_order_materials" on public.work_order_materials
for all to authenticated
using (exists (
  select 1 from public.work_orders wo where wo.id = work_order_id and wo.workflow_source <> 'canonical_planning'
))
with check (exists (
  select 1 from public.work_orders wo where wo.id = work_order_id and wo.workflow_source <> 'canonical_planning'
));

drop policy if exists "authenticated write work_order_machines" on public.work_order_machines;
create policy "authenticated write legacy work_order_machines" on public.work_order_machines
for all to authenticated
using (exists (
  select 1 from public.work_orders wo where wo.id = work_order_id and wo.workflow_source <> 'canonical_planning'
))
with check (exists (
  select 1 from public.work_orders wo where wo.id = work_order_id and wo.workflow_source <> 'canonical_planning'
));

revoke all on table public.work_order_labor_requirements from public, anon, authenticated;
revoke all on table public.work_order_resource_requirements from public, anon, authenticated;
revoke all on table public.work_order_resource_assignments from public, anon, authenticated;
grant all on table public.work_order_labor_requirements to service_role;
grant all on table public.work_order_resource_requirements to service_role;
grant all on table public.work_order_resource_assignments to service_role;

create or replace function public.canonical_work_order_eligibility(p_planned_work_item_id uuid)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $phase2d_eligibility$
declare
  v_item public.planned_work_items%rowtype;
  v_plan public.annual_work_plans%rowtype;
  v_activity public.activities%rowtype;
begin
  select * into v_item from public.planned_work_items where id = p_planned_work_item_id;
  if not found then return 'PLANNED_WORK_ITEM_NOT_FOUND'; end if;
  select * into v_plan from public.annual_work_plans where id = v_item.annual_plan_id;
  if not found then return 'ANNUAL_PLAN_NOT_FOUND'; end if;
  if exists (select 1 from public.work_orders where planned_work_item_id = v_item.id) then
    return 'WORK_ORDER_ALREADY_CREATED';
  end if;
  if v_item.source_type is distinct from 'canonical_budget'
    or v_plan.source_type is distinct from 'canonical_budget'
  then return 'PLANNING_CANONICAL_LINEAGE_REQUIRED'; end if;
  if v_plan.status is distinct from 'approved' then return 'PLANNING_PLAN_NOT_APPROVED'; end if;
  if v_item.full_resource_snapshot_at is null
    or v_item.resource_snapshot_reconciliation_status is distinct from 'matched'
    or v_item.budget_block_resolution_snapshot is null
  then return 'PLANNING_RATE_RECONCILIATION_REQUIRED'; end if;
  select * into v_activity from public.activities where id = v_item.activity_id and status = 'active';
  if not found then return 'PLANNING_ACTIVITY_NOT_ACTIVE'; end if;
  if v_activity.require_worker and not exists (
    select 1 from public.planned_work_labor_requirements labor
    where labor.planned_work_item_id = v_item.id and labor.selected_for_plan
      and labor.planned_headcount > 0 and labor.planned_basis_quantity > 0
      and labor.rate_basis is not null and labor.snapshot_at is not null
  ) then return 'PLANNING_WORKER_REQUIREMENT_REQUIRED'; end if;
  if exists (
    select 1 from public.planned_work_labor_requirements labor
    where labor.planned_work_item_id = v_item.id and labor.selected_for_plan
      and (labor.rate_basis is null or labor.planned_headcount <= 0
        or labor.planned_basis_quantity <= 0 or labor.snapshot_at is null)
  ) then return 'PLANNING_LABOR_RATE_MAPPING_REQUIRED'; end if;
  if v_activity.require_material and not exists (
    select 1 from public.planned_work_materials material
    where material.planned_work_item_id = v_item.id
      and material.source_budget_rate_block_material_id is not null
      and material.snapshot_source_type = 'canonical_budget_block_material'
      and material.snapshot_at is not null
  ) then return 'PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE'; end if;
  if v_activity.require_equipment and not exists (
    select 1 from public.planned_work_resource_requirements resource
    where resource.planned_work_item_id = v_item.id and resource.selected_for_plan
      and resource.resource_type = 'equipment'
  ) then return 'PLANNING_EQUIPMENT_REQUIREMENT_REQUIRED'; end if;
  if v_activity.require_machine and not exists (
    select 1 from public.planned_work_resource_requirements resource
    where resource.planned_work_item_id = v_item.id and resource.selected_for_plan
      and resource.resource_type in ('machine', 'vehicle')
  ) then return 'PLANNING_MACHINE_REQUIREMENT_REQUIRED'; end if;
  if v_activity.require_fuel and not exists (
    select 1 from public.planned_work_resource_requirements resource
    where resource.planned_work_item_id = v_item.id and resource.selected_for_plan
      and (resource.resource_type = 'fuel' or resource.fuel_required)
      and resource.fuel_metric_basis in ('L/hour', 'km/L', 'L/rai', 'L/ton')
      and resource.fuel_standard_rate > 0 and resource.planned_fuel_liters > 0
  ) then return 'PLANNING_FUEL_REQUIREMENT_REQUIRED'; end if;
  if exists (
    select 1 from public.planned_work_resource_requirements resource
    where resource.planned_work_item_id = v_item.id and resource.selected_for_plan
      and (resource.planned_quantity <= 0 or resource.resource_rate_amount is null
        or nullif(btrim(resource.resource_rate_uom), '') is null)
  ) then return 'PLANNING_RESOURCE_RATE_REQUIRED'; end if;
  return 'READY';
end
$phase2d_eligibility$;

create or replace view public.v_canonical_work_order_scheduler_queue
with (security_invoker = true)
as
select
  item.id as planned_work_item_id,
  plan.id as annual_plan_id,
  plan.plan_year,
  plan.plan_name,
  plan.estate_id,
  item.block_id,
  item.plot_id,
  item.activity_id,
  item.ap_code,
  item.planned_start_date,
  item.planned_end_date,
  item.target_quantity,
  item.target_unit,
  item.suggested_team_id,
  item.note,
  public.canonical_work_order_eligibility(item.id) as eligibility_status,
  (select coalesce(sum(labor.estimated_amount), 0)
   from public.planned_work_labor_requirements labor
   where labor.planned_work_item_id = item.id and labor.selected_for_plan) as planned_labor_cost,
  (select coalesce(sum(material.estimated_amount), 0)
   from public.planned_work_materials material
   where material.planned_work_item_id = item.id) as planned_material_cost,
  (select coalesce(sum(resource.estimated_resource_cost), 0)
   from public.planned_work_resource_requirements resource
   where resource.planned_work_item_id = item.id and resource.selected_for_plan
     and resource.resource_type = 'equipment') as planned_equipment_cost,
  (select coalesce(sum(resource.estimated_resource_cost), 0)
   from public.planned_work_resource_requirements resource
   where resource.planned_work_item_id = item.id and resource.selected_for_plan
     and resource.resource_type in ('machine', 'vehicle')) as planned_machine_cost,
  (select coalesce(sum(resource.fuel_estimated_cost), 0)
   from public.planned_work_resource_requirements resource
   where resource.planned_work_item_id = item.id and resource.selected_for_plan) as planned_fuel_cost
from public.planned_work_items item
join public.annual_work_plans plan on plan.id = item.annual_plan_id
where item.source_type = 'canonical_budget'
  and plan.source_type = 'canonical_budget'
  and plan.status = 'approved'
  and not exists (select 1 from public.work_orders wo where wo.planned_work_item_id = item.id);

revoke all on public.v_canonical_work_order_scheduler_queue from public, anon, authenticated;
grant select on public.v_canonical_work_order_scheduler_queue to service_role;

create or replace function public.create_canonical_work_order_from_planned_item(
  p_planned_work_item_id uuid,
  p_actor_profile_id uuid,
  p_request_key text,
  p_scheduled_date date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2d_create$
declare
  v_item public.planned_work_items%rowtype;
  v_plan public.annual_work_plans%rowtype;
  v_order public.work_orders%rowtype;
  v_existing public.work_orders%rowtype;
  v_actor_role text;
  v_request_key text := nullif(btrim(p_request_key), '');
  v_supervisor uuid;
  v_team_contractor uuid;
  v_labor_cost numeric := 0;
  v_material_cost numeric := 0;
  v_equipment_cost numeric := 0;
  v_machine_cost numeric := 0;
  v_fuel_cost numeric := 0;
  v_contractor_cost numeric := 0;
  v_total_cost numeric := 0;
  v_labor_count integer := 0;
  v_material_count integer := 0;
  v_resource_count integer := 0;
  v_work_order_no text;
begin
  if v_request_key is null or char_length(v_request_key) > 200 then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_REQUEST_KEY_INVALID';
  end if;
  select role into v_actor_role from public.profiles
  where id = p_actor_profile_id and status = 'active';
  if not found then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;

  select * into v_item from public.planned_work_items
  where id = p_planned_work_item_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND'; end if;
  select * into v_plan from public.annual_work_plans where id = v_item.annual_plan_id for key share;
  if not found then raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND'; end if;

  select * into v_existing from public.work_orders
  where planned_work_item_id = v_item.id order by created_at, id limit 1;
  if found then
    if v_existing.workflow_source is distinct from 'canonical_planning' then
      raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_WORK_ORDER_NOT_READY';
    end if;
    return jsonb_build_object('work_order', to_jsonb(v_existing), 'already_exists', true);
  end if;

  if public.canonical_work_order_eligibility(v_item.id) <> 'READY' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_WORK_ORDER_NOT_READY',
      detail = public.canonical_work_order_eligibility(v_item.id);
  end if;

  if v_item.suggested_team_id is not null then
    select supervisor_employee_id, contractor_id into v_supervisor, v_team_contractor
    from public.teams where id = v_item.suggested_team_id and status = 'active';
  end if;

  select coalesce(sum(estimated_amount), 0), count(*)::integer,
    coalesce(sum(estimated_amount) filter (
      where lower(coalesce(payee_type, '')) like '%contract%'
        or coalesce(payee_type, '') like '%ผู้รับเหมา%'
    ), 0)
  into v_labor_cost, v_labor_count, v_contractor_cost
  from public.planned_work_labor_requirements
  where planned_work_item_id = v_item.id and selected_for_plan;
  select coalesce(sum(estimated_amount), 0), count(*)::integer
  into v_material_cost, v_material_count
  from public.planned_work_materials where planned_work_item_id = v_item.id;
  select
    coalesce(sum(estimated_resource_cost) filter (where resource_type = 'equipment'), 0),
    coalesce(sum(estimated_resource_cost) filter (where resource_type in ('machine', 'vehicle')), 0),
    coalesce(sum(fuel_estimated_cost), 0),
    count(*)::integer
  into v_equipment_cost, v_machine_cost, v_fuel_cost, v_resource_count
  from public.planned_work_resource_requirements
  where planned_work_item_id = v_item.id and selected_for_plan;
  v_total_cost := v_labor_cost + v_material_cost + v_equipment_cost + v_machine_cost + v_fuel_cost;

  v_work_order_no := case when v_actor_role in ('uat_manager', 'uat_supervisor')
    then 'WEBTEST-UAT-WO-' else 'WO-' || v_plan.plan_year::text || '-' end
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  perform set_config('app.phase2d_canonical_create', 'on', true);
  begin
    insert into public.work_orders (
      work_order_no, planned_work_item_id, estate_id, plot_id, block_id, ap_code,
      activity_id, scheduled_date, scheduled_end_date, supervisor_employee_id,
      team_id, contractor_id, status, planned_quantity, planned_unit,
      planned_labor_cost, planned_material_cost, planned_equipment_cost,
      planned_machine_cost, planned_fuel_cost, planned_contractor_cost,
      planned_total_cost, note, created_by_profile_id, workflow_source,
      workflow_version, planning_snapshot_at, canonical_create_request_key,
      created_at, updated_at, last_action_at
    ) values (
      v_work_order_no, v_item.id, v_plan.estate_id, v_item.plot_id, v_item.block_id, v_item.ap_code,
      v_item.activity_id, coalesce(p_scheduled_date, v_item.planned_start_date, current_date),
      coalesce(v_item.planned_end_date, p_scheduled_date, v_item.planned_start_date, current_date),
      v_supervisor, v_item.suggested_team_id, v_team_contractor, 'draft',
      v_item.target_quantity, v_item.target_unit,
      v_labor_cost, v_material_cost, v_equipment_cost, v_machine_cost,
      v_fuel_cost, v_contractor_cost, v_total_cost,
      coalesce(nullif(btrim(p_note), ''), v_item.note), p_actor_profile_id,
      'canonical_planning', 2, transaction_timestamp(), v_request_key,
      transaction_timestamp(), transaction_timestamp(), transaction_timestamp()
    ) returning * into v_order;
  exception when unique_violation then
    select * into v_existing from public.work_orders
    where planned_work_item_id = v_item.id order by created_at, id limit 1;
    if found and v_existing.workflow_source = 'canonical_planning' then
      return jsonb_build_object('work_order', to_jsonb(v_existing), 'already_exists', true);
    end if;
    raise;
  end;

  insert into public.work_order_labor_requirements (
    work_order_id, source_planned_work_labor_requirement_id,
    source_budget_rate_role_id, source_budget_activity_rate_id,
    role_position, worker_group_name, rate_amount, uom, calculation_method,
    rate_basis, rate_category, payee_type, affects_payroll,
    planned_headcount, planned_basis_quantity, planned_amount, snapshot_at
  )
  select v_order.id, labor.id, labor.source_budget_rate_role_id,
    labor.source_budget_activity_rate_id, labor.role_position, labor.worker_group_name,
    labor.rate_amount, labor.uom, labor.calculation_method, labor.rate_basis,
    labor.rate_category, labor.payee_type, labor.affects_payroll,
    labor.planned_headcount, labor.planned_basis_quantity,
    labor.estimated_amount, transaction_timestamp()
  from public.planned_work_labor_requirements labor
  where labor.planned_work_item_id = v_item.id and labor.selected_for_plan
  order by labor.source_budget_activity_rate_id, labor.source_budget_rate_role_id;

  insert into public.work_order_materials (
    work_order_id, material_id, planned_quantity, unit_id, status,
    source_planned_work_material_id, snapshot_usage_basis, snapshot_usage_rate,
    snapshot_basis_quantity, snapshot_unit_cost, snapshot_amount_per_basis,
    planned_amount, snapshot_at, created_at, updated_at
  )
  select v_order.id, material.material_id, material.planned_quantity, material.unit_id,
    'planned', material.id, material.snapshot_usage_basis, material.snapshot_usage_rate,
    material.snapshot_basis_quantity, material.snapshot_unit_cost,
    material.snapshot_amount_per_basis, material.estimated_amount,
    transaction_timestamp(), transaction_timestamp(), transaction_timestamp()
  from public.planned_work_materials material
  where material.planned_work_item_id = v_item.id
  order by material.id;

  insert into public.work_order_resource_requirements (
    work_order_id, source_planned_work_resource_requirement_id,
    source_budget_resource_requirement_id, source_budget_activity_rate_id,
    resource_type, resource_code, resource_name, preferred_vehicle_id,
    preferred_vehicle_type, planned_quantity, quantity_basis, planned_hours,
    planned_km, planned_rai, planned_ton, resource_rate_amount,
    resource_rate_uom, calculation_method, planned_resource_cost,
    fuel_required, fuel_metric_basis, fuel_standard_rate,
    planned_fuel_liters, fuel_unit_cost, planned_fuel_cost, snapshot_at
  )
  select v_order.id, resource.id, resource.source_budget_resource_requirement_id,
    resource.source_budget_activity_rate_id, resource.resource_type,
    resource.resource_code, resource.resource_name, resource.preferred_vehicle_id,
    resource.preferred_vehicle_type, resource.planned_quantity,
    resource.quantity_basis, resource.planned_hours, resource.planned_km,
    resource.planned_rai, resource.planned_ton, resource.resource_rate_amount,
    resource.resource_rate_uom, resource.calculation_method,
    resource.estimated_resource_cost, resource.fuel_required,
    resource.fuel_metric_basis, resource.fuel_standard_rate,
    resource.planned_fuel_liters, resource.fuel_unit_cost,
    resource.fuel_estimated_cost, transaction_timestamp()
  from public.planned_work_resource_requirements resource
  where resource.planned_work_item_id = v_item.id and resource.selected_for_plan
  order by resource.resource_type, resource.source_budget_activity_rate_id, resource.id;

  perform set_config('app.phase2d_canonical_create', 'off', true);

  return jsonb_build_object(
    'work_order', to_jsonb(v_order), 'already_exists', false,
    'labor_requirement_count', v_labor_count,
    'material_count', v_material_count,
    'resource_requirement_count', v_resource_count,
    'planned_cost', jsonb_build_object(
      'labor', v_labor_cost, 'material', v_material_cost,
      'equipment', v_equipment_cost, 'machine_vehicle', v_machine_cost,
      'fuel', v_fuel_cost, 'contractor_subset', v_contractor_cost,
      'total_without_double_count', v_total_cost
    )
  );
end
$phase2d_create$;

create or replace function public.update_canonical_work_order_draft(
  p_work_order_id uuid,
  p_actor_profile_id uuid,
  p_scheduled_date date,
  p_scheduled_end_date date,
  p_team_id uuid,
  p_supervisor_employee_id uuid,
  p_contractor_id uuid,
  p_labor_assignments jsonb,
  p_resource_assignments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2d_update_draft$
declare
  v_order public.work_orders%rowtype;
  v_labor jsonb := coalesce(p_labor_assignments, '[]'::jsonb);
  v_resources jsonb := coalesce(p_resource_assignments, '[]'::jsonb);
  v_row jsonb;
  v_requirement public.work_order_labor_requirements%rowtype;
  v_resource_requirement public.work_order_resource_requirements%rowtype;
  v_labor_requirement_id uuid;
  v_resource_requirement_id uuid;
  v_employee_id uuid;
  v_contractor_id uuid;
  v_vehicle_id uuid;
  v_driver_employee_id uuid;
  v_driver_contractor_id uuid;
  v_driver_requirement_id uuid;
  v_driver_assignment_id uuid;
  v_assignment_type text;
  v_headcount numeric;
  v_planned_hours numeric;
  v_variance_reason text;
  v_worker_count integer := 0;
  v_resource_count integer := 0;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles where id = p_actor_profile_id and status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;
  if jsonb_typeof(v_labor) <> 'array' or jsonb_typeof(v_resources) <> 'array' then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_ASSIGNMENT_PAYLOAD_INVALID';
  end if;
  if p_scheduled_date is null or p_scheduled_end_date is null
    or p_scheduled_end_date < p_scheduled_date
  then raise exception using errcode = 'P0001', message = 'WORK_ORDER_SCHEDULE_INVALID'; end if;

  select * into v_order from public.work_orders where id = p_work_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_ORDER_NOT_FOUND'; end if;
  if v_order.workflow_source is distinct from 'canonical_planning' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_REQUIRED';
  end if;
  if v_order.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_NOT_DRAFT';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.teams where id = p_team_id and status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_TEAM_NOT_ACTIVE'; end if;
  if p_supervisor_employee_id is not null and not exists (
    select 1 from public.employees where id = p_supervisor_employee_id and status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_SUPERVISOR_NOT_ACTIVE'; end if;
  if p_contractor_id is not null and not exists (
    select 1 from public.contractors where id = p_contractor_id and status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_CONTRACTOR_NOT_ACTIVE'; end if;

  if (select count(*) from jsonb_array_elements(v_labor))
    <> (select count(distinct coalesce(value->>'employee_id', '')
      || ':' || coalesce(value->>'contractor_id', '')
      || ':' || coalesce(value->>'labor_requirement_id', ''))
        from jsonb_array_elements(v_labor))
  then raise exception using errcode = 'P0001', message = 'WORK_ORDER_LABOR_ASSIGNMENT_DUPLICATE'; end if;
  if (select count(*) from jsonb_array_elements(v_resources)
      where nullif(value->>'selected_vehicle_id', '') is not null)
    <> (select count(distinct value->>'selected_vehicle_id') from jsonb_array_elements(v_resources)
      where nullif(value->>'selected_vehicle_id', '') is not null)
  then raise exception using errcode = 'P0001', message = 'WORK_ORDER_VEHICLE_ASSIGNMENT_DUPLICATE'; end if;

  perform set_config('app.phase2d_draft_action', 'on', true);
  update public.work_orders
  set scheduled_date = p_scheduled_date,
      scheduled_end_date = p_scheduled_end_date,
      team_id = p_team_id,
      supervisor_employee_id = p_supervisor_employee_id,
      contractor_id = p_contractor_id,
      updated_at = transaction_timestamp(),
      last_action_at = transaction_timestamp()
  where id = p_work_order_id;

  delete from public.work_order_machines
  where work_order_id = p_work_order_id and work_order_resource_requirement_id is not null;
  delete from public.work_order_resource_assignments where work_order_id = p_work_order_id;
  delete from public.work_order_workers
  where work_order_id = p_work_order_id and work_order_labor_requirement_id is not null;

  for v_row in select value from jsonb_array_elements(v_labor)
  loop
    v_labor_requirement_id := nullif(v_row->>'labor_requirement_id', '')::uuid;
    v_employee_id := nullif(v_row->>'employee_id', '')::uuid;
    v_contractor_id := nullif(v_row->>'contractor_id', '')::uuid;
    v_headcount := coalesce(nullif(v_row->>'assigned_headcount', '')::numeric, 1);
    v_planned_hours := coalesce(nullif(v_row->>'planned_hours', '')::numeric, 0);
    if (v_employee_id is null) = (v_contractor_id is null) then
      raise exception using errcode = 'P0001', message = 'WORK_ORDER_ASSIGNEE_IDENTITY_REQUIRED';
    end if;
    select * into v_requirement from public.work_order_labor_requirements
    where id = v_labor_requirement_id and work_order_id = p_work_order_id;
    if not found then raise exception using errcode = 'P0001', message = 'WORK_ORDER_LABOR_REQUIREMENT_NOT_FOUND'; end if;
    if v_employee_id is not null and not exists (
      select 1 from public.employees where id = v_employee_id and status = 'active'
    ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_EMPLOYEE_NOT_ACTIVE'; end if;
    if v_contractor_id is not null and not exists (
      select 1 from public.contractors where id = v_contractor_id and status = 'active'
    ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_CONTRACTOR_NOT_ACTIVE'; end if;
    if v_headcount <= 0 or v_planned_hours < 0 then
      raise exception using errcode = 'P0001', message = 'WORK_ORDER_LABOR_ASSIGNMENT_QUANTITY_INVALID';
    end if;
    v_assignment_type := case when v_employee_id is not null then 'employee' else 'contractor' end;
    insert into public.work_order_workers (
      work_order_id, employee_id, role, planned_hours, actual_hours, rate, status,
      work_order_labor_requirement_id, contractor_id, assignment_type,
      assigned_headcount, provider_name, created_at, updated_at
    ) values (
      p_work_order_id, v_employee_id, v_requirement.role_position,
      v_planned_hours, 0, v_requirement.rate_amount, 'planned',
      v_requirement.id, v_contractor_id, v_assignment_type, v_headcount,
      nullif(v_row->>'provider_name', ''), transaction_timestamp(), transaction_timestamp()
    );
    v_worker_count := v_worker_count + 1;
  end loop;

  for v_row in select value from jsonb_array_elements(v_resources)
  loop
    v_resource_requirement_id := nullif(v_row->>'resource_requirement_id', '')::uuid;
    v_vehicle_id := nullif(v_row->>'selected_vehicle_id', '')::uuid;
    v_contractor_id := nullif(v_row->>'contractor_id', '')::uuid;
    v_driver_employee_id := nullif(v_row->>'driver_employee_id', '')::uuid;
    v_driver_contractor_id := nullif(v_row->>'driver_contractor_id', '')::uuid;
    v_driver_requirement_id := nullif(v_row->>'driver_labor_requirement_id', '')::uuid;
    v_variance_reason := nullif(btrim(v_row->>'vehicle_variance_reason'), '');
    v_driver_assignment_id := null;
    select * into v_resource_requirement from public.work_order_resource_requirements
    where id = v_resource_requirement_id and work_order_id = p_work_order_id;
    if not found then raise exception using errcode = 'P0001', message = 'WORK_ORDER_RESOURCE_REQUIREMENT_NOT_FOUND'; end if;
    if v_vehicle_id is not null and not exists (
      select 1 from public.vehicles where id = v_vehicle_id and status = 'active'
    ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_VEHICLE_NOT_ACTIVE'; end if;
    if v_contractor_id is not null and not exists (
      select 1 from public.contractors where id = v_contractor_id and status = 'active'
    ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_CONTRACTOR_NOT_ACTIVE'; end if;
    if v_vehicle_id is not null
      and v_resource_requirement.preferred_vehicle_id is not null
      and v_vehicle_id <> v_resource_requirement.preferred_vehicle_id
      and v_variance_reason is null
    then raise exception using errcode = 'P0001', message = 'WORK_ORDER_VEHICLE_VARIANCE_REASON_REQUIRED'; end if;
    if (v_driver_employee_id is not null or v_driver_contractor_id is not null) then
      select worker.id into v_driver_assignment_id
      from public.work_order_workers worker
      where worker.work_order_id = p_work_order_id
        and (v_driver_requirement_id is null
          or worker.work_order_labor_requirement_id = v_driver_requirement_id)
        and ((v_driver_employee_id is not null and worker.employee_id = v_driver_employee_id)
          or (v_driver_contractor_id is not null and worker.contractor_id = v_driver_contractor_id))
      order by worker.created_at, worker.id limit 1;
      if v_driver_assignment_id is null then
        raise exception using errcode = 'P0001', message = 'WORK_ORDER_DRIVER_LABOR_ASSIGNMENT_REQUIRED';
      end if;
    end if;

    insert into public.work_order_resource_assignments (
      work_order_id, work_order_resource_requirement_id, selected_vehicle_id,
      contractor_id, driver_work_order_worker_id, planned_quantity, planned_hours,
      planned_km, planned_rai, planned_ton, planned_fuel_liters,
      vehicle_variance_reason, changed_by, changed_at, created_at, updated_at
    ) values (
      p_work_order_id, v_resource_requirement.id, v_vehicle_id, v_contractor_id,
      v_driver_assignment_id,
      coalesce(nullif(v_row->>'planned_quantity', '')::numeric, v_resource_requirement.planned_quantity),
      coalesce(nullif(v_row->>'planned_hours', '')::numeric, v_resource_requirement.planned_hours),
      coalesce(nullif(v_row->>'planned_km', '')::numeric, v_resource_requirement.planned_km),
      coalesce(nullif(v_row->>'planned_rai', '')::numeric, v_resource_requirement.planned_rai),
      coalesce(nullif(v_row->>'planned_ton', '')::numeric, v_resource_requirement.planned_ton),
      coalesce(nullif(v_row->>'planned_fuel_liters', '')::numeric, v_resource_requirement.planned_fuel_liters),
      v_variance_reason, p_actor_profile_id, transaction_timestamp(),
      transaction_timestamp(), transaction_timestamp()
    );
    if v_vehicle_id is not null then
      insert into public.work_order_machines (
        work_order_id, vehicle_id, driver_employee_id, planned_hours,
        actual_hours, fuel_plan_liter, fuel_actual_liter, status,
        work_order_resource_requirement_id, driver_work_order_worker_id,
        preferred_vehicle_id, preferred_vehicle_type, vehicle_variance_reason,
        vehicle_changed_by, vehicle_changed_at, created_at, updated_at
      ) values (
        p_work_order_id, v_vehicle_id, v_driver_employee_id,
        coalesce(nullif(v_row->>'planned_hours', '')::numeric, v_resource_requirement.planned_hours),
        0, coalesce(nullif(v_row->>'planned_fuel_liters', '')::numeric, v_resource_requirement.planned_fuel_liters),
        0, 'planned', v_resource_requirement.id, v_driver_assignment_id,
        v_resource_requirement.preferred_vehicle_id, v_resource_requirement.preferred_vehicle_type,
        v_variance_reason, p_actor_profile_id,
        case when v_vehicle_id is distinct from v_resource_requirement.preferred_vehicle_id
          then transaction_timestamp() else null end,
        transaction_timestamp(), transaction_timestamp()
      );
    end if;
    v_resource_count := v_resource_count + 1;
  end loop;

  perform set_config('app.phase2d_draft_action', 'off', true);

  select * into v_order from public.work_orders where id = p_work_order_id;
  return jsonb_build_object(
    'work_order', to_jsonb(v_order),
    'labor_assignment_count', v_worker_count,
    'resource_assignment_count', v_resource_count
  );
end
$phase2d_update_draft$;

create or replace function public.submit_canonical_work_order(
  p_work_order_id uuid,
  p_actor_profile_id uuid,
  p_headcount_variance_reason text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2d_submit$
declare
  v_order public.work_orders%rowtype;
  v_activity public.activities%rowtype;
  v_variance_reason text := nullif(btrim(p_headcount_variance_reason), '');
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles where id = p_actor_profile_id and status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND'; end if;
  select * into v_order from public.work_orders where id = p_work_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'WORK_ORDER_NOT_FOUND'; end if;
  if v_order.workflow_source is distinct from 'canonical_planning' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_REQUIRED';
  end if;
  if v_order.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORK_ORDER_NOT_DRAFT';
  end if;
  select * into v_activity from public.activities where id = v_order.activity_id and status = 'active';
  if not found then raise exception using errcode = 'P0001', message = 'WORK_ORDER_ACTIVITY_NOT_ACTIVE'; end if;
  if v_order.scheduled_date is null or v_order.scheduled_end_date is null
    or v_order.scheduled_end_date < v_order.scheduled_date
  then raise exception using errcode = 'P0001', message = 'WORK_ORDER_SCHEDULE_INVALID'; end if;

  if v_activity.require_worker and (
    not exists (select 1 from public.work_order_labor_requirements where work_order_id = v_order.id)
    or exists (
      select 1 from public.work_order_labor_requirements requirement
      where requirement.work_order_id = v_order.id
        and coalesce((select sum(worker.assigned_headcount)
          from public.work_order_workers worker
          where worker.work_order_labor_requirement_id = requirement.id
            and worker.status <> 'cancelled'), 0) <= 0
    )
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_WORKER_ASSIGNMENT_REQUIRED'; end if;

  if exists (
    select 1 from public.work_order_labor_requirements requirement
    where requirement.work_order_id = v_order.id
      and coalesce((select sum(worker.assigned_headcount)
        from public.work_order_workers worker
        where worker.work_order_labor_requirement_id = requirement.id
          and worker.status <> 'cancelled'), 0) <> requirement.planned_headcount
  ) and v_variance_reason is null
  then raise exception using errcode = 'P0001', message = 'WORK_ORDER_HEADCOUNT_VARIANCE_REASON_REQUIRED'; end if;

  if v_activity.require_material and (
    not exists (select 1 from public.work_order_materials
      where work_order_id = v_order.id and source_planned_work_material_id is not null)
    or (select count(*) from public.work_order_materials
        where work_order_id = v_order.id and source_planned_work_material_id is not null)
      <> (select count(*) from public.planned_work_materials
        where planned_work_item_id = v_order.planned_work_item_id)
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_MATERIAL_SNAPSHOT_REQUIRED'; end if;

  if v_activity.require_equipment and exists (
    select 1 from public.work_order_resource_requirements requirement
    where requirement.work_order_id = v_order.id and requirement.resource_type = 'equipment'
      and not exists (select 1 from public.work_order_resource_assignments assignment
        where assignment.work_order_resource_requirement_id = requirement.id)
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_EQUIPMENT_ASSIGNMENT_REQUIRED'; end if;

  if v_activity.require_machine and exists (
    select 1 from public.work_order_resource_requirements requirement
    where requirement.work_order_id = v_order.id and requirement.resource_type in ('machine', 'vehicle')
      and not exists (select 1 from public.work_order_resource_assignments assignment
        where assignment.work_order_resource_requirement_id = requirement.id
          and (assignment.selected_vehicle_id is not null or assignment.contractor_id is not null))
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_MACHINE_ASSIGNMENT_REQUIRED'; end if;

  if v_activity.require_fuel and exists (
    select 1 from public.work_order_resource_requirements requirement
    where requirement.work_order_id = v_order.id
      and (requirement.resource_type = 'fuel' or requirement.fuel_required)
      and (requirement.fuel_metric_basis not in ('L/hour', 'km/L', 'L/rai', 'L/ton')
        or requirement.fuel_standard_rate <= 0
        or not exists (select 1 from public.work_order_resource_assignments assignment
          where assignment.work_order_resource_requirement_id = requirement.id
            and assignment.planned_fuel_liters > 0))
  ) then raise exception using errcode = 'P0001', message = 'WORK_ORDER_FUEL_PLAN_REQUIRED'; end if;

  update public.work_orders
  set status = 'submitted',
      headcount_variance_reason = v_variance_reason,
      updated_at = transaction_timestamp(),
      last_action_at = transaction_timestamp()
  where id = v_order.id returning * into v_order;
  insert into public.work_order_status_logs (
    work_order_id, from_status, to_status, changed_by, note, changed_at
  ) values (
    v_order.id, 'draft', 'submitted', p_actor_profile_id,
    nullif(btrim(p_note), ''), transaction_timestamp()
  );
  return jsonb_build_object('work_order', to_jsonb(v_order), 'submitted', true);
end
$phase2d_submit$;

revoke all on function public.canonical_work_order_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.create_canonical_work_order_from_planned_item(uuid, uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.update_canonical_work_order_draft(uuid, uuid, date, date, uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.submit_canonical_work_order(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.canonical_work_order_eligibility(uuid) to service_role;
grant execute on function public.create_canonical_work_order_from_planned_item(uuid, uuid, text, date, text) to service_role;
grant execute on function public.update_canonical_work_order_draft(uuid, uuid, date, date, uuid, uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.submit_canonical_work_order(uuid, uuid, text, text) to service_role;

comment on table public.work_order_labor_requirements is
  'Immutable WO-level Labor Rate requirements copied from approved Planning; future Payroll must use this frozen basis.';
comment on table public.work_order_resource_requirements is
  'Immutable Equipment/Machine/Vehicle/Fuel baseline copied from approved Planning.';
comment on table public.work_order_resource_assignments is
  'Draft Scheduler actual resource/provider/driver selection; never rewrites the Planning baseline.';
comment on column public.work_orders.planned_contractor_cost is
  'Informational subset already included in Labor/Resource components; excluded from planned_total_cost to prevent double counting.';

commit;
