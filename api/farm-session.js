const {
  ApiError,
  authenticate,
  errorResponse,
  json,
  refreshAuthentication,
} = require("../lib/server/farm-api");

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method !== "GET") return errorResponse(res, new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed"));
  try {
    let actor;
    try {
      actor = await authenticate(req);
    } catch (error) {
      if (error?.status !== 401) throw error;
      actor = await refreshAuthentication(req, res);
    }
    return json(res, 200, {
      ok: true,
      profile: {
        id: actor.profile.id,
        employeeId: actor.profile.employee_id || null,
        employeeCode: actor.profile.employee_code || null,
        displayName: actor.profile.display_name || actor.profile.full_name || actor.profile.email || "User",
        username: actor.profile.username || null,
        email: actor.user.email || null,
        lineId: actor.profile.line_id || null,
      },
      roles: [...actor.roles],
      permissions: [...actor.permissions],
      scopes: actor.scopes,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
