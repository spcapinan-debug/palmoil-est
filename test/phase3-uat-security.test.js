const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmActions = require("../api/farm-actions");
const farmAuth = require("../api/farm-auth");
const farmTables = require("../api/farm-tables");
const farmApi = require("../lib/server/farm-api");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20260726052723_phase3_uat_roles.sql"),
  "utf8",
);
const vercelConfig = require("../vercel.json");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "webapp", "index.html"), "utf8");

test("UAT roles grant only the existing least-privilege permission system", () => {
  assert.match(migration, /uat_manager/);
  assert.match(migration, /uat_supervisor/);
  assert.match(migration, /public\.role_permissions/);
  assert.doesNotMatch(migration, /system\.(role|user|integration|menu)\.manage/);
  assert.doesNotMatch(migration, /fuel\.issue|inventory\.manage|payroll\.(approve|close)/);
  assert.match(migration, /\('uat_manager', 'farm\.plan\.approve'\)/);
  assert.doesNotMatch(migration, /\('uat_supervisor', 'farm\.plan\.approve'\)/);
  assert.doesNotMatch(migration, /9602ba04|4a216447/);
});

test("UAT action guard allows clone records and rejects reference records", () => {
  assert.equal(
    farmActions._test.requireUatWorkOrder({ work_order_no: "WEBTEST-UAT-WO-001" }).work_order_no,
    "WEBTEST-UAT-WO-001",
  );
  assert.throws(
    () => farmActions._test.requireUatWorkOrder({ work_order_no: "WEBTEST-2569-WO-HARV-001" }),
    (error) => error.status === 403 && error.code === "UAT_WRITE_FORBIDDEN",
  );
  for (const action of [
    "approve_goods_issue", "post_goods_issue", "prepare_payroll_period",
    "approve_payroll_period", "close_payroll_period", "issue_fuel",
  ]) {
    assert.equal(farmActions._test.UAT_MUTATION_ACTIONS.has(action), false, action);
  }
});

test("UAT read filter isolates operational rows while retaining master data", () => {
  const context = {
    annualPlanIds: new Set(["plan-uat"]),
    orders: [
      { id: "order-uat", status: "in_progress", team_id: "team-1" },
      { id: "order-draft", status: "draft", team_id: null, contractor_id: null },
    ],
    results: [{ id: "result-uat", result_status: "draft" }],
    payrollPeriodIds: new Set(["payroll-uat"]),
    plannedItemIds: new Set(["item-uat"]),
    surveyAnswerIds: new Set(["answer-uat"]),
    surveyAttachmentIds: new Set(["attachment-uat"]),
    workOrderIds: new Set(["order-uat"]),
    workResultIds: new Set(["result-uat"]),
    surveyResponseIds: new Set(["survey-uat"]),
    blockIds: new Set(["block-uat"]),
  };
  assert.equal(farmTables._test.uatRowAllowed("work_orders", { id: "order-uat" }, context), true);
  assert.equal(farmTables._test.uatRowAllowed("work_orders", { id: "real-order" }, context), false);
  assert.equal(farmTables._test.uatRowAllowed("work_results", { id: "result-uat" }, context), true);
  assert.equal(farmTables._test.uatRowAllowed("survey_responses", { id: "real-survey" }, context), false);
  assert.equal(farmTables._test.uatRowAllowed("blocks", { id: "block-uat" }, context), true);
  assert.equal(farmTables._test.uatRowAllowed("blocks", { id: "real-block" }, context), false);
  assert.equal(farmTables._test.uatRowAllowed("activities", { id: "master-activity" }, context), true);
  assert.deepEqual(
    farmTables._test.uatActionCenterRows([
      { module_key: "farm.work", action_key: "continue_result", item_count: 999 },
      { module_key: "hr.people", action_key: "missing_department", item_count: 999 },
    ], context),
    [{ module_key: "farm.work", action_key: "continue_result", item_count: 1 }],
  );
});

test("UAT auth cookies are server-readable only and bearer auth accepts them", () => {
  const cookie = farmAuth._test.authCookie("farm-access-token", "test-token", 300);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(
    farmApi.bearerToken({ headers: { cookie: "other=x; farm-access-token=test-token" } }),
    "test-token",
  );
  assert.throws(
    () => farmApi.bearerToken({ headers: {} }),
    (error) => error.status === 401 && error.code === "AUTH_REQUIRED",
  );
});

test("shared body parser accepts Vercel pre-parsed JSON without rereading the stream", async () => {
  const parsed = { action: "submit_work_order", confirmed: true };
  assert.equal(await farmApi.readBody({ body: parsed }), parsed);
  assert.deepEqual(await farmApi.readBody({ body: JSON.stringify(parsed) }), parsed);
});

test("Preview routing serves the SPA entry point for direct workspace routes", () => {
  assert.deepEqual(vercelConfig.routes.slice(-2), [
    { src: "/(app\\.js|styles\\.css)", dest: "/webapp/$1" },
    { src: "/(.*)", dest: "/webapp/index.html" },
  ]);
  assert.match(indexHtml, /href="\/styles\.css/);
  assert.match(indexHtml, /src="\/app\.js/);
});
