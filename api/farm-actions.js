const { createHash, randomUUID } = require("node:crypto");
const {
  ADMIN_ROLES,
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
  rpc,
} = require("../lib/server/farm-api");

const ACTIONS = {
  get_or_create_work_result: {
    permission: "farm.result.record",
    rpc: "get_or_create_work_result",
    params: (args, actor) => ({
      p_work_order_id: requireUuid(args.work_order_id, "work_order_id"),
      p_result_date: /^\d{4}-\d{2}-\d{2}$/.test(String(args.result_date || ""))
        ? args.result_date : new Date().toISOString().slice(0, 10),
      p_profile_id: actor.profile.id,
    }),
    entity: "work_results",
  },
  save_work_result_draft: {
    permission: "farm.result.record", execute: saveWorkResultDraft,
    params: (args, actor) => ({ args, actor }),
    entity: "work_results", entityId: (args) => args.result_id,
  },
  submit_work_result: {
    permission: "farm.result.record", confirmation: true, execute: submitWorkResult,
    params: (args, actor) => ({ args, actor }),
    entity: "work_results", entityId: (args) => args.result_id,
  },
  verify_work_result: {
    permission: "farm.result.verify", confirmation: true,
    execute: ({ args, actor }) => changeWorkResultStatus(args, actor, "submitted", "verified"),
    params: (args, actor) => ({ args, actor }),
    entity: "work_results", entityId: (args) => args.result_id,
  },
  close_work_result: {
    permission: "farm.result.close", confirmation: true,
    execute: ({ args, actor }) => changeWorkResultStatus(args, actor, "verified", "closed"),
    params: (args, actor) => ({ args, actor }),
    entity: "work_results", entityId: (args) => args.result_id,
  },
  link_inbound_weight_ticket: {
    permission: "farm.weigh_ticket.link", confirmation: true, execute: linkInboundWeightTicket,
    params: (args, actor) => ({ args, actor }),
    entity: "work_result_weight_tickets",
  },
  prepare_goods_issue_from_work_order: {
    permission: "inventory.manage",
    rpc: "prepare_goods_issue_from_work_order",
    params: (args, actor) => ({
      p_work_order_id: requireUuid(args.work_order_id, "work_order_id"),
      p_warehouse_id: optionalUuid(args.warehouse_id, "warehouse_id"),
      p_profile_id: actor.profile.id,
    }),
    entity: "goods_issues",
  },
  approve_goods_issue: {
    permission: "inventory.manage", confirmation: true, rpc: "approve_goods_issue",
    params: (args, actor) => ({ p_issue_id: requireUuid(args.issue_id, "issue_id"), p_profile_id: actor.profile.id }),
    entity: "goods_issues", entityId: (args) => args.issue_id,
  },
  post_goods_issue: {
    permission: "inventory.manage", confirmation: true, rpc: "post_goods_issue",
    params: (args, actor) => ({ p_issue_id: requireUuid(args.issue_id, "issue_id"), p_profile_id: actor.profile.id }),
    entity: "goods_issues", entityId: (args) => args.issue_id,
  },
  prepare_payroll_period: {
    permission: "payroll.calculate", rpc: "prepare_payroll_period",
    params: (args, actor) => ({ p_period_id: requireUuid(args.period_id, "period_id"), p_profile_id: actor.profile.id }),
    entity: "payroll_periods", entityId: (args) => args.period_id,
  },
  approve_payroll_period: {
    permission: "payroll.approve", confirmation: true, rpc: "approve_payroll_period",
    params: (args, actor) => ({ p_period_id: requireUuid(args.period_id, "period_id"), p_profile_id: actor.profile.id }),
    entity: "payroll_periods", entityId: (args) => args.period_id,
  },
  close_payroll_period: {
    permission: "payroll.close", confirmation: true, rpc: "close_payroll_period",
    params: (args, actor) => ({ p_period_id: requireUuid(args.period_id, "period_id"), p_profile_id: actor.profile.id }),
    entity: "payroll_periods", entityId: (args) => args.period_id,
  },
  refresh_vehicle_fuel_requisition: {
    permission: "fuel.requisition.create", rpc: "refresh_vehicle_fuel_requisition",
    params: (args) => ({
      p_vehicle_id: requireUuid(args.vehicle_id, "vehicle_id"),
      p_work_order_id: optionalUuid(args.work_order_id, "work_order_id"),
    }),
    entity: "fuel_requisitions",
  },
  refresh_fuel_tank_purchase_requisition: {
    permission: "fuel.requisition.create", rpc: "refresh_fuel_tank_purchase_requisition",
    params: (args) => ({ p_tank_id: requireUuid(args.tank_id, "tank_id") }),
    entity: "fuel_requisitions",
  },
  allocate_vehicle_fuel_period: {
    permission: "fuel.allocation.manage", confirmation: true, rpc: "allocate_vehicle_fuel_period",
    params: (args) => ({ p_period_id: requireUuid(args.period_id, "period_id") }),
    entity: "vehicle_fuel_consumption_periods", entityId: (args) => args.period_id,
  },
  issue_fuel: {
    permission: "fuel.issue", confirmation: true, execute: issueFuel,
    params: (args, actor) => ({ args, actor }),
    entity: "fuel_issues",
  },
  preview_budget_rule_set_movement: {
    permission: "budget.rate_rule.view", rpc: "preview_budget_rule_set_movement",
    params: (args) => ({ p_target_rule_set_id: requireUuid(args.rule_set_id, "rule_set_id") }),
    entity: "budget_rate_rule_sets", entityId: (args) => args.rule_set_id,
  },
  clone_budget_rate_rule_set: {
    permission: "budget.rate_rule.clone", rpc: "clone_budget_rate_rule_set",
    params: (args, actor) => ({
      p_source_rule_set_id: requireUuid(args.source_rule_set_id, "source_rule_set_id"),
      p_target_budget_year_id: requireText(args.target_budget_year_id, "target_budget_year_id", 120),
      p_target_name: requireText(args.target_name, "target_name", 240),
      p_profile_id: actor.profile.id,
    }),
    entity: "budget_rate_rule_sets",
  },
  snapshot_budget_rate_rule_set: {
    permission: "budget.rate_rule.approve", confirmation: true, rpc: "snapshot_budget_rate_rule_set",
    params: (args, actor) => ({
      p_rule_set_id: requireUuid(args.rule_set_id, "rule_set_id"),
      p_profile_id: actor.profile.id,
      p_reason: String(args.reason || "approval").slice(0, 500),
    }),
    entity: "budget_rate_rule_sets", entityId: (args) => args.rule_set_id,
  },
  generate_activity_budget_rate_recommendation: {
    permission: "budget.recommendation.generate", rpc: "generate_activity_budget_rate_recommendation",
    params: (args, actor) => ({
      p_activity_id: requireUuid(args.activity_id, "activity_id"),
      p_budget_year_id: requireText(args.budget_year_id, "budget_year_id", 120),
      p_period_start: requireText(args.period_start, "period_start", 10),
      p_period_end: requireText(args.period_end, "period_end", 10),
      p_condition_group: String(args.condition_group || "default").slice(0, 120),
      p_current_budget_rate_id: args.current_budget_rate_id ? String(args.current_budget_rate_id).slice(0, 160) : null,
      p_prepared_by_profile_id: actor.profile.id,
    }),
    entity: "activity_budget_rate_recommendations",
  },
  create_survey_response: {
    permission: "survey.respond", execute: createSurveyResponse,
    params: (args, actor) => ({ args, actor }),
    entity: "survey_responses",
  },
  save_survey_draft: {
    permission: "survey.respond", execute: saveSurveyDraft,
    params: (args, actor) => ({ args, actor }),
    entity: "survey_responses", entityId: (args) => args.response_id,
  },
  submit_survey_response: {
    permission: "survey.respond", confirmation: true, execute: submitSurveyResponse,
    params: (args, actor) => ({ args, actor }),
    entity: "survey_responses", entityId: (args) => args.response_id,
  },
  verify_survey_response: {
    permission: "survey.verify", confirmation: true,
    execute: ({ args, actor }) => changeSurveyStatus(args, actor, "submitted", "verified"),
    params: (args, actor) => ({ args, actor }),
    entity: "survey_responses", entityId: (args) => args.response_id,
  },
  close_survey_response: {
    permission: "survey.verify", confirmation: true,
    execute: ({ args, actor }) => changeSurveyStatus(args, actor, "verified", "closed"),
    params: (args, actor) => ({ args, actor }),
    entity: "survey_responses", entityId: (args) => args.response_id,
  },
  create_survey_finding: {
    permission: "survey.finding.manage", execute: createSurveyFinding,
    params: (args, actor) => ({ args, actor }),
    entity: "survey_findings",
  },
  resolve_survey_finding: {
    permission: "survey.finding.manage", confirmation: true, execute: resolveSurveyFinding,
    params: (args, actor) => ({ args, actor }),
    entity: "survey_findings", entityId: (args) => args.finding_id,
  },
  reset_web_test_run: {
    admin: true, confirmation: true, rpc: "cleanup_full_web_test_run",
    params: (args) => ({ p_run_code: requireWebTestCode(args.run_code) }),
    entity: "system_test_runs", entityId: () => "WEBTEST-2569",
  },
  create_web_test_run: {
    admin: true, confirmation: true, rpc: "create_full_web_test_run",
    params: (args) => ({ p_run_code: requireWebTestCode(args.run_code) }),
    entity: "system_test_runs", entityId: () => "WEBTEST-2569",
  },
};

