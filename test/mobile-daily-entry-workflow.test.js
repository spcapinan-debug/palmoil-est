const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("webapp/app.js", "utf8");
const actions = fs.readFileSync("api/farm-actions.js", "utf8");

test("daily entry resumes a date-keyed draft and reuses one work result", () => {
  assert.match(app, /farmResultDrafts/);
  assert.match(app, /resultDate/);
  assert.match(app, /get_or_create_work_result/);
  assert.match(app, /existingResultId/);
  assert.match(actions, /save_work_result_draft/);
});

test("daily persistence includes worker material and vehicle children", () => {
  assert.match(actions, /work_result_workers\?on_conflict=work_result_id,employee_id/);
  assert.match(actions, /work_order_materials\?id=eq/);
  assert.match(actions, /work_result_vehicle_usage\?work_result_id=eq\.\$\{resultId\}&vehicle_id=eq\.\$\{vehicleId\}/);
  assert.match(actions, /method: existing \? "PATCH" : "POST"/);
  assert.match(actions, /DUPLICATE_VEHICLE/);
  assert.match(actions, /VEHICLE_TIME_OVERLAP/);
});
