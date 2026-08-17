const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

const farmActions = require("../api/farm-actions");
const farmBudgetSync = require("../api/farm-budget-sync");
const farmTables = require("../api/farm-tables");
const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");

function materialUnitHarness() {
  const start = appSource.indexOf("const FARM_MATERIAL_UNIT_NO_UNIT_MESSAGE");
  const end = appSource.indexOf("function renderFarmActivitiesBoard", start);
  assert.ok(start >= 0 && end > start, "material unit helpers must remain inspectable");
  const sandbox = { esc: (value) => String(value ?? "") };
  vm.runInNewContext(`${appSource.slice(start, end)}
result = {
  FARM_MATERIAL_UNIT_NO_UNIT_MESSAGE,
  farmMaterialUnitModel,
  farmMaterialUnitOptions,
  farmMaterialUnitStatus,
  farmMaterialUnitName,
};`, sandbox);
  return sandbox.result;
}

function materialUnitFixture() {
  const ids = Object.fromEntries([
    "kg", "kgDuplicate", "bag", "gram", "rai", "unrelated",
    "baseOnly", "skuMaterial", "globalMaterial", "noUnitMaterial",
  ].map((key) => [key, randomUUID()]));
  const units = [
    { id: ids.kg, unit_code: "INTERNAL-KG", unit_name: "กิโลกรัม", status: "active" },
    { id: ids.kgDuplicate, unit_code: "INTERNAL-KG-DUP", unit_name: "กิโลกรัม", status: "active" },
    { id: ids.bag, unit_code: "INTERNAL-BAG-25", unit_name: "กระสอบ 25 กก.", status: "active" },
    { id: ids.gram, unit_code: "INTERNAL-G", unit_name: "กรัม", status: "active" },
    { id: ids.rai, unit_code: "INTERNAL-RAI", unit_name: "ไร่", status: "active" },
    { id: ids.unrelated, unit_code: "INTERNAL-OTHER", unit_name: "หน่วยอื่น", status: "active" },
  ];
  const materials = [
    { id: ids.baseOnly, material_code: "DYNAMIC-BASE", material_name: "Base only", base_unit_id: ids.kg, status: "active" },
    { id: ids.skuMaterial, material_code: "DYNAMIC-SKU", material_name: "SKU material", base_unit_id: ids.kg, status: "active" },
    { id: ids.globalMaterial, material_code: "DYNAMIC-GLOBAL", material_name: "Global conversion", base_unit_id: ids.kg, status: "active" },
    { id: ids.noUnitMaterial, material_code: "DYNAMIC-NONE", material_name: "No unit", base_unit_id: null, status: "active" },
  ];
  return { ids, units, materials };
}

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

test("Activity UI has no Material Standard management or draft-write entry point", () => {
  assert.match(appSource, /function renderFarmActivitiesBoard/);
  assert.doesNotMatch(appSource, /renderFarmMaterialStandard|farmMaterialStandardModal|data-material-standard/);
  assert.doesNotMatch(appSource, /มาตรฐานการใช้วัสดุ|เพิ่มมาตรฐานการใช้วัสดุ/);
  assert.doesNotMatch(appSource, /create_activity_material_standard_draft|update_activity_material_standard_draft/);
  const tableLoader = appSource.slice(
    appSource.indexOf("function farmDatabaseTablesForView"),
    appSource.indexOf("async function loadFarmTablesFromDatabase"),
  );
  assert.doesNotMatch(tableLoader, /activity_material_usage_rates/);
});

test("Planning material quantities use Budget relations and never Activity Standard fallback", () => {
  const planningStart = appSource.indexOf("function farmWorkOrderMaterialPlanRows");
  const planningEnd = appSource.indexOf("function farmNewUuid", planningStart);
  const createStart = appSource.indexOf("async function createFarmWorkPlanFromSelection");
  const createEnd = appSource.indexOf("async function saveFarmWorkPlanEditFromSelection", createStart);
  const editStart = createEnd;
  const editEnd = appSource.indexOf("function farmDispatchCandidateOrders", editStart);
  for (const source of [
    appSource.slice(planningStart, planningEnd),
    appSource.slice(createStart, createEnd),
    appSource.slice(editStart, editEnd),
  ]) {
    assert.match(source, /farmBudgetMaterialUsageRows/);
    assert.doesNotMatch(source, /activity_material_usage_rates|selectedUsageRate/);
  }
  assert.match(appSource.slice(planningStart, planningEnd), /planned_quantity: 0/);
});

test("unit dropdown labels use only units.unit_name while values remain units.id", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.baseOnly, "", {
    materials: fixture.materials,
    units: fixture.units,
  });
  const html = api.farmMaterialUnitOptions(model);
  assert.match(html, new RegExp(`value="${fixture.ids.kg}"`));
  assert.match(html, />กิโลกรัม<\/option>/);
  assert.doesNotMatch(html, /INTERNAL-KG|INTERNAL-BAG|unit_code/);
  assert.equal(html.replace(/<[^>]*>/g, ""), "กิโลกรัม");
});

