const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const masterSource = fs.readFileSync(path.join(root, "api", "farm-area-master.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260810074358_area_master_manage_permission.sql"), "utf8");
const { authorize } = require("../lib/server/farm-api");
const {
  BLOCK_RSPO_OPTIONS,
  BLOCK_STATUS_OPTIONS,
  FARM_BLOCK_FIELD_SCHEMA,
  estateDisplayName,
  farmBlockGroup,
  rspoLabel,
  statusLabel,
  validateBlockChanges,
  zoneDisplayName,
} = require("../webapp/farm-block-schema");

test("one shared Block schema drives read, edit, API validation, and derived fields", () => {
  const requiredKeys = ["dbField", "label", "type", "value", "displayFormatter", "optionsSource", "validation", "editable"];
  for (const field of FARM_BLOCK_FIELD_SCHEMA) {
    for (const key of requiredKeys) assert.ok(Object.hasOwn(field, key), `${field.label} is missing ${key}`);
  }
  assert.match(appSource, /FARM_BLOCK_FIELD_SCHEMA\.filter\(\(field\) => field\.table\)/);
  assert.match(appSource, /farmAreaBlockEditFields\(\)\.map\(\(field\) => farmAreaBlockInput/);
  assert.match(actionSource, /require\("\.\.\/webapp\/farm-block-schema"\)/);
  assert.equal(FARM_BLOCK_FIELD_SCHEMA.find((field) => field.value === "blockGroupCode").editable, false);
  assert.equal(FARM_BLOCK_FIELD_SCHEMA.find((field) => field.value === "map_status").editable, false);
  assert.equal(FARM_BLOCK_FIELD_SCHEMA.find((field) => field.value === "map_version").editable, false);
  assert.equal(FARM_BLOCK_FIELD_SCHEMA.find((field) => field.dbField === "productive_status").editable, false);
});

test("every editable Block field validates and round-trips its canonical stored value", () => {
  const sample = {
    block_name: "56-A02", block_code: "A02", plot_id: "2ad23a90-5651-4841-a3d8-89b60ebea746",
    estate_id: "f5757d58-1098-4fb8-b620-cb6c52280854", zone_id: "382e710f-3076-4452-a0c6-0ab08b4bf6dc",
    planting_year: "2556", area_rai: "153", tree_count: "3835", rspo_status: "Non-RSPO",
    palm_variety: "D x P", terrain_type: "flat", hcv_status: false, status: "active",
    note: "canonical", gps_lat: "8.5", gps_lng: "100.2",
  };
  const result = validateBlockChanges(sample);
  assert.deepEqual(result.errors, []);
  for (const field of FARM_BLOCK_FIELD_SCHEMA.filter((item) => item.editable && item.dbField)) {
    assert.ok(Object.hasOwn(result.changes, field.dbField), `${field.dbField} did not survive save validation`);
  }
  assert.equal(result.changes.planting_year, 2556);
  assert.equal(result.changes.area_rai, 153);
  assert.equal(result.changes.tree_count, 3835);
  assert.equal(result.changes.gps_lat, 8.5);
  assert.equal(result.changes.gps_lng, 100.2);
  assert.equal(result.changes.hcv_status, false);
});

test("Block status and RSPO use exact database values for display, edit, and save", () => {
  assert.deepEqual(BLOCK_STATUS_OPTIONS, [{ value: "active", label: "ใช้งาน" }]);
  assert.equal(statusLabel("active"), "ใช้งาน");
  assert.deepEqual(BLOCK_RSPO_OPTIONS.map((option) => option.value), ["RSPO", "Non-RSPO"]);
  assert.equal(rspoLabel("RSPO"), "RSPO");
  assert.equal(rspoLabel("Non-RSPO"), "Non-RSPO");
  assert.equal(validateBlockChanges({ status: "active", rspo_status: "Non-RSPO" }).changes.status, "active");
  assert.equal(validateBlockChanges({ status: "active", rspo_status: "Non-RSPO" }).changes.rspo_status, "Non-RSPO");
});

test("Estate, Zone, and Plot/AP Code preserve canonical UUID dependencies", () => {
  assert.equal(estateDisplayName("สวนคีรีรัฐนิคม"), "Kirirat");
  assert.equal(zoneDisplayName("ตอนล่าง"), "Lower");
  assert.equal(farmBlockGroup({ block_name: "68-PU6" }), "PU");
  assert.equal(farmBlockGroup({ block_name: "SB170867" }), "SB");
  assert.match(masterSource, /referenceData:\s*\{ estates, zones, plots \}/);
  assert.match(appSource, /row\.estate_id === draft\.estate_id/);
  assert.match(appSource, /\(row\.zone_id \|\| null\) === \(draft\.zone_id \|\| null\)/);
  assert.match(actionSource, /ZONE_ESTATE_MISMATCH/);
  assert.match(actionSource, /PLOT_SCOPE_MISMATCH/);
  assert.match(actionSource, /changes\.ap_code = plot\.plot_code/);
});

test("Area rows open an accessible responsive drawer and synchronize with map polygons", () => {
  assert.match(appSource, /data-farm-area-block-row="\$\{esc\(area\.id\)\}" tabindex="0" role="button"/);
  assert.match(appSource, /openFarmAreaBlockDrawer\(areaBlock\.dataset\.farmAreaBlockRow\)/);
  assert.match(appSource, /e\.key === "Enter" && areaRow/);
  assert.match(appSource, /data-farm-area-map-block="\$\{esc\(area\.id\)\}"/);
  assert.match(appSource, /\(e\.key === "Enter" \|\| e\.key === " "\) && areaMapBlock/);
  assert.match(appSource, /scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
  assert.match(stylesSource, /\.farm-area-block-drawer/);
  assert.match(stylesSource, /@media \(max-width: 720px\)[\s\S]*\.farm-area-block-drawer[\s\S]*inset:\s*0/);
});

test("updateAreaBlock is permissioned, audited, validated, and concurrency-safe", () => {
  assert.match(actionSource, /updateAreaBlock:\s*\{[\s\S]*permission:\s*"farm\.area\.manage"/);
  assert.match(actionSource, /changed_fields/);
  assert.match(actionSource, /blocks\?id=eq\.\$\{blockId\}&updated_at=eq\.\$\{encodeURIComponent\(current\.updated_at\)\}/);
  assert.match(actionSource, /409,\s*"BLOCK_VERSION_CONFLICT"/);
  assert.match(migration, /'farm\.area\.manage'/);
  const viewer = { roles: new Set(["uat_supervisor"]), permissions: new Set(["farm.dashboard.view"]) };
  assert.throws(() => authorize(viewer, { permissions: ["farm.area.manage"] }), (error) => error.status === 403 && error.code === "FORBIDDEN");
  assert.doesNotThrow(() => authorize({ roles: new Set(["uat_manager"]), permissions: new Set(["farm.area.manage"]) }, { permissions: ["farm.area.manage"] }));
});

test("successful Block save refreshes the shared canonical Area dataset without changing blocks.id", () => {
  assert.match(appSource, /runFarmAction\("updateAreaBlock",\s*\{[\s\S]*blockId:\s*draft\.id/);
  assert.match(appSource, /await loadFarmAreaMasterData\(\{ force: true \}\)/);
  assert.match(masterSource, /catalogBlocks/);
  assert.doesNotMatch(actionSource.slice(actionSource.indexOf("async function updateAreaBlock"), actionSource.indexOf("async function one", actionSource.indexOf("async function updateAreaBlock"))), /method:\s*"POST"|randomUUID/);
});
