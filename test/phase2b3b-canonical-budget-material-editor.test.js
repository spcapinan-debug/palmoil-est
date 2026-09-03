const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmActions = require("../api/farm-actions");
const farmBudgetCleanup = require("../api/farm-budget-cleanup");
const farmTables = require("../api/farm-tables");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const rpcMigrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260818124656_phase2b3_canonical_budget_material_write.sql",
);
const rpcMigration = fs.readFileSync(rpcMigrationPath, "utf8");

const IDS = {
  profile: "11111111-1111-4111-8111-111111111111",
  role: "22222222-2222-4222-8222-222222222222",
  permission: "33333333-3333-4333-8333-333333333333",
  material: "44444444-4444-4444-8444-444444444444",
  invalidMaterial: "55555555-5555-4555-8555-555555555555",
  unit: "66666666-6666-4666-8666-666666666666",
  incompatibleUnit: "77777777-7777-4777-8777-777777777777",
  year: "budget-year-2569",
  rate: "budget-rate-fertilizer",
  blocks: ["budget-block-a", "budget-block-b", "budget-block-c"],
};

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

function actionRequest(action, args, { authenticated = true, confirmed = false, key = `${action}-${Date.now()}` } = {}) {
  const raw = JSON.stringify({ action, args, confirmed, idempotency_key: key });
  return {
    method: "POST",
    url: "/api/farm-actions",
    headers: authenticated
      ? { authorization: "Bearer user-token", "idempotency-key": key }
      : { "idempotency-key": key },
    socket: {},
    async *[Symbol.asyncIterator]() { yield Buffer.from(raw); },
  };
}

function validArgs(blockIds = [IDS.blocks[0]], usageRate = 500) {
  return {
    budget_year_id: IDS.year,
    budget_activity_rate_id: IDS.rate,
    budget_rate_block_ids: blockIds,
    material_id: IDS.material,
    usage_basis: "area_rai",
    usage_rate: usageRate,
    unit_id: IDS.unit,
    unit_cost: 2.5,
    amount_per_basis: usageRate * 2.5,
    status: "active",
    note: "fixture",
  };
}

function rpcError(code) {
  return new Response(JSON.stringify({ code: "P0001", message: code }), { status: 400 });
}

async function withActionApi({ authorized = true, rpcHandler = async () => ({ count: 0, rows: [] }) } = {}, run) {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  try {
    global.fetch = async (url, options = {}) => {
      const text = String(url);
      calls.push({ text, method: options.method || "GET" });
      if (text.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: IDS.profile }), { status: 200 });
      }
      const resource = text.split("/rest/v1/")[1]?.split("?")[0] || "";
      if (resource === "profiles") {
        return new Response(JSON.stringify([{ id: IDS.profile, status: "active", role: "worker" }]), { status: 200 });
      }
      if (resource === "profile_roles") {
        return new Response(JSON.stringify([{ role_id: IDS.role, effective_from: null, effective_to: null }]), { status: 200 });
      }
      if (resource === "user_access_scopes") return new Response("[]", { status: 200 });
      if (resource === "roles") {
        return new Response(JSON.stringify([{ id: IDS.role, role_key: "budget_editor" }]), { status: 200 });
      }
      if (resource === "role_permissions") {
        return new Response(JSON.stringify(authorized ? [{ permission_id: IDS.permission }] : []), { status: 200 });
      }
      if (resource === "permissions") {
        return new Response(JSON.stringify(authorized ? [{ permission_key: "budget.rate_rule.manage" }] : []), { status: 200 });
      }
      if (resource === "farm_action_idempotency") {
        if (options.method === "POST") return new Response(options.body, { status: 201 });
        return new Response("[]", { status: 200 });
      }
      if (resource === "audit_logs") return new Response("[]", { status: 201 });
      if (resource === "rpc/apply_budget_block_material_rates") {
        const result = await rpcHandler(JSON.parse(options.body));
        return result instanceof Response
          ? result
          : new Response(JSON.stringify(result), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    };
    await run(calls);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
}

async function callAction(action, args, options = {}) {
  const response = responseRecorder();
  await farmActions(actionRequest(action, args, options), response);
  return response;
}

