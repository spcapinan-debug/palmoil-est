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

test("Farm refresh requires its HttpOnly cookie and rotates the exact-host session", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  const createResponse = () => ({
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); },
  });
  try {
    let upstreamCalls = 0;
    global.fetch = async () => {
      upstreamCalls += 1;
      return {
        ok: true,
        json: async () => ({
          access_token: "rotated-access",
          refresh_token: "rotated-refresh",
          expires_in: 1800,
          user: { id: "user-1" },
        }),
      };
    };


    const bootstrapResponse = createResponse();
    await farmAuth({
      method: "POST",
      body: { action: "bootstrap" },
      headers: {},
    }, bootstrapResponse);
    assert.equal(bootstrapResponse.statusCode, 200);
    assert.equal(bootstrapResponse.body.ok, true);
    assert.equal(bootstrapResponse.body.authenticated, false);
    assert.equal(upstreamCalls, 0, "cookie-free bootstrap must not reach Supabase or a protected API");
    const missingCookieResponse = createResponse();
    await farmAuth({
      method: "POST",
      body: { action: "refresh" },
      headers: {},
    }, missingCookieResponse);
    assert.equal(missingCookieResponse.statusCode, 401);
    assert.equal(missingCookieResponse.body.error.code, "REFRESH_REQUIRED");
    assert.equal(upstreamCalls, 0, "missing cookies must never reach Supabase");

    const refreshResponse = createResponse();
    await farmAuth({
      method: "POST",
      body: { action: "refresh" },
      headers: { cookie: "farm-refresh-token=valid-refresh" },
    }, refreshResponse);
    assert.equal(refreshResponse.statusCode, 200);
    assert.equal(refreshResponse.body.ok, true);
    assert.equal(upstreamCalls, 1);
    const cookies = refreshResponse.headers["Set-Cookie"];
    assert.equal(cookies.length, 2);
    assert.match(cookies[0], /^farm-access-token=rotated-access;/);
    assert.match(cookies[1], /^farm-refresh-token=rotated-refresh;/);
    for (const cookie of cookies) {
      assert.match(cookie, /Path=\//);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /Secure/);
      assert.match(cookie, /SameSite=Lax/);
      assert.doesNotMatch(cookie, /Domain=/i, "Farm cookies must stay host-only on the exact Preview hostname");
    }
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("shared body parser accepts Vercel pre-parsed JSON without rereading the stream", async () => {
  const parsed = { action: "submit_work_order", confirmed: true };
  assert.equal(await farmApi.readBody({ body: parsed }), parsed);
  assert.deepEqual(await farmApi.readBody({ body: JSON.stringify(parsed) }), parsed);
});

test("Preview routing serves the SPA entry point for direct workspace routes", () => {
  assert.deepEqual(vercelConfig.routes.slice(-2), [
    { src: "/(app\\.js|farm-auth-session\\.js|styles\\.css)", dest: "/webapp/$1" },
    { src: "/(.*)", dest: "/webapp/index.html" },
  ]);
  assert.match(indexHtml, /href="\/styles\.css/);
  assert.match(indexHtml, /src="\/app\.js/);
});
  assert.match(indexHtml, /src="\/farm-auth-session\.js/);

test("current farm hierarchy remains usable when the legacy areas table is absent", () => {
  for (const table of [
    "areas", "access_scopes", "approval_logs", "inventory_document_lines",
    "inventory_documents", "inventory_master", "master_versions", "payroll_lines",
    "payroll_rules", "people", "person_housing_assignments", "worker_documents",
  ]) {
    assert.equal(farmTables._test.OPTIONAL_TABLES.has(table), true, table);
  }
  assert.equal(farmTables._test.OPTIONAL_TABLES.has("blocks"), false);
});
