const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase", "migrations", "20260830135944_phase2c2_full_resource_snapshot.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");

test("one job snapshots three positions and three independent Rate rows", () => {
  const roles = [
    { role_name: "คนตัด", rate_amount: 2.5, uom: "บาท/ต้น" },
    { role_name: "หัวหน้าทีม", rate_amount: 650, uom: "บาท/วัน" },
    { role_name: "คนขับรถ", rate_amount: 85, uom: "บาท/ชั่วโมง" },
  ];
  assert.equal(new Set(roles.map((row) => row.role_name)).size, 3);
  assert.equal(new Set(roles.map((row) => row.rate_amount)).size, 3);
  assert.match(sql, /jsonb_agg\(jsonb_build_object\('source_budget_rate_role_id'/);
  assert.match(sql, /order by r\.id,role\.id/);
});

test("mixed baht per tree/day/hour mappings are preserved and reconciled", () => {
  for (const [unit, basis] of [["ต้น", "tree_count"], ["วัน", "day_count"], ["ชั่วโมง", "hour_count"]]) {
    assert.match(sql, new RegExp(unit));
    assert.match(sql, new RegExp(basis));
  }
  assert.match(sql, /if a is not null and b is not null and a<>b then return null/);
  assert.match(sql, /RATE_MAPPING_MISMATCH/);
  assert.match(sql, /RATE_BLOCK_UNRESOLVED/);
  assert.match(sql, /not exists\(select 1 from public\.budget_rate_blocks rb where rb\.budget_rate_id=r\.id/);
  assert.match(sql, /PLANNING_RATE_RECONCILIATION_REQUIRED/);
});

test("people, material, vehicle and fuel resource sources are snapshotted together", () => {
  assert.match(sql, /planned_labor_rate_snapshot/);
  assert.match(sql, /planned_resource_rate_snapshot/);
  for (const resource of ["material", "equipment", "machine", "vehicle", "fuel"]) {
    assert.match(sql, new RegExp(`'${resource}'`));
  }
  assert.match(sql, /budget_block_resolution_snapshot/);
});

test("a plan without Material rows is allowed but existing Material rows remain strict", () => {
  assert.match(sql, /PLANNING_MATERIAL_SNAPSHOT_EMPTY/);
  assert.match(sql, /not exists\(select 1 from public\.budget_rate_block_materials/);
  const create = app.slice(app.indexOf("async function createFarmCanonicalPlannedItem"), app.indexOf("async function updateFarmCanonicalPlannedItem"));
  assert.doesNotMatch(create, /!materials\.length/);
  assert.match(create, /materials\.some/);
  const selectedPlan = app.slice(app.indexOf("function renderFarmCanonicalSelectedPlan"), app.indexOf("function renderFarmCanonicalPlanner"));
  assert.doesNotMatch(selectedPlan, /snapshotComplete = items\.filter\(\(item\) => farmPlanningItemMaterials/);
  assert.match(selectedPlan, /item\.resource_snapshot_reconciliation_status === "matched"/);
  assert.match(selectedPlan, /item\.planned_labor_rate_snapshot\.length > 0/);
  assert.match(selectedPlan, /item\.planned_resource_rate_snapshot\.length > 0/);
});

test("approved snapshots cannot be changed by later Budget Rate edits", () => {
  assert.match(sql, /full_resource_snapshot_at/);
  assert.match(sql, /snapshot_at',snap_at/);
  assert.doesNotMatch(sql, /update public\.planned_work_items[\s\S]*from public\.budget_activity_rates[\s\S]*where[\s\S]*status='approved'/);
  assert.doesNotMatch(sql, /insert into public\.work_orders|update public\.work_orders|delete from public\.work_orders/);
});

test("Survey and Performance implementations remain untouched by Phase 2C.2", () => {
  assert.doesNotMatch(sql, /survey_responses|survey_answers|work_performance_metrics|performance_reviews/);
  assert.match(app, /function renderFarmSurveyPerformancePanel/);
  assert.match(app, /farm-performance/);
});

test("snapshot functions stay service-only and preserve RLS-era least privilege", () => {
  assert.match(sql, /security invoker/g);
  assert.match(sql, /set search_path=''/g);
  assert.match(sql, /revoke all on function[\s\S]*from public,anon,authenticated/);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/);
});
