const { createHash, randomUUID } = require("node:crypto");
const {
  ApiError,
  audit,
  authenticate,
  authorize,
  errorResponse,
  json,
  optionalUuid,
  readBody,
  requireText,
  requireUuid,
  rest,
} = require("../lib/server/farm-api");
const {
  HR_SIGNED_URL_MAX_SECONDS,
  accessLevelAllows,
  actorIsAdmin,
  assertEmployeeScope,
  booleanValue,
  enumValue,
  hashIdentifier,
  loadHrScopes,
  maskIdentifier,
  optionalDate,
  optionalNumber,
  optionalText,
  requiredDate,
  requiredInteger,
  requireHrUatCode,
  validateFileMetadata,
} = require("../lib/server/hr-api");
const { supabaseAdmin } = require("../lib/server/supabase-admin");

const ACTIONS = {
  "create-employee": action("hr.employee.create", createEmployee, "employees", true),
  "update-employee-profile": action("hr.employee.sensitive.edit", updateEmployeeProfile, "employee_personal_profiles"),
  "change-employee-status": action("hr.employee.edit", changeEmployeeStatus, "employees", true),
  "create-employment-term": action("hr.employee.edit", createEmploymentTerm, "employee_employment_terms", true),
  "close-employment-term": action("hr.employee.edit", closeEmploymentTerm, "employee_employment_terms", true),
  "assign-employee-department": action("hr.employee.edit", assignEmployeeDepartment, "employee_employment_terms", true),
  "assign-employee-position": action("hr.employee.edit", assignEmployeePosition, "employee_employment_terms", true),
  "save-emergency-contact": action("hr.employee.sensitive.edit", saveEmergencyContact, "employee_emergency_contacts"),
  "create-employee-document": action("hr.document.upload", createEmployeeDocument, "employee_documents"),
  "request-document-upload": action("hr.document.upload", requestDocumentUpload, "employee_document_versions"),
  "finalize-document-upload": action("hr.document.upload", finalizeDocumentUpload, "employee_document_versions", true),
  "replace-document-version": action("hr.document.upload", replaceDocumentVersion, "employee_document_versions", true),
  "verify-employee-document": action("hr.document.verify", verifyEmployeeDocument, "employee_documents", true),
  "archive-employee-document": action("hr.document.archive", archiveEmployeeDocument, "employee_documents", true),
  "create-document-download-url": action("hr.document.download", createDocumentDownloadUrl, "employee_document_versions"),
  "create-renewal-case": action("hr.renewal.create", createRenewalCase, "employee_renewal_cases", true),
  "assign-renewal-case": action("hr.renewal.manage", assignRenewalCase, "employee_renewal_cases"),
  "update-renewal-status": action("hr.renewal.manage", updateRenewalStatus, "employee_renewal_cases", true),
  "add-renewal-task": action("hr.renewal.manage", addRenewalTask, "employee_renewal_tasks"),
  "complete-renewal-task": action("hr.renewal.manage", completeRenewalTask, "employee_renewal_tasks", true),
  "complete-renewal-case": action("hr.renewal.approve", completeRenewalCase, "employee_renewal_cases", true),
  "preview-expiry-reminders": action("hr.alert.view", previewExpiryReminders, "employee_document_reminders"),
  "run-expiry-reminders": action("hr.alert.manage", runExpiryReminders, "employee_document_reminders", true),
  "acknowledge-hr-notification": action("hr.alert.view", acknowledgeNotification, "hr_notifications"),
  "snooze-hr-notification": action("hr.alert.manage", snoozeNotification, "hr_notifications"),
  "close-hr-notification": action("hr.alert.manage", closeNotification, "hr_notifications", true),
  "create-leave-request": action("hr.leave.manage", createLeaveRequest, "employee_leave_requests"),
  "approve-leave-request": action("hr.leave.approve", approveLeaveRequest, "employee_leave_requests", true),
  "reject-leave-request": action("hr.leave.approve", rejectLeaveRequest, "employee_leave_requests", true),
  "cancel-leave-request": action("hr.leave.manage", cancelLeaveRequest, "employee_leave_requests", true),
};

const FEATURE_FLAG_BY_ACTION = Object.freeze({
  "create-employee": "hr.employee_workspace_enabled",
  "update-employee-profile": "hr.employee_workspace_enabled",
  "change-employee-status": "hr.employee_workspace_enabled",
  "create-employment-term": "hr.employee_workspace_enabled",
  "close-employment-term": "hr.employee_workspace_enabled",
  "assign-employee-department": "hr.employee_workspace_enabled",
  "assign-employee-position": "hr.employee_workspace_enabled",
  "save-emergency-contact": "hr.employee_workspace_enabled",
  "create-employee-document": "hr.document_vault_enabled",
  "request-document-upload": "hr.document_vault_enabled",
  "finalize-document-upload": "hr.document_vault_enabled",
  "replace-document-version": "hr.document_vault_enabled",
  "verify-employee-document": "hr.document_vault_enabled",
  "archive-employee-document": "hr.document_vault_enabled",
  "create-document-download-url": "hr.document_vault_enabled",
  "create-renewal-case": "hr.migrant_renewal_enabled",
  "assign-renewal-case": "hr.migrant_renewal_enabled",
  "update-renewal-status": "hr.migrant_renewal_enabled",
  "add-renewal-task": "hr.migrant_renewal_enabled",
  "complete-renewal-task": "hr.migrant_renewal_enabled",
  "complete-renewal-case": "hr.migrant_renewal_enabled",
  "run-expiry-reminders": "hr.notification_engine_enabled",
  "acknowledge-hr-notification": "hr.notification_engine_enabled",
  "snooze-hr-notification": "hr.notification_engine_enabled",
  "close-hr-notification": "hr.notification_engine_enabled",
  "create-leave-request": "hr.leave_enabled",
  "approve-leave-request": "hr.leave_enabled",
  "reject-leave-request": "hr.leave_enabled",
  "cancel-leave-request": "hr.leave_enabled",
});

async function assertFeatureEnabled(actionName, args = {}) {
  if (actionName === "preview-expiry-reminders"
      || (actionName === "run-expiry-reminders" && booleanValue(args.dry_run, true))) return;
  const settingKey = FEATURE_FLAG_BY_ACTION[actionName];
  if (!settingKey) return;
  const settings = await rest(`system_settings?setting_key=eq.${encodeURIComponent(settingKey)}&select=setting_value,status&limit=1`)
    .then(({ data }) => data || []);
  const enabled = settings[0]?.status === "active" && String(settings[0]?.setting_value).toLowerCase() === "true";
  if (!enabled) throw new ApiError(423, "FEATURE_DISABLED", `${settingKey} is disabled pending Preview UAT`);
}

