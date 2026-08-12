const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmActions = require("../api/farm-actions");
const farmBudgetSync = require("../api/farm-budget-sync");
const farmTables = require("../api/farm-tables");

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

function request(authenticated = true) {
  return { method: "POST", headers: authenticated ? { authorization: "Bearer token" } : {}, socket: {} };
}

async function withServerActor({ role = "worker", permissions = [] } = {}, run) {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  try {
    global.fetch = async (url, options = {}) => {
      const text = String(url);
      if (text.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 200 });
      const resource = text.split("/rest/v1/")[1]?.split("?")[0] || "";
      if (resource === "profiles") return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", status: "active", role }]), { status: 200 });
      if (resource === "profile_roles" || resource === "user_access_scopes") return new Response("[]", { status: 200 });
      if (resource === "audit_logs") return new Response("[]", { status: 201 });
      if (resource === "permissions") return new Response(JSON.stringify(permissions.map((permission_key) => ({ permission_key }))), { status: 200 });
      return new Response("[]", { status: options.method === "POST" ? 201 : 200 });
    };
    await run();
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
}

test("legacy Budget JSON sync is authenticated, authorized, audited, and disabled", async () => {
  await withServerActor({}, async () => {
    const unauthenticated = responseRecorder();
    await farmBudgetSync(request(false), unauthenticated);
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(unauthenticated.body.error.code, "AUTH_REQUIRED");

    const forbidden = responseRecorder();
    await farmBudgetSync(request(), forbidden);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.body.error.code, "FORBIDDEN");
  });

  await withServerActor({ role: "super_admin" }, async () => {
    const allowed = responseRecorder();
    await farmBudgetSync(request(), allowed);
    assert.equal(allowed.statusCode, 410);
    assert.equal(allowed.body.error.code, "BUDGET_SYNC_DISABLED");
    assert.doesNotMatch(JSON.stringify(allowed.body), /server-only-test-key|SUPABASE_SERVICE_ROLE_KEY/i);
  });
});

test("canonical Activity Material Standard mutations are action-only", () => {
  assert.equal(farmTables._test.ACTION_ONLY_TABLES.has("activity_material_usage_rates"), true);
  for (const action of [
    "create_activity_material_standard_draft",
    "update_activity_material_standard_draft",
    "approve_activity_material_standard",
    "inactivate_activity_material_standard",
  ]) {
    assert.equal(farmActions._test.ACTIONS[action].permission, "performance.standard.manage");
  }
  assert.equal(farmActions._test.ACTIONS.approve_activity_material_standard.confirmation, true);
  assert.equal(farmActions._test.ACTIONS.inactivate_activity_material_standard.confirmation, true);
});

test("canonical standard validation requires IDs, positive rate, known basis, year, and valid dates", () => {
  const valid = {
    activity_id: "11111111-1111-4111-8111-111111111111",
    material_id: "22222222-2222-4222-8222-222222222222",
    unit_id: "33333333-3333-4333-8333-333333333333",
    fiscal_year: "2569",
    usage_basis: "per_tree",
    usage_rate: 2,
    effective_start_date: "2026-01-01",
  };
  assert.equal(farmActions._test.activityMaterialStandardInput(valid).usage_unit, null);
  assert.throws(() => farmActions._test.activityMaterialStandardInput({ ...valid, usage_basis: "per_ton" }), /canonical basis/);
  assert.throws(() => farmActions._test.activityMaterialStandardInput({ ...valid, usage_rate: 0 }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => farmActions._test.activityMaterialStandardInput({ ...valid, fiscal_year: "FY69" }), /four digits/);
  assert.throws(() => farmActions._test.activityMaterialStandardInput({ ...valid, effective_end_date: "2025-12-31" }), /must not precede/);
});

test("effective-period overlap uses inclusive open-ended ranges", () => {
  const overlap = farmActions._test.standardPeriodsOverlap;
  assert.equal(overlap({ effective_start_date: "2026-01-01", effective_end_date: null }, { effective_start_date: "2027-01-01", effective_end_date: null }), true);
  assert.equal(overlap({ effective_start_date: "2026-01-01", effective_end_date: "2026-06-30" }, { effective_start_date: "2026-06-30", effective_end_date: "2026-12-31" }), true);
  assert.equal(overlap({ effective_start_date: "2026-01-01", effective_end_date: "2026-06-29" }, { effective_start_date: "2026-06-30", effective_end_date: null }), false);
});

test("migration is additive, contains no data rewrite, and hardens grants and overlap", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260812124141_phase2a_activity_material_standard.sql"), "utf8");
  assert.match(migration, /alter table public\.activity_material_usage_rates/);
  assert.match(migration, /references public\.units\(id\)/);
  assert.match(migration, /exclude using gist/);
  assert.match(migration, /revoke insert, update, delete/);
  assert.match(migration, /grant select .* authenticated/s);
  assert.doesNotMatch(migration, /\bdrop\b/i);
  assert.doesNotMatch(migration, /\b(update|delete|insert into)\s+public\./i);
  assert.doesNotMatch(migration, /(?:alter table|update|delete from|insert into)\s+public\.(?:work_order_materials|planned_work_materials|budget_activity_rates)/i);
});

test("Activity UI has canonical form and no fake material standard seed", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
  assert.match(source, /renderFarmMaterialStandardSection/);
  assert.match(source, /data-material-standard-new/);
  assert.match(source, /create_activity_material_standard_draft/);
  assert.doesNotMatch(source, /usage-fert-tree/);
});
