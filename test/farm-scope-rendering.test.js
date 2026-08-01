const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmTables = require("../api/farm-tables");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");

function context() {
  return {
    annualPlanIds: new Set(), blockIds: new Set(["block-a"]), blockKeys: new Set(["A01", "63-A01-R"]),
    goodsIssueIds: new Set(), goodsIssueLineIds: new Set(), goodsReturnIds: new Set(),
    inventoryMaterialIds: new Set(), plannedItemIds: new Set(), payrollPeriodIds: new Set(),
    payrollPeriodLineIds: new Set(), payrollSummaryIds: new Set(), surveyAnswerIds: new Set(),
    surveyAttachmentIds: new Set(), surveyResponseIds: new Set(), workOrderIds: new Set(["wo-a"]),
    workResultIds: new Set(["result-a"]),
  };
}

test("generic workspace views are authorized by relational IDs, not record-name prefixes", () => {
  const scoped = context();
  assert.equal(farmTables._test.uatRowAllowed("v_farm_workflow_workspace", { work_order_id: "wo-a" }, scoped), true);
  assert.equal(farmTables._test.uatRowAllowed("v_daily_work_entry_context", { work_result_id: "result-a" }, scoped), true);
  assert.equal(farmTables._test.uatRowAllowed("v_farm_workflow_workspace", { work_order_id: "wo-other", work_order_no: "WEBTEST-UAT-OTHER" }, scoped), false);
});

test("inbound tickets require a source area that matches an assigned block key", () => {
  const scoped = context();
  assert.equal(farmTables._test.uatRowAllowed("v_available_inbound_weight_tickets", { source_area_key: "63-A01-R" }, scoped), true);
  assert.equal(farmTables._test.uatRowAllowed("v_available_inbound_weight_tickets", { source_area_key: "Takuk", doc_no: "WEBTEST-2569" }, scoped), false);
});

test("payroll rows follow work-result period and summary relationships", () => {
  const scoped = context();
  scoped.payrollPeriodIds.add("period-a");
  scoped.payrollPeriodLineIds.add("period-line-a");
  scoped.payrollSummaryIds.add("summary-a");
  assert.equal(farmTables._test.uatRowAllowed("payroll_periods", { id: "period-a" }, scoped), true);
  assert.equal(farmTables._test.uatRowAllowed("payroll_period_lines", { id: "period-line-a" }, scoped), true);
  assert.equal(farmTables._test.uatRowAllowed("payroll_earning_lines", { payroll_summary_id: "summary-a" }, scoped), true);
  assert.equal(farmTables._test.uatRowAllowed("payroll_earning_lines", { payroll_summary_id: "summary-other", work_order_no: "WEBTEST-ANY" }, scoped), false);
});

test("partial table responses merge into existing client state without clearing other tables", () => {
  assert.match(appSource, /replaceSnapshot = replacesAll && !Object\.keys\(payload\.errors \|\| \{\}\)\.length/);
  assert.match(appSource, /state\.farmDbRows = replaceSnapshot \? nextRows : \{ \.\.\.\(state\.farmDbRows \|\| \{\}\), \.\.\.nextRows \}/);
  assert.match(appSource, /state\.farmDbErrors = replaceSnapshot \? \(payload\.errors \|\| \{\}\)/);
  assert.match(appSource, /farmMarkTablesLoaded\(Object\.keys\(nextRows\)\)/);
});
