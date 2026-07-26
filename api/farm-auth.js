const {
  ApiError,
  authenticate,
  bearerToken,
  config,
  errorResponse,
  json,
  readBody,
  requireText,
} = require("../lib/server/farm-api");

function authCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookies(res) {
  res.setHeader("Set-Cookie", [
    authCookie("farm-access-token", "", 0),
    authCookie("farm-refresh-token", "", 0),
  ]);
}

async function signIn(req, res, body) {
  const email = requireText(body.email, "email", 320);
  const password = requireText(body.password, "password", 1024);
  const { url, serviceKey } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const session = await response.json().catch(() => null);
  if (!response.ok || !session?.access_token || !session?.refresh_token) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }
  const maxAge = Math.max(Number(session.expires_in || 3600), 60);
  res.setHeader("Set-Cookie", [
    authCookie("farm-access-token", session.access_token, maxAge),
    authCookie("farm-refresh-token", session.refresh_token, 60 * 60 * 24 * 30),
  ]);
  return json(res, 200, {
    ok: true,
    user: { id: session.user?.id || null },
    expiresIn: maxAge,
  });
}

async function signOut(req, res) {
  const token = bearerToken(req);
  const { url, serviceKey } = config();
  await fetch(`${url}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  }).catch(() => null);
  clearCookies(res);
  return json(res, 200, { ok: true });
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    if (req.method === "GET") {
      const actor = await authenticate(req);
      return json(res, 200, {
        ok: true,
        profile: { id: actor.profile.id, displayName: actor.profile.full_name || "User" },
        roles: [...actor.roles],
        permissions: [...actor.permissions],
        scopes: actor.scopes,
      });
    }
    if (req.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await readBody(req);
    const action = requireText(body.action, "action", 40);
    if (action === "sign_in") return await signIn(req, res, body);
    if (action === "sign_out") return await signOut(req, res);
    throw new ApiError(400, "ACTION_NOT_ALLOWED", "Auth action is not allowed");
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { authCookie };