function requireWebTestCode(value) {
  if (value !== "WEBTEST-2569") throw new ApiError(400, "VALIDATION_ERROR", "Only WEBTEST-2569 is allowed");
  return value;
}

function dateOrToday(value, field = "response_date") {
  const date = String(value || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "VALIDATION_ERROR", `${field} must be YYYY-MM-DD`);
  return date;
}

async function one(path, label) {
  const row = await rest(path).then(({ data }) => data?.[0]);
  if (!row) throw new ApiError(404, "NOT_FOUND", `${label} was not found`);
  return row;
}

async function createSurveyResponse({ args, actor }) {
  const templateId = requireUuid(args.template_id, "template_id");
  const template = await one(
    `survey_templates?id=eq.${templateId}&select=id,version_no,survey_scope,status&limit=1`,
    "Survey template",
  );
  if (template.status !== "active") throw new ApiError(409, "INVALID_STATE", "Survey template is not active");
  const row = {
    response_no: `SV-${Date.now()}-${randomUUID().slice(0, 8)}`,
    template_id: templateId,
    template_version_snapshot: template.version_no || 1,
    survey_scope: requireText(args.survey_scope || template.survey_scope, "survey_scope", 80),
    response_date: dateOrToday(args.response_date),
    respondent_profile_id: actor.profile.id,
    remarks: args.remarks == null ? null : String(args.remarks).slice(0, 1000),
  };
  for (const field of ["work_order_id", "work_result_id", "employee_id", "team_id", "vehicle_id", "material_id", "block_id"]) {
    row[field] = optionalUuid(args[field], field);
  }
  const { data } = await rest("survey_responses", {
    method: "POST", body: JSON.stringify([row]), headers: { Prefer: "return=representation" },
  });
  return data[0];
}

