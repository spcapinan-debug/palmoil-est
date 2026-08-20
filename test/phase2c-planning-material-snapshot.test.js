const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260820061813_phase2c_planning_material_snapshot.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

function sqlFunction(name, nextMarker = "comment on function") {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = migration.indexOf(nextMarker, start);
  assert.ok(end > start, `${name} must have a bounded body`);
  return migration.slice(start, end);
}

const populateRpc = sqlFunction("populate_canonical_planning_material_snapshot");
const createRpc = sqlFunction("create_canonical_planned_work_item_snapshot");
const refreshRpc = sqlFunction("refresh_canonical_planned_work_item_snapshot");

test("1. migration is one additive local Phase 2C transaction", () => {
  assert.match(migration, /^-- Phase 2C:/);
  assert.match(migration, /begin;[\s\S]*commit;\s*$/);
  assert.doesNotMatch(migration, /drop\s+table|truncate\s+table|alter\s+table[^;]+drop\s+column/i);
});

test("2. planned_work_items receives explicit canonical parent lineage and request key", () => {
  for (const column of [
    "source_budget_year_id text",
    "source_budget_activity_rate_id text",
    "source_budget_rate_block_id text",
    "planning_request_key text",
  ]) assert.match(migration, new RegExp(column));
  assert.match(migration, /planned_work_items_canonical_lineage_complete/);
});

test("3. canonical parent and material source FKs use ON DELETE RESTRICT", () => {
  for (const target of [
    "budget_years\\(id\\)",
    "budget_activity_rates\\(id\\)",
    "budget_rate_blocks\\(id\\)",
    "budget_rate_block_materials\\(id\\)",
  ]) {
    assert.match(migration, new RegExp(`references public\\.${target}\\s+on delete restrict`, "i"));
  }
});

test("4. planned_work_materials receives the complete canonical snapshot field set", () => {
  for (const column of [
    "source_budget_rate_block_material_id uuid",
    "snapshot_source_type text",
    "snapshot_usage_basis text",
    "snapshot_usage_rate numeric",
    "snapshot_basis_quantity numeric",
    "snapshot_unit_cost numeric",
    "snapshot_amount_per_basis numeric",
    "snapshot_at timestamptz",
  ]) assert.match(migration, new RegExp(column));
  assert.doesNotMatch(migration, /add column snapshot_unit_id|add column snapshot_planned_quantity/);
});

test("5. canonical rows conditionally require complete snapshot values without backfilling legacy rows", () => {
  const constraint = migration.slice(
    migration.indexOf("planned_work_materials_canonical_snapshot_complete"),
    migration.indexOf("create index planned_work_materials_source", migration.indexOf("planned_work_materials_canonical_snapshot_complete")),
  );
  assert.match(constraint, /snapshot_source_type is distinct from 'canonical_budget_block_material'/);
  for (const field of [
    "source_budget_rate_block_material_id is not null",
    "snapshot_usage_basis is not null",
    "snapshot_usage_rate is not null",
    "snapshot_basis_quantity is not null",
    "unit_id is not null",
    "snapshot_at is not null",
  ]) assert.match(constraint, new RegExp(field));
});

test("6. one planned item may contain each Material only once", () => {
  assert.match(migration, /unique \(planned_work_item_id, material_id\)/);
});

test("7. one planned item may contain each canonical source row only once", () => {
  assert.match(migration, /planned_work_materials_item_source_budget_material_uidx/);
  assert.match(migration, /where source_budget_rate_block_material_id is not null/);
});

test("8. numeric constraints reject negative quantities and costs", () => {
  for (const expression of [
    "planned_quantity >= 0",
    "estimated_unit_cost >= 0",
    "estimated_amount >= 0",
    "snapshot_usage_rate > 0",
    "snapshot_basis_quantity >= 0",
    "snapshot_unit_cost is null or snapshot_unit_cost >= 0",
    "snapshot_amount_per_basis is null or snapshot_amount_per_basis >= 0",
  ]) assert.match(migration, new RegExp(expression.replace(/[()]/g, "\\$&")));
});

test("9. tree_count calculation snapshots the current Block tree count", () => {
  assert.match(populateRpc, /when 'tree_count' then v_block\.tree_count::numeric/);
  assert.match(populateRpc, /\) \* source_row\.usage_rate/);
});

test("10. area_rai calculation snapshots the current Block area", () => {
  assert.match(populateRpc, /when 'area_rai' then v_block\.area_rai/);
  assert.match(populateRpc, /snapshot_basis_quantity/);
});

