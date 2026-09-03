const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260830232530_phase2d_scheduler_work_order_snapshot.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const tableSource = fs.readFileSync(path.join(root, "api", "farm-tables.js"), "utf8");
const actions = require("../api/farm-actions")._test;
const tables = require("../api/farm-tables")._test;

test("canonical Scheduler eligibility is approved, reconciled, complete and one-to-one", () => {
  assert.match(migration, /create or replace function public\.canonical_work_order_eligibility/);
  assert.match(migration, /v_plan\.status is distinct from 'approved'/);
  assert.match(migration, /source_type is distinct from 'canonical_budget'/);
  assert.match(migration, /full_resource_snapshot_at is null/);
  assert.match(migration, /resource_snapshot_reconciliation_status is distinct from 'matched'/);
  assert.match(migration, /exists \(select 1 from public\.work_orders where planned_work_item_id = v_item\.id\)/);
  assert.match(migration, /select \* into v_existing from public\.work_orders[\s\S]*where planned_work_item_id = v_item\.id/);
});

test("Scheduler view is service-only and contains only approved items without Work Orders", () => {
  assert.match(migration, /create or replace view public\.v_canonical_work_order_scheduler_queue[\s\S]*security_invoker = true/);
  assert.match(migration, /plan\.status = 'approved'/);
  assert.match(migration, /not exists \(select 1 from public\.work_orders wo where wo\.planned_work_item_id = item\.id\)/);
  assert.match(migration, /revoke all on public\.v_canonical_work_order_scheduler_queue from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.v_canonical_work_order_scheduler_queue to service_role/);
});

