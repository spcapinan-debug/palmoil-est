const {
  ApiError,
  audit,
  authenticate,
  authorize,
  errorResponse,
  json,
  readBody,
  requireUuid,
  rest,
} = require("./_farm-api");

const TABLES = new Set([
  "profiles", "areas", "people", "worker_documents", "person_housing_assignments",
  "activity_wage_codes", "activity_material_rates", "inventory_master", "inventory_documents",
  "inventory_document_lines", "work_plans", "plan_materials", "work_order_resources",
  "payroll_lines", "payroll_rules", "access_scopes", "approval_logs", "master_versions",
  "estates", "zones", "plot_groups", "plots", "blocks", "departments", "positions",
  "housing_units", "employees", "employee_employment_terms", "attendance_records",
  "leave_requests", "training_records", "performance_reviews", "employee_housing_assignments",
  "housing_utility_charges", "contractors", "teams", "team_members", "team_activity_skills",
  "activity_groups", "wage_codes", "activities", "activity_wage_code_mappings",
  "material_categories", "units", "unit_conversions", "sku_conversions", "materials",
  "material_lots", "activity_material_usage_rates", "vehicles", "annual_work_plans",
  "planned_work_items", "planned_work_materials", "work_orders", "work_order_workers",
  "work_order_materials", "work_order_machines", "work_order_approvals", "work_order_qr_codes",
  "work_order_locations", "work_order_status_logs", "work_attendance", "work_results",
  "work_result_workers", "work_result_weight_tickets", "work_result_vehicle_usage",
  "warehouses", "bin_locations", "stock_transactions", "stock_balances", "goods_issues",
  "goods_issue_lines", "budget_years", "budget_activity_rates", "budget_rate_blocks",
  "budget_rate_materials", "budget_rate_roles", "budget_rate_rule_sets", "budget_rate_rules",
  "budget_rate_rule_conditions", "budget_rate_rule_blocks", "budget_rate_block_snapshots",
  "activity_budget_rate_recommendations", "activity_performance_standards",
  "work_performance_metrics", "contractor_period_estimates", "cost_entries", "payroll_periods",
  "payroll_period_lines", "payroll_rates", "payroll_employee_summaries", "payroll_earning_lines",
  "payroll_allowance_lines", "payroll_deduction_lines", "deduction_types", "allowance_types",
  "fuel_tanks", "fuel_requisitions", "fuel_issues", "vehicle_fuel_balances",
  "vehicle_fuel_measurements", "vehicle_fuel_consumption_periods",
  "vehicle_fuel_efficiency_standards", "survey_templates", "survey_questions",
  "survey_template_assignments", "survey_responses", "survey_answers",
  "survey_response_attachments", "survey_answer_attachments", "survey_findings",
  "roles", "permissions", "role_permissions", "menu_items", "profile_roles",
  "user_access_scopes", "master_record_versions", "audit_logs", "system_settings",
  "attachments", "report_exports",
  "v_app_navigation", "v_app_workspace_definition", "v_app_workspace_tabs",
  "v_management_action_center", "v_system_module_readiness", "v_farm_workflow_workspace",
  "v_daily_work_entry_context", "v_inventory_work_order_workspace", "v_inventory_setup_queue",
  "v_vehicle_fuel_status", "v_work_result_vehicle_fuel_detail", "v_fuel_control_exceptions",
  "v_hr_people_workspace", "v_payroll_period_workspace", "v_budget_activity_rates_unified",
  "v_budget_rate_rule_editor", "v_budget_rate_announcement_matrix",
  "v_survey_response_summary", "v_survey_question_analysis", "v_survey_finding_followup",
  "v_survey_action_center", "v_available_inbound_weight_tickets",
]);

const READ_RESTRICTED = {
  audit_logs: "system.audit.view",
  profiles: "system.user.manage",
  profile_roles: "system.role.manage",
  roles: "system.role.manage",
  permissions: "system.role.manage",
  role_permissions: "system.role.manage",
  user_access_scopes: "system.user.manage",
};

