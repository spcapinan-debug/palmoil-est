const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260817152557_phase2b_budget_block_material_rates.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const tableDefinition = migration.match(
  /create table if not exists public\.budget_rate_block_materials \(([\s\S]*?)\n\);/i,
)?.[1] || "";

test("Phase 2B1 creates the canonical Block Material Budget table and FKs", () => {
  assert.ok(tableDefinition, "canonical table definition must be inspectable");
  assert.match(tableDefinition, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(
    tableDefinition,
    /budget_rate_block_id text not null[\s\S]*references public\.budget_rate_blocks\(id\) on delete cascade/i,
  );
  assert.match(
    tableDefinition,
    /material_id uuid not null[\s\S]*references public\.materials\(id\) on delete restrict/i,
  );
  assert.match(
    tableDefinition,
    /unit_id uuid not null[\s\S]*references public\.units\(id\) on delete restrict/i,
  );
  assert.doesNotMatch(tableDefinition, /\busage_unit\s+text\b/i);
});

test("canonical rate, cost, basis, status, uniqueness, and lineage are constrained", () => {
  assert.match(tableDefinition, /check \(usage_rate > 0\)/i);
  assert.match(tableDefinition, /check \(unit_cost is null or unit_cost >= 0\)/i);
  assert.match(
    tableDefinition,
    /check \(usage_basis in \('tree_count', 'area_rai', 'manual_qty', 'bag_count'\)\)/i,
  );
  assert.match(tableDefinition, /check \(status in \('active', 'inactive'\)\)/i);
  assert.match(tableDefinition, /unique \(budget_rate_block_id, material_id\)/i);
  assert.match(
    tableDefinition,
    /source_budget_rate_material_id text[\s\S]*references public\.budget_rate_materials\(id\) on delete set null/i,
  );
});

test("canonical table has focused lookup indexes and read-only browser access", () => {
  for (const column of [
    "budget_rate_block_id",
    "material_id",
    "unit_id",
    "source_budget_rate_material_id",
  ]) {
    assert.match(
      migration,
      new RegExp(`create index if not exists [^\\n]+[\\s\\S]*?\\(${column}\\)`, "i"),
    );
  }
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /for select to authenticated using \(true\)/i);
  assert.match(migration, /revoke insert, update, delete[\s\S]*from authenticated/i);
  assert.match(migration, /grant select[\s\S]*to authenticated/i);
  assert.match(migration, /grant all[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /for (?:all|insert|update|delete) to authenticated/i);
});

test("backfill preserves the current Block cross Material semantics", () => {
  assert.match(
    migration,
    /from public\.budget_rate_blocks brb[\s\S]*join public\.budget_activity_rates bar[\s\S]*bar\.id = brb\.budget_rate_id[\s\S]*join public\.budget_rate_materials brm[\s\S]*brm\.budget_rate_id = bar\.id/i,
  );
  assert.match(
    migration,
    /brm\.usage_quantity,[\s\S]*resolved\.unit_id,[\s\S]*brm\.unit_cost,[\s\S]*brm\.amount_per_basis,[\s\S]*brm\.id/i,
  );
  assert.match(migration, /on conflict \(budget_rate_block_id, material_id\) do nothing/i);
});

test("unit resolution is Material-compatible, deterministic, and fail-safe", () => {
  assert.match(migration, /m\.base_unit_id as unit_id/i);
  assert.match(migration, /from public\.sku_conversions sc[\s\S]*sc\.status = 'active'/i);
  assert.match(
    migration,
    /join public\.unit_conversions uc[\s\S]*uc\.status = 'active'[\s\S]*uc\.from_unit_id = a\.unit_id or uc\.to_unit_id = a\.unit_id/i,
  );
  assert.match(
    migration,
    /join material_compatible_units compatible[\s\S]*compatible\.material_id = brm\.material_id/i,
  );
  assert.match(
    migration,
    /lower\(btrim\(u\.unit_name\)\) = lower\(btrim\(brm\.usage_unit\)\)/i,
  );
  assert.match(migration, /where candidate_count <> 1/i);
  assert.match(migration, /raise exception using[\s\S]*ambiguous or unmapped/i);
  assert.match(migration, /having count\(distinct matches\.unit_id\) = 1/i);
  assert.doesNotMatch(migration, /order by[^;]*limit 1/i);
  assert.doesNotMatch(
    migration,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  );
});

test("migration is additive and leaves prohibited legacy/runtime tables untouched", () => {
  assert.doesNotMatch(migration, /\bdrop\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\btruncate\s+table\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /work_order_materials/i);
  assert.doesNotMatch(migration, /planned_work_materials/i);
  assert.doesNotMatch(migration, /activity_material_usage_rates/i);
});
