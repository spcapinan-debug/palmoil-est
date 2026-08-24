const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "webapp", "index.html"), "utf8");
const uxSource = fs.readFileSync(path.join(root, "webapp", "planning-selector-ux.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const buildSource = fs.readFileSync(path.join(root, "webapp", "scripts", "build_online_export.mjs"), "utf8");
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

test("planning overview keeps the existing timeline before the existing Step 01-04 planner", () => {
  const start = appSource.indexOf("function renderFarmWorkWorkspace()");
  const end = appSource.indexOf("function farmDailyCurrentResult", start);
  const body = appSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(body.indexOf("renderFarmWorkBoard") < body.indexOf("renderFarmWorkPlanner"));
  for (const step of ["01", "02", "03", "04"]) assert.ok(appSource.includes('["' + step + '"'));
});

test("each existing selector receives isolated search, bulk actions, count, and selected summary", () => {
  assert.ok(uxSource.includes("farm-work-budget-selector"));
  for (const type of ["block", "activity", "material", "vehicle", "worker"]) {
    assert.ok(uxSource.includes('type: "' + type + '"'));
  }
  for (const label of ["ค้นหา", "เลือกทั้งหมด", "ล้างทั้งหมด", "เลือกแล้ว", "Selected summary"]) {
    assert.ok(uxSource.includes(label));
  }
  assert.ok(uxSource.includes("MutationObserver"));
  assert.ok(uxSource.includes('dispatchEvent(new Event("change", { bubbles: true }))'));
  assert.ok(cssSource.includes("budget-tree-item.is-selected"));
  assert.ok(cssSource.includes("overscroll-behavior: contain"));
});

test("UX layer delegates to checkbox changes and does not access planning calculations or state", () => {
  for (const internal of [
    "farmWorkPlanState", "farmBudgetRateCost", "selectedBudgetRateId",
    "planned_total_cost", "totalCost", "state.farmWorkPlan",
  ]) assert.equal(uxSource.includes(internal), false, internal);
});

test("Preview and standalone export include the additive selector script", () => {
  assert.ok(indexSource.includes('src="/planning-selector-ux.js'));
  assert.ok(vercelConfig.routes.some((route) => route.dest === "/webapp/planning-selector-ux.js"));
  assert.ok(buildSource.includes("planningSelectorUx"));
});
