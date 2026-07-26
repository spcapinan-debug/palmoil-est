const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmActions = require("../api/farm-actions");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
const apiSource = fs.readFileSync(path.join(__dirname, "..", "api", "farm-actions.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "styles.css"), "utf8");
const migrationSource = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20260726165000_phase3_unique_plan_work_order.sql"),
  "utf8",
);

test("Phase 3 work and daily workspaces expose every requested tab", () => {
  for (const tab of [
    "ภาพรวม", "แผนประจำปี", "รายการแผน", "ใบสั่งงาน", "แจกจ่ายงาน", "ปฏิทินงาน", "งานรอดำเนินการ",
    "ผลงาน", "คนงานและเวลา", "วัสดุ", "ใบชั่ง", "รถและน้ำมัน", "Survey", "เอกสารแนบ", "ตรวจสอบและปิดงาน",
  ]) assert.match(appSource, new RegExp(tab));
  assert.match(appSource, /renderFarmWorkWorkspace\(\)/);
  assert.match(appSource, /renderFarmDailyWorkspace\(\)/);
});

test("work-order lists use the aggregate workflow view instead of per-row requests", () => {
  assert.match(appSource, /function farmWorkflowWorkspaceRows\(\)/);
  assert.match(appSource, /farmRowsByKey\("v_farm_workflow_workspace"\)/);
  assert.match(appSource, /ไม่เกิด N\+1 request/);
  assert.doesNotMatch(appSource, /rows\.map\([\s\S]{0,300}fetch\(/);
});

test("annual plans and plan items support filters, plan versus actual, and duplicate-safe creation", () => {
  for (const filter of ["year", "activity", "block", "status", "query"]) {
    assert.match(appSource, new RegExp(`data-farm-workspace-filter="${filter}"`));
  }
  assert.match(appSource, /Plan vs Actual/);
  assert.match(apiSource, /work_orders\?planned_work_item_id=eq\.\$\{plannedWorkItemId\}/);
  assert.match(apiSource, /already_exists:\s*true/);
  assert.match(apiSource, /postgresCode !== "23505"/);
  assert.match(apiSource, /new Map\(members\.map\(\(member\) => \[member\.employee_id,\s*member\]\)\)/);
  assert.match(migrationSource, /create unique index if not exists uq_work_orders_planned_work_item_id/);
  assert.match(migrationSource, /where planned_work_item_id is not null/);
});

test("business work-order numbers do not collapse into the legacy W/F short-number key", () => {
  const match = appSource.match(/function farmWorkOrderCanonicalKey\(row = \{\}\) \{([\s\S]*?)\n\}/);
  assert.ok(match);
  const factory = new Function("farmShortWorkOrderNo", `${match[0]}; return farmWorkOrderCanonicalKey;`);
  const canonical = factory((row) => row.work_order_no);
  assert.notEqual(
    canonical({ work_order_no: "WEBTEST-2569-WO-GRASS-DRAFT" }),
    canonical({ work_order_no: "WEBTEST-2569-WO-GRASS-READY" }),
  );
  assert.equal(canonical({ work_order_no: "W69-007" }), "w69-007");
});

test("business work-order numbers stay visible instead of receiving a generated legacy number", () => {
  const match = appSource.match(/function farmShortWorkOrderNo\(order = \{\}\) \{([\s\S]*?)\n\}/);
  assert.ok(match);
  const factory = new Function("farmThaiYearSuffix", "farmToday", `${match[0]}; return farmShortWorkOrderNo;`);
  const shortNo = factory(() => "69", () => "2026-07-26");
  assert.equal(shortNo({ work_order_no: "WEBTEST-2569-WO-GRASS-READY" }), "WEBTEST-2569-WO-GRASS-READY");
  assert.equal(shortNo({ work_order_no: "W69-7" }), "W69-007");
});

test("work-order lifecycle is server-only, guarded, scoped, confirmed, and idempotent", () => {
  const actions = farmActions._test.ACTIONS;
  for (const action of [
    "submit_work_order", "approve_work_order", "reject_work_order", "dispatch_work_order",
    "start_work_order", "complete_work_order", "close_work_order",
  ]) {
    assert.ok(actions[action], action);
    assert.equal(actions[action].confirmation, true, action);
  }
  assert.match(apiSource, /authorizeWorkOrderScope/);
  assert.match(apiSource, /workResultContext\(resultId, actor\)/);
  assert.match(apiSource, /validateWorkOrderStart/);
  assert.match(apiSource, /required before-start survey/);
  assert.match(apiSource, /claimIdempotency/);
  assert.match(apiSource, /work_order_status_logs/);
  assert.doesNotMatch(appSource, /function updateFarmWorkOrderDecision/);
});

test("daily save reuses get_or_create and writes draft through authenticated actions", () => {
  assert.match(appSource, /runFarmAction\("get_or_create_work_result"/);
  assert.match(appSource, /runFarmAction\("save_work_result_draft"/);
  assert.match(appSource, /existingResultId/);
  assert.match(apiSource, /Only draft work results can be edited/);
  for (const field of [
    "actual_start_at", "actual_end_at", "actual_area_rai", "actual_tree_count",
    "total_labor_hours", "stoppage_minutes", "completion_pct", "rework_quantity",
    "weather_condition", "terrain_condition",
  ]) assert.match(apiSource, new RegExp(field));
  assert.doesNotMatch(appSource, /formatThaiDate\(/);
});

test("worker allocation keeps snapshot rates and prevents duplicate employees", () => {
  assert.match(apiSource, /on_conflict=work_result_id,employee_id,work_date/);
  assert.match(apiSource, /rate_type/);
  assert.match(apiSource, /rate_amount/);
  assert.match(apiSource, /quantity_allocation_method/);
  assert.match(appSource, /new Set\(\(state\.farmResultDraft\?\.extraWorkerIds/);
});

test("weigh-ticket and goods-issue operations remain action-only", () => {
  assert.match(appSource, /farmRowsByKey\("v_available_inbound_weight_tickets"\)/);
  assert.match(appSource, /เฉพาะ in_out_type = I/);
  assert.match(apiSource, /Allocated weight exceeds the remaining inbound weight/);
  assert.match(apiSource, /v_available_inbound_weight_tickets\?transport_source_record_id/);
  assert.match(appSource, /runFarmAction\("link_inbound_weight_ticket"/);
  assert.match(apiSource, /allocated_weight_kg must be greater than zero/);
  assert.match(appSource, /runFarmAction\("prepare_goods_issue_from_work_order"/);
  assert.equal(farmActions._test.ACTIONS.post_goods_issue.confirmation, true);
});

test("survey gates, findings, attachments, and placeholders are surfaced", () => {
  assert.match(apiSource, /validateRequiredSurveys/);
  assert.match(appSource, /farmRowsByKey\("survey_findings"\)/);
  assert.match(appSource, /farmRowsByKey\("survey_response_attachments"\)/);
  assert.match(appSource, /Placeholder — ยังไม่มีไฟล์จริง/);
  assert.match(appSource, /ระบบไม่รับ URL จากผู้ใช้โดยตรง/);
});

test("route deep links preserve query params and browser back rehydrates the tab", () => {
  assert.match(appSource, /url\.searchParams\.set\("tab",\s*tab\)/);
  assert.match(appSource, /window\.addEventListener\("popstate"/);
  assert.doesNotMatch(appSource, /function openWorkspaceRoute[\s\S]{0,350}url\.search\s*=\s*""/);
  assert.match(appSource, /workspaceTabFromUrl/);
});

test("responsive rules cover tablet and mobile without exposing secrets", () => {
  assert.match(cssSource, /@media \(max-width: 900px\)/);
  assert.match(cssSource, /@media \(max-width: 600px\)/);
  assert.match(cssSource, /\.farm-responsive-table thead\s*\{\s*display:\s*none/);
  assert.doesNotMatch(appSource, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("Phase 3 does not enable any protected feature flag", () => {
  for (const key of [
    "system.dynamic_menu_enabled", "system.frontend_workspace_ready", "budget.rule_engine_enabled",
    "performance.activity_metrics_enabled", "performance.budget_recommendations_enabled",
    "fuel.configuration_confirmed", "integration.weighbridge_enabled", "system.rls_ready",
  ]) {
    const matches = [...appSource.matchAll(new RegExp(key.replaceAll(".", "\\."), "g"))];
    if (key === "system.dynamic_menu_enabled") assert.equal(matches.length, 1);
    else assert.equal(matches.length, 0);
  }
});
