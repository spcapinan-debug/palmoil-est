const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmTables = require("../api/farm-tables");
const farmActions = require("../api/farm-actions");
const farmApi = require("../lib/server/farm-api");

const EXPECTED_TABLES = `
v_app_navigation v_app_workspace_definition v_app_workspace_tabs v_management_action_center v_system_module_readiness
annual_work_plans planned_work_items planned_work_materials work_orders work_order_workers work_order_materials work_order_machines
work_results work_result_workers work_attendance work_result_weight_tickets v_farm_workflow_workspace v_daily_work_entry_context
v_available_inbound_weight_tickets
warehouses material_lots stock_balances stock_transactions goods_issues goods_issue_lines v_inventory_work_order_workspace v_inventory_setup_queue
fuel_tanks fuel_requisitions fuel_issues vehicle_fuel_balances vehicle_fuel_measurements vehicle_fuel_consumption_periods
work_result_vehicle_usage vehicle_fuel_efficiency_standards v_vehicle_fuel_status v_work_result_vehicle_fuel_detail v_fuel_control_exceptions
departments positions employee_employment_terms payroll_employee_summaries payroll_earning_lines payroll_allowance_lines payroll_deduction_lines
v_hr_people_workspace v_payroll_period_workspace activity_performance_standards work_performance_metrics activity_budget_rate_recommendations
budget_rate_rule_sets budget_rate_rules budget_rate_rule_conditions budget_rate_rule_blocks budget_rate_block_snapshots
v_budget_activity_rates_unified v_budget_rate_rule_editor v_budget_rate_announcement_matrix survey_templates survey_questions
survey_template_assignments survey_responses survey_answers survey_response_attachments survey_answer_attachments survey_findings
v_survey_response_summary v_survey_question_analysis v_survey_finding_followup v_survey_action_center roles permissions role_permissions
menu_items profiles profile_roles user_access_scopes audit_logs system_settings
`.trim().split(/\s+/);

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(body) { this.body = JSON.parse(body); },
  };
}

function apiRequest(method, url, body, { authenticated = true } = {}) {
  const raw = body === undefined ? "" : (typeof body === "string" ? body : JSON.stringify(body));
  return {
    method,
    url,
    headers: authenticated ? { authorization: "Bearer user-access-token" } : {},
    async *[Symbol.asyncIterator]() {
      if (raw) yield Buffer.from(raw);
    },
  };
}

async function withAuthenticatedFarmApi(run) {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    global.fetch = async (url) => {
      const text = String(url);
      if (text.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
      const resource = text.split("/rest/v1/")[1]?.split("?")[0] || "";
      if (resource === "profiles") {
        return new Response(JSON.stringify([{ id: "user-1", status: "active", role: "super_admin" }]), { status: 200 });
      }
      if (resource === "profile_roles" || resource === "user_access_scopes") {
        return new Response("[]", { status: 200 });
      }
      const rows = resource === "work_orders"
        ? [{ id: "work-order-1", work_order_no: "WEBTEST-2569-WO-FERT-001" }]
        : [];
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      });
    };
    farmTables._test.clearCache();
    await run();
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    farmTables._test.clearCache();
  }
}

test("farm table allowlist covers the handoff schema", () => {
  for (const table of EXPECTED_TABLES) assert.equal(farmTables._test.TABLES.has(table), true, table);
});

test("GET requires an explicit requested table list", () => {
  assert.throws(() => farmTables._test.requestedTables(""), (error) => error.code === "TABLES_REQUIRED");
  assert.deepEqual(farmTables._test.requestedTables("work_orders,work_results,work_orders"), ["work_orders", "work_results"]);
  assert.throws(() => farmTables._test.requestedTables("not_a_real_table"), (error) => error.code === "INVALID_TABLE");
});