function action(permission, execute, entity, confirmation = false) {
  return { permission, execute, entity, confirmation };
}

async function one(path, code = "RECORD_NOT_FOUND", message = "Record was not found") {
  const { data } = await rest(path);
  if (!data?.[0]) throw new ApiError(404, code, message);
  return data[0];
}

async function insertOne(table, row, conflict = "") {
  const suffix = conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : "";
  const { data } = await rest(`${table}${suffix}`, {
    method: "POST",
    body: JSON.stringify([row]),
    headers: { Prefer: `${conflict ? "resolution=merge-duplicates," : ""}return=representation` },
  });
  if (!data?.[0]) throw new ApiError(409, "WRITE_CONFLICT", `Unable to write ${table}`);
  return data[0];
}

async function patchOne(table, id, patch, expectedVersion = null, allowedStatus = "") {
  let path = `${table}?id=eq.${encodeURIComponent(id)}`;
  if (expectedVersion != null) path += `&version_no=eq.${requiredInteger(expectedVersion, "version_no")}`;
  if (allowedStatus) path += `&status=in.(${allowedStatus})`;
  const body = { ...patch, updated_at: new Date().toISOString() };
  if (expectedVersion != null) body.version_no = Number(expectedVersion) + 1;
  const { data } = await rest(path, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { Prefer: "return=representation" },
  });
  if (!data?.[0]) throw new ApiError(409, "VERSION_CONFLICT", "Record changed or state is no longer valid");
  return data[0];
}

function textOrNull(value, max = 500) {
  return optionalText(value, max);
}

async function assertCreateScope(actor, departmentId = null) {
  if (actorIsAdmin(actor)) return;
  const scopes = await loadHrScopes(actor);
  const allowed = scopes.some((scope) => accessLevelAllows(scope.access_level, "manage") && (
    scope.scope_type === "all_employees"
    || (scope.scope_type === "department" && scope.department_id === departmentId)
  ));
  if (!allowed) throw new ApiError(403, "HR_SCOPE_DENIED", "HR manage scope is required to create an employee");
}

async function createEmployee({ args, actor }) {
  const employeeCode = requireText(args.employee_code, "employee_code", 80);
  requireHrUatCode(actor, employeeCode);
  const departmentId = optionalUuid(args.department_id, "department_id");
  await assertCreateScope(actor, departmentId);
  const row = {
    employee_code: employeeCode,
    full_name: requireText(args.full_name, "full_name", 300),
    nickname: textOrNull(args.nickname, 120),
    nationality: textOrNull(args.nationality, 120),
    phone: textOrNull(args.phone, 80),
    employee_type: textOrNull(args.employee_type, 120),
    status: enumValue(args.status || "active", "status", ["active", "probation", "inactive", "resigned"]),
    start_date: optionalDate(args.start_date, "start_date"),
    end_date: optionalDate(args.end_date, "end_date"),
    department_id: departmentId,
    daily_wage: optionalNumber(args.daily_wage, "daily_wage", { minimum: 0 }) || 0,
    hourly_wage_rate: optionalNumber(args.hourly_wage_rate, "hourly_wage_rate", { minimum: 0 }),
    worker_type: textOrNull(args.worker_type, 120),
    payment_type: textOrNull(args.payment_type, 120),
    monthly_salary: optionalNumber(args.monthly_salary, "monthly_salary", { minimum: 0 }) || 0,
    contract_rate: optionalNumber(args.contract_rate, "contract_rate", { minimum: 0 }) || 0,
    effective_from: optionalDate(args.effective_from, "effective_from") || new Date().toISOString().slice(0, 10),
    version_no: 1,
    is_current: true,
    change_reason: textOrNull(args.reason, 500),
  };
  return insertOne("employees", row);
}

async function updateEmployeeProfile({ args, actor }) {
  const employeeId = requireUuid(args.employee_id, "employee_id");
  await assertEmployeeScope(actor, employeeId, "edit");
  const row = {
    employee_id: employeeId,
    title: textOrNull(args.title, 60),
    first_name_th: textOrNull(args.first_name_th, 160),
    last_name_th: textOrNull(args.last_name_th, 160),
    first_name_en: textOrNull(args.first_name_en, 160),
    last_name_en: textOrNull(args.last_name_en, 160),
    first_name_native: textOrNull(args.first_name_native, 200),
    last_name_native: textOrNull(args.last_name_native, 200),
    gender: textOrNull(args.gender, 80),
    birth_date: optionalDate(args.birth_date, "birth_date"),
    marital_status: textOrNull(args.marital_status, 80),
    blood_group: textOrNull(args.blood_group, 20),
    religion: textOrNull(args.religion, 100),
    nationality: textOrNull(args.nationality, 120),
    native_language: textOrNull(args.native_language, 100),
    preferred_language: textOrNull(args.preferred_language, 40) || "th",
    note: textOrNull(args.note, 3000),
    updated_by_profile_id: actor.profile.id,
  };
  const existing = await rest(`employee_personal_profiles?employee_id=eq.${employeeId}&select=id,version_no&limit=1`)
    .then(({ data }) => data?.[0] || null);
  if (!existing) return insertOne("employee_personal_profiles", { ...row, version_no: 1 });
  return patchOne(
    "employee_personal_profiles",
    existing.id,
    row,
    args.version_no || existing.version_no,
  );
}

async function changeEmployeeStatus({ args, actor }) {
  const employeeId = requireUuid(args.employee_id, "employee_id");
  await assertEmployeeScope(actor, employeeId, "edit");
  const current = await one(`employees?id=eq.${employeeId}&is_current=eq.true&select=id,status,version_no&limit=1`, "EMPLOYEE_NOT_FOUND");
  const newStatus = enumValue(args.new_status, "new_status", ["active", "probation", "inactive", "resigned"]);
  if (current.status === newStatus) throw new ApiError(409, "NO_STATE_CHANGE", "Employee already has this status");
  const changed = await patchOne("employees", employeeId, {
    status: newStatus,
    end_date: optionalDate(args.end_date, "end_date"),
    change_reason: requireText(args.reason, "reason", 1000),
  }, args.version_no || current.version_no);
  await insertOne("employee_status_history", {
    employee_id: employeeId,
    previous_status: current.status,
    new_status: newStatus,
    effective_date: optionalDate(args.effective_date, "effective_date") || new Date().toISOString().slice(0, 10),
    reason: requireText(args.reason, "reason", 1000),
    approved_by_profile_id: actor.profile.id,
    created_by_profile_id: actor.profile.id,
  });
  return changed;
}

