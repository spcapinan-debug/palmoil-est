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
  const token = match?.[1]?.trim() || cookieValue(req, "farm-access-token");
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

function authCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function setAuthCookies(res, session) {
  const maxAge = Math.max(Number(session?.expires_in || 3600), 60);
  res.setHeader("Set-Cookie", [
    authCookie("farm-access-token", session.access_token, maxAge),
    authCookie("farm-refresh-token", session.refresh_token, 60 * 60 * 24 * 30),
  ]);
  return maxAge;
}

function clearAuthCookies(res) {
  res.setHeader("Set-Cookie", [
    authCookie("farm-access-token", "", 0),
    authCookie("farm-refresh-token", "", 0),
  ]);
}

const DATABASE_DOMAIN_ERRORS = new Map([
  ["PLANNING_REQUEST_KEY_INVALID", 400],
  ["PLANNING_REQUEST_KEY_REQUIRED", 400],
  ["PLANNING_PLAN_YEAR_INVALID", 400],
  ["PLANNING_PLAN_NAME_INVALID", 400],
  ["PLANNING_ITEM_STATUS_INVALID", 400],
  ["PLANNING_BUDGET_YEAR_PLAN_MISMATCH", 400],
  ["PLANNING_CANONICAL_LINEAGE_REQUIRED", 400],
  ["PLANNING_BASIS_NOT_SUPPORTED", 400],
  ["PLANNING_BASIS_QUANTITY_INVALID", 400],
  ["PLANNING_PLAN_FROZEN", 403],
  ["PLANNING_CANONICAL_ACTION_REQUIRED", 403],
  ["PLANNING_ANNUAL_PLAN_NOT_FOUND", 404],
  ["PLANNING_PLANNED_ITEM_NOT_FOUND", 404],
  ["PLANNING_BLOCK_NOT_FOUND", 404],
  ["PLANNING_REQUEST_KEY_REUSED", 409],
  ["PLANNING_REQUEST_KEY_IMMUTABLE", 409],
  ["PLANNING_PLAN_YEAR_IMMUTABLE", 409],
  ["PLANNING_PLAN_SOURCE_IMMUTABLE", 409],
  ["PLANNING_PLAN_NOT_EMPTY", 409],
  ["PLANNING_ITEM_HAS_WORK_ORDER", 409],
  ["PLANNING_CANONICAL_ITEM_REQUIRED", 409],
  ["PLANNING_CANONICAL_PLAN_REQUIRED", 409],
  ["PLANNING_CANONICAL_MATERIAL_REQUIRED", 409],
  ["PLANNING_PLAN_EMPTY", 409],
  ["PLANNING_MATERIAL_SNAPSHOT_EMPTY", 409],
  ["PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE", 409],
  ["PLANNING_APPROVAL_INVALID", 409],
  ["PLANNING_BLOCK_INACTIVE", 409],
  ["PLANNING_ACTIVITY_LINEAGE_MISMATCH", 409],
  ["PLANNING_BLOCK_LINEAGE_MISMATCH", 409],
  ["PLANNING_BUDGET_YEAR_NOT_ELIGIBLE", 409],
  ["PLANNING_BUDGET_ACTIVITY_RATE_NOT_ELIGIBLE", 409],
  ["PLANNING_BUDGET_RATE_BLOCK_NOT_ELIGIBLE", 409],
  ["PLANNING_CANONICAL_WORK_ORDER_NOT_READY", 409],
  ["WORK_ORDER_REQUEST_KEY_INVALID", 400],
  ["WORK_ORDER_ASSIGNMENT_PAYLOAD_INVALID", 400],
  ["WORK_ORDER_SCHEDULE_INVALID", 400],
  ["WORK_ORDER_LABOR_ASSIGNMENT_QUANTITY_INVALID", 400],
  ["WORK_ORDER_ASSIGNEE_IDENTITY_REQUIRED", 400],
  ["WORK_ORDER_NOT_FOUND", 404],
  ["WORK_ORDER_LABOR_REQUIREMENT_NOT_FOUND", 404],
  ["WORK_ORDER_RESOURCE_REQUIREMENT_NOT_FOUND", 404],
  ["CANONICAL_WORK_ORDER_REQUIRED", 409],
  ["CANONICAL_WORK_ORDER_NOT_DRAFT", 409],
  ["CANONICAL_WORK_ORDER_SNAPSHOT_FROZEN", 409],
  ["CANONICAL_WORK_ORDER_MATERIAL_SNAPSHOT_FROZEN", 409],
  ["CANONICAL_WORK_ORDER_ASSIGNMENT_ACTION_REQUIRED", 403],
  ["WORK_ORDER_TEAM_NOT_ACTIVE", 409],
  ["WORK_ORDER_SUPERVISOR_NOT_ACTIVE", 409],
  ["WORK_ORDER_CONTRACTOR_NOT_ACTIVE", 409],
  ["WORK_ORDER_EMPLOYEE_NOT_ACTIVE", 409],
  ["WORK_ORDER_VEHICLE_NOT_ACTIVE", 409],
  ["WORK_ORDER_LABOR_ASSIGNMENT_DUPLICATE", 409],
  ["WORK_ORDER_VEHICLE_ASSIGNMENT_DUPLICATE", 409],
  ["WORK_ORDER_VEHICLE_VARIANCE_REASON_REQUIRED", 409],
  ["WORK_ORDER_DRIVER_LABOR_ASSIGNMENT_REQUIRED", 409],
  ["WORK_ORDER_WORKER_ASSIGNMENT_REQUIRED", 409],
  ["WORK_ORDER_HEADCOUNT_VARIANCE_REASON_REQUIRED", 409],
  ["WORK_ORDER_MATERIAL_SNAPSHOT_REQUIRED", 409],
  ["WORK_ORDER_EQUIPMENT_ASSIGNMENT_REQUIRED", 409],
  ["WORK_ORDER_MACHINE_ASSIGNMENT_REQUIRED", 409],
  ["WORK_ORDER_FUEL_PLAN_REQUIRED", 409],
  ["WORK_ORDER_ACTIVITY_NOT_ACTIVE", 409],
  ["INVALID_BUDGET_MATERIAL_OPERATION", 400],
  ["INVALID_BUDGET_USAGE_BASIS", 400],
  ["INVALID_BUDGET_USAGE_RATE", 400],
  ["INVALID_BUDGET_UNIT_COST", 400],
  ["INVALID_BUDGET_AMOUNT_PER_BASIS", 400],
  ["INVALID_BUDGET_MATERIAL_STATUS", 400],
  ["BUDGET_YEAR_NOT_FOUND", 404],
  ["BUDGET_ACTIVITY_RATE_NOT_FOUND", 404],
  ["BUDGET_RATE_BLOCK_NOT_FOUND", 404],
  ["BUDGET_BLOCK_MATERIAL_NOT_FOUND", 404],
  ["ACTOR_PROFILE_NOT_FOUND", 403],
  ["BUDGET_ACTIVITY_YEAR_MISMATCH", 409],
  ["BUDGET_BLOCK_ACTIVITY_MISMATCH", 409],
  ["BUDGET_BLOCK_MATERIAL_PARENT_MISMATCH", 409],
  ["BUDGET_BLOCK_MATERIAL_DUPLICATE", 409],
  ["MATERIAL_INACTIVE", 409],
  ["UNIT_INACTIVE", 409],
  ["MATERIAL_UNIT_INCOMPATIBLE", 400],
  ["BUDGET_RATE_BLOCK_REQUIRED", 400],
  ["SINGLE_BUDGET_RATE_BLOCK_REQUIRED", 400],
  ["BUDGET_BLOCK_MATERIAL_ROW_REQUIRED", 400],
  ["UNIT_NOT_FOUND", 404],
  ["MATERIAL_UNIT_CONVERSION_NOT_CONFIGURED", 409],
  ["INVALID_REQUIRED_QUANTITY", 400],
  ["INVALID_USAGE_QUANTITY", 400],
  ["INVALID_RETURN_QUANTITY", 400],
  ["INVALID_RETURN_CONDITION", 400],
  ["INVALID_CONVERSION_RATE", 400],
  ["INVALID_CONVERSION_STATUS", 400],
  ["INVALID_ISSUE_PERIOD", 400],
  ["GOODS_ISSUE_NOT_FOUND", 404],
  ["GOODS_RETURN_NOT_FOUND", 404],
  ["WORK_RESULT_NOT_FOUND", 404],
  ["WORK_RESULT_DATE_REQUIRED", 400],
  ["CANONICAL_WORK_RESULT_REQUIRED", 409],
  ["CANONICAL_WORK_RESULT_ACTION_REQUIRED", 403],
  ["CANONICAL_WORK_RESULT_NOT_DRAFT", 409],
  ["CANONICAL_WORK_RESULT_NOT_SUBMITTED", 409],
  ["CANONICAL_WORK_RESULT_NOT_VERIFIED", 409],
  ["CANONICAL_WORK_ORDER_NOT_DISPATCHED", 409],
  ["WORK_RESULT_PAYLOAD_INVALID", 400],
  ["WORK_RESULT_ACTUAL_NEGATIVE", 400],
  ["WORK_RESULT_ACTUAL_QUANTITY_REQUIRED", 409],
  ["WORK_RESULT_LABOR_LINE_NOT_FOUND", 404],
  ["WORK_RESULT_RESOURCE_LINE_NOT_FOUND", 404],
  ["WORK_RESULT_VEHICLE_NOT_ASSIGNED", 409],
  ["WORK_RESULT_RESOURCE_METER_INVALID", 400],
  ["WORK_RESULT_HOUR_METER_REQUIRED", 409],
  ["WORK_RESULT_ODOMETER_REQUIRED", 409],
  ["WORK_RESULT_VEHICLE_MEASUREMENT_SNAPSHOT_FROZEN", 409],
  ["WORK_RESULT_RESOURCE_ACTUAL_NEGATIVE", 400],
  ["WORK_RESULT_ALLOCATION_METHOD_INVALID", 400],
  ["WORK_RESULT_QUANTITY_ALLOCATION_NOT_RECONCILED", 409],
  ["WORK_RESULT_WORKER_ACTUAL_REQUIRED", 409],
  ["WORK_RESULT_MATERIAL_ACTUAL_REQUIRED", 409],
  ["WORK_RESULT_MACHINE_ACTUAL_REQUIRED", 409],
  ["WORK_RESULT_FUEL_ACTUAL_REQUIRED", 409],
  ["WORK_RESULT_DRIVER_LINEAGE_INVALID", 409],
  ["WORK_RESULT_SURVEY_NOT_VERIFIED", 409],
  ["MATERIAL_NOT_FOUND", 404],
  ["GOODS_ISSUE_NOT_POSTED", 409],
  ["GOODS_ISSUE_USAGE_CLOSED", 409],
  ["GOODS_ISSUE_PERIOD_LOCKED", 409],
  ["USAGE_DATE_OUTSIDE_ISSUE_PERIOD", 409],
  ["WORK_RESULT_NOT_MATCH_ISSUE", 409],
  ["WORK_ORDER_NOT_MATCH_ISSUE", 409],
  ["GOODS_ISSUE_LINE_NOT_MATCH_ISSUE", 409],
  ["MATERIAL_NOT_IN_GOODS_ISSUE", 409],
  ["MATERIAL_LOT_NOT_MATCH_ISSUE", 409],
  ["GOODS_RETURN_WAREHOUSE_NOT_MATCH_ISSUE", 409],
  ["INVALID_DESTINATION_BIN", 409],
  ["USAGE_EXCEEDS_AVAILABLE_ISSUED_QUANTITY", 409],
  ["RETURN_EXCEEDS_AVAILABLE_QUANTITY", 409],
  ["RETURN_REQUIRES_QUARANTINE", 409],
  ["IDEMPOTENCY_PAYLOAD_MISMATCH", 409],
  ["GOODS_RETURN_NOT_APPROVED", 409],
  ["INVALID_GOODS_RETURN_STATUS", 409],
  ["GOODS_RETURN_HAS_NO_LINES", 409],
  ["ISSUE_BALANCE_NOT_CLEARED", 409],
]);

