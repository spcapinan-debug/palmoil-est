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
const actions = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const farmApi = fs.readFileSync(path.join(root, "lib", "server", "farm-api.js"), "utf8");
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
  assert.match(fuel, /usage\.actual_weight_ton/);
  assert.match(fuel, /when actual_weight_ton > 0[\s\S]*actual_liter_per_ton/);
  assert.doesNotMatch(fuel, /usage\.actual_quantity as actual_ton_or_quantity/);
});

test("Vehicle measurement basis is snapshotted and required meters are validated independently", () => {
  for (const field of [
    "fuel_measurement_basis", "requires_hour_meter", "requires_odometer",
    "fuel_measurement_basis_snapshot", "requires_hour_meter_snapshot",
    "requires_odometer_snapshot", "actual_weight_ton",
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /new\.engine_hours := round\(new\.end_hour_meter - new\.start_hour_meter, 3\)/);
  assert.match(migration, /new\.distance_km := round\(new\.end_odometer - new\.start_odometer, 3\)/);
  assert.match(migration, /WORK_RESULT_HOUR_METER_REQUIRED/);
  assert.match(migration, /WORK_RESULT_ODOMETER_REQUIRED/);
  assert.match(migration, /WORK_RESULT_VEHICLE_MEASUREMENT_SNAPSHOT_FROZEN/);
  assert.match(migration, /new\.result_status in \('submitted', 'verified', 'closed'\)/);
});

test("Primary fuel KPI follows frozen Vehicle basis and preserves zero-division guards", () => {
  const fuel = migration.slice(
    migration.indexOf("create or replace view public.v_canonical_result_fuel_variance"),
    migration.indexOf("create or replace view public.v_canonical_result_variance_summary"),
  );
  assert.match(fuel, /when 'engine_hours' then 'L\/hour'/);
  assert.match(fuel, /when 'distance_km' then 'km\/L'/);
  assert.match(fuel, /case when engine_hours > 0 then round\(actual_fuel_liters \/ engine_hours, 4\)/);
  assert.match(fuel, /case when actual_fuel_liters > 0 then round\(distance_km \/ actual_fuel_liters, 4\)/);
  assert.match(fuel, /case when actual_area_rai > 0 then round\(actual_fuel_liters \/ actual_area_rai, 4\)/);
  assert.match(fuel, /case when actual_weight_ton > 0[\s\S]*actual_fuel_liters \/ actual_weight_ton/);
  assert.match(fuel, /primary_kpi = fuel_metric_basis_snapshot/);
  assert.match(fuel, /primary_variance_status/);
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

test("Daily vehicle UI shows only meter sets required by Vehicle Master snapshot", () => {
  assert.match(app, /fuel_measurement_basis[\s\S]*requires_hour_meter[\s\S]*requires_odometer/);
  assert.match(app, /const requiresHourMeter = row\.requires_hour_meter === true/);
  assert.match(app, /const requiresOdometer = row\.requires_odometer === true/);
  assert.match(app, /requiresOdometer \? `[\s\S]*เลขไมล์เริ่ม[\s\S]*เลขไมล์สิ้นสุด/);
  assert.match(app, /requiresHourMeter \? `[\s\S]*ชั่วโมงมิเตอร์เริ่ม[\s\S]*ชั่วโมงมิเตอร์สิ้นสุด/);
  assert.match(app, /data-primary-fuel-kpi/);
  assert.match(app, /actualWeightTon/);
  assert.match(actions, /actual_weight_ton: optionalNumber/);
  assert.match(actions, /rpc\("save_canonical_work_result_draft_phase2f"/);
  for (const code of [
    "WORK_RESULT_HOUR_METER_REQUIRED",
    "WORK_RESULT_ODOMETER_REQUIRED",
    "WORK_RESULT_VEHICLE_MEASUREMENT_SNAPSHOT_FROZEN",
  ]) assert.match(farmApi, new RegExp(code));
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
  assert.doesNotMatch(migration, /(insert into|delete from) public\./i);
  assert.doesNotMatch(migration, /update public\.(?!work_result_vehicle_usage\b|work_results\b)/i);
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

test("rollback UAT covers A through V with exact rollback, measurement, and lineage checks", () => {
  for (const code of "ABCDEFGHIJKLMNOPQRSTUV") {
    assert.match(uat, new RegExp(`\\('${code}','PASS'`), `missing UAT ${code}`);
  }
  assert.match(uat, /issued_fuel_liter=40[\s\S]*actual_fuel_liters=32/);
  assert.match(uat, /32 L \/ 8 engine hours = 4 L\/hour/);
  assert.match(uat, /160 km \/ 40 L = 4 km\/L/);
  assert.match(uat, /requires_hour_meter_snapshot[\s\S]*requires_odometer_snapshot/);
  assert.match(uat, /WORK_RESULT_HOUR_METER_REQUIRED/);
  assert.match(uat, /Vehicle Master change leaves frozen WO\/Result fuel standard/);
  assert.match(uat, /source_budget_rate_block_material_id is not null/);
  assert.match(uat, /source_budget_rate_role_id is not null/);
  assert.match(uat, /select case_code,result,detail[\s\S]*rollback;\s*$/i);
});
