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
        displayName: actor.profile.display_name || actor.profile.full_name || actor.profile.email || "User",
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
