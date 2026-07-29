const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmActions = require("../api/farm-actions");
const farmTables = require("../api/farm-tables");
const farmApi = require("../lib/server/farm-api");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260728090000_phase4_inventory_security_integrity_hotfix.sql",
  ),
  "utf8",
);
const returnLineGuardMigration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260729090000_phase4_return_line_overage_guard.sql",
  ),
  "utf8",
);

const PHASE4_ACTIONS = [
  "calculate-material-issue-quantity",
  "configure-goods-issue-period",
  "record-goods-issue-daily-usage",
  "prepare-goods-return",
  "update-goods-return-line",
  "approve-goods-return",
  "post-goods-return",
  "close-goods-issue-usage",
  "save-material-conversion",
];

test("Phase 4 inventory actions are allowlisted with least-privilege permissions", () => {
  const actions = farmActions._test.ACTIONS;
  for (const name of PHASE4_ACTIONS) {
    assert.ok(actions[name], name);
    assert.ok(actions[name].permissions.includes("inventory.manage"), `${name} legacy permission`);
    assert.equal(farmActions._test.UAT_MUTATION_ACTIONS.has(name), true, `${name} UAT allowlist`);
  }
  for (const name of [
    "configure-goods-issue-period",
    "approve-goods-return",
    "post-goods-return",
    "close-goods-issue-usage",
    "save-material-conversion",
  ]) {
    assert.equal(actions[name].confirmation, true, name);
  }
});

test("daily usage identifies the issue line directly and trusts the session actor", () => {
  const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const params = farmActions._test.ACTIONS["record-goods-issue-daily-usage"].params(
    {
      issue_id: "11111111-1111-4111-8111-111111111111",
      goodsIssueLineId: "22222222-2222-4222-8222-222222222222",
      usage_date: "2026-07-29",
      work_result_id: "33333333-3333-4333-8333-333333333333",
      material_id: "44444444-4444-4444-8444-444444444444",
      quantity: 5,
      unit_id: "55555555-5555-4555-8555-555555555555",
      profile_id: "66666666-6666-4666-8666-666666666666",
    },
    { profile: { id: actorId } },
    { idempotencyKey: "phase4-test-key" },
  );
  assert.equal(params.p_issue_line_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(params.p_profile_id, actorId);
  assert.equal(params.p_idempotency_key, "phase4-test-key");
  assert.equal(Object.hasOwn(params, "p_base_quantity"), false);
});

test("all Phase 4 transaction tables reject generic writes", () => {
  for (const table of [
    "goods_issue_daily_usage",
    "goods_issues",
    "goods_issue_lines",
    "goods_returns",
    "goods_return_lines",
    "sku_conversions",
    "unit_conversions",
    "stock_balances",
    "stock_transactions",
  ]) {
    assert.equal(farmTables._test.ACTION_ONLY_TABLES.has(table), true, table);
  }
});

test("security hotfix closes browser RPC/view access and preserves service-role access", () => {
  for (const view of [
    "v_goods_issue_multi_day_status",
    "v_goods_return_readiness",
    "v_material_unit_conversion_options",
  ]) {
    assert.match(migration, new RegExp(`revoke all on public\\.${view} from public,anon,authenticated`));
    assert.match(migration, new RegExp(`grant select on public\\.${view} to service_role`));
  }
  for (const rpc of [
    "record_goods_issue_daily_usage",
    "prepare_goods_return_from_issue",
    "approve_goods_return",
    "post_goods_return",
    "close_goods_issue_usage",
    "material_conversion_rate",
    "convert_material_quantity",
    "calculate_material_issue_quantity",
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${rpc}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`));
  }
  assert.match(migration, /security_invoker=true/);
});

test("integrity hotfix locks and recomputes returns before stock upsert", () => {
  assert.match(migration, /RETURN_EXCEEDS_AVAILABLE_QUANTITY/);
  assert.match(migration, /RETURN_REQUIRES_QUARANTINE/);
  assert.match(migration, /IDEMPOTENCY_PAYLOAD_MISMATCH/);
  assert.match(migration, /destination_bin_id/);
  assert.match(migration, /for update/);
  assert.match(migration, /on conflict\(\s*warehouse_id,/s);
  assert.match(migration, /goods_issue_id,idempotency_key/);
  assert.match(migration, /p_issue_line_id uuid/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
});

test("draft return-line edits validate overage before returning success", () => {
  assert.match(
    returnLineGuardMigration,
    /perform public\.validate_goods_return_integrity\(v_header\.id\)/,
  );
  assert.match(
    returnLineGuardMigration,
    /revoke execute on function public\.update_goods_return_line/,
  );
  assert.match(
    returnLineGuardMigration,
    /grant execute on function public\.update_goods_return_line[\s\S]*to service_role/,
  );
});

test("inventory domain errors map to safe HTTP responses", () => {
  for (const [code, status] of [
    ["MATERIAL_UNIT_CONVERSION_NOT_CONFIGURED", 409],
    ["INVALID_REQUIRED_QUANTITY", 400],
    ["GOODS_ISSUE_NOT_FOUND", 404],
    ["RETURN_EXCEEDS_AVAILABLE_QUANTITY", 409],
    ["RETURN_REQUIRES_QUARANTINE", 409],
    ["IDEMPOTENCY_PAYLOAD_MISMATCH", 409],
    ["GOODS_RETURN_NOT_FOUND", 404],
    ["GOODS_RETURN_NOT_APPROVED", 409],
    ["ISSUE_BALANCE_NOT_CLEARED", 409],
  ]) {
    const error = farmApi.databaseDomainError({
      code: "P0001",
      message: `${code}: private database context`,
    });
    assert.equal(error.status, status, code);
    assert.equal(error.code, code, code);
    assert.doesNotMatch(error.message, /private database context/i);
  }
});

test("Phase 4 permission matrix separates manager and supervisor capabilities", () => {
  for (const permission of [
    "inventory.issue.usage.record",
    "inventory.return.prepare",
    "inventory.return.edit",
    "inventory.return.approve",
    "inventory.return.post",
    "inventory.issue.close",
    "inventory.conversion.manage",
  ]) {
    assert.match(migration, new RegExp(`\\('uat_manager','${permission.replaceAll(".", "\\.")}'\\)`));
  }
  for (const permission of [
    "inventory.issue.usage.record",
    "inventory.return.prepare",
    "inventory.return.edit",
  ]) {
    assert.match(migration, new RegExp(`\\('uat_supervisor','${permission.replaceAll(".", "\\.")}'\\)`));
  }
  for (const permission of [
    "inventory.return.approve",
    "inventory.return.post",
    "inventory.issue.close",
    "inventory.conversion.manage",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`\\('uat_supervisor','${permission.replaceAll(".", "\\.")}'\\)`));
  }
});

test("Phase 4 hotfix keeps every protected feature flag disabled", () => {
  for (const flag of [
    "inventory.multi_day_issue_enabled",
    "inventory.material_return_enabled",
    "inventory.unit_conversion_enabled",
    "system.dynamic_menu_enabled",
    "system.frontend_workspace_ready",
    "budget.rule_engine_enabled",
    "performance.activity_metrics_enabled",
    "performance.budget_recommendations.enabled",
    "fuel.configuration_confirmed",
    "integration.weighbridge.enabled",
    "system.rls_ready",
  ]) {
    assert.ok(migration.includes(`('${flag}','false'`), flag);
  }
  assert.doesNotMatch(migration, /'true'\s*,\s*'Phase 4/i);
});
