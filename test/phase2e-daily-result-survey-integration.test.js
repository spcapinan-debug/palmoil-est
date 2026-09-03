const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(
  root, "supabase", "migrations",
  "20260831034621_phase2e_daily_result_survey_integration.sql",
), "utf8");
const uat = fs.readFileSync(path.join(root, "scripts", "phase2e-rollback-uat.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const tableSource = fs.readFileSync(path.join(root, "api", "farm-tables.js"), "utf8");
const actions = require("../api/farm-actions")._test;
const tables = require("../api/farm-tables")._test;

test("canonical Daily Result actions route through Phase 2E RPCs while legacy remains", () => {
  assert.equal(actions.ACTIONS.get_or_create_work_result.execute, actions.getOrCreateWorkResult);
  assert.match(actionSource, /order\.workflow_source === "canonical_planning"[\s\S]*get_or_create_canonical_work_result/);
  assert.match(actionSource, /return rpc\("get_or_create_work_result"/);
  for (const rpc of [
    "save_canonical_work_result_draft",
    "submit_canonical_work_result_phase2e",
    "verify_canonical_work_result_phase2e",
    "close_canonical_work_result_phase2e",
  ]) assert.match(migration, new RegExp(rpc));
});

test("worker actual payload accepts persisted result row or frozen WO assignment lineage", () => {
  const assignment = "11111111-1111-4111-8111-111111111111";
  const payload = actions.canonicalWorkResultWorkerPayload({
    work_order_worker_assignment_id: assignment,
    actual_hours: 8,
    actual_quantity: 50,
    individual_quality_pct: 91,
    individual_completion_pct: 87,
    quantity_allocation_method: "team_pool",
    rate_amount: 999999,
    earning_amount: 999999,
  });
  assert.equal(payload.work_order_worker_assignment_id, assignment);
  assert.equal(payload.individual_quality_pct, 91);
  assert.equal(payload.individual_completion_pct, 87);
  assert.equal(payload.rate_amount, undefined);
  assert.equal(payload.earning_amount, undefined);
  assert.throws(
    () => actions.canonicalWorkResultWorkerPayload({ actual_hours: 1 }),
    /work_result_worker_id or work_order_worker_assignment_id is required/,
  );
});

test("canonical earnings read frozen WO labor requirements and no Rate Master", () => {
  const createStart = migration.indexOf("create or replace function public.get_or_create_canonical_work_result");
  const createEnd = migration.indexOf("create or replace function public.save_canonical_work_result_draft");
  const saveEnd = migration.indexOf("create or replace function public.validate_canonical_work_result");
  const canonicalFunctions = migration.slice(createStart, saveEnd);
  assert.match(canonicalFunctions, /work_order_labor_requirements/);
  assert.match(canonicalFunctions, /phase2e_earning_amount/);
  assert.doesNotMatch(canonicalFunctions, /budget_rate_roles|budget_activity_rates|payroll_rates/);
  assert.match(app, /source: "work_order_labor_requirements"/);
});

test("one Labor Requirement supports many employees or contractors without deduping Rate lines", () => {
  assert.match(migration, /work_result_workers_canonical_employee_unique[\s\S]*work_order_labor_requirement_id/);
  assert.match(migration, /work_result_workers_canonical_contractor_unique[\s\S]*work_order_labor_requirement_id/);
  assert.match(migration, /from public\.work_order_workers wow[\s\S]*join public\.work_order_labor_requirements requirement/);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("insert into public.work_result_workers"),
      migration.indexOf("insert into public.work_result_vehicle_usage"),
    ),
    /distinct on/i,
  );
});

test("team/piece/hour/day/driver/contractor allocations are supported and reconciled", () => {
  for (const method of [
    "individual", "team_pool", "piece_rate", "hourly", "daily", "driver", "contractor",
  ]) assert.match(migration, new RegExp(`'${method}'`));
  assert.match(migration, /WORK_RESULT_QUANTITY_ALLOCATION_NOT_RECONCILED/);
  assert.match(migration, /sum\(worker\.actual_quantity\)[\s\S]*v_result\.actual_quantity/);
  assert.match(app, /quantityAllocationMethod/);
});

test("driver operation points to one Labor result row and does not add a second earning", () => {
  const create = migration.slice(
    migration.indexOf("insert into public.work_result_workers"),
    migration.indexOf("create or replace function public.save_canonical_work_result_draft"),
  );
  assert.match(create, /driver_work_result_worker_id/);
  assert.match(create, /driver_work_order_worker_id/);
  assert.equal((create.match(/insert into public\.work_result_workers/g) || []).length, 1);
  assert.match(migration, /WORK_RESULT_DRIVER_LINEAGE_INVALID/);
});

test("Material planned snapshot is immutable and actual is Inventory Issue Use Return", () => {
  assert.match(migration, /create or replace view public\.v_canonical_daily_material_actual/);
  assert.match(migration, /goods_issue_daily_usage/);
  assert.match(migration, /goods_returns[\s\S]*goods_return_lines/);
  assert.match(app, /calc\.canonical \? \[\] : calc\.materialLines/);
  assert.match(app, /Actual มาจาก Inventory Issue → Use → Return/);
});

test("resource actual retains WO assignment and calculates all required fuel metrics", () => {
  for (const field of [
    "work_order_resource_requirement_id", "work_order_resource_assignment_id",
    "planned_vehicle_id_snapshot", "driver_work_result_worker_id",
    "start_odometer", "end_odometer", "start_hour_meter", "end_hour_meter",
    "distance_km", "engine_hours", "working_hours", "idle_hours",
  ]) assert.match(migration, new RegExp(field));
  for (const metric of [
    "actual_liter_per_hour", "actual_km_per_liter",
    "actual_liter_per_rai", "actual_liter_per_ton", "fuel_variance_pct",
  ]) assert.match(migration, new RegExp(metric));
});

test("Activity Master gates only required actual resource types", () => {
  for (const code of [
    "WORK_RESULT_WORKER_ACTUAL_REQUIRED", "WORK_RESULT_MATERIAL_ACTUAL_REQUIRED",
    "WORK_RESULT_MACHINE_ACTUAL_REQUIRED", "WORK_RESULT_FUEL_ACTUAL_REQUIRED",
  ]) assert.match(migration, new RegExp(code));
  assert.match(migration, /coalesce\(v_activity\.require_worker, false\)/);
  assert.match(migration, /coalesce\(v_activity\.require_material, false\)/);
  assert.match(migration, /coalesce\(v_activity\.require_machine, false\)/);
  assert.match(migration, /coalesce\(v_activity\.require_fuel, false\)/);
});

test("existing Survey resolver honors activity group/work type and specific contexts", () => {
  const generic = "11111111-1111-4111-8111-111111111111";
  const exact = "22222222-2222-4222-8222-222222222222";
  const selected = actions.selectResolvedSurveyTemplate({
    templates: [
      { id: generic, survey_scope: "work_result" },
      { id: exact, survey_scope: "work_result" },
    ],
    assignments: [
      { template_id: generic, priority: 100, condition_json: { work_type: "harvest" } },
      {
        template_id: exact, activity_id: "activity-a", block_id: "block-a",
        team_id: "team-a", vehicle_id: "vehicle-a", employee_id: "employee-a",
        priority: 100, condition_json: { activity_group_id: "group-a" },
      },
    ],
    activity: { activity_group_id: "group-a", work_type: "harvest" },
    order: { activity_id: "activity-a", block_id: "block-a", team_id: "team-a" },
    args: { vehicle_id: "vehicle-a", employee_id: "employee-a" },
    responseDate: "2026-08-31",
  });
  assert.equal(selected, exact);
  assert.match(actionSource, /return selectResolvedSurveyTemplate/);
});

test("conditional Survey runtime validation shows only matching dependent questions", () => {
  const visible = actions.surveyQuestionVisible(
    { conditional_json: { question_code: "ROOT", operator: "equals", value: false } },
    new Map([["ROOT", { answer_boolean: false }]]),
  );
  const hidden = actions.surveyQuestionVisible(
    { conditional_json: { question_code: "ROOT", operator: "equals", value: false } },
    new Map([["ROOT", { answer_boolean: true }]]),
  );
  assert.equal(visible, true);
  assert.equal(hidden, false);
  assert.match(actionSource, /SURVEY_INCOMPLETE/);
  assert.match(actionSource, /SURVEY_EVIDENCE_REQUIRED/);
  assert.match(actionSource, /ensureSurveyFailureFindings/);
});

test("Survey verification uses resolver precedence and verified/pass state", () => {
  assert.match(actionSource, /validateCanonicalResolvedSurveys/);
  assert.match(actionSource, /pass_status !== "failed"/);
  assert.match(migration, /cross join lateral[\s\S]*survey_template_assignments/);
  assert.match(migration, /WORK_RESULT_SURVEY_NOT_VERIFIED/);
});

test("canonical status transitions cannot bypass draft submitted verified closed", () => {
  assert.match(migration, /result_status <> 'draft'[\s\S]*CANONICAL_WORK_RESULT_NOT_DRAFT/);
  assert.match(migration, /result_status <> 'submitted'[\s\S]*CANONICAL_WORK_RESULT_NOT_SUBMITTED/);
  assert.match(migration, /result_status <> 'verified'[\s\S]*CANONICAL_WORK_RESULT_NOT_VERIFIED/);
  assert.match(migration, /status = 'in_progress'/);
  assert.match(migration, /status = 'completed'/);
  assert.match(migration, /status = 'closed'/);
});

test("verified Performance input retains individual quality and completion", () => {
  assert.match(migration, /individual_quality_pct/);
  assert.match(migration, /individual_completion_pct/);
  assert.match(migration, /create or replace view public\.v_canonical_daily_performance_input/);
  for (const field of [
    "plan_quantity_snapshot", "actual_quantity", "total_labor_hours",
    "actual_total_cost", "quality_score", "completion_pct", "survey_score_pct",
    "finding_count", "rework_required", "material_variance_pct", "fuel_efficiency_pct",
  ]) assert.match(migration, new RegExp(field));
});

test("canonical generic table writes are denied but legacy Work Result tables remain available", () => {
  assert.equal(tables.CANONICAL_WORK_RESULT_MUTATION_TABLES.has("work_results"), true);
  assert.equal(tables.CANONICAL_WORK_RESULT_MUTATION_TABLES.has("work_result_workers"), true);
  assert.match(tableSource, /assertCanonicalWorkResultMutationSafe/);
  assert.match(tableSource, /Canonical Work Results must be changed through \/api\/farm-actions/);
  assert.equal(tables.TABLES.has("work_results"), true);
});

test("canonical Daily views are service-only and exposed through allowlisted reads", () => {
  for (const view of [
    "v_canonical_daily_material_actual", "v_canonical_daily_resource_actual",
    "v_canonical_daily_performance_input",
  ]) {
    assert.equal(tables.TABLES.has(view), true);
    assert.match(migration, new RegExp(`revoke all on public\\.${view} from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant select on public\\.${view} to service_role`));
  }
});

test("Daily Entry UI keeps canonical baselines read-only and does not create Payroll", () => {
  assert.match(app, /function farmCanonicalDailyOrder/);
  assert.match(app, /Canonical Daily Result · Planning\/WO baseline เป็น read-only/);
  assert.match(app, /Frozen WO Rate · ยังไม่สร้าง Payroll/);
  assert.match(app, /individualQualityPct/);
  assert.match(app, /individualCompletionPct/);
  assert.match(app, /v_canonical_daily_material_actual/);
  assert.match(app, /v_canonical_daily_resource_actual/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(payroll_|work_performance)/i);
});

test("Phase 2E reuses Survey schema rather than creating duplicate Survey tables", () => {
  assert.doesNotMatch(migration, /create table(?: if not exists)? public\.survey_/i);
  for (const table of [
    "survey_templates", "survey_questions", "survey_template_assignments",
    "survey_responses", "survey_answers", "survey_findings",
  ]) assert.match(actionSource, new RegExp(table));
});

test("rollback UAT covers A through T and ends with ROLLBACK", () => {
  for (const code of "ABCDEFGHIJKLMNOPQRST") {
    assert.match(uat, new RegExp(`\\('${code}','PASS'`));
  }
  assert.match(uat, /select case_code,result,detail[\s\S]*rollback;\s*$/i);
  assert.match(uat, /WEBTEST-UAT-P2E/);
});