const WRITE_PERMISSIONS = {
  employees: "hr.employee.edit",
  employee_employment_terms: "hr.employee.edit",
  teams: "hr.team.manage",
  team_members: "hr.team.manage",
  annual_work_plans: "farm.plan.create",
  planned_work_items: "farm.plan.create",
  planned_work_materials: "farm.plan.create",
  work_orders: "farm.work_order.create",
  work_order_workers: "farm.work_order.dispatch",
  work_order_materials: "farm.work_order.dispatch",
  work_order_machines: "farm.work_order.dispatch",
  work_results: "farm.result.record",
  work_result_workers: "farm.result.record",
  work_result_weight_tickets: "farm.weigh_ticket.link",
  warehouses: "inventory.manage",
  material_lots: "inventory.manage",
  stock_balances: "inventory.manage",
  stock_transactions: "inventory.manage",
  goods_issues: "inventory.manage",
  goods_issue_lines: "inventory.manage",
  fuel_tanks: "fuel.issue",
  fuel_requisitions: "fuel.requisition.create",
  fuel_issues: "fuel.issue",
  survey_templates: "survey.template.manage",
  survey_questions: "survey.template.manage",
  survey_template_assignments: "survey.template.manage",
  survey_responses: "survey.respond",
  survey_answers: "survey.respond",
  survey_response_attachments: "survey.respond",
  survey_answer_attachments: "survey.respond",
  survey_findings: "survey.finding.manage",
  activity_performance_standards: "performance.standard.manage",
  activity_budget_rate_recommendations: "budget.recommendation.generate",
  budget_rate_rule_sets: "budget.rate_rule.manage",
  budget_rate_rules: "budget.rate_rule.manage",
  budget_rate_rule_conditions: "budget.rate_rule.manage",
  budget_rate_rule_blocks: "budget.rate_rule.manage",
  system_settings: "system.integration.manage",
};

const CONFLICT_KEYS = {
  estates: "estate_code", zones: "zone_code", plot_groups: "group_code", plots: "plot_code",
  blocks: "block_code", employees: "employee_code", teams: "team_code",
  activity_groups: "group_code", activities: "activity_code", materials: "material_code",
  vehicles: "vehicle_code", budget_years: "fiscal_year", budget_activity_rates: "rate_code",
  work_orders: "work_order_no", permissions: "permission_key", survey_templates: "template_code",
  survey_questions: "question_code",
};

const OPTIONAL_TABLES = new Set([...TABLES].filter((name) => name.startsWith("v_")));
const CACHE_MS = 30_000;
const cache = new Map();
const ACTION_ONLY_TABLES = new Set([
  "stock_transactions", "stock_balances", "goods_issues", "goods_issue_lines",
  "fuel_issues", "vehicle_fuel_balances", "vehicle_fuel_consumption_periods",
  "payroll_periods", "payroll_period_lines", "payroll_employee_summaries",
  "payroll_earning_lines", "payroll_allowance_lines", "payroll_deduction_lines",
  "budget_rate_block_snapshots", "survey_responses", "survey_answers", "survey_findings",
  "work_result_weight_tickets",
]);

function tableName(value) {
  const name = String(value || "").trim();
  if (!TABLES.has(name)) throw new ApiError(400, "INVALID_TABLE", `Table is not allowlisted: ${name || "(empty)"}`);
  return name;
}

function requestedTables(value) {
  const raw = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!raw.length) throw new ApiError(400, "TABLES_REQUIRED", "The tables query parameter is required");
  return [...new Set(raw.map(tableName))];
}

function readPermission(actor, table) {
  const permission = READ_RESTRICTED[table];
  if (permission) authorize(actor, { permissions: [permission] });
}

function writePermission(actor, table) {
  const permission = WRITE_PERMISSIONS[table];
  authorize(actor, permission ? { permissions: [permission] } : {});
}

function isMissingRelation(error) {
  return error?.status === 404 || /relation .* does not exist|schema cache|could not find the table/i.test(error?.message || "");
}

