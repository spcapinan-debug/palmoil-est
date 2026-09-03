const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmBudgetCleanup = require("../api/farm-budget-cleanup");
const farmTables = require("../api/farm-tables");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const cleanupSource = fs.readFileSync(path.join(root, "api", "farm-budget-cleanup.js"), "utf8");
const HEADER_ID = "budget-rate-mr5338gy-1";
const BLOCK_RATE_ID = "budget-block-budget-rate-mr5338gy-1-block-15";
const CANONICAL_ID = "33333333-3333-4333-8333-333333333333";

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

function apiRequest(method, url, body) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return {
    method,
    url,
    headers: { authorization: "Bearer user-access-token" },
    async *[Symbol.asyncIterator]() {
      if (raw) yield Buffer.from(raw);
    },
  };
}

async function withProtectedBudgetApi(run) {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mutations = [];
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
    global.fetch = async (url, options = {}) => {
      const text = String(url);
      if (text.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
      }
      const resource = text.split("/rest/v1/")[1]?.split("?")[0] || "";
      if (["POST", "DELETE"].includes(options.method) && ["budget_activity_rates", "budget_rate_blocks"].includes(resource)) {
        mutations.push({ resource, method: options.method });
      }
      if (resource === "profiles") {
        return new Response(JSON.stringify([{ id: "user-1", status: "active", role: "super_admin" }]), { status: 200 });
      }
      if (["profile_roles", "user_access_scopes"].includes(resource)) {
        return new Response("[]", { status: 200 });
      }
      if (resource === "budget_rate_blocks") {
        return new Response(JSON.stringify([{ id: BLOCK_RATE_ID, budget_rate_id: HEADER_ID }]), { status: 200 });
      }
      if (resource === "budget_rate_block_materials") {
        return new Response(JSON.stringify([{ id: CANONICAL_ID, budget_rate_block_id: BLOCK_RATE_ID }]), { status: 200 });
      }
      if (resource === "budget_rate_materials") {
        return new Response(JSON.stringify([{ id: "legacy-material-1", budget_rate_id: HEADER_ID }]), {
          status: 200,
          headers: { "content-range": "0-0/1" },
        });
      }
      return new Response("[]", { status: 200, headers: { "content-range": "0-0/0" } });
    };
    farmTables._test.clearCache();
    await run(mutations);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    farmTables._test.clearCache();
  }
}

async function assertCleanupMethodIsInert(method) {
  const previousFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("disabled cleanup must not call Supabase");
  };
  try {
    const res = responseRecorder();
    await farmBudgetCleanup({ method }, res);
    assert.equal(res.statusCode, 410);
    assert.equal(res.body.error.code, "BUDGET_CLEANUP_DISABLED");
    assert.equal(fetchCalls, 0);
    assert.doesNotMatch(cleanupSource, /SUPABASE_|fetch\(|budget_rate_|est_master_records/);
  } finally {
    global.fetch = previousFetch;
  }
}

test("A. legacy Budget cleanup GET is inert and cannot access Supabase", async () => {
  await assertCleanupMethodIsInert("GET");
});

test("B. legacy Budget cleanup POST is inert and cannot access Supabase", async () => {
  await assertCleanupMethodIsInert("POST");
});

test("legacy Budget cleanup rejects unsupported methods without database access", async () => {
  const res = responseRecorder();
  await farmBudgetCleanup({ method: "DELETE" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error.code, "METHOD_NOT_ALLOWED");
  assert.equal(res.headers.Allow, "GET, POST");
});

test("legacy Budget header update is blocked before any upsert", async () => {
  await withProtectedBudgetApi(async (mutations) => {
    const res = responseRecorder();
    await farmTables(apiRequest("POST", "/api/farm-tables", {
      table: "budget_activity_rates",
      row: { id: HEADER_ID, rate_code: "LEGACY-RATE" },
    }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, farmTables._test.CANONICAL_BUDGET_PROTECTION_CODE);
    assert.equal(mutations.length, 0);
  });
});

test("legacy Budget Block replacement is blocked before validation or upsert", async () => {
  await withProtectedBudgetApi(async (mutations) => {
    const res = responseRecorder();
    await farmTables(apiRequest("POST", "/api/farm-tables", {
      table: "budget_rate_blocks",
      row: { id: BLOCK_RATE_ID, budget_rate_id: HEADER_ID },
    }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, "CANONICAL_BUDGET_BLOCK_MATERIAL_PROTECTED");
    assert.equal(mutations.length, 0);
  });
});

test("legacy Budget Block and header deletes cannot cascade canonical children", async () => {
  await withProtectedBudgetApi(async (mutations) => {
    for (const [table, id] of [["budget_rate_blocks", BLOCK_RATE_ID], ["budget_activity_rates", HEADER_ID]]) {
      const res = responseRecorder();
      await farmTables(apiRequest("DELETE", "/api/farm-tables", { table, id }), res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error.code, "CANONICAL_BUDGET_BLOCK_MATERIAL_PROTECTED");
    }
    assert.equal(mutations.length, 0);
  });
});

test("legacy Budget reads remain available", async () => {
  await withProtectedBudgetApi(async () => {
    const res = responseRecorder();
    await farmTables(apiRequest("GET", "/api/farm-tables?tables=budget_rate_materials&refresh=1"), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.tables.budget_rate_materials.length, 1);
  });
});

test("frontend preserves the protected Budget row until server delete succeeds", () => {
  const start = appSource.indexOf("async function deleteFarmRow(");
  const end = appSource.indexOf("const FARM_WORK_ORDER_LOCK_STATUSES", start);
  const source = appSource.slice(start, end);
  const serverDelete = source.indexOf("if (shouldDeleteOnline) await deleteFarmRowFromDatabase");
  const deferredLocalDelete = source.indexOf("if (deferLocalDelete) applyLocalDelete()", serverDelete);
  assert.match(source, /table\.key === "budget_activity_rates"/);
  assert.ok(serverDelete >= 0 && deferredLocalDelete > serverDelete);
  assert.match(source, /farmBudgetLegacyMutationErrorMessage\(error, "ลบไม่สำเร็จ"\)/);
  assert.match(appSource, /error\.code = payload\?\.error\?\.code/);
});

test("H. containment does not introduce Activity Material Standard fallback into Planning", () => {
  const planningStart = appSource.indexOf("function farmWorkOrderMaterialPlanRows");
  const planningEnd = appSource.indexOf("function farmNewUuid", planningStart);
  const planningSource = appSource.slice(planningStart, planningEnd);
  assert.doesNotMatch(planningSource, /activity_material_usage_rates/);
});

test("I. Activity Master still has no Material Rate management", () => {
  assert.doesNotMatch(appSource, /renderFarmMaterialStandard|farmMaterialStandardModal|data-material-standard/);
});
