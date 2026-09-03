const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260830144232_phase2c2_1_full_resource_snapshot_hardening.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const actions = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const tables = fs.readFileSync(path.join(root, "api", "farm-tables.js"), "utf8");

test("Rule to Block materialization uses the canonical rule engine and validation views", () => {
  assert.match(migration, /public\.budget_rule_matches_block\(/);
  assert.match(migration, /public\.v_budget_rate_rule_resolution/);
  assert.match(migration, /public\.v_budget_rate_rule_validation_issues/);
  for (const gate of ["approval_status", "status", "is_current", "rule_sync_status", "resolution_count", "conflict_count"]) {
    assert.match(migration, new RegExp(gate));
  }
  assert.match(migration, /rule_sync_status is distinct from 'synced'/);
  assert.match(migration, /top_priority_match_count = 1/);
});

test("source total reconciliation uses 0.5 percent with absolute minimums and fails closed", () => {
  assert.match(migration, /\* 0\.005, 1::numeric/);
  assert.match(migration, /\* 0\.005, 50::numeric/);
  assert.match(migration, /BUDGET_RATE_BLOCK_SOURCE_VARIANCE_REVIEW_REQUIRED/g);
  assert.doesNotMatch(migration, /update public\.budget_activity_rates[\s\S]*set[\s\S]*(area_rai|tree_count)/i);
});

test("Rule to Block sync is deterministic and updates only materialized rows", () => {
  assert.match(migration, /'rule-block-' \|\| md5\(v_rate\.id \|\| ':' \|\| resolved\.block_id::text\)/);
  assert.match(migration, /on conflict \(budget_rate_id, block_id\)/);
  assert.match(migration, /where budget_rate_blocks\.source_type = 'rule_resolution'/);
  assert.match(migration, /BUDGET_RATE_BLOCK_MANUAL_CONFLICT/);
});

test("Planned Labor requirements preserve every source Budget Role row without deduplication", () => {
  assert.match(migration, /create table public\.planned_work_labor_requirements/);
  for (const field of [
    "source_budget_rate_role_id", "source_budget_activity_rate_id", "role_position", "rate_amount", "uom",
    "calculation_method", "rate_category", "payee_type", "affects_payroll", "selected_for_plan",
    "planned_headcount", "planned_basis_quantity", "estimated_amount", "snapshot_at",
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /order by rate\.id, role\.id/);
  assert.doesNotMatch(migration, /distinct on[\s\S]*budget_rate_roles/i);
});

test("explicit source requirements cover equipment machine vehicle and fuel metrics", () => {
  assert.match(migration, /create table public\.budget_rate_resource_requirements/);
  assert.match(migration, /create table public\.planned_work_resource_requirements/);
  for (const kind of ["equipment", "machine", "vehicle", "fuel"]) assert.match(migration, new RegExp(`'${kind}'`));
  for (const basis of ["L/hour", "km/L", "L/rai", "L/ton"]) assert.match(migration, new RegExp(basis.replace("/", "\\/")));
  assert.match(migration, /preferred_vehicle_id/);
  assert.match(migration, /preferred_vehicle_type/);
  assert.doesNotMatch(migration, /resource_type[^\n]+driver/);
});

test("Material remains authoritative in planned_work_materials and is not rebuilt from activity rates", () => {
  const populate = migration.slice(migration.indexOf("create or replace function public.populate_canonical_planning_full_resource_snapshot"), migration.indexOf("create or replace function public.update_canonical_planned_resource_requirements"));
  assert.match(populate, /budget_rate_resource_requirements/);
  assert.doesNotMatch(populate, /insert into public\.planned_work_materials/);
  assert.doesNotMatch(populate, /planning_resource_type/);
  assert.match(migration, /activity\.require_material/);
  assert.match(migration, /planned_work_materials material/);
});

test("Activity Master approval gates require only configured resource types", () => {
  assert.match(migration, /add column require_equipment boolean not null default false/);
  for (const requirement of [
    "activity.require_worker", "activity.require_material", "activity.require_equipment",
    "activity.require_machine", "activity.require_fuel",
  ]) assert.match(migration, new RegExp(requirement.replace(".", "\\.")));
  for (const code of [
    "PLANNING_WORKER_REQUIREMENT_REQUIRED", "PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE",
    "PLANNING_EQUIPMENT_REQUIREMENT_REQUIRED", "PLANNING_MACHINE_REQUIREMENT_REQUIRED",
    "PLANNING_FUEL_REQUIREMENT_REQUIRED",
  ]) assert.match(migration, new RegExp(code));
});

test("draft-only explicit action updates selections and approved snapshots stay frozen", () => {
  assert.match(migration, /update_canonical_planned_resource_requirements/);
  assert.match(migration, /v_plan_status <> 'draft'/);
  assert.match(migration, /PLANNING_PLAN_FROZEN/g);
  assert.match(migration, /guard_canonical_planning_requirement_mutation/);
  assert.match(actions, /update_canonical_planned_resource_requirements/);
  assert.match(actions, /p_labor_requirements: Array\.isArray/);
  assert.match(tables, /planned_work_labor_requirements/);
  assert.match(tables, /planned_work_resource_requirements/);
});

test("Planning UI keeps the baseline and adds compact collapsible resource sections", () => {
  for (const label of ["คนและอัตรา", "วัสดุ", "อุปกรณ์", "เครื่องจักร / รถ", "น้ำมัน", "Planned Cost"]) {
    assert.match(app, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(app, /data-planned-labor-row/);
  assert.match(app, /data-requirement-selected/);
  assert.match(app, /data-canonical-requirements-save/);
  assert.match(styles, /\.farm-planning-resource-section/);
  assert.match(styles, /tr\.is-selected/);
  assert.match(app, /Timeline|Gantt/);
});

test("Phase 2C.2.1 contains no downstream workflow mutations", () => {
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(work_orders|work_order_|survey_|work_performance|payroll_)/i);
  assert.doesNotMatch(migration, /create_work_order_from_plan_item/);
  assert.match(app, /function renderFarmSurveyPerformancePanel/);
  assert.match(app, /farm-performance/);
});

test("new exposed-schema tables are RLS enabled and service-only", () => {
  for (const table of ["budget_rate_resource_requirements", "planned_work_labor_requirements", "planned_work_resource_requirements"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant all on table public\\.${table} to service_role`));
  }
  assert.match(migration, /security invoker/g);
});
