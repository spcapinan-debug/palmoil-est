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
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(`${appSource.slice(start, end)}\nresult = {
    farmBudgetPlantingYearFromBlock, farmBudgetSelectionState, farmBudgetToggleBlockIds,
    farmBudgetPlantingYearGroups,
  };`, sandbox);
  return sandbox.result;
}

function functionSlice(name, nextName) {
  const start = appSource.indexOf(`function ${name}`);
  const end = appSource.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} must remain inspectable`);
  return appSource.slice(start, end);
}

const blocks = [
  { id: "b1", block_code: "50-C05-R", planted_year: 2550, status: "active" },
  { id: "b2", block_code: "50-B07", planting_year: 2550, status: "active" },
  { id: "b3", block_code: "56-C10-R", planting_date: "2013-01-01", status: "active" },
  { id: "b4", block_code: "60-C01-R", planting_year: 2017, status: "active" },
];

test("planning renders planting years inside its existing location box", () => {
  assert.match(appSource, /data-budget-context="work-plan"[^`]+budget-area-tree-card[^`]+พื้นที่ \/ ที่ตั้ง[^`]+budget-tree-scroll[^`]+renderFarmBudgetPlantingYearSelector\(budgetPicks,[^`]+renderFarmBudgetAreaTree\(budgetPicks\)/s);
});

test("budget settings still render the same shared selector inside their location box", () => {
  assert.match(appSource, /budget-area-tree-card[^`]+พื้นที่ \/ ที่ตั้ง[^`]+budget-tree-scroll[^`]+renderFarmBudgetPlantingYearSelector\(picks\)[^`]+renderFarmBudgetAreaTree\(picks\)/s);
});

test("budget and planning share one selector and route events to separate state", () => {
  assert.equal((appSource.match(/function renderFarmBudgetPlantingYearSelector/g) || []).length, 1);
  assert.match(appSource, /closest\('\[data-budget-context="work-plan"\]'\)[\s\S]*?farmWorkPlanState\(\)[\s\S]*?farmBudgetContractState\(\)/);
  assert.match(appSource, /idPrefix: "planning", allLabel: "ทุกปี"/);
});

test("Block Master year priority and Buddhist-year normalization are preserved", () => {
  const api = plantingHarness();
  assert.equal(api.farmBudgetPlantingYearFromBlock({ planted_year: 2557, planting_date: "2010-01-01", block_code: "50-B07" }).year, 2557);
  assert.equal(api.farmBudgetPlantingYearFromBlock({ planting_date: "2017-01-01" }).year, 2560);
  assert.equal(api.farmBudgetPlantingYearFromBlock({ planting_year: 2560 }).year, 2560);
});

test("planning years are unique and oldest-first", () => {
  const years = plantingHarness().farmBudgetPlantingYearGroups(blocks, [], "asc").years;
  assert.deepEqual(Array.from(years, (row) => row.year), [2550, 2556, 2560]);
});

test("selecting one planning year selects every Block in that year", () => {
  const api = plantingHarness();
  const group = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years[0];
  assert.deepEqual(Array.from(api.farmBudgetToggleBlockIds([], group.blockIds, true)).sort(), ["b1", "b2"]);
});

test("selecting multiple planning years keeps Block IDs unique", () => {
  const api = plantingHarness();
  const groups = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years;
  const selected = api.farmBudgetToggleBlockIds(groups[0].blockIds, [...groups[0].blockIds, ...groups[1].blockIds], true);
  assert.deepEqual(Array.from(selected).sort(), ["b1", "b2", "b3"]);
  assert.equal(selected.length, new Set(selected).size);
});

test("clearing one planning year leaves another selected year intact", () => {
  const api = plantingHarness();
  const groups = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years;
  const selected = api.farmBudgetToggleBlockIds([...groups[0].blockIds, ...groups[1].blockIds], groups[0].blockIds, false);
  assert.deepEqual(Array.from(selected), ["b3"]);
});

