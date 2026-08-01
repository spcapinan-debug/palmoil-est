const {
  ADMIN_ROLES,
  ApiError,
  actorIsUat,
  audit,
  authenticate,
  authorize,
  config,
  errorResponse,
  json,
  readBody,
  requireUuid,
  rest,
} = require("../lib/server/farm-api");
const {
  HR_ACTION_ONLY_TABLES,
  loadScopedEmployeeIds,
} = require("../lib/server/hr-api");

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
  "warehouses", "bin_locations", "stock_transactions", "stock_balances",
  "goods_receipts", "goods_receipt_lines", "goods_issues", "goods_issue_lines",
  "goods_issue_daily_usage", "goods_returns", "goods_return_lines",
  "stock_transfers", "stock_adjustments", "stock_counts", "stock_count_lines",
  "budget_years", "budget_activity_rates", "budget_rate_blocks",
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
  "v_goods_issue_multi_day_status", "v_goods_return_readiness",
  "v_material_unit_conversion_options",
]);

const READ_RESTRICTED = {
  employees: "hr.employee.view",
  employee_employment_terms: "hr.employee.view",
  v_hr_people_workspace: "hr.employee.view",
  audit_logs: "system.audit.view",
  profiles: "system.user.manage",
  profile_roles: "system.role.manage",
  roles: "system.role.manage",
  permissions: "system.role.manage",
  role_permissions: "system.role.manage",
  user_access_scopes: "system.user.manage",
  goods_issue_daily_usage: ["inventory.view", "inventory.manage"],
  goods_issues: ["inventory.view", "inventory.manage"],
  goods_issue_lines: ["inventory.view", "inventory.manage"],
  goods_returns: ["inventory.view", "inventory.manage"],
  goods_return_lines: ["inventory.view", "inventory.manage"],
  sku_conversions: ["inventory.conversion.view", "inventory.manage"],
  stock_balances: ["inventory.stock.view", "inventory.manage"],
  stock_transactions: ["inventory.stock.view", "inventory.manage"],
  unit_conversions: ["inventory.conversion.view", "inventory.manage"],
  v_goods_issue_multi_day_status: ["inventory.view", "inventory.manage"],
  v_goods_return_readiness: ["inventory.view", "inventory.manage"],
  v_material_unit_conversion_options: ["inventory.conversion.view", "inventory.manage"],
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

// These compatibility sources were replaced by the current normalized tables.
// Keep mixed legacy workspace reads usable without creating duplicate schema.
const OPTIONAL_TABLES = new Set([...TABLES].filter((name) => name.startsWith("v_")).concat(
  "areas",
  "access_scopes",
  "approval_logs",
  "inventory_document_lines",
  "inventory_documents",
  "inventory_master",
  "master_versions",
  "payroll_lines",
  "payroll_rules",
  "people",
  "person_housing_assignments",
  "worker_documents",
));
const CACHE_MS = 30_000;
const cache = new Map();
const ACTION_ONLY_TABLES = new Set([
  "employees", "employee_employment_terms", ...HR_ACTION_ONLY_TABLES,
  "goods_issue_daily_usage", "goods_issues", "goods_issue_lines",
  "goods_returns", "goods_return_lines", "sku_conversions", "unit_conversions",
  "stock_balances", "stock_transactions",
  "fuel_issues", "vehicle_fuel_balances", "vehicle_fuel_consumption_periods",
  "payroll_periods", "payroll_period_lines", "payroll_employee_summaries",
  "payroll_earning_lines", "payroll_allowance_lines", "payroll_deduction_lines",
  "budget_rate_block_snapshots", "survey_responses", "survey_answers", "survey_findings",
  "work_result_weight_tickets",
]);

const HR_SCOPED_READ_TABLES = new Set([
  "employees", "employee_employment_terms", "v_hr_people_workspace",
]);

async function hrReadContext(actor) {
  return loadScopedEmployeeIds(actor, "view");
}

function hrScopedRows(table, rows, employeeIds) {
  if (employeeIds == null || !HR_SCOPED_READ_TABLES.has(table)) return rows;
  return rows.filter((row) => employeeIds.has(table === "employees" ? row.id : (row.employee_id || row.id)));
}

function tableName(value) {
  const name = String(value || "").trim();
  if (!TABLES.has(name)) throw new ApiError(400, "INVALID_TABLE", "Requested table is not allowed");
  return name;
}

function requestedTables(value) {
  const raw = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!raw.length) throw new ApiError(400, "TABLES_REQUIRED", "The tables query parameter is required");
  return [...new Set(raw.map(tableName))];
}