function datesOverlap(startA, endA, startB, endB) {
  return startA <= (endB || "9999-12-31") && startB <= (endA || "9999-12-31");
}

async function createEmploymentTerm({ args, actor }) {
  const employeeId = requireUuid(args.employee_id, "employee_id");
  await assertEmployeeScope(actor, employeeId, "edit");
  const effectiveFrom = requiredDate(args.effective_from, "effective_from");
  const effectiveTo = optionalDate(args.effective_to, "effective_to");
  const existing = await rest(`employee_employment_terms?employee_id=eq.${employeeId}&select=id,effective_from,effective_to`)
    .then(({ data }) => data || []);
  if (existing.some((row) => datesOverlap(effectiveFrom, effectiveTo, row.effective_from, row.effective_to))) {
    throw new ApiError(409, "EMPLOYMENT_TERM_OVERLAP", "Employment term overlaps an existing term");
  }
  return insertOne("employee_employment_terms", {
    employee_id: employeeId,
    department_id: optionalUuid(args.department_id, "department_id"),
    position_id: optionalUuid(args.position_id, "position_id"),
    worker_type: textOrNull(args.worker_type, 120),
    payment_type: textOrNull(args.payment_type, 120),
    daily_wage: optionalNumber(args.daily_wage, "daily_wage", { minimum: 0 }) || 0,
    hourly_wage_rate: optionalNumber(args.hourly_wage_rate, "hourly_wage_rate", { minimum: 0 }),
    monthly_salary: optionalNumber(args.monthly_salary, "monthly_salary", { minimum: 0 }) || 0,
    contract_rate: optionalNumber(args.contract_rate, "contract_rate", { minimum: 0 }) || 0,
    normal_hours_per_day: optionalNumber(args.normal_hours_per_day, "normal_hours_per_day", { minimum: 0, maximum: 24 }) || 8,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_current: booleanValue(args.is_current, !effectiveTo),
    change_reason: requireText(args.reason, "reason", 1000),
    created_by_profile_id: actor.profile.id,
  });
}

async function closeEmploymentTerm({ args, actor }) {
  const termId = requireUuid(args.employment_term_id, "employment_term_id");
  const term = await one(`employee_employment_terms?id=eq.${termId}&select=id,employee_id,version_no,effective_from&limit=1`);
  await assertEmployeeScope(actor, term.employee_id, "edit");
  const effectiveTo = requiredDate(args.effective_to, "effective_to");
  if (effectiveTo < term.effective_from) throw new ApiError(400, "VALIDATION_ERROR", "effective_to precedes effective_from");
  return patchOne("employee_employment_terms", termId, {
    effective_to: effectiveTo,
    is_current: false,
    change_reason: requireText(args.reason, "reason", 1000),
  }, args.version_no || term.version_no);
}

async function updateCurrentTermField(args, actor, field) {
  const employeeId = requireUuid(args.employee_id, "employee_id");
  await assertEmployeeScope(actor, employeeId, "edit");
  const term = await one(`employee_employment_terms?employee_id=eq.${employeeId}&is_current=eq.true&select=id,version_no&limit=1`, "CURRENT_TERM_NOT_FOUND");
  return patchOne("employee_employment_terms", term.id, {
    [field]: requireUuid(args[field], field),
    change_reason: requireText(args.reason, "reason", 1000),
  }, args.version_no || term.version_no);
}

function assignEmployeeDepartment({ args, actor }) { return updateCurrentTermField(args, actor, "department_id"); }
function assignEmployeePosition({ args, actor }) { return updateCurrentTermField(args, actor, "position_id"); }

async function saveEmergencyContact({ args, actor }) {
  const employeeId = requireUuid(args.employee_id, "employee_id");
  await assertEmployeeScope(actor, employeeId, "edit");
  const contactId = optionalUuid(args.contact_id, "contact_id");
  const row = {
    employee_id: employeeId,
    contact_name: requireText(args.contact_name, "contact_name", 240),
    relationship: requireText(args.relationship, "relationship", 120),
    phone: requireText(args.phone, "phone", 80),
    address: textOrNull(args.address, 2000),
    preferred_language: textOrNull(args.preferred_language, 40) || "th",
    priority_no: requiredInteger(args.priority_no || 1, "priority_no", { maximum: 99 }),
    status: enumValue(args.status || "active", "status", ["active", "inactive", "archived"]),
    updated_by_profile_id: actor.profile.id,
  };
  if (!contactId) return insertOne("employee_emergency_contacts", row);
  return patchOne("employee_emergency_contacts", contactId, row, args.version_no);
}

async function createEmployeeDocument({ args, actor }) {
  const employeeId = requireUuid(args.employee_id, "employee_id");
  await assertEmployeeScope(actor, employeeId, "edit");
  const documentTypeId = requireUuid(args.document_type_id, "document_type_id");
  const type = await one(`employee_document_types?id=eq.${documentTypeId}&status=eq.active&select=*&limit=1`, "DOCUMENT_TYPE_NOT_FOUND");
  const rawNumber = args.document_number == null ? "" : String(args.document_number).trim();
  if (type.requires_document_number && !rawNumber) throw new ApiError(400, "DOCUMENT_NUMBER_REQUIRED", "Document number is required");
  return insertOne("employee_documents", {
    employee_id: employeeId,
    document_type_id: documentTypeId,
    document_number_masked: maskIdentifier(rawNumber),
    document_number_hash: hashIdentifier(rawNumber),
    issuing_country: textOrNull(args.issuing_country, 120),
    issuing_authority: textOrNull(args.issuing_authority, 240),
    issue_date: type.has_issue_date ? optionalDate(args.issue_date, "issue_date") : null,
    expiry_date: type.has_expiry_date ? optionalDate(args.expiry_date, "expiry_date") : null,
    status: "draft",
    verification_status: "unverified",
    renewal_required: booleanValue(args.renewal_required, false),
    note: textOrNull(args.note, 3000),
    created_by_profile_id: actor.profile.id,
  });
}

async function documentContext(documentId, actor, access = "view") {
  const document = await one(`employee_documents?id=eq.${documentId}&select=*&limit=1`, "DOCUMENT_NOT_FOUND");
  await assertEmployeeScope(actor, document.employee_id, access);
  return document;
}

