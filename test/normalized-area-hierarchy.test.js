const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const blockSchemaSource = fs.readFileSync(path.join(root, "webapp", "farm-block-schema.js"), "utf8");

function areaHierarchyHarness() {
  const keyStart = appSource.indexOf("function farmBlockMapKey(");
  const keyEnd = appSource.indexOf("function farmBlockMapKeyVariants", keyStart);
  const hierarchyStart = appSource.indexOf("function farmAreaHierarchyComparableKeys");
  const hierarchyEnd = appSource.indexOf("function farmAreaHierarchy()", hierarchyStart);
  assert.ok(keyStart >= 0 && keyEnd > keyStart, "Block key normalizer must remain inspectable");
  assert.ok(hierarchyStart >= 0 && hierarchyEnd > hierarchyStart, "shared Area hierarchy must remain inspectable");
  const sandbox = {};
  vm.runInNewContext(`${appSource.slice(keyStart, keyEnd)}\n${appSource.slice(hierarchyStart, hierarchyEnd)}\nresult = {
    buildFarmAreaHierarchy, buildFarmLocationTree, farmLocationBlockLabel,
    assertFarmBlockIdConsistency, checkFarmBlockIdConsistency, farmZoneDisplayName,
  };`, sandbox);
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
    { id: "b-a03", estate_id: "estate-1", zone_id: "zone-1", plot_id: "plot-12", block_code: "A03", block_name: "56-A03-R", ap_code: "EST012", planting_year: 2556, area_rai: 10, tree_count: 220, rspo_status: "RSPO", status: "active" },
    { id: "b-a02", estate_id: "estate-1", zone_id: "zone-1", plot_id: "plot-13", block_code: "A02", block_name: "56-A02", ap_code: "EST013", planting_year: 2556, area_rai: 11, tree_count: 230, rspo_status: "RSPO", status: "active" },
    { id: "b-a01", estate_id: "estate-1", zone_id: "zone-1", plot_id: "plot-25", block_code: "A01", block_name: "63-A01-R", ap_code: "EST025", planting_year: 2563, area_rai: 12, tree_count: 240, rspo_status: "RSPO", status: "active" },
  ],
  legacyAreas: [],
};

test("normalized Area hierarchy resolves canonical Blocks and presentation-only location labels", () => {
  const model = areaHierarchyHarness().buildFarmAreaHierarchy(normalized);
  assert.equal(model.usesNormalizedBlocks, true);
  assert.deepEqual(Array.from(model.blocks, (block) => ({
    id: block.id,
    estate: block.estateDisplay,
    zone: block.zoneDisplay,
    group: block.blockGroupCode,
    block: block.blockName,
    apCode: block.apCode,
    year: block.plantingYear,
  })), [
    { id: "b-a03", estate: "Kirirat", zone: "Lower", group: "A", block: "56-A03-R", apCode: "EST012", year: 2556 },
    { id: "b-a02", estate: "Kirirat", zone: "Lower", group: "A", block: "56-A02", apCode: "EST013", year: 2556 },
    { id: "b-a01", estate: "Kirirat", zone: "Lower", group: "A", block: "63-A01-R", apCode: "EST025", year: 2563 },
  ]);
});

test("complete Block foreign keys never fall into unknown display labels", () => {
  const block = areaHierarchyHarness().buildFarmAreaHierarchy(normalized).blocks[0];
  assert.equal(block.estateDisplay, "Kirirat");
  assert.equal(block.zoneDisplay, "Lower");
  assert.equal(block.blockGroupCode, "A");
});

test("Block Group derives generically from Block names when plot_groups is empty", () => {
  const model = areaHierarchyHarness().buildFarmAreaHierarchy(normalized);
  assert.equal(model.hasPlotGroups, false);
  assert.ok(model.blocks.every((block) => block.blockGroupCode === "A"));
});

test("location tree has exactly Estate, Zone, Block Group, and block_name leaves", () => {
  const api = areaHierarchyHarness();
  const model = api.buildFarmAreaHierarchy(normalized);
  const tree = api.buildFarmLocationTree(model.blocks);
  assert.deepEqual(JSON.parse(JSON.stringify(tree.map((estate) => ({
    label: estate.label,
    zones: estate.zones.map((zone) => ({
      label: zone.label,
      groups: zone.groups.map((group) => ({
        label: group.label,
        leaves: group.blocks.map(api.farmLocationBlockLabel),
      })),
    })),
  })))), [{
    label: "Kirirat",
    zones: [{ label: "Lower", groups: [{ label: "A", leaves: ["56-A02", "56-A03-R", "63-A01-R"] }] }],
  }]);
  const hierarchyLabels = tree.flatMap((estate) => [
    estate.label,
    ...estate.zones.flatMap((zone) => [
      zone.label,
      ...zone.groups.flatMap((group) => [group.label, ...group.blocks.map(api.farmLocationBlockLabel)]),
    ]),
  ]);
  assert.doesNotMatch(hierarchyLabels.join(" → "), /EST012|EST013|EST025/);
});