test("11. manual_qty fails closed", () => {
  assert.match(populateRpc, /source_row\.usage_basis in \('manual_qty', 'bag_count'\)/);
  assert.match(populateRpc, /message = 'PLANNING_BASIS_NOT_SUPPORTED'/);
});

test("12. bag_count fails closed", () => {
  assert.match(populateRpc, /'manual_qty', 'bag_count'/);
  assert.doesNotMatch(populateRpc, /planned_quantity[^;]+bag_count|bag_count[^;]+planned_quantity/);
});

test("13. create and refresh lock the annual plan and require draft", () => {
  for (const rpc of [createRpc, refreshRpc]) {
    assert.match(rpc, /from public\.annual_work_plans annual_plan[\s\S]*for update/);
    assert.match(rpc, /annual_plan\.status = 'draft'/);
  }
});

test("14. approved or otherwise non-draft annual plans raise a stable frozen error", () => {
  assert.match(migration, /message = 'PLANNING_PLAN_FROZEN'/);
  assert.match(migration, /guard_canonical_planning_material_mutation/);
});

test("15. canonical Budget eligibility is fail-closed across every required source", () => {
  for (const predicate of [
    "budget_year.status = 'active'",
    "budget_year.snapshot_required is true",
    "budget_rate.approval_status = 'approved'",
    "budget_rate.status = 'active'",
    "budget_rate.is_current is true",
    "budget_block.status = 'active'",
    "source_row.status = 'active'",
    "material.status = 'active'",
    "unit_row.status = 'active'",
  ]) assert.match(populateRpc, new RegExp(predicate.replace(".", "\\.")));
  assert.doesNotMatch(populateRpc, /budget_year\.approved_at|budget_year\.activated_at/);
});

test("16. Activity lineage mismatch is rejected", () => {
  assert.match(populateRpc, /budget_rate\.activity_id = p_activity_id/);
  assert.match(populateRpc, /message = 'PLANNING_ACTIVITY_LINEAGE_MISMATCH'/);
});

test("17. Block lineage mismatch is rejected", () => {
  assert.match(populateRpc, /budget_block\.block_id = p_block_id/);
  assert.match(populateRpc, /message = 'PLANNING_BLOCK_LINEAGE_MISMATCH'/);
});

test("18. Material lineage is source-derived and cannot be caller-mismatched", () => {
  assert.match(populateRpc, /source_row\.material_id,[\s\S]*source_row\.id,/);
  assert.doesNotMatch(createRpc, /p_material_id/);
  assert.doesNotMatch(refreshRpc, /p_material_id/);
});

test("19. no active canonical source rows fails closed", () => {
  assert.match(populateRpc, /message = 'PLANNING_MATERIAL_SNAPSHOT_EMPTY'/);
  assert.match(populateRpc, /source_row\.status = 'active'/);
});

test("20. inactive Material is rejected", () => {
  assert.match(populateRpc, /material\.status <> 'active'/);
  assert.match(populateRpc, /message = 'MATERIAL_INACTIVE'/);
});

test("21. inactive Unit is rejected", () => {
  assert.match(populateRpc, /unit_row\.status <> 'active'/);
  assert.match(populateRpc, /message = 'UNIT_INACTIVE'/);
});

test("22. complete canonical create is one atomic PostgreSQL function", () => {
  assert.match(createRpc, /insert into public\.planned_work_items/);
  assert.match(createRpc, /populate_canonical_planning_material_snapshot/);
  assert.doesNotMatch(createRpc, /exception[\s\S]*when others/);
});

test("23. refresh is one atomic PostgreSQL function", () => {
  assert.match(refreshRpc, /for update/);
  assert.match(refreshRpc, /delete from public\.planned_work_materials/);
  assert.match(refreshRpc, /populate_canonical_planning_material_snapshot/);
});

test("24. refresh atomically replaces only the canonical snapshot set", () => {
  const removeAt = refreshRpc.indexOf("delete from public.planned_work_materials");
  const rebuildAt = refreshRpc.indexOf("populate_canonical_planning_material_snapshot");
  assert.ok(removeAt >= 0 && rebuildAt > removeAt);
  assert.match(refreshRpc, /snapshot_source_type = 'canonical_budget_block_material'/);
});

