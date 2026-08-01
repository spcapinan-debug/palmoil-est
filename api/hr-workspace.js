const {
  ApiError,
  authenticate,
  authorize,
  errorResponse,
  json,
  requireUuid,
  rest,
} = require("../lib/server/farm-api");
const {
  actorIsAdmin,
  assertEmployeeScope,
  loadScopedEmployeeIds,
} = require("../lib/server/hr-api");

const MODES = new Set(["summary", "employees", "employee", "data-quality", "documents", "renewals", "configuration"]);
const MAX_PAGE_SIZE = 100;

function can(actor, permission) {
  return actorIsAdmin(actor) || actor.permissions.has(permission);
}

function canAny(actor, permissions) {
  return actorIsAdmin(actor) || permissions.some((permission) => actor.permissions.has(permission));
}

function pageOptions(url) {
  const page = Math.max(Number.parseInt(url.searchParams.get("page") || "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(url.searchParams.get("pageSize") || "25", 10) || 25, 1), MAX_PAGE_SIZE);
  return { page, pageSize };
}

function scopedRows(rows, employeeIds) {
  return employeeIds == null ? rows : rows.filter((row) => employeeIds.has(row.employee_id));
}

function paginate(rows, { page, pageSize }) {
  const total = rows.length;
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    pagination: { page: safePage, pageSize, total, pageCount, hasMore: safePage < pageCount },
  };
}

async function rows(path) {
  return rest(path).then(({ data }) => Array.isArray(data) ? data : []);
}

async function employee360(actor) {
  authorize(actor, { permissions: ["hr.employee.view"] });
  const [employeeIds, result] = await Promise.all([
    loadScopedEmployeeIds(actor),
    rows("v_hr_employee_360?select=*&order=employee_code.asc&limit=5000"),
  ]);
  return scopedRows(result, employeeIds);
}

function summaryFromEmployees(employees) {
  const nationality = {};
  const department = {};
  for (const employee of employees) {
    const nationalityName = employee.nationality || "ไม่ระบุ";
    const departmentName = employee.department_name || "ไม่ระบุแผนก";
    nationality[nationalityName] = (nationality[nationalityName] || 0) + 1;
    department[departmentName] = (department[departmentName] || 0) + 1;
  }
  return {
    currentEmployees: employees.length,
    activeEmployees: employees.filter((row) => row.employee_status === "active").length,
    migrantEmployees: employees.filter((row) => row.nationality && !/^thai|ไทย$/i.test(row.nationality)).length,
    missingDepartment: employees.filter((row) => !row.department_id).length,
    expiredDocuments: employees.reduce((sum, row) => sum + Number(row.expired_document_count || 0), 0),
    due90Documents: employees.reduce((sum, row) => sum + Number(row.due_90_document_count || 0), 0),
    openRenewals: employees.reduce((sum, row) => sum + Number(row.open_renewal_count || 0), 0),
    nationality,
    department,
  };
}

async function getSummary(actor) {
  authorize(actor, { permissions: ["hr.analytics.view", "hr.employee.view"] });
  const employees = await employee360(actor);
  const result = { metrics: summaryFromEmployees(employees), alerts: [], renewalPipeline: [], featureFlags: {} };
  const employeeIds = await loadScopedEmployeeIds(actor);
  if (can(actor, "hr.document.view")) {
    const expiry = scopedRows(await rows(
      "v_hr_document_expiry?select=document_id,employee_id,employee_code,full_name,document_type_name_th,document_number_masked,expiry_date,days_to_expiry,status,verification_status&order=expiry_date.asc&limit=1000",
    ), employeeIds);
    result.alerts = expiry.filter((row) => Number(row.days_to_expiry) <= 90).slice(0, 12);
  }
  if (can(actor, "hr.renewal.view")) {
    result.renewalPipeline = await rows("v_hr_renewal_pipeline?select=*&order=status.asc,priority.asc");
  }
  result.featureFlags = await getFeatureFlags();
  return result;
}

async function getEmployees(actor, url) {
  let result = await employee360(actor);
  const query = String(url.searchParams.get("q") || "").trim().toLocaleLowerCase("th");
  const status = String(url.searchParams.get("status") || "").trim();
  const nationality = String(url.searchParams.get("nationality") || "").trim();
  const departmentId = String(url.searchParams.get("departmentId") || "").trim();
  if (query) result = result.filter((row) => `${row.employee_code} ${row.full_name}`.toLocaleLowerCase("th").includes(query));
  if (status) result = result.filter((row) => row.employee_status === status);
  if (nationality) result = result.filter((row) => (row.nationality || "") === nationality);
  if (departmentId) result = result.filter((row) => row.department_id === departmentId);
  return { ...paginate(result, pageOptions(url)), filters: { query, status, nationality, departmentId } };
}

async function getEmployee(actor, url) {
  authorize(actor, { permissions: ["hr.employee.view"] });
  const employeeId = requireUuid(url.searchParams.get("id"), "id");
  await assertEmployeeScope(actor, employeeId, "view");
  const [employeeRows, statusHistory, housing] = await Promise.all([
    rows(`v_hr_employee_360?employee_id=eq.${employeeId}&select=*&limit=1`),
    rows(`employee_status_history?employee_id=eq.${employeeId}&select=id,previous_status,new_status,effective_date,reason,created_at&order=effective_date.desc&limit=100`),
    rows(`employee_housing_assignments?employee_id=eq.${employeeId}&select=id,housing_unit_id,start_date,end_date,occupant_count,share_utility_percent,status,note&order=start_date.desc&limit=100`),
  ]);
  if (!employeeRows[0]) throw new ApiError(404, "EMPLOYEE_NOT_FOUND", "Employee was not found");
  const response = {
    employee: employeeRows[0], statusHistory, housing, training: [], certifications: [], assets: [],
    personal: null, emergencyContacts: [], documents: [], renewals: [], leave: [], attendance: [], payroll: [], medical: [], cases: [],
    capabilities: {
      sensitive: can(actor, "hr.employee.sensitive.view"),
      documentView: can(actor, "hr.document.view"),
      documentDownload: can(actor, "hr.document.download"),
      renewalView: can(actor, "hr.renewal.view"),
      medicalView: can(actor, "hr.medical.view"),
      caseView: can(actor, "hr.case.view"),
    },
  };
  const optionalReads = [];
  if (response.capabilities.sensitive) {
    optionalReads.push(rows(`employee_personal_profiles?employee_id=eq.${employeeId}&select=id,title,first_name_th,last_name_th,first_name_en,last_name_en,first_name_native,last_name_native,gender,birth_date,marital_status,blood_group,religion,nationality,native_language,preferred_language,photo_path,note,version_no,updated_at&limit=1`).then((data) => { response.personal = data[0] || null; }));
    optionalReads.push(rows(`employee_emergency_contacts?employee_id=eq.${employeeId}&select=id,contact_name,relationship,phone,address,preferred_language,priority_no,status,version_no&order=priority_no.asc,contact_name.asc`).then((data) => { response.emergencyContacts = data; }));
  }
  if (response.capabilities.documentView) {
    optionalReads.push(rows(`v_hr_document_expiry?employee_id=eq.${employeeId}&select=*&order=expiry_date.asc`).then((data) => { response.documents = data; }));
  }
  if (response.capabilities.renewalView) {
    optionalReads.push(rows(`employee_renewal_cases?employee_id=eq.${employeeId}&select=id,document_id,new_document_id,case_no,renewal_type,status,priority,target_completion_date,submitted_date,appointment_date,completed_date,assigned_hr_profile_id,estimated_cost,actual_cost,note,version_no,created_at,updated_at&order=created_at.desc`).then((data) => { response.renewals = data; }));
  }
  if (can(actor, "hr.training.view")) {
    optionalReads.push(rows(`employee_training_records?employee_id=eq.${employeeId}&select=id,course_id,started_on,completed_on,result_status,score,version_no&order=started_on.desc&limit=100`).then((data) => { response.training = data; }));
    optionalReads.push(rows(`employee_certifications?employee_id=eq.${employeeId}&select=id,certification_code,certification_name,issued_on,expires_on,status,version_no&order=expires_on.asc&limit=100`).then((data) => { response.certifications = data; }));
  }
  if (can(actor, "hr.asset.view")) {
    optionalReads.push(rows(`employee_asset_assignments?employee_id=eq.${employeeId}&select=id,asset_type,asset_reference,assigned_on,returned_on,status,note,version_no&order=assigned_on.desc&limit=100`).then((data) => { response.assets = data; }));
  }
  if (can(actor, "hr.leave.view") || can(actor, "hr.leave.manage")) {
    optionalReads.push(rows(`employee_leave_requests?employee_id=eq.${employeeId}&select=id,request_no,leave_type_id,start_date,end_date,requested_days,status,reason,payroll_effect_status,version_no,created_at&order=start_date.desc&limit=100`).then((data) => { response.leave = data; }));
  }
  if (can(actor, "hr.attendance.view")) {
    optionalReads.push(rows(`v_hr_attendance_summary?employee_id=eq.${employeeId}&select=*&order=attendance_month.desc&limit=24`).then((data) => { response.attendance = data; }));
  }
  if (canAny(actor, ["hr.payroll.view", "payroll.view"])) {
    optionalReads.push(rows(`payroll_employee_summaries?employee_id=eq.${employeeId}&select=id,payroll_period_id,gross_amount,net_amount,overtime_earning,allowance_amount,deduction_amount,status&limit=100`).then((data) => { response.payroll = data; }));
  }
  if (response.capabilities.medicalView) {
    optionalReads.push(rows(`employee_medical_exams?employee_id=eq.${employeeId}&select=id,exam_type_id,exam_date,next_exam_date,fitness_status,provider_name,document_id,version_no,updated_at&order=exam_date.desc&limit=100`).then((data) => { response.medical = data; }));
  }
  if (response.capabilities.caseView) {
    optionalReads.push(rows(`employee_cases?employee_id=eq.${employeeId}&select=id,case_no,case_type,title,status,opened_on,closed_on,assigned_profile_id,version_no,updated_at&order=opened_on.desc&limit=100`).then((data) => { response.cases = data; }));
  }
  await Promise.all(optionalReads);
  return response;
}

async function getDataQuality(actor, url) {
  authorize(actor, { permissions: ["hr.data_quality.view"] });
  const [employeeIds, allRows] = await Promise.all([
    loadScopedEmployeeIds(actor),
    rows("v_hr_employee_data_quality?select=*&order=issue_count.desc,employee_code.asc&limit=5000"),
  ]);
  let result = scopedRows(allRows, employeeIds);
  const onlyIssues = url.searchParams.get("onlyIssues") !== "0";
  if (onlyIssues) result = result.filter((row) => Number(row.issue_count) > 0);
  const counts = {
    records: result.length,
    issues: result.reduce((sum, row) => sum + Number(row.issue_count || 0), 0),
    missingDepartment: result.filter((row) => row.missing_department).length,
    missingNationality: result.filter((row) => row.missing_nationality).length,
    missingPhone: result.filter((row) => row.missing_phone).length,
    missingIdentification: result.filter((row) => row.missing_identification).length,
    missingEmergencyContact: result.filter((row) => row.missing_emergency_contact).length,
    missingRequiredDocument: result.filter((row) => Number(row.missing_required_document_count) > 0).length,
  };
  return { counts, ...paginate(result, pageOptions(url)), cleanupMode: "preview-only" };
}

async function getDocuments(actor, url) {
  authorize(actor, { permissions: ["hr.document.view"] });
  const [employeeIds, allRows] = await Promise.all([
    loadScopedEmployeeIds(actor),
    rows("v_hr_document_expiry?select=*&order=expiry_date.asc&limit=5000"),
  ]);
  let result = scopedRows(allRows, employeeIds);
  const windowDays = Number.parseInt(url.searchParams.get("withinDays") || "", 10);
  if (Number.isFinite(windowDays)) result = result.filter((row) => Number(row.days_to_expiry) <= windowDays);
  return paginate(result, pageOptions(url));
}

async function getRenewals(actor, url) {
  authorize(actor, { permissions: ["hr.renewal.view"] });
  const [employeeIds, allRows] = await Promise.all([
    loadScopedEmployeeIds(actor),
    rows("employee_renewal_cases?select=id,employee_id,document_id,new_document_id,case_no,renewal_type,status,priority,target_completion_date,submitted_date,appointment_date,completed_date,assigned_hr_profile_id,estimated_cost,actual_cost,note,version_no,created_at,updated_at&order=created_at.desc&limit=5000"),
  ]);
  let result = scopedRows(allRows, employeeIds);
  const status = String(url.searchParams.get("status") || "").trim();
  if (status) result = result.filter((row) => row.status === status);
  return paginate(result, pageOptions(url));
}

async function getFeatureFlags() {
  const settings = await rows("system_settings?setting_group=in.(hr_feature_flags,hr)&select=setting_key,setting_value,status&order=setting_key.asc");
  return Object.fromEntries(settings
    .filter((row) => row.setting_key.endsWith("_enabled"))
    .map((row) => [row.setting_key, row.setting_value === true || row.setting_value === "true"]));
}

async function getConfiguration(actor) {
  authorize(actor, { permissions: ["hr.employee.view", "hr.document.view"] });
  const [featureFlags, documentTypes, departments, positions] = await Promise.all([
    getFeatureFlags(),
    can(actor, "hr.document.view")
      ? rows("employee_document_types?select=id,document_type_code,document_type_name_th,document_type_name_en,category,is_required,has_expiry_date,verification_required,legal_basis_reference,legal_verified_at,status,sort_order&order=sort_order.asc")
      : [],
    rows("departments?status=eq.active&select=id,department_code,department_name&order=department_name.asc"),
    rows("positions?status=eq.active&select=id,position_code,position_name&order=position_name.asc"),
  ]);
  return { featureFlags, documentTypes, departments, positions, externalNotificationsEnabled: false };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    if (req.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const actor = await authenticate(req);
    const url = new URL(req.url, "http://localhost");
    const mode = String(url.searchParams.get("mode") || "summary");
    if (!MODES.has(mode)) throw new ApiError(400, "INVALID_MODE", "Requested HR workspace mode is not allowed");
    const handlers = {
      summary: getSummary,
      employees: getEmployees,
      employee: getEmployee,
      "data-quality": getDataQuality,
      documents: getDocuments,
      renewals: getRenewals,
      configuration: getConfiguration,
    };
    const data = await handlers[mode](actor, url);
    return json(res, 200, { ok: true, mode, data, generatedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { MAX_PAGE_SIZE, MODES, pageOptions, paginate, scopedRows, summaryFromEmployees };