async function nextDocumentVersion(documentId) {
  const rows = await rest(`employee_document_versions?employee_document_id=eq.${documentId}&select=version_no&order=version_no.desc&limit=1`)
    .then(({ data }) => data || []);
  return Number(rows[0]?.version_no || 0) + 1;
}

async function requestDocumentUpload({ args, actor }) {
  const documentId = requireUuid(args.document_id, "document_id");
  const document = await documentContext(documentId, actor, "edit");
  const type = await one(`employee_document_types?id=eq.${document.document_type_id}&select=document_type_code&limit=1`, "DOCUMENT_TYPE_NOT_FOUND");
  const metadata = validateFileMetadata({ mimeType: args.mime_type, extension: args.extension, fileSize: args.file_size });
  const versionNo = await nextDocumentVersion(documentId);
  const storagePath = `employees/${document.employee_id}/${type.document_type_code}/${document.id}/v${versionNo}.${metadata.extension}`;
  const { data, error } = await supabaseAdmin().storage.from("employee-documents").createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.signedUrl) throw new ApiError(502, "STORAGE_SIGN_FAILED", "Unable to create signed upload URL");
  return { document_id: documentId, version_no: versionNo, storage_path: storagePath, signed_upload_url: data.signedUrl, upload_token: data.token || null };
}

async function finalizeDocumentUpload({ args, actor, replacement = false }) {
  const documentId = requireUuid(args.document_id, "document_id");
  const document = await documentContext(documentId, actor, "edit");
  const metadata = validateFileMetadata({ mimeType: args.mime_type, extension: args.extension, fileSize: args.file_size });
  const expectedVersion = await nextDocumentVersion(documentId);
  const storagePath = requireText(args.storage_path, "storage_path", 1000);
  const expectedSuffix = `/${document.id}/v${expectedVersion}.${metadata.extension}`;
  if (!storagePath.startsWith(`employees/${document.employee_id}/`) || !storagePath.endsWith(expectedSuffix)) {
    throw new ApiError(400, "INVALID_STORAGE_PATH", "Storage path does not match the document and version");
  }
  if (replacement && !document.current_version_id) throw new ApiError(409, "DOCUMENT_HAS_NO_CURRENT_VERSION", "No current version exists to replace");
  const { data: blob, error } = await supabaseAdmin().storage.from("employee-documents").download(storagePath);
  if (error || !blob) throw new ApiError(404, "UPLOADED_OBJECT_NOT_FOUND", "Uploaded object was not found");
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length !== metadata.fileSize) throw new ApiError(400, "FILE_SIZE_MISMATCH", "Uploaded file size does not match metadata");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const { data: version, error: finalizeError } = await supabaseAdmin().rpc("hr_finalize_document_version", {
    p_document_id: documentId,
    p_expected_document_version_no: requiredInteger(args.document_version_no || document.version_no, "document_version_no"),
    p_version_no: expectedVersion,
    p_storage_path: storagePath,
    p_original_file_name: requireText(args.original_file_name, "original_file_name", 500),
    p_mime_type: metadata.mimeType,
    p_file_extension: metadata.extension,
    p_file_size: metadata.fileSize,
    p_checksum_sha256: checksum,
    p_uploaded_by_profile_id: actor.profile.id,
    p_valid_from: optionalDate(args.valid_from, "valid_from"),
    p_valid_to: optionalDate(args.valid_to, "valid_to"),
    p_replacement_reason: replacement ? requireText(args.replacement_reason, "replacement_reason", 1000) : textOrNull(args.replacement_reason, 1000),
    p_issue_date: optionalDate(args.issue_date, "issue_date"),
    p_expiry_date: optionalDate(args.expiry_date, "expiry_date"),
  });
  if (finalizeError || !version?.id) {
    const conflict = /VERSION_CONFLICT|duplicate key|serialization/i.test(finalizeError?.message || "");
    throw new ApiError(conflict ? 409 : 502, conflict ? "VERSION_CONFLICT" : "DOCUMENT_FINALIZE_FAILED", conflict
      ? "Document changed while the upload was being finalized"
      : "Unable to finalize the uploaded document");
  }
  return { id: version.id, document_id: documentId, version_no: expectedVersion, checksum_sha256: checksum };
}

function replaceDocumentVersion({ args, actor }) { return finalizeDocumentUpload({ args, actor, replacement: true }); }

async function verifyEmployeeDocument({ args, actor }) {
  const documentId = requireUuid(args.document_id, "document_id");
  const document = await documentContext(documentId, actor, "edit");
  if (!document.current_version_id) throw new ApiError(409, "DOCUMENT_FILE_REQUIRED", "A current document version is required");
  const decision = enumValue(args.verification_status, "verification_status", ["verified", "rejected"]);
  return patchOne("employee_documents", documentId, {
    verification_status: decision,
    verified_by_profile_id: actor.profile.id,
    verified_at: new Date().toISOString(),
    note: textOrNull(args.note, 3000),
  }, args.version_no || document.version_no);
}

async function archiveEmployeeDocument({ args, actor }) {
  const documentId = requireUuid(args.document_id, "document_id");
  const document = await documentContext(documentId, actor, "edit");
  return patchOne("employee_documents", documentId, {
    status: "archived",
    archived_at: new Date().toISOString(),
    archived_by_profile_id: actor.profile.id,
    note: requireText(args.reason, "reason", 2000),
  }, args.version_no || document.version_no);
}

async function createDocumentDownloadUrl({ args, actor }) {
  const versionId = requireUuid(args.document_version_id, "document_version_id");
  const version = await one(`employee_document_versions?id=eq.${versionId}&archived_at=is.null&select=*&limit=1`, "DOCUMENT_VERSION_NOT_FOUND");
  await documentContext(version.employee_document_id, actor, "view");
  const expiresIn = requiredInteger(args.expires_in || HR_SIGNED_URL_MAX_SECONDS, "expires_in", { minimum: 60, maximum: HR_SIGNED_URL_MAX_SECONDS });
  const { data, error } = await supabaseAdmin().storage.from(version.storage_bucket).createSignedUrl(
    version.storage_path,
    expiresIn,
    { download: version.original_file_name },
  );
  if (error || !data?.signedUrl) throw new ApiError(502, "STORAGE_SIGN_FAILED", "Unable to create signed download URL");
  return { document_version_id: versionId, signed_url: data.signedUrl, expires_in: expiresIn };
}

async function renewalContext(caseId, actor, access = "view") {
  const renewal = await one(`employee_renewal_cases?id=eq.${caseId}&select=*&limit=1`, "RENEWAL_CASE_NOT_FOUND");
  await assertEmployeeScope(actor, renewal.employee_id, access);
  return renewal;
}