function readPermission(actor, table) {
  const permissions = READ_RESTRICTED[table];
  if (permissions) authorize(actor, {
    permissions: Array.isArray(permissions) ? permissions : [permissions],
  });
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

const UAT_OPERATIONAL_TABLES = new Set([
  "annual_work_plans", "planned_work_items", "planned_work_materials",
  "work_orders", "work_order_workers", "work_order_materials", "work_order_machines",
  "work_order_approvals", "work_order_qr_codes", "work_order_locations", "work_order_status_logs",
  "work_attendance", "work_results", "work_result_workers", "work_result_weight_tickets",
  "work_result_vehicle_usage", "work_performance_metrics", "cost_entries",
  "survey_responses", "survey_answers", "survey_response_attachments",
  "survey_answer_attachments", "survey_findings",
  "goods_issues", "goods_issue_lines", "goods_issue_daily_usage",
  "goods_returns", "goods_return_lines", "stock_balances", "stock_transactions",
  "sku_conversions",
  "payroll_periods", "payroll_period_lines", "payroll_employee_summaries",
  "payroll_earning_lines", "payroll_allowance_lines", "payroll_deduction_lines",
]);

function setOf(rows, field) {
  return new Set(rows.map((row) => row[field]).filter(Boolean));
}

async function uatReadContext(actor) {
  const blockIds = new Set(actor.scopes.map((scope) => scope.block_id).filter(Boolean));
  if (!blockIds.size) throw new ApiError(403, "SCOPE_FORBIDDEN", "UAT identity has no active block scope");
  const [orders, blocks] = await Promise.all([
    rest(`work_orders?block_id=in.(${[...blockIds].join(",")})&select=id,work_order_no,planned_work_item_id,status,team_id,contractor_id`)
      .then(({ data }) => data || []),
    rest(`blocks?id=in.(${[...blockIds].join(",")})&select=id,block_code,block_name`)
      .then(({ data }) => data || []),
  ]);
  const blockKeys = new Set(blocks.flatMap((row) => [row.id, row.block_code, row.block_name]).filter(Boolean));
  const workOrderIds = setOf(orders, "id");
  const plannedItemIds = setOf(orders, "planned_work_item_id");
  const items = plannedItemIds.size
    ? await rest(`planned_work_items?id=in.(${[...plannedItemIds].join(",")})&select=id,annual_plan_id`)
      .then(({ data }) => data || [])
    : [];
  const annualPlanIds = setOf(items, "annual_plan_id");
  const results = workOrderIds.size
    ? await rest(`work_results?work_order_id=in.(${[...workOrderIds].join(",")})&select=id,work_order_id,result_status`)
      .then(({ data }) => data || [])
    : [];
  const workResultIds = setOf(results, "id");
  const goodsIssues = workOrderIds.size
    ? await rest(`goods_issues?work_order_id=in.(${[...workOrderIds].join(",")})&select=id,issue_no,work_order_id`)
      .then(({ data }) => data || [])
    : [];
  const goodsIssueIds = setOf(goodsIssues, "id");
  const goodsIssueLines = goodsIssueIds.size
    ? await rest(`goods_issue_lines?issue_id=in.(${[...goodsIssueIds].join(",")})&select=id,issue_id,material_id,material_lot_id`)
      .then(({ data }) => data || [])
    : [];
  const goodsIssueLineIds = setOf(goodsIssueLines, "id");
  const inventoryMaterialIds = setOf(goodsIssueLines, "material_id");
  const inventoryLotIds = setOf(goodsIssueLines, "material_lot_id");
  const goodsReturns = goodsIssueIds.size
    ? await rest(`goods_returns?goods_issue_id=in.(${[...goodsIssueIds].join(",")})&select=id,goods_issue_id`)
      .then(({ data }) => data || [])
    : [];
  const goodsReturnIds = setOf(goodsReturns, "id");
  const responses = workOrderIds.size
    ? await rest(`survey_responses?work_order_id=in.(${[...workOrderIds].join(",")})&select=id,work_order_id,work_result_id`)
      .then(({ data }) => data || [])
    : [];
  const resultResponses = workResultIds.size
    ? await rest(`survey_responses?work_result_id=in.(${[...workResultIds].join(",")})&select=id,work_order_id,work_result_id`)
      .then(({ data }) => data || [])
    : [];
  const surveyResponseIds = setOf([...responses, ...resultResponses], "id");
  const surveyAnswers = surveyResponseIds.size
    ? await rest(`survey_answers?response_id=in.(${[...surveyResponseIds].join(",")})&select=id,response_id`)
      .then(({ data }) => data || [])
    : [];
  const surveyAnswerIds = setOf(surveyAnswers, "id");
  const [responseAttachments, answerAttachments, payrollPeriodLines] = await Promise.all([
    surveyResponseIds.size
      ? rest(`survey_response_attachments?response_id=in.(${[...surveyResponseIds].join(",")})&select=attachment_id`)
        .then(({ data }) => data || [])
      : [],
    surveyAnswerIds.size
      ? rest(`survey_answer_attachments?answer_id=in.(${[...surveyAnswerIds].join(",")})&select=attachment_id`)
        .then(({ data }) => data || [])
      : [],
    workResultIds.size
      ? rest(`payroll_period_lines?work_result_id=in.(${[...workResultIds].join(",")})&select=id,payroll_period_id,work_result_id`)
        .then(({ data }) => data || [])
      : [],
  ]);
  const payrollPeriodIds = setOf(payrollPeriodLines, "payroll_period_id");
  const payrollSummaries = payrollPeriodIds.size
    ? await rest(`payroll_employee_summaries?payroll_period_id=in.(${[...payrollPeriodIds].join(",")})&select=id,payroll_period_id`)
      .then(({ data }) => data || [])
    : [];
  return {
    annualPlanIds, blockIds, blockKeys, orders, payrollPeriodIds,
    payrollPeriodLineIds: setOf(payrollPeriodLines, "id"),
    payrollSummaryIds: setOf(payrollSummaries, "id"),
    goodsIssueIds, goodsIssueLineIds, goodsReturnIds, inventoryLotIds, inventoryMaterialIds,
    plannedItemIds, results, surveyAnswerIds,
    surveyAttachmentIds: setOf([...responseAttachments, ...answerAttachments], "attachment_id"),
    surveyResponseIds, workOrderIds, workResultIds,
  };
}

function uatActionCenterRows(rows, context) {
  const counts = {
    record_result: context.orders.filter((row) => ["dispatched", "in_progress"].includes(row.status)).length,
    prepare_material_issue: context.orders.filter((row) => ["approved", "dispatched", "in_progress"].includes(row.status)).length,
    assign_resource: context.orders.filter((row) => !row.team_id && !row.contractor_id).length,
    continue_result: context.results.filter((row) => row.result_status === "draft").length,
    close_result: context.results.filter((row) => row.result_status === "verified").length,
    complete_order: context.orders.filter((row) => row.status === "in_progress").length,
    draft: context.results.filter((row) => row.result_status === "draft").length,
  };
  return rows
    .filter((row) => ["farm.work", "farm.daily"].includes(row.module_key) && counts[row.action_key] != null)
    .map((row) => ({ ...row, item_count: counts[row.action_key] }));
}

function uatRowAllowed(table, row, context) {
  if (!UAT_OPERATIONAL_TABLES.has(table)) {
    if (table === "blocks") return context.blockIds.has(row.id);
    if (table === "attachments") return context.surveyAttachmentIds.has(row.id);
    if (table === "v_management_action_center") return ["farm.work", "farm.daily"].includes(row.module_key);
    if (table === "v_available_inbound_weight_tickets") {
      return context.blockKeys.has(row.source_area_key);
    }
    if (table.startsWith("v_") && !["v_app_navigation", "v_app_workspace_definition", "v_app_workspace_tabs", "v_system_module_readiness"].includes(table)) {
      return context.workOrderIds.has(row.work_order_id)
        || context.workOrderIds.has(row.entity_id)
        || context.workResultIds.has(row.work_result_id)
        || context.surveyResponseIds.has(row.response_id)
        || context.blockIds.has(row.block_id)
        || context.blockKeys.has(row.source_area_key);
    }
    return true;
  }
  if (table === "annual_work_plans") return context.annualPlanIds.has(row.id);
  if (table === "planned_work_items") return context.plannedItemIds.has(row.id);
  if (table === "planned_work_materials") return context.plannedItemIds.has(row.planned_work_item_id);
  if (table === "work_orders") return context.workOrderIds.has(row.id);
  if (table === "goods_issues") return context.goodsIssueIds.has(row.id);
  if (table === "goods_issue_lines") {
    return context.goodsIssueIds.has(row.issue_id) || context.goodsIssueLineIds.has(row.id);
  }
  if (table === "goods_issue_daily_usage") {
    return context.goodsIssueIds.has(row.goods_issue_id)
      && context.goodsIssueLineIds.has(row.goods_issue_line_id);
  }
  if (table === "goods_returns") return context.goodsReturnIds.has(row.id);
  if (table === "goods_return_lines") return context.goodsReturnIds.has(row.return_id);
  if (table === "stock_balances" || table === "stock_transactions" || table === "sku_conversions") {
    return context.inventoryMaterialIds.has(row.material_id);
  }
  if (table.startsWith("work_order_") || table === "work_attendance") return context.workOrderIds.has(row.work_order_id);
  if (table === "work_results") return context.workResultIds.has(row.id);
  if (table.startsWith("work_result_") || table === "work_performance_metrics") {
    return context.workResultIds.has(row.work_result_id);
  }
  if (table === "cost_entries") {
    return context.workOrderIds.has(row.work_order_id) || context.workResultIds.has(row.work_result_id);
  }
  if (table === "survey_responses") return context.surveyResponseIds.has(row.id);
  if (table === "survey_answers" || table === "survey_response_attachments" || table === "survey_findings") {
    return context.surveyResponseIds.has(row.response_id);
  }
  if (table === "survey_answer_attachments") return context.surveyAnswerIds.has(row.answer_id);
  if (table === "payroll_periods") return context.payrollPeriodIds.has(row.id);
  if (table === "payroll_period_lines") return context.payrollPeriodLineIds.has(row.id);
  if (table === "payroll_employee_summaries") return context.payrollSummaryIds.has(row.id);
  if (["payroll_earning_lines", "payroll_allowance_lines", "payroll_deduction_lines"].includes(table)) {
    return context.payrollSummaryIds.has(row.payroll_summary_id);
  }
  return false;
}

function normalizePlantingYear(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  const year = Number(match?.[1] || (/^\d{4}$/.test(text) ? text : 0));
  if (year >= 2400 && year <= 2700) return year;
  if (year >= 1900 && year <= 2200) return year + 543;
  return 0;
}

function databaseBlockPlantingYear(block = {}) {
  for (const field of ["planted_year", "planting_year"]) {
    const year = normalizePlantingYear(block[field]);
    if (year) return year;
  }
  const dateYear = normalizePlantingYear(String(block.planting_date || "").slice(0, 4));
  if (dateYear) return dateYear;
  const code = String(block.block_code || "").toUpperCase();
  const explicitYear = normalizePlantingYear(code);
  if (explicitYear) return explicitYear;
  const shortYear = code.match(/(?:^|[-_/])(\d{2})(?=[-_/]|$)/)?.[1];
  if (!shortYear) return 0;
  const year = 2500 + Number(shortYear);
  return year >= 2450 && year <= new Date().getFullYear() + 544 ? year : 0;
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

async function validateBudgetRateBlockRows(actor, rows, selectedPlantingYears = [], selectedBlockIds = []) {
  const blockIds = rows.map((row) => requireUuid(row.block_id, "block_id"));
  if (new Set(blockIds).size !== blockIds.length) {
    throw new ApiError(400, "DUPLICATE_BLOCK_ID", "selectedBlockIds must not contain duplicate block IDs");
  }
  if (!Array.isArray(selectedBlockIds)) {
    throw new ApiError(400, "VALIDATION_ERROR", "selectedBlockIds must be an array");
  }
  const payloadBlockIds = selectedBlockIds.map((id) => requireUuid(id, "selectedBlockIds"));
  if (new Set(payloadBlockIds).size !== payloadBlockIds.length) {
    throw new ApiError(400, "DUPLICATE_BLOCK_ID", "selectedBlockIds must not contain duplicate block IDs");
  }
  if (JSON.stringify([...payloadBlockIds].sort()) !== JSON.stringify([...blockIds].sort())) {
    throw new ApiError(400, "BLOCK_SELECTION_MISMATCH", "selectedBlockIds does not match the relation rows");
  }
  const { data } = await rest(`blocks?id=in.(${blockIds.join(",")})&select=*`);
  const blocks = Array.isArray(data) ? data : [];
  const byId = new Map(blocks.map((block) => [block.id, block]));
  for (const blockId of blockIds) {
    const block = byId.get(blockId);
    if (!block) throw new ApiError(400, "BLOCK_NOT_FOUND", "A selected Block does not exist");
    if (String(block.status || "").toLowerCase() !== "active") {
      throw new ApiError(400, "BLOCK_INACTIVE", "A selected Block is not active");
    }
    if (!actorCanAccessBlock(actor, block)) {
      throw new ApiError(403, "SCOPE_FORBIDDEN", "A selected Block is outside your assigned scope");
    }
  }
  if (selectedPlantingYears !== undefined && !Array.isArray(selectedPlantingYears)) {
    throw new ApiError(400, "VALIDATION_ERROR", "selectedPlantingYears must be an array");
  }
  const suppliedYears = [...new Set((selectedPlantingYears || []).map((year) => normalizePlantingYear(year)).filter(Boolean))].sort((a, b) => a - b);
  if (selectedPlantingYears?.length !== suppliedYears.length) {
    throw new ApiError(400, "VALIDATION_ERROR", "selectedPlantingYears contains invalid or duplicate years");
  }
  if (suppliedYears.length) {
    const databaseYears = [...new Set(blocks.map(databaseBlockPlantingYear).filter(Boolean))].sort((a, b) => a - b);
    if (JSON.stringify(databaseYears) !== JSON.stringify(suppliedYears)) {
      throw new ApiError(400, "PLANTING_YEAR_MISMATCH", "selectedPlantingYears does not match the selected Blocks");
    }
  }
  return blocks;
}

function safeTableError(error) {
  return error?.status && error.status < 500
    ? { code: error.code || "TABLE_READ_FAILED", message: error.message || "Table read failed" }
    : { code: "TABLE_READ_FAILED", message: "Table read failed" };
}

async function uatPlanForItem(itemId) {
  const item = await rest(`planned_work_items?id=eq.${encodeURIComponent(itemId)}&select=id,annual_plan_id,block_id&limit=1`)
    .then(({ data }) => data?.[0]);
  if (!item) throw new ApiError(404, "NOT_FOUND", "Planned work item was not found");
  const plan = await rest(`annual_work_plans?id=eq.${item.annual_plan_id}&select=id,plan_name,note&limit=1`)
    .then(({ data }) => data?.[0]);
  if (!plan) throw new ApiError(404, "NOT_FOUND", "Annual work plan was not found");
  return { item, plan };
}

function requireUatPlan(plan) {
  if (!String(plan?.plan_name || plan?.note || "").startsWith("WEBTEST-UAT-")) {
    throw new ApiError(403, "UAT_WRITE_FORBIDDEN", "UAT plan writes are restricted to WEBTEST-UAT records");
  }
}

function requireUatBlock(actor, blockId) {
  if (!blockId || !actor.scopes.some((scope) => scope.block_id === blockId)) {
    throw new ApiError(403, "SCOPE_FORBIDDEN", "Plan item is outside your assigned block scope");
  }
}

async function enforceUatTableWrite(actor, table, rows) {
  if (!actorIsUat(actor)) return;
  if (table === "annual_work_plans") {
    for (const row of rows) {
      const existing = row.id
        ? await rest(`annual_work_plans?id=eq.${encodeURIComponent(row.id)}&select=id,plan_name,note&limit=1`)
          .then(({ data }) => data?.[0])
        : null;
      requireUatPlan({ ...existing, ...row });
    }
    return;
  }
  if (table === "planned_work_items") {
    for (const row of rows) {
      const existing = row.id
        ? await rest(`planned_work_items?id=eq.${encodeURIComponent(row.id)}&select=id,annual_plan_id,block_id&limit=1`)
          .then(({ data }) => data?.[0])
        : null;
      const annualPlanId = row.annual_plan_id || existing?.annual_plan_id;
      if (!annualPlanId) throw new ApiError(400, "VALIDATION_ERROR", "annual_plan_id is required");
      const plan = await rest(`annual_work_plans?id=eq.${encodeURIComponent(annualPlanId)}&select=id,plan_name,note&limit=1`)
        .then(({ data }) => data?.[0]);
      requireUatPlan(plan);
      requireUatBlock(actor, row.block_id || existing?.block_id);
    }
    return;
  }
  if (table === "planned_work_materials") {
    for (const row of rows) {
      const existing = row.id
        ? await rest(`planned_work_materials?id=eq.${encodeURIComponent(row.id)}&select=id,planned_work_item_id&limit=1`)
          .then(({ data }) => data?.[0])
        : null;
      const itemId = row.planned_work_item_id || existing?.planned_work_item_id;
      if (!itemId) throw new ApiError(400, "VALIDATION_ERROR", "planned_work_item_id is required");
      const { item, plan } = await uatPlanForItem(itemId);
      requireUatPlan(plan);
      requireUatBlock(actor, item.block_id);
    }
    return;
  }
  throw new ApiError(403, "UAT_ACTION_REQUIRED", "UAT writes must use an allowlisted farm action");
}

async function handleGet(req, res, url, actor) {
  const tables = requestedTables(url.searchParams.get("tables") ?? url.searchParams.get("table"));
  const deniedTables = new Set();
  for (const table of tables) {
    try {
      readPermission(actor, table);
    } catch (error) {
      if (!actorIsUat(actor) || error?.status !== 403) throw error;
      deniedTables.add(table);
    }
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 5000), 1), 5000);
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const offsetParam = url.searchParams.get("offset");
  const offset = offsetParam == null ? (page - 1) * limit : Math.max(Number(offsetParam), 0);
  const cacheKey = JSON.stringify({ actor: actor.profile.id, tables: [...tables].sort(), limit, offset });
  const cached = cache.get(cacheKey);
  if (url.searchParams.get("refresh") !== "1" && cached && Date.now() - cached.at < CACHE_MS) {
    return json(res, 200, { ...cached.payload, source: { ...cached.payload.source, cache: "hit" } });
  }

  const context = actorIsUat(actor) ? await uatReadContext(actor) : null;
  const hrContext = tables.some((table) => HR_SCOPED_READ_TABLES.has(table))
    ? await hrReadContext(actor)
    : null;
  const reads = await parallelMap(tables, 8, async (table) => {
    if (deniedTables.has(table)) {
      return { table, rows: [], total: 0, warning: "Table is not available to this UAT role" };
    }
    try {
      const read = await readTable(table, limit, offset);
      if (table === "blocks" && ![...actor.roles].some((role) => ADMIN_ROLES.has(role))) {
        const rows = read.rows.filter((row) => actorCanAccessBlock(actor, row));
        return { ...read, rows, rawTotal: read.total, total: rows.length };
      }
      const hrWasScoped = HR_SCOPED_READ_TABLES.has(table) && hrContext != null;
      const scopedRead = { ...read, rows: hrScopedRows(table, read.rows, hrContext) };
      if (!context) return hrWasScoped
        ? { ...scopedRead, rawTotal: read.total, total: scopedRead.rows.length }
        : { ...scopedRead, rawTotal: read.total };
      const rows = table === "v_management_action_center"
        ? uatActionCenterRows(scopedRead.rows, context)
        : scopedRead.rows.filter((row) => uatRowAllowed(table, row, context));
      return { ...scopedRead, rows, rawTotal: read.total, total: rows.length };
    } catch (error) {
      return { table, rows: [], total: null, rawTotal: null, error: safeTableError(error) };
    }
  });
  const payload = {
    ok: true,
    tables: Object.fromEntries(reads.filter((item) => !item.error).map((item) => [item.table, item.rows])),
    tableMeta: Object.fromEntries(reads.map((item) => [item.table, {
      ok: !item.error,
      rows: item.rows.length,
      count: item.rawTotal,
      scopedCount: item.rows.length,
      source: item.table,
      warning: item.warning || null,
    }])),
    errors: Object.fromEntries(reads.filter((item) => item.error).map((item) => [item.table, item.error])),
    warnings: Object.fromEntries(reads.filter((item) => item.warning).map((item) => [item.table, item.warning])),
    pagination: Object.fromEntries(reads.map((item) => [item.table, {
      limit, offset, page: Math.floor(offset / limit) + 1, total: item.total,
      hasMore: item.total == null ? item.rows.length === limit : offset + item.rows.length < item.total,
    }])),
    source: {
      mode: "supabase-real-only",
      tableCount: tables.length,
      failedTableCount: reads.filter((item) => item.error).length,
      rowCount: reads.reduce((sum, item) => sum + item.rows.length, 0),
      cache: "miss",
      generatedAt: new Date().toISOString(),
    },
  };
  if (!reads.some((item) => item.error)) cache.set(cacheKey, { at: Date.now(), payload });
  return json(res, 200, payload);
}

