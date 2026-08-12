const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
const helperStart = appSource.indexOf("function farmConnectionStateFromResponse");
const helperEnd = appSource.indexOf("function farmPreviewDiagnostic", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const helpers = Function(`${appSource.slice(helperStart, helperEnd)}
  return { farmConnectionStateFromResponse, farmDataConnectionState, farmModuleHealthState, farmCoreHealthFromConnectionState, farmClearResolvedErrors };
`)();

test("farm session failures remain auth or permission states instead of database failures", () => {
  assert.equal(
    helpers.farmConnectionStateFromResponse(
      { status: 401 },
      { error: { code: "AUTH_REQUIRED", message: "A Supabase access token is required" } },
    ),
    "AUTH_REQUIRED",
  );
  assert.equal(
    helpers.farmConnectionStateFromResponse(
      { status: 401 },
      { error: { code: "SESSION_EXPIRED", message: "The authenticated session has expired" } },
    ),
    "SESSION_EXPIRED",
  );
  assert.equal(helpers.farmConnectionStateFromResponse({ status: 403 }, { error: { code: "FORBIDDEN" } }), "PERMISSION_DENIED");
  assert.equal(helpers.farmConnectionStateFromResponse({ status: 500 }, {}), "DATABASE_ERROR");
  assert.equal(helpers.farmConnectionStateFromResponse(null, {}), "NETWORK_ERROR");
});

test("core success with optional failure stays usable and core failure is a database error", () => {
  const requested = ["blocks", "activities", "work_orders", "work_results", "app_notifications"];
  assert.equal(helpers.farmDataConnectionState({ errors: {} }, requested), "CONNECTED");
  assert.equal(
    helpers.farmDataConnectionState({ errors: { app_notifications: { code: "TABLE_READ_FAILED" } } }, requested),
    "CONNECTED",
  );
  assert.deepEqual(
    helpers.farmModuleHealthState({ app_notifications: { code: "TABLE_READ_FAILED" } }, requested),
    { state: "DEGRADED", failedTables: ["app_notifications"] },
  );
  assert.equal(
    helpers.farmDataConnectionState({ errors: { work_orders: { code: "TABLE_READ_FAILED" } } }, requested),
    "DATABASE_ERROR",
  );
});

test("successful retries clear stale API and requested-table errors without hiding unrelated failures", () => {
  assert.deepEqual(
    helpers.farmClearResolvedErrors(
      { api: "expired", work_orders: "temporary", attachments: "still unavailable" },
      ["work_orders"],
      {},
    ),
    { attachments: "still unavailable" },
  );
  assert.deepEqual(
    helpers.farmClearResolvedErrors(
      { api: "expired", work_orders: "temporary" },
      ["work_orders"],
      { work_orders: { code: "TABLE_READ_FAILED" } },
    ),
    { work_orders: { code: "TABLE_READ_FAILED" } },
  );
});

test("core health stays ready for supplementary failures and preserves critical states", () => {
  assert.equal(helpers.farmCoreHealthFromConnectionState("CONNECTED"), "READY");
  assert.equal(helpers.farmCoreHealthFromConnectionState("PARTIAL_DATA"), "READY");
  assert.equal(helpers.farmCoreHealthFromConnectionState("NETWORK_ERROR"), "OFFLINE");
  assert.equal(helpers.farmCoreHealthFromConnectionState("DATABASE_ERROR"), "ERROR");
  assert.equal(helpers.farmCoreHealthFromConnectionState("SESSION_EXPIRED"), "AUTH_REQUIRED");
});

test("global notice excludes supplementary state and module notices are route-scoped", () => {
  const globalNotice = appSource.slice(appSource.indexOf("function renderFarmConnectionNotice"), appSource.indexOf("function farmModuleHealthForView"));
  assert.doesNotMatch(globalNotice, /PARTIAL_DATA:\s*\[/);
  assert.doesNotMatch(globalNotice, /ข้อมูลหลักพร้อมใช้งาน แต่ข้อมูลเสริมบางส่วนยังไม่พร้อม/);
  assert.match(appSource, /data-farm-module-warning="\$\{esc\(view\)\}"/);
  assert.match(appSource, /renderFarmModuleHealthNotice\(module\.id\)/);
  assert.match(appSource, /globalCriticalStates = new Set\(\["DATABASE_ERROR", "NETWORK_ERROR", "PERMISSION_DENIED"\]\)/);
});

test("bootstrap restores the session before revealing or starting the application", () => {
  const initStart = appSource.indexOf("async function init()");
  const initSource = appSource.slice(initStart);
  assert.ok(initSource.indexOf("await detectFarmPasswordRecovery()") < initSource.indexOf("loadWorkspaceShell({ sessionOnly: true })"));
  assert.ok(initSource.indexOf("loadWorkspaceShell({ sessionOnly: true })") < initSource.indexOf("showFarmAuthenticatedApplication()"));
  assert.ok(initSource.indexOf("showFarmAuthenticatedApplication()") < initSource.indexOf("startAuthenticatedApplication()"));
  assert.match(appSource, /state\.farmAuthRequired = farmConnectionNeedsLogin\(connectionState\)/);
  assert.doesNotMatch(appSource, /window\.setTimeout\(\(\) => openFarmAuthDialog\(\), 0\)/);
  assert.doesNotMatch(appSource, /farmAuthRequired = \/access token\|invalid token\|expired\|auth_required/i);
});
