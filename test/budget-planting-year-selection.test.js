const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const farmTables = require("../api/farm-tables");

function plantingHarness() {
  const start = appSource.indexOf("function farmBudgetNormalizePlantingYear");
  const end = appSource.indexOf("function farmBudgetTeamMemberEmployeeValues", start);
  assert.ok(start >= 0 && end > start, "planting-year helpers must remain executable as a unit");
  const sandbox = {};
  vm.runInNewContext(`${appSource.slice(start, end)}\nresult = {
    farmBudgetNormalizePlantingYear, farmBudgetPlantingYearFromBlock, farmBudgetUniqueBlockRows,
    farmBudgetSelectionState, farmBudgetToggleBlockIds, farmBudgetPlantingYearGroups,
    farmBudgetFilterPlantingBlocks, farmBudgetPlantingSelectionSummary,
  };`, sandbox);
  return sandbox.result;
}

const blocks = [
  { id: "b1", block_code: "LOW-B1", block_name: "Lower 1", zone_name: "Lower", planting_year: 2559, area_rai: 10, status: "active" },
  { id: "b2", block_code: "LOW-B2", block_name: "Lower 2", zone_name: "Lower", planted_year: 2559, area_rai: 12.5, status: "active" },
  { id: "b3", block_code: "UP-B3", block_name: "Upper 3", zone_name: "Upper", planting_date: "2017-06-01", area_rai: 7.25, status: "active" },
  { id: "b4", block_code: "PU-61-B4", block_name: "PU 4", zone_name: "PU", area_rai: 4, status: "active" },
];

test("planting years come from Block Master fields, stay unique, and report code fallback", () => {
  const api = plantingHarness();
  const model = api.farmBudgetPlantingYearGroups([...blocks, { ...blocks[0] }], [], "asc");
  assert.deepEqual(Array.from(model.years, (row) => row.year), [2559, 2560, 2561]);
  assert.deepEqual(Array.from(model.years, (row) => row.totalCount), [2, 1, 1]);
  assert.equal(model.fallbackCount, 1);
});

test("planting years sort oldest-first by default and newest-first on request", () => {
  const api = plantingHarness();
  assert.deepEqual(Array.from(api.farmBudgetPlantingYearGroups(blocks, [], "asc").years, (row) => row.year), [2559, 2560, 2561]);
  assert.deepEqual(Array.from(api.farmBudgetPlantingYearGroups(blocks, [], "desc").years, (row) => row.year), [2561, 2560, 2559]);
});

test("selecting one planting year selects every Block in that year", () => {
  const api = plantingHarness();
  const year = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years[0];
  const selected = api.farmBudgetToggleBlockIds([], year.blockIds, true);
  assert.deepEqual(Array.from(selected).sort(), ["b1", "b2"]);
  assert.equal(api.farmBudgetSelectionState(year.blockIds, selected).checked, true);
});

test("selecting two years keeps selected Block IDs unique", () => {
  const api = plantingHarness();
  const groups = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years;
  let selected = api.farmBudgetToggleBlockIds([], groups[0].blockIds, true);
  selected = api.farmBudgetToggleBlockIds(selected, [...groups[0].blockIds, ...groups[1].blockIds], true);
  assert.equal(selected.length, new Set(selected).size);
  assert.deepEqual(Array.from(selected).sort(), ["b1", "b2", "b3"]);
});

test("clearing one year does not affect another selected year", () => {
  const api = plantingHarness();
  const groups = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years;
  let selected = api.farmBudgetToggleBlockIds([], [...groups[0].blockIds, ...groups[1].blockIds], true);
  selected = api.farmBudgetToggleBlockIds(selected, groups[0].blockIds, false);
  assert.deepEqual(Array.from(selected), ["b3"]);
});

test("removing one Block makes its planting year indeterminate with mixed aria state", () => {
  const api = plantingHarness();
  const state = api.farmBudgetSelectionState(["b1", "b2"], ["b1"]);
  assert.equal(state.checked, false);
  assert.equal(state.indeterminate, true);
  assert.equal(state.ariaChecked, "mixed");
});

test("selecting the final missing Block restores a checked planting year", () => {
  const api = plantingHarness();
  const selected = api.farmBudgetToggleBlockIds(["b1"], ["b2"], true);
  assert.equal(api.farmBudgetSelectionState(["b1", "b2"], selected).checked, true);
});

test("editing an existing selection derives full and partial year states without adding Blocks", () => {
  const api = plantingHarness();
  const model = api.farmBudgetPlantingYearGroups(blocks, ["b1", "b3"], "asc");
  assert.equal(model.years.find((row) => row.year === 2559).indeterminate, true);
  assert.equal(model.years.find((row) => row.year === 2560).checked, true);
  assert.deepEqual(Array.from(model.years.flatMap((row) => row.blockIds).filter((id) => ["b1", "b3"].includes(id))).sort(), ["b1", "b3"]);
});

