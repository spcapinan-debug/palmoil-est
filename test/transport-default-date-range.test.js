const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");

function rangeHarness() {
  const start = source.indexOf("function currentMonthStartIso");
  const end = source.indexOf("function setDefaultTransportDateRange", start);
  const sandbox = {
    isoDay(value) {
      const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
      return match?.[0] || "";
    },
    todayIso: () => "2026-08-10",
  };
  vm.runInNewContext(`${source.slice(start, end)}\nresult = transportDefaultDateRange;`, sandbox);
  return sandbox.result;
}

function hostedRefreshHarness() {
  const start = source.indexOf("function transportRefreshUsesHostedSnapshot");
  const end = source.indexOf("async function fetchWithTimeout", start);
  const sandbox = { URL };
  vm.runInNewContext(`${source.slice(start, end)}\nresult = transportRefreshUsesHostedSnapshot;`, sandbox);
  return sandbox.result;
}

test("transport defaults to the latest available data month when today is after dateMax", () => {
  const range = rangeHarness()({ dateMin: "2026-01-04", dateMax: "2026-07-09" }, "2026-08-10");
  assert.deepEqual({ ...range }, { start: "2026-07-01", end: "2026-07-09" });
});

test("transport keeps the current month when today is inside the source range", () => {
  const range = rangeHarness()({ dateMin: "2026-01-04", dateMax: "2026-08-31" }, "2026-08-10");
  assert.deepEqual({ ...range }, { start: "2026-08-01", end: "2026-08-10" });
});

test("transport selects the latest data month when today is before the source range", () => {
  const range = rangeHarness()({ dateMin: "2026-09-04", dateMax: "2026-09-20" }, "2026-08-10");
  assert.deepEqual({ ...range }, { start: "2026-09-04", end: "2026-09-20" });
});

test("hosted HTTPS preview reloads the deployed snapshot instead of calling localhost", () => {
  const usesSnapshot = hostedRefreshHarness();
  assert.equal(usesSnapshot({ protocol: "https:", hostname: "preview.example", href: "https://preview.example/" }, "http://127.0.0.1:8080/api/transport_refresh.php"), true);
});

test("local HTTP app keeps the workbook regeneration endpoint", () => {
  const usesSnapshot = hostedRefreshHarness();
  assert.equal(usesSnapshot({ protocol: "http:", hostname: "127.0.0.1", href: "http://127.0.0.1:8080/" }, "http://127.0.0.1:8080/api/transport_refresh.php"), false);
});

test("hosted remote refresh endpoints are called normally", () => {
  const usesSnapshot = hostedRefreshHarness();
  assert.equal(usesSnapshot({ protocol: "https:", hostname: "app.example", href: "https://app.example/" }, "https://api.example/transport_refresh"), false);
});

test("hosted snapshot refresh avoids online database mutation", () => {
  const refreshStart = source.indexOf("async function refreshTransportFromQuery");
  const localStart = source.indexOf("writeClearOverridesLocal();", refreshStart);
  const hostedBranch = source.slice(refreshStart, localStart);
  assert.match(hostedBranch, /loadPayload\(\{ silent: true \}\)/);
  assert.match(hostedBranch, /loadMillWeightData\(\)/);
  assert.doesNotMatch(hostedBranch, /syncTransportDatabase/);
});

test("transport extractors prioritize the configured or canonical H drive source", () => {
  const extractor = fs.readFileSync(path.join(__dirname, "..", "webapp", "scripts", "extract_data.py"), "utf8");
  const millExtractor = fs.readFileSync(path.join(__dirname, "..", "webapp", "scripts", "extract_mill_weight.py"), "utf8");
  for (const script of [extractor, millExtractor]) {
    const configured = script.indexOf('os.environ.get("PALM_DATA_DIR")');
    const canonical = script.indexOf('r"H:\\My Drive\\Work\\');
    const repository = script.indexOf('str(ROOT)');
    assert.ok(configured >= 0 && canonical > configured && repository > canonical);
  }
  assert.match(extractor, /DATA_WORKBOOK = first_existing\([^\n]+newest=False\)/);
  assert.match(millExtractor, /if existing:\s+return existing\[0\]/);
  const localServer = fs.readFileSync(path.join(__dirname, "..", "webapp", "scripts", "local_api_server.py"), "utf8");
  assert.match(localServer, /workbook = candidates\[0\] if candidates else None/);
});