test("canonical create is action-only, confirmed, scoped and idempotent", () => {
  const definition = actions.ACTIONS.create_canonical_work_order_from_planned_item;
  assert.equal(definition.permission, "farm.work_order.create");
  assert.equal(definition.confirmation, true);
  assert.equal(definition.rpc, "create_canonical_work_order_from_planned_item");
  assert.match(actionSource, /p_request_key: context\.idempotencyKey/);
  assert.match(actionSource, /create_canonical_work_order_from_planned_item[\s\S]*authorizeWorkOrderScope/);
  assert.match(migration, /canonical_create_request_key text/);
  assert.match(migration, /already_exists', true/);
});

test("legacy create remains available and canonical input remains fail closed", () => {
  assert.equal(actions.ACTIONS.create_work_order_from_plan_item.permission, "farm.work_order.create");
  assert.match(actionSource, /item\.source_type === "canonical_budget" \|\| annual\?\.source_type === "canonical_budget"/);
  assert.match(actionSource, /PLANNING_CANONICAL_WORK_ORDER_NOT_READY/);
});

test("Work Order labor requirements copy every selected Planning rate without deduplication", () => {
  for (const field of [
    "source_planned_work_labor_requirement_id", "source_budget_rate_role_id", "source_budget_activity_rate_id",
    "role_position", "worker_group_name", "rate_amount", "uom", "calculation_method", "rate_basis",
    "rate_category", "payee_type", "affects_payroll", "planned_headcount", "planned_basis_quantity",
    "planned_amount", "snapshot_at",
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /from public\.planned_work_labor_requirements[\s\S]*where planned_work_item_id = v_item\.id and selected_for_plan/);
  assert.doesNotMatch(migration, /distinct on[\s\S]*planned_work_labor_requirements/i);
});

test("actual workers are separate from labor requirements and allow many employees per rate", () => {
  assert.match(migration, /work_order_labor_requirement_id uuid\s+references public\.work_order_labor_requirements/);
  assert.match(migration, /assignment_type text/);
  assert.match(migration, /contractor_id uuid references public\.contractors/);
  assert.match(migration, /for v_row in select value from jsonb_array_elements\(v_labor\)/);
  assert.match(app, /data-canonical-labor-employees/);
  assert.match(app, /selectedOptions/);
});

test("Material is copied exactly from Planning lineage without Master recomputation", () => {
  assert.match(migration, /source_planned_work_material_id uuid/);
  assert.match(migration, /insert into public\.work_order_materials[\s\S]*from public\.planned_work_materials material/);
  const create = migration.slice(migration.indexOf("create or replace function public.create_canonical_work_order_from_planned_item"), migration.indexOf("create or replace function public.update_canonical_work_order_draft"));
  assert.doesNotMatch(create, /budget_rate_block_materials|budget_rate_materials/);
});

test("equipment machine vehicle and fuel preserve immutable Planning baselines", () => {
  for (const field of [
    "source_planned_work_resource_requirement_id", "resource_type", "preferred_vehicle_id", "preferred_vehicle_type",
    "planned_quantity", "quantity_basis", "planned_hours", "planned_km", "planned_rai", "planned_ton",
    "resource_rate_amount", "resource_rate_uom", "calculation_method", "planned_resource_cost",
    "fuel_required", "fuel_metric_basis", "fuel_standard_rate", "planned_fuel_liters",
    "fuel_unit_cost", "planned_fuel_cost",
  ]) assert.match(migration, new RegExp(field));
  for (const basis of ["L/hour", "km/L", "L/rai", "L/ton"]) assert.match(migration, new RegExp(basis.replace("/", "\\/")));
});

test("vehicle actual selection keeps preferred lineage, variance and audit actor", () => {
  assert.match(migration, /work_order_resource_assignments/);
  assert.match(migration, /selected_vehicle_id/);
  assert.match(migration, /vehicle_variance_reason/);
  assert.match(migration, /changed_by/);
  assert.match(migration, /changed_at/);
  assert.match(migration, /WORK_ORDER_VEHICLE_VARIANCE_REASON_REQUIRED/);
});

test("driver links one labor assignment to vehicle operation without adding wage cost", () => {
  assert.match(migration, /driver_work_order_worker_id/);
  assert.match(migration, /WORK_ORDER_DRIVER_LABOR_ASSIGNMENT_REQUIRED/);
  const draft = migration.slice(migration.indexOf("create or replace function public.update_canonical_work_order_draft"), migration.indexOf("create or replace function public.submit_canonical_work_order"));
  assert.doesNotMatch(draft, /planned_labor_cost\s*=/);
  assert.doesNotMatch(draft, /rate\s*\+|rate\s*\*/);
});

test("cost rollup is componentized and contractor is an informational labor subset", () => {
  for (const field of [
    "planned_labor_cost", "planned_material_cost", "planned_equipment_cost", "planned_machine_cost",
    "planned_fuel_cost", "planned_contractor_cost", "planned_total_cost",
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /v_total_cost := v_labor_cost \+ v_material_cost \+ v_equipment_cost \+ v_machine_cost \+ v_fuel_cost/);
  assert.match(migration, /v_contractor_cost/);
});

test("draft save and submit use Activity Master gates and explicit headcount variance", () => {
  assert.equal(actions.ACTIONS.update_canonical_work_order_draft.permission, "farm.work_order.create");
  assert.equal(actions.ACTIONS.submit_work_order.permission, "farm.work_order.create");
  for (const code of [
    "WORK_ORDER_WORKER_ASSIGNMENT_REQUIRED", "WORK_ORDER_MATERIAL_SNAPSHOT_REQUIRED",
    "WORK_ORDER_EQUIPMENT_ASSIGNMENT_REQUIRED", "WORK_ORDER_MACHINE_ASSIGNMENT_REQUIRED",
    "WORK_ORDER_FUEL_PLAN_REQUIRED", "WORK_ORDER_HEADCOUNT_VARIANCE_REASON_REQUIRED",
  ]) assert.match(migration, new RegExp(code));
});

test("canonical snapshots are frozen and browser generic mutation is denied", () => {
  for (const table of ["work_order_labor_requirements", "work_order_resource_requirements", "work_order_resource_assignments"]) {
    assert.equal(tables.ACTION_ONLY_TABLES.has(table), true);
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.match(migration, /CANONICAL_WORK_ORDER_SNAPSHOT_FROZEN/);
  assert.match(tableSource, /assertCanonicalWorkOrderMutationSafe/);
  assert.match(tableSource, /throw new ApiError\(403, "ACTION_REQUIRED", "Canonical Work Orders must be changed through \/api\/farm-actions"\)/);
});

test("Planning stays compact and opens existing Scheduler with the selected item", () => {
  assert.match(app, /data-canonical-item-schedule/);
  assert.match(app, />เตรียมสั่งงาน</);
  assert.match(app, /url\.pathname = "\/farm\/dispatch"/);
  assert.match(app, /url\.searchParams\.set\("planned_work_item_id", itemId\)/);
  assert.match(app, /if \(order\.workflow_source === "canonical_planning"\) return renderFarmCanonicalWorkOrderDraft/);
  assert.match(styles, /\.farm-canonical-requirement-list/);
});

test("Scheduler reuses Survey resolution and retains Performance and Payroll code", () => {
  assert.match(app, /farmSurveyForOrder\(selected\)/);
  assert.match(actionSource, /resolveSurveyTemplateForOrder/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(survey_|work_performance|payroll_)/i);
  assert.match(app, /function renderFarmSurveyPerformancePanel/);
  assert.match(app, /farm-payroll/);
});

test("UAT containment includes Phase 2D actions and tables", () => {
  for (const action of ["create_canonical_work_order_from_planned_item", "update_canonical_work_order_draft", "submit_work_order"]) {
    assert.equal(actions.UAT_MUTATION_ACTIONS.has(action), true);
  }
  for (const table of ["work_order_labor_requirements", "work_order_resource_requirements", "work_order_resource_assignments"]) {
    assert.equal(tables.UAT_OPERATIONAL_TABLES.has(table), true);
  }
  assert.match(actionSource, /WEBTEST-UAT-/);
});
