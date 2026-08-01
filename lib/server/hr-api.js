const { createHash } = require("node:crypto");
const { ApiError, ADMIN_ROLES, actorIsUat, rest } = require("./farm-api");

const HR_ACTION_ONLY_TABLES = new Set([
  "employee_personal_profiles",
  "employee_bank_accounts",
  "employee_documents",
  "employee_document_versions",
  "employee_migrant_profiles",
  "employee_renewal_cases",
  "employee_renewal_tasks",
  "employee_medical_exams",
  "employee_cases",
  "hr_notifications",
]);

const HR_ALLOWED_MIME_TYPES = Object.freeze({
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
});
const HR_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
const HR_SIGNED_URL_MAX_SECONDS = 300;
const HR_UAT_PREFIX = "WEBTEST-UAT-HR-";

function enumValue(value, field, allowed) {
  const text = String(value || "").trim();
  if (!allowed.includes(text)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid`, { field });
  }
  return text;
}

function optionalText(value, max = 2000) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (text.length > max) throw new ApiError(400, "VALIDATION_ERROR", `Text must be at most ${max} characters`);
  return text || null;
}

function requiredDate(value, field) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be YYYY-MM-DD`, { field });
  }
  return text;
}

function optionalDate(value, field) {
  return value == null || value === "" ? null : requiredDate(value, field);
}

function optionalNumber(value, field, { minimum = null, maximum = null } = {}) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)
      || (minimum != null && number < minimum)
      || (maximum != null && number > maximum)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid`, { field });
  }
  return number;
}

function requiredInteger(value, field, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be an integer`, { field });
  }
  return number;
}

function booleanValue(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  throw new ApiError(400, "VALIDATION_ERROR", "Boolean value is invalid");
}

function maskIdentifier(value) {
  const normalized = String(value || "").replace(/\s+/g, "").trim();
  if (!normalized) return null;
  const visible = Math.min(4, normalized.length);
  return `${"*".repeat(Math.max(4, normalized.length - visible))}${normalized.slice(-visible)}`;
}

function hashIdentifier(value) {
  const normalized = String(value || "").replace(/\s+/g, "").trim().toUpperCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
}

function sanitizeExtension(value) {
  const extension = String(value || "").toLowerCase().replace(/^\./, "");
  if (!/^[a-z0-9]{2,5}$/.test(extension)) {
    throw new ApiError(400, "INVALID_FILE_EXTENSION", "File extension is not allowed");
  }
  return extension;
}

function validateFileMetadata({ mimeType, extension, fileSize }) {
  const mime = String(mimeType || "").toLowerCase();
  const ext = sanitizeExtension(extension);
  const allowedExtensions = HR_ALLOWED_MIME_TYPES[mime];
  if (!allowedExtensions || !allowedExtensions.includes(ext)) {
    throw new ApiError(400, "INVALID_FILE_TYPE", "File MIME type and extension do not match");
  }
  const size = requiredInteger(fileSize, "file_size", { minimum: 1, maximum: HR_DOCUMENT_MAX_BYTES });
  return { mimeType: mime, extension: ext, fileSize: size };
}

function actorIsAdmin(actor) {
  return [...actor.roles].some((role) => ADMIN_ROLES.has(role) || role === "hr_admin");
}

async function loadHrScopes(actor) {
  if (actorIsAdmin(actor)) return [{ scope_type: "all_employees", access_level: "manage" }];
  const today = new Date().toISOString().slice(0, 10);
  const query = [
    `user_hr_access_scopes?profile_id=eq.${encodeURIComponent(actor.profile.id)}`,
    "status=eq.active",
    `effective_from=lte.${today}`,
    `or=(effective_to.is.null,effective_to.gte.${today})`,
    "select=scope_type,department_id,employee_id,estate_id,access_level",
  ].join("&");
  const { data } = await rest(query);
  return data || [];
}