async function linkInboundWeightTicket({ args, actor }) {
  const allocatedWeight = Number(args.allocated_weight_kg);
  if (!Number.isFinite(allocatedWeight) || allocatedWeight <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "allocated_weight_kg must be greater than zero");
  }
  const row = {
    work_result_id: requireUuid(args.work_result_id, "work_result_id"),
    transport_source_record_id: requireUuid(args.transport_source_record_id, "transport_source_record_id"),
    allocated_weight_kg: allocatedWeight,
    allocation_method: String(args.allocation_method || "manual").slice(0, 80),
    linked_by_profile_id: actor.profile.id,
    note: args.note == null ? null : String(args.note).slice(0, 1000),
  };
  const { data } = await rest("work_result_weight_tickets", {
    method: "POST", body: JSON.stringify([row]), headers: { Prefer: "return=representation" },
  });
  return data[0];
}

function optionalNumber(value, field, { minimum = 0 } = {}) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a number greater than or equal to ${minimum}`);
  }
  return number;
}

async function saveWorkResultDraft({ args }) {
  const resultId = requireUuid(args.result_id, "result_id");
  const result = await one(
    `work_results?id=eq.${resultId}&select=id,work_order_id,result_date,result_status&limit=1`,
    "Work result",
  );
  if (result.result_status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft work results can be edited");
  const workers = Array.isArray(args.workers) ? args.workers : [];
  const materials = Array.isArray(args.materials) ? args.materials : [];
  const vehicles = Array.isArray(args.vehicles) ? args.vehicles : [];
  if (workers.length > 200 || materials.length > 200 || vehicles.length > 50) {
    throw new ApiError(400, "VALIDATION_ERROR", "Draft detail exceeds the maximum row count");
  }
  const resultPatch = {
    actual_quantity: optionalNumber(args.actual_quantity, "actual_quantity"),
    actual_unit: args.actual_unit == null ? null : String(args.actual_unit).slice(0, 80),
    quality_score: optionalNumber(args.quality_score, "quality_score"),
    worker_count: workers.length,
    survey_status: String(args.survey_status || "pending").slice(0, 80),
    note: args.note == null ? null : String(args.note).slice(0, 2000),
    updated_at: new Date().toISOString(),
  };
  const savedResult = await rest(`work_results?id=eq.${resultId}&result_status=eq.draft`, {
    method: "PATCH", body: JSON.stringify(resultPatch), headers: { Prefer: "return=representation" },
  }).then(({ data }) => data?.[0]);
  if (!savedResult) throw new ApiError(409, "STATE_CONFLICT", "Work result state changed before save");

  if (workers.length) {
    const workerRows = workers.map((worker) => ({
      work_result_id: resultId,
      employee_id: requireUuid(worker.employee_id, "employee_id"),
      team_id: optionalUuid(worker.team_id, "team_id"),
      work_date: result.result_date,
      worker_role: String(worker.worker_role || "worker").slice(0, 80),
      attendance_status: String(worker.attendance_status || "present").slice(0, 80),
      actual_hours: optionalNumber(worker.actual_hours, "actual_hours") || 0,
      actual_quantity: optionalNumber(worker.actual_quantity, "actual_quantity") || 0,
      actual_unit: String(worker.actual_unit || args.actual_unit || "").slice(0, 80) || null,
      rate_type: String(worker.rate_type || "planned").slice(0, 80),
      rate_amount: optionalNumber(worker.rate_amount, "rate_amount") || 0,
      earning_amount: optionalNumber(worker.earning_amount, "earning_amount") || 0,
      quantity_allocation_method: String(worker.quantity_allocation_method || "manual").slice(0, 80),
      is_quantity_estimated: worker.is_quantity_estimated === true,
      updated_at: new Date().toISOString(),
    }));
    await rest("work_result_workers?on_conflict=work_result_id,employee_id,work_date", {
      method: "POST",
      body: JSON.stringify(workerRows),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }

  for (const material of materials) {
    const materialId = requireUuid(material.material_id, "material_id");
    const existing = await one(
      `work_order_materials?work_order_id=eq.${result.work_order_id}&material_id=eq.${materialId}&select=id&limit=1`,
      "Work-order material",
    );
    await rest(`work_order_materials?id=eq.${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        used_quantity: optionalNumber(material.used_quantity, "used_quantity") || 0,
        note: material.note == null ? null : String(material.note).slice(0, 1000),
        updated_at: new Date().toISOString(),
      }),
      headers: { Prefer: "return=minimal" },
    });
  }

  for (const vehicle of vehicles) {
    const vehicleId = requireUuid(vehicle.vehicle_id, "vehicle_id");
    const existing = await rest(
      `work_result_vehicle_usage?work_result_id=eq.${resultId}&vehicle_id=eq.${vehicleId}&select=id&limit=1`,
    ).then(({ data }) => data?.[0]);
    const row = {
      work_result_id: resultId,
      work_order_id: result.work_order_id,
      vehicle_id: vehicleId,
      driver_employee_id: optionalUuid(vehicle.driver_employee_id, "driver_employee_id"),
      start_odometer: optionalNumber(vehicle.start_odometer, "start_odometer"),
      end_odometer: optionalNumber(vehicle.end_odometer, "end_odometer"),
      start_hour_meter: optionalNumber(vehicle.start_hour_meter, "start_hour_meter"),
      end_hour_meter: optionalNumber(vehicle.end_hour_meter, "end_hour_meter"),
      actual_quantity: optionalNumber(vehicle.actual_quantity, "vehicle.actual_quantity"),
      actual_unit: String(vehicle.actual_unit || args.actual_unit || "").slice(0, 80) || null,
      allocation_method: String(vehicle.allocation_method || "pending").slice(0, 80),
      status: "draft",
      note: vehicle.note == null ? null : String(vehicle.note).slice(0, 1000),
      updated_at: new Date().toISOString(),
    };
    await rest(existing ? `work_result_vehicle_usage?id=eq.${existing.id}` : "work_result_vehicle_usage", {
      method: existing ? "PATCH" : "POST",
      body: JSON.stringify(existing ? row : [row]),
      headers: { Prefer: "return=minimal" },
    });
  }
  return { result: savedResult, workers: workers.length, materials: materials.length, vehicles: vehicles.length };
}

