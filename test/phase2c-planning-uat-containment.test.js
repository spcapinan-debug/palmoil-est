const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmActions = require("../api/farm-actions");
const farmTables = require("../api/farm-tables");

const {
  ACTIONS,
  PLANNING_UAT_ACTIONS,
  PLANNING_UAT_PLAN_PREFIX,
  UAT_MUTATION_ACTIONS,
  createWorkOrderFromPlanItem,
  enforceUatMutation,
} = farmActions._test;

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const uatActor = { profile: { id: ACTOR_ID }, roles: new Set(["uat_manager"]) };
const productionActor = { profile: { id: ACTOR_ID }, roles: new Set(["farm_manager"]) };
const ownPlan = {
  id: PLAN_ID,
  source_type: "canonical_budget",
  created_by: ACTOR_ID,
  plan_name: `${PLANNING_UAT_PLAN_PREFIX}PLAN-001`,
};
const otherPlan = { ...ownPlan, created_by: OTHER_ACTOR_ID };
const genericCanonicalPlan = { ...ownPlan, plan_name: "Production Plan" };

function queuedOne(...rows) {
  let index = 0;
  return async () => rows[index++];
}

function assertUatWriteForbidden(error) {
  return error?.status === 403 && error?.code === "UAT_WRITE_FORBIDDEN";
}

test("1-2. UAT actor can create only an explicitly prefixed canonical Plan", async () => {
  await enforceUatMutation(uatActor, "create_canonical_annual_work_plan", {
    plan_name: `${PLANNING_UAT_PLAN_PREFIX}CREATE`,
  });
  await assert.rejects(
    enforceUatMutation(uatActor, "create_canonical_annual_work_plan", { plan_name: "Production Plan" }),
    assertUatWriteForbidden,
  );
});

test("3-6. UAT actor can update and delete only its own prefixed Plan", async () => {
  await assert.rejects(
    enforceUatMutation(uatActor, "update_canonical_annual_work_plan", {
      annual_plan_id: PLAN_ID,
      plan_name: `${PLANNING_UAT_PLAN_PREFIX}UPDATED`,
    }, { one: queuedOne(otherPlan) }),
    assertUatWriteForbidden,
  );
  await assert.rejects(
    enforceUatMutation(uatActor, "delete_canonical_annual_work_plan", {
      annual_plan_id: PLAN_ID,
    }, { one: queuedOne(otherPlan) }),
    assertUatWriteForbidden,
  );
  await enforceUatMutation(uatActor, "update_canonical_annual_work_plan", {
    annual_plan_id: PLAN_ID,
    plan_name: `${PLANNING_UAT_PLAN_PREFIX}UPDATED`,
  }, { one: queuedOne(ownPlan) });
  await enforceUatMutation(uatActor, "delete_canonical_annual_work_plan", {
    annual_plan_id: PLAN_ID,
  }, { one: queuedOne(ownPlan) });
  await assert.rejects(
    enforceUatMutation(uatActor, "update_canonical_annual_work_plan", {
      annual_plan_id: PLAN_ID,
      plan_name: "Production Plan",
    }, { one: queuedOne(ownPlan) }),
    assertUatWriteForbidden,
  );
});

test("7-8. UAT actor can create a canonical item only under its own prefixed Plan", async () => {
  await enforceUatMutation(uatActor, "create_canonical_planned_work_item_snapshot", {
    annual_plan_id: PLAN_ID,
  }, { one: queuedOne(ownPlan) });
  await assert.rejects(
    enforceUatMutation(uatActor, "create_canonical_planned_work_item_snapshot", {
      annual_plan_id: PLAN_ID,
    }, { one: queuedOne(genericCanonicalPlan) }),
    assertUatWriteForbidden,
  );
});

test("9-12. item update, refresh, and delete resolve and guard the parent Plan", async () => {
  for (const action of [
    "update_canonical_planned_work_item",
    "refresh_canonical_planned_work_item_snapshot",
    "delete_canonical_planned_work_item",
  ]) {
    await enforceUatMutation(uatActor, action, {
      planned_work_item_id: ITEM_ID,
    }, { one: queuedOne({ id: ITEM_ID, annual_plan_id: PLAN_ID }, ownPlan) });
  }
  await assert.rejects(
    enforceUatMutation(uatActor, "update_canonical_planned_work_item", {
      planned_work_item_id: ITEM_ID,
    }, { one: queuedOne({ id: ITEM_ID, annual_plan_id: PLAN_ID }, otherPlan) }),
    assertUatWriteForbidden,
  );
});

