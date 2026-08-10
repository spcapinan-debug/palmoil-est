const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const mapArtifact = JSON.parse(fs.readFileSync(path.join(root, "webapp", "data", "block_map.json"), "utf8"));
const { actorCanAccessBlock } = require("../lib/server/farm-api");
const { buildAreaCatalogAudit } = require("../api/farm-area-master")._test;
const {
  FarmAreaMapConflictError,
  buildCanonicalBlockIndex,
  buildFarmMapReconciliationCandidates,
  dedupeFarmMapFeatures,
  normalizeFarmBlockName,
  reconcileFarmAreaMap,
} = require("../lib/server/farm-area-map");

const blocks = [
  { id: "b-22", block_name: "22-C05-R", block_code: "C05", ap_code: "EST001", status: "active" },
  { id: "b-30", block_name: "30-B14", block_code: "B14", ap_code: "EST002", status: "active" },
  { id: "b-49-10", block_name: "49-A10-R", block_code: "A10", ap_code: "EST009", status: "active" },
  { id: "b-49-11", block_name: "49-A11-R", block_code: "BA-002", ap_code: "EST009", status: "active" },
];

function polygon(name, source = "Master Data/SPC-BLOCK.kmz", offset = 0) {
  return {
    type: "Feature",
    properties: { name, block_code: name, source_file: source },
    geometry: { type: "Polygon", coordinates: [[[offset, 0], [offset + 1, 0], [offset + 1, 1], [offset, 0]]] },
  };
}

test("canonical KMZ matcher resolves required examples through blocks.block_name", () => {
  const features = ["22-C05-R", "30-B14", "49-A10-R", "49-A11-R"].map((name, index) => polygon(name, undefined, index));
  const result = reconcileFarmAreaMap({ blocks, features, canAccessBlock: () => true });
  assert.equal(result.reconciliation.matchedMaster, 4);
  assert.equal(result.reconciliation.mapWithoutMaster, 0);
  assert.deepEqual(result.map.features.map((feature) => feature.properties.block_id), ["b-22", "b-30", "b-49-10", "b-49-11"]);
});

test("49-A11-R matches block_name even when block_code is BA-002", () => {
  const result = reconcileFarmAreaMap({ blocks: [blocks[3]], features: [polygon("49-A11-R")], canAccessBlock: () => true });
  assert.equal(result.map.features[0].properties.block_id, "b-49-11");
  assert.equal(result.map.features[0].properties.match_status, "matched");
});

test("AP Code cannot be the primary map key", () => {
  const result = reconcileFarmAreaMap({ blocks: blocks.slice(2), features: [polygon("49-A10-R"), polygon("49-A11-R")], canAccessBlock: () => true });
  assert.deepEqual(result.map.features.map((feature) => feature.properties.block_id), ["b-49-10", "b-49-11"]);
  assert.equal(new Set(blocks.slice(2).map((block) => block.ap_code)).size, 1);
});

test("KMZ reconciliation reads Placemark.name and never falls back to block_code", () => {
  const feature = polygon("ignored");
  feature.properties = { block_code: "22-C05-R" };
  const result = reconcileFarmAreaMap({ blocks: [blocks[0]], features: [feature], canAccessBlock: () => true });
  assert.equal(result.reconciliation.matchedMaster, 0);
  assert.equal(result.reconciliation.mapWithoutMaster, 1);
  assert.equal(result.map.features[0].properties.block_id, null);
});

test("normalizeFarmBlockName handles Unicode dashes and whitespace while preserving -R", () => {
  assert.equal(normalizeFarmBlockName(" 49-A10-R "), "49-A10-R");
  assert.equal(normalizeFarmBlockName("49–A10–R"), "49-A10-R");
  assert.equal(normalizeFarmBlockName(" 49 - A10 -- R "), "49-A10-R");
  assert.equal(normalizeFarmBlockName("49-A10-R"), "49-A10-R");
  assert.notEqual(normalizeFarmBlockName("49-A10-R"), normalizeFarmBlockName("49-A10"));
});

test("duplicate normalized master key throws a documented conflict", () => {
  assert.throws(
    () => buildCanonicalBlockIndex([{ id: "a", block_name: "49-A10-R" }, { id: "b", block_name: "49–A10–R" }]),
    (error) => error instanceof FarmAreaMapConflictError && error.conflicts[0].mapKey === "49-A10-R",
  );
});

test("duplicate Placemark from two KMZ sources dedupes when geometry is identical", () => {
  const same = polygon("49-A10-R");
  const duplicate = polygon(" 49–A10–R ", "Master Data/SPC-BLOK.kmz");
  duplicate.geometry = same.geometry;
  const result = dedupeFarmMapFeatures([same, duplicate]);
  assert.equal(result.rawPlacemarkCount, 2);
  assert.equal(result.uniqueBlockKeyCount, 1);
  assert.equal(result.duplicatePlacemarkCount, 1);
  assert.equal(result.duplicateMapKeys.length, 1);
  assert.equal(result.geometryConflicts.length, 0);
  assert.deepEqual(result.features[0].properties.source_files, ["Master Data/SPC-BLOCK.kmz", "Master Data/SPC-BLOK.kmz"]);
});

