const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260831222521_phase2g_payroll_contractor.sql",
), "utf8");
const uat = fs.readFileSync(path.join(root, "scripts", "phase2g-rollback-uat.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "api", "farm-actions.js"), "utf8");
const tableSource = fs.readFileSync(path.join(root, "api", "farm-tables.js"), "utf8");
const actions = require("../api/farm-actions")._test;
const tables = require("../api/farm-tables")._test;

test("canonical Payroll eligibility requires verified canonical Work Result", () => {
  assert.ok(migration.indexOf("workflow_source<>'canonical_work_order'") < migration.indexOf("PAYROLL_CANONICAL_RESULT_REQUIRED"));
  assert.ok(migration.indexOf("result_status not in ('verified','closed')") < migration.indexOf("PAYROLL_VERIFIED_RESULT_REQUIRED"));
  assert.match(migration, /verified_at is null/);
  assert.match(actionSource, /prepare_verified_work_result_payroll_phase2g/);
});

test("employee earning reads only frozen Result and WO Labor lineage", () => {
  const start = migration.indexOf("create or replace function public.prepare_payroll_period");
  const end = migration.indexOf("create or replace function public.prepare_verified_work_result_payroll_phase2g");
  const prepare = migration.slice(start, end);
  assert.match(prepare, /work_result_workers/);
  assert.match(prepare, /work_order_labor_requirements/);
  for (const field of [
    "work_order_labor_requirement_id", "source_planned_work_labor_requirement_id",
    "source_budget_rate_role_id", "frozen_rate_amount", "source_result_verified_at",
  ]) assert.match(prepare, new RegExp(field));
  assert.doesNotMatch(prepare, /from public[.](?:budget_rate_roles|budget_activity_rates|payroll_rates)/i);
  assert.match(prepare, /PAYROLL_FROZEN_RATE_LINEAGE_MISMATCH/);
});

test("period boundaries are exact half-month ranges", () => {
  assert.ok(migration.includes("extract(day from p_result_date)<=15"));
  assert.ok(migration.includes("date_trunc('month',p_result_date)::date+14"));
  assert.ok(migration.includes("interval '1 month'-interval '1 day'"));
  assert.match(migration, /PAYROLL_PERIOD_HALF_MONTH_REQUIRED/);
});

test("employee earnings support actual piece, hourly, daily, team pool and driver", () => {
  assert.match(migration, /phase2g_is_hourly/);
  assert.match(migration, /actual_quantity/);
  assert.match(migration, /actual_hours/);
  assert.match(migration, /quantity_allocation_method='team_pool'/);
  assert.match(migration, /is_driver/);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("create or replace function public.prepare_payroll_period"),
      migration.indexOf("create or replace function public.prepare_verified_work_result_payroll_phase2g"),
    ),
    /planned_(?:quantity|hours)[ \t\r\n]*[*]/,
  );
});

test("team pool is fail-closed and records reconciliation", () => {
  assert.ok(migration.includes("create table if not exists public.payroll_team_pool_reconciliations"));
  assert.match(migration, /difference_amount/);
  assert.ok(migration.indexOf("status<>'reconciled'") < migration.indexOf("PAYROLL_TEAM_POOL_NOT_RECONCILED"));
  assert.equal(tables.TABLES.has("payroll_team_pool_reconciliations"), true);
});

test("OT1 is a separate line selected by approved rule and position configuration", () => {
  assert.match(migration, /applicable_position/);
  assert.match(migration, /approved_at is not null/);
  assert.match(migration, /normal_hours_per_day/);
  assert.ok(migration.includes("'overtime','ot1'"));
  assert.ok(migration.includes("v_ot_hours*v_worker.requirement_rate*coalesce(v_rule.multiplier,0)"));
  assert.doesNotMatch(migration, /employee_(?:name|code)[ \t]*=/i);
});