async function createRenewalCase({ args, actor }) {
  const documentId = requireUuid(args.document_id, "document_id");
  const document = await documentContext(documentId, actor, "edit");
  const renewal = await insertOne("employee_renewal_cases", {
    case_no: `REN-${Date.now()}-${randomUUID().slice(0, 8)}`,
    employee_id: document.employee_id,
    document_id: documentId,
    renewal_type: requireText(args.renewal_type, "renewal_type", 160),
    current_expiry_date: document.expiry_date,
    target_completion_date: optionalDate(args.target_completion_date, "target_completion_date"),
    status: "draft",
    priority: enumValue(args.priority || "normal", "priority", ["low", "normal", "high", "urgent"]),
    assigned_hr_profile_id: optionalUuid(args.assigned_hr_profile_id, "assigned_hr_profile_id") || actor.profile.id,
    estimated_cost: optionalNumber(args.estimated_cost, "estimated_cost", { minimum: 0 }),
    note: textOrNull(args.note, 3000),
    created_by_profile_id: actor.profile.id,
  });
  await patchOne("employee_documents", documentId, { status: "in_renewal", renewal_case_id: renewal.id }, document.version_no);
  return renewal;
}

async function assignRenewalCase({ args, actor }) {
  const caseId = requireUuid(args.renewal_case_id, "renewal_case_id");
  const renewal = await renewalContext(caseId, actor, "edit");
  return patchOne("employee_renewal_cases", caseId, {
    assigned_hr_profile_id: requireUuid(args.assigned_hr_profile_id, "assigned_hr_profile_id"),
  }, args.version_no || renewal.version_no);
}

const RENEWAL_TRANSITIONS = Object.freeze({
  draft: ["preparing_documents", "cancelled"],
  preparing_documents: ["waiting_employee", "waiting_manager", "appointment_scheduled", "submitted", "cancelled"],
  waiting_employee: ["preparing_documents", "cancelled", "overdue"],
  waiting_manager: ["preparing_documents", "cancelled", "overdue"],
  appointment_scheduled: ["submitted", "additional_documents_required", "cancelled", "overdue"],
  submitted: ["waiting_authority", "additional_documents_required", "approved", "rejected", "overdue"],
  waiting_authority: ["approved", "rejected", "additional_documents_required", "overdue"],
  additional_documents_required: ["preparing_documents", "submitted", "cancelled", "overdue"],
  approved: ["completed"],
  overdue: ["preparing_documents", "submitted", "approved", "rejected", "cancelled"],
  rejected: [], completed: [], cancelled: [],
});

async function updateRenewalStatus({ args, actor }) {
  const caseId = requireUuid(args.renewal_case_id, "renewal_case_id");
  const renewal = await renewalContext(caseId, actor, "edit");
  const newStatus = enumValue(args.new_status, "new_status", Object.keys(RENEWAL_TRANSITIONS));
  if (!(RENEWAL_TRANSITIONS[renewal.status] || []).includes(newStatus)) {
    throw new ApiError(409, "INVALID_RENEWAL_TRANSITION", `Cannot move from ${renewal.status} to ${newStatus}`);
  }
  const changed = await patchOne("employee_renewal_cases", caseId, {
    status: newStatus,
    submitted_date: newStatus === "submitted" ? new Date().toISOString().slice(0, 10) : renewal.submitted_date,
    appointment_date: optionalDate(args.appointment_date, "appointment_date") || renewal.appointment_date,
    note: textOrNull(args.note, 3000) || renewal.note,
  }, args.version_no || renewal.version_no);
  await insertOne("employee_renewal_case_history", {
    renewal_case_id: caseId,
    previous_status: renewal.status,
    new_status: newStatus,
    changed_by_profile_id: actor.profile.id,
    reason: requireText(args.reason, "reason", 2000),
  });
  return changed;
}

async function addRenewalTask({ args, actor }) {
  const caseId = requireUuid(args.renewal_case_id, "renewal_case_id");
  await renewalContext(caseId, actor, "edit");
  return insertOne("employee_renewal_tasks", {
    renewal_case_id: caseId,
    task_code: requireText(args.task_code, "task_code", 120),
    task_name: requireText(args.task_name, "task_name", 300),
    responsible_profile_id: optionalUuid(args.responsible_profile_id, "responsible_profile_id") || actor.profile.id,
    responsible_employee_id: optionalUuid(args.responsible_employee_id, "responsible_employee_id"),
    due_date: optionalDate(args.due_date, "due_date"),
    status: "pending",
    note: textOrNull(args.note, 2000),
    sort_order: requiredInteger(args.sort_order || 100, "sort_order", { minimum: 0, maximum: 10000 }),
    updated_by_profile_id: actor.profile.id,
  });
}

async function completeRenewalTask({ args, actor }) {
  const taskId = requireUuid(args.renewal_task_id, "renewal_task_id");
  const task = await one(`employee_renewal_tasks?id=eq.${taskId}&select=*&limit=1`, "RENEWAL_TASK_NOT_FOUND");
  await renewalContext(task.renewal_case_id, actor, "edit");
  return patchOne("employee_renewal_tasks", taskId, {
    status: "completed",
    completed_at: new Date().toISOString(),
    evidence_document_version_id: optionalUuid(args.evidence_document_version_id, "evidence_document_version_id"),
    note: textOrNull(args.note, 2000),
    updated_by_profile_id: actor.profile.id,
  }, args.version_no || task.version_no, "pending,in_progress,blocked");
}

async function completeRenewalCase({ args, actor }) {
  const caseId = requireUuid(args.renewal_case_id, "renewal_case_id");
  const renewal = await renewalContext(caseId, actor, "edit");
  if (renewal.status !== "approved") throw new ApiError(409, "RENEWAL_NOT_APPROVED", "Only approved renewals can be completed");
  const pending = await rest(`employee_renewal_tasks?renewal_case_id=eq.${caseId}&status=not.in.(completed,cancelled)&select=id&limit=1`)
    .then(({ data }) => data || []);
  if (pending.length) throw new ApiError(409, "RENEWAL_TASKS_INCOMPLETE", "All renewal tasks must be completed");
  const newDocumentId = requireUuid(args.new_document_id, "new_document_id");
  const newDocument = await documentContext(newDocumentId, actor, "edit");
  if (newDocument.employee_id !== renewal.employee_id) throw new ApiError(409, "EMPLOYEE_MISMATCH", "New document belongs to another employee");
  const changed = await patchOne("employee_renewal_cases", caseId, {
    status: "completed",
    completed_date: new Date().toISOString().slice(0, 10),
    new_document_id: newDocumentId,
    actual_cost: optionalNumber(args.actual_cost, "actual_cost", { minimum: 0 }),
  }, args.version_no || renewal.version_no);
  await patchOne("employee_documents", renewal.document_id, { status: "renewed" }, null);
  await rest(`employee_document_reminders?employee_document_id=eq.${renewal.document_id}&reminder_status=not.in.(closed,acknowledged)`, {
    method: "PATCH",
    body: JSON.stringify({ reminder_status: "closed", closed_at: new Date().toISOString(), closed_by_profile_id: actor.profile.id }),
    headers: { Prefer: "return=minimal" },
  });
  return changed;
}

