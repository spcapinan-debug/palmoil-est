const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appPath = path.join(__dirname, "..", "webapp", "app.js");
const stylesPath = path.join(__dirname, "..", "webapp", "styles.css");
const appSource = fs.readFileSync(appPath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return appSource.slice(start, end);
}

function timelineSandbox(activity = null) {
  const sandbox = { farmLookup: () => activity };
  vm.createContext(sandbox);
  vm.runInContext(
    sourceBetween("function farmWorkTimelineActivityMeta", "function farmShortBlockText"),
    sandbox,
  );
  return sandbox;
}

test("timeline omits the unspecified-group prefix and keeps the activity code", () => {
  const sandbox = timelineSandbox();
  const original = "ไม่ระบุกลุ่มกิจกรรม / ตัดปาล์ม / EST002";
  const meta = sandbox.farmWorkTimelineActivityMeta({ work_order_title: original });

  assert.equal(meta.label, "ตัดปาล์ม / EST002");
  assert.equal(meta.label.includes("ไม่ระบุกลุ่มกิจกรรม"), false);
  assert.equal(meta.title, original);
});

test("timeline label uses canonical master name and code", () => {
  const sandbox = timelineSandbox({ activity_name: "ใส่ปุ๋ย", activity_code: "EST014" });
  assert.equal(sandbox.farmWorkTimelineActivityLabel({ activity_id: "activity-14" }), "ใส่ปุ๋ย / EST014");
});

test("timeline markup preserves the full tooltip and applies compact ellipsis styling", () => {
  assert.match(appSource, /title="\$\{esc\(activityTitle\)\}"/);
  assert.match(appSource, /class="farm-work-activity-label"/);
  const rule = stylesSource.match(/\.farm-work-left \.farm-work-activity-label\s*\{([^}]+)\}/);
  assert.ok(rule, "missing timeline activity label style");
  assert.match(rule[1], /overflow:\s*hidden/);
  assert.match(rule[1], /text-overflow:\s*ellipsis/);
  assert.match(rule[1], /white-space:\s*nowrap/);
});

function activityTreeSandbox() {
  const sandbox = {
    farmBudgetContractState: () => ({ selectedActivities: [] }),
    farmAuthoritativeRowsByKey: () => [],
    farmCanonicalRowIsActive: (row) => row.status !== "inactive" && row.is_active !== false,
    farmBudgetMatchesQuery: () => true,
    farmBudgetActivityLabel: (row) => `${row.activity_code || ""} ${row.activity_name || ""}`,
    farmBudgetActivityDisplayLabel: (row) => `${row.activity_name || ""} / ${row.activity_code || ""}`,
    farmBudgetSafeCode: (value) => String(value || "").toLowerCase().replace(/\W+/g, "-"),
    farmLookupLabel: () => "",
    esc: (value) => String(value ?? ""),
    fmt: (value) => String(value ?? ""),
    renderBudgetCheckbox: (_kind, id, label, selected) => (
      `<label data-activity="${id}"><input type="checkbox"${selected.includes(id) ? " checked" : ""}>${label}</label>`
    ),
  };
  vm.createContext(sandbox);
  vm.runInContext(
    sourceBetween("function renderFarmBudgetActivityTree", "const FARM_MATERIAL_PRIORITY_PREFIXES"),
    sandbox,
  );
  return sandbox;
}

test("Step 01 hydrates from canonical activity master without historical matches", () => {
  const sandbox = activityTreeSandbox();
  const groups = [{ id: "group-1", group_code: "G01", group_name: "ดูแลปาล์ม", status: "active" }];
  const activities = [
    { id: "activity-1", activity_group_id: "group-1", activity_code: "EST002", activity_name: "ตัดปาล์ม", status: "active" },
    { id: "activity-2", activity_group_id: "group-1", activity_code: "EST014", activity_name: "ใส่ปุ๋ย", status: "active" },
  ];
  const html = sandbox.renderFarmBudgetActivityTree({ selectedActivities: [] }, { groups, activities });

  assert.match(html, /ตัดปาล์ม \/ EST002/);
  assert.match(html, /ใส่ปุ๋ย \/ EST014/);
  assert.doesNotMatch(html, /ยังไม่มีข้อมูลกิจกรรม/);
  assert.match(appSource, /renderFarmBudgetActivityTree\(budgetPicks, \{ groups: activityGroups, activities \}\)/);
});

test("Step 01 activity multi-select survives renderer re-entry", () => {
  const sandbox = activityTreeSandbox();
  const groups = [{ id: "group-1", group_name: "ดูแลปาล์ม" }];
  const activities = [
    { id: "activity-1", activity_group_id: "group-1", activity_code: "EST002", activity_name: "ตัดปาล์ม" },
    { id: "activity-2", activity_group_id: "group-1", activity_code: "EST014", activity_name: "ใส่ปุ๋ย" },
  ];
  const picks = { selectedActivities: ["activity-1", "activity-2"] };

  const firstRender = sandbox.renderFarmBudgetActivityTree(picks, { groups, activities });
  const secondRender = sandbox.renderFarmBudgetActivityTree(picks, { groups, activities });
  assert.equal((firstRender.match(/ checked/g) || []).length, 2);
  assert.equal((secondRender.match(/ checked/g) || []).length, 2);
});

test("Step 01 selector keeps its own scroll container", () => {
  assert.match(stylesSource, /\.budget-tree-scroll\s*\{[^}]*overflow:\s*auto/s);
  assert.match(stylesSource, /\.farm-work-budget-selector \.budget-tree-scroll\s*\{[^}]*height:\s*430px/s);
});
