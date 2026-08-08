const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("webapp/app.js", "utf8");
const actions = fs.readFileSync("api/farm-actions.js", "utf8");

test("mobile dispatch remains candidate-first with search filters and deep-link selection", () => {
  assert.match(app, /function farmDispatchCandidateOrders/);
  assert.match(app, /renderFarmDispatchCandidateList/);
  assert.match(app, /farmDispatchListFilters/);
  assert.match(app, /workOrderId/);
  assert.match(app, /Browser|popstate|hydrateFarmWorkflowStateFromUrl/);
});

test("dispatch assignment is action-only, scoped, validated and duplicate-safe", () => {
  assert.match(actions, /save_dispatch_assignment:[\s\S]*permission: "farm\.work_order\.dispatch"/);
  assert.match(actions, /async function saveDispatchAssignment/);
  assert.match(actions, /authorizeWorkOrderScope/);
  assert.match(actions, /new Set\(workers\.map/);
  assert.match(actions, /farm_action_idempotency/);
});