async function handlePost(req, res, actor) {
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body) || !body.table) {
    throw new ApiError(400, "INVALID_PAYLOAD", "Request payload is invalid");
  }
  const table = tableName(body.table);
  if (ACTION_ONLY_TABLES.has(table)) {
    throw new ApiError(403, "ACTION_REQUIRED", `${table} must be changed through /api/farm-actions`);
  }
  writePermission(actor, table);
  const rows = Array.isArray(body.rows) ? body.rows : (body.row && typeof body.row === "object" ? [body.row] : []);
  if (!rows.length || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new ApiError(400, "INVALID_PAYLOAD", "Request payload is invalid");
  }
  if (rows.length > 500) throw new ApiError(400, "VALIDATION_ERROR", "A request may write at most 500 rows");
  if (table === "budget_rate_blocks") {
    await validateBudgetRateBlockRows(actor, rows, body.selectedPlantingYears, body.selectedBlockIds);
  }
  await enforceUatTableWrite(actor, table, rows);
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
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body) || !(body.table || url.searchParams.get("table"))) {
    throw new ApiError(400, "INVALID_PAYLOAD", "Request payload is invalid");
  }
  const table = tableName(body.table || url.searchParams.get("table"));
  if (actorIsUat(actor)) {
    throw new ApiError(403, "UAT_DELETE_FORBIDDEN", "UAT identities cannot delete records");
  }
  if (ACTION_ONLY_TABLES.has(table)) {
    throw new ApiError(403, "ACTION_REQUIRED", `${table} must be changed through /api/farm-actions`);
  }
  writePermission(actor, table);
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
  const allowedMethods = "GET, POST, DELETE, OPTIONS";
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", allowedMethods);
    return json(res, 200, { ok: true });
  }
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.searchParams.get("healthcheck") === "1") {
      config();
      return json(res, 200, { ok: true, route: "farm-tables", configured: true, authRequired: true });
    }
    if (!["GET", "POST", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", allowedMethods);
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }
    const actor = await authenticate(req);
    if (req.method === "GET") return await handleGet(req, res, url, actor);
    if (req.method === "POST") return await handlePost(req, res, actor);
    return await handleDelete(req, res, url, actor);
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  ACTION_ONLY_TABLES, OPTIONAL_TABLES, TABLES, UAT_OPERATIONAL_TABLES, cache, clearCache, parallelMap,
  actorCanAccessBlock, databaseBlockPlantingYear, enforceUatTableWrite, normalizePlantingYear,
  hrReadContext, hrScopedRows, requestedTables, safeTableError, tableName, uatActionCenterRows,
  uatRowAllowed, validateBudgetRateBlockRows,
};