test("legacy Area rows cannot replace canonical blocks.id rows", () => {
  const model = areaHierarchyHarness().buildFarmAreaHierarchy({
    ...normalized,
    blocks: [],
    legacyAreas: [{ id: "area-index-1", area_code: "56-A02", area_level: "block" }],
  });
  assert.deepEqual(Array.from(model.blocks), []);
});

test("missing map geometry does not remove normalized Blocks from Area Master", () => {
  const model = areaHierarchyHarness().buildFarmAreaHierarchy({
    ...normalized,
    blocks: normalized.blocks.map(({ map_boundary, ...block }) => block),
  });
  assert.deepEqual(Array.from(model.blocks, (block) => block.id), ["b-a03", "b-a02", "b-a01"]);
});

test("Area Master, Budget, and Planning share the global Area catalog", () => {
  const catalogStart = appSource.indexOf("function farmAreaCatalogBlocks");
  const catalogEnd = appSource.indexOf("function farmCanonicalAreaBlocks", catalogStart);
  const planningStart = appSource.indexOf("function farmPlanningBlockRows");
  const planningEnd = appSource.indexOf("function farmSelectedPlanningBlocks", planningStart);
  const masterStart = appSource.indexOf("function farmAreaBlockRows");
  const masterEnd = appSource.indexOf("function farmMapProject", masterStart);
  const budgetOptionsStart = appSource.indexOf("function farmBudgetAreaOptions");
  const budgetOptionsEnd = appSource.indexOf("function renderFarmBudgetAreaDropdowns", budgetOptionsStart);
  assert.match(appSource.slice(catalogStart, catalogEnd), /farmAreaCatalogHierarchy\(\)/);
  assert.match(appSource.slice(planningStart, planningEnd), /farmAreaCatalogBlocks\(\)/);
  assert.match(appSource.slice(masterStart, masterEnd), /farmCanonicalAreaBlocks\(\)/);
  assert.match(appSource.slice(budgetOptionsStart, budgetOptionsEnd), /const hierarchy = farmAreaCatalogHierarchy\(\)/);
  assert.doesNotMatch(appSource, /function farmVisibleAreaBlocks|function farmBudgetScopedBlocks/);
  assert.doesNotMatch(appSource.slice(budgetOptionsStart, budgetOptionsEnd), /farmLookup\("plots"|farmLookup\("zones"/);
});

test("Block consistency assertion compares IDs, not display labels", () => {
  const api = areaHierarchyHarness();
  assert.equal(api.assertFarmBlockIdConsistency({
    areaMaster: ["b-a03", "b-a02", "b-a01"],
    budget: ["b-a01", "b-a02", "b-a03"],
    planning: ["b-a03", "b-a02", "b-a01"],
  }), true);
  assert.throws(() => api.assertFarmBlockIdConsistency({
    areaMaster: ["b-a02"], budget: ["same-label-different-id"], planning: ["b-a02"],
  }), /canonical blocks\.id/);
});

test("Block consistency diagnostic reports mismatches without throwing", () => {
  const diagnostic = areaHierarchyHarness().checkFarmBlockIdConsistency({
    area: ["b-a01", "b-a02"],
    budget: ["b-a02"],
    planning: ["b-a01", "b-a03"],
  });
  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.areaCount, 2);
  assert.equal(diagnostic.budgetCount, 1);
  assert.equal(diagnostic.planningCount, 2);
  assert.deepEqual(Array.from(diagnostic.missingInArea), ["b-a03"]);
  assert.deepEqual(Array.from(diagnostic.missingInBudget), ["b-a01"]);
  assert.deepEqual(Array.from(diagnostic.missingInPlanning), ["b-a02"]);
});

test("NR1 and NR2 remain explicitly unassigned to a Zone", () => {
  const api = areaHierarchyHarness();
  const model = api.buildFarmAreaHierarchy({
    estates: normalized.estates,
    zones: normalized.zones,
    blocks: [
      { id: "nr-1", estate_id: "estate-1", block_code: "NR1", block_name: "SB170867", ap_code: "EST043", status: "active" },
      { id: "nr-2", estate_id: "estate-1", block_code: "NR2", block_name: "SB270766", ap_code: "EST044", status: "active" },
    ],
  });
  assert.deepEqual(Array.from(model.blocks, (block) => block.zoneDisplay), ["ยังไม่ระบุ Zone", "ยังไม่ระบุ Zone"]);
  assert.equal(api.farmZoneDisplayName(""), "ยังไม่ระบุ Zone");
});

test("AP Code remains internal metadata and is not a location hierarchy level", () => {
  const treeStart = appSource.indexOf("function renderFarmBudgetAreaTree");
  const treeEnd = appSource.indexOf("function farmBudgetAreaOptions", treeStart);
  const treeSource = appSource.slice(treeStart, treeEnd);
  assert.doesNotMatch(treeSource, /ap_code|apCode|plotLabel|plotName/);
  assert.match(appSource, /ap_code:\s*apCode/);
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
  assert.match(board, /ข้อมูล Block ในระบบ/);
  assert.match(blockSchemaSource, /Map Status/);
  assert.match(board, /Area \$\{fmt\(catalogCount\)\}/);
  assert.match(board, /const allAreas = hierarchy\.blocks/);
  assert.doesNotMatch(board, /map_boundary/);
});