function dayDiff(expiryDate) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.ceil((Date.parse(`${expiryDate}T00:00:00Z`) - today.getTime()) / 86400000);
}

function dayDiffFrom(laterDate, earlierDate) {
  return Math.floor((Date.parse(`${laterDate}T00:00:00Z`) - Date.parse(`${earlierDate}T00:00:00Z`)) / 86400000);
}

async function resolveReminderRecipients(candidate, actor) {
  const recipients = new Map();
  const add = (profileId, employeeId = null) => {
    if (profileId) recipients.set(`profile:${profileId}`, { profile_id: profileId, employee_id: null });
    else if (employeeId) recipients.set(`employee:${employeeId}`, { profile_id: null, employee_id: employeeId });
  };
  if (candidate.rule.notify_employee) {
    const profile = await rest(`profiles?employee_id=eq.${candidate.document.employee_id}&status=eq.active&select=id&limit=1`)
      .then(({ data }) => data?.[0]);
    add(profile?.id, profile ? null : candidate.document.employee_id);
  }
  if (candidate.rule.notify_hr_owner) {
    const owner = await rest(`employee_migrant_profiles?employee_id=eq.${candidate.document.employee_id}&select=assigned_hr_profile_id&limit=1`)
      .then(({ data }) => data?.[0]);
    add(owner?.assigned_hr_profile_id || actor.profile.id);
  }
  if (candidate.rule.notify_department_manager) {
    const term = await rest(`employee_employment_terms?employee_id=eq.${candidate.document.employee_id}&is_current=eq.true&select=department_id&limit=1`)
      .then(({ data }) => data?.[0]);
    if (term?.department_id) {
      const department = await rest(`departments?id=eq.${term.department_id}&status=eq.active&select=manager_employee_id&limit=1`)
        .then(({ data }) => data?.[0]);
      const manager = department?.manager_employee_id
        ? await rest(`profiles?employee_id=eq.${department.manager_employee_id}&status=eq.active&select=id&limit=1`).then(({ data }) => data?.[0])
        : null;
      add(manager?.id);
    }
  }
  // Estate manager notification fails closed until employee-to-estate ownership is configured.
  if (!recipients.size) add(actor.profile.id);
  return [...recipients.values()];
}

async function settingEnabled(settingKey) {
  const row = await rest(`system_settings?setting_key=eq.${encodeURIComponent(settingKey)}&status=eq.active&select=setting_value&limit=1`)
    .then(({ data }) => data?.[0]);
  return String(row?.setting_value).toLowerCase() === "true";
}

async function autoOpenRenewalCase(candidate, actor) {
  if (!await settingEnabled("hr.migrant_renewal_enabled")) return null;
  const existing = await rest(`employee_renewal_cases?document_id=eq.${candidate.document.id}&status=not.in.(completed,cancelled,rejected)&select=id&limit=1`)
    .then(({ data }) => data?.[0]);
  if (existing) return existing;
  const renewal = await insertOne("employee_renewal_cases", {
    case_no: `REN-AUTO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8)}`,
    employee_id: candidate.document.employee_id,
    document_id: candidate.document.id,
    renewal_type: "rule_configured",
    current_expiry_date: candidate.document.expiry_date,
    target_completion_date: candidate.document.expiry_date,
    status: "draft",
    priority: candidate.days_to_expiry < 0 ? "urgent" : "normal",
    created_by_profile_id: actor.profile.id,
    note: "Auto-opened by an approved reminder rule",
  });
  await patchOne("employee_documents", candidate.document.id, { status: "in_renewal", renewal_case_id: renewal.id }, null);
  return renewal;
}

async function reminderCandidates(actor) {
  const [documents, rules] = await Promise.all([
    rest("employee_documents?archived_at=is.null&status=in.(active,due_soon,expired,in_renewal)&expiry_date=not.is.null&select=id,employee_id,document_type_id,expiry_date,status")
      .then(({ data }) => data || []),
    rest(`employee_document_reminder_rules?status=eq.active&effective_from=lte.${new Date().toISOString().slice(0, 10)}&or=(effective_to.is.null,effective_to.gte.${new Date().toISOString().slice(0, 10)})&select=*`).then(({ data }) => data || []),
  ]);
  const scoped = [];
  for (const document of documents) {
    try {
      await assertEmployeeScope(actor, document.employee_id, "view");
      scoped.push(document);
    } catch (error) {
      if (error?.code !== "HR_SCOPE_DENIED" && error?.code !== "HR_SCOPE_REQUIRED") throw error;
    }
  }
  return scoped.flatMap((document) => rules
    .filter((rule) => rule.document_type_id === document.document_type_id)
    .map((rule) => ({ document, rule, days_to_expiry: dayDiff(document.expiry_date) }))
    .filter((item) => item.days_to_expiry <= item.rule.reminder_days_before));
}

async function previewExpiryReminders({ actor }) {
  const items = await reminderCandidates(actor);
  return { dry_run: true, processed_count: items.length, candidates: items.slice(0, 500).map((item) => ({
    employee_document_id: item.document.id,
    employee_id: item.document.employee_id,
    rule_id: item.rule.id,
    expiry_date: item.document.expiry_date,
    days_to_expiry: item.days_to_expiry,
    channel: "in_app",
  })) };
}