async function issueFuel({ args, actor }) {
  const issuedLiter = optionalNumber(args.issued_liter, "issued_liter", { minimum: Number.EPSILON });
  if (issuedLiter == null) throw new ApiError(400, "VALIDATION_ERROR", "issued_liter is required");
  const row = {
    fuel_requisition_id: requireUuid(args.fuel_requisition_id, "fuel_requisition_id"),
    issue_no: `FUEL-${Date.now()}-${randomUUID().slice(0, 8)}`,
    tank_id: optionalUuid(args.tank_id, "tank_id"),
    issued_liter: issuedLiter,
    issued_by: actor.profile.id,
    driver_employee_id: optionalUuid(args.driver_employee_id, "driver_employee_id"),
    received_by_profile_id: optionalUuid(args.received_by_profile_id, "received_by_profile_id") || actor.profile.id,
    odometer_reading: optionalNumber(args.odometer_reading, "odometer_reading"),
    hour_meter_reading: optionalNumber(args.hour_meter_reading, "hour_meter_reading"),
    note: args.note == null ? null : String(args.note).slice(0, 1000),
  };
  const { data } = await rest("fuel_issues", {
    method: "POST", body: JSON.stringify([row]), headers: { Prefer: "return=representation" },
  });
  return data[0];
}

async function workResultContext(resultId) {
  const result = await one(
    `work_results?id=eq.${resultId}&select=id,work_order_id,result_date,result_status,actual_quantity&limit=1`,
    "Work result",
  );
  const order = await one(
    `work_orders?id=eq.${result.work_order_id}&select=id,activity_id,block_id,team_id,status&limit=1`,
    "Work order",
  );
  const activity = await one(
    `activities?id=eq.${order.activity_id}&select=id,requires_weigh_ticket,requires_worker_detail,requires_material_detail,requires_machine_detail&limit=1`,
    "Activity",
  );
  return { result, order, activity };
}

