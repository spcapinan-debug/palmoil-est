const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmTables = require("../api/farm-tables");
const hrActions = require("../api/hr-actions");
const hrScheduler = require("../api/hr-scheduler");
const hrApi = require("../lib/server/hr-api");

const migration = (name) => fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", name), "utf8");
const core = migration("20260801104349_phase5_hr_core_profile.sql");
const vault = migration("20260801104359_phase5_employee_document_vault.sql");
const renewal = migration("20260801104405_phase5_migrant_renewal_workflow.sql");
const reminders = migration("20260801104411_phase5_reminder_notification_engine.sql");
const peopleOps = migration("20260801104418_phase5_leave_training_medical_asset.sql");
const permissions = migration("20260801104424_phase5_hr_permissions_scope.sql");
const analytics = migration("20260801104431_phase5_hr_analytics_views.sql");
const flags = migration("20260801104437_phase5_hr_feature_flags.sql");

test("Phase 5 exposes exactly the requested allowlisted HR actions", () => {
  const names = Object.keys(hrActions._test.ACTIONS);
  assert.equal(names.length, 30);
  for (const name of ["create-employee", "finalize-document-upload", "complete-renewal-case", "run-expiry-reminders", "approve-leave-request"]) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(hrActions._test.ACTIONS["update-employee-profile"].permission, "hr.employee.sensitive.edit");
  assert.equal(hrActions._test.ACTIONS["save-emergency-contact"].permission, "hr.employee.sensitive.edit");
  assert.equal(hrActions._test.ACTIONS["create-document-download-url"].permission, "hr.document.download");
});

test("every mutating HR action is server-gated by a disabled feature flag", () => {
  const exempt = new Set(["preview-expiry-reminders"]);
  for (const name of Object.keys(hrActions._test.ACTIONS)) {
    if (!exempt.has(name)) assert.ok(hrActions._test.FEATURE_FLAG_BY_ACTION[name], name);
  }
  assert.match(fs.readFileSync(path.join(__dirname, "..", "api", "hr-actions.js"), "utf8"), /FEATURE_DISABLED/);
});

test("sensitive identifiers are masked and hashed without retaining the raw value", () => {
  const raw = "AB 123456789";
  const masked = hrApi.maskIdentifier(raw);
  const digest = hrApi.hashIdentifier(raw);
  assert.equal(masked.endsWith("6789"), true);
  assert.equal(masked.includes("12345"), false);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest.includes(raw), false);
});

test("document metadata validation blocks unsafe MIME, extension, and oversized uploads", () => {
  assert.deepEqual(hrApi.validateFileMetadata({ mimeType: "application/pdf", extension: ".pdf", fileSize: 1024 }), {
    mimeType: "application/pdf", extension: "pdf", fileSize: 1024,
  });
  assert.throws(() => hrApi.validateFileMetadata({ mimeType: "application/pdf", extension: "exe", fileSize: 1 }), /not match/);
  assert.throws(() => hrApi.validateFileMetadata({ mimeType: "text/html", extension: "html", fileSize: 1 }), /not match/);
  assert.throws(() => hrApi.validateFileMetadata({ mimeType: "image/png", extension: "png", fileSize: 16 * 1024 * 1024 }), /file_size/);
  assert.equal(hrApi.HR_SIGNED_URL_MAX_SECONDS, 300);
});

test("UAT identities can only create prefixed HR employee codes", () => {
  const actor = { roles: new Set(["uat_manager"]) };
  assert.equal(hrApi.requireHrUatCode(actor, "WEBTEST-UAT-HR-TH-001"), "WEBTEST-UAT-HR-TH-001");
  assert.throws(() => hrApi.requireHrUatCode(actor, "EMP-REAL-001"), /WEBTEST-UAT-HR-/);
});

test("all HR transaction roots reject generic direct writes", () => {
  for (const table of ["employees", "employee_employment_terms", ...hrApi.HR_ACTION_ONLY_TABLES]) {
    assert.equal(farmTables._test.ACTION_ONLY_TABLES.has(table), true, table);
  }
});

test("document vault is private, atomic, immutable, and service-role only", () => {
  assert.match(vault, /'employee-documents'[\s\S]*false,[\s\S]*15728640/);
  assert.match(vault, /employee_document_versions_one_current_idx/);
  assert.match(vault, /unique \(employee_document_id, version_no\)/);
  assert.match(vault, /create or replace function public\.hr_finalize_document_version/);
  assert.match(vault, /for update/);
  assert.match(vault, /revoke all on function public\.hr_finalize_document_version[\s\S]*from public, anon, authenticated/);
  assert.match(vault, /grant execute on function public\.hr_finalize_document_version[\s\S]*to service_role/);
  assert.doesNotMatch(vault, /grant\s+.+\s+to\s+(anon|authenticated)/i);
});

test("new HR tables use RLS and do not grant browser roles", () => {
  for (const sql of [core, vault, renewal, reminders, peopleOps, permissions]) {
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /revoke all on table/i);
    assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]{0,100}\s+to\s+(anon|authenticated)/i);
  }
});

test("analytics views are security invoker and never expose full identification numbers", () => {
  assert.equal((analytics.match(/security_invoker\s*=\s*true/g) || []).length, 12);
  assert.doesNotMatch(analytics, /passport_number|id_card_number|storage_path/i);
  assert.match(analytics, /document_number_masked/);
  assert.match(analytics, /revoke all on table[\s\S]*anon, authenticated/);
});

test("all Phase 5 flags remain false and scheduler configuration is disabled", () => {
  for (const key of ["employee_workspace", "document_vault", "migrant_renewal", "notification_engine", "leave", "training", "medical", "analytics", "employee_self_service", "external_notifications"]) {
    assert.ok(flags.includes(`('hr.${key}_enabled', 'false'`), key);
  }
  assert.match(flags, /"enabled":false,"provider":"vercel_cron","dry_run_default":true/);
  assert.match(flags, /hr\.scheduler_profile_id/);
});

test("protected scheduler uses constant-time secret comparison and fails empty secrets", () => {
  assert.equal(hrScheduler._test.safeSecretEqual("same-secret", "same-secret"), true);
  assert.equal(hrScheduler._test.safeSecretEqual("same-secret", "other-secret"), false);
  assert.equal(hrScheduler._test.safeSecretEqual("", ""), false);
});
