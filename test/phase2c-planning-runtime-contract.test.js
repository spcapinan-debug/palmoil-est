const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260820090323_phase2c_planning_runtime_contract.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const farmActionsSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const farmTablesSource = fs.readFileSync(path.join(root, "api", "farm-tables.js"), "utf8");
const farmActions = require("../api/farm-actions");
const farmTables = require("../api/farm-tables");
const { databaseDomainError } = require("../lib/server/farm-api");

function sqlFunction(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const comment = migration.indexOf(`comment on function public.${name}`, start);
  const nextFunction = migration.indexOf("create or replace function public.", start + 1);
  const candidates = [comment, nextFunction].filter((value) => value > start);
  const end = Math.min(...candidates);
  assert.ok(Number.isFinite(end) && end > start, `${name} must have a bounded body`);
  return migration.slice(start, end);
}

const planGuard = sqlFunction("guard_canonical_annual_plan_mutation");
const itemGuard = sqlFunction("guard_canonical_planning_item_mutation");
const createPlan = sqlFunction("create_canonical_annual_work_plan");
const updatePlan = sqlFunction("update_canonical_annual_work_plan");
const approvePlan = sqlFunction("approve_canonical_annual_work_plan");
const deletePlan = sqlFunction("delete_canonical_annual_work_plan");
const createItem = sqlFunction("create_canonical_planned_work_item_snapshot");
const updateItem = sqlFunction("update_canonical_planned_work_item");
const deleteItem = sqlFunction("delete_canonical_planned_work_item");
const { ACTIONS, createWorkOrderFromPlanItem } = farmActions._test;