test("scoped Block input controls the count per planting year", () => {
  const api = plantingHarness();
  const scoped = blocks.filter((block) => ["b1", "b3"].includes(block.id));
  const model = api.farmBudgetPlantingYearGroups(scoped, [], "asc");
  assert.deepEqual(Array.from(model.years, (row) => [row.year, row.totalCount]), [[2559, 1], [2560, 1]]);
});

test("select all years selects every scoped Block and clearing it removes them all", () => {
  const api = plantingHarness();
  const allIds = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years.flatMap((row) => row.blockIds);
  const selected = api.farmBudgetToggleBlockIds([], allIds, true);
  assert.deepEqual(Array.from(selected).sort(), ["b1", "b2", "b3", "b4"]);
  assert.equal(api.farmBudgetSelectionState(allIds, selected).checked, true);
  assert.deepEqual(Array.from(api.farmBudgetToggleBlockIds(selected, allIds, false)), []);
});

test("area-group and planting-year checkboxes share the same checked/mixed state contract", () => {
  const api = plantingHarness();
  const groupState = api.farmBudgetSelectionState(["b1", "b2"], ["b1"]);
  const yearState = api.farmBudgetPlantingYearGroups(blocks, ["b1"], "asc").years.find((row) => row.year === 2559);
  assert.equal(groupState.ariaChecked, yearState.ariaChecked);
  assert.equal(groupState.indeterminate, yearState.indeterminate);
});

test("selection summary deduplicates Blocks, years, and area", () => {
  const api = plantingHarness();
  const summary = api.farmBudgetPlantingSelectionSummary([...blocks, { ...blocks[0] }], ["b1", "b1", "b2", "b3"]);
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    yearCount: 2, blockCount: 3, area: 29.75, areaUnit: "ไร่", selectedYears: [2559, 2560],
  });
});

test("server rejects a selected Block outside the actor scope", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const allowedId = "10000000-0000-4000-8000-000000000001";
  const forbiddenId = "10000000-0000-4000-8000-000000000002";
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    global.fetch = async () => new Response(JSON.stringify([{
      id: forbiddenId, block_code: "UP-60-B2", status: "active", planting_year: 2560,
      estate_id: "estate-2", zone_id: "zone-2", plot_id: "plot-2",
    }]), { status: 200 });
    const actor = { roles: new Set(["planner"]), scopes: [{ block_id: allowedId }] };
    await assert.rejects(
      farmTables._test.validateBudgetRateBlockRows(actor, [{ block_id: forbiddenId }], [2560], [forbiddenId]),
      (error) => error.code === "SCOPE_FORBIDDEN",
    );
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("server detects duplicate Block IDs", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const actor = { roles: new Set(["super_admin"]), scopes: [] };
  await assert.rejects(
    farmTables._test.validateBudgetRateBlockRows(actor, [{ block_id: id }, { block_id: id }], [2559], [id, id]),
    (error) => error.code === "DUPLICATE_BLOCK_ID",
  );
});

test("server verifies planting years against the database Block", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const id = "10000000-0000-4000-8000-000000000001";
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    global.fetch = async () => new Response(JSON.stringify([{
      id, block_code: "LOW-B1", status: "active", planting_year: 2559,
    }]), { status: 200 });
    const actor = { roles: new Set(["super_admin"]), scopes: [] };
    await assert.rejects(
      farmTables._test.validateBudgetRateBlockRows(actor, [{ block_id: id }], [2560], [id]),
      (error) => error.code === "PLANTING_YEAR_MISMATCH",
    );
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("planting years stay inside the original location box with accessible responsive controls", () => {
  assert.match(appSource, /data-budget-planting-year/);
  assert.match(appSource, /aria-checked="\$\{group\.ariaChecked\}"/);
  assert.match(appSource, /budget-area-tree-card[^`]+พื้นที่ \/ ที่ตั้ง[^`]+budget-tree-scroll[^`]+renderFarmBudgetPlantingYearSelector\(picks\)[^`]+renderFarmBudgetAreaTree\(picks\)/s);
  assert.doesNotMatch(appSource, /budget-planting-year-panel|budgetBlockSearch|budgetPlantingYearOnly/);
  assert.match(appSource, /selectedBlockIds:\s*farmBudgetUnique/);
  assert.match(appSource, /plantingYearSelectedBlockIds:\s*\[\]/);
  assert.match(cssSource, /\.budget-planting-year-grid\s*\{[^}]*repeat\(8,/s);
  assert.match(cssSource, /\.farm-budget-contract\s*\{[^}]*minmax\(0, 1fr\)/s);
  assert.match(cssSource, /@media \(max-width: 1180px\)[\s\S]*?\.budget-planting-year-grid\s*\{[^}]*repeat\(5,/);
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*?\.budget-planting-year-grid\s*\{[^}]*repeat\(3,/);
  assert.match(cssSource, /@media \(max-width: 420px\)[\s\S]*?\.budget-planting-year-grid\s*\{[^}]*repeat\(2,/);
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*?\.budget-planting-year-item\s*\{[^}]*min-height:\s*44px/s);
  assert.doesNotMatch(cssSource, /\.budget-planting-year-panel|\.budget-planting-year-grid[^{]*\{[^}]*min-width:\s*[5-9]\d{2}px/s);
});