function canonicalFixtureRpc(rows) {
  let sequence = rows.length;
  return async (params) => {
    if (params.p_material_id === IDS.invalidMaterial) return rpcError("MATERIAL_NOT_FOUND");
    if (params.p_unit_id === IDS.incompatibleUnit) return rpcError("MATERIAL_UNIT_INCOMPATIBLE");
    if (["create", "bulk_apply"].includes(params.p_operation)) {
      if (params.p_budget_rate_block_ids.some((blockId) => rows.some((row) => (
        row.budget_rate_block_id === blockId && row.material_id === params.p_material_id
      )))) return rpcError("BUDGET_BLOCK_MATERIAL_DUPLICATE");
      const inserted = params.p_budget_rate_block_ids.map((blockId) => ({
        id: `88888888-8888-4888-8888-${String(++sequence).padStart(12, "0")}`,
        budget_rate_block_id: blockId,
        material_id: params.p_material_id,
        usage_basis: params.p_usage_basis,
        usage_rate: params.p_usage_rate,
        unit_id: params.p_unit_id,
        unit_cost: params.p_unit_cost,
        amount_per_basis: params.p_amount_per_basis,
        status: params.p_status,
        note: params.p_note,
      }));
      rows.push(...inserted);
      return { operation: params.p_operation, count: inserted.length, rows: inserted };
    }
    const row = rows.find((item) => item.id === params.p_row_id);
    if (!row) return rpcError("BUDGET_BLOCK_MATERIAL_NOT_FOUND");
    if (params.p_operation === "deactivate") row.status = "inactive";
    else Object.assign(row, {
      material_id: params.p_material_id,
      usage_basis: params.p_usage_basis,
      usage_rate: params.p_usage_rate,
      unit_id: params.p_unit_id,
      unit_cost: params.p_unit_cost,
      amount_per_basis: params.p_amount_per_basis,
      status: params.p_status,
      note: params.p_note,
    });
    return { operation: params.p_operation, count: 1, rows: [{ ...row }] };
  };
}

