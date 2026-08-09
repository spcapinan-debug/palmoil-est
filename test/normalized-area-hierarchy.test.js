const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");

function areaHierarchyHarness() {
  const keyStart = appSource.indexOf("function farmBlockMapKey(");
  const keyEnd = appSource.indexOf("function farmBlockMapKeyVariants", keyStart);
  const hierarchyStart = appSource.indexOf("function farmAreaHierarchyComparableKeys");
  const hierarchyEnd = appSource.indexOf("function farmAreaHierarchy()", hierarchyStart);
  assert.ok(keyStart >= 0 && keyEnd > keyStart, "Block key normalizer must remain inspectable");
  assert.ok(hierarchyStart >= 0 && hierarchyEnd > hierarchyStart, "shared Area hierarchy must remain inspectable");
  const sandbox = {};
  vm.runInNewContext(`${appSource.slice(keyStart, keyEnd)}\n${appSource.slice(hierarchyStart, hierarchyEnd)}\nresult = { buildFarmAreaHierarchy };`, sandbox);
  return sandbox.result;
}

const normalized = {
  estates: [{ id: "estate-1", estate_code: "SPC", estate_name: "สวนคีรีรัฐนิคม", status: "active" }],
  zones: [{ id: "zone-1", estate_id: "estate-1", zone_code: "LOW", zone_name: "ตอนล่าง", status: "active" }],
  plots: [
    { id: "plot-12", estate_id: "estate-1", zone_id: "zone-1", plot_code: "EST012", plot_name: "EST012", status: "active" },
    { id: "plot-13", estate_id: "estate-1", zone_id: "zone-1", plot_code: "EST013", plot_name: "EST013", status: "active" },
    { id: "plot-25", estate_id: "estate-1", zone_id: "zone-1", plot_code: "EST025", plot_name: "EST025", status: "active" },
  ],
  plotGroups: [],
  blocks: [
    { id: "b-a03", estate_id: "estate-1", zone_id: "zone-1", plot_id: "plot-12", block_code: "A03", block_name: "56-A03-R", planting_year: 2556, area_rai: 10, tree_count: 220, rspo_status: "RSPO", status: "active" },
    { id: "b-a02", estate_id: "estate-1", zone_id: "zone-1", plot_id: "plot-13", block_code: "A02", block_name: "56-A02", planting_year: 2556, area_rai: 11, tree_count: 230, rspo_status: "RSPO", status: "active" },
    { id: "b-a01", estate_id: "estate-1", zone_id: "zone-1", plot_id: "plot-25", block_code: "A01", block_name: "63-A01-R", planting_year: 2563, area_rai: 12, tree_count: 240, rspo_status: "RSPO", status: "active" },
  ],
  legacyAreas: [],
};

test("normalized Area hierarchy resolves Estate, Zone, Plot, and Block from foreign keys", () => {
  const model = areaHierarchyHarness().buildFarmAreaHierarchy(normalized);
  assert.equal(model.usesNormalizedBlocks, true);
  assert.deepEqual(Array.from(model.blocks, (block) => ({
    id: block.id,
    estate: block.estateName,
    zone: block.zoneName,
    plot: block.plotCode,
    block: block.blockName,
    year: block.plantingYear,
  })), [
    { id: "b-a03", estate: "สวนคีรีรัฐนิคม", zone: "ตอนล่าง", plot: "EST012", block: "56-A03-R", year: 2556 },
    { id: "b-a02", estate: "สวนคีรีรัฐนิคม", zone: "ตอนล่าง", plot: "EST013", block: "56-A02", year: 2556 },
    { id: "b-a01", estate: "สวนคีรีรัฐนิคม", zone: "ตอนล่าง", plot: "EST025", block: "63-A01-R", year: 2563 },
  ]);
});

test("complete Block foreign keys never fall into unknown hierarchy labels", () => {
  const block = areaHierarchyHarness().buildFarmAreaHierarchy(normalized).blocks[0];
  assert.notEqual(block.estateName, "ไม่ระบุพื้นที่");
  assert.notEqual(block.zoneName, "ไม่ระบุโซน");
  assert.notEqual(block.plotLabel, "ไม่ระบุ Plot / AP Code");
});

test("an empty plot_groups table does not manufacture an unknown group layer", () => {
  const model = areaHierarchyHarness().buildFarmAreaHierarchy(normalized);
  assert.equal(model.hasPlotGroups, false);
  assert.ok(model.blocks.every((block) => block.plotGroupId === "" && block.plotGroupName === ""));
});

test("missing map geometry does not remove normalized Blocks from Area Master", () => {
  const model = areaHierarchyHarness().buildFarmAreaHierarchy({
    ...normalized,
    blocks: normalized.blocks.map(({ map_boundary, ...block }) => block),
  });
  assert.deepEqual(Array.from(model.blocks, (block) => block.id), ["b-a03", "b-a02", "b-a01"]);
});

test("Area Master, Budget, and Planning use the same scoped Block resolver", () => {
  const budgetStart = appSource.indexOf("function farmBudgetScopedBlocks");
  const budgetEnd = appSource.indexOf("function farmBudgetBlockHierarchy", budgetStart);
  const planningStart = appSource.indexOf("function farmPlanningBlockRows");
  const planningEnd = appSource.indexOf("function farmSelectedPlanningBlocks", planningStart);
  const masterStart = appSource.indexOf("function farmAreaBlockRows");
  const masterEnd = appSource.indexOf("function farmMapProject", masterStart);
  const budgetOptionsStart = appSource.indexOf("function farmBudgetAreaOptions");
  const budgetOptionsEnd = appSource.indexOf("function renderFarmBudgetAreaDropdowns", budgetOptionsStart);
  assert.match(appSource.slice(budgetStart, budgetEnd), /farmAreaHierarchy\(\)\.blocks/);
  assert.match(appSource.slice(planningStart, planningEnd), /farmBudgetScopedBlocks\(\)/);
  assert.match(appSource.slice(masterStart, masterEnd), /farmBudgetScopedBlocks\(\)/);
  assert.match(appSource.slice(budgetOptionsStart, budgetOptionsEnd), /const hierarchy = farmAreaHierarchy\(\)/);
  assert.doesNotMatch(appSource.slice(budgetOptionsStart, budgetOptionsEnd), /farmLookup\("plots"|farmLookup\("zones"/);
});

test("Area Master batches normalized tables and keeps legacy areas optional", () => {
  const moduleStart = appSource.indexOf('id: "farm-area"');
  const moduleEnd = appSource.indexOf("fields:", moduleStart);
  const moduleSource = appSource.slice(moduleStart, moduleEnd);
  for (const tableName of ["estates", "zones", "plots", "plot_groups", "blocks", "areas"]) {
    assert.match(moduleSource, new RegExp(`"${tableName}"`));
  }
});

test("Refresh DB bypasses both browser and API caches", () => {
  assert.match(appSource, /refresh=\$\{force \? "1" : "0"\}/);
  assert.match(appSource, /data-farm-db-refresh[\s\S]+force:\s*true/);
});

test("Area Master separates Block inventory KPIs from map geometry", () => {
  const start = appSource.indexOf("function renderFarmAreaBoard");
  const end = appSource.indexOf("function farmActivityGroupLabel", start);
  const board = appSource.slice(start, end);
  assert.match(board, /Block ในสิทธิ์/);
  assert.match(board, /Block ที่มี Map Boundary/);
  assert.match(board, /ยังไม่มี Map Boundary/);
  assert.match(board, /const allAreas = hierarchy\.blocks/);
  assert.match(board, /Boolean\(area\.map_boundary\)/);
});