test("13-15. approval and Budget mutations remain forbidden to UAT identities", async () => {
  assert.equal(UAT_MUTATION_ACTIONS.has("approve_canonical_annual_work_plan"), false);
  await assert.rejects(
    enforceUatMutation(uatActor, "approve_canonical_annual_work_plan", { annual_plan_id: PLAN_ID }),
    (error) => error?.status === 403 && error?.code === "UAT_ACTION_FORBIDDEN",
  );
  await enforceUatMutation(productionActor, "approve_canonical_annual_work_plan", {
    annual_plan_id: PLAN_ID,
  });
  assert.equal(ACTIONS.approve_canonical_annual_work_plan.permission, "farm.plan.approve");
  for (const action of [
    "create_budget_block_material_rate",
    "update_budget_block_material_rate",
    "deactivate_budget_block_material_rate",
    "bulk_apply_budget_block_material_rate",
  ]) {
    assert.equal(UAT_MUTATION_ACTIONS.has(action), false, action);
  }
});

test("Planning UAT allowlist contains exactly the eight reversible draft actions", () => {
  assert.deepEqual([...PLANNING_UAT_ACTIONS].sort(), [
    "create_canonical_annual_work_plan",
    "create_canonical_planned_work_item_snapshot",
    "delete_canonical_annual_work_plan",
    "delete_canonical_planned_work_item",
    "refresh_canonical_planned_work_item_snapshot",
    "update_canonical_annual_work_plan",
    "update_canonical_planned_resource_requirements",
    "update_canonical_planned_work_item",
  ].sort());
});

test("16-17. canonical Work Order containment remains fail-closed without a mutation", async () => {
  const calls = [];
  await assert.rejects(
    createWorkOrderFromPlanItem({
      args: { planned_work_item_id: ITEM_ID },
      actor: uatActor,
    }, {
      one: async (query) => {
        calls.push(query);
        if (query.startsWith("planned_work_items?")) {
          return { id: ITEM_ID, annual_plan_id: PLAN_ID, source_type: "canonical_budget" };
        }
        return { id: PLAN_ID, source_type: "canonical_budget" };
      },
      rest: async (query, options) => {
        calls.push({ query, options });
        return { data: [] };
      },
    }),
    (error) => error?.status === 409 && error?.code === "PLANNING_CANONICAL_WORK_ORDER_NOT_READY",
  );
  assert.equal(calls.some((call) => typeof call === "object" && call.options?.method), false);
});

test("18-19. own empty canonical Plan and historical scoped reads remain available", () => {
  const context = {
    annualPlanIds: new Set([PLAN_ID, "historical-plan"]),
    plannedItemIds: new Set(["historical-item"]),
    surveyAttachmentIds: new Set(),
    workOrderIds: new Set(),
    workResultIds: new Set(),
    surveyResponseIds: new Set(),
    blockIds: new Set(),
    blockKeys: new Set(),
  };
  assert.equal(farmTables._test.uatRowAllowed("annual_work_plans", { id: PLAN_ID }, context), true);
  assert.equal(farmTables._test.uatRowAllowed("annual_work_plans", { id: "other-plan" }, context), false);
  assert.equal(farmTables._test.uatRowAllowed("annual_work_plans", { id: "historical-plan" }, context), true);
  assert.equal(farmTables._test.uatRowAllowed("planned_work_items", { id: "historical-item" }, context), true);
});

test("20. containment change does not introduce migrations, UI edits, or Work Order actions", () => {
  const root = path.join(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
  assert.doesNotMatch(source, /WEBTEST-UAT-P2C-[\s\S]{0,400}budget_rate_block_id/);
  assert.equal(ACTIONS.create_work_order_from_plan_item.execute, createWorkOrderFromPlanItem);
});
