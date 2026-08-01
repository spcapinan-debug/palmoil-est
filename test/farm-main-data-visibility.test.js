const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmTables = require("../api/farm-tables");

const apiSource = fs.readFileSync(path.join(__dirname, "..", "api", "farm-tables.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");

function functionSource(source, name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start);
  assert.ok(start >= 0 && end > start, `${name} source must be present`);
  return source.slice(start, end);
}

test("UAT workflow reads use assigned block scope without WEBTEST prefixes", () => {
  const source = functionSource(apiSource, "uatReadContext", "uatActionCenterRows");
  assert.match(source, /work_orders\?block_id=in\./);
  assert.doesNotMatch(source, /startsWith\("WEBTEST-|WEBTEST-2569|WEBTEST-UAT/);
  assert.match(source, /goods_issues\?work_order_id=in\./);
  assert.match(source, /payroll_period_lines\?work_result_id=in\./);
});

test("all 27 scoped workflow rows survive API row authorization", () => {
  const statuses = [
    ...Array(22).fill("approved"),
    "dispatched",
    ...Array(3).fill("in_progress"),
    "closed",
  ];
  const rows = statuses.map((status, index) => ({ id: `order-${index + 1}`, status }));
  const context = { workOrderIds: new Set(rows.map((row) => row.id)) };
  const visible = rows.filter((row) => farmTables._test.uatRowAllowed("work_orders", row, context));
  assert.equal(visible.length, 27);
  assert.deepEqual(
    Object.fromEntries([...new Set(statuses)].map((status) => [status, visible.filter((row) => row.status === status).length])),
    { approved: 22, dispatched: 1, in_progress: 3, closed: 1 },
  );
});

test("table API exposes raw/scoped metadata and contains individual table failures", () => {
  assert.match(apiSource, /tableMeta:\s*Object\.fromEntries/);
  assert.match(apiSource, /scopedCount:\s*item\.rows\.length/);
  assert.match(apiSource, /errors:\s*Object\.fromEntries/);
  assert.match(apiSource, /catch \(error\) \{\s*return \{ table, rows: \[\]/s);
  assert.deepEqual(farmTables._test.safeTableError(new Error("database password leaked")), {
    code: "TABLE_READ_FAILED",
    message: "Table read failed",
  });
});

test("entry-first dispatch and daily candidates retain real workflow statuses", () => {
  assert.match(appSource, /function farmDispatchCandidateOrders\(\)[\s\S]*farmDispatchApprovedOrders\(\)/);
  const dailyStart = appSource.indexOf("function farmResultCandidateOrders()");
  const dailyEnd = appSource.indexOf("function farmResultSelectedOrder()", dailyStart);
  const dailySource = appSource.slice(dailyStart, dailyEnd);
  assert.match(dailySource, /"dispatched"[\s\S]*"in_progress"/);
  assert.doesNotMatch(dailySource, /"approved"|"completed"|workOrderWorkerIds/);
});
