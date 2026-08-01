const { timingSafeEqual } = require("node:crypto");
const { ApiError, errorResponse, json, requireUuid, rest } = require("../lib/server/farm-api");

function safeSecretEqual(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function setting(key) {
  const { data } = await rest(`system_settings?setting_key=eq.${encodeURIComponent(key)}&status=eq.active&select=setting_value,value_json&limit=1`);
  return data?.[0] || null;
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    if (req.method !== "GET" && req.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const expected = String(process.env.CRON_SECRET || "");
    const supplied = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    if (!expected || !safeSecretEqual(supplied, expected)) throw new ApiError(401, "INVALID_CRON_SECRET", "Scheduler authentication failed");
    const [feature, schedule, profileSetting] = await Promise.all([
      setting("hr.notification_engine_enabled"), setting("hr.reminder_schedule"), setting("hr.scheduler_profile_id"),
    ]);
    const enabled = String(feature?.setting_value).toLowerCase() === "true" && schedule?.value_json?.enabled === true;
    if (!enabled) throw new ApiError(423, "FEATURE_DISABLED", "HR reminder scheduler is disabled pending Preview UAT");
    const profileId = requireUuid(profileSetting?.setting_value, "hr.scheduler_profile_id");
    const profile = await rest(`profiles?id=eq.${profileId}&status=eq.active&select=id,employee_id,full_name,status&limit=1`)
      .then(({ data }) => data?.[0]);
    if (!profile) throw new ApiError(503, "SCHEDULER_PROFILE_INVALID", "Configured scheduler profile is not active");
    const actor = { user: { id: profile.id }, profile, roles: new Set(["hr_admin"]), permissions: new Set(), scopes: [] };
    const bangkokDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const result = await require("./hr-actions")._schedulerRun({
      args: { dry_run: false }, actor, idempotencyKey: `vercel-cron:hr-reminders:${bangkokDate}`,
    });
    return json(res, 200, { ok: true, scheduler: "vercel_cron", externalNotificationsSent: 0, result });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { safeSecretEqual };
