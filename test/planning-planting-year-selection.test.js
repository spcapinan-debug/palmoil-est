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

test("planning renders its canonical area selector inside the existing location box", () => {
  assert.match(appSource, /data-budget-context="work-plan"[^`]+budget-area-tree-card[^`]+พื้นที่ \/ ที่ตั้ง[^`]+budget-tree-scroll[^`]+renderFarmWorkAreaSelector\(budgetPicks\)/s);

  const body = functionSlice("renderFarmWorkAreaSelector", "renderFarmBudgetAreaTree");
  assert.match(body, /return renderAreaBlockSelector\(\{ picks, idPrefix: "work-plan", allLabel: "ทุกปี" \}\)/);
  assert.doesNotMatch(body, /areaPlantingYears|data-farm-work-planting-year/);
  assert.doesNotMatch(body, /เลือกทั้งหมด|estate|EST|renderFarmWorkAreaPanel/);
});

test("planning area tree uses Zone to Plot Letter Group to Block with shared selection state", () => {
  const zoneBody = functionSlice("renderAreaTreeBlock", "renderFarmWorkAreaSelector");
  assert.match(zoneBody, /renderBudgetAreaGroupSummary\(group\.label, group\.blocks, picks\.selectedBlocks/);
  assert.match(zoneBody, /renderBudgetAreaGroupSummary\(zone\.label, zone\.blocks, picks\.selectedBlocks/);
  assert.match(zoneBody, /renderAreaTreeBlock\(block, picks\)/);
  assert.match(zoneBody, /data-area-zone=/);
  assert.doesNotMatch(zoneBody, /เลือกทั้งหมด|เลือกทั้งแปลง/);
  assert.match(cssSource, /\.farm-work-area-tree-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(cssSource, /\.farm-work-zone-column\.is-wide\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(cssSource, /\.farm-work-area-tree-layout\s*\{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*scroll/s);
  assert.match(cssSource, /\.farm-work-area-tree-layout\s*\{[^}]*height:\s*clamp\(320px,[^}]*max-height:\s*400px/s);
  assert.match(cssSource, /\.farm-work-zone-column\s*\{[^}]*overflow:\s*visible/s);
  assert.match(cssSource, /\.farm-work-zone-column\s*\{[^}]*min-height:\s*max-content[^}]*height:\s*max-content/s);
  assert.doesNotMatch(cssSource, /\.farm-work-zone-column\s*\{[^}]*(?:overflow-y:\s*(?:auto|scroll))/s);
  assert.match(cssSource, /\.farm-work-tree-blocks\s*\{[^}]*overflow:\s*visible/s);
});

test("planning uses one visible touch-scroll container and preserves its scroll position", () => {
  assert.match(cssSource, /\.farm-work-area-tree-layout::-webkit-scrollbar\s*\{[^}]*width:\s*12px/s);
  assert.match(cssSource, /\.farm-work-area-tree-layout\s*\{[^}]*touch-action:\s*pan-y[^}]*-webkit-overflow-scrolling:\s*touch/s);
  const body = functionSlice("renderPreservingBudgetTreeScroll", "farmBudgetExtraRateNote");
  assert.match(body, /querySelector\("\[data-area-block-selector\]"\)/);
  assert.match(body, /nextAreaTree\.scrollTop\s*=\s*areaTreeScrollTop/);
});

test("shared Budget planting-year selector stays compact in Work Order", () => {
  const body = functionSlice("renderAreaBlockSelector", "renderFarmWorkAreaSelector");
  assert.match(body, /renderFarmBudgetPlantingYearSelector/);
  assert.match(cssSource, /\.area-block-selector \.budget-planting-year-section\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)[^}]*padding:\s*6px 2px 7px/s);
  assert.match(cssSource, /\.area-block-selector \.budget-planting-year-section \.budget-planting-year-grid\s*\{[^}]*repeat\(auto-fit, minmax\(42px, 1fr\)\)[^}]*gap:\s*0 2px/s);
  assert.match(cssSource, /\.area-block-selector \.budget-planting-year-section \.budget-planting-year-item\s*\{[^}]*min-height:\s*32px/s);
});

test("budget settings still render the shared Area selector inside their location box", () => {
  assert.match(appSource, /budget-area-tree-card[^`]+พื้นที่ \/ ที่ตั้ง[^`]+budget-tree-scroll[^`]+renderFarmBudgetAreaTree\(picks\)/s);
});

test("planning and budget keep separate state while sharing one Area selector renderer", () => {
  assert.equal((appSource.match(/function renderFarmBudgetPlantingYearSelector/g) || []).length, 1);
  assert.equal((appSource.match(/function renderFarmWorkAreaSelector/g) || []).length, 1);

  const planningBody = functionSlice("renderFarmWorkAreaSelector", "renderFarmBudgetAreaTree");
  assert.match(planningBody, /renderAreaBlockSelector\([^\n]+picks/);
  const budgetBody = functionSlice("renderFarmBudgetAreaTree", "farmBudgetAreaOptions");
  assert.match(budgetBody, /renderAreaBlockSelector\([^\n]+picks/);
  const treeBody = functionSlice("renderAreaTreeBlock", "renderAreaBlockSelector");
  assert.match(treeBody, /picks\.selectedBlocks/);

  assert.match(appSource, /renderFarmWorkAreaSelector\(budgetPicks\)/);
  assert.match(appSource, /renderFarmBudgetPlantingYearSelector\(picks, \{ idPrefix, allLabel, blocks \}\)/);
  assert.equal((appSource.match(/data-farm-work-planting-year/g) || []).length, 0);
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
