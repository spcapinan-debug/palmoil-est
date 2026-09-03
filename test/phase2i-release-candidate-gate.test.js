const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs", "phase2i-rc-manifest.json"), "utf8"));
const releaseRunbook = fs.readFileSync(path.join(root, "docs", "phase2i-release-candidate-runbook.md"), "utf8");
const rollbackRunbook = fs.readFileSync(path.join(root, "docs", "phase2i-rollback-runbook.md"), "utf8");
const bookkeeping = JSON.parse(fs.readFileSync(
  path.join(root, "docs", "phase2i-baseline", "managed-migration-bookkeeping-20260902.json"),
  "utf8",
));
const managedRelease = fs.readFileSync(path.join(root, "scripts", "phase2i-managed-release.sh"), "utf8");
const stagingRestore = fs.readFileSync(path.join(root, "scripts", "phase2i-restore-schema.sh"), "utf8");
const rcPreflight = fs.readFileSync(path.join(root, "scripts", "phase2i-rc-preflight.mjs"), "utf8");
const previewAuth = fs.readFileSync(path.join(root, "scripts", "phase2i-preview-auth-fixture.mjs"), "utf8");
const stagingSql = fs.readFileSync(path.join(root, "scripts", "phase2i-staging-sql.sh"), "utf8");
const securitySql = fs.readFileSync(path.join(root, "scripts", "phase2i-security-runtime.sql"), "utf8");
const runtimeEvidenceDir = path.join(root, "docs", "phase2i-runtime");
const runtimeEvidence = Object.fromEntries([
  "e2e-results.json",
  "security-matrix.json",
  "idempotency-results.json",
  "payroll-reconciliation.json",
  "performance-reconciliation.json",
  "playwright-results.json",
].map((file) => [file, JSON.parse(fs.readFileSync(path.join(runtimeEvidenceDir, file), "utf8"))]));
const migrationsDir = path.join(root, "supabase", "migrations");

const migrations = manifest.migration_stack.map(({ file }) => ({
  file,
  sql: fs.readFileSync(path.join(migrationsDir, file), "utf8"),
}));

test("Phase 2I manifest pins the RC source, Production baseline and exact migration bytes", () => {
  assert.equal(manifest.release_candidate_source, "7521cfca5fe5d90028a4ea8da2c3309a16949875");
  assert.equal(manifest.production.migration_version, "20260820090323");
  assert.equal(manifest.production.migration_count, 69);
  assert.equal(manifest.production.counts["work_order.work_orders"], 719);
  assert.equal(manifest.production.counts_fingerprint, "72978762e921e91f795d27db765d53f6");
  for (const item of manifest.migration_stack) {
    const digest = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(migrationsDir, item.file)))
      .digest("hex");
    assert.equal(digest, item.sha256, item.file);
  }
});

test("migration order is complete from the Production baseline through Phase 2H", () => {
  assert.deepEqual(manifest.migration_stack.map(({ file }) => file), [
    "20260830135944_phase2c2_full_resource_snapshot.sql",
    "20260830144232_phase2c2_1_full_resource_snapshot_hardening.sql",
    "20260830232530_phase2d_scheduler_work_order_snapshot.sql",
    "20260831034621_phase2e_daily_result_survey_integration.sql",
    "20260831063205_phase2f_actual_variance.sql",
    "20260831222521_phase2g_payroll_contractor.sql",
    "20260901061931_phase2h_performance_analytics.sql",
  ]);
  const versions = manifest.migration_stack.map(({ version }) => version);
  assert.deepEqual(versions, [...versions].sort());
  assert.equal(new Set(versions).size, versions.length);
});

test("managed deployment records every release migration and is idempotent", () => {
  assert.equal(manifest.migration_deployment.classification["2I-C1_exact_sql_compatibility_replay"], "PASS");
  assert.equal(manifest.migration_deployment.classification["2I-C2_deployment_mechanism_and_bookkeeping"], "PASS");
  assert.equal(manifest.migration_deployment.mechanism, "supabase_cli_db_push");
  assert.equal(manifest.migration_deployment.history_table, "supabase_migrations.schema_migrations");
  assert.equal(manifest.migration_deployment.release_record_count, 7);
  assert.equal(manifest.migration_deployment.second_run_pending_count, 0);
  assert.equal(manifest.migration_deployment.deployment_replay_idempotent, true);
  assert.equal(bookkeeping.status, "PASS");
  assert.deepEqual(
    bookkeeping.records.map(({ version, file, sha256 }) => ({ version, file, sha256 })),
    manifest.migration_stack.map(({ version, file, sha256 }) => ({ version, file, sha256 })),
  );
  assert.match(managedRelease, /RC_STAGING_TARGET_REQUIRED/);
  assert.match(managedRelease, /db push[\s\S]*--dry-run/);
  assert.match(managedRelease, /migration list/);
  assert.match(managedRelease, /DEPLOYMENT_REPLAY_IDEMPOTENT=PASS/);
  assert.match(stagingRestore, /DROP SCHEMA IF EXISTS supabase_migrations CASCADE/);
  assert.match(stagingRestore, /RC_STAGING_TARGET_REQUIRED/);
});

