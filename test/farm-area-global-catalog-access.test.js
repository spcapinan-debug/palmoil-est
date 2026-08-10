const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const tableSource = fs.readFileSync(path.join(root, "api", "farm-tables.js"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const mapSource = fs.readFileSync(path.join(root, "lib", "server", "farm-area-map.js"), "utf8");
const farmTables = require("../api/farm-tables");
const { actorCanAccessBlock } = require("../lib/server/farm-api");
const { farmAreaCatalogBlocks, reconcileFarmAreaMap } = require("../lib/server/farm-area-map");

const catalogRows = [
  { id: "a", block_name: "49-A10-R", status: "active", zone_id: "lower" },
  { id: "b", block_name: "56-A02", status: "active", zone_id: "lower" },
  { id: "c", block_name: "SB170867", status: "active", zone_id: null },
  { id: "inactive", block_name: "OLD", status: "inactive", zone_id: "lower" },
];

function actor({ roles = ["viewer"], permissions = [], scopes = [] } = {}) {
  return { roles: new Set(roles), permissions: new Set(permissions), scopes };
}

test("authenticated Manager and Supervisor receive the same active Area reference rows", () => {
  const manager = actor({ roles: ["uat_manager"], scopes: [{ estate_id: "estate-1" }] });
  const supervisor = actor({ roles: ["uat_supervisor"], scopes: [{ block_id: "a" }] });
  assert.equal(actorCanAccessBlock(supervisor, catalogRows[1]), false);
  const expected = ["a", "b", "c"];
  assert.deepEqual(farmTables._test.areaReferenceRows("blocks", catalogRows).map((row) => row.id), expected);
  assert.deepEqual(farmAreaCatalogBlocks(catalogRows).map((row) => row.id), expected);
  assert.deepEqual(farmAreaCatalogBlocks(catalogRows).map((row) => row.id), expected);
  assert.ok(manager.scopes.length && supervisor.scopes.length);
});

test("Area reference tables bypass assignment scope but still require the authenticated API handler", () => {
  for (const table of ["blocks", "estates", "zones", "plots", "plot_groups"]) {
    assert.equal(farmTables._test.AREA_REFERENCE_TABLES.has(table), true);
  }
  const referenceBranch = tableSource.slice(
    tableSource.indexOf("if (AREA_REFERENCE_TABLES.has(table))", tableSource.indexOf("async function handleGet")),
    tableSource.indexOf("if (!context)", tableSource.indexOf("async function handleGet")),
  );
  assert.match(referenceBranch, /areaReferenceRows\(table, read\.rows\)/);
  assert.doesNotMatch(referenceBranch, /actorCanAccessBlock|user_access_scopes/);
  assert.match(tableSource, /const actor = await authenticate\(req\)/);
});

test("Area, Budget, Planning, planting year, and location tree use farmAreaCatalogBlocks", () => {
  assert.match(appSource, /function farmAreaCatalogBlocks\(\)[\s\S]*?farmAreaCatalogHierarchy\(\)/);
  assert.match(appSource, /function farmPlanningBlockRows\(\)[\s\S]*?farmAreaCatalogBlocks\(\)/);
  assert.match(appSource, /function renderFarmBudgetAreaTree[\s\S]*?const blocks = farmAreaCatalogBlocks\(\)/);
  assert.match(appSource, /function renderFarmBudgetPlantingYearSelector[\s\S]*?const blocks = farmAreaCatalogBlocks\(\)/);
  assert.match(appSource, /function renderFarmWorkFilters\(\)[\s\S]*?farmAreaCatalogBlocks\(\)\.map/);
  assert.match(appSource, /function farmAssertAreaCatalogConsistency[\s\S]*?area:\s*farmAreaCatalogBlocks\(\)[\s\S]*?budget:\s*farmAreaCatalogBlocks\(\)/);
  assert.doesNotMatch(appSource, /function farmVisibleAreaBlocks|function farmBudgetScopedBlocks/);
});

test("Budget mutation is permission-based and not Block-scope based", () => {
  const viewer = actor({ permissions: [] });
  const manager = actor({ permissions: ["budget.rate_rule.manage"] });
  assert.throws(() => farmTables._test.writePermission(viewer, "budget_rate_blocks"), (error) => error.code === "FORBIDDEN");
  assert.doesNotThrow(() => farmTables._test.writePermission(manager, "budget_rate_blocks"));
  assert.equal(farmTables._test.WRITE_PERMISSIONS.budget_rate_blocks, "budget.rate_rule.manage");
  const validator = tableSource.slice(
    tableSource.indexOf("async function validateBudgetRateBlockRows"),
    tableSource.indexOf("function safeTableError"),
  );
  assert.doesNotMatch(validator, /actorCanAccessBlock|SCOPE_FORBIDDEN|assigned scope/);
});

test("Planning mutation requires permissions while Area selection ignores Block scope", () => {
  const viewer = actor({ permissions: ["farm.plan.view"] });
  const planner = actor({ permissions: ["farm.plan.create"] });
  assert.throws(() => farmTables._test.writePermission(viewer, "planned_work_items"), (error) => error.code === "FORBIDDEN");
  assert.doesNotThrow(() => farmTables._test.writePermission(planner, "planned_work_items"));
  assert.match(appSource, /function farmCanCreatePlanning\(\)[\s\S]*?farm\.plan\.create[\s\S]*?farm\.work_order\.create/);
  assert.match(appSource, /data-farm-create-work-plan \$\{state\.farmSyncBusy \|\| !farmCanCreatePlanning\(\)/);
});

test("Work Order creation uses action permission and active Block validation, not assignment scope", () => {
  const start = actionSource.indexOf("async function createWorkOrderFromPlanItem");
  const end = actionSource.indexOf("async function validateWorkOrderStart", start);
  const create = actionSource.slice(start, end);
  assert.match(actionSource, /create_work_order_from_plan_item:[\s\S]*?permission:\s*"farm\.work_order\.create"/);
  assert.match(create, /blocks\?id=eq\.\$\{requireUuid\(item\.block_id/);
  assert.doesNotMatch(create, /authorizeWorkOrderScope/);
});

test("Dispatch and Daily operational paths may remain assignment-scoped", () => {
  assert.match(actionSource, /async function authorizeWorkOrderScope[\s\S]*?user_access_scopes/);
  assert.match(actionSource, /async function changeWorkOrderStatus[\s\S]*?authorizeWorkOrderScope\(actor, order\)/);
  assert.match(tableSource, /async function uatReadContext[\s\S]*?actorCanAccessBlock\(actor, block\)/);
});

test("KMZ remains canonical block_name based and exposes matched UUIDs without my-scope flags", () => {
  const feature = {
    type: "Feature",
    properties: { name: "49-A10-R" },
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  };
  const result = reconcileFarmAreaMap({ blocks: catalogRows, features: [feature] });
  assert.equal(result.map.features[0].properties.block_id, "a");
  assert.equal("in_scope" in result.map.features[0].properties, false);
  assert.match(mapSource, /normalizeFarmBlockName\(block\?\.block_name\)/);
  assert.doesNotMatch(mapSource, /block_code.*canonicalBlockByMapKey|ap_code.*canonicalBlockByMapKey/);
});

test("active Blocks without polygons and unknown-zone Blocks remain reference-visible", () => {
  const result = reconcileFarmAreaMap({ blocks: catalogRows, features: [] });
  assert.deepEqual(result.catalogBlocks.map((row) => row.id), ["a", "b", "c"]);
  assert.ok(result.catalogBlocks.every((row) => row.map_status === "master_without_map"));
  assert.equal(result.catalogBlocks.find((row) => row.id === "c").zone_id, null);
  assert.doesNotMatch(`${appSource}\n${mapSource}`, /===\s*103|slice\(0,\s*103\)/);
});
