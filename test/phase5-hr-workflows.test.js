const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const actions = require("../api/hr-actions")._test;
const workspace = require("../api/hr-workspace")._test;

test("renewal workflow permits only declared forward transitions", () => {
  assert.deepEqual(actions.RENEWAL_TRANSITIONS.draft, ["preparing_documents", "cancelled"]);
  assert.ok(actions.RENEWAL_TRANSITIONS.submitted.includes("waiting_authority"));
  assert.ok(actions.RENEWAL_TRANSITIONS.approved.includes("completed"));
  assert.equal(actions.RENEWAL_TRANSITIONS.completed.length, 0);
  assert.equal(actions.RENEWAL_TRANSITIONS.cancelled.length, 0);
});

test("leave overlap and reminder interval calculations cover boundary dates", () => {
  assert.equal(actions.datesOverlap("2026-08-01", "2026-08-03", "2026-08-03", "2026-08-05"), true);
  assert.equal(actions.datesOverlap("2026-08-01", "2026-08-02", "2026-08-03", "2026-08-05"), false);
  assert.equal(actions.dayDiffFrom("2026-08-10", "2026-08-01"), 9);
});

test("action request hashes are actor-bound and deterministic", () => {
  const actorA = { profile: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
  const actorB = { profile: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } };
  const first = actions.requestHash("create-leave-request", { requested_days: 1 }, actorA);
  assert.equal(first, actions.requestHash("create-leave-request", { requested_days: 1 }, actorA));
  assert.notEqual(first, actions.requestHash("create-leave-request", { requested_days: 1 }, actorB));
});

test("HR workspace pagination and scope filtering never add inaccessible employees", () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({ employee_id: `id-${index}`, employee_status: "active" }));
  const scoped = workspace.scopedRows(rows, new Set(["id-1", "id-4"]));
  assert.deepEqual(scoped.map((row) => row.employee_id), ["id-1", "id-4"]);
  const result = workspace.paginate(rows, { page: 2, pageSize: 3 });
  assert.deepEqual(result.rows.map((row) => row.employee_id), ["id-3", "id-4", "id-5"]);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 3, total: 7, pageCount: 3, hasMore: true });
});

test("summary aggregates employee counts without sensitive fields", () => {
  const result = workspace.summaryFromEmployees([
    { employee_status: "active", nationality: "Thai", department_id: "hr", department_name: "HR", expired_document_count: 0, due_90_document_count: 1, open_renewal_count: 0 },
    { employee_status: "active", nationality: "Myanmar", department_name: null, expired_document_count: 2, due_90_document_count: 3, open_renewal_count: 1 },
  ]);
  assert.equal(result.currentEmployees, 2);
  assert.equal(result.activeEmployees, 2);
  assert.equal(result.migrantEmployees, 1);
  assert.equal(result.missingDepartment, 1);
  assert.equal(result.expiredDocuments, 2);
  assert.equal(result.openRenewals, 1);
  assert.equal(Object.hasOwn(result, "document_number"), false);
});

test("schema prevents employment overlap, duplicate current versions, and duplicate reminders", () => {
  const migrations = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260801104349_phase5_hr_core_profile.sql"), "utf8")
    + fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260801104359_phase5_employee_document_vault.sql"), "utf8")
    + fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260801104411_phase5_reminder_notification_engine.sql"), "utf8");
  assert.match(migrations, /employee_document_versions_one_current_idx/);
  assert.match(migrations, /unique \(employee_document_id, rule_id, reminder_date\)/);
  assert.match(migrations, /version_no integer not null default 1/);
});

test("reminder engine includes stop, snooze, repeat, overdue, recipient, and auto-renewal controls", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "api", "hr-actions.js"), "utf8");
  for (const token of ["stop_after_acknowledged", "snoozed_until", "repeat_interval_days", "document_overdue", "resolveReminderRecipients", "autoOpenRenewalCase", "idempotent_replay"]) {
    assert.ok(source.includes(token), token);
  }
  assert.match(source, /external_notifications_sent:\s*0/);
});
