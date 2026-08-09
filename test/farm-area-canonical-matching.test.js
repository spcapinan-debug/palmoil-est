const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const mapArtifact = JSON.parse(fs.readFileSync(path.join(root, "webapp", "data", "block_map.json"), "utf8"));
const { actorCanAccessBlock } = require("../lib/server/farm-api");
const {
  FarmAreaMapConflictError,
  buildCanonicalBlockIndex,
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

test("a 3-block actor does not make other canonical polygons unmatched", () => {
  const scopedActor = { roles: new Set(["uat_supervisor"]), scopes: blocks.slice(0, 3).map((block) => ({ block_id: block.id })) };
  const result = reconcileFarmAreaMap({
    blocks,
    features: blocks.map((block, index) => polygon(block.block_name, undefined, index)),
    canAccessBlock: (block) => actorCanAccessBlock(scopedActor, block),
  });
  assert.equal(result.visibleBlocks.length, 3);
  assert.equal(result.reconciliation.matchedMaster, 4);
  assert.equal(result.reconciliation.mapWithoutMaster, 0);
  assert.equal(result.map.features[3].properties.match_status, "matched");
  assert.equal(result.map.features[3].properties.in_scope, false);
});

test("Area Master Block remains visible when geometry does not exist", () => {
  const result = reconcileFarmAreaMap({ blocks, features: blocks.slice(0, 3).map((block) => polygon(block.block_name)), canAccessBlock: () => true });
  assert.equal(result.visibleBlocks.length, 4);
  assert.equal(result.reconciliation.masterWithoutMap, 1);
  assert.equal(result.visibleBlocks.find((block) => block.id === "b-49-11").map_status, "master_without_map");
});

test("checked-in two-source map artifact is normalized before counting", () => {
  const result = dedupeFarmMapFeatures(mapArtifact.features);
  assert.equal(result.rawPlacemarkCount, 101);
  assert.equal(result.uniqueBlockKeyCount, 101);
  assert.equal(result.duplicatePlacemarkCount, 0);
  assert.equal(result.geometryConflicts.length, 0);
});

test("Area Master uses canonical endpoint while Budget and Planning remain operationally scoped", () => {
  const masterStart = appSource.indexOf("function farmAreaBlockRows");
  const masterEnd = appSource.indexOf("function farmMapProject", masterStart);
  const budgetStart = appSource.indexOf("function farmBudgetScopedBlocks");
  const budgetEnd = appSource.indexOf("function farmVisibleAreaBlocks", budgetStart);
  const planningStart = appSource.indexOf("function farmPlanningBlockRows");
  const planningEnd = appSource.indexOf("function farmSelectedPlanningBlocks", planningStart);
  assert.match(appSource.slice(masterStart, masterEnd), /farmCanonicalAreaBlocks\(\)/);
  assert.match(appSource.slice(budgetStart, budgetEnd), /farmVisibleAreaBlocks\(\)/);
  assert.match(appSource.slice(planningStart, planningEnd), /farmVisibleAreaBlocks\(\)/);
  assert.match(appSource, /FARM_AREA_MASTER_API/);
});

test("map renderer consumes server reconciliation and never rematches by block_code or AP Code", () => {
  const start = appSource.indexOf("function renderFarmAreaBlockMap");
  const end = appSource.indexOf("function farmAreaGroupDisplay", start);
  const renderer = appSource.slice(start, end);
  assert.match(renderer, /match_status/);
  assert.match(renderer, /outside-scope/);
  assert.doesNotMatch(renderer, /farmBlockMapKeyVariants|areaByCode|canonicalBlockByMapKey|normalizeFarmBlockName/);
});

test("Budget and Planning consistency assertion compares operational blocks.id", () => {
  const start = appSource.indexOf("function farmAssertVisibleBlockConsistency");
  const end = appSource.indexOf("function farmBudgetBlockHierarchy", start);
  const assertion = appSource.slice(start, end);
  assert.match(assertion, /visible:\s*farmVisibleAreaBlocks\(\)/);
  assert.match(assertion, /budget:\s*farmBudgetScopedBlocks\(\)/);
  assert.match(assertion, /planning:\s*farmPlanningBlockRows\(\)/);
});

test("Work Order creation persists the planned item's canonical block UUID", () => {
  const start = actionSource.indexOf("async function createWorkOrderFromPlanItem");
  const end = actionSource.indexOf("async function changeWorkOrderStatus", start);
  const createWorkOrder = actionSource.slice(start, end);
  assert.match(createWorkOrder, /block_id:\s*item\.block_id/);
  assert.doesNotMatch(createWorkOrder, /block_name/);
});

test("full-scope resolver supports every authorized Block without hardcoded counts", () => {
  const fullScopeActor = { roles: new Set(["planner"]), scopes: [{ scope_type: "global" }] };
  const result = reconcileFarmAreaMap({ blocks, features: [], canAccessBlock: (block) => actorCanAccessBlock(fullScopeActor, block) });
  assert.equal(result.visibleBlocks.length, blocks.length);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "lib", "server", "farm-area-map.js"), "utf8"), /===\s*103|slice\(0,\s*103\)/);
});
