const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");

function groupingHarness() {
  const start = appSource.indexOf("function farmAreaZoneValue");
  const end = appSource.indexOf("function farmAreaSelectorBlocks", start);
  assert.ok(start >= 0 && end > start, "shared Area grouping helpers must remain executable as a unit");
  const sandbox = { farmFirstFilled: (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim()) || "" };
  vm.runInNewContext(`${appSource.slice(start, end)}\nresult = { farmAreaZoneValue, normalizeAreaBlockCode, getPlotGroup, buildAreaTree };`, sandbox);
  return sandbox.result;
}

test("getPlotGroup derives every observed Terrain master group from canonical Block Code", () => {
  const { getPlotGroup } = groupingHarness();
  const cases = {
    "49-A10-R": "A", "30-B14": "B", "22-C05-R": "C", "56-D07-R": "D",
    "51-P07-R": "P", "30-PU1": "PU", "37-T29": "T", " SB270766 ": "SB",
    "56–A03–R": "A", A01: "A", B02: "B", T11: "T", PU3: "PU", EST001: "", Ramp: "",
  };
  for (const [code, expected] of Object.entries(cases)) assert.equal(getPlotGroup(code), expected, code);
});

test("buildAreaTree uses Zone then parsed plot-letter group and preserves Block IDs", () => {
  const { buildAreaTree } = groupingHarness();
  const blocks = [
    { id: "u-a", block_code: "49-A10-R", zone_name: "Upper", plot_group_code: "EST001" },
    { id: "u-t", terrain_code: "37-T29", superior: "Upper", plot_group_code: "EST001" },
    { id: "l-a", block_code: "50-A05", zone_name: "Lower", plot_group_code: "EST003" },
    { id: "l-c", block_code: "22-C05-R", zone_name: "Lower", plot_group_code: "EST004" },
    { id: "l-pu", block_code: "30-PU1", zone_name: "Lower", plot_group_code: "EST003" },
    { id: "sb", block_code: "SB170867", superior: "X-NU01", plot_group_code: "EST043" },
    { id: "u-b", block_code: "30-B14", zone_name: "โซนบน" },
    { id: "l-d", block_code: "56-D07-R", zone_code: "S" },
  ];
  const tree = buildAreaTree(blocks);
  assert.deepEqual(Array.from(tree.upper.groups, (group) => group.label), ["A", "B", "T"]);
  assert.deepEqual(Array.from(tree.lower.groups, (group) => group.label), ["A", "C", "D", "PU"]);
  assert.deepEqual(Array.from(tree.upper.blockIds).sort(), ["u-a", "u-b", "u-t"]);
  assert.deepEqual(Array.from(tree.lower.blockIds).sort(), ["l-a", "l-c", "l-d", "l-pu"]);
  assert.deepEqual(Array.from(tree.sb.blockIds), ["sb"]);
  assert.equal(tree.unassigned.blockIds.length, 0);
  const presentationGroups = [...tree.upper.groups, ...tree.lower.groups].flatMap((group) => [group.key, group.label]);
  assert.equal(presentationGroups.some((value) => /^EST\d+$/i.test(value)), false);
  assert.equal(tree.upper.blocks.find((block) => block.id === "u-a").plot_group_code, "EST001");
});

test("Zone fallback ignores placeholder text so real Area master values can win", () => {
  const { farmAreaZoneValue } = groupingHarness();
  assert.equal(farmAreaZoneValue("ยังไม่ระบุ Zone", "", "Lower"), "Lower");
  assert.equal(farmAreaZoneValue("unknown", "ตอนบน"), "ตอนบน");
  assert.equal(farmAreaZoneValue("", "-", "โซนล่าง"), "โซนล่าง");
});

test("Budget and Work Order both render the same shared Area selector component", () => {
  const planningStart = appSource.indexOf("function renderFarmWorkAreaSelector");
  const budgetStart = appSource.indexOf("function renderFarmBudgetAreaTree", planningStart);
  const budgetEnd = appSource.indexOf("function farmBudgetAreaOptions", budgetStart);
  const planningBody = appSource.slice(planningStart, budgetStart);
  const budgetBody = appSource.slice(budgetStart, budgetEnd);
  assert.match(planningBody, /return renderAreaBlockSelector\(\{ picks, idPrefix: "work-plan", allLabel: "ทุกปี" \}\)/);
  assert.match(budgetBody, /return renderAreaBlockSelector\(\{ picks, idPrefix: "budget", allLabel: "เลือกทุกปี", query:/);
  assert.doesNotMatch(`${planningBody}\n${budgetBody}`, /buildFarmLocationTree|plot_groups|estateMap|EST\d+/);
});

test("shared renderer exposes direct Zone and Group checkbox selection without select-all copy", () => {
  const start = appSource.indexOf("function renderAreaTreeBlock");
  const end = appSource.indexOf("function renderAreaBlockSelector", start);
  const body = appSource.slice(start, end);
  assert.match(body, /renderBudgetAreaGroupSummary\(zone\.label, zone\.blocks, picks\.selectedBlocks/);
  assert.match(body, /renderBudgetAreaGroupSummary\(group\.label, group\.blocks, picks\.selectedBlocks/);
  assert.match(body, /renderBudgetCheckbox\("block", value/);
  assert.match(body, /data-area-block-selector/);
  assert.ok(body.indexOf("visibleTree.upper") < body.indexOf("visibleTree.lower"));
  assert.ok(body.indexOf("visibleTree.lower") < body.indexOf("visibleTree.sb"));
  assert.ok(body.indexOf("visibleTree.sb") < body.indexOf("visibleTree.unassigned"));
  assert.doesNotMatch(body, /เลือกทั้งหมด|EST\d+/);
});

test("shared Area selector owns Budget years and tree for both consumers", () => {
  const body = appSource.slice(
    appSource.indexOf("function renderAreaBlockSelector"),
    appSource.indexOf("function renderFarmWorkAreaSelector"),
  );
  assert.match(body, /farmAreaSelectorBlocks\(\)/);
  assert.match(body, /renderFarmBudgetPlantingYearSelector\(picks, \{ idPrefix, allLabel, blocks \}\)/);
  assert.match(body, /renderAreaBlockTree\(\{ blocks, picks, query \}\)/);
  assert.match(body, /data-shared-area-block-selector/);
  assert.doesNotMatch(body, /areaPlantingYears|data-farm-work-planting-year/);
});