test("farm table errors are contained, standardized, and recoverable", async () => {
  await withAuthenticatedFarmApi(async () => {
    const responses = [];
    const recover = async () => {
      const res = responseRecorder();
      responses.push(res);
      await farmTables(apiRequest("GET", "/api/farm-tables?table=work_orders&refresh=1"), res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.tables.work_orders[0].work_order_no, "WEBTEST-2569-WO-FERT-001");
    };

    const unknown = responseRecorder();
    responses.push(unknown);
    await farmTables(apiRequest("GET", "/api/farm-tables?table=not_allowed_table"), unknown);
    assert.equal(unknown.statusCode, 400);
    assert.deepEqual(unknown.body, {
      ok: false,
      error: { code: "INVALID_TABLE", message: "Requested table is not allowed" },
    });
    await recover();

    for (const body of [{}, { table: "work_orders" }]) {
      const invalidPost = responseRecorder();
      responses.push(invalidPost);
      await farmTables(apiRequest("POST", "/api/farm-tables", body), invalidPost);
      assert.equal(invalidPost.statusCode, 400);
      assert.deepEqual(invalidPost.body, {
        ok: false,
        error: { code: "INVALID_PAYLOAD", message: "Request payload is invalid" },
      });
      await recover();
    }

    const invalidDelete = responseRecorder();
    responses.push(invalidDelete);
    await farmTables(apiRequest("DELETE", "/api/farm-tables", {}), invalidDelete);
    assert.equal(invalidDelete.statusCode, 400);
    assert.equal(invalidDelete.body.error.code, "INVALID_PAYLOAD");
    await recover();

    const unsupported = responseRecorder();
    responses.push(unsupported);
    await farmTables(apiRequest("PATCH", "/api/farm-tables", undefined, { authenticated: false }), unsupported);
    assert.equal(unsupported.statusCode, 405);
    assert.equal(unsupported.body.error.code, "METHOD_NOT_ALLOWED");
    assert.equal(unsupported.headers.Allow, "GET, POST, DELETE, OPTIONS");
    await recover();

    await new Promise((resolve) => setImmediate(resolve));
    const output = JSON.stringify(responses.map((res) => res.body));
    assert.doesNotMatch(output, /SUPABASE_SERVICE_ROLE_KEY|server-only-test-key|Authorization|apikey/i);
  });
});

test("internal errors are generic and the shared helper is not an API route", () => {
  const res = responseRecorder();
  farmApi.errorResponse(res, new farmApi.ApiError(
    500,
    "SERVER_CONFIG_ERROR",
    "Server configuration contains sensitive details",
    { stack: "private stack" }
  ));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
  assert.equal(fs.existsSync(path.join(__dirname, "..", "api", "_farm-api.js")), false);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "lib", "server", "farm-api.js")), true);
  const browserSource = [
    fs.readFileSync(path.join(__dirname, "..", "webapp", "index.html"), "utf8"),
    fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(browserSource, /_farm-api|lib\/server\/farm-api/);
});

test("authenticated API smoke reads the Phase 2 and WEBTEST-2569 tables only", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const requested = [];
  const rows = {
    v_app_navigation: [{ menu_key: "dashboard", route: "/farm/dashboard" }],
    v_app_workspace_definition: [{ workspace_key: "farm.work" }],
    v_app_workspace_tabs: [{ menu_key: "farm.work_orders", route: "/farm/work" }],
    v_management_action_center: [{ action_key: "test", item_count: 1 }],
    v_system_module_readiness: [{ module_key: "farm.work", readiness_status: "ready" }],
    annual_work_plans: [{ plan_name: "WEBTEST-2569" }],
    work_orders: [
      { work_order_no: "WEBTEST-2569-WO-FERT-001", status: "closed" },
      { work_order_no: "WEBTEST-2569-WO-HARV-001", status: "in_progress" },
      { work_order_no: "WEBTEST-2569-WO-GRASS-DRAFT", status: "approved" },
      { work_order_no: "WEBTEST-2569-WO-GRASS-READY", status: "approved" },
    ],
    work_results: Array.from({ length: 4 }, (_, index) => ({ id: `result-${index + 1}` })),
    survey_templates: Array.from({ length: 4 }, (_, index) => ({ template_code: `WEBTEST-2569-SURVEY-${index + 1}` })),
    survey_questions: [{ question_code: "WEBTEST-2569-Q-1" }],
    survey_responses: Array.from({ length: 4 }, (_, index) => ({ response_no: `WEBTEST-2569-R-${index + 1}` })),
    survey_findings: Array.from({ length: 3 }, (_, index) => ({ finding_no: `WEBTEST-2569-F-${index + 1}` })),
  };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    global.fetch = async (url) => {
      const text = String(url);
      if (text.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
      const resource = text.split("/rest/v1/")[1]?.split("?")[0] || "";
      requested.push(resource);
      if (resource === "profiles") {
        return new Response(JSON.stringify([{ id: "user-1", status: "active", role: "super_admin" }]), { status: 200 });
      }
      if (resource === "profile_roles" || resource === "user_access_scopes") {
        return new Response("[]", { status: 200 });
      }
      const data = rows[resource] || [];
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-range": `0-${Math.max(data.length - 1, 0)}/${data.length}` },
      });
    };
    farmTables._test.clearCache();
    const tableList = Object.keys(rows).join(",");
    const res = responseRecorder();
    await farmTables({
      method: "GET",
      url: `/api/farm-tables?tables=${tableList}&limit=5000&refresh=1`,
      headers: { authorization: "Bearer user-access-token" },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.tables.annual_work_plans.length, 1);
    assert.deepEqual([...new Set(res.body.tables.work_orders.map((row) => row.status))].sort(), ["approved", "closed", "in_progress"]);
    assert.equal(res.body.tables.survey_templates.length, 4);
    assert.equal(res.body.tables.survey_responses.length, 4);
    assert.equal(res.body.tables.survey_findings.length, 3);
    assert.equal(requested.some((name) => name.startsWith("transport_")), false);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    farmTables._test.clearCache();
  }
});

