const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const actions = require("../api/farm-actions.js")._test.ACTIONS;
const cron = require("../api/work-notifications-cron.js")._test;
const migration = fs.readFileSync("supabase/migrations/20260808090000_work_notifications.sql", "utf8");
const app = fs.readFileSync("webapp/app.js", "utf8");

test("notification actions expose read acknowledge snooze and preferences", () => {
  for (const name of ["mark_notification_read", "mark_all_notifications_read", "acknowledge_notification", "snooze_notification", "save_notification_preference"]) {
    assert.ok(actions[name], `${name} must be allowlisted`);
  }
});

test("scheduler is Asia/Bangkok, locked, idempotent, dry-run capable and disabled by default", () => {
  delete process.env.WORK_NOTIFICATIONS_SCHEDULER_ENABLED;
  assert.equal(cron.schedulerEnabled(), false);
  assert.match(migration, /pg_try_advisory_xact_lock/);
  assert.match(migration, /Asia\/Bangkok/);
  assert.match(migration, /on conflict\(idempotency_key\) do nothing/i);
  assert.match(migration, /p_dry_run boolean default true/);
  assert.match(migration, /app_notification_jobs/);
});

test("notification center shares one data set across badge drawer page and deep links", () => {
  assert.match(app, /state\.workNotifications/);
  assert.match(app, /renderWorkNotificationCenter/);
  assert.match(app, /notification\.delivery\.view/);
  assert.match(app, /\/notifications/);
  assert.match(app, /safeNotificationActionUrl/);
});