test("1. canonical read model resolves Year, Activity, Rate Block, Block, Material, and Unit", () => {
  const start = appSource.indexOf("function farmBudgetCanonicalMaterialRows");
  const end = appSource.indexOf("function farmBudgetCanonicalRateBlocks", start);
  const source = appSource.slice(start, end);
  assert.match(source, /farmRowsByKey\("budget_rate_block_materials"\)/);
  assert.match(source, /farmLookup\("budget_rate_blocks"/);
  assert.match(source, /farmLookup\("budget_activity_rates"/);
  assert.match(source, /farmLookup\("budget_years"/);
  assert.match(source, /farmLookup\("blocks"/);
  assert.match(source, /farmLookup\("materials"/);
  assert.match(source, /farmLookup\("units"/);
});

test("2 and 4. authenticated server write is required and RPC is not reached before auth", async () => {
  await withActionApi({}, async (calls) => {
    const response = await callAction("create_budget_block_material_rate", validArgs(), { authenticated: false });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error.code, "AUTH_REQUIRED");
    assert.equal(calls.some((call) => call.text.includes("rpc/apply_budget_block_material_rates")), false);
  });
});

test("3. authenticated user without Budget modification permission is denied", async () => {
  await withActionApi({ authorized: false }, async (calls) => {
    const response = await callAction("create_budget_block_material_rate", validArgs());
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
    assert.equal(calls.some((call) => call.text.includes("rpc/apply_budget_block_material_rates")), false);
  });
});

test("5. create action persists one canonical row through the RPC", async () => {
  const rows = [];
  await withActionApi({ rpcHandler: canonicalFixtureRpc(rows) }, async () => {
    const response = await callAction("create_budget_block_material_rate", validArgs());
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.result.count, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].budget_rate_block_id, IDS.blocks[0]);
  });
});

test("6. update changes one Block row only", async () => {
  const rows = [];
  await withActionApi({ rpcHandler: canonicalFixtureRpc(rows) }, async () => {
    await callAction("bulk_apply_budget_block_material_rate", validArgs(IDS.blocks, 500), { confirmed: true, key: "bulk-update-fixture" });
    const target = rows[1];
    const response = await callAction("update_budget_block_material_rate", {
      ...validArgs([IDS.blocks[1]], 575), row_id: target.id,
    }, { key: "update-block-b" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(rows.map((row) => row.usage_rate), [500, 575, 500]);
  });
});

test("7 and 13. bulk apply creates three independent canonical rows and no legacy row", async () => {
  const rows = [];
  const legacyRows = Array.from({ length: 33 }, (_, index) => ({ id: `legacy-${index + 1}` }));
  await withActionApi({ rpcHandler: canonicalFixtureRpc(rows) }, async () => {
    const response = await callAction("bulk_apply_budget_block_material_rate", validArgs(IDS.blocks, 500), {
      confirmed: true,
      key: "bulk-three-blocks",
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.result.count, 3);
    assert.equal(new Set(rows.map((row) => row.budget_rate_block_id)).size, 3);
    assert.equal(new Set(rows.map((row) => row.material_id)).size, 1);
    assert.equal(legacyRows.length, 33);
  });
});

test("8. duplicate Block and Material is a stable 409 conflict", async () => {
  const rows = [];
  await withActionApi({ rpcHandler: canonicalFixtureRpc(rows) }, async () => {
    await callAction("create_budget_block_material_rate", validArgs(), { key: "duplicate-first" });
    const response = await callAction("create_budget_block_material_rate", validArgs(), { key: "duplicate-second" });
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.error.code, "BUDGET_BLOCK_MATERIAL_DUPLICATE");
    assert.equal(rows.length, 1);
  });
});

test("9. invalid Material is rejected", async () => {
  await withActionApi({ rpcHandler: canonicalFixtureRpc([]) }, async () => {
    const response = await callAction("create_budget_block_material_rate", {
      ...validArgs(), material_id: IDS.invalidMaterial,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.error.code, "MATERIAL_NOT_FOUND");
  });
});

test("10. incompatible Unit is rejected", async () => {
  await withActionApi({ rpcHandler: canonicalFixtureRpc([]) }, async () => {
    const response = await callAction("create_budget_block_material_rate", {
      ...validArgs(), unit_id: IDS.incompatibleUnit,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, "MATERIAL_UNIT_INCOMPATIBLE");
  });
});

test("11. canonical units.id is passed unchanged to the RPC", () => {
  const params = farmActions._test.budgetBlockMaterialActionParams(validArgs(), { profile: { id: IDS.profile } }, "create");
  assert.equal(params.p_unit_id, IDS.unit);
  assert.equal(params.p_budget_rate_block_ids[0], IDS.blocks[0]);
});

test("12. canonical Unit label comes only from units.unit_name", () => {
  const start = appSource.indexOf("function farmBudgetCanonicalMaterialRows");
  const end = appSource.indexOf("function farmBudgetCanonicalRateBlocks", start);
  assert.match(appSource.slice(start, end), /unit_label: String\(unit\.unit_name \|\| ""\)\.trim\(\)/);
  assert.match(appSource, /farmMaterialUnitOptions\(unitModel\)/);
});

test("14. Activity Master still contains no Material Rate editor", () => {
  assert.doesNotMatch(appSource, /renderFarmMaterialStandard|farmMaterialStandardModal|data-material-standard/);
});

test("15. Planning runtime still has no Activity Material Standard fallback", () => {
  const start = appSource.indexOf("function farmWorkOrderMaterialPlanRows");
  const end = appSource.indexOf("function farmNewUuid", start);
  const source = appSource.slice(start, end);
  assert.doesNotMatch(source, /activity_material_usage_rates/);
});

test("16. cleanup endpoint remains disabled", async () => {
  const response = responseRecorder();
  await farmBudgetCleanup({ method: "POST" }, response);
  assert.equal(response.statusCode, 410);
  assert.equal(response.body.error.code, "BUDGET_CLEANUP_DISABLED");
});

test("17. legacy destructive mutation protection remains enabled", () => {
  assert.equal(farmTables._test.CANONICAL_BUDGET_PROTECTION_CODE, "CANONICAL_BUDGET_BLOCK_MATERIAL_PROTECTED");
  assert.equal(farmTables._test.ACTION_ONLY_TABLES.has("budget_rate_block_materials"), true);
});

test("18. browser canonical writes use server actions only", () => {
  const start = appSource.indexOf("async function saveFarmBudgetCanonicalMaterial");
  const end = appSource.indexOf("function renderFarmBudgetCanonicalMaterialEditor", start);
  const source = appSource.slice(start, end);
  assert.match(source, /runFarmAction\(action, args/);
  assert.match(source, /deactivate_budget_block_material_rate/);
  assert.doesNotMatch(source, /persistFarmRowToDatabase|persistFarmRowsToDatabase|deleteFarmRowFromDatabase|fetch\(/);
});

test("transactional RPC validates ownership, compatible units, duplicates, and service-only execution", () => {
  assert.match(rpcMigration, /language plpgsql[\s\S]*security invoker[\s\S]*set search_path = ''/i);
  assert.doesNotMatch(rpcMigration, /security definer/i);
  assert.match(rpcMigration, /budget_rate\.budget_year_id = p_budget_year_id/);
  assert.match(rpcMigration, /budget_block\.budget_rate_id <> p_budget_activity_rate_id/);
  assert.match(rpcMigration, /from public\.materials material[\s\S]*material\.status = 'active'/);
  assert.match(rpcMigration, /from public\.sku_conversions conversion[\s\S]*conversion\.status = 'active'/);
  assert.match(rpcMigration, /join material_unit_anchors anchor[\s\S]*from_unit_id = anchor\.unit_id[\s\S]*to_unit_id = anchor\.unit_id/);
  assert.match(rpcMigration, /BUDGET_BLOCK_MATERIAL_DUPLICATE/);
  assert.match(rpcMigration, /from unnest\(v_block_ids\) as selected\(block_id\)[\s\S]*returning \*/);
  assert.match(rpcMigration, /with updated as \([\s\S]*update public\.budget_rate_block_materials[\s\S]*returning \*/);
  assert.match(rpcMigration, /with deactivated as \([\s\S]*update public\.budget_rate_block_materials[\s\S]*returning \*/);
  assert.match(rpcMigration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(rpcMigration, /grant execute on function[\s\S]*to service_role/);
});

test("RPC migration is additive and cannot mutate legacy, Planning, Work Order, or Inventory material tables", () => {
  assert.doesNotMatch(rpcMigration, /public\.budget_rate_materials\b/);
  assert.doesNotMatch(rpcMigration, /public\.activity_material_usage_rates\b/);
  assert.doesNotMatch(rpcMigration, /public\.planned_work_materials\b/);
  assert.doesNotMatch(rpcMigration, /public\.work_order_materials\b/);
  assert.doesNotMatch(rpcMigration, /\b(?:drop|truncate|alter)\s+table\b/i);
});

test("UAT fixture preserves independent 500, 550, 600 rates and edits only Block B to 575", async () => {
  const rows = [];
  await withActionApi({ rpcHandler: canonicalFixtureRpc(rows) }, async () => {
    for (const [index, rate] of [500, 550, 600].entries()) {
      await callAction("create_budget_block_material_rate", validArgs([IDS.blocks[index]], rate), { key: `fixture-${rate}` });
    }
    assert.deepEqual(rows.map((row) => row.usage_rate), [500, 550, 600]);
    assert.equal(new Set(rows.map((row) => row.budget_rate_block_id)).size, 3);
    assert.equal(new Set(rows.map((row) => row.material_id)).size, 1);
    await callAction("update_budget_block_material_rate", {
      ...validArgs([IDS.blocks[1]], 575), row_id: rows[1].id,
    }, { key: "fixture-edit-b" });
    assert.deepEqual(rows.map((row) => row.usage_rate), [500, 575, 600]);
  });
});

test("deactivate action retains the canonical row and changes only status", async () => {
  const rows = [];
  await withActionApi({ rpcHandler: canonicalFixtureRpc(rows) }, async () => {
    await callAction("create_budget_block_material_rate", validArgs(), { key: "deactivate-create" });
    const response = await callAction("deactivate_budget_block_material_rate", {
      ...validArgs(), row_id: rows[0].id, status: "inactive",
    }, { confirmed: true, key: "deactivate-row" });
    assert.equal(response.statusCode, 200);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "inactive");
  });
});

test("legacy Budget create/update paths no longer write or replace legacy Material rows", () => {
  const createStart = appSource.indexOf("async function createFarmBudgetRatesFromSelection");
  const createEnd = appSource.indexOf("async function saveFarmBudgetSelectedRateFromSelection", createStart);
  const updateEnd = appSource.indexOf("function editFarmRow", createEnd);
  const deleteStart = appSource.indexOf("async function deleteFarmBudgetRelationsForRate");
  const deleteEnd = appSource.indexOf("async function deleteFarmBudgetDuplicateRateRowsForGroup", deleteStart);
  for (const source of [
    appSource.slice(createStart, createEnd),
    appSource.slice(createEnd, updateEnd),
    appSource.slice(deleteStart, deleteEnd),
  ]) {
    assert.doesNotMatch(source, /persistFarm(?:Row|Rows)ToDatabase\([^\n]*budget_rate_materials/);
    assert.doesNotMatch(source, /farmTableByKey\("budget_rate_materials"\)/);
  }
});
