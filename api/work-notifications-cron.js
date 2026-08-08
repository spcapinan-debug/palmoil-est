const { timingSafeEqual } = require("node:crypto");
const { ApiError, errorResponse, json, rpc } = require("../lib/server/farm-api");

function schedulerEnabled() {
  return String(process.env.WORK_NOTIFICATIONS_SCHEDULER_ENABLED || "").toLowerCase() === "true";
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function authorizeCron(req) {
  const expected = String(process.env.CRON_SECRET || "");
  const header = String(req.headers?.authorization || "");
  const supplied = header.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!expected || !secureEqual(expected, supplied)) {
    throw new ApiError(401, "CRON_AUTH_REQUIRED", "Cron authorization is required");
  }
}

async function generateWithBoundedRetry(now, dryRun) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await rpc("generate_work_notifications", { p_now: now, p_dry_run: dryRun });
    } catch (error) {
      lastError = error;
      if (attempt === 2 || ![502, 503, 504].includes(Number(error?.status))) throw error;
    }
  }
  throw lastError;
}

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return errorResponse(res, new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed"));
  }
  try {
    authorizeCron(req);
    const url = new URL(req.url, "http://localhost");
    const requestedDryRun = url.searchParams.get("dryRun") === "1";
    if (!schedulerEnabled() && !requestedDryRun) {
      return json(res, 200, {
        ok: true,
        status: "disabled",
        dryRun: true,
        timezone: "Asia/Bangkok",
        message: "Work notification scheduling remains disabled until UAT approval",
      });
    }
    const dryRun = requestedDryRun || !schedulerEnabled();
    const result = await generateWithBoundedRetry(new Date().toISOString(), dryRun);
    return json(res, 200, { ok: true, result });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { authorizeCron, generateWithBoundedRetry, schedulerEnabled, secureEqual };
