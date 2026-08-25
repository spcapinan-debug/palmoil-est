const ADMIN_ROLES = new Set(["super_admin", "director", "estate_manager"]);
const UAT_ROLES = new Set(["uat_manager", "uat_supervisor"]);

class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function errorResponse(res, error) {
  const status = error?.status || 500;
  const internal = status >= 500;
  return json(res, status, {
    ok: false,
    error: {
      code: internal ? "INTERNAL_ERROR" : (error?.code || "REQUEST_FAILED"),
      message: internal ? "Internal server error" : (error?.message || "Request failed"),
      ...(!internal && error?.details ? { details: error.details } : {}),
    },
  });
}

async function readBody(req) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > 2_000_000) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds 2 MB");
      try {
        return req.body.length ? JSON.parse(req.body.toString("utf8")) : {};
      } catch {
        throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
      }
    }
    if (typeof req.body === "object") return req.body;
    if (typeof req.body === "string") {
      if (req.body.length > 2_000_000) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds 2 MB");
      try {
        return req.body ? JSON.parse(req.body) : {};
      } catch {
        throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
      }
    }
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds 2 MB");
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new ApiError(
      500,
      "SERVER_CONFIG_ERROR",
      "Server configuration requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  if (String(serviceKey).startsWith("sb_publishable_")) {
    throw new ApiError(500, "SERVER_CONFIG_ERROR", "SUPABASE_SERVICE_ROLE_KEY must be server-only");
  }
  return { url, serviceKey };
}

function cookieValue(req, name) {
  const prefix = `${name}=`;
  const pair = String(req.headers?.cookie || "").split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : "";
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = cookieValue(req, "farm-access-token") || match?.[1]?.trim();
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "A Supabase access token is required");
  return token;
}

function schemaError(data, status) {
  const code = String(data?.code || "");
  const message = String(data?.message || data?.error || "");
  return status === 400 && (
    code === "PGRST204"
    || code === "42703"
    || /column .* does not exist|could not find the .* column/i.test(message)
  );
}

async function request(path, options = {}) {
  const { url, serviceKey } = config();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data?.message || data?.error || text || `Supabase ${response.status}`;
    if (schemaError(data, response.status)) {
      throw new ApiError(409, "SCHEMA_MISMATCH", message, { postgresCode: data?.code || null });
    }
    throw new ApiError(response.status >= 500 ? 502 : response.status, "DATABASE_ERROR", message, {
      postgresCode: data?.code || null,
    });
  }
  return { data, response };
}

function rest(path, options = {}) {
  return request(`/rest/v1/${path}`, options);
}

function rpc(name, args) {
  return rest(`rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify(args),
    headers: { Prefer: "return=representation" },
  }).then(({ data }) => data);
}

async function authenticate(req) {
  const token = bearerToken(req);
  const { url, serviceKey } = config();
  const authResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) throw new ApiError(401, "INVALID_TOKEN", "The access token is invalid or expired");

  const profileRows = await rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,employee_id,full_name,role,status&limit=1`)
    .then(({ data }) => data);
  const profile = profileRows?.[0];
  if (!profile || profile.status !== "active") throw new ApiError(403, "PROFILE_INACTIVE", "No active profile is linked to this user");

  const [profileRoles, scopes] = await Promise.all([
    rest(`profile_roles?profile_id=eq.${encodeURIComponent(profile.id)}&is_active=eq.true&select=role_id,effective_from,effective_to`)
      .then(({ data }) => data || []),
    rest(`user_access_scopes?profile_id=eq.${encodeURIComponent(profile.id)}&status=eq.active&select=scope_type,estate_id,zone_id,plot_id,block_id`)
      .then(({ data }) => data || []),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const roleIds = profileRoles
    .filter((row) => (!row.effective_from || row.effective_from <= today) && (!row.effective_to || row.effective_to >= today))
    .map((row) => row.role_id)
    .filter(Boolean);

  const roles = new Set([profile.role].filter(Boolean));
  const permissions = new Set();
  if (roleIds.length) {
    const roleFilter = roleIds.join(",");
    const roleRows = await rest(`roles?id=in.(${roleFilter})&status=eq.active&select=id,role_key`).then(({ data }) => data || []);
    roleRows.forEach((row) => roles.add(row.role_key));
    const permissionLinks = await rest(`role_permissions?role_id=in.(${roleFilter})&is_allowed=eq.true&status=eq.active&select=permission_id`)
      .then(({ data }) => data || []);
    const permissionIds = [...new Set(permissionLinks.map((row) => row.permission_id).filter(Boolean))];
    if (permissionIds.length) {
      const permissionRows = await rest(`permissions?id=in.(${permissionIds.join(",")})&status=eq.active&select=permission_key`)
        .then(({ data }) => data || []);
      permissionRows.forEach((row) => permissions.add(row.permission_key));
    }
  }
  return { user, profile, roles, permissions, scopes, token };
}

function authorize(actor, { permissions = [], roles = [] } = {}) {
  if ([...actor.roles].some((role) => ADMIN_ROLES.has(role))) return;
  if (roles.some((role) => actor.roles.has(role))) return;
  if (permissions.some((permission) => actor.permissions.has(permission))) return;
  throw new ApiError(403, "FORBIDDEN", "The current user does not have permission for this operation");
}

function actorIsUat(actor) {
  return [...actor.roles].some((role) => UAT_ROLES.has(role));
}

function requireUuid(value, field) {
  const text = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a UUID`, { field });
  }
  return text;
}

function optionalUuid(value, field) {
  return value == null || value === "" ? null : requireUuid(value, field);
}

function requireText(value, field, max = 200) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new ApiError(400, "VALIDATION_ERROR", `${field} is required and must be at most ${max} characters`, { field });
  return text;
}

function requestIp(req) {
  return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim().slice(0, 120);
}

async function audit(req, actor, action, entityTable, entityId, payload) {
  const row = {
    user_id: actor.user.id,
    changed_by: actor.profile.id,
    action,
    module_name: "farm_workspace",
    table_name: entityTable || null,
    entity_table: entityTable || null,
    entity_id: entityId ? String(entityId) : null,
    new_value: payload || {},
    ip_address: requestIp(req) || null,
    user_agent: String(req.headers?.["user-agent"] || "").slice(0, 500) || null,
    note: payload?.reason || null,
  };
  await rest("audit_logs", {
    method: "POST",
    body: JSON.stringify([row]),
    headers: { Prefer: "return=minimal" },
  });
}

module.exports = {
  ADMIN_ROLES,
  UAT_ROLES,
  ApiError,
  actorIsUat,
  audit,
  authenticate,
  authorize,
  bearerToken,
  config,
  cookieValue,
  errorResponse,
  json,
  optionalUuid,
  readBody,
  requireText,
  requireUuid,
  rest,
  rpc,
};