test("allowance and deduction mutations require explicit approved lineage", () => {
  for (const field of [
    "source_type", "source_reference", "reason", "approved_by_profile_id",
    "approved_at", "idempotency_key",
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /PAYROLL_DEDUCTION_SOURCE_REFERENCE_REASON_AMOUNT_REQUIRED/);
  assert.match(migration, /PAYROLL_APPROVED_QUALITY_RULE_REQUIRED/);
  assert.match(actionSource.slice(actionSource.indexOf("add_payroll_allowance_phase2g"), actionSource.indexOf("add_payroll_deduction_phase2g")), /confirmation: true/);
  assert.match(actionSource.slice(actionSource.indexOf("add_payroll_deduction_phase2g"), actionSource.indexOf("adjust_contractor_estimate_phase2g")), /confirmation: true/);
});

test("contractor estimates are separate, frozen and quality-rule guarded", () => {
  assert.ok(migration.includes("insert into public.contractor_period_estimates"));
  assert.match(migration, /work_result_worker_id/);
  assert.match(migration, /gross_amount/);
  assert.match(migration, /quality_deduction_amount/);
  assert.match(migration, /CONTRACTOR_APPROVED_QUALITY_RULE_REQUIRED/);
  assert.match(migration, /net_amount=gross_amount-/);
});

test("retry is idempotent per worker and component", () => {
  assert.match(migration, /payroll_earning_worker_component_unique/);
  assert.ok(migration.includes("on conflict(work_result_worker_id,earning_component)"));
  assert.match(migration, /contractor_estimate_worker_unique/);
  assert.ok(migration.includes("on conflict(work_result_worker_id) where work_result_worker_id is not null do nothing"));
});

test("closed periods and every canonical child are immutable", () => {
  assert.match(migration, /PAYROLL_PERIOD_CLOSED_IMMUTABLE/);
  for (const trigger of [
    "guard_phase2g_payroll_period", "guard_phase2g_payroll_summary",
    "guard_phase2g_payroll_earning", "guard_phase2g_payroll_allowance",
    "guard_phase2g_payroll_deduction", "guard_phase2g_contractor_estimate",
  ]) assert.match(migration, new RegExp(trigger));
  assert.doesNotMatch(migration, /reopen_payroll/i);
});

test("B-Pay integration is read-only reconciliation/export", () => {
  assert.match(migration, /v_phase2g_bpay_reconciliation_export/);
  assert.match(migration, /source_result_count/);
  assert.match(migration, /variance_state/);
  for (const state of ["matched", "difference", "missing_source", "review_required"]) {
    assert.match(migration, new RegExp(`\'${state}\'`));
  }
  assert.ok(migration.includes("Read-only reconciliation/export source"));
  assert.doesNotMatch(migration, /(?:http|net)[.](?:post|request)|bpay.*insert/i);
  assert.equal(tables.TABLES.has("v_phase2g_bpay_reconciliation_export"), true);
});

test("Payroll browser mutation is action-only and estate scoped", () => {
  for (const table of [
    "payroll_periods", "payroll_employee_summaries", "payroll_earning_lines",
    "payroll_allowance_lines", "payroll_deduction_lines",
    "payroll_team_pool_reconciliations", "contractor_period_estimates",
  ]) assert.equal(tables.ACTION_ONLY_TABLES.has(table), true, table);
  assert.match(actionSource, /enforcePayrollEstateScope/);
  assert.match(actionSource, /actorCanAccessPayrollEstate/);
  assert.match(actionSource, /SCOPE_FORBIDDEN/);
  assert.match(tableSource, /v_phase2g_payroll_period_workspace/);
  assert.match(tableSource, /v_phase2g_payroll_eligibility_preview/);
  assert.match(migration, /revoke insert,update,delete on[\s\S]*payroll_periods[\s\S]*contractor_period_estimates[\s\S]*from public,anon,authenticated/);
});

test("service-only views use security invoker and no browser grants", () => {
  for (const view of [
    "v_phase2g_payroll_period_workspace", "v_phase2g_payroll_employee_drilldown",
    "v_phase2g_payroll_eligibility_preview",
    "v_phase2g_bpay_reconciliation_export",
  ]) {
    assert.match(migration, new RegExp(`create or replace view public\\.${view}[\\s\\S]*security_invoker=true`));
    assert.match(migration, new RegExp(`revoke all on public\\.${view} from public,anon,authenticated`));
    assert.match(migration, new RegExp(`grant select on public\\.${view} to service_role`));
  }
});

test("Payroll UI exposes period, summaries, employee drilldown and contractor separation", () => {
  assert.match(app, /function renderFarmPhase2gPayrollWorkspace/);
  assert.match(app, /data-phase2g-payroll-period/);
  assert.match(app, /data-phase2g-payroll-summary/);
  assert.match(app, /data-phase2g-prepare-result/);
  assert.match(app, /data-phase2g-eligibility-preview/);
  assert.ok(app.includes("คำนวณจากผลงานที่ตรวจสอบแล้ว"));
  assert.ok(app.includes("วันทำงาน"));
  assert.ok(app.includes("กิจกรรม"));
  assert.match(app, /data-phase2g-bpay-reconciliation/);
  assert.ok(app.includes("Source Results"));
  assert.match(app, /row[.]source_result_count/);
  assert.match(app, /row[.]variance_state/);
  assert.match(app, /Date → Activity → WO → Result → Rate/);
  assert.ok(app.includes("Contractor Estimate (แยกจาก Employee Payroll)"));
  assert.match(app, /runFarmPhase2gPayrollAction/);
  assert.match(app, /data-phase2g-payroll-action/);
  assert.ok(styles.includes(".phase2g-payroll-workspace"));
});

test("Phase 2G is additive to Planning, Survey, Performance and legacy schemas", () => {
  assert.doesNotMatch(migration, /create (?:or replace )?(?:table|view) public[.]survey_/i);
  assert.doesNotMatch(migration, /drop (?:table|view) public[.](?:survey|work_performance|planned_work|work_order)/i);
  assert.doesNotMatch(migration, /update public[.](?:planned_work|work_order|survey|work_performance)/i);
  assert.match(uat, /Legacy Payroll and legacy Daily Result contracts remain present/);
  assert.match(uat, /Survey and Performance schemas were unchanged/);
});

test("rollback UAT covers A through X and ends with rollback", () => {
  for (const code of "ABCDEFGHIJKLMNOPQRSTUVWX") {
    assert.match(uat, new RegExp(`\\('${code}','PASS'`), `missing UAT ${code}`);
  }
  assert.ok(uat.includes("12 hours generated separate 8 base + 4 OT1"));
  assert.match(uat, /Survey evidence alone created no deduction/);
  assert.ok(uat.includes("select case_code,result,detail"));
  assert.ok(uat.trim().toLowerCase().endsWith("rollback;"));
});

test("extended rollback UAT covers B-Pay and Calculate gates Y through AC", () => {
  for (const code of ["Y", "Z", "AA", "AB", "AC"]) {
    assert.match(uat, new RegExp(`\\('${code}','PASS'`), `missing UAT ${code}`);
  }
  assert.match(uat, /source_result_count equals distinct canonical earning Result lineage/);
  assert.match(uat, /Retry Calculate created no duplicate earning or Contractor estimate lines/);
  assert.match(uat, /Authenticated browser role has no direct canonical Payroll table mutation privilege/);
});