async function parallelMap(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function readTable(table, limit, offset) {
  try {
    const { data, response } = await rest(`${table}?select=*&limit=${limit}&offset=${offset}`, {
      headers: { Prefer: "count=exact" },
    });
    const range = String(response.headers.get("content-range") || "");
    const total = Number(range.split("/")[1]);
    return { table, rows: Array.isArray(data) ? data : [], total: Number.isFinite(total) ? total : null };
  } catch (error) {
    if (OPTIONAL_TABLES.has(table) && isMissingRelation(error)) return { table, rows: [], total: 0, warning: error.message };
    throw error;
  }
}

function clearCache() {
  cache.clear();
}

async function handleGet(req, res, url, actor) {
  const tables = requestedTables(url.searchParams.get("tables"));
  tables.forEach((table) => readPermission(actor, table));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 5000), 1), 5000);
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const offsetParam = url.searchParams.get("offset");
  const offset = offsetParam == null ? (page - 1) * limit : Math.max(Number(offsetParam), 0);
  const cacheKey = JSON.stringify({ tables: [...tables].sort(), limit, offset });
  const cached = cache.get(cacheKey);
  if (url.searchParams.get("refresh") !== "1" && cached && Date.now() - cached.at < CACHE_MS) {
    return json(res, 200, { ...cached.payload, source: { ...cached.payload.source, cache: "hit" } });
  }

  const reads = await parallelMap(tables, 8, (table) => readTable(table, limit, offset));
  const payload = {
    ok: true,
    tables: Object.fromEntries(reads.map((item) => [item.table, item.rows])),
    warnings: Object.fromEntries(reads.filter((item) => item.warning).map((item) => [item.table, item.warning])),
    pagination: Object.fromEntries(reads.map((item) => [item.table, {
      limit, offset, page: Math.floor(offset / limit) + 1, total: item.total,
      hasMore: item.total == null ? item.rows.length === limit : offset + item.rows.length < item.total,
    }])),
    source: {
      mode: "supabase-real-only",
      tableCount: tables.length,
      rowCount: reads.reduce((sum, item) => sum + item.rows.length, 0),
      cache: "miss",
      generatedAt: new Date().toISOString(),
    },
  };
  cache.set(cacheKey, { at: Date.now(), payload });
  return json(res, 200, payload);
}

async function handlePost(req, res, actor) {
  const body = await readBody(req);
  const table = tableName(body.table);
  writePermission(actor, table);
  if (ACTION_ONLY_TABLES.has(table)) {
    throw new ApiError(409, "ACTION_REQUIRED", `${table} must be changed through /api/farm-actions`);
  }
  const rows = Array.isArray(body.rows) ? body.rows : (body.row && typeof body.row === "object" ? [body.row] : []);
  if (!rows.length || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new ApiError(400, "VALIDATION_ERROR", "row or rows must contain JSON objects");
  }
  if (rows.length > 500) throw new ApiError(400, "VALIDATION_ERROR", "A request may write at most 500 rows");
  const conflict = String(body.onConflict || CONFLICT_KEYS[table] || "id");
  if (!/^[a-z_][a-z0-9_]*$/i.test(conflict)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid onConflict column");
  const { data } = await rest(`${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    body: JSON.stringify(rows),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  await audit(req, actor, `farm_table.upsert.${table}`, table, data?.[0]?.id, {
    reason: String(body.reason || "").slice(0, 500), count: Array.isArray(data) ? data.length : 0,
  });
  clearCache();
  return json(res, 200, { ok: true, table, count: data?.length || 0, rows: data || [] });
}

async function handleDelete(req, res, url, actor) {
  const body = await readBody(req).catch(() => ({}));
  const table = tableName(body.table || url.searchParams.get("table"));
  writePermission(actor, table);
  if (ACTION_ONLY_TABLES.has(table)) {
    throw new ApiError(409, "ACTION_REQUIRED", `${table} must be changed through /api/farm-actions`);
  }
  if (body.all === true) throw new ApiError(403, "DELETE_ALL_DISABLED", "Bulk table deletion is disabled");
  const id = requireUuid(body.id || url.searchParams.get("id"), "id");
  const { data } = await rest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!data?.length) throw new ApiError(404, "NOT_FOUND", `${table} row was not found`);
  await audit(req, actor, `farm_table.delete.${table}`, table, id, {
    reason: String(body.reason || "").slice(0, 500),
  });
  clearCache();
  return json(res, 200, { ok: true, table, id, deleted: data.length });
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.searchParams.get("healthcheck") === "1") {
      return json(res, 200, { ok: true, route: "farm-tables", authRequired: true });
    }
    const actor = await authenticate(req);
    if (req.method === "GET") return handleGet(req, res, url, actor);
    if (req.method === "POST") return handlePost(req, res, actor);
    if (req.method === "DELETE") return handleDelete(req, res, url, actor);
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  ACTION_ONLY_TABLES, TABLES, cache, clearCache, parallelMap, requestedTables, tableName,
};
