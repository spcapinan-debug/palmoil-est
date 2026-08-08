const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const tables = require("../api/farm-tables.js")._test;
const migration = fs.readFileSync("supabase/migrations/20260808090000_work_notifications.sql", "utf8");
const actions = fs.readFileSync("api/farm-actions.js", "utf8");

test("notification tables deny browser mutation and remain action-only", () => {
  for (const table of ["app_notification_rules", "app_notifications", "app_notification_deliveries", "app_notification_preferences", "app_notification_jobs"]) {
    assert.ok(tables.ACTION_ONLY_TABLES.has(table), `${table} must require an action`);
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
  }
});

test("recipient mutations reject another profile and responses do not expose secrets", () => {
  assert.match(actions, /Notification is assigned to another recipient/);
  assert.match(actions, /SCOPE_FORBIDDEN/);
  assert.doesNotMatch(actions, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/);
});

test("cron requires a secret and RPC is service-role only", () => {
  const cron = fs.readFileSync("api/work-notifications-cron.js", "utf8");
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(migration, /revoke all on function public\.generate_work_notifications[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.generate_work_notifications[\s\S]*to service_role/);
});