async function runExpiryReminders({ args, actor, idempotencyKey }) {
  const dryRun = booleanValue(args.dry_run, true);
  const preview = await previewExpiryReminders({ actor });
  if (dryRun) return preview;
  const existingRun = await rest(`hr_job_runs?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`)
    .then(({ data }) => data?.[0]);
  if (existingRun?.status === "completed") {
    return { dry_run: false, idempotent_replay: true, processed_count: existingRun.processed_count,
      created_count: existingRun.created_count, skipped_count: existingRun.skipped_count, failed_count: existingRun.failed_count };
  }
  if (existingRun) throw new ApiError(409, "SCHEDULER_ALREADY_RUNNING", "The reminder job is already running or requires operator review");
  const run = await insertOne("hr_job_runs", {
    job_name: "employee_document_expiry_reminders",
    idempotency_key: idempotencyKey,
    dry_run: false,
    status: "running",
    triggered_by_profile_id: actor.profile.id,
  });
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];
  const reminderDate = new Date().toISOString().slice(0, 10);
  const candidates = await reminderCandidates(actor);
  for (const candidate of candidates) {
    try {
      const prior = await rest(`employee_document_reminders?employee_document_id=eq.${candidate.document.id}&rule_id=eq.${candidate.rule.id}&select=id,reminder_date,reminder_status,snoozed_until&order=reminder_date.desc&limit=1`)
        .then(({ data }) => data?.[0]);
      if (prior?.reminder_status === "acknowledged" && candidate.rule.stop_after_acknowledged) { skipped += 1; continue; }
      if (prior?.reminder_status === "snoozed" && prior.snoozed_until && Date.parse(prior.snoozed_until) > Date.now()) { skipped += 1; continue; }
      if (prior && !candidate.rule.repeat_interval_days) { skipped += 1; continue; }
      if (prior?.reminder_date && candidate.rule.repeat_interval_days && dayDiffFrom(reminderDate, prior.reminder_date) < candidate.rule.repeat_interval_days) { skipped += 1; continue; }
      const reminderRows = await rest("employee_document_reminders", {
        method: "POST",
        body: JSON.stringify([{ employee_document_id: candidate.document.id, rule_id: candidate.rule.id,
          reminder_date: reminderDate, expiry_date: candidate.document.expiry_date }]),
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      }).then(({ data }) => data || []);
      if (!reminderRows[0]) { skipped += 1; continue; }
      if (candidate.days_to_expiry < 0 && candidate.document.status !== "in_renewal") {
        await patchOne("employee_documents", candidate.document.id, { status: "expired" }, null);
      }
      for (const recipient of await resolveReminderRecipients(candidate, actor)) {
        const recipientKey = recipient.profile_id || `employee-${recipient.employee_id}`;
        const notificationRows = await rest("hr_notifications", {
          method: "POST",
          body: JSON.stringify([{
            notification_type: candidate.days_to_expiry < 0 ? "document_overdue" : "document_expiry",
            employee_id: candidate.document.employee_id,
            document_id: candidate.document.id,
            reminder_id: reminderRows[0].id,
            recipient_profile_id: recipient.profile_id,
            recipient_employee_id: recipient.employee_id,
            channel: "in_app",
            title: candidate.days_to_expiry < 0 ? "เอกสารพนักงานหมดอายุแล้ว" : "เอกสารพนักงานใกล้หมดอายุ",
            message: candidate.days_to_expiry < 0 ? `เอกสารหมดอายุเกินกำหนด ${Math.abs(candidate.days_to_expiry)} วัน` : `เอกสารจะหมดอายุใน ${candidate.days_to_expiry} วัน`,
            idempotency_key: `hr-expiry:${candidate.document.id}:${candidate.rule.id}:${reminderDate}:in_app:${recipientKey}`,
          }]),
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        }).then(({ data }) => data || []);
        if (notificationRows[0]) created += 1; else skipped += 1;
      }
      if (candidate.rule.auto_open_renewal_case) await autoOpenRenewalCase(candidate, actor);
    } catch (error) {
      failed += 1;
      errors.push({ code: error?.code || "REMINDER_ITEM_FAILED", document_id: candidate.document.id });
    }
  }
  await patchOne("hr_job_runs", run.id, {
    status: "completed",
    completed_at: new Date().toISOString(),
    processed_count: candidates.length,
    created_count: created,
    skipped_count: skipped,
    failed_count: failed,
    error_summary: { errors: errors.slice(0, 50) },
    result_summary: { channel: "in_app", external_notifications_sent: 0, retry_limit: 3 },
  });
  return { dry_run: false, processed_count: candidates.length, created_count: created, skipped_count: skipped, failed_count: failed };
}

async function notificationContext(id, actor, edit = false) {
  const notification = await one(`hr_notifications?id=eq.${id}&select=*&limit=1`, "NOTIFICATION_NOT_FOUND");
  if (notification.employee_id) await assertEmployeeScope(actor, notification.employee_id, edit ? "edit" : "view");
  if (!actorIsAdmin(actor)
      && notification.recipient_profile_id
      && notification.recipient_profile_id !== actor.profile.id
      && !actor.permissions.has("hr.alert.manage")) {
    throw new ApiError(403, "HR_NOTIFICATION_SCOPE_DENIED", "Notification belongs to another recipient");
  }
  return notification;
}

async function acknowledgeNotification({ args, actor }) {
  const id = requireUuid(args.notification_id, "notification_id");
  const notification = await notificationContext(id, actor, false);
  return patchOne("hr_notifications", id, { status: "acknowledged", acknowledged_at: new Date().toISOString() }, args.version_no || notification.version_no);
}

async function snoozeNotification({ args, actor }) {
  const id = requireUuid(args.notification_id, "notification_id");
  const notification = await notificationContext(id, actor, true);
  const snoozedUntil = new Date(requireText(args.snoozed_until, "snoozed_until", 40));
  if (Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= new Date()) throw new ApiError(400, "VALIDATION_ERROR", "snoozed_until must be in the future");
  return patchOne("hr_notifications", id, { status: "snoozed", snoozed_until: snoozedUntil.toISOString() }, args.version_no || notification.version_no);
}

async function closeNotification({ args, actor }) {
  const id = requireUuid(args.notification_id, "notification_id");
  const notification = await notificationContext(id, actor, true);
  return patchOne("hr_notifications", id, { status: "closed", closed_at: new Date().toISOString() }, args.version_no || notification.version_no);
}