test("canonical lineage remains snapshot based from Planning through Performance", () => {
  const stack = migrations.map(({ sql }) => sql).join("\n");
  for (const token of [
    "planned_work_labor_requirements",
    "work_order_labor_requirements",
    "source_planned_work_labor_requirement_id",
    "source_budget_rate_role_id",
    "work_result_workers",
    "payroll_earning_lines",
    "v_phase2h_performance_result",
  ]) assert.match(stack, new RegExp(token));

  const resultAndLater = migrations.slice(3).map(({ sql }) => sql).join("\n");
  assert.doesNotMatch(
    resultAndLater,
    /from\s+public[.](?:budget_rate_roles|budget_activity_rates|payroll_rates)\b/i,
  );
});

test("material and fuel analytics preserve consumption semantics", () => {
  const phase2f = migrations.find(({ file }) => file.includes("phase2f_actual_variance")).sql;
  const phase2h = migrations.find(({ file }) => file.includes("phase2h_performance")).sql;
  assert.match(phase2f, /issued_quantity/);
  assert.match(phase2f, /actual_quantity/);
  assert.match(phase2f, /returned_quantity/);
  assert.match(phase2h, /actual_quantity as used_quantity/);
  assert.match(phase2h, /issued_fuel_liters/);
  assert.match(phase2h, /actual_fuel_liters/);
  assert.match(phase2h, /actual_material_consumption_cost/);
});

test("canonical tables remain action-only and Performance remains service-only read-only", () => {
  const stack = migrations.map(({ sql }) => sql).join("\n");
  assert.match(stack, /revoke all on table public[.]planned_work_labor_requirements from public, anon, authenticated/i);
  assert.match(stack, /revoke all on public[.]v_phase2h_performance_result[\s\S]*from public,anon,authenticated/i);
  assert.match(stack, /grant select on public[.]v_phase2h_performance_result[\s\S]*to service_role/i);
  assert.match(stack, /security_invoker=true/i);
});

test("staging runtime evidence covers E2E 1-6 and reconciliation gates", () => {
  const e2e = runtimeEvidence["e2e-results.json"];
  const security = runtimeEvidence["security-matrix.json"];
  const idempotency = runtimeEvidence["idempotency-results.json"];
  const payroll = runtimeEvidence["payroll-reconciliation.json"];
  const performance = runtimeEvidence["performance-reconciliation.json"];
  const playwright = runtimeEvidence["playwright-results.json"];
  assert.equal(e2e.execution_layer, "database_transaction_uat");
  assert.deepEqual(e2e.scenarios.map(({ id, status }) => [id, status]),
    [1, 2, 3, 4, 5, 6].map((id) => [id, "PASS"]));
  assert.equal(e2e.frozen_lineage.status, "PASS");
  assert.equal(security.summary.passed, 10);
  assert.equal(security.summary.failed, 0);
  assert.equal(security.role_restoration.status, "PASS");
  assert.equal(idempotency.status, "PASS");
  assert.equal(payroll.bpay_reconciliation.status, "PASS");
  assert.equal(performance.phase2h_uat.passed, 37);
  assert.equal(performance.phase2h_uat.failed, 0);
  assert.equal(playwright.preview_smoke.passed, 7);
  assert.equal(playwright.viewport_matrix.passed, 42);
  assert.equal(playwright.browser_canonical_e2e.frozen_lineage, true);
  assert.equal(playwright.permission_browser_smoke.performance_only.payroll_error_code, "FORBIDDEN");
  assert.equal(playwright.browser_errors.status, "PASS");
  assert.equal(playwright.automation_bypass.revoked, true);
  assert.equal(playwright.automation_bypass.protection_restored, true);
  assert.equal(playwright.status, "PASS");
});

