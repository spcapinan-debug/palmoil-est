const {
  ApiError,
  authenticate,
  authAdmin,
  authCookie,
  bearerToken,
  clearAuthCookies,
  config,
  errorResponse,
  json,
  readBody,
  requireText,
  rest,
  setAuthCookies,
} = require("../lib/server/farm-api");

async function signIn(req, res, body) {
  const identifier = requireText(body.identifier ?? body.email, "identifier", 320).toLowerCase();
  const password = requireText(body.password, "password", 1024);
  let email = identifier;
  if (!identifier.includes("@")) {
    if (!/^[a-z0-9._-]{3,50}$/.test(identifier)) throw invalidCredentials();
    try {
      const profiles = await rest(`profiles?username=eq.${encodeURIComponent(identifier)}&status=eq.active&select=id&limit=1`)
        .then(({ data }) => data || []);
      if (profiles.length !== 1) throw invalidCredentials();
      const { data } = await authAdmin(`users/${encodeURIComponent(profiles[0].id)}`);
      email = String(data?.user?.email || data?.email || "").trim().toLowerCase();
      if (!email) throw invalidCredentials();
    } catch {
      throw invalidCredentials();
    }
  }
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
    throw invalidCredentials();
  }
  const activeProfiles = await rest(`profiles?id=eq.${encodeURIComponent(session.user?.id || "")}&status=eq.active&select=id&limit=1`)
    .then(({ data }) => data || [])
    .catch(() => []);
  if (activeProfiles.length !== 1) throw invalidCredentials();
  const maxAge = setAuthCookies(res, session);
  return json(res, 200, {
    ok: true,
    user: { id: session.user?.id || null },
    expiresIn: maxAge,
  });
}

function invalidCredentials() {
  return new ApiError(401, "INVALID_CREDENTIALS", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
}

async function signOut(req, res) {
  const token = bearerToken(req);
  const { url, serviceKey } = config();
  await fetch(`${url}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  }).catch(() => null);
  clearAuthCookies(res);
  return json(res, 200, { ok: true });
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    if (req.method === "GET") {
      const actor = await authenticate(req);
      return json(res, 200, {
        ok: true,
        profile: {
          id: actor.profile.id,
          employeeId: actor.profile.employee_id || null,
          employeeCode: actor.profile.employee_code || null,
          displayName: actor.profile.full_name || "User",
          username: actor.profile.username || null,
          email: actor.user.email || null,
          lineId: actor.profile.line_id || null,
        },
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
module.exports._test = { authCookie, invalidCredentials };