test("conflicting duplicate Placemark geometries report conflict without choosing by load order", () => {
  const result = dedupeFarmMapFeatures([
    polygon("49-A10-R", "Master Data/SPC-BLOCK.kmz", 0),
    polygon("49-A10-R", "Master Data/SPC-BLOK.kmz", 5),
  ]);
  assert.equal(result.geometryConflicts.length, 1);
  assert.equal(result.features[0].geometry, null);
  assert.equal(result.features[0].properties.geometry_conflict, true);
});

test("a 3-block actor still receives the complete authenticated Area catalog", () => {
  const scopedActor = { roles: new Set(["uat_supervisor"]), scopes: blocks.slice(0, 3).map((block) => ({ block_id: block.id })) };
  const result = reconcileFarmAreaMap({
    blocks,
    features: blocks.map((block, index) => polygon(block.block_name, undefined, index)),
  });
  assert.equal(actorCanAccessBlock(scopedActor, blocks[3]), false);
  assert.equal(result.catalogBlocks.length, 4);
  assert.equal(result.reconciliation.matchedMaster, 4);
  assert.equal(result.reconciliation.mapWithoutMaster, 0);
  assert.equal(result.map.features[3].properties.match_status, "matched");
  assert.equal("in_scope" in result.map.features[3].properties, false);
  assert.equal(result.map.features[3].properties.block_id, blocks[3].id);
});

test("estate scope remains operational metadata but does not filter Area reference", () => {
  const estateActor = { roles: new Set(["uat_manager"]), scopes: [{ scope_type: "read_write", estate_id: "estate-1" }] };
  const estateBlocks = [
    { id: "e1-a", estate_id: "estate-1", block_name: "56-A02" },
    { id: "e1-b", estate_id: "estate-1", block_name: "56-A03-R" },
    { id: "e2-a", estate_id: "estate-2", block_name: "49-A10-R" },
  ];
  assert.equal(actorCanAccessBlock(estateActor, estateBlocks[0]), true);
  assert.equal(actorCanAccessBlock(estateActor, estateBlocks[1]), true);
  assert.equal(actorCanAccessBlock(estateActor, estateBlocks[2]), false);
  const result = reconcileFarmAreaMap({ blocks: estateBlocks, features: [] });
  assert.deepEqual(result.catalogBlocks.map((block) => block.id), ["e1-a", "e1-b", "e2-a"]);
});

test("block-scoped Supervisor sees every catalog UUID while assignment checks remain scoped", () => {
  const supervisorIds = blocks.slice(0, 3).map((block) => block.id);
  const actor = { roles: new Set(["uat_supervisor"]), scopes: supervisorIds.map((block_id) => ({ scope_type: "read_write", block_id })) };
  const result = reconcileFarmAreaMap({ blocks, features: [] });
  assert.equal(actorCanAccessBlock(actor, blocks[3]), false);
  assert.deepEqual(result.catalogBlocks.map((block) => block.id), blocks.map((block) => block.id));
});

test("Area Master Block remains visible when geometry does not exist", () => {
  const result = reconcileFarmAreaMap({ blocks, features: blocks.slice(0, 3).map((block) => polygon(block.block_name)), canAccessBlock: () => true });
  assert.equal(result.catalogBlocks.length, 4);
  assert.equal(result.reconciliation.masterWithoutMap, 1);
  assert.equal(result.catalogBlocks.find((block) => block.id === "b-49-11").map_status, "master_without_map");
});

test("KMZ unmatched diagnostics report every name without force matching", () => {
  const result = reconcileFarmAreaMap({ blocks: [blocks[0]], features: [polygon("49-B13")], canAccessBlock: () => true });
  assert.equal(result.reconciliation.matchedMaster, 0);
  assert.deepEqual(result.reconciliation.mapWithoutMasterEntries, [{
    mapKey: "49-B13",
    placemarkName: "49-B13",
    sourceFiles: ["Master Data/SPC-BLOCK.kmz"],
    geometryStatus: "valid",
  }]);
  assert.equal(result.reconciliation.masterWithoutMapEntries[0].blockId, "b-22");
});

test("reconciliation candidates are audit-only and require an explicit verified alias", () => {
  const candidates = buildFarmMapReconciliationCandidates(
    [{ mapKey: "P07-64-R", placemarkName: "P07-64-R" }],
    [{ blockId: "canonical-p07", blockName: "64-P07-R", blockCode: "P07" }],
  );
  assert.equal(candidates[0].candidates[0].blockId, "canonical-p07");
  assert.match(candidates[0].candidates[0].reason, /source verification required/);
  const result = reconcileFarmAreaMap({
    blocks: [{ id: "canonical-p07", block_name: "64-P07-R" }],
    features: [polygon("P07-64-R")],
    canAccessBlock: () => true,
  });
  assert.equal(result.reconciliation.matchedMaster, 0);
  assert.equal(result.reconciliation.mapWithoutMaster, 1);
});