async function createLeaveRequest({ args, actor }) {
  const employeeId = requireUuid(args.employee_id, "employee_id");
  await assertEmployeeScope(actor, employeeId, "edit");
  const startDate = requiredDate(args.start_date, "start_date");
  const endDate = requiredDate(args.end_date, "end_date");
  if (endDate < startDate) throw new ApiError(400, "VALIDATION_ERROR", "end_date precedes start_date");
  const existing = await rest(`employee_leave_requests?employee_id=eq.${employeeId}&status=in.(draft,submitted,approved)&select=id,start_date,end_date`)
    .then(({ data }) => data || []);
  if (existing.some((row) => datesOverlap(startDate, endDate, row.start_date, row.end_date))) {
    throw new ApiError(409, "LEAVE_OVERLAP", "Leave request overlaps an existing request");
  }
  const requestedDays = optionalNumber(args.requested_days, "requested_days", { minimum: 0.01 });
  if (requestedDays == null) throw new ApiError(400, "VALIDATION_ERROR", "requested_days is required");
  return insertOne("employee_leave_requests", {
    request_no: `LEV-${Date.now()}-${randomUUID().slice(0, 8)}`,
    employee_id: employeeId,
    leave_type_id: requireUuid(args.leave_type_id, "leave_type_id"),
    start_date: startDate,
    end_date: endDate,
    requested_days: requestedDays,
    reason: textOrNull(args.reason, 3000),
    status: enumValue(args.status || "draft", "status", ["draft", "submitted"]),
    created_by_profile_id: actor.profile.id,
  });
}

async function leaveDecision(args, actor, decision) {
  const id = requireUuid(args.leave_request_id, "leave_request_id");
  const leave = await one(`employee_leave_requests?id=eq.${id}&select=*&limit=1`, "LEAVE_REQUEST_NOT_FOUND");
  await assertEmployeeScope(actor, leave.employee_id, "edit");
  const changed = await patchOne("employee_leave_requests", id, { status: decision }, args.version_no || leave.version_no, "submitted");
  await insertOne("employee_leave_approvals", {
    leave_request_id: id,
    approval_step: requiredInteger(args.approval_step || 1, "approval_step"),
    approver_profile_id: actor.profile.id,
    decision,
    decided_at: new Date().toISOString(),
    comment: textOrNull(args.comment, 2000),
  });
  await insertOne("employee_leave_history", {
    leave_request_id: id,
    previous_status: leave.status,
    new_status: decision,
    changed_by_profile_id: actor.profile.id,
    reason: textOrNull(args.comment, 2000),
  });
  return changed;
}

function approveLeaveRequest({ args, actor }) { return leaveDecision(args, actor, "approved"); }
function rejectLeaveRequest({ args, actor }) { return leaveDecision(args, actor, "rejected"); }

async function cancelLeaveRequest({ args, actor }) {
  const id = requireUuid(args.leave_request_id, "leave_request_id");
  const leave = await one(`employee_leave_requests?id=eq.${id}&select=*&limit=1`, "LEAVE_REQUEST_NOT_FOUND");
  await assertEmployeeScope(actor, leave.employee_id, "edit");
  const changed = await patchOne("employee_leave_requests", id, { status: "cancelled" }, args.version_no || leave.version_no, "draft,submitted,approved");
  await insertOne("employee_leave_history", {
    leave_request_id: id,
    previous_status: leave.status,
    new_status: "cancelled",
    changed_by_profile_id: actor.profile.id,
    reason: requireText(args.reason, "reason", 2000),
  });
  return changed;
}

function requestHash(actionName, args, actor) {
  return createHash("sha256").update(JSON.stringify({ actionName, args, actor: actor.profile.id })).digest("hex");
}

async function claimIdempotency(key, actionName, hash, actor) {
  const { data } = await rest("farm_action_idempotency", {
    method: "POST",
    body: JSON.stringify([{
      idempotency_key: key,
      action_name: `hr:${actionName}`,
      actor_profile_id: actor.profile.id,
      request_hash: hash,
      status: "processing",
    }]),
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
  });
  if (data?.length) return { claimed: true };
  const existing = await one(`farm_action_idempotency?idempotency_key=eq.${encodeURIComponent(key)}&select=*&limit=1`, "IDEMPOTENCY_NOT_FOUND");
  if (existing.request_hash !== hash) throw new ApiError(409, "IDEMPOTENCY_PAYLOAD_MISMATCH", "Idempotency key was used with another payload");
  if (existing.status === "completed") return { claimed: false, response: existing.response_json };
  throw new ApiError(409, "ACTION_IN_PROGRESS", "Action is already processing");
}

async function finishIdempotency(key, response, error = null) {
  await rest(`farm_action_idempotency?idempotency_key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: error ? "failed" : "completed",
      response_json: error ? null : response,
      error_json: error,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
  });
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  let idempotencyKey = "";
  try {
    const actor = await authenticate(req);
    if (req.method === "GET") return json(res, 200, { ok: true, route: "hr-actions", authRequired: true, actions: Object.keys(ACTIONS) });
    if (req.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await readBody(req);
    const actionName = requireText(body.action, "action", 120);
    const definition = ACTIONS[actionName];
    if (!definition) throw new ApiError(400, "ACTION_NOT_ALLOWED", `Action is not allowlisted: ${actionName}`);
    authorize(actor, { permissions: [definition.permission] });
    if (definition.confirmation && body.confirmed !== true) throw new ApiError(409, "CONFIRMATION_REQUIRED", "This action requires confirmed=true");
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
    await assertFeatureEnabled(actionName, args);
    idempotencyKey = requireText(req.headers?.["idempotency-key"] || body.idempotency_key, "idempotency_key", 200);
    const claim = await claimIdempotency(idempotencyKey, actionName, requestHash(actionName, args, actor), actor);
    if (!claim.claimed) return json(res, 200, claim.response);
    await audit(req, actor, `hr_action.requested.${actionName}`, definition.entity, null, {
      reason: String(body.reason || args.reason || "").slice(0, 500),
      idempotency_key: idempotencyKey,
    });
    const result = await definition.execute({ args, actor, idempotencyKey });
    const response = { ok: true, action: actionName, idempotencyKey, result };
    await audit(req, actor, `hr_action.completed.${actionName}`, definition.entity, result?.id || null, {
      idempotency_key: idempotencyKey,
      sensitive_values_included: false,
    });
    await finishIdempotency(idempotencyKey, response);
    return json(res, 200, response);
  } catch (error) {
    if (idempotencyKey && !["ACTION_IN_PROGRESS", "IDEMPOTENCY_PAYLOAD_MISMATCH"].includes(error?.code)) {
      await finishIdempotency(idempotencyKey, null, {
        code: error?.code || "INTERNAL_ERROR",
        message: error?.status && error.status < 500 ? error.message : "HR action failed",
      }).catch(() => {});
    }
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  ACTIONS,
  FEATURE_FLAG_BY_ACTION,
  RENEWAL_TRANSITIONS,
  datesOverlap,
  dayDiff,
  dayDiffFrom,
  requestHash,
};
module.exports._schedulerRun = runExpiryReminders;
