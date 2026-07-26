const {
  ApiError,
  authenticate,
  errorResponse,
  json,
} = require("../lib/server/farm-api");

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method !== "GET") return errorResponse(res, new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed"));
  try {
    const actor = await authenticate(req);
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