test("security harness restores postgres explicitly and has bounded timeouts", () => {
  assert.match(securitySql, /set local role postgres;/i);
  assert.match(securitySql, /current_user <> 'postgres'/i);
  assert.match(securitySql, /SECURITY_HARNESS_ROLE_RESTORE_FAILED/);
  assert.doesNotMatch(securitySql, /reset role;/i);
  assert.match(securitySql, /statement_timeout = '60s'/i);
  assert.match(securitySql, /lock_timeout = '5s'/i);
  assert.match(securitySql, /idle_in_transaction_session_timeout = '60s'/i);
  assert.match(stagingSql, /timeout_bin[\s\S]*--kill-after=5s 90s/);
  assert.match(rcPreflight, /VERCEL_ENV[\s\S]*preview/);
  assert.match(rcPreflight, /RC_PREVIEW_PRODUCTION_DATABASE_FORBIDDEN/);
  assert.match(rcPreflight, /RC_PREVIEW_STAGING_DATABASE_REQUIRED/);
  assert.match(rcPreflight, /Phase 2I RC gate BLOCKED/);
  assert.match(rcPreflight, /blocking_gates/);
});

test("Preview Auth fixture is staging-only, idempotent, and keeps credentials server-side", () => {
  assert.match(previewAuth, /RC_PREVIEW_PRODUCTION_DATABASE_FORBIDDEN/);
  assert.match(previewAuth, /manifest[.]staging[.]project_ref/);
  assert.match(previewAuth, /manifest[.]production[.]project_ref/);
  assert.match(previewAuth, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(previewAuth, /profiles[?]on_conflict=id/);
  assert.match(previewAuth, /profile_roles[?]on_conflict=id/);
  assert.match(previewAuth, /--cleanup/);
  assert.doesNotMatch(previewAuth, /NEXT_PUBLIC/);
  assert.doesNotMatch(previewAuth, /console[.]log[(].*serviceKey/);
});

test("RC records completed runtime gates and explicit validation approval", () => {
  assert.equal(manifest.staging.status, "active_healthy");
  assert.equal(manifest.staging.project_ref, "bertkuucbcegsvvvatyy");
  assert.notEqual(manifest.staging.project_ref, manifest.production.project_ref);
  assert.equal(manifest.staging.production_isolated, true);
  assert.equal(manifest.baseline.application_schema_equivalent, true);
  assert.equal(manifest.runtime_gates.migration_stack_applied, true);
  assert.equal(manifest.runtime_gates.migration_replay_clean, true);
  assert.equal(manifest.runtime_gates.migration_bookkeeping, true);
  assert.equal(manifest.runtime_gates.deployment_replay_idempotent, true);
  assert.equal(manifest.runtime_gates.historical_compatibility, true);
  for (const gate of ["e2e_employee", "e2e_contractor", "e2e_material",
    "e2e_hour_meter_vehicle", "e2e_odometer_vehicle", "e2e_survey",
    "payroll_and_bpay_reconciled", "performance_reconciled",
    "roles_and_action_security", "idempotency"]) assert.equal(manifest.runtime_gates[gate], true, gate);
  assert.equal(manifest.preview.status, "ready");
  assert.equal(manifest.preview.hostname, "palmoil-iz3p6na3q-spc-est.vercel.app");
  assert.equal(manifest.preview.database_project_ref, manifest.staging.project_ref);
  assert.equal(manifest.rc_status, "passed");
  assert.deepEqual(manifest.blocking_gates, []);
  assert.equal(manifest.runtime_gates.production_after_matches_before, true);
  assert.ok(Object.values(manifest.runtime_gates).every((passed) => passed === true));
});

test("release and rollback runbooks contain every required decision section", () => {
  for (const heading of [
    "Pre-deploy checks", "Backup and read-only evidence", "Migration order",
    "Expected schema objects", "Application deployment order", "Smoke tests",
    "Rollback decision points", "Post-deploy verification",
  ]) assert.match(releaseRunbook, new RegExp(heading, "i"));
  for (const heading of [
    "Application rollback", "Database forward-fix", "Database rollback",
    "Data safety", "Immutable snapshots",
  ]) assert.match(rollbackRunbook, new RegExp(heading, "i"));
  assert.match(releaseRunbook, /renderFarmWorkPlanner\(\)/);
  assert.match(releaseRunbook, /Production DB must remain read-only/);
});
