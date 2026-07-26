const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmTables = require("../api/farm-tables");
const farmActions = require("../api/farm-actions");

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
    end(body) { this.body = JSON.parse(body); },
  };
}

test("farm table allowlist covers the handoff schema", () => {
  for (const table of EXPECTED_TABLES) assert.equal(farmTables._test.TABLES.has(table), true, table);
});

test("GET requires an explicit requested table list", () => {
  assert.throws(() => farmTables._test.requestedTables(""), (error) => error.code === "TABLES_REQUIRED");
  assert.deepEqual(farmTables._test.requestedTables("work_orders,work_results,work_orders"), ["work_orders", "work_results"]);
  assert.throws(() => farmTables._test.requestedTables("not_a_real_table"), (error) => error.code === "INVALID_TABLE");
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

test("farm table healthcheck does not expose secret metadata", async () => {
  const res = responseRecorder();
  await farmTables({ method: "GET", url: "/api/farm-tables?healthcheck=1", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, route: "farm-tables", authRequired: true });
});

test("write implementation has no fallback or silent column stripping", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "api", "farm-tables.js"), "utf8");
  const shared = fs.readFileSync(path.join(__dirname, "..", "api", "_farm-api.js"), "utf8");
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
