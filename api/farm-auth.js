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

async function activeLoginEmail(identifierValue) {
  const identifier = requireText(identifierValue, "identifier", 320).toLowerCase();
  let profileId = "";
  let email = "";
  if (!identifier.includes("@")) {
    if (!/^[a-z0-9._-]{3,50}$/.test(identifier)) return null;
    const profiles = await rest(`profiles?username=eq.${encodeURIComponent(identifier)}&status=eq.active&select=id&limit=1`)
      .then(({ data }) => data || []);
    if (profiles.length !== 1) return null;
    profileId = profiles[0].id;
    const { data } = await authAdmin(`users/${encodeURIComponent(profileId)}`);
    email = String(data?.user?.email || data?.email || "").trim().toLowerCase();
  } else {
    email = identifier;
    for (let page = 1; page <= 20 && !profileId; page += 1) {
      const { data } = await authAdmin(`users?page=${page}&per_page=1000`);
      const users = Array.isArray(data) ? data : (data?.users || []);
      const user = users.find((item) => String(item.email || "").trim().toLowerCase() === email);
      if (user) profileId = user.id;
      if (users.length < 1000) break;
    }
    if (!profileId) return null;
    const profiles = await rest(`profiles?id=eq.${encodeURIComponent(profileId)}&status=eq.active&select=id&limit=1`)
      .then(({ data }) => data || []);
    if (profiles.length !== 1) return null;
  }
  return profileId && email ? { profileId, email } : null;
}

function passwordResetRedirect(req) {
  const configured = String(process.env.FARM_AUTH_RECOVERY_REDIRECT_URL || "").trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:") throw new ApiError(500, "AUTH_CONFIG_ERROR", "Password recovery URL must use HTTPS");
    return url.toString();
  }
  const vercelHost = String(process.env.VERCEL_URL || "").trim().toLowerCase();
  if (/^[a-z0-9-]+\.vercel\.app$/.test(vercelHost)) return `https://${vercelHost}/?password_recovery=1`;
  const requestHost = String(req.headers?.host || "").trim().toLowerCase();
  const localHost = process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestHost);
  if (localHost) return `http://${requestHost}/?password_recovery=1`;
  const testPreviewHost = process.env.NODE_ENV !== "production" && /^[a-z0-9-]+\.vercel\.app$/.test(requestHost);
  if (testPreviewHost) return `https://${requestHost}/?password_recovery=1`;
  throw new ApiError(500, "AUTH_CONFIG_ERROR", "Password recovery URL is not configured");
}

async function requestPasswordReset(req, res, body) {
  try {
    const login = await activeLoginEmail(body.identifier ?? body.email);
    if (login) {
      const { url, serviceKey } = config();
      const redirectTo = passwordResetRedirect(req);
      await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: { apikey: serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: login.email }),
      });
    }
  } catch {
    // Keep the public response indistinguishable for unknown, inactive, rate-limited, or unavailable accounts.
  }
  return json(res, 200, {
    ok: true,
    message: "หากบัญชีนี้ใช้งานได้ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลที่ผูกไว้",
  });
}

async function validateRecoveryAccess(accessTokenValue) {
  const accessToken = requireText(accessTokenValue, "accessToken", 4096);
  const { url, serviceKey } = config();
  const headers = { apikey: serviceKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !user?.id) throw new ApiError(401, "INVALID_RECOVERY_LINK", "ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุ");
  const profiles = await rest(`profiles?id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=id&limit=1`)
    .then(({ data }) => data || []);
  if (profiles.length !== 1) throw new ApiError(401, "INVALID_RECOVERY_LINK", "ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุ");
  return { headers, url };
}

async function validatePasswordRecovery(req, res, body) {
  await validateRecoveryAccess(body.accessToken);
  return json(res, 200, { ok: true });
}

async function completePasswordReset(req, res, body) {
  const password = requireText(body.password, "password", 1024);
  if (password.length < 8) throw new ApiError(400, "WEAK_PASSWORD", "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  const { headers, url } = await validateRecoveryAccess(body.accessToken);
  const updateResponse = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password }),
  });
  if (!updateResponse.ok) throw new ApiError(400, "PASSWORD_UPDATE_FAILED", "ไม่สามารถตั้งรหัสผ่านใหม่ได้");
  clearAuthCookies(res);
  return json(res, 200, { ok: true });
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
    if (action === "request_password_reset") return await requestPasswordReset(req, res, body);
    if (action === "validate_password_recovery") return await validatePasswordRecovery(req, res, body);
    if (action === "complete_password_reset") return await completePasswordReset(req, res, body);
    throw new ApiError(400, "ACTION_NOT_ALLOWED", "Auth action is not allowed");
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { activeLoginEmail, authCookie, invalidCredentials, passwordResetRedirect };