async function requireRows(path, message) {
  const rows = await rest(path).then(({ data }) => data || []);
  if (!rows.length) throw new ApiError(409, "RESULT_INCOMPLETE", message);
  return rows;
}

async function validateRequiredSurveys(context, acceptedStatuses) {
  const assignments = await rest(
    "survey_template_assignments?required=eq.true&status=eq.active&select=template_id,trigger_event,activity_id,block_id,team_id,effective_from,effective_to",
  ).then(({ data }) => data || []);
  const relevant = assignments.filter((assignment) => {
    const date = context.result.result_date;
    return (!assignment.activity_id || assignment.activity_id === context.order.activity_id)
      && (!assignment.block_id || assignment.block_id === context.order.block_id)
      && (!assignment.team_id || assignment.team_id === context.order.team_id)
      && (!assignment.effective_from || assignment.effective_from <= date)
      && (!assignment.effective_to || assignment.effective_to >= date)
      && ["after_result", "before_close"].includes(assignment.trigger_event);
  });
  if (!relevant.length) return;
  const responses = await rest(
    `survey_responses?work_result_id=eq.${context.result.id}&select=template_id,status`,
  ).then(({ data }) => data || []);
  const complete = new Set(responses.filter((response) => acceptedStatuses.has(response.status)).map((response) => response.template_id));
  const missing = relevant.filter((assignment) => !complete.has(assignment.template_id));
  if (missing.length) throw new ApiError(409, "SURVEY_REQUIRED", `${missing.length} required survey(s) are incomplete`);
}

