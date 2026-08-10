const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");

function colorHarness() {
  const start = appSource.indexOf("function farmAreaGroupKey");
  const end = appSource.indexOf("function farmAreaMapStatusLabel", start);
  const sandbox = {};
  vm.runInNewContext(`${appSource.slice(start, end)}\nresult = { farmAreaGroupKey, farmAreaGroupColor, farmMapBlockColor, farmMapFeatureOuterRings };`, sandbox);
  return sandbox.result;
}

test("same canonical Block Group always receives the same fill", () => {
  const api = colorHarness();
  assert.equal(api.farmMapBlockColor({ blockGroupCode: "A" }), api.farmMapBlockColor({ blockGroupCode: "A" }));
  assert.equal(api.farmAreaGroupColor("PU"), api.farmAreaGroupColor("pu"));
});

test("different groups use deterministic stable colors after reorder or refresh", () => {
  const api = colorHarness();
  const first = ["A", "B", "C", "T", "P", "PU"].map((group) => [group, api.farmAreaGroupColor(group)]);
  const refreshed = [...first].reverse().map(([group]) => [group, api.farmAreaGroupColor(group)]).reverse();
  assert.deepEqual(JSON.parse(JSON.stringify(refreshed)), JSON.parse(JSON.stringify(first)));
  assert.notEqual(api.farmAreaGroupColor("A"), api.farmAreaGroupColor("B"));
});

test("null group and unmatched polygons use neutral fallback styles", () => {
  const api = colorHarness();
  assert.equal(api.farmAreaGroupKey({}), "");
  assert.equal(api.farmAreaGroupColor(""), "#94a3b8");
  assert.match(cssSource, /farm-block-polygon\.map-without-master[\s\S]*fill:\s*#(?:94a3b8|cbd5e1)/);
  assert.match(cssSource, /stroke-dasharray/);
  assert.match(cssSource, /farm-block-polygon\.map-conflict/);
});

test("selected polygon keeps group fill and changes only outline/glow", () => {
  const selectedRule = cssSource.slice(cssSource.lastIndexOf(".farm-block-polygon.selected"), cssSource.indexOf(".farm-area-map-legend", cssSource.lastIndexOf(".farm-block-polygon.selected")));
  assert.match(selectedRule, /stroke:/);
  assert.match(selectedRule, /filter:/);
  assert.doesNotMatch(selectedRule, /\bfill\s*:/);
});

test("legend counts only matched canonical data and dims rather than hides other groups", () => {
  const start = appSource.indexOf("function renderFarmAreaBlockMap");
  const end = appSource.indexOf("function farmAreaGroupDisplay", start);
  const renderer = appSource.slice(start, end);
  assert.match(renderer, /match_status !== "matched"/);
  assert.match(renderer, /groupCounts\.set/);
  assert.match(renderer, /data-area-map-group="all"/);
  assert.match(renderer, /group-muted/);
  assert.doesNotMatch(cssSource, /farm-block-polygon\.group-muted\s*\{[^}]*display:\s*none/s);
});

test("MultiPolygon rendering retains all outer rings", () => {
  const rings = colorHarness().farmMapFeatureOuterRings({
    geometry: { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [0, 0]]], [[[2, 0], [3, 0], [2, 0]]]] },
  });
  assert.equal(rings.length, 2);
});

test("Block Group relation is preferred before generic canonical block_name derivation", () => {
  const start = appSource.indexOf("function farmBlockGroupCode");
  const end = appSource.indexOf("function farmLocationBlockLabel", start);
  const source = appSource.slice(start, end);
  assert.ok(source.indexOf("plotGroup.group_code") < source.indexOf("block.plot_group_code"));
  assert.match(source, /block\.block_name/);
  assert.match(source, /\^\\d\{2\}-\(\[A-Z\]\+\)\\d\+/);
  assert.doesNotMatch(source, /ap_code|AP_code|array|index/);
});

test("map detail and header expose active Map Version", () => {
  assert.match(appSource, /\["Map Version", farmAreaMapVersionLabel\(\)\]/);
  assert.match(appSource, /Current Map \$\{esc\(farmAreaMapVersionLabel/);
});

test("responsive KMZ controls retain 44px touch targets and no fixed mobile width", () => {
  assert.match(cssSource, /farm-area-map-head-actions button[\s\S]*min-height:\s*44px/);
  assert.match(cssSource, /@media \(max-width: 820px\)[\s\S]*farm-area-map-modal \{ width:\s*100vw/);
  assert.match(cssSource, /farm-area-map-legend > div[\s\S]*overflow-x:\s*auto/);
});