test("parallel reads respect the configured concurrency", async () => {
  let running = 0;
  let maximum = 0;
  const values = await farmTables._test.parallelMap(Array.from({ length: 20 }, (_, index) => index), 4, async (value) => {
    running += 1;
    maximum = Math.max(maximum, running);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running -= 1;
    return value * 2;
  });
  assert.equal(maximum <= 4, true);
  assert.equal(values[19], 38);
});

test("farm table healthcheck validates server configuration without exposing secrets", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    const res = responseRecorder();
    await farmTables({ method: "GET", url: "/api/farm-tables?healthcheck=1", headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, route: "farm-tables", configured: true, authRequired: true });
    assert.doesNotMatch(JSON.stringify(res.body), /server-only-test-key|SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("Supabase server configuration fails fast without both required variables", () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => farmApi.config(), (error) => (
      error.code === "SERVER_CONFIG_ERROR"
      && /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/.test(error.message)
    ));
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("Preview Supabase configuration fails closed unless it resolves to the isolated RC staging ref", () => {
  const previous = Object.fromEntries([
    "VERCEL_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "RC_STAGING_SUPABASE_REF", "RC_PRODUCTION_SUPABASE_REF",
  ].map((name) => [name, process.env[name]]));
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    process.env.RC_STAGING_SUPABASE_REF = "stagingref";
    process.env.RC_PRODUCTION_SUPABASE_REF = "productionref";
    process.env.SUPABASE_URL = "https://productionref.supabase.co";
    assert.throws(() => farmApi.config(), (error) => (
      error.code === "RC_PREVIEW_PRODUCTION_DATABASE_FORBIDDEN"
      && error.message === "RC_PREVIEW_PRODUCTION_DATABASE_FORBIDDEN"
    ));

    process.env.SUPABASE_URL = "https://anotherref.supabase.co";
    assert.throws(() => farmApi.config(), (error) => (
      error.code === "RC_PREVIEW_PRODUCTION_DATABASE_FORBIDDEN"
    ));

    process.env.SUPABASE_URL = "https://stagingref.supabase.co";
    assert.deepEqual(farmApi.config(), {
      url: "https://stagingref.supabase.co",
      serviceKey: "server-only-test-key",
    });

    delete process.env.RC_STAGING_SUPABASE_REF;
    assert.throws(() => farmApi.config(), (error) => (
      error.code === "RC_PREVIEW_PRODUCTION_DATABASE_FORBIDDEN"
    ));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("write implementation has no fallback or silent column stripping", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "api", "farm-tables.js"), "utf8");
  const shared = fs.readFileSync(path.join(__dirname, "..", "lib", "server", "farm-api.js"), "utf8");
  assert.doesNotMatch(source, /saveFallback|farm_master_records|missingColumnFromError|delete\s+writable/i);
  assert.match(shared, /SCHEMA_MISMATCH/);
  assert.match(source, /DELETE_ALL_DISABLED/);
});

test("action gateway allowlists high-risk RPCs with confirmations", () => {
  const actions = farmActions._test.ACTIONS;
  for (const name of [
    "get_or_create_work_result", "prepare_goods_issue_from_work_order", "approve_goods_issue",
    "link_inbound_weight_ticket",
    "post_goods_issue", "prepare_payroll_period", "approve_payroll_period", "close_payroll_period",
    "refresh_vehicle_fuel_requisition", "refresh_fuel_tank_purchase_requisition",
    "allocate_vehicle_fuel_period", "reset_web_test_run", "create_web_test_run",
  ]) assert.ok(actions[name], name);
  for (const name of [
    "approve_goods_issue", "post_goods_issue", "approve_payroll_period", "close_payroll_period",
    "allocate_vehicle_fuel_period", "reset_web_test_run", "create_web_test_run",
  ]) assert.equal(actions[name].confirmation, true, name);
});

test("weigh-ticket writes use the inbound-only action path", () => {
  const action = farmActions._test.ACTIONS.link_inbound_weight_ticket;
  assert.equal(action.permission, "farm.weigh_ticket.link");
  assert.equal(action.confirmation, true);
  assert.equal(farmTables._test.ACTION_ONLY_TABLES.has("work_result_weight_tickets"), true);
});

test("survey lifecycle is action-only and protects state transitions", () => {
  const actions = farmActions._test.ACTIONS;
  for (const name of [
    "create_survey_response", "save_survey_draft", "submit_survey_response",
    "verify_survey_response", "close_survey_response", "create_survey_finding",
    "resolve_survey_finding",
  ]) assert.ok(actions[name], name);
  for (const name of [
    "submit_survey_response", "verify_survey_response", "close_survey_response",
    "resolve_survey_finding",
  ]) assert.equal(actions[name].confirmation, true, name);
  for (const table of ["survey_responses", "survey_answers", "survey_findings"]) {
    assert.equal(farmTables._test.ACTION_ONLY_TABLES.has(table), true, table);
  }
});

test("posted inventory, payroll, and fuel records cannot bypass action validation", () => {
  for (const table of [
    "stock_transactions", "goods_issues", "fuel_issues", "payroll_periods",
    "payroll_employee_summaries", "budget_rate_block_snapshots",
  ]) assert.equal(farmTables._test.ACTION_ONLY_TABLES.has(table), true, table);
});

test("test-run actions reject every dataset except WEBTEST-2569", () => {
  assert.equal(farmActions._test.requireWebTestCode("WEBTEST-2569"), "WEBTEST-2569");
  assert.throws(() => farmActions._test.requireWebTestCode("REAL-DATA"), (error) => error.code === "VALIDATION_ERROR");
});

test("security migration keeps flags off and hardens views and RPC grants", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260726004947_phase1_farm_api_security.sql"),
    "utf8"
  );
  assert.match(sql, /security_invoker\s*=\s*true/);
  assert.match(sql, /revoke execute on function public\.create_full_web_test_run/);
  assert.match(sql, /'performance\.activity_metrics_enabled', 'false'/);
  assert.match(sql, /'performance\.budget_recommendations_enabled', 'false'/);
  assert.doesNotMatch(sql, /setting_value[^;]*'true'/s);
});