test("25. Budget changes cannot silently rewrite persisted Planning snapshots", () => {
  assert.doesNotMatch(migration, /create trigger[^;]+on public\.budget_/is);
  assert.match(refreshRpc, /refresh_canonical_planned_work_item_snapshot/);
});

test("26. canonical snapshot guards enforce frozen-plan immutability", () => {
  const guard = sqlFunction("guard_canonical_planning_material_mutation");
  assert.match(guard, /for update of annual_plan/);
  assert.match(guard, /v_plan_status <> 'draft'/);
  assert.match(guard, /PLANNING_PLAN_FROZEN/);
});

test("27. create retry is idempotent and rejects materially different key reuse", () => {
  assert.match(migration, /planned_work_items_planning_request_key_uidx/);
  assert.match(createRpc, /on conflict \(planning_request_key\)/);
  assert.match(createRpc, /'already_exists', true/);
  assert.match(createRpc, /message = 'PLANNING_REQUEST_KEY_REUSED'/);
  assert.doesNotMatch(createRpc, /planning_request_key[^\n]+now\(\)|planning_request_key[^\n]+transaction_timestamp/);
});

test("28. refresh is idempotent as a duplicate-free complete replacement", () => {
  assert.match(refreshRpc, /delete from public\.planned_work_materials/);
  assert.match(migration, /unique \(planned_work_item_id, material_id\)/);
  assert.match(migration, /planned_work_materials_item_source_budget_material_uidx/);
});

test("29. authenticated direct Planning writes are denied and write policies removed", () => {
  assert.match(migration, /drop policy if exists "authenticated write planned_work_items"/);
  assert.match(migration, /drop policy if exists "authenticated write planned_work_materials"/);
  assert.match(migration, /revoke all on table public\.planned_work_items from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.planned_work_materials from anon, authenticated/);
  assert.match(migration, /grant select on table public\.planned_work_items to authenticated/);
});

test("30. RPCs are SECURITY INVOKER and executable only by service_role", () => {
  for (const rpc of [createRpc, refreshRpc, populateRpc]) {
    assert.match(rpc, /security invoker/);
    assert.match(rpc, /set search_path = ''/);
  }
  assert.match(migration, /revoke all on function public\.create_canonical_planned_work_item_snapshot[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.create_canonical_planned_work_item_snapshot[\s\S]+to service_role/);
});

test("31. canonical snapshot RPCs never use Activity Material Standard fallback", () => {
  for (const rpc of [populateRpc, createRpc, refreshRpc]) {
    assert.doesNotMatch(rpc, /activity_material_usage_rates/);
  }
});

test("32. canonical snapshot RPCs never use legacy Budget Material rates", () => {
  for (const rpc of [populateRpc, createRpc, refreshRpc]) {
    assert.doesNotMatch(rpc, /budget_rate_materials/);
  }
  assert.match(populateRpc, /budget_rate_block_materials/);
});

test("33. create and refresh RPCs do not create Work Orders", () => {
  for (const rpc of [createRpc, refreshRpc, populateRpc]) {
    assert.doesNotMatch(rpc, /insert into public\.work_orders|update public\.work_orders|delete from public\.work_orders/);
  }
});

test("34. create and refresh RPCs do not mutate Work Order Materials", () => {
  for (const rpc of [createRpc, refreshRpc, populateRpc]) {
    assert.doesNotMatch(rpc, /work_order_materials/);
  }
});

test("35. migration performs no historical backfill or legacy data rewrite", () => {
  const schemaSection = migration.slice(0, migration.indexOf("create or replace function"));
  assert.doesNotMatch(schemaSection, /insert into|update public\.|delete from/);
  assert.doesNotMatch(migration, /source_work_order_id\s*=|budget_rate_materials|activity_material_usage_rates/);
});

test("canonical costs preserve NULL versus zero while precedence remains undecided", () => {
  assert.match(populateRpc, /source_row\.unit_cost,[\s\S]*source_row\.amount_per_basis/);
  assert.doesNotMatch(populateRpc, /coalesce\(source_row\.unit_cost|coalesce\(source_row\.amount_per_basis/);
});

test("canonical direct-mutation guard is narrow and leaves unrelated parent fields alone", () => {
  const trigger = migration.slice(
    migration.indexOf("create trigger guard_canonical_planning_item_lineage_update"),
    migration.indexOf("create trigger guard_canonical_planning_item_delete"),
  );
  assert.doesNotMatch(trigger, /source_work_order_id/);
  assert.match(migration, /PLANNING_CANONICAL_ACTION_REQUIRED/);
});