async function submitWorkResult({ args, actor }) {
  const resultId = requireUuid(args.result_id, "result_id");
  const context = await workResultContext(resultId);
  if (context.result.result_status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft results can be submitted");
  if (!(Number(context.result.actual_quantity) > 0)) throw new ApiError(409, "RESULT_INCOMPLETE", "Actual quantity is required");
  if (context.activity.requires_weigh_ticket) {
    await requireRows(
      `work_result_weight_tickets?work_result_id=eq.${resultId}&link_status=neq.cancelled&select=id&limit=1`,
      "An inbound weigh ticket is required",
    );
  }
  if (context.activity.requires_worker_detail) {
    await requireRows(`work_result_workers?work_result_id=eq.${resultId}&select=id&limit=1`, "Worker detail is required");
  }
  if (context.activity.requires_material_detail) {
    await requireRows(
      `work_order_materials?work_order_id=eq.${context.order.id}&used_quantity=gt.0&select=id&limit=1`,
      "Actual material usage is required",
    );
  }
  if (context.activity.requires_machine_detail) {
    await requireRows(
      `work_result_vehicle_usage?work_result_id=eq.${resultId}&select=id&limit=1`,
      "Vehicle or machine usage is required",
    );
  }
  await validateRequiredSurveys(context, new Set(["submitted", "verified", "closed"]));
  return changeWorkResultStatus(args, actor, "draft", "submitted");
}

async function changeWorkResultStatus(args, actor, from, to) {
  const resultId = requireUuid(args.result_id, "result_id");
  if (to === "closed") {
    const context = await workResultContext(resultId);
    await validateRequiredSurveys(context, new Set(["verified", "closed"]));
  }
  const now = new Date().toISOString();
  const patch = { result_status: to, updated_at: now };
  if (to === "submitted") Object.assign(patch, { submitted_by: actor.profile.id, submitted_at: now });
  if (to === "verified") Object.assign(patch, { verified_by: actor.profile.id, verified_at: now });
  if (to === "closed") Object.assign(patch, { closed_by: actor.profile.id, closed_at: now });
  const { data } = await rest(`work_results?id=eq.${resultId}&result_status=eq.${from}`, {
    method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=representation" },
  });
  if (!data?.length) throw new ApiError(409, "INVALID_STATE", `Work result must be ${from} before it can be ${to}`);
  return data[0];
}

async function saveSurveyDraft({ args, actor }) {
  const responseId = requireUuid(args.response_id, "response_id");
  const response = await one(`survey_responses?id=eq.${responseId}&select=id,template_id,status&limit=1`, "Survey response");
  if (response.status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft surveys can be edited");
  const answers = Array.isArray(args.answers) ? args.answers : [];
  if (!answers.length || answers.length > 200) throw new ApiError(400, "VALIDATION_ERROR", "answers must contain 1-200 items");
  const ids = [...new Set(answers.map((answer) => requireUuid(answer.question_id, "question_id")))];
  const questions = await rest(
    `survey_questions?id=in.(${ids.join(",")})&template_id=eq.${response.template_id}&select=id,question_code,question_text,answer_type,max_score,weight_pct`,
  ).then(({ data }) => data || []);
  if (questions.length !== ids.length) throw new ApiError(400, "VALIDATION_ERROR", "Every question must belong to the response template");
  const byId = new Map(questions.map((question) => [question.id, question]));
  const rows = answers.map((answer) => {
    const question = byId.get(answer.question_id);
    return {
      response_id: responseId,
      question_id: question.id,
      question_code_snapshot: question.question_code,
      question_text_snapshot: question.question_text,
      answer_type_snapshot: question.answer_type,
      answer_text: answer.answer_text == null ? null : String(answer.answer_text).slice(0, 5000),
      answer_number: answer.answer_number ?? null,
      answer_boolean: answer.answer_boolean ?? null,
      answer_date: answer.answer_date ? dateOrToday(answer.answer_date, "answer_date") : null,
      answer_json: answer.answer_json && typeof answer.answer_json === "object" ? answer.answer_json : {},
      score_awarded: Math.max(Number(answer.score_awarded || 0), 0),
      max_score_snapshot: Number(question.max_score || 0),
      weight_pct_snapshot: Number(question.weight_pct || 0),
      is_compliant: answer.is_compliant ?? null,
      is_not_applicable: answer.is_not_applicable === true,
      note: answer.note == null ? null : String(answer.note).slice(0, 2000),
      answered_by_profile_id: actor.profile.id,
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  const { data } = await rest("survey_answers?on_conflict=response_id,question_id", {
    method: "POST",
    body: JSON.stringify(rows),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return { response_id: responseId, saved: data.length };
}

async function submitSurveyResponse({ args }) {
  const responseId = requireUuid(args.response_id, "response_id");
  const response = await one(`survey_responses?id=eq.${responseId}&select=id,template_id,status&limit=1`, "Survey response");
  if (response.status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft surveys can be submitted");
  const required = await rest(`survey_questions?template_id=eq.${response.template_id}&required=eq.true&status=eq.active&select=id`)
    .then(({ data }) => data || []);
  const answered = await rest(`survey_answers?response_id=eq.${responseId}&select=question_id,is_not_applicable,answer_text,answer_number,answer_boolean,answer_date,answer_json`)
    .then(({ data }) => data || []);
  const complete = new Set(answered.filter((answer) => answer.is_not_applicable
    || answer.answer_text != null || answer.answer_number != null || answer.answer_boolean != null
    || answer.answer_date != null || Object.keys(answer.answer_json || {}).length).map((answer) => answer.question_id));
  const missing = required.filter((question) => !complete.has(question.id));
  if (missing.length) throw new ApiError(409, "SURVEY_INCOMPLETE", `${missing.length} required answer(s) are missing`);
  await rpc("recalculate_survey_response", { p_response_id: responseId });
  const { data } = await rest(`survey_responses?id=eq.${responseId}&status=eq.draft`, {
    method: "PATCH",
    body: JSON.stringify({ status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    headers: { Prefer: "return=representation" },
  });
  if (!data?.length) throw new ApiError(409, "STATE_CONFLICT", "Survey state changed before submission");
  return data[0];
}

async function changeSurveyStatus(args, actor, from, to) {
  const responseId = requireUuid(args.response_id, "response_id");
  const now = new Date().toISOString();
  const patch = { status: to, updated_at: now };
  if (to === "verified") Object.assign(patch, { evaluator_profile_id: actor.profile.id, verified_at: now });
  if (to === "closed") patch.closed_at = now;
  const { data } = await rest(`survey_responses?id=eq.${responseId}&status=eq.${from}`, {
    method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=representation" },
  });
  if (!data?.length) throw new ApiError(409, "INVALID_STATE", `Survey must be ${from} before it can be ${to}`);
  return data[0];
}

async function createSurveyFinding({ args, actor }) {
  const severity = String(args.severity || "low");
  if (!["low", "medium", "high", "critical"].includes(severity)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid severity");
  }
  const row = {
    finding_no: `FND-${Date.now()}-${randomUUID().slice(0, 8)}`,
    response_id: requireUuid(args.response_id, "response_id"),
    answer_id: optionalUuid(args.answer_id, "answer_id"),
    finding_code: args.finding_code == null ? null : String(args.finding_code).slice(0, 120),
    severity,
    finding_type: requireText(args.finding_type || "non_compliance", "finding_type", 120),
    description: requireText(args.description, "description", 5000),
    corrective_action: args.corrective_action == null ? null : String(args.corrective_action).slice(0, 5000),
    owner_employee_id: optionalUuid(args.owner_employee_id, "owner_employee_id"),
    owner_profile_id: optionalUuid(args.owner_profile_id, "owner_profile_id") || actor.profile.id,
    due_date: args.due_date ? dateOrToday(args.due_date, "due_date") : null,
  };
  const { data } = await rest("survey_findings", {
    method: "POST", body: JSON.stringify([row]), headers: { Prefer: "return=representation" },
  });
  return data[0];
}

async function resolveSurveyFinding({ args, actor }) {
  const findingId = requireUuid(args.finding_id, "finding_id");
  const { data } = await rest(`survey_findings?id=eq.${findingId}&status=in.(open,in_progress)`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "resolved",
      resolved_note: requireText(args.resolved_note, "resolved_note", 5000),
      resolved_by_profile_id: actor.profile.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=representation" },
  });
  if (!data?.length) throw new ApiError(409, "INVALID_STATE", "Only open or in-progress findings can be resolved");
  return data[0];
}

function requestHash(action, args, actor) {
  return createHash("sha256").update(JSON.stringify({ action, args, actor: actor.profile.id })).digest("hex");
}

async function claimIdempotency(key, action, hash, actor) {
  const row = {
    idempotency_key: key, action_name: action, actor_profile_id: actor.profile.id,
    request_hash: hash, status: "processing",
  };
  const { data } = await rest("farm_action_idempotency", {
    method: "POST",
    body: JSON.stringify([row]),
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
  });
  if (data?.length) return { claimed: true, row: data[0] };
  const existing = await rest(`farm_action_idempotency?idempotency_key=eq.${encodeURIComponent(key)}&select=*&limit=1`)
    .then(({ data: rows }) => rows?.[0]);
  if (!existing || existing.request_hash !== hash) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used for a different request");
  }
  if (existing.status === "completed") return { claimed: false, response: existing.response_json };
  throw new ApiError(409, "ACTION_IN_PROGRESS", "An action with this idempotency key is already processing");
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
  if (req.method === "GET") {
    return json(res, 200, { ok: true, route: "farm-actions", authRequired: true, actions: Object.keys(ACTIONS) });
  }
  if (req.method !== "POST") return errorResponse(res, new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed"));

  let idempotencyKey = "";
  try {
    const actor = await authenticate(req);
    const body = await readBody(req);
    const action = requireText(body.action, "action", 120);
    const definition = ACTIONS[action];
    if (!definition) throw new ApiError(400, "ACTION_NOT_ALLOWED", `Action is not allowlisted: ${action}`);
    if (definition.admin) {
      if (![...actor.roles].some((role) => ADMIN_ROLES.has(role))) throw new ApiError(403, "FORBIDDEN", "Admin role required");
    } else {
      authorize(actor, { permissions: [definition.permission] });
    }
    if (definition.confirmation && body.confirmed !== true) {
      throw new ApiError(409, "CONFIRMATION_REQUIRED", "This action requires confirmed=true");
    }
    idempotencyKey = requireText(req.headers?.["idempotency-key"] || body.idempotency_key, "idempotency_key", 200);
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
    const hash = requestHash(action, args, actor);
    const claim = await claimIdempotency(idempotencyKey, action, hash, actor);
    if (!claim.claimed) return json(res, 200, claim.response);

    const params = definition.params(args, actor);
    await audit(req, actor, `farm_action.requested.${action}`, definition.entity, definition.entityId?.(args), {
      reason: String(body.reason || args.reason || "").slice(0, 500),
      idempotency_key: idempotencyKey,
    });
    const result = definition.execute ? await definition.execute(params) : await rpc(definition.rpc, params);
    const entityId = definition.entityId?.(args) || result?.id || (typeof result === "string" ? result : null);
    const response = { ok: true, action, idempotencyKey, result };
    await finishIdempotency(idempotencyKey, response);
    return json(res, 200, response);
  } catch (error) {
    if (idempotencyKey && error?.code !== "ACTION_IN_PROGRESS" && error?.code !== "IDEMPOTENCY_CONFLICT") {
      await finishIdempotency(idempotencyKey, null, {
        code: error?.code || "INTERNAL_ERROR", message: error?.message || "Unexpected error",
      }).catch(() => {});
    }
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { ACTIONS, requireWebTestCode, requestHash };
