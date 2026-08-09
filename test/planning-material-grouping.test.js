const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const farmTables = require("../api/farm-tables");

function materialGroupingHarness() {
  const labelStart = appSource.indexOf("function farmBudgetMaterialLabel");
  const labelEnd = appSource.indexOf("function farmBudgetVehicleLabel", labelStart);
  const groupingStart = appSource.indexOf("const FARM_MATERIAL_PRIORITY_PREFIXES");
  const groupingEnd = appSource.indexOf("function renderFarmBudgetMaterialTree", groupingStart);
  assert.ok(labelStart >= 0 && labelEnd > labelStart, "material label helper must remain inspectable");
  assert.ok(groupingStart >= 0 && groupingEnd > groupingStart, "material grouping helpers must remain inspectable");
  const sandbox = {};
  vm.runInNewContext(`${appSource.slice(labelStart, labelEnd)}\n${appSource.slice(groupingStart, groupingEnd)}\nresult = {
    groupMaterialsByCategory, farmSelectedAvailableMaterialIds,
  };`, sandbox);
  return sandbox.result;
}

const categories = [
  { id: "cat-f", category_code: "F-CM", category_name: "Fertilizer" },
  { id: "cat-h", category_code: "C-HB", category_name: "Herbicide" },
  { id: "cat-p", category_code: "C-PT", category_name: "Pesticide" },
];

const materials = [
  { id: "m2", material_code: "F-CM-0002", material_name: "Urea", category_id: "cat-f", status: "active" },
  { id: "m1", material_code: "F-CM-0001", material_name: "Dolomite", category_id: "cat-f", status: "active" },
  { id: "m3", material_code: "C-HB-0001", material_name: "Glyphosate", category_id: "cat-h", status: "active" },
  { id: "m4", material_code: "X-0001", material_name: "No category", category_id: null, status: "active" },
  { id: "m5", material_code: "X-0002", material_name: "Missing category", category_id: "cat-missing", status: "active" },
];

test("Planning loads categories and units in the existing workflow batch", () => {
  const start = appSource.indexOf('if (["farm-work", "farm-dispatch", "farm-result", "farm-performance"].includes(view))');
  const end = appSource.indexOf('if (view === "farm-dispatch")', start);
  const workflowBatch = appSource.slice(start, end);
  assert.match(workflowBatch, /"material_categories"/);
  assert.match(workflowBatch, /"materials"/);
  assert.match(workflowBatch, /"units"/);
  assert.doesNotMatch(workflowBatch, /fetch\(/);
});

test("materials group by category_id through one indexed source of truth", () => {
  const model = materialGroupingHarness().groupMaterialsByCategory(materials, categories);
  assert.deepEqual(Array.from(model.groups, (group) => [
    group.category.category_code,
    Array.from(group.materials, (material) => material.material_code),
  ]), [
    ["F-CM", ["F-CM-0001", "F-CM-0002"]],
    ["C-HB", ["C-HB-0001"]],
  ]);
  assert.deepEqual(Array.from(model.ungrouped, (material) => material.id), ["m4", "m5"]);
  assert.equal(model.totalMaterials, 5);
  assert.equal(model.categorizedMaterials, 3);
  assert.equal(model.ungroupedMaterials, 2);
});

test("fallback contains only null or missing category foreign keys", () => {
  const model = materialGroupingHarness().groupMaterialsByCategory(materials, categories);
  assert.ok(model.groups.every((group) => group.materials.every((material) => material.category_id === group.category.id)));
  assert.ok(model.ungrouped.every((material) => !material.category_id || !categories.some((category) => category.id === material.category_id)));
});

test("material search matches material and category fields while keeping the heading", () => {
  const api = materialGroupingHarness();
  const byMaterial = api.groupMaterialsByCategory(materials, categories, "dolomite");
  assert.deepEqual(Array.from(byMaterial.groups, (group) => [group.category.category_code, group.materials[0].id]), [["F-CM", "m1"]]);
  const byCategory = api.groupMaterialsByCategory(materials, categories, "fertilizer");
  assert.deepEqual(Array.from(byCategory.groups[0].materials, (material) => material.id), ["m1", "m2"]);
});

test("selected material IDs survive grouping and filtered search", () => {
  const api = materialGroupingHarness();
  const visible = api.groupMaterialsByCategory(materials, categories, "dolomite");
  assert.deepEqual(Array.from(visible.groups[0].materials, (material) => material.id), ["m1"]);
  assert.deepEqual(Array.from(api.farmSelectedAvailableMaterialIds(["m2"], materials)), ["m2"]);
});

test("inactive materials stay unavailable under grouping", () => {
  const rendererStart = appSource.indexOf("function renderFarmBudgetMaterialTree");
  const rendererEnd = appSource.indexOf("function renderFarmBudgetVehicleTree", rendererStart);
  assert.match(appSource.slice(rendererStart, rendererEnd), /status \|\| "active"\)\.toLowerCase\(\) !== "inactive"/);
});

test("Budget and Planning render the same shared material tree", () => {
  assert.equal((appSource.match(/function renderFarmBudgetMaterialTree/g) || []).length, 1);
  assert.equal((appSource.match(/renderFarmBudgetMaterialTree\(budgetPicks\)/g) || []).length, 1);
  assert.equal((appSource.match(/renderFarmBudgetMaterialTree\(\)/g) || []).length, 1);
  const rendererStart = appSource.indexOf("function renderFarmBudgetMaterialTree");
  const rendererEnd = appSource.indexOf("function renderFarmBudgetVehicleTree", rendererStart);
  assert.match(appSource.slice(rendererStart, rendererEnd), /groupMaterialsByCategory\(materials, categories, picks\.query \|\| ""\)/);
});

test("Planning explains the derived Block scope without hardcoding UAT Blocks", () => {
  const start = appSource.indexOf("function renderFarmWorkPlanner");
  const end = appSource.indexOf("async function createFarmWorkPlanFromSelection", start);
  const planner = appSource.slice(start, end);
  assert.match(planner, /const scopedBlockCount = farmBudgetScopedBlocks\(\)\.length/);
  assert.match(planner, /แสดงพื้นที่ตามสิทธิ์ผู้ใช้งาน: \$\{fmt\(scopedBlockCount\)\} Block/);
  assert.doesNotMatch(planner, /A01|A02|A03|scopedBlockCount\s*=\s*3/);
});

test("scoped and full-scope roles remain data-driven", () => {
  const scopedActor = { roles: new Set(["uat_manager"]), scopes: [{ block_id: "b1" }, { block_id: "b2" }, { block_id: "b3" }] };
  assert.equal(farmTables._test.actorCanAccessBlock(scopedActor, { id: "b3" }), true);
  assert.equal(farmTables._test.actorCanAccessBlock(scopedActor, { id: "b4" }), false);
  assert.equal(farmTables._test.actorCanAccessBlock({ roles: new Set(["super_admin"]), scopes: [] }, { id: "b103" }), true);
  assert.equal(farmTables._test.actorCanAccessBlock({ roles: new Set(["planner"]), scopes: [{ scope_type: "global" }] }, { id: "b103" }), true);
});

test("mobile Planning material rows keep a 44px tap target and horizontal card scrolling", () => {
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*?\.farm-work-budget-selector \{[\s\S]*?overflow-x:\s*auto/);
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*?\.farm-work-budget-selector \.budget-tree-item\s*\{[^}]*min-height:\s*44px/);
});
