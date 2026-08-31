const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260831063205_phase2f_actual_variance.sql",
), "utf8");
const uat = fs.readFileSync(path.join(root, "scripts", "phase2f-rollback-uat.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const tableSource = fs.readFileSync(path.join(root, "api", "farm-tables.js"), "utf8");
const tables = require("../api/farm-tables")._test;

const phase2fViews = [
  "v_canonical_result_material_variance",
  "v_canonical_result_labor_variance",
  "v_canonical_result_resource_variance",
  "v_canonical_result_fuel_variance",
  "v_canonical_result_variance_summary",
  "v_canonical_work_order_variance_summary",
];

test("Phase 2F exposes service-only canonical variance views through guarded reads", () => {
  for (const view of phase2fViews) {
    assert.equal(tables.TABLES.has(view), true, `${view} must be allowlisted`);
    assert.match(migration, new RegExp(`create or replace view public\\.${view}`));
    assert.match(migration, new RegExp(`grant select on[\\s\\S]*public\\.${view}[\\s\\S]*to service_role`));
  }
  assert.match(migration, /revoke all on public\.v_canonical_result_material_variance[\s\S]*from public, anon, authenticated/);
  assert.match(tableSource, /v_canonical_result_material_variance:[\s\S]*farm\.result\.record/);
});

test("Material Actual is posted Daily Usage, never issued quantity", () => {
  const material = migration.slice(
    migration.indexOf("create or replace view public.v_canonical_result_material_variance"),
    migration.indexOf("create or replace view public.v_canonical_result_labor_variance"),
  );
  assert.match(material, /goods_issue_daily_usage/);
  assert.match(material, /goods_returns[\s\S]*goods_return_lines/);
  assert.match(material, /issued_quantity - cumulative_actual_quantity - returned_quantity - outstanding_quantity/);
  assert.match(material, /issue_conversion_complete[\s\S]*inventory_reconciled/);
  assert.match(material, /budget_quantity_snapshot/);
  assert.match(material, /conversion_snapshots/);
  assert.doesNotMatch(material, /issued_quantity\s+as\s+(?:cumulative_)?actual_quantity/i);
});

test("Labor variance retains typed lineage and frozen Result/WO Rate", () => {
  const labor = migration.slice(
    migration.indexOf("create or replace view public.v_canonical_result_labor_variance"),
    migration.indexOf("create or replace view public.v_canonical_result_resource_variance"),
  );
  for (const field of [
    "source_planned_work_labor_requirement_id", "source_budget_rate_role_id",
    "work_order_labor_requirement_id", "planned_headcount", "actual_headcount",
    "planned_quantity", "actual_quantity", "planned_hours", "actual_hours",
    "frozen_rate_amount", "actual_earning", "cost_variance",
  ]) assert.match(labor, new RegExp(field));
  assert.match(labor, /nullif\(assignment\.planned_hours, 0\)[\s\S]*rate_basis = 'hour_count'/);
  assert.match(labor, /worker\.rate_amount = requirement\.rate_amount/);
  assert.doesNotMatch(labor, /budget_rate_roles|budget_activity_rates|payroll_rates/);
});

test("Equipment and vehicle variance follows requirement, assignment, and actual usage", () => {
  const resource = migration.slice(
    migration.indexOf("create or replace view public.v_canonical_result_resource_variance"),
    migration.indexOf("create or replace view public.v_canonical_result_fuel_variance"),
  );
  for (const field of [
    "source_planned_work_resource_requirement_id", "work_order_resource_assignment_id",
    "assigned_vehicle_id", "actual_vehicle_id", "planned_hours", "actual_hours",
    "planned_km", "actual_km", "utilization_variance_pct",
  ]) assert.match(resource, new RegExp(field));
});

test("Fuel keeps issue/refill separate from Actual consumption and uses only canonical expected sources", () => {
  const fuel = migration.slice(
    migration.indexOf("create or replace view public.v_canonical_result_fuel_variance"),
    migration.indexOf("create or replace view public.v_canonical_result_variance_summary"),
  );
  assert.match(fuel, /usage\.issued_fuel_liter/);
  assert.match(fuel, /usage\.allocated_fuel_liter as actual_fuel_liters/);
  for (const metric of [
    "actual_liter_per_hour", "actual_liter_per_km", "actual_km_per_liter",
    "actual_liter_per_rai", "actual_liter_per_ton", "fuel_difference_liters",
  ]) assert.match(fuel, new RegExp(metric));
  assert.match(fuel, /when expected_fuel_liters is null then 'actual_only'/);
  assert.match(fuel, /'frozen_standard'/);
  assert.match(fuel, /'planned_fuel_snapshot'/);
});

test("variance status is deterministic and incomplete when required data is absent", () => {
  assert.match(migration, /when not coalesce\(p_complete, false\)[\s\S]*then 'incomplete'/);
  assert.match(migration, /when abs\(p_actual - p_planned\) <= 0\.000001 then 'on_plan'/);
  assert.match(migration, /when p_actual > p_planned then 'over'[\s\S]*else 'under'/);
  for (const category of ["labor", "material", "equipment", "fuel"]) {
    assert.match(migration, new RegExp(`'${category}'`));
  }
});

test("Daily Result and Work Order UI render server-derived summary and drill-down", () => {
  assert.match(app, /function renderFarmCanonicalVarianceSummary/);
  assert.match(app, /data-canonical-variance-scope/);
  assert.match(app, /Server-derived/);
  assert.match(app, /Material .* Planned .* Issued .* Used .* Returned .* Difference/);
  assert.match(app, /Conversion snapshot/);
  assert.match(app, /Budget -> Plan -> WO -> Result/);
  assert.match(app, /Labor .* Frozen Rate/);
  assert.match(app, /Equipment \/ Vehicle/);
  assert.match(app, /Fuel .* Issued/);
  assert.match(app, /renderFarmCanonicalVarianceSummary\(order, \{ scope: "work-order" \}\)/);
  assert.match(app, /renderFarmCanonicalVarianceSummary\(order, \{ scope: "result" \}\)/);
});

test("canonical material UI uses Phase 2F read model while legacy branch remains", () => {
  assert.match(app, /v_canonical_result_material_variance/);
  assert.match(app, /row\.planned_unit_id \|\| row\.unit_id/);
  assert.match(app, /row\.planned_unit_name \|\| row\.unit_name/);
  assert.match(app, /calc\.materialLines\.map\(\(row\) => calc\.canonical \?/);
  assert.match(app, /Inventory Issue/);
  assert.match(app, /farmCanonicalDailyOrder/);
});

test("Phase 2F is additive and creates no posting, Payroll, Survey, or transport writes", () => {
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\./i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:submit|verify|close|post|payroll)/i);
  assert.doesNotMatch(migration, /create (?:or replace )?(?:table|view) public\.survey_/i);
  assert.doesNotMatch(migration, /public\.(?:transport|shipment|delivery)_/i);
});

test("existing Phase 2E verification gates remain authoritative", () => {
  for (const code of ["J", "K", "L", "M"]) {
    assert.match(uat, new RegExp(`\\('${code}','PASS'`));
  }
  assert.match(uat, /phase2e_uat_results where case_code='L'/);
  assert.match(uat, /phase2e_uat_results where case_code='K'/);
  assert.match(uat, /phase2e_uat_results where case_code='M'/);
  assert.match(uat, /phase2e_uat_results where case_code='Q'/);
});

test("rollback UAT covers A through P with exact rollback and lineage checks", () => {
  for (const code of "ABCDEFGHIJKLMNOP") {
    assert.match(uat, new RegExp(`\\('${code}','PASS'`), `missing UAT ${code}`);
  }
  assert.match(uat, /issued_fuel_liter=40[\s\S]*actual_fuel_liters=32/);
  assert.match(uat, /source_budget_rate_block_material_id is not null/);
  assert.match(uat, /source_budget_rate_role_id is not null/);
  assert.match(uat, /select case_code,result,detail[\s\S]*rollback;\s*$/i);
});
