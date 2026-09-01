const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");

const payrollMarker = "/* Phase 2G canonical Payroll workspace: additive to the existing Farm shell. */";
const payrollStart = styles.indexOf(payrollMarker);
const sharedStyles = styles.slice(0, payrollStart);
const payrollStyles = styles.slice(payrollStart).replace(/\/\*[\s\S]*?\*\//g, "");

test("Phase 2G Payroll CSS stays scoped and cannot override shared workspace selectors", () => {
  assert.ok(payrollStart > 0, "missing Phase 2G Payroll CSS boundary");
  assert.doesNotMatch(sharedStyles, /phase2g-/);

  const selectorHeaders = [...payrollStyles.matchAll(/(?:^|})\s*([^{}]+?)\s*\{/gm)]
    .map((match) => match[1].trim())
    .filter((header) => header && !header.startsWith("@"));
  assert.ok(selectorHeaders.length > 0);
  for (const header of selectorHeaders) {
    for (const selector of header.split(",")) {
      assert.match(selector.trim(), /^\.phase2g-/, `unscoped Phase 2G selector: ${selector.trim()}`);
    }
  }

  assert.doesNotMatch(
    payrollStyles,
    /(?:^|}|,)\s*\.(?:workspace|panel|card|grid|summary-grid|detail-grid|content|main|section|table|workflow)(?=[\s,{.:#\[])/gm,
  );
});

test("Farm Work desktop keeps a full-width, shrink-safe workspace with non-overlapping grid tracks", () => {
  assert.match(styles, /\.content\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.farm-page\s*\{[\s\S]*?display:\s*grid/);
  assert.match(styles, /\.farm-workspace-content,\s*\n\.farm-daily-workspace\s*\{\s*min-width:\s*0/);
  assert.match(styles, /\.farm-workspace-metrics\s*\{[\s\S]*?repeat\(auto-fit,\s*minmax\(150px,\s*1fr\)\)/);
  assert.match(styles, /\.farm-workspace-metrics article\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.farm-plan-flow\s*\{[\s\S]*?repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.farm-plan-card\s*\{[\s\S]*?min-width:\s*0/);
});

test("shared desktop layout prevents document overflow while tables retain internal scrolling", () => {
  assert.match(styles, /\.content\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.farm-work-page \.farm-work-layout\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.table-wrap\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*?\.farm-workspace-filters\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(styles, /@media \(max-width:\s*600px\)[\s\S]*?\.farm-daily-entry-actions/);
});

test("Planning baseline retains Step 01-04 and the five resource selector columns", () => {
  const start = app.indexOf("function renderFarmWorkPlanner()");
  const end = app.indexOf("async function createFarmWorkPlanFromSelection", start);
  assert.ok(start >= 0 && end > start);
  const planner = app.slice(start, end);
  for (const label of [
    "เลือกข้อมูลที่จะใช้สร้าง Work Order",
    "งานที่จะทำ",
    "วิธีคำนวณและทรัพยากร",
    "ตรวจแล้วสร้าง",
    "พื้นที่ / ที่ตั้ง",
    "กลุ่มกิจกรรม / กิจกรรม",
    "วัสดุ",
    "รถ / เครื่องจักร",
    "พนักงาน",
  ]) assert.ok(planner.includes(label), label);
  assert.equal((planner.match(/<section class="budget-tree-card/g) || []).length, 5);
  assert.match(styles, /\.budget-tree-grid-work-order\s*\{\s*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
});

test("Planning, Budget, Scheduler and Daily Result routes keep substantive non-Payroll renderers", () => {
  assert.match(app, /isBudgetPage \? renderFarmBudgetBoard\(\) : ""/);
  assert.match(app, /isWorkPage \? \(farmWorkflowModeFromUrl\(\) === "workspace"[\s\S]*?renderFarmWorkWorkspace\(\)[\s\S]*?renderFarmWorkEntry\(\)/);
  assert.match(app, /isDispatchPage \? \(farmWorkflowModeFromUrl\(\) === "workspace"[\s\S]*?renderFarmDispatchWorkspace\(\)[\s\S]*?renderFarmDispatchEntry\(\)/);
  assert.match(app, /isResultPage \? \(farmWorkflowModeFromUrl\(\) === "workspace"[\s\S]*?renderFarmDailyWorkspace\(\)[\s\S]*?renderFarmDailyEntry\(\)/);
  assert.match(app, /function renderFarmWorkEntry\(\)[\s\S]*?renderFarmCanonicalPlanner\(\)/);
  assert.match(app, /function renderFarmDispatchEntry\(\)[\s\S]*?renderFarmDispatchPanel\(\)/);
  assert.match(app, /function renderFarmDailyEntry\(\)[\s\S]*?renderFarmResultPanel\(\)/);
});

test("Phase 2G components render only on Payroll", () => {
  assert.match(app, /const isPayrollPage = module\.id === "farm-payroll"/);
  assert.match(app, /\$\{isPayrollPage \? renderFarmPhase2gPayrollWorkspace\(\) : ""\}/);
  assert.match(app, /<section class="phase2g-payroll-workspace" data-phase2g-payroll-workspace>/);
  assert.match(app, /isWorkflowPage \|\| isBudgetPage \|\| isActivityPage \|\| isAreaPage \|\| isTeamPage \|\| isPeoplePage \|\| isInventoryPage \|\| isPayrollPage \? ""/);
});