async function loadScopedEmployeeIds(actor, requiredAccess = "view") {
  if (actorIsAdmin(actor)) return null;
  const scopes = (await loadHrScopes(actor)).filter((scope) => accessLevelAllows(scope.access_level, requiredAccess));
  if (scopes.some((scope) => scope.scope_type === "all_employees")) return null;
  const employeeIds = new Set(scopes
    .filter((scope) => scope.scope_type === "individual" && scope.employee_id)
    .map((scope) => scope.employee_id));
  if (scopes.some((scope) => scope.scope_type === "self") && actor.profile.employee_id) {
    employeeIds.add(actor.profile.employee_id);
  }
  const departmentIds = new Set(scopes
    .filter((scope) => scope.scope_type === "department" && scope.department_id)
    .map((scope) => scope.department_id));
  if (scopes.some((scope) => scope.scope_type === "direct_reports") && actor.profile.employee_id) {
    const managed = await rest(
      `departments?manager_employee_id=eq.${encodeURIComponent(actor.profile.employee_id)}&status=eq.active&select=id`,
    ).then(({ data }) => data || []);
    managed.forEach((row) => departmentIds.add(row.id));
  }
  if (departmentIds.size) {
    const terms = await rest("employee_employment_terms?is_current=eq.true&select=employee_id,department_id")
      .then(({ data }) => data || []);
    terms.filter((row) => departmentIds.has(row.department_id)).forEach((row) => employeeIds.add(row.employee_id));
  }
  // Estate scopes intentionally fail closed until an explicit employee-to-estate source is configured.
  return employeeIds;
}

function accessLevelAllows(granted, required) {
  const rank = { view: 1, edit: 2, manage: 3 };
  return (rank[granted] || 0) >= (rank[required] || 1);
}

async function employeeScopeContext(employeeId) {
  const [employeeRows, termRows] = await Promise.all([
    rest(`employees?id=eq.${encodeURIComponent(employeeId)}&is_current=eq.true&select=id,employee_code,status&limit=1`)
      .then(({ data }) => data || []),
    rest(`employee_employment_terms?employee_id=eq.${encodeURIComponent(employeeId)}&is_current=eq.true&select=department_id&limit=1`)
      .then(({ data }) => data || []),
  ]);
  if (!employeeRows[0]) throw new ApiError(404, "EMPLOYEE_NOT_FOUND", "Employee was not found");
  return { ...employeeRows[0], department_id: termRows[0]?.department_id || null };
}

async function assertEmployeeScope(actor, employeeId, requiredAccess = "view") {
  if (actorIsAdmin(actor)) return employeeScopeContext(employeeId);
  const [employeeIds, employee] = await Promise.all([
    loadScopedEmployeeIds(actor, requiredAccess),
    employeeScopeContext(employeeId),
  ]);
  if (employeeIds == null || employeeIds.has(employeeId)) return employee;
  throw new ApiError(403, "HR_SCOPE_DENIED", "Employee is outside the effective HR scope");
}

function requireHrUatCode(actor, employeeCode) {
  const code = String(employeeCode || "").trim();
  if (actorIsUat(actor) && !code.startsWith(HR_UAT_PREFIX)) {
    throw new ApiError(403, "UAT_PREFIX_REQUIRED", `UAT employee codes must start with ${HR_UAT_PREFIX}`);
  }
  return code;
}

module.exports = {
  HR_ACTION_ONLY_TABLES,
  HR_ALLOWED_MIME_TYPES,
  HR_DOCUMENT_MAX_BYTES,
  HR_SIGNED_URL_MAX_SECONDS,
  HR_UAT_PREFIX,
  accessLevelAllows,
  actorIsAdmin,
  assertEmployeeScope,
  booleanValue,
  enumValue,
  hashIdentifier,
  loadHrScopes,
  loadScopedEmployeeIds,
  maskIdentifier,
  optionalDate,
  optionalNumber,
  optionalText,
  requiredDate,
  requiredInteger,
  requireHrUatCode,
  sanitizeExtension,
  validateFileMetadata,
};
