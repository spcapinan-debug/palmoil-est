const {
  ApiError,
  audit,
  authenticate,
  authorize,
  errorResponse,
  json,
} = require("../lib/server/farm-api");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method !== "POST") {
    return errorResponse(res, new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed"));
  }

  try {
    const actor = await authenticate(req);
    authorize(actor, { permissions: ["budget.rate_rule.manage"] });
    await audit(req, actor, "farm_budget_sync.deprecated_attempt", "budget_activity_rates", null, {
      reason: "Legacy JSON-seed synchronization is disabled; Budget runtime remains Supabase-backed.",
    });
    throw new ApiError(
      410,
      "BUDGET_SYNC_DISABLED",
      "Legacy Budget JSON synchronization is disabled; Budget uses canonical Supabase tables.",
    );
  } catch (error) {
    return errorResponse(res, error);
  }
};