test("removing an individual Block makes its planning year indeterminate", () => {
  const state = plantingHarness().farmBudgetSelectionState(["b1", "b2"], ["b1"]);
  assert.equal(state.indeterminate, true);
  assert.equal(state.ariaChecked, "mixed");
});

test("group and planting-year checkboxes use the same two-way state contract", () => {
  const api = plantingHarness();
  const groupState = api.farmBudgetSelectionState(["b1", "b2"], ["b1"]);
  const yearState = api.farmBudgetPlantingYearGroups(blocks, ["b1"], "asc").years[0];
  assert.equal(groupState.ariaChecked, yearState.ariaChecked);
});

test("all-years selection covers every scoped active Block and supports mixed state", () => {
  const api = plantingHarness();
  const ids = api.farmBudgetPlantingYearGroups(blocks, [], "asc").years.flatMap((row) => row.blockIds);
  const selected = api.farmBudgetToggleBlockIds([], ids, true);
  assert.equal(api.farmBudgetSelectionState(ids, selected).checked, true);
  assert.equal(api.farmBudgetSelectionState(ids, selected.slice(0, 1)).indeterminate, true);
});

test("opening an existing plan derives year state without selecting sibling Blocks", () => {
  const model = plantingHarness().farmBudgetPlantingYearGroups(blocks, ["b1", "b3"], "asc");
  assert.equal(model.years[0].indeterminate, true);
  assert.deepEqual(["b1", "b3"], ["b1", "b3"]);
});

test("switching plans replaces Block IDs and clears derived year-source state", () => {
  const body = functionSlice("syncFarmWorkOrderToPlanner", "selectFarmWorkOrderFromTimeline");
  assert.match(body, /picks\.selectedBlocks\s*=\s*farmBudgetUnique/);
  assert.match(body, /picks\.plantingYearSelectedBlockIds\s*=\s*\[\]/);
});

test("plan save failures retain planning Block and planting-year state", () => {
  const body = functionSlice("createFarmWorkPlanFromSelection", "saveFarmWorkPlanEditFromSelection");
  const catchBody = body.slice(body.indexOf("} catch (error)"));
  assert.match(catchBody, /state\.farmSyncStatus\s*=\s*"error"/);
  assert.doesNotMatch(catchBody, /selectedBlocks\s*=\s*\[\]|plantingYearSelectedBlockIds\s*=\s*\[\]/);
});

test("server rejects a planned item outside the UAT actor Block scope", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const planId = "10000000-0000-4000-8000-000000000010";
  const allowedId = "10000000-0000-4000-8000-000000000001";
  const forbiddenId = "10000000-0000-4000-8000-000000000002";
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    global.fetch = async () => new Response(JSON.stringify([{ id: planId, plan_name: "WEBTEST-UAT-PLAN" }]), { status: 200 });
    const actor = { roles: new Set(["uat_manager"]), scopes: [{ block_id: allowedId }] };
    await assert.rejects(
      farmTables._test.enforceUatTableWrite(actor, "planned_work_items", [{ annual_plan_id: planId, block_id: forbiddenId }]),
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

test("planning deduplicates selected Blocks and keeps the shared mobile no-overflow grid", () => {
  const selectedBody = functionSlice("farmSelectedPlanningBlocks", "farmPlanningBlockDbId");
  const createBody = functionSlice("createFarmWorkPlanFromSelection", "saveFarmWorkPlanEditFromSelection");
  assert.match(selectedBody, /farmBudgetUnique\(picks\.selectedBlocks/);
  assert.match(createBody, /for \(const block of selectedBlocks\)/);
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*?\.budget-planting-year-grid\s*\{[^}]*repeat\(3,/);
  assert.match(cssSource, /@media \(max-width: 420px\)[\s\S]*?\.budget-planting-year-grid\s*\{[^}]*repeat\(2,/);
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*?\.budget-planting-year-item\s*\{[^}]*min-height:\s*44px/);
});