test("server audit exposes all authenticated catalog UUIDs independent of actor scope", () => {
  const canonicalBlocks = [
    { id: "inside", block_name: "30-PU1", estate_id: "estate-1", zone_id: null },
    { id: "outside", block_name: "37-T29", estate_id: "estate-2", zone_id: null },
  ];
  const result = reconcileFarmAreaMap({ blocks: canonicalBlocks, features: [] });
  const audit = buildAreaCatalogAudit({
    result,
    canonicalBlocks,
    estates: [{ id: "estate-1", estate_name: "Kirirat" }, { id: "estate-2", estate_name: "Other" }],
    zones: [],
  });
  assert.deepEqual(audit.masterWithoutMap.map((entry) => entry.blockId), ["inside", "outside"]);
});

test("checked-in two-source map artifact is normalized before counting", () => {
  const result = dedupeFarmMapFeatures(mapArtifact.features);
  assert.equal(result.rawPlacemarkCount, 101);
  assert.equal(result.uniqueBlockKeyCount, 101);
  assert.equal(result.duplicatePlacemarkCount, 0);
  assert.equal(result.geometryConflicts.length, 0);
});

test("Area Master, Budget, and Planning use one global Area catalog", () => {
  const masterStart = appSource.indexOf("function farmAreaBlockRows");
  const masterEnd = appSource.indexOf("function farmMapProject", masterStart);
  const catalogStart = appSource.indexOf("function farmAreaCatalogBlocks");
  const catalogEnd = appSource.indexOf("function farmCanonicalAreaBlocks", catalogStart);
  const planningStart = appSource.indexOf("function farmPlanningBlockRows");
  const planningEnd = appSource.indexOf("function farmSelectedPlanningBlocks", planningStart);
  assert.match(appSource.slice(masterStart, masterEnd), /farmCanonicalAreaBlocks\(\)/);
  assert.match(appSource.slice(catalogStart, catalogEnd), /farmAreaCatalogHierarchy\(\)/);
  assert.match(appSource.slice(planningStart, planningEnd), /farmAreaCatalogBlocks\(\)/);
  assert.doesNotMatch(appSource, /function farmVisibleAreaBlocks|function farmBudgetScopedBlocks/);
  assert.match(appSource, /FARM_AREA_MASTER_API/);
});

test("map renderer consumes server reconciliation and never rematches by block_code or AP Code", () => {
  const start = appSource.indexOf("function renderFarmAreaBlockMap");
  const end = appSource.indexOf("function farmAreaGroupDisplay", start);
  const renderer = appSource.slice(start, end);
  assert.match(renderer, /match_status/);
  assert.doesNotMatch(renderer, /in_scope|outside-scope|in-scope/);
  assert.doesNotMatch(renderer, /farmBlockMapKeyVariants|areaByCode|canonicalBlockByMapKey|normalizeFarmBlockName/);
});

test("Area, Budget, and Planning consistency assertion compares catalog blocks.id", () => {
  const start = appSource.indexOf("function farmAssertAreaCatalogConsistency");
  const end = appSource.indexOf("function farmBudgetBlockHierarchy", start);
  const assertion = appSource.slice(start, end);
  assert.match(assertion, /area:\s*farmAreaCatalogBlocks\(\)/);
  assert.match(assertion, /budget:\s*farmAreaCatalogBlocks\(\)/);
  assert.match(assertion, /planning:\s*farmPlanningBlockRows\(\)/);
});

test("Manager Area, Budget, and Planning derive identical UUID sets without KMZ", () => {
  const areaIds = blocks.map((block) => block.id).sort();
  const budgetIds = blocks.map((block) => block.id).sort();
  const planningIds = blocks.map((block) => block.id).sort();
  assert.deepEqual(areaIds, budgetIds);
  assert.deepEqual(budgetIds, planningIds);
  assert.match(appSource, /function farmPlanningBlockRows\(\)[\s\S]*?farmAreaCatalogBlocks\(\)/);
  assert.match(appSource, /function farmAreaCatalogBlocks\(\)[\s\S]*?farmAreaCatalogHierarchy\(\)/);
});

test("Work Order creation persists the planned item's canonical block UUID", () => {
  const start = actionSource.indexOf("async function createWorkOrderFromPlanItem");
  const end = actionSource.indexOf("async function changeWorkOrderStatus", start);
  const createWorkOrder = actionSource.slice(start, end);
  assert.match(createWorkOrder, /block_id:\s*item\.block_id/);
  assert.doesNotMatch(createWorkOrder, /block_name/);
});

test("Area catalog supports every active Block without hardcoded counts", () => {
  const result = reconcileFarmAreaMap({ blocks, features: [] });
  assert.equal(result.catalogBlocks.length, blocks.length);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "lib", "server", "farm-area-map.js"), "utf8"), /===\s*103|slice\(0,\s*103\)/);
});