test("server APIs have no Supabase URL or anonymous-key fallback", () => {
  for (const file of ["est-master.js", "farm-budget-cleanup.js", "farm-budget-sync.js", "transport-sync.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "api", file), "utf8");
    assert.doesNotMatch(source, /xhtwmzlorceebsemqkww\.supabase\.co|SUPABASE_ANON_KEY/);
  }
  const shared = fs.readFileSync(path.join(__dirname, "..", "lib", "server", "farm-api.js"), "utf8");
  assert.doesNotMatch(shared, /xhtwmzlorceebsemqkww\.supabase\.co|SUPABASE_ANON_KEY/);
});

test("local Supabase secrets are ignored and only empty server variables are documented", () => {
  const example = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8").trim().replaceAll("\r\n", "\n");
  const ignore = fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8");
  assert.match(example, /^SUPABASE_URL=$/m);
  assert.match(example, /^SUPABASE_SERVICE_ROLE_KEY=$/m);
  assert.match(example, /^FARM_AUTH_RECOVERY_REDIRECT_URL=$/m);
  assert.equal(example.split("\n").filter((line) => line && !line.startsWith("#")).every((line) => line.endsWith("=")), true);
  assert.equal(example.split("\n").filter((line) => line && !line.startsWith("#")).every((line) => /^[A-Z0-9_]+=$/.test(line)), true);
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.local$/m);
  assert.match(ignore, /^\.env\.\*\.local$/m);
});