test("1. canonical Annual Plan create is draft only", () => {
  assert.match(createPlan, /'draft'/);
  assert.match(createPlan, /'canonical_budget'/);
  assert.match(createPlan, /approved_by,[\s\S]*approved_at,[\s\S]*values \([\s\S]*null,[\s\S]*'draft'/);
  assert.doesNotMatch(createPlan, /p_status/);
});

test("2. canonical Annual Plan create is idempotent", () => {
  assert.match(createPlan, /on conflict \(planning_request_key\)/);
  assert.match(createPlan, /'already_exists', true/);
  assert.match(createPlan, /'already_exists', false/);
  assert.match(migration, /planning_request_key = btrim\(planning_request_key\)/);
});

test("3. same Annual Plan request key with different input is rejected", () => {
  assert.match(createPlan, /v_plan\.plan_year is distinct from p_plan_year/);
  assert.match(createPlan, /v_plan\.plan_name is distinct from v_plan_name/);
  assert.match(createPlan, /PLANNING_REQUEST_KEY_REUSED/);
});

test("4. authenticated direct Annual Plan writes are denied", () => {
  assert.match(migration, /drop policy if exists "authenticated write annual_work_plans"/);
  assert.match(migration, /revoke all on table public\.annual_work_plans from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.annual_work_plans to authenticated/);
});

test("5. generic Annual Plan writes require an action", () => {
  assert.equal(farmTables._test.ACTION_ONLY_TABLES.has("annual_work_plans"), true);
  assert.match(farmTablesSource, /ACTION_REQUIRED/);
});

test("6. canonical Annual Plan header update is draft-only", () => {
  assert.match(updatePlan, /v_plan\.status is distinct from 'draft'[\s\S]*PLANNING_PLAN_FROZEN/);
  assert.match(updatePlan, /set plan_name = v_plan_name,[\s\S]*estate_id = p_estate_id,[\s\S]*note = v_note/);
});

test("7. canonical Annual Plan plan_year is immutable", () => {
  assert.match(planGuard, /old\.plan_year is distinct from new\.plan_year/);
  assert.match(planGuard, /PLANNING_PLAN_YEAR_IMMUTABLE/);
  assert.doesNotMatch(updatePlan, /set[\s\S]{0,300}plan_year\s*=/);
});

test("8. canonical Annual Plan source_type is immutable", () => {
  assert.match(planGuard, /old\.source_type is distinct from new\.source_type/);
  assert.match(planGuard, /PLANNING_PLAN_SOURCE_IMMUTABLE/);
  assert.doesNotMatch(updatePlan, /set[\s\S]{0,300}source_type\s*=/);
});

test("9. canonical Annual Plan request key is immutable", () => {
  assert.match(planGuard, /old\.planning_request_key is distinct from new\.planning_request_key/);
  assert.match(planGuard, /PLANNING_REQUEST_KEY_IMMUTABLE/);
});

test("10. approved canonical Annual Plans cannot return to draft", () => {
  assert.match(planGuard, /old\.status is distinct from 'draft'[\s\S]*PLANNING_PLAN_FROZEN/);
  assert.doesNotMatch(migration, /reopen_canonical|unapprove_canonical/);
});

test("11. approved canonical Annual Plans cannot be deleted", () => {
  assert.match(deletePlan, /v_plan\.status is distinct from 'draft'[\s\S]*PLANNING_PLAN_FROZEN/);
  assert.match(planGuard, /tg_op = 'DELETE'[\s\S]*old\.status is distinct from 'draft'/);
});

test("12. approval requires at least one Planned Item", () => {
  assert.match(approvePlan, /select count\(\*\)::integer[\s\S]*from public\.planned_work_items/);
  assert.match(approvePlan, /v_item_count = 0[\s\S]*PLANNING_PLAN_EMPTY/);
});

test("13. approval rejects mixed noncanonical children", () => {
  assert.match(approvePlan, /planned_item\.source_type is distinct from 'canonical_budget'/);
  assert.match(approvePlan, /PLANNING_CANONICAL_ITEM_REQUIRED/);
});

test("14. approval requires a complete canonical Material snapshot for every item", () => {
  assert.match(approvePlan, /not exists \([\s\S]*from public\.planned_work_materials material_snapshot/);
  for (const predicate of [
    "snapshot_source_type = 'canonical_budget_block_material'",
    "source_budget_rate_block_material_id is not null",
    "snapshot_usage_rate > 0",
    "snapshot_basis_quantity >= 0",
    "unit_id is not null",
    "planned_quantity >= 0",
    "snapshot_at is not null",
  ]) assert.match(approvePlan, new RegExp(predicate.replaceAll(".", "\\.")));
  assert.match(approvePlan, /PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE/);
});

test("15. approval requires farm.plan.approve server-side", () => {
  assert.equal(ACTIONS.approve_canonical_annual_work_plan.permission, "farm.plan.approve");
  assert.equal(ACTIONS.approve_canonical_annual_work_plan.confirmation, true);
});

test("16. a canonical Annual Plan rejects a noncanonical Planned Item", () => {
  assert.match(itemGuard, /v_plan\.source_type = 'canonical_budget'/);
  assert.match(itemGuard, /not v_item_is_complete_canonical/);
  assert.match(itemGuard, /PLANNING_CANONICAL_ITEM_REQUIRED/);
  const itemInsertTrigger = migration.slice(
    migration.indexOf("create trigger guard_canonical_planning_item_insert"),
    migration.indexOf("create trigger guard_canonical_planning_item_update"),
  );
  assert.doesNotMatch(itemInsertTrigger, /when \(/);
});

test("17. snapshot create requires a draft canonical parent Annual Plan", () => {
  assert.match(createItem, /annual_plan\.plan_year, annual_plan\.source_type, annual_plan\.status/);
  assert.match(createItem, /v_plan_source_type is distinct from 'canonical_budget'/);
  assert.match(createItem, /PLANNING_CANONICAL_PLAN_REQUIRED/);
  assert.match(createItem, /v_plan_status is distinct from 'draft'/);
});

test("17a. canonical Planned Item create action makes status server-controlled", () => {
  const params = ACTIONS.create_canonical_planned_work_item_snapshot.params({
    annual_plan_id: "11111111-1111-4111-8111-111111111111",
    budget_year_id: "budget-year",
    budget_activity_rate_id: "budget-activity-rate",
    budget_rate_block_id: "budget-rate-block",
    block_id: "22222222-2222-4222-8222-222222222222",
    activity_id: "33333333-3333-4333-8333-333333333333",
    status: "completed",
  }, { profile: { id: "44444444-4444-4444-8444-444444444444" } }, {
    idempotencyKey: "server-request-key",
  });
  assert.equal(params.p_status, "planned");
});

test("17b. canonical Planned Item RPC accepts and persists only planned status", () => {
  assert.match(createItem, /v_normalized_status text := lower\(nullif\(btrim\(p_status\), ''\)\)/);
  assert.match(createItem, /if v_normalized_status is distinct from 'planned' then[\s\S]*PLANNING_ITEM_STATUS_INVALID/);
  for (const status of ["draft", "approved", "completed", "foo"]) {
    assert.notEqual(status.trim().toLowerCase(), "planned");
  }
  assert.match(createItem, /or v_item\.status is distinct from 'planned'/);
  assert.doesNotMatch(createItem, /v_item\.status is distinct from p_status/);
  assert.match(createItem, /p_suggested_team_id,[\s\S]*'planned',[\s\S]*v_normalized_note,/);
});

test("18. draft canonical Planned Item metadata can be updated", () => {
  assert.match(updateItem, /v_plan\.status is distinct from 'draft'/);
  assert.match(updateItem, /update public\.planned_work_items/);
  for (const field of ["planned_start_date", "planned_end_date", "recurrence_type", "target_quantity", "planned_budget", "ap_code"]) {
    assert.match(updateItem, new RegExp(`${field} = p_${field}`));
  }
  assert.match(updateItem, /note = nullif\(btrim\(p_note\), ''\)/);
});

test("19. Planned Item Budget, Block, Activity, and request lineage is immutable through update", () => {
  const setClause = updateItem.slice(updateItem.indexOf("update public.planned_work_items"), updateItem.indexOf("returning * into v_item"));
  for (const field of [
    "annual_plan_id", "block_id", "activity_id", "source_budget_year_id",
    "source_budget_activity_rate_id", "source_budget_rate_block_id",
    "planning_request_key", "source_type",
  ]) assert.doesNotMatch(setClause, new RegExp(`${field}\\s*=`));
});

test("20. Planned Item metadata update does not refresh Materials", () => {
  assert.doesNotMatch(updateItem, /populate_canonical_planning_material_snapshot|delete from public\.planned_work_materials/);
  assert.match(updateItem, /'materials_refreshed', false/);
});

test("21. draft Planned Item delete removes its canonical Material set", () => {
  assert.match(deleteItem, /delete from public\.planned_work_materials/);
  assert.match(deleteItem, /where planned_work_item_id = p_planned_work_item_id/);
});

test("22. draft Planned Item delete removes its refresh ledger rows", () => {
  const ledgerDelete = deleteItem.indexOf("delete from public.planning_material_snapshot_requests");
  const materialDelete = deleteItem.indexOf("delete from public.planned_work_materials");
  assert.ok(ledgerDelete >= 0 && materialDelete > ledgerDelete);
});

test("23. a Planned Item referenced by a Work Order cannot be deleted", () => {
  const referenceCheck = deleteItem.indexOf("from public.work_orders work_order");
  const itemDelete = deleteItem.indexOf("delete from public.planned_work_items");
  assert.ok(referenceCheck >= 0 && itemDelete > referenceCheck);
  assert.match(deleteItem, /PLANNING_ITEM_HAS_WORK_ORDER/);
  assert.doesNotMatch(deleteItem, /delete from public\.work_orders/);
});

test("24. frozen Planned Items cannot be updated or deleted", () => {
  for (const rpc of [updateItem, deleteItem]) {
    assert.match(rpc, /v_plan\.status is distinct from 'draft'/);
    assert.match(rpc, /PLANNING_PLAN_FROZEN/);
  }
});

test("25. generic planned_work_items writes require an action", () => {
  assert.equal(farmTables._test.ACTION_ONLY_TABLES.has("planned_work_items"), true);
});

test("26. generic planned_work_materials writes require an action", () => {
  assert.equal(farmTables._test.ACTION_ONLY_TABLES.has("planned_work_materials"), true);
});

test("27. migration contains no historical Planned Item rewrite", () => {
  const schemaSection = migration.slice(0, migration.indexOf("create or replace function"));
  assert.doesNotMatch(schemaSection, /insert into public\.planned_work_items|update public\.planned_work_items|delete from public\.planned_work_items/);
  assert.doesNotMatch(migration, /where source_type = 'legacy_work_order'[\s\S]*(?:update|delete)/i);
});

test("28. migration contains no historical Annual Plan rewrite", () => {
  const schemaSection = migration.slice(0, migration.indexOf("create or replace function"));
  assert.doesNotMatch(schemaSection, /insert into public\.annual_work_plans|update public\.annual_work_plans|delete from public\.annual_work_plans/);
  assert.match(farmTablesSource, /"annual_work_plans"/);
});

test("29. Work Order data stays read-only to every new RPC", () => {
  for (const rpc of [createPlan, updatePlan, approvePlan, deletePlan, createItem, updateItem, deleteItem]) {
    assert.doesNotMatch(rpc, /insert into public\.work_orders|update public\.work_orders|delete from public\.work_orders/);
  }
  assert.match(deleteItem, /from public\.work_orders work_order/);
});

test("30. existing canonical create and refresh remain service-only actions", () => {
  for (const name of [
    "create_canonical_planned_work_item_snapshot",
    "refresh_canonical_planned_work_item_snapshot",
  ]) {
    assert.equal(ACTIONS[name].permission, "farm.plan.create");
    assert.equal(ACTIONS[name].rpc, name);
  }
  assert.match(migration, /revoke all on function public\.refresh_canonical_planned_work_item_snapshot\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated/);
});

test("server derives every Planning actor and database request key from authenticated context", () => {
  const actor = { profile: { id: "11111111-1111-4111-8111-111111111111" } };
  const context = { idempotencyKey: "server-idempotency-key" };
  const planParams = ACTIONS.create_canonical_annual_work_plan.params({
    plan_year: 2027,
    plan_name: "Canonical 2027",
    actor_profile_id: "22222222-2222-4222-8222-222222222222",
    request_key: "caller-key",
  }, actor, context);
  assert.equal(planParams.p_actor_profile_id, actor.profile.id);
  assert.equal(planParams.p_request_key, context.idempotencyKey);
  const refreshParams = ACTIONS.refresh_canonical_planned_work_item_snapshot.params({
    planned_work_item_id: "33333333-3333-4333-8333-333333333333",
    actor_profile_id: "22222222-2222-4222-8222-222222222222",
    refresh_request_key: "caller-key",
  }, actor, context);
  assert.equal(refreshParams.p_actor_profile_id, actor.profile.id);
  assert.equal(refreshParams.p_refresh_request_key, context.idempotencyKey);
});

test("draft mutations use farm.plan.create and destructive actions require confirmation", () => {
  for (const name of [
    "create_canonical_annual_work_plan",
    "update_canonical_annual_work_plan",
    "delete_canonical_annual_work_plan",
    "create_canonical_planned_work_item_snapshot",
    "update_canonical_planned_work_item",
    "refresh_canonical_planned_work_item_snapshot",
    "delete_canonical_planned_work_item",
  ]) assert.equal(ACTIONS[name].permission, "farm.plan.create");
  for (const name of [
    "delete_canonical_annual_work_plan",
    "delete_canonical_planned_work_item",
  ]) assert.equal(ACTIONS[name].confirmation, true);
});

test("Phase 2C stable database errors map without leaking SQL internals", () => {
  for (const [code, status] of [
    ["PLANNING_REQUEST_KEY_INVALID", 400],
    ["PLANNING_PLAN_FROZEN", 403],
    ["PLANNING_ANNUAL_PLAN_NOT_FOUND", 404],
    ["PLANNING_REQUEST_KEY_REUSED", 409],
    ["PLANNING_ITEM_HAS_WORK_ORDER", 409],
  ]) {
    const error = databaseDomainError({ code: "P0001", message: code });
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.equal(error.details.postgresCode, "P0001");
  }
  const statusError = databaseDomainError({ code: "P0001", message: "PLANNING_ITEM_STATUS_INVALID" });
  assert.equal(statusError.status, 400);
  assert.equal(statusError.code, "PLANNING_ITEM_STATUS_INVALID");
  assert.doesNotMatch(statusError.message, /sql|postgres/i);
});

function workOrderHarness({ itemSource = "legacy_work_order", planSource = "legacy_work_order", planStatus = "approved" } = {}) {
  const calls = [];
  const itemId = "55555555-5555-4555-8555-555555555555";
  const planId = "66666666-6666-4666-8666-666666666666";
  const blockId = "77777777-7777-4777-8777-777777777777";
  const rest = async (requestPath, options = {}) => {
    const method = options.method || "GET";
    calls.push({ path: requestPath, method });
    if (requestPath.startsWith("planned_work_items?")) {
      return { data: [{
        id: itemId, annual_plan_id: planId, source_type: itemSource, block_id: blockId,
        plot_id: null, ap_code: null, activity_id: null, planned_start_date: null,
        suggested_team_id: null, target_quantity: null, target_unit: null,
        planned_budget: 0, note: null,
      }] };
    }
    if (requestPath.startsWith("annual_work_plans?")) {
      return { data: [{
        id: planId, plan_year: 2027, estate_id: null, status: planStatus, source_type: planSource,
      }] };
    }
    if (requestPath.startsWith("work_orders?")) return { data: [] };
    if (requestPath.startsWith("blocks?")) return { data: [{ id: blockId }] };
    if (requestPath === "work_orders" && method === "POST") {
      return { data: [{ id: "88888888-8888-4888-8888-888888888888", status: "draft" }] };
    }
    throw new Error(`Unexpected request: ${method} ${requestPath}`);
  };
  return { calls, itemId, rest };
}

test("canonical Planned Items are rejected before every Work Order mutation", async () => {
  const harness = workOrderHarness({ itemSource: "canonical_budget", planSource: "legacy_work_order" });
  await assert.rejects(
    createWorkOrderFromPlanItem({
      args: { planned_work_item_id: harness.itemId },
      actor: { profile: { id: "99999999-9999-4999-8999-999999999999" } },
    }, { rest: harness.rest }),
    (error) => error.status === 409
      && error.code === "PLANNING_CANONICAL_WORK_ORDER_NOT_READY"
      && /Phase 2D/.test(error.message),
  );
  assert.deepEqual(harness.calls.map(({ method }) => method), ["GET", "GET"]);
  for (const table of ["work_orders", "work_order_workers", "work_order_materials", "planned_work_items"]) {
    assert.equal(harness.calls.some((call) => call.path === table && call.method !== "GET"), false, table);
  }
});

test("a canonical parent Annual Plan blocks Work Order creation regardless of status", async () => {
  for (const planStatus of ["draft", "approved"]) {
    const harness = workOrderHarness({ itemSource: "manual", planSource: "canonical_budget", planStatus });
    await assert.rejects(
      createWorkOrderFromPlanItem({
        args: { planned_work_item_id: harness.itemId },
        actor: { profile: { id: "99999999-9999-4999-8999-999999999999" } },
      }, { rest: harness.rest }),
      (error) => error.status === 409 && error.code === "PLANNING_CANONICAL_WORK_ORDER_NOT_READY",
    );
    assert.deepEqual(harness.calls.map(({ method }) => method), ["GET", "GET"]);
  }
});

test("legacy and noncanonical Planned Items retain Work Order creation", async () => {
  for (const itemSource of ["legacy_work_order", "web_test", "manual"]) {
    const harness = workOrderHarness({ itemSource, planSource: itemSource });
    const result = await createWorkOrderFromPlanItem({
      args: { planned_work_item_id: harness.itemId },
      actor: { profile: { id: "99999999-9999-4999-8999-999999999999" }, roles: new Set() },
    }, { rest: harness.rest });
    assert.equal(result.already_exists, false);
    assert.equal(harness.calls.some((call) => call.path === "work_orders" && call.method === "POST"), true);
  }
});

test("all lifecycle RPCs are SECURITY INVOKER with empty search_path and service-only grants", () => {
  for (const rpc of [createPlan, updatePlan, approvePlan, deletePlan, createItem, updateItem, deleteItem, planGuard, itemGuard]) {
    assert.match(rpc, /security invoker/);
    assert.match(rpc, /set search_path = ''/);
    assert.doesNotMatch(rpc, /security definer/);
  }
  for (const name of [
    "create_canonical_annual_work_plan",
    "update_canonical_annual_work_plan",
    "approve_canonical_annual_work_plan",
    "delete_canonical_annual_work_plan",
    "update_canonical_planned_work_item",
    "delete_canonical_planned_work_item",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to service_role`));
  }
});

test("Planning UI remains untouched by the runtime-contract phase", () => {
  assert.doesNotMatch(farmActionsSource, /renderFarmWorkPlanner|createFarmWorkPlanFromSelection|saveFarmWorkPlanEditFromSelection/);
});
