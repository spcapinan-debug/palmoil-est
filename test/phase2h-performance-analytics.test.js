const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260901061931_phase2h_performance_analytics.sql",
), "utf8");
const uat = fs.readFileSync(path.join(root, "scripts", "phase2h-rollback-uat.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const serviceSource = fs.readFileSync(path.join(root, "api", "farm-performance.js"), "utf8");
const service = require("../api/farm-performance")._test;
const tables = require("../api/farm-tables")._test;

test("Phase 2H canonical views are verified-only for Actual and preserve full lineage", () => {
  assert.match(migration, /v_phase2h_performance_result/);
  assert.match(migration, /result[.]result_status in \('verified','closed'\)/);
  assert.match(migration, /verification_snapshot_at is not null as is_verified_actual/);
  for (const field of [
    "annual_plan_id", "planned_work_item_id", "work_order_id", "work_result_id",
    "survey_response_ids", "work_order_labor_requirement_id",
    "source_planned_work_labor_requirement_id", "source_budget_rate_role_id",
  ]) assert.match(migration, new RegExp(field));
});

test("quantity metrics keep units separate and guard incompatible/zero bases", () => {
  for (const unit of ["tree", "rai", "kg", "ton", "trip", "hour", "day", "fixed"]) {
    assert.match(migration, new RegExp(`then '${unit}'`));
  }
  assert.match(migration, /planned_unit_basis=actual_unit_basis/);
  assert.match(migration, /planned_quantity>0/);
  assert.match(migration, /actual_labor_hours>0/);
  assert.match(serviceSource, /quantity_by_unit/);
  assert.match(serviceSource, /actual_unit_basis/);
});

test("operational cost is frozen Result cost and never Payroll Net", () => {
  assert.match(migration, /worker[.]earning_amount as operational_earning_amount/);
  assert.match(migration, /employee_operational_labor_cost\+contractor_operational_cost/);
  assert.match(migration, /Payroll Net is never used as Activity operational cost/);
  const resultView = migration.slice(
    migration.indexOf("create or replace view public.v_phase2h_performance_result"),
    migration.indexOf("create or replace view public.v_phase2h_performance_worker"),
  );
  assert.doesNotMatch(resultView, /budget_rate_roles|budget_activity_rates|payroll_rates|payroll_net_amount/i);
  assert.match(migration, /v_phase2h_performance_payroll_reconciliation/);
});

test("Material and Fuel reuse Phase 2F truth without treating Issue as consumption", () => {
  assert.match(migration, /v_canonical_result_material_variance/);
  assert.match(migration, /material[.]actual_quantity \* coalesce\(material[.]snapshot_unit_cost,0\)/);
  assert.match(migration, /issued_quantity/);
  assert.match(migration, /used_quantity/);
  assert.match(migration, /v_canonical_result_fuel_variance/);
  assert.match(migration, /primary_kpi/);
  assert.match(migration, /primary_standard_rate/);
  assert.match(migration, /primary_actual_rate/);
  assert.match(serviceSource, /fuel_issued_liters/);
  assert.match(serviceSource, /fuel_consumed_liters/);
});

test("Performance service is read-only, permission checked, payroll-gated and estate/block scoped", () => {
  assert.match(serviceSource, /permissions: \["performance[.]view"\]/);
  assert.match(serviceSource, /actorCanAccessBlock/);
  assert.match(serviceSource, /actorHasPermission\(actor, "payroll[.]view"\)/);
  assert.match(serviceSource, /READ_ONLY_ANALYTICS/);
  assert.doesNotMatch(serviceSource, /method:\s*"(?:POST|PATCH|DELETE)"/);
  for (const view of Object.values(service.VIEW_NAMES)) {
    assert.equal(tables.TABLES.has(view), true, view);
    assert.equal(tables.PHASE2H_READ_ONLY_TABLES.has(view), true, view);
  }
});

test("service-side summary prevents browser KPI recalculation and avoids duplicate planned WO cost", () => {
  const results = [
    {
      work_order_id: "wo-1", work_result_id: "wr-1", is_verified_actual: true,
      actual_unit_basis: "rai", planned_quantity: 10, actual_verified_quantity: 8,
      calculated_completion_pct: 80, planned_operational_cost: 100,
      actual_operational_cost: 90, planned_employee_labor_cost: 30,
      planned_contractor_cost: 10, planned_material_cost: 20, planned_equipment_cost: 10,
      planned_machine_vehicle_cost: 20, planned_fuel_cost: 10,
      employee_operational_labor_cost: 25, contractor_operational_cost: 10,
      actual_equipment_cost: 8, actual_machine_vehicle_cost: 17,
      survey_score_pct: 92,
    },
    {
      work_order_id: "wo-1", work_result_id: "wr-draft", is_verified_actual: false,
      actual_unit_basis: "rai", planned_quantity: 10, actual_verified_quantity: 999,
      planned_operational_cost: 100, actual_operational_cost: 999,
    },
  ];
  const workers = [{
    work_result_id: "wr-1", is_verified_actual: true, employee_id: "e-1",
    result_date: "2026-08-24", actual_hours: 4, actual_quantity: 8,
    operational_earning_amount: 25,
  }];
  const materials = [{
    work_result_id: "wr-1", is_verified_actual: true, issued_quantity: 12,
    used_quantity: 8, returned_quantity: 2, outstanding_quantity: 2,
    actual_material_consumption_cost: 20, variance_pct: -20,
  }];
  const fuel = [{
    work_result_id: "wr-1", is_verified_actual: true, issued_fuel_liter: 40,
    actual_fuel_liters: 32, actual_fuel_cost: 10,
  }];
  const summary = service.summarize(results, workers, materials, [], fuel, []);
  assert.equal(summary.kpis.planned_operational_cost, 100);
  assert.equal(summary.kpis.actual_operational_cost, 90);
  assert.equal(summary.kpis.plan_completion_pct, 80);
  assert.equal(summary.operational.material_issued, 12);
  assert.equal(summary.operational.material_used, 8);
  assert.equal(summary.operational.fuel_issued_liters, 40);
  assert.equal(summary.operational.fuel_consumed_liters, 32);
  assert.equal(summary.counts.verified_results, 1);
});

test("mixed quantity units suppress the headline labor KPI and Executive planned cost stays unique by WO", () => {
  const results = [
    {
      work_order_id: "wo-1", work_result_id: "wr-1", is_verified_actual: true,
      activity_group_id: "group-1", activity_group_name: "Maintenance",
      actual_unit_basis: "rai", actual_verified_quantity: 8,
      planned_operational_cost: 100, actual_operational_cost: 40,
    },
    {
      work_order_id: "wo-1", work_result_id: "wr-2", is_verified_actual: true,
      activity_group_id: "group-1", activity_group_name: "Maintenance",
      actual_unit_basis: "tree", actual_verified_quantity: 20,
      planned_operational_cost: 100, actual_operational_cost: 60,
    },
  ];
  const workers = [
    { work_result_id: "wr-1", is_verified_actual: true, actual_hours: 2 },
    { work_result_id: "wr-2", is_verified_actual: true, actual_hours: 2 },
  ];
  const summary = service.summarize(results, workers, [], [], [], []);
  const executive = service.groupExecutiveRows(results);
  assert.equal(summary.kpis.labor_productivity, null);
  assert.equal(executive[0].planned_operational_cost, 100);
  assert.equal(executive[0].actual_operational_cost, 100);
  assert.equal(executive[0].work_order_count, 1);
});

test("Performance UI provides eight decision views, filters, drilldown and read-only contract", () => {
  for (const label of [
    "Executive Summary", "Plan vs Actual", "Cost Analysis", "Labor Productivity",
    "Material Efficiency", "Vehicle/Fuel Efficiency", "Survey & Quality",
    "Employee/Team Performance",
  ]) assert.ok(app.includes(label), label);
  for (const filter of [
    "from", "to", "estate", "block", "planting_year", "rspo",
    "activity_group", "activity", "team", "employee", "contractor", "status",
  ]) assert.match(app, new RegExp(`data-phase2h-filter="${filter}"`));
  assert.match(app, /data-phase2h-drilldown/);
  assert.match(app, /Payroll reconciliation ถูกซ่อน/);
  assert.match(app, /data-phase2h-performance-workspace/);
  assert.doesNotMatch(app.slice(
    app.indexOf("function renderFarmPhase2hPerformanceWorkspace"),
    app.indexOf("function renderFarmPage"),
  ), /runFarmAction|farmDbUpsert|farmDbDelete/);
});

test("Phase 2H CSS is fully scoped and leaves baseline workspaces untouched", () => {
  const marker = "/* Phase 2H canonical Performance workspace: all selectors remain locally scoped. */";
  const start = styles.indexOf(marker);
  assert.ok(start >= 0);
  const phaseStyles = styles.slice(start).replace(/\/\*[\s\S]*?\*\//g, "");
  const headers = [...phaseStyles.matchAll(/(?:^|})\s*([^{}]+?)\s*\{/gm)]
    .map((match) => match[1].trim()).filter((header) => header && !header.startsWith("@"));
  for (const header of headers) {
    for (const selector of header.split(",")) {
      assert.match(selector.trim(), /^\.phase2h-/, `unscoped Phase 2H selector: ${selector.trim()}`);
    }
  }
  assert.match(app, /function renderFarmWorkPlanner\(\)/);
  assert.match(app, /function renderFarmCanonicalPlanner\(\)/);
  assert.match(app, /function renderFarmPhase2gPayrollWorkspace\(\)/);
});

test("Phase 2H views use security invoker and service-only grants", () => {
  for (const view of Object.values(service.VIEW_NAMES)) {
    assert.match(migration, new RegExp(`create or replace view public\\.${view}[\\s\\S]*?security_invoker=true`));
  }
  assert.match(migration, /revoke all on public[.]v_phase2h_performance_result[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant select on public[.]v_phase2h_performance_result[\s\S]*to service_role/);
});

test("rollback UAT covers A through AK and ends with ROLLBACK", () => {
  const cases = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK"];
  for (const code of cases) {
    assert.match(uat, new RegExp(`\\('${code}','PASS'`), `missing UAT ${code}`);
  }
  assert.match(uat, /Production counts before and after are identical/);
  assert.match(uat, /Schema fingerprint before and after is identical/);
  assert.ok(uat.trim().toLowerCase().endsWith("rollback;"));
});