test("base-unit-only Material exposes and auto-selects only its canonical base unit", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.baseOnly, "", {
    materials: fixture.materials,
    units: fixture.units,
    skuConversions: [],
    unitConversions: [],
  });
  assert.deepEqual(Array.from(model.units, (unit) => unit.id), [fixture.ids.kg]);
  assert.equal(model.selectedUnitId, fixture.ids.kg);
});

test("active Material SKU conversions add only their canonical endpoint units", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.skuMaterial, "", {
    materials: fixture.materials,
    units: fixture.units,
    skuConversions: [
      { material_id: fixture.ids.skuMaterial, from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.bag, status: "active" },
      { material_id: fixture.ids.skuMaterial, from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.unrelated, status: "inactive" },
      { material_id: fixture.ids.baseOnly, from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.rai, status: "active" },
    ],
  });
  assert.deepEqual(Array.from(model.units, (unit) => unit.id), [fixture.ids.kg, fixture.ids.bag]);
});

test("active unit conversions add only endpoints directly connected to Material canonical units", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.globalMaterial, "", {
    materials: fixture.materials,
    units: fixture.units,
    unitConversions: [
      { from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.gram, status: "active" },
      { from_unit_id: fixture.ids.bag, to_unit_id: fixture.ids.unrelated, status: "active" },
      { from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.rai, status: "inactive" },
    ],
  });
  assert.deepEqual(Array.from(model.units, (unit) => unit.id), [fixture.ids.kg, fixture.ids.gram]);
});

test("unrelated units and the global units fallback are prohibited", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.noUnitMaterial, "", {
    materials: fixture.materials,
    units: fixture.units,
    unitConversions: [
      { from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.gram, status: "active" },
    ],
  });
  assert.equal(model.units.length, 0);
  assert.equal(model.selectedUnitId, "");
  assert.equal(api.farmMaterialUnitStatus(model), "ยังไม่ได้กำหนดหน่วยสำหรับวัสดุนี้");
  assert.match(api.farmMaterialUnitOptions(model), />ยังไม่ได้กำหนดหน่วยสำหรับวัสดุนี้<\/option>/);
});

test("changing Material clears an incompatible unit when multiple compatible units remain", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.skuMaterial, fixture.ids.unrelated, {
    materials: fixture.materials,
    units: fixture.units,
    skuConversions: [
      { material_id: fixture.ids.skuMaterial, from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.bag, status: "active" },
    ],
  });
  assert.equal(model.selectedUnitId, "");
  assert.match(api.farmMaterialUnitOptions(model), /value="" selected>เลือกหน่วยมาตรฐาน/);
});

test("exactly one compatible unit safely auto-selects after Material reconciliation", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.baseOnly, fixture.ids.unrelated, {
    materials: fixture.materials,
    units: fixture.units,
  });
  assert.equal(model.selectedUnitId, fixture.ids.kg);
});

test("usage_basis remains calculation metadata and never adds a Material unit", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const material = fixture.materials.find((row) => row.id === fixture.ids.noUnitMaterial);
  const model = api.farmMaterialUnitModel(material.id, "", {
    materials: [{ ...material, usage_basis: "per_rai" }],
    units: fixture.units,
  });
  assert.equal(model.units.some((unit) => unit.id === fixture.ids.rai), false);
  assert.equal(model.units.length, 0);
});

test("duplicate semantic unit names retain canonical identity and are never first-name guessed", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const duplicateMaterial = { id: randomUUID(), base_unit_id: fixture.ids.kgDuplicate, status: "active" };
  const model = api.farmMaterialUnitModel(duplicateMaterial.id, fixture.ids.kg, {
    materials: [duplicateMaterial],
    units: fixture.units,
  });
  assert.deepEqual(Array.from(model.units, (unit) => unit.id), [fixture.ids.kgDuplicate]);
  assert.equal(model.selectedUnitId, fixture.ids.kgDuplicate);
  assert.equal(model.units[0].unit_name, "กิโลกรัม");
});

test("canonical unit IDs deduplicate across base, SKU, and unit-conversion relationships", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const model = api.farmMaterialUnitModel(fixture.ids.skuMaterial, fixture.ids.kg, {
    materials: fixture.materials,
    units: fixture.units,
    skuConversions: [
      { material_id: fixture.ids.skuMaterial, from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.bag, status: "active" },
      { material_id: fixture.ids.skuMaterial, from_unit_id: fixture.ids.bag, to_unit_id: fixture.ids.kg, status: "active" },
    ],
    unitConversions: [
      { from_unit_id: fixture.ids.kg, to_unit_id: fixture.ids.bag, status: "active" },
    ],
  });
  assert.deepEqual(Array.from(model.units, (unit) => unit.id), [fixture.ids.kg, fixture.ids.bag]);
});

test("dangling canonical relationships report DATA QUALITY GAP without name or code guessing", () => {
  const api = materialUnitHarness();
  const fixture = materialUnitFixture();
  const missingUnitId = randomUUID();
  const material = { id: randomUUID(), base_unit_id: missingUnitId, status: "active" };
  const model = api.farmMaterialUnitModel(material.id, "", {
    materials: [material],
    units: fixture.units,
  });
  assert.equal(model.units.length, 0);
  assert.equal(model.dataQualityGap, true);
  assert.match(api.farmMaterialUnitStatus(model), /^DATA QUALITY GAP:/);
});