function databaseDomainError(data) {
  const message = String(data?.message || data?.error || "");
  for (const [code, status] of DATABASE_DOMAIN_ERRORS) {
    if (message.includes(code)) {
      return new ApiError(status, code, code.replaceAll("_", " ").toLowerCase(), {
        postgresCode: data?.code || null,
      });
    }
  }
  return null;
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
    const domainError = databaseDomainError(data);
    if (domainError) throw domainError;
    if (schemaError(data, response.status)) {
      throw new ApiError(
        409,
        "SCHEMA_MISMATCH",
        "Database schema is not compatible with this request",
        { postgresCode: data?.code || null },
      );
    }
    if (String(data?.code || "") === "42501" || response.status === 401 || response.status === 403) {
      throw new ApiError(403, "FORBIDDEN", "Database permission denied", {
        postgresCode: data?.code || null,
      });
    }
    if (["23505", "23P01"].includes(String(data?.code || ""))) {
      throw new ApiError(409, "STATE_CONFLICT", "A conflicting record already exists", {
        postgresCode: data?.code || null,
      });
    }
    if (["23502", "23514", "22P02"].includes(String(data?.code || ""))) {
      throw new ApiError(400, "VALIDATION_ERROR", "Database validation failed", {
        postgresCode: data?.code || null,
      });
    }
    throw new ApiError(
      response.status >= 500 ? 502 : response.status,
      "DATABASE_ERROR",
      "Database request failed",
      {
      postgresCode: data?.code || null,
      },
    );
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

function authAdmin(path, options = {}) {
  return request(`/auth/v1/admin/${String(path || "").replace(/^\/+/, "")}`, options);
}

async function authenticate(req, tokenOverride = "") {
  const token = tokenOverride || bearerToken(req);
  const { url, serviceKey } = config();
  const authResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) throw new ApiError(401, "INVALID_TOKEN", "The access token is invalid or expired");

  const profileRows = await rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,employee_id,full_name,username,line_id,role,status&limit=1`)
    .then(({ data }) => data);
  const profile = profileRows?.[0];
  if (!profile || profile.status !== "active") throw new ApiError(403, "PROFILE_INACTIVE", "No active profile is linked to this user");

  const [profileRoles, scopes, employeeRows] = await Promise.all([
    rest(`profile_roles?profile_id=eq.${encodeURIComponent(profile.id)}&is_active=eq.true&select=role_id,effective_from,effective_to`)
      .then(({ data }) => data || []),
    rest(`user_access_scopes?profile_id=eq.${encodeURIComponent(profile.id)}&status=eq.active&select=scope_type,estate_id,zone_id,plot_id,block_id`)
      .then(({ data }) => data || []),
    profile.employee_id
      ? rest(`employees?id=eq.${encodeURIComponent(profile.employee_id)}&select=id,employee_code,full_name,status,is_current&limit=1`)
        .then(({ data }) => data || [])
      : Promise.resolve([]),
  ]);
  const employee = employeeRows[0] || null;
  if (employee) {
    profile.employee_code = employee.employee_code || null;
    profile.full_name = employee.full_name || profile.full_name;
  }
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
  return { user, profile, employee, roles, permissions, scopes, token };
}

async function refreshAuthentication(req, res) {
  const refreshToken = cookieValue(req, "farm-refresh-token");
  if (!refreshToken) throw new ApiError(401, "SESSION_EXPIRED", "The authenticated session has expired");
  const { url, serviceKey } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const session = await response.json().catch(() => null);
  if (!response.ok || !session?.access_token || !session?.refresh_token) {
    clearAuthCookies(res);
    throw new ApiError(401, "SESSION_EXPIRED", "The authenticated session has expired");
  }
  setAuthCookies(res, session);
  return authenticate(req, session.access_token);
}

function actorIsSuperAdmin(actor) {
  return Boolean(actor?.roles?.has("super_admin"));
}

function actorHasPermission(actor, permission) {
  return actorIsSuperAdmin(actor) || Boolean(permission && actor?.permissions?.has(permission));
}

function actorCan(actor, { permissions = [], roles = [] } = {}) {
  if (actorIsSuperAdmin(actor)) return true;
  if ([...actor.roles].some((role) => ADMIN_ROLES.has(role))) return true;
  if (roles.some((role) => actor.roles.has(role))) return true;
  return permissions.some((permission) => actorHasPermission(actor, permission));
}

function authorize(actor, requirements = {}) {
  if (actorCan(actor, requirements)) return;
  throw new ApiError(403, "FORBIDDEN", "The current user does not have permission for this operation");
}

function actorCanAccessBlock(actor, block) {
  if ([...actor.roles].some((role) => ADMIN_ROLES.has(role))) return true;
  return actor.scopes.some((scope) => {
    if (["all", "global"].includes(String(scope.scope_type || "").toLowerCase())) return true;
    if (scope.block_id) return scope.block_id === block.id;
    if (scope.plot_id) return scope.plot_id === block.plot_id;
    if (scope.zone_id) return scope.zone_id === block.zone_id;
    if (scope.estate_id) return scope.estate_id === block.estate_id;
    return false;
  });
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
  actorCan,
  actorCanAccessBlock,
  actorHasPermission,
  actorIsSuperAdmin,
  actorIsUat,
  authAdmin,
  authCookie,
  audit,
  authenticate,
  authorize,
  bearerToken,
  clearAuthCookies,
  databaseDomainError,
  config,
  errorResponse,
  json,
  optionalUuid,
  readBody,
  refreshAuthentication,
  requireText,
  requireUuid,
  rest,
  rpc,
  setAuthCookies,
};
