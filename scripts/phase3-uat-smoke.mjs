import { randomUUID } from "node:crypto";

const baseUrl = String(process.argv[2] || "http://127.0.0.1:3001").replace(/\/$/, "");
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase server environment is not configured");

const identities = {
  manager: process.env.UAT_MANAGER_USER_ID,
  supervisor: process.env.UAT_SUPERVISOR_USER_ID,
};
if (!identities.manager || !identities.supervisor) throw new Error("UAT identity IDs are not configured");

const outcomes = [];

async function jsonResponse(response) {
  return response.json().catch(() => null);
}

async function admin(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase admin request failed (${response.status})`);
  return jsonResponse(response);
}

async function createSession(userId) {
  const user = await admin(`/auth/v1/admin/users/${userId}`);
  const link = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email: user.email }),
  });
  const tokenHash = link?.properties?.hashed_token || link?.hashed_token;
  if (!tokenHash) throw new Error("Supabase did not return a UAT verification hash");
  const response = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ token_hash: tokenHash, type: "email" }),
  });
  const session = await jsonResponse(response);
  if (!response.ok || !session?.access_token) throw new Error(`UAT sign-in failed (${response.status})`);
  return session.access_token;
}

async function api(token, path, options = {}, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await jsonResponse(response);
  if (response.status !== expected) {
    throw new Error(
      `${path} returned ${response.status}/${payload?.error?.code || "UNKNOWN"}`
      + `${payload?.error?.details?.field ? ` (${payload.error.details.field})` : ""}`
      + `: ${payload?.error?.message || "Request failed"}`,
    );
  }
  return { response, payload };
}

async function action(token, actionName, args = {}, expected = 200) {
  const { payload } = await api(token, "/api/farm-actions", {
    method: "POST",
    headers: { "Idempotency-Key": `uat-${actionName}-${randomUUID()}` },
    body: JSON.stringify({
      action: actionName,
      args,
      confirmed: true,
      reason: "Phase 3 UAT validation",
    }),
  }, expected);
  outcomes.push({ check: actionName, status: expected, code: payload?.error?.code || "OK" });
  return payload;
}

function originalRows(rows, key) {
  return (rows || []).filter((row) => String(row[key] || "").startsWith("WEBTEST-2569"));
}

const managerToken = await createSession(identities.manager);
const supervisorToken = await createSession(identities.supervisor);

const managerSession = await api(managerToken, "/api/farm-session");
const supervisorSession = await api(supervisorToken, "/api/farm-session");
if (!managerSession.payload.roles.includes("uat_manager")) throw new Error("Manager role is missing");
if (!supervisorSession.payload.roles.includes("uat_supervisor")) throw new Error("Supervisor role is missing");
outcomes.push({ check: "authenticated_sessions", status: 200, manager: true, supervisor: true });

const tables = [
  "v_app_navigation", "v_app_workspace_definition", "v_app_workspace_tabs",
  "v_management_action_center", "v_system_module_readiness", "annual_work_plans",
  "work_orders", "work_results", "work_result_workers", "work_result_weight_tickets",
  "survey_templates", "survey_questions", "survey_responses", "survey_answers",
  "survey_findings", "survey_response_attachments", "work_performance_metrics",
  "payroll_periods", "v_farm_workflow_workspace", "v_daily_work_entry_context",
].join(",");
const managerRead = await api(
  managerToken,
  `/api/farm-tables?tables=${tables}&limit=5000&refresh=1`,
);
const data = managerRead.payload.tables;
const originalOrders = originalRows(data.work_orders, "work_order_no");
const originalResults = originalRows(data.work_results, "result_no");
const originalResponses = originalRows(data.survey_responses, "response_no");
const originalFindings = originalRows(data.survey_findings, "finding_no");
const originalPlans = (data.annual_work_plans || []).filter((row) =>
  String(row.plan_name || row.note || "").includes("WEBTEST-2569"));
const originalTickets = (data.work_result_weight_tickets || []).filter((row) =>
  originalResults.some((result) => result.id === row.work_result_id));
const verifiedHarvest = originalResults.find((row) => row.result_no === "WEBTEST-2569-RES-HARV-001");
const harvestSurvey = originalResponses.find((row) => row.response_no === "WEBTEST-2569-RESP-HARV-001");
if (!verifiedHarvest || verifiedHarvest.result_status !== "verified") throw new Error("Verified harvest result is missing");
if (originalTickets.length !== 2
  || originalTickets.reduce((sum, row) => sum + Number(row.allocated_weight_kg || 0), 0) !== 22250) {
  throw new Error("Inbound ticket validation failed");
}
if (Number(harvestSurvey?.score_pct) !== 79) throw new Error("Harvest survey score validation failed");
if (originalFindings.filter((row) => row.status === "open").length !== 1) throw new Error("Open finding validation failed");
if ((data.v_management_action_center || []).length === 0) throw new Error("Scoped Action Center is empty");
if ((data.survey_templates || []).length !== 4) throw new Error("Survey template validation failed");
if (originalResponses.length !== 4 || originalFindings.length !== 3) throw new Error("Survey scenario validation failed");
if ((data.survey_response_attachments || []).length !== 5) throw new Error("Survey attachment validation failed");
if ((data.work_performance_metrics || []).filter((row) =>
  originalResults.some((result) => result.id === row.work_result_id)).length !== 18) {
  throw new Error("Performance metric validation failed");
}
if ((data.payroll_periods || []).length !== 2) throw new Error("Payroll period validation failed");
outcomes.push({
  check: "manager_reference_read",
  status: 200,
  plans: originalPlans.length,
  workOrders: originalOrders.length,
  results: originalResults.length,
  inboundTickets: originalTickets.length,
  inboundWeightKg: originalTickets.reduce((sum, row) => sum + Number(row.allocated_weight_kg || 0), 0),
  surveyScorePct: Number(harvestSurvey.score_pct),
  surveyTemplates: data.survey_templates.length,
  surveyResponses: originalResponses.length,
  surveyFindings: originalFindings.length,
  surveyAttachments: data.survey_response_attachments.length,
  performanceMetrics: data.work_performance_metrics.filter((row) =>
    originalResults.some((result) => result.id === row.work_result_id)).length,
  payrollPeriods: data.payroll_periods.length,
  actionCenterItems: data.v_management_action_center.length,
  openFindings: originalFindings.filter((row) => row.status === "open").length,
});

const managerClone = (data.work_orders || []).find((row) => row.work_order_no === "WEBTEST-UAT-MGR-WO-001");
const supervisorClone = (data.work_orders || []).find((row) => row.work_order_no === "WEBTEST-UAT-SUP-WO-001");
const supervisorResult = (data.work_results || []).find((row) => row.result_no === "WEBTEST-UAT-RES-SUP-001");
const safetyResponse = (data.survey_responses || []).find((row) => row.response_no === "WEBTEST-UAT-RESP-SAFETY-001");
if (!managerClone || !supervisorClone || !supervisorResult || !safetyResponse) throw new Error("UAT clone is incomplete");

await action(supervisorToken, "approve_work_order", { work_order_id: managerClone.id }, 403);
await action(managerToken, "submit_work_order", { work_order_id: managerClone.id });
await action(managerToken, "approve_work_order", { work_order_id: managerClone.id });
await action(managerToken, "dispatch_work_order", { work_order_id: managerClone.id });

const resultDate = supervisorResult.result_date;
const firstResult = await action(supervisorToken, "get_or_create_work_result", {
  work_order_id: supervisorClone.id,
  result_date: resultDate,
});
const secondResult = await action(supervisorToken, "get_or_create_work_result", {
  work_order_id: supervisorClone.id,
  result_date: resultDate,
});
const firstResultId = firstResult.result?.id || firstResult.result;
const secondResultId = secondResult.result?.id || secondResult.result;
if (firstResultId !== supervisorResult.id || secondResultId !== supervisorResult.id) {
  throw new Error("get_or_create_work_result did not reuse the existing draft");
}

await action(supervisorToken, "save_work_result_draft", {
  result_id: supervisorResult.id,
  actual_quantity: 12,
  actual_unit: supervisorResult.actual_unit || "ไร่",
  completion_pct: 100,
  quality_score: 85,
  survey_status: "pending",
  note: "Phase 3 UAT supervisor draft",
});

await action(supervisorToken, "submit_survey_response", { response_id: safetyResponse.id }, 409);
const safetyQuestions = (data.survey_questions || []).filter((row) => row.template_id === safetyResponse.template_id);
const answers = safetyQuestions.map((question) => ({
  question_id: question.id,
  answer_text: ["text", "photo", "file", "signature"].includes(question.answer_type) ? "UAT validated" : null,
  answer_number: question.answer_type === "number" ? 1 : null,
  answer_boolean: question.answer_type === "boolean" ? true : null,
  answer_json: question.answer_type === "json" ? { uat: true } : {},
  score_awarded: Number(question.max_score || 0),
  is_compliant: true,
}));
await action(supervisorToken, "save_survey_draft", {
  response_id: safetyResponse.id,
  answers,
});
await action(supervisorToken, "submit_survey_response", { response_id: safetyResponse.id });
await action(supervisorToken, "submit_work_result", { result_id: supervisorResult.id });
await action(supervisorToken, "close_work_result", { result_id: supervisorResult.id }, 403);
await action(managerToken, "verify_work_result", { result_id: supervisorResult.id });
await action(managerToken, "close_work_result", { result_id: supervisorResult.id });

const originalSameScope = originalOrders[0];
await action(managerToken, "submit_work_order", { work_order_id: originalSameScope.id }, 403);

const assignedBlocks = new Set(managerSession.payload.scopes.map((scope) => scope.block_id).filter(Boolean));
const outside = await admin(`/rest/v1/work_orders?select=id,block_id&limit=100`);
const outsideOrder = (outside || []).find((row) => row.block_id && !assignedBlocks.has(row.block_id));
if (outsideOrder) {
  await action(supervisorToken, "get_or_create_work_result", {
    work_order_id: outsideOrder.id,
    result_date: new Date().toISOString().slice(0, 10),
  }, 403);
  outcomes.push({ check: "scope_mismatch", status: 403 });
} else {
  outcomes.push({ check: "scope_mismatch", status: "not_applicable_no_outside_order" });
}

await api("", "/api/farm-tables?table=work_orders", {}, 401);
await api("invalid-token", "/api/farm-tables?table=work_orders", {}, 401);
await api(managerToken, "/api/farm-tables", {
  method: "POST",
  body: JSON.stringify({ table: "work_orders", row: { id: randomUUID() } }),
}, 403);
await api(managerToken, "/api/farm-tables", { method: "PATCH", body: "{}" }, 405);
await api("", "/api/farm-tables?healthcheck=1");
outcomes.push({ check: "negative_and_recovery", noToken: 401, invalidToken: 401, directWrite: 403, invalidMethod: 405, health: 200 });

await api(managerToken, "/api/farm-auth", {
  method: "POST",
  body: JSON.stringify({ action: "sign_out" }),
});
await api(managerToken, "/api/farm-tables?table=work_orders", {}, 401);
outcomes.push({ check: "logout_revokes_session", status: 401 });

console.log(JSON.stringify({ ok: true, baseUrl, outcomes }, null, 2));
