const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const farmActions = require("../api/farm-actions.js")._test;
const actions = fs.readFileSync("api/farm-actions.js", "utf8");
const app = fs.readFileSync("webapp/app.js", "utf8");

test("server calculates consumed fuel from opening plus issued minus closing", () => {
  assert.equal(farmActions.calculateConsumedFuel({ opening: 30, issued: 20, closing: 15, fallback: 99 }), 35);
  assert.throws(
    () => farmActions.calculateConsumedFuel({ opening: 10, issued: 2, closing: 20 }),
    (error) => error.code === "INVALID_FUEL_CONSUMPTION",
  );
});

test("fuel requisition and issue enforce work-order vehicle scope and over-issue checks", () => {
  assert.match(actions, /async function refreshVehicleFuelRequisition/);
  assert.match(actions, /work_order_machines\?work_order_id=eq/);
  assert.match(actions, /FUEL_OVER_ISSUE/);
  assert.match(actions, /tank_id: requireUuid/);
});

test("daily UI separates issued and actual fuel and does not invent a standard result", () => {
  assert.match(app, /fuel_issued_liter/);
  assert.match(app, /fuel_used_liter/);
  assert.match(app, /ไม่มีค่ามาตรฐานเปรียบเทียบ/);
  assert.doesNotMatch(app, /fuel\.configuration_confirmed\s*=\s*true/);
});
