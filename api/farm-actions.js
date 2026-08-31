const { createHash, randomUUID } = require("node:crypto");
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
  optionalUuid,
  readBody,
  requireText,
  requireUuid,
  rest,
  rpc,
} = require("../lib/server/farm-api");

const ACTIONS = {
  create_canonical_annual_work_plan: {
    permission: "farm.plan.create",
    rpc: "create_canonical_annual_work_plan",
    params: (args, actor, context) => ({
      p_plan_year: requiredInteger(args.plan_year, "plan_year", { minimum: 1 }),
      p_plan_name: requireText(args.plan_name, "plan_name", 500),
      p_actor_profile_id: actor.profile.id,
      p_request_key: context.idempotencyKey,
      p_estate_id: optionalUuid(args.estate_id, "estate_id"),
      p_note: optionalText(args.note, 2000),
    }),
    entity: "annual_work_plans",
  },
  update_canonical_annual_work_plan: {
    permission: "farm.plan.create",
    rpc: "update_canonical_annual_work_plan",
    params: (args, actor) => ({
      p_annual_plan_id: requireUuid(args.annual_plan_id, "annual_plan_id"),
      p_actor_profile_id: actor.profile.id,
      p_plan_name: requireText(args.plan_name, "plan_name", 500),
      p_estate_id: optionalUuid(args.estate_id, "estate_id"),
      p_note: optionalText(args.note, 2000),
    }),
    entity: "annual_work_plans", entityId: (args) => args.annual_plan_id,
  },
  approve_canonical_annual_work_plan: {
    permission: "farm.plan.approve",
    confirmation: true,
    rpc: "approve_canonical_annual_work_plan",
    params: (args, actor) => ({
      p_annual_plan_id: requireUuid(args.annual_plan_id, "annual_plan_id"),
      p_actor_profile_id: actor.profile.id,
    }),
    entity: "annual_work_plans", entityId: (args) => args.annual_plan_id,
  },
  delete_canonical_annual_work_plan: {
    permission: "farm.plan.create",
    confirmation: true,
    rpc: "delete_canonical_annual_work_plan",
    params: (args, actor) => ({
      p_annual_plan_id: requireUuid(args.annual_plan_id, "annual_plan_id"),
      p_actor_profile_id: actor.profile.id,
    }),
    entity: "annual_work_plans", entityId: (args) => args.annual_plan_id,
  },
  create_canonical_planned_work_item_snapshot: {
    permission: "farm.plan.create",
    rpc: "create_canonical_planned_work_item_snapshot",
    params: (args, actor, context) => ({
      p_annual_plan_id: requireUuid(args.annual_plan_id, "annual_plan_id"),
      p_budget_year_id: requireText(args.budget_year_id, "budget_year_id", 200),
      p_budget_activity_rate_id: requireText(args.budget_activity_rate_id, "budget_activity_rate_id", 200),
      p_budget_rate_block_id: requireText(args.budget_rate_block_id, "budget_rate_block_id", 200),
      p_block_id: requireUuid(args.block_id, "block_id"),
      p_activity_id: requireUuid(args.activity_id, "activity_id"),
      p_planning_request_key: context.idempotencyKey,
      p_actor_profile_id: actor.profile.id,
      p_plot_id: optionalUuid(args.plot_id, "plot_id"),
      p_planned_start_date: optionalDate(args.planned_start_date, "planned_start_date"),
      p_planned_end_date: optionalDate(args.planned_end_date, "planned_end_date"),
      p_recurrence_type: optionalText(args.recurrence_type, 80),
      p_recurrence_interval: optionalInteger(args.recurrence_interval, "recurrence_interval", { minimum: 1 }),
      p_repeat_after_last_done_days: optionalInteger(
        args.repeat_after_last_done_days,
        "repeat_after_last_done_days",
      ),
      p_target_quantity: optionalNumber(args.target_quantity, "target_quantity"),
      p_target_unit: optionalText(args.target_unit, 120),
      p_planned_budget: optionalNumber(args.planned_budget, "planned_budget"),
      p_suggested_team_id: optionalUuid(args.suggested_team_id, "suggested_team_id"),
      p_status: "planned",
      p_note: optionalText(args.note, 2000),
      p_ap_code: optionalText(args.ap_code, 200),
    }),
    entity: "planned_work_items",
  },
  update_canonical_planned_work_item: {
    permission: "farm.plan.create",
    rpc: "update_canonical_planned_work_item",
    params: (args, actor) => ({
      p_planned_work_item_id: requireUuid(args.planned_work_item_id, "planned_work_item_id"),
      p_actor_profile_id: actor.profile.id,
      p_planned_start_date: optionalDate(args.planned_start_date, "planned_start_date"),
      p_planned_end_date: optionalDate(args.planned_end_date, "planned_end_date"),
      p_recurrence_type: optionalText(args.recurrence_type, 80),
      p_recurrence_interval: optionalInteger(args.recurrence_interval, "recurrence_interval", { minimum: 1 }),
      p_repeat_after_last_done_days: optionalInteger(
        args.repeat_after_last_done_days,
        "repeat_after_last_done_days",
      ),
      p_target_quantity: optionalNumber(args.target_quantity, "target_quantity"),
      p_target_unit: optionalText(args.target_unit, 120),
      p_planned_budget: optionalNumber(args.planned_budget, "planned_budget"),
      p_suggested_team_id: optionalUuid(args.suggested_team_id, "suggested_team_id"),
      p_note: optionalText(args.note, 2000),
      p_ap_code: optionalText(args.ap_code, 200),
    }),
    entity: "planned_work_items", entityId: (args) => args.planned_work_item_id,
  },
  update_canonical_planned_resource_requirements: {
    permission: "farm.plan.create",
    rpc: "update_canonical_planned_resource_requirements",
    params: (args, actor) => ({
      p_planned_work_item_id: requireUuid(args.planned_work_item_id, "planned_work_item_id"),
      p_actor_profile_id: actor.profile.id,
      p_labor_requirements: Array.isArray(args.labor_requirements) ? args.labor_requirements : [],
      p_resource_requirements: Array.isArray(args.resource_requirements) ? args.resource_requirements : [],
    }),
    entity: "planned_work_items", entityId: (args) => args.planned_work_item_id,
  },
  refresh_canonical_planned_work_item_snapshot: {
    permission: "farm.plan.create",
    rpc: "refresh_canonical_planned_work_item_snapshot",
    params: (args, actor, context) => ({
      p_planned_work_item_id: requireUuid(args.planned_work_item_id, "planned_work_item_id"),
      p_actor_profile_id: actor.profile.id,
      p_refresh_request_key: context.idempotencyKey,
    }),
    entity: "planned_work_items", entityId: (args) => args.planned_work_item_id,
  },
  delete_canonical_planned_work_item: {
    permission: "farm.plan.create",
    confirmation: true,
    rpc: "delete_canonical_planned_work_item",
    params: (args, actor) => ({
      p_planned_work_item_id: requireUuid(args.planned_work_item_id, "planned_work_item_id"),
      p_actor_profile_id: actor.profile.id,
    }),
    entity: "planned_work_items", entityId: (args) => args.planned_work_item_id,
  },
  create_activity_material_standard_draft: {
    permission: "performance.standard.manage", execute: createActivityMaterialStandardDraft,
    params: (args, actor) => ({ args, actor }),
    entity: "activity_material_usage_rates",
  },
  update_activity_material_standard_draft: {
    permission: "performance.standard.manage", execute: updateActivityMaterialStandardDraft,
    params: (args, actor) => ({ args, actor }),
    entity: "activity_material_usage_rates", entityId: (args) => args.standard_id,
  },
  approve_activity_material_standard: {
    permission: "performance.standard.manage", confirmation: true, execute: approveActivityMaterialStandard,
    params: (args, actor) => ({ args, actor }),
    entity: "activity_material_usage_rates", entityId: (args) => args.standard_id,
  },
  inactivate_activity_material_standard: {
    permission: "performance.standard.manage", confirmation: true, execute: inactivateActivityMaterialStandard,
    params: (args, actor) => ({ args, actor }),
    entity: "activity_material_usage_rates", entityId: (args) => args.standard_id,
  },
  create_work_order_from_plan_item: {
    permission: "farm.work_order.create", confirmation: true, execute: createWorkOrderFromPlanItem,
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.planned_work_item_id,
  },
  create_canonical_work_order_from_planned_item: {
    permission: "farm.work_order.create", confirmation: true,
    rpc: "create_canonical_work_order_from_planned_item",
    params: (args, actor, context) => ({
      p_planned_work_item_id: requireUuid(args.planned_work_item_id, "planned_work_item_id"),
      p_actor_profile_id: actor.profile.id,
      p_request_key: context.idempotencyKey,
      p_scheduled_date: optionalDate(args.scheduled_date, "scheduled_date"),
      p_note: optionalText(args.note, 2000),
    }),
    entity: "work_orders", entityId: (args) => args.planned_work_item_id,
  },
  update_canonical_work_order_draft: {
    permission: "farm.work_order.create",
    rpc: "update_canonical_work_order_draft",
    params: (args, actor) => ({
      p_work_order_id: requireUuid(args.work_order_id, "work_order_id"),
      p_actor_profile_id: actor.profile.id,
      p_scheduled_date: requiredDate(args.scheduled_date, "scheduled_date"),
      p_scheduled_end_date: requiredDate(args.scheduled_end_date || args.scheduled_date, "scheduled_end_date"),
      p_team_id: optionalUuid(args.team_id, "team_id"),
      p_supervisor_employee_id: optionalUuid(args.supervisor_employee_id, "supervisor_employee_id"),
      p_contractor_id: optionalUuid(args.contractor_id, "contractor_id"),
      p_labor_assignments: Array.isArray(args.labor_assignments) ? args.labor_assignments : [],
      p_resource_assignments: Array.isArray(args.resource_assignments) ? args.resource_assignments : [],
    }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  submit_work_order: {
    permission: "farm.work_order.create", confirmation: true,
    execute: submitWorkOrder,
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  approve_work_order: {
    permission: "farm.plan.approve", confirmation: true,
    execute: ({ args, actor }) => changeWorkOrderStatus(args, actor, ["submitted", "pending_approval"], "approved"),
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  reject_work_order: {
    permission: "farm.plan.approve", confirmation: true,
    execute: ({ args, actor }) => changeWorkOrderStatus(args, actor, ["submitted", "pending_approval"], "rejected"),
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  dispatch_work_order: {
    permission: "farm.work_order.dispatch", confirmation: true,
    execute: ({ args, actor }) => changeWorkOrderStatus(args, actor, ["approved"], "dispatched"),
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  save_dispatch_assignment: {
    permission: "farm.work_order.dispatch", confirmation: true, execute: saveDispatchAssignment,
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  start_work_order: {
    permission: "farm.work_order.dispatch", confirmation: true,
    execute: ({ args, actor }) => changeWorkOrderStatus(args, actor, ["dispatched"], "in_progress", { validateStart: true }),
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  complete_work_order: {
    permission: "farm.result.record", confirmation: true,
    execute: ({ args, actor }) => changeWorkOrderStatus(args, actor, ["in_progress"], "completed"),
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  close_work_order: {
    permission: "farm.result.close", confirmation: true,
    execute: ({ args, actor }) => changeWorkOrderStatus(args, actor, ["completed"], "closed"),
    params: (args, actor) => ({ args, actor }),
    entity: "work_orders", entityId: (args) => args.work_order_id,
  },
  get_or_create_work_result: {
    permission: "farm.result.record",
    execute: getOrCreateWorkResult,
    params: (args, actor) => ({ args, actor }),
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
    permissions: ["inventory.issue.prepare", "inventory.manage"],
    execute: prepareGoodsIssueFromWorkOrder,
    params: (args, actor) => ({
      args,
      actor,
    }),
    entity: "goods_issues",
  },
  approve_goods_issue: {
    permissions: ["inventory.issue.approve", "inventory.manage"], confirmation: true, rpc: "approve_goods_issue",
    params: (args, actor) => ({ p_issue_id: requireUuid(args.issue_id, "issue_id"), p_profile_id: actor.profile.id }),
    entity: "goods_issues", entityId: (args) => args.issue_id,
  },
  post_goods_issue: {
    permissions: ["inventory.issue.post", "inventory.manage"], confirmation: true, rpc: "post_goods_issue",
    params: (args, actor) => ({ p_issue_id: requireUuid(args.issue_id, "issue_id"), p_profile_id: actor.profile.id }),
    entity: "goods_issues", entityId: (args) => args.issue_id,
  },
  "calculate-material-issue-quantity": {
    permissions: ["inventory.issue.prepare", "inventory.conversion.view", "inventory.manage"],
    rpc: "calculate_material_issue_quantity",
    params: (args) => ({
      p_material_id: requireUuid(args.material_id, "material_id"),
      p_required_quantity: requiredNumber(args.required_quantity, "required_quantity", { minimum: Number.EPSILON }),
      p_required_unit_id: requireUuid(args.required_unit_id, "required_unit_id"),
      p_issue_unit_id: requireUuid(args.issue_unit_id, "issue_unit_id"),
      p_allow_fraction: booleanValue(args.allow_fraction, "allow_fraction", false),
    }),
    entity: "sku_conversions",
  },
  "configure-goods-issue-period": {
    permissions: ["inventory.issue.prepare", "inventory.manage"],
    confirmation: true,
    rpc: "configure_goods_issue_period",
    params: (args, actor) => ({
      p_issue_id: requireUuid(args.issue_id, "issue_id"),
      p_issue_start_date: requiredDate(args.issue_start_date, "issue_start_date"),
      p_issue_end_date: requiredDate(args.issue_end_date, "issue_end_date"),
      p_allow_multi_day: booleanValue(args.allow_multi_day, "allow_multi_day", false),
      p_profile_id: actor.profile.id,
    }),
    entity: "goods_issues", entityId: (args) => args.issue_id,
  },
  "record-goods-issue-daily-usage": {
    permissions: ["inventory.issue.usage.record", "inventory.manage"],
    rpc: "record_goods_issue_daily_usage",
    params: (args, actor, context) => ({
      p_issue_id: requireUuid(args.issue_id, "issue_id"),
      p_issue_line_id: requireUuid(args.goods_issue_line_id || args.goodsIssueLineId, "goods_issue_line_id"),
      p_usage_date: requiredDate(args.usage_date, "usage_date"),
      p_work_result_id: optionalUuid(args.work_result_id, "work_result_id"),
      p_material_id: requireUuid(args.material_id, "material_id"),
      p_quantity: requiredNumber(args.quantity, "quantity", { minimum: Number.EPSILON }),
      p_unit_id: requireUuid(args.unit_id, "unit_id"),
      p_profile_id: actor.profile.id,
      p_note: optionalText(args.note, 2000),
      p_idempotency_key: context.idempotencyKey,
    }),
    entity: "goods_issue_daily_usage", entityId: (args) => args.goods_issue_line_id || args.goodsIssueLineId,
  },
  "prepare-goods-return": {
    permissions: ["inventory.return.prepare", "inventory.manage"],
    rpc: "prepare_goods_return_from_issue",
    params: (args, actor) => ({
      p_issue_id: requireUuid(args.issue_id, "issue_id"),
      p_profile_id: actor.profile.id,
      p_return_date: requiredDate(args.return_date, "return_date"),
      p_work_result_id: optionalUuid(args.work_result_id, "work_result_id"),
    }),
    entity: "goods_returns",
  },
  "update-goods-return-line": {
    permissions: ["inventory.return.edit", "inventory.manage"],
    rpc: "update_goods_return_line",
    params: (args, actor) => ({
      p_return_line_id: requireUuid(args.return_line_id, "return_line_id"),
      p_quantity: requiredNumber(args.quantity, "quantity", { minimum: Number.EPSILON }),
      p_unit_id: requireUuid(args.unit_id, "unit_id"),
      p_condition_status: enumValue(
        args.condition_status,
        "condition_status",
        ["good", "damaged", "expired", "contaminated", "quarantine"],
      ),
      p_destination_bin_id: requireUuid(args.destination_bin_id, "destination_bin_id"),
      p_profile_id: actor.profile.id,
    }),
    entity: "goods_return_lines", entityId: (args) => args.return_line_id,
  },
  "approve-goods-return": {
    permissions: ["inventory.return.approve", "inventory.manage"],
    confirmation: true,
    rpc: "approve_goods_return",
    params: (args, actor) => ({
      p_return_id: requireUuid(args.return_id, "return_id"),
      p_profile_id: actor.profile.id,
    }),
    entity: "goods_returns", entityId: (args) => args.return_id,
  },
  "post-goods-return": {
    permissions: ["inventory.return.post", "inventory.manage"],
    confirmation: true,
    rpc: "post_goods_return",
    params: (args, actor) => ({
      p_return_id: requireUuid(args.return_id, "return_id"),
      p_profile_id: actor.profile.id,
    }),
    entity: "goods_returns", entityId: (args) => args.return_id,
  },
  "close-goods-issue-usage": {
    permissions: ["inventory.issue.close", "inventory.manage"],
    confirmation: true,
    rpc: "close_goods_issue_usage",
    params: (args, actor) => ({
      p_issue_id: requireUuid(args.issue_id, "issue_id"),
      p_profile_id: actor.profile.id,
    }),
    entity: "goods_issues", entityId: (args) => args.issue_id,
  },
  "save-material-conversion": {
    permissions: ["inventory.conversion.manage", "inventory.manage"],
    confirmation: true,
    rpc: "save_material_conversion",
    params: (args, actor) => ({
      p_material_id: requireUuid(args.material_id, "material_id"),
      p_from_unit_id: requireUuid(args.from_unit_id, "from_unit_id"),
      p_to_unit_id: requireUuid(args.to_unit_id, "to_unit_id"),
      p_conversion_rate: requiredNumber(args.conversion_rate, "conversion_rate", { minimum: Number.EPSILON }),
      p_status: enumValue(args.status || "active", "status", ["active", "inactive"]),
      p_profile_id: actor.profile.id,
    }),
    entity: "sku_conversions", entityId: (args) => args.material_id,
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
    permission: "fuel.requisition.create", execute: refreshVehicleFuelRequisition,
    params: (args, actor) => ({ args, actor }),
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
  create_budget_block_material_rate: {
    permission: "budget.rate_rule.manage", rpc: "apply_budget_block_material_rates",
    params: (args, actor) => budgetBlockMaterialActionParams(args, actor, "create"),
    entity: "budget_rate_block_materials",
  },
  update_budget_block_material_rate: {
    permission: "budget.rate_rule.manage", rpc: "apply_budget_block_material_rates",
    params: (args, actor) => budgetBlockMaterialActionParams(args, actor, "update"),
    entity: "budget_rate_block_materials", entityId: (args) => args.row_id,
  },
  deactivate_budget_block_material_rate: {
    permission: "budget.rate_rule.manage", confirmation: true, rpc: "apply_budget_block_material_rates",
    params: (args, actor) => budgetBlockMaterialActionParams(args, actor, "deactivate"),
    entity: "budget_rate_block_materials", entityId: (args) => args.row_id,
  },
  bulk_apply_budget_block_material_rate: {
    permission: "budget.rate_rule.manage", confirmation: true, rpc: "apply_budget_block_material_rates",
    params: (args, actor) => budgetBlockMaterialActionParams(args, actor, "bulk_apply"),
    entity: "budget_rate_block_materials",
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
  create_survey_evidence_upload: {
    permission: "survey.respond", execute: createSurveyEvidenceUpload,
    params: (args, actor) => ({ args, actor }),
    entity: "survey_response_attachments", entityId: (args) => args.response_id,
  },
  finalize_survey_evidence: {
    permission: "survey.respond", execute: finalizeSurveyEvidence,
    params: (args, actor) => ({ args, actor }),
    entity: "survey_response_attachments", entityId: (args) => args.response_id,
  },
  mark_notification_read: {
    permission: "notification.view", execute: markNotificationRead,
    params: (args, actor) => ({ args, actor }),
    entity: "app_notifications", entityId: (args) => args.notification_id,
  },
  mark_all_notifications_read: {
    permission: "notification.view", execute: markAllNotificationsRead,
    params: (args, actor) => ({ args, actor }),
    entity: "app_notifications",
  },
  acknowledge_notification: {
    permission: "notification.acknowledge", execute: acknowledgeNotification,
    params: (args, actor) => ({ args, actor }),
    entity: "app_notifications", entityId: (args) => args.notification_id,
  },
  snooze_notification: {
    permission: "notification.snooze", execute: snoozeNotification,
    params: (args, actor) => ({ args, actor }),
    entity: "app_notifications", entityId: (args) => args.notification_id,
  },
  close_notification: {
    permission: "notification.manage", confirmation: true, execute: closeNotification,
    params: (args, actor) => ({ args, actor }),
    entity: "app_notifications", entityId: (args) => args.notification_id,
  },
  save_notification_preference: {
    permission: "notification.view", execute: saveNotificationPreference,
    params: (args, actor) => ({ args, actor }),
    entity: "app_notification_preferences",
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

const PLANNING_UAT_PLAN_PREFIX = "WEBTEST-UAT-P2C-";

const PLANNING_UAT_ACTIONS = new Set([
  "create_canonical_annual_work_plan",
  "update_canonical_annual_work_plan",
  "delete_canonical_annual_work_plan",
  "create_canonical_planned_work_item_snapshot",
  "update_canonical_planned_work_item",
  "update_canonical_planned_resource_requirements",
  "refresh_canonical_planned_work_item_snapshot",
  "delete_canonical_planned_work_item",
]);

const UAT_MUTATION_ACTIONS = new Set([
  ...PLANNING_UAT_ACTIONS,
  "create_work_order_from_plan_item",
  "create_canonical_work_order_from_planned_item",
  "update_canonical_work_order_draft",
  "submit_work_order",
  "approve_work_order",
  "reject_work_order",
  "dispatch_work_order",
  "save_dispatch_assignment",
  "start_work_order",
  "complete_work_order",
  "close_work_order",
  "get_or_create_work_result",
  "save_work_result_draft",
  "submit_work_result",
  "verify_work_result",
  "close_work_result",
  "link_inbound_weight_ticket",
  "create_survey_response",
  "save_survey_draft",
  "submit_survey_response",
  "verify_survey_response",
  "close_survey_response",
  "create_survey_evidence_upload",
  "finalize_survey_evidence",
  "mark_notification_read",
  "mark_all_notifications_read",
  "acknowledge_notification",
  "snooze_notification",
  "save_notification_preference",
  "prepare_goods_issue_from_work_order",
  "approve_goods_issue",
  "post_goods_issue",
  "calculate-material-issue-quantity",
  "configure-goods-issue-period",
  "record-goods-issue-daily-usage",
  "prepare-goods-return",
  "update-goods-return-line",
  "approve-goods-return",
  "post-goods-return",
  "close-goods-issue-usage",
  "save-material-conversion",
]);

const INVENTORY_UAT_ACTIONS = new Set([
  "prepare_goods_issue_from_work_order",
  "approve_goods_issue",
  "post_goods_issue",
  "calculate-material-issue-quantity",
  "configure-goods-issue-period",
  "record-goods-issue-daily-usage",
  "prepare-goods-return",
  "update-goods-return-line",
  "approve-goods-return",
  "post-goods-return",
  "close-goods-issue-usage",
  "save-material-conversion",
]);

function requireWebTestCode(value) {
  if (value !== "WEBTEST-2569") throw new ApiError(400, "VALIDATION_ERROR", "Only WEBTEST-2569 is allowed");
  return value;
}

function dateOrToday(value, field = "response_date") {
  const date = String(value || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "VALIDATION_ERROR", `${field} must be YYYY-MM-DD`);
  return date;
}

function requiredDate(value, field) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be YYYY-MM-DD`, { field });
  }
  return date;
}

function optionalDate(value, field) {
  return value == null || value === "" ? null : requiredDate(value, field);
}

function optionalInteger(value, field, { minimum = 0 } = {}) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be an integer greater than or equal to ${minimum}`, { field });
  }
  return number;
}

function requiredInteger(value, field, options = {}) {
  const number = optionalInteger(value, field, options);
  if (number == null) throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  return number;
}

function requiredNumber(value, field, options = {}) {
  const number = optionalNumber(value, field, options);
  if (number == null) throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  return number;
}

function booleanValue(value, field, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a boolean`, { field });
  }
  return value;
}

function enumValue(value, field, values) {
  const text = String(value || "");
  if (!values.includes(text)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid`, { field });
  }
  return text;
}

function optionalText(value, max) {
  if (value == null || value === "") return null;
  return String(value).slice(0, max);
}

const BUDGET_MATERIAL_USAGE_BASES = ["tree_count", "area_rai", "manual_qty", "bag_count"];
const BUDGET_MATERIAL_STATUSES = ["active", "inactive"];

function budgetBlockMaterialTextIds(value, field) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be an array`, { field });
  }
  const ids = [...new Set(value.map((id) => requireText(id, field, 200)))];
  if (!ids.length || ids.length > 500) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must contain between 1 and 500 IDs`, { field });
  }
  return ids;
}

function budgetBlockMaterialActionParams(args, actor, operation) {
  const blockIds = budgetBlockMaterialTextIds(args.budget_rate_block_ids, "budget_rate_block_ids");
  if (["create", "update", "deactivate"].includes(operation) && blockIds.length !== 1) {
    throw new ApiError(400, "VALIDATION_ERROR", `${operation} requires exactly one Budget Block`, {
      field: "budget_rate_block_ids",
    });
  }
  return {
    p_operation: operation,
    p_budget_year_id: requireText(args.budget_year_id, "budget_year_id", 200),
    p_budget_activity_rate_id: requireText(args.budget_activity_rate_id, "budget_activity_rate_id", 200),
    p_budget_rate_block_ids: blockIds,
    p_material_id: requireUuid(args.material_id, "material_id"),
    p_usage_basis: enumValue(args.usage_basis, "usage_basis", BUDGET_MATERIAL_USAGE_BASES),
    p_usage_rate: requiredNumber(args.usage_rate, "usage_rate", { minimum: Number.EPSILON }),
    p_unit_id: requireUuid(args.unit_id, "unit_id"),
    p_actor_profile_id: actor.profile.id,
    p_unit_cost: optionalNumber(args.unit_cost, "unit_cost"),
    p_amount_per_basis: optionalNumber(args.amount_per_basis, "amount_per_basis"),
    p_status: enumValue(args.status || (operation === "deactivate" ? "inactive" : "active"), "status", BUDGET_MATERIAL_STATUSES),
    p_note: optionalText(args.note, 2000),
    p_row_id: ["update", "deactivate"].includes(operation)
      ? requireUuid(args.row_id, "row_id")
      : null,
  };
}

async function one(path, label) {
  const row = await rest(path).then(({ data }) => data?.[0]);
  if (!row) throw new ApiError(404, "NOT_FOUND", `${label} was not found`);
  return row;
}

function actorIsAdmin(actor) {
  return [...actor.roles].some((role) => ADMIN_ROLES.has(role));
}

const MATERIAL_USAGE_BASES = new Set(["per_tree", "per_rai"]);

function activityMaterialStandardInput(args) {
  const usageBasis = requireText(args.usage_basis, "usage_basis", 40);
  if (!MATERIAL_USAGE_BASES.has(usageBasis)) {
    throw new ApiError(400, "VALIDATION_ERROR", "usage_basis must use an existing canonical basis", { field: "usage_basis" });
  }
  const fiscalYear = requireText(args.fiscal_year, "fiscal_year", 16);
  if (!/^\d{4}$/.test(fiscalYear)) {
    throw new ApiError(400, "VALIDATION_ERROR", "fiscal_year must be four digits", { field: "fiscal_year" });
  }
  const start = requiredDate(args.effective_start_date, "effective_start_date");
  const end = args.effective_end_date ? requiredDate(args.effective_end_date, "effective_end_date") : null;
  if (end && end < start) {
    throw new ApiError(400, "VALIDATION_ERROR", "effective_end_date must not precede effective_start_date");
  }
  return {
    activity_id: requireUuid(args.activity_id, "activity_id"),
    material_id: requireUuid(args.material_id, "material_id"),
    unit_id: requireUuid(args.unit_id, "unit_id"),
    fiscal_year: fiscalYear,
    usage_basis: usageBasis,
    usage_rate: requiredNumber(args.usage_rate, "usage_rate", { minimum: Number.EPSILON }),
    usage_unit: null,
    effective_start_date: start,
    effective_end_date: end,
    source_type: requireText(args.source_type || "manual", "source_type", 80),
    note: optionalText(args.note, 2000),
  };
}

async function requireActiveStandardParent(table, id, label) {
  const row = await one(`${table}?id=eq.${encodeURIComponent(id)}&select=id,status&limit=1`, label);
  if (String(row.status || "active") !== "active") {
    throw new ApiError(409, "INACTIVE_REFERENCE", `${label} is inactive`);
  }
  return row;
}

async function validateActivityMaterialStandardParents(input) {
  await Promise.all([
    requireActiveStandardParent("activities", input.activity_id, "Activity"),
    requireActiveStandardParent("materials", input.material_id, "Material"),
    requireActiveStandardParent("units", input.unit_id, "Unit"),
  ]);
}

async function nextActivityMaterialStandardVersion(input) {
  const path = `activity_material_usage_rates?activity_id=eq.${encodeURIComponent(input.activity_id)}`
    + `&material_id=eq.${encodeURIComponent(input.material_id)}`
    + `&fiscal_year=eq.${encodeURIComponent(input.fiscal_year)}`
    + "&select=version_no&order=version_no.desc&limit=1";
  const rows = await rest(path).then(({ data }) => data || []);
  return Number(rows[0]?.version_no || 0) + 1;
}

async function createActivityMaterialStandardDraft({ args, actor }) {
  const input = activityMaterialStandardInput(args);
  await validateActivityMaterialStandardParents(input);
  const now = new Date().toISOString();
  const version = await nextActivityMaterialStandardVersion(input);
  const rows = await rest("activity_material_usage_rates", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      version_no: version,
      approval_status: "draft",
      status: "active",
      created_by_profile_id: actor.profile.id,
      updated_by_profile_id: actor.profile.id,
      created_at: now,
      updated_at: now,
    }),
    headers: { Prefer: "return=representation" },
  }).then(({ data }) => data || []);
  return rows[0];
}

async function standardById(id) {
  return one(`activity_material_usage_rates?id=eq.${encodeURIComponent(requireUuid(id, "standard_id"))}&select=*&limit=1`, "Activity material standard");
}

async function updateActivityMaterialStandardDraft({ args, actor }) {
  const current = await standardById(args.standard_id);
  if (current.approval_status !== "draft" || current.status !== "active") {
    throw new ApiError(409, "STANDARD_NOT_DRAFT", "Only an active draft can be edited");
  }
  const input = activityMaterialStandardInput({ ...current, ...args });
  await validateActivityMaterialStandardParents(input);
  const rows = await rest(`activity_material_usage_rates?id=eq.${encodeURIComponent(current.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...input, updated_by_profile_id: actor.profile.id, updated_at: new Date().toISOString() }),
    headers: { Prefer: "return=representation" },
  }).then(({ data }) => data || []);
  return rows[0];
}

function standardPeriodsOverlap(left, right) {
  const leftEnd = left.effective_end_date || "9999-12-31";
  const rightEnd = right.effective_end_date || "9999-12-31";
  return left.effective_start_date <= rightEnd && right.effective_start_date <= leftEnd;
}

async function approveActivityMaterialStandard({ args, actor }) {
  const current = await standardById(args.standard_id);
  if (current.approval_status !== "draft" || current.status !== "active") {
    throw new ApiError(409, "STANDARD_NOT_DRAFT", "Only an active draft can be approved");
  }
  await validateActivityMaterialStandardParents(current);
  const candidates = await rest(
    `activity_material_usage_rates?activity_id=eq.${encodeURIComponent(current.activity_id)}`
      + `&material_id=eq.${encodeURIComponent(current.material_id)}`
      + `&approval_status=eq.approved&status=eq.active&select=id,effective_start_date,effective_end_date`,
  ).then(({ data }) => data || []);
  if (candidates.some((row) => row.id !== current.id && standardPeriodsOverlap(current, row))) {
    throw new ApiError(409, "STANDARD_PERIOD_OVERLAP", "An approved standard already covers this effective period");
  }
  const now = new Date().toISOString();
  const rows = await rest(`activity_material_usage_rates?id=eq.${encodeURIComponent(current.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      approval_status: "approved",
      approved_by_profile_id: actor.profile.id,
      approved_at: now,
      updated_by_profile_id: actor.profile.id,
      updated_at: now,
    }),
    headers: { Prefer: "return=representation" },
  }).then(({ data }) => data || []);
  return rows[0];
}

async function inactivateActivityMaterialStandard({ args, actor }) {
  const current = await standardById(args.standard_id);
  if (current.approval_status === "inactive" || current.status === "inactive") return current;
  const rows = await rest(`activity_material_usage_rates?id=eq.${encodeURIComponent(current.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      approval_status: "inactive",
      status: "inactive",
      updated_by_profile_id: actor.profile.id,
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=representation" },
  }).then(({ data }) => data || []);
  return rows[0];
}

function requireUatWorkOrder(order) {
  if (!String(order?.work_order_no || "").startsWith("WEBTEST-UAT-")) {
    throw new ApiError(403, "UAT_WRITE_FORBIDDEN", "UAT writes are restricted to WEBTEST-UAT records");
  }
  return order;
}

function requirePlanningUatPlanName(planName) {
  if (!String(planName || "").startsWith(PLANNING_UAT_PLAN_PREFIX)) {
    throw new ApiError(
      403,
      "UAT_WRITE_FORBIDDEN",
      `Planning UAT writes are restricted to ${PLANNING_UAT_PLAN_PREFIX} Plans`,
    );
  }
}

function requirePlanningUatPlan(actor, plan) {
  if (
    plan?.source_type !== "canonical_budget"
    || plan?.created_by !== actor.profile.id
    || !String(plan?.plan_name || "").startsWith(PLANNING_UAT_PLAN_PREFIX)
  ) {
    throw new ApiError(
      403,
      "UAT_WRITE_FORBIDDEN",
      `Planning UAT writes are restricted to owned ${PLANNING_UAT_PLAN_PREFIX} canonical Plans`,
    );
  }
  return plan;
}

async function planningUatPlanById(actor, annualPlanId, dependencies = {}) {
  const loadOne = dependencies.one || one;
  const plan = await loadOne(
    `annual_work_plans?id=eq.${requireUuid(annualPlanId, "annual_plan_id")}`
      + "&select=id,source_type,created_by,plan_name&limit=1",
    "Annual work plan",
  );
  return requirePlanningUatPlan(actor, plan);
}

async function enforcePlanningUatMutation(actor, action, args, dependencies = {}) {
  const loadOne = dependencies.one || one;
  if (action === "create_canonical_annual_work_plan") {
    requirePlanningUatPlanName(args.plan_name);
    return;
  }
  if (action === "update_canonical_annual_work_plan") {
    requirePlanningUatPlanName(args.plan_name);
  }
  if (["update_canonical_annual_work_plan", "delete_canonical_annual_work_plan"].includes(action)) {
    await planningUatPlanById(actor, args.annual_plan_id, dependencies);
    return;
  }
  if (action === "create_canonical_planned_work_item_snapshot") {
    await planningUatPlanById(actor, args.annual_plan_id, dependencies);
    return;
  }
  const item = await loadOne(
    `planned_work_items?id=eq.${requireUuid(args.planned_work_item_id, "planned_work_item_id")}`
      + "&select=id,annual_plan_id&limit=1",
    "Planned work item",
  );
  await planningUatPlanById(actor, item.annual_plan_id, dependencies);
}

function requireInventoryUatIssue(issue) {
  if (!String(issue?.issue_no || "").startsWith("WEBTEST-UAT-INV-")) {
    throw new ApiError(
      403,
      "UAT_WRITE_FORBIDDEN",
      "Inventory UAT writes are restricted to WEBTEST-UAT-INV records",
    );
  }
  return issue;
}

async function inventoryIssueFromArgs(action, args, { requireUatPrefix = true } = {}) {
  if (action === "calculate-material-issue-quantity") return null;
  if (action === "save-material-conversion") {
    const materialId = requireUuid(args.material_id, "material_id");
    const material = await one(
      `materials?id=eq.${materialId}&select=id,material_code&limit=1`,
      "Material",
    );
    if (requireUatPrefix && !String(material.material_code || "").startsWith("WEBTEST-UAT-INV-")) {
      throw new ApiError(
        403,
        "UAT_WRITE_FORBIDDEN",
        "Inventory UAT conversion writes are restricted to WEBTEST-UAT-INV materials",
      );
    }
    return null;
  }
  if (action === "prepare_goods_issue_from_work_order") {
    return one(
      `work_orders?id=eq.${requireUuid(args.work_order_id, "work_order_id")}`
      + "&select=id,work_order_no,estate_id,plot_id,block_id&limit=1",
      "Work order",
    );
  }

  let issueId = args.issue_id || null;
  if (!issueId && (args.goods_issue_line_id || args.goodsIssueLineId)) {
    const lineId = requireUuid(
      args.goods_issue_line_id || args.goodsIssueLineId,
      "goods_issue_line_id",
    );
    const line = await one(
      `goods_issue_lines?id=eq.${lineId}&select=id,issue_id&limit=1`,
      "Goods issue line",
    );
    issueId = line.issue_id;
  }
  if (!issueId && args.return_line_id) {
    const returnLine = await one(
      `goods_return_lines?id=eq.${requireUuid(args.return_line_id, "return_line_id")}`
      + "&select=id,return_id&limit=1",
      "Goods return line",
    );
    args = { ...args, return_id: returnLine.return_id };
  }
  if (!issueId && args.return_id) {
    const goodsReturn = await one(
      `goods_returns?id=eq.${requireUuid(args.return_id, "return_id")}`
      + "&select=id,goods_issue_id&limit=1",
      "Goods return",
    );
    issueId = goodsReturn.goods_issue_id;
  }
  const issue = await one(
    `goods_issues?id=eq.${requireUuid(issueId, "issue_id")}`
    + "&select=id,issue_no,work_order_id&limit=1",
    "Goods issue",
  );
  if (requireUatPrefix) requireInventoryUatIssue(issue);
  if (!issue.work_order_id) {
    throw new ApiError(403, "SCOPE_FORBIDDEN", "Goods issue is not linked to a scoped work order");
  }
  return one(
    `work_orders?id=eq.${issue.work_order_id}`
    + "&select=id,work_order_no,estate_id,plot_id,block_id&limit=1",
    "Work order",
  );
}

async function enforceActionScope(actor, action, args) {
  if (action === "create_canonical_work_order_from_planned_item") {
    const item = await one(
      `planned_work_items?id=eq.${requireUuid(args.planned_work_item_id, "planned_work_item_id")}`
        + "&select=id,annual_plan_id,plot_id,block_id&limit=1",
      "Planned work item",
    );
    const plan = await one(
      `annual_work_plans?id=eq.${item.annual_plan_id}&select=id,estate_id&limit=1`,
      "Annual work plan",
    );
    await authorizeWorkOrderScope(actor, { estate_id: plan.estate_id, plot_id: item.plot_id, block_id: item.block_id });
    return;
  }
  if (["update_canonical_work_order_draft", "submit_work_order"].includes(action)) {
    const order = await one(
      `work_orders?id=eq.${requireUuid(args.work_order_id, "work_order_id")}`
        + "&select=id,estate_id,plot_id,block_id&limit=1",
      "Work order",
    );
    await authorizeWorkOrderScope(actor, order);
    return;
  }
  if (INVENTORY_UAT_ACTIONS.has(action)) {
    const order = await inventoryIssueFromArgs(action, args, { requireUatPrefix: false });
    if (order) await authorizeWorkOrderScope(actor, order);
  }
}

async function uatOrderFromArgs(action, args) {
  if (["create_work_order_from_plan_item", "create_canonical_work_order_from_planned_item"].includes(action)) {
    const itemId = requireUuid(args.planned_work_item_id, "planned_work_item_id");
    const item = await one(`planned_work_items?id=eq.${itemId}&select=id,annual_plan_id&limit=1`, "Planned work item");
    const plan = await one(`annual_work_plans?id=eq.${item.annual_plan_id}&select=id,plan_name,note&limit=1`, "Annual work plan");
    if (!String(plan.plan_name || plan.note || "").startsWith("WEBTEST-UAT-")) {
      throw new ApiError(403, "UAT_WRITE_FORBIDDEN", "UAT writes are restricted to WEBTEST-UAT records");
    }
    return null;
  }
  if (args.work_order_id) {
    return one(
      `work_orders?id=eq.${requireUuid(args.work_order_id, "work_order_id")}&select=id,work_order_no,estate_id,plot_id,block_id&limit=1`,
      "Work order",
    );
  }
  if (args.result_id || args.work_result_id) {
    const resultId = requireUuid(args.result_id || args.work_result_id, "result_id");
    const result = await one(`work_results?id=eq.${resultId}&select=id,work_order_id&limit=1`, "Work result");
    return one(
      `work_orders?id=eq.${result.work_order_id}&select=id,work_order_no,estate_id,plot_id,block_id&limit=1`,
      "Work order",
    );
  }
  if (args.response_id) {
    const responseId = requireUuid(args.response_id, "response_id");
    const response = await one(
      `survey_responses?id=eq.${responseId}&select=id,work_order_id,work_result_id&limit=1`,
      "Survey response",
    );
    if (response.work_order_id) {
      return one(
        `work_orders?id=eq.${response.work_order_id}&select=id,work_order_no,estate_id,plot_id,block_id&limit=1`,
        "Work order",
      );
    }
    const result = await one(`work_results?id=eq.${response.work_result_id}&select=id,work_order_id&limit=1`, "Work result");
    return one(
      `work_orders?id=eq.${result.work_order_id}&select=id,work_order_no,estate_id,plot_id,block_id&limit=1`,
      "Work order",
    );
  }
  return null;
}

async function enforceUatMutation(actor, action, args, dependencies = {}) {
  if (!actorIsUat(actor)) return;
  if (!UAT_MUTATION_ACTIONS.has(action)) {
    throw new ApiError(403, "UAT_ACTION_FORBIDDEN", "This action is disabled for UAT identities");
  }
  if (PLANNING_UAT_ACTIONS.has(action)) {
    await enforcePlanningUatMutation(actor, action, args, dependencies);
    return;
  }
  const order = INVENTORY_UAT_ACTIONS.has(action)
    ? await inventoryIssueFromArgs(action, args)
    : await uatOrderFromArgs(action, args);
  if (order) {
    await authorizeWorkOrderScope(actor, order);
    requireUatWorkOrder(order);
  }
}

async function authorizeWorkOrderScope(actor, order) {
  if (actorIsAdmin(actor)) return;
  const scopes = await rest(
    `user_access_scopes?profile_id=eq.${actor.profile.id}&status=eq.active&select=estate_id,plot_id,block_id`,
  ).then(({ data }) => data || []);
  // Existing installations without explicit scope rows retain their permission-based access.
  if (!scopes.length) return;
  const allowed = scopes.some((scope) =>
    (!scope.estate_id || scope.estate_id === order.estate_id)
    && (!scope.plot_id || scope.plot_id === order.plot_id)
    && (!scope.block_id || scope.block_id === order.block_id));
  if (!allowed) throw new ApiError(403, "SCOPE_FORBIDDEN", "Work order is outside your assigned scope");
}

async function prepareGoodsIssueFromWorkOrder({ args, actor }) {
  const workOrderId = requireUuid(args.work_order_id, "work_order_id");
  const warehouseId = optionalUuid(args.warehouse_id, "warehouse_id");
  const order = await one(
    `work_orders?id=eq.${workOrderId}`
    + "&select=id,work_order_no,estate_id,plot_id,block_id&limit=1",
    "Work order",
  );
  await authorizeWorkOrderScope(actor, order);
  if (actorIsUat(actor)) requireUatWorkOrder(order);

  const result = await rpc("prepare_goods_issue_from_work_order", {
    p_work_order_id: workOrderId,
    p_warehouse_id: warehouseId,
    p_profile_id: actor.profile.id,
  });
  let issue = Array.isArray(result) ? result[0] : result;
  if (!issue?.id) throw new ApiError(500, "WRITE_FAILED", "Goods issue could not be prepared");

  if (actorIsUat(actor) && !String(issue.issue_no || "").startsWith("WEBTEST-UAT-INV-")) {
    const issueNo = `WEBTEST-UAT-INV-GI-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { data } = await rest(`goods_issues?id=eq.${issue.id}&status=eq.draft`, {
      method: "PATCH",
      body: JSON.stringify({ issue_no: issueNo }),
      headers: { Prefer: "return=representation" },
    });
    if (!data?.length) {
      throw new ApiError(409, "STATE_CONFLICT", "Prepared goods issue could not be marked for inventory UAT");
    }
    [issue] = data;
  }
  return issue;
}

async function createWorkOrderFromPlanItem({ args, actor }, dependencies = {}) {
  const restClient = dependencies.rest || rest;
  const loadOne = dependencies.one || (async (path, label) => {
    const row = await restClient(path).then(({ data }) => data?.[0]);
    if (!row) throw new ApiError(404, "NOT_FOUND", `${label} was not found`);
    return row;
  });
  const plannedWorkItemId = requireUuid(args.planned_work_item_id, "planned_work_item_id");
  const item = await loadOne(
    `planned_work_items?id=eq.${plannedWorkItemId}&select=*&limit=1`,
    "Planned work item",
  );
  const annual = item.annual_plan_id
    ? await loadOne(
      `annual_work_plans?id=eq.${item.annual_plan_id}&select=id,plan_year,estate_id,status,source_type&limit=1`,
      "Annual work plan",
    )
    : null;
  if (item.source_type === "canonical_budget" || annual?.source_type === "canonical_budget") {
    throw new ApiError(
      409,
      "PLANNING_CANONICAL_WORK_ORDER_NOT_READY",
      "Canonical Planning must be converted to a Work Order through the Phase 2D flow",
    );
  }
  const existing = await restClient(
    `work_orders?planned_work_item_id=eq.${plannedWorkItemId}&select=*&order=created_at.asc&limit=1`,
  ).then(({ data }) => data?.[0]);
  if (existing) return { ...existing, already_exists: true };
  await loadOne(
    `blocks?id=eq.${requireUuid(item.block_id, "block_id")}&status=eq.active&select=id&limit=1`,
    "Active Block",
  );
  const team = item.suggested_team_id
    ? await loadOne(`teams?id=eq.${item.suggested_team_id}&select=id,supervisor_employee_id,contractor_id,status&limit=1`, "Suggested team")
    : null;
  const row = {
    work_order_no: actorIsUat(actor)
      ? `WEBTEST-UAT-WO-${randomUUID().slice(0, 8).toUpperCase()}`
      : `WO-${annual?.plan_year || new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
    planned_work_item_id: plannedWorkItemId,
    estate_id: annual?.estate_id || null,
    plot_id: item.plot_id,
    block_id: item.block_id,
    ap_code: item.ap_code,
    activity_id: item.activity_id,
    scheduled_date: item.planned_start_date,
    team_id: team?.id || null,
    supervisor_employee_id: team?.supervisor_employee_id || null,
    contractor_id: team?.contractor_id || null,
    status: "draft",
    planned_quantity: item.target_quantity,
    planned_unit: item.target_unit,
    planned_total_cost: item.planned_budget || 0,
    workflow_source: "annual_plan",
    created_by_profile_id: actor.profile.id,
    note: args.note == null ? item.note : String(args.note).slice(0, 2000),
  };
  let created;
  try {
    created = await restClient("work_orders", {
      method: "POST", body: JSON.stringify([row]), headers: { Prefer: "return=representation" },
    }).then(({ data }) => data?.[0]);
  } catch (error) {
    if (error?.details?.postgresCode !== "23505") throw error;
    const winner = await restClient(
      `work_orders?planned_work_item_id=eq.${plannedWorkItemId}&select=*&order=created_at.asc&limit=1`,
    ).then(({ data }) => data?.[0]);
    if (winner) return { ...winner, already_exists: true };
    throw error;
  }
  if (!created) throw new ApiError(500, "WRITE_FAILED", "Work order could not be created");
  const members = team?.id
    ? await restClient(`team_members?team_id=eq.${team.id}&is_active=eq.true&select=employee_id,member_role`)
      .then(({ data }) => data || [])
    : [];
  const uniqueMembers = [...new Map(members.map((member) => [member.employee_id, member])).values()];
  if (uniqueMembers.length) {
    await restClient("work_order_workers?on_conflict=work_order_id,employee_id", {
      method: "POST",
      body: JSON.stringify(uniqueMembers.map((member) => ({
        work_order_id: created.id,
        employee_id: member.employee_id,
        role: member.member_role || "worker",
        status: "active",
      }))),
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    });
  }
  return { ...created, copied_worker_count: uniqueMembers.length, already_exists: false };
}

async function submitWorkOrder({ args, actor }) {
  const workOrderId = requireUuid(args.work_order_id, "work_order_id");
  const order = await one(
    `work_orders?id=eq.${workOrderId}&select=id,workflow_source,status,estate_id,plot_id,block_id&limit=1`,
    "Work order",
  );
  await authorizeWorkOrderScope(actor, order);
  if (order.workflow_source === "canonical_planning") {
    return rpc("submit_canonical_work_order", {
      p_work_order_id: workOrderId,
      p_actor_profile_id: actor.profile.id,
      p_headcount_variance_reason: optionalText(args.headcount_variance_reason, 2000),
      p_note: optionalText(args.reason, 2000),
    });
  }
  return changeWorkOrderStatus(args, actor, ["draft"], "submitted");
}

async function validateWorkOrderStart(order) {
  const missing = [];
  if (!order.block_id || !order.activity_id) missing.push("area/activity");
  if (!order.team_id && !order.contractor_id) missing.push("team/contractor");
  if (!order.supervisor_employee_id) missing.push("supervisor");
  const [workers, activity, assignments, responses] = await Promise.all([
    rest(`work_order_workers?work_order_id=eq.${order.id}&status=neq.inactive&select=id&limit=1`).then(({ data }) => data || []),
    rest(`activities?id=eq.${order.activity_id}&select=requires_material_detail,requires_machine_detail&limit=1`).then(({ data }) => data?.[0] || {}),
    rest("survey_template_assignments?required=eq.true&status=eq.active&trigger_event=eq.before_start&select=template_id,activity_id,block_id,team_id,effective_from,effective_to")
      .then(({ data }) => data || []),
    rest(`survey_responses?work_order_id=eq.${order.id}&select=template_id,status`).then(({ data }) => data || []),
  ]);
  if (!workers.length) missing.push("workers");
  if (activity.requires_material_detail) {
    const [materials, issues] = await Promise.all([
      rest(`work_order_materials?work_order_id=eq.${order.id}&select=id&limit=1`).then(({ data }) => data || []),
      rest(`goods_issues?work_order_id=eq.${order.id}&status=in.(approved,posted)&select=id&limit=1`).then(({ data }) => data || []),
    ]);
    if (!materials.length || !issues.length) missing.push("material issue");
  }
  if (activity.requires_machine_detail) {
    const machines = await rest(`work_order_machines?work_order_id=eq.${order.id}&status=neq.inactive&select=id&limit=1`)
      .then(({ data }) => data || []);
    if (!machines.length) missing.push("vehicle/machine");
  }
  const scheduledDate = order.scheduled_date || new Date().toISOString().slice(0, 10);
  const required = assignments.filter((assignment) =>
    (!assignment.activity_id || assignment.activity_id === order.activity_id)
    && (!assignment.block_id || assignment.block_id === order.block_id)
    && (!assignment.team_id || assignment.team_id === order.team_id)
    && (!assignment.effective_from || assignment.effective_from <= scheduledDate)
    && (!assignment.effective_to || assignment.effective_to >= scheduledDate));
  const completed = new Set(responses
    .filter((response) => ["submitted", "verified", "closed"].includes(response.status))
    .map((response) => response.template_id));
  if (required.some((assignment) => !completed.has(assignment.template_id))) missing.push("required before-start survey");
  if (missing.length) throw new ApiError(409, "WORK_ORDER_NOT_READY", `Work order is not ready: ${missing.join(", ")}`);
}

async function changeWorkOrderStatus(args, actor, allowedFrom, to, options = {}) {
  const workOrderId = requireUuid(args.work_order_id, "work_order_id");
  const order = await one(`work_orders?id=eq.${workOrderId}&select=*&limit=1`, "Work order");
  await authorizeWorkOrderScope(actor, order);
  if (!allowedFrom.includes(order.status)) {
    throw new ApiError(409, "INVALID_STATE", `Work order must be ${allowedFrom.join(" or ")} before it can be ${to}`);
  }
  if (options.validateStart) await validateWorkOrderStart(order);
  const now = new Date().toISOString();
  const patch = { status: to, last_action_at: now, updated_at: now };
  if (to === "approved") Object.assign(patch, { approved_by_profile_id: actor.profile.id, approved_at: now });
  if (to === "dispatched") Object.assign(patch, { dispatched_by_profile_id: actor.profile.id, dispatched_at: now });
  if (to === "closed") Object.assign(patch, { closed_by_profile_id: actor.profile.id, closed_at: now });
  const updated = await rest(`work_orders?id=eq.${workOrderId}&status=eq.${encodeURIComponent(order.status)}`, {
    method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=representation" },
  }).then(({ data }) => data?.[0]);
  if (!updated) throw new ApiError(409, "STATE_CONFLICT", "Work order state changed before this action");
  await rest("work_order_status_logs", {
    method: "POST",
    body: JSON.stringify([{
      work_order_id: workOrderId,
      from_status: order.status,
      to_status: to,
      changed_by: actor.profile.id,
      note: args.reason == null ? null : String(args.reason).slice(0, 1000),
    }]),
    headers: { Prefer: "return=minimal" },
  });
  return updated;
}

function dispatchRows(value, field, maximum) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length > maximum) throw new ApiError(400, "VALIDATION_ERROR", `${field} exceeds ${maximum} items`);
  return rows;
}

function dispatchNoteWithRange(note, startDate, endDate) {
  const clean = String(note || "")
    .replace(/\n?\[DISPATCH_START:[^\]]*\]/g, "")
    .replace(/\n?\[DISPATCH_END:[^\]]*\]/g, "")
    .trim();
  return `${clean}${clean ? "\n" : ""}[DISPATCH_START:${startDate}]\n[DISPATCH_END:${endDate}]`.slice(0, 5000);
}

async function saveDispatchAssignment({ args, actor }) {
  const workOrderId = requireUuid(args.work_order_id, "work_order_id");
  const scheduledDate = requiredDate(args.scheduled_date, "scheduled_date");
  const scheduledEndDate = requiredDate(args.scheduled_end_date || args.scheduled_date, "scheduled_end_date");
  if (scheduledEndDate < scheduledDate) {
    throw new ApiError(400, "INVALID_DATE_RANGE", "scheduled_end_date must be on or after scheduled_date");
  }
  const teamId = requireUuid(args.team_id, "team_id");
  const order = await one(
    `work_orders?id=eq.${workOrderId}&select=id,status,note,estate_id,plot_id,block_id,team_id,supervisor_employee_id&limit=1`,
    "Work order",
  );
  await authorizeWorkOrderScope(actor, order);
  if (!["approved", "dispatched"].includes(order.status)) {
    throw new ApiError(409, "INVALID_STATE", "Work order must be approved or dispatched before assignment can be saved");
  }
  const team = await one(`teams?id=eq.${teamId}&status=eq.active&select=id,supervisor_employee_id&limit=1`, "Active team");
  const workers = dispatchRows(args.workers, "workers", 200);
  const materials = dispatchRows(args.materials, "materials", 200);
  const vehicles = dispatchRows(args.vehicles, "vehicles", 50);
  if (!workers.length) throw new ApiError(400, "WORKERS_REQUIRED", "At least one worker is required before dispatch");

  const workerIds = [...new Set(workers.map((row) => requireUuid(row.employee_id, "employee_id")))];
  if (workerIds.length !== workers.length) throw new ApiError(400, "DUPLICATE_WORKER", "A worker may only appear once in an assignment");
  const materialIds = [...new Set(materials.map((row) => requireUuid(row.material_id, "material_id")))];
  if (materialIds.length !== materials.length) throw new ApiError(400, "DUPLICATE_MATERIAL", "A material may only appear once in an assignment");
  const vehicleIds = [...new Set(vehicles.map((row) => requireUuid(row.vehicle_id, "vehicle_id")))];
  if (vehicleIds.length !== vehicles.length) throw new ApiError(400, "DUPLICATE_VEHICLE", "A vehicle may only appear once in an assignment");
  vehicles.forEach((row) => {
    if (!row.driver_employee_id) throw new ApiError(400, "DRIVER_REQUIRED", "Every assigned vehicle requires a driver");
    requireUuid(row.driver_employee_id, "driver_employee_id");
  });

  const now = new Date().toISOString();
  const orderPatch = {
    scheduled_date: scheduledDate,
    team_id: teamId,
    supervisor_employee_id: team.supervisor_employee_id || order.supervisor_employee_id || null,
    status: "dispatched",
    dispatched_by_profile_id: actor.profile.id,
    dispatched_at: order.status === "approved" ? now : undefined,
    last_action_at: now,
    note: dispatchNoteWithRange(order.note, scheduledDate, scheduledEndDate),
    updated_at: now,
  };
  Object.keys(orderPatch).forEach((key) => orderPatch[key] === undefined && delete orderPatch[key]);
  const updated = await rest(`work_orders?id=eq.${workOrderId}&status=eq.${order.status}`, {
    method: "PATCH", body: JSON.stringify(orderPatch), headers: { Prefer: "return=representation" },
  }).then(({ data }) => data?.[0]);
  if (!updated) throw new ApiError(409, "STATE_CONFLICT", "Work order state changed before assignment was saved");

  await rest(`work_order_workers?work_order_id=eq.${workOrderId}&employee_id=not.in.(${workerIds.join(",")})`, {
    method: "PATCH", body: JSON.stringify({ status: "cancelled" }), headers: { Prefer: "return=minimal" },
  });
  await rest("work_order_workers?on_conflict=work_order_id,employee_id", {
    method: "POST",
    body: JSON.stringify(workers.map((row) => ({
      work_order_id: workOrderId,
      employee_id: row.employee_id,
      role: String(row.role || "worker").slice(0, 80),
      planned_hours: optionalNumber(row.planned_hours, "planned_hours") || 0,
      rate: optionalNumber(row.rate, "rate") || 0,
      status: "planned",
    }))),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });

  if (materials.length) await rest("work_order_materials?on_conflict=work_order_id,material_id", {
    method: "POST",
    body: JSON.stringify(materials.map((row) => ({
      work_order_id: workOrderId,
      material_id: row.material_id,
      planned_quantity: optionalNumber(row.planned_quantity, "planned_quantity") || 0,
      unit_id: optionalUuid(row.unit_id, "unit_id"),
      status: "planned",
      note: row.note == null ? null : String(row.note).slice(0, 1000),
      updated_at: now,
    }))),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });

  if (vehicles.length) await rest("work_order_machines?on_conflict=work_order_id,vehicle_id", {
    method: "POST",
    body: JSON.stringify(vehicles.map((row) => ({
      work_order_id: workOrderId,
      vehicle_id: row.vehicle_id,
      driver_employee_id: row.driver_employee_id,
      planned_hours: optionalNumber(row.planned_hours, "planned_hours") || 0,
      fuel_plan_liter: optionalNumber(row.fuel_plan_liter, "fuel_plan_liter") || 0,
      status: "planned",
      updated_at: now,
    }))),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });

  if (order.status !== "dispatched") await rest("work_order_status_logs", {
    method: "POST",
    body: JSON.stringify([{ work_order_id: workOrderId, from_status: order.status, to_status: "dispatched", changed_by: actor.profile.id, note: "Mobile dispatch assignment saved" }]),
    headers: { Prefer: "return=minimal" },
  });
  return { work_order: updated, workers: workers.length, materials: materials.length, vehicles: vehicles.length };
}

async function surveyResponseContext(responseId, actor) {
  const response = await one(
    `survey_responses?id=eq.${requireUuid(responseId, "response_id")}&select=id,template_id,status,work_order_id,work_result_id,response_date&limit=1`,
    "Survey response",
  );
  if (response.work_order_id) {
    const order = await one(
      `work_orders?id=eq.${response.work_order_id}&select=id,work_order_no,estate_id,plot_id,block_id&limit=1`,
      "Work order",
    );
    await authorizeWorkOrderScope(actor, order);
    return { response, order };
  }
  if (response.work_result_id) {
    const context = await workResultContext(response.work_result_id, actor);
    return { response, ...context };
  }
  throw new ApiError(409, "SURVEY_SCOPE_REQUIRED", "Survey response must be linked to a work order or work result");
}

function surveyConfig(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function selectResolvedSurveyTemplate({
  assignments = [], templates = [], activity = {}, order = {}, args = {}, responseDate,
} = {}) {
  const byId = new Map(templates.map((row) => [String(row.id), row]));
  const matches = assignments.filter((assignment) => {
    if (!byId.has(String(assignment.template_id || ""))) return false;
    if (assignment.effective_from && assignment.effective_from > responseDate) return false;
    if (assignment.effective_to && assignment.effective_to < responseDate) return false;
    if (assignment.activity_id && assignment.activity_id !== order.activity_id) return false;
    if (assignment.block_id && assignment.block_id !== order.block_id) return false;
    if (assignment.team_id && assignment.team_id !== order.team_id) return false;
    if (assignment.vehicle_id && assignment.vehicle_id !== args.vehicle_id) return false;
    if (assignment.employee_id && assignment.employee_id !== args.employee_id) return false;
    const condition = surveyConfig(assignment.condition_json);
    if (condition.activity_group_id && condition.activity_group_id !== activity.activity_group_id) return false;
    if (condition.work_type && String(condition.work_type).toLowerCase() !== String(activity.work_type || "").toLowerCase()) return false;
    return true;
  }).sort((left, right) => {
    const rank = (assignment) => {
      const condition = surveyConfig(assignment.condition_json);
      return Number(assignment.priority || 0)
        + (assignment.activity_id ? 6000 : condition.activity_group_id ? 5000 : condition.work_type ? 4000 : 2000)
        + (assignment.block_id ? 300 : 0) + (assignment.team_id ? 200 : 0)
        + (assignment.vehicle_id ? 100 : 0) + (assignment.employee_id ? 50 : 0);
    };
    return rank(right) - rank(left);
  });
  if (matches[0]) return String(matches[0].template_id);
  const exact = templates.find((row) => row.activity_id === order.activity_id);
  if (exact) return String(exact.id);
  const group = templates.find((row) => surveyConfig(row.configuration_json).activity_group_id === activity.activity_group_id);
  if (group) return String(group.id);
  const workType = templates.find((row) => String(surveyConfig(row.configuration_json).work_type || "").toLowerCase() === String(activity.work_type || "").toLowerCase());
  if (workType) return String(workType.id);
  const general = templates.find((row) => !row.activity_id && ["work_result", "work_order", "general"].includes(String(row.survey_scope || "general")));
  return general ? String(general.id) : null;
}

async function resolveSurveyTemplateForOrder(order, args, responseDate) {
  const [assignments, templates, activity] = await Promise.all([
    rest("survey_template_assignments?status=eq.active&select=template_id,activity_id,block_id,team_id,vehicle_id,employee_id,priority,effective_from,effective_to,condition_json")
      .then(({ data }) => data || []),
    rest("survey_templates?status=eq.active&select=id,activity_id,survey_scope,configuration_json")
      .then(({ data }) => data || []),
    order.activity_id
      ? one(`activities?id=eq.${order.activity_id}&select=id,activity_group_id,work_type&limit=1`, "Activity")
      : {},
  ]);
  return selectResolvedSurveyTemplate({
    assignments, templates, activity, order, args, responseDate,
  });
}

async function createSurveyResponse({ args, actor }) {
  const templateId = requireUuid(args.template_id, "template_id");
  const template = await one(
    `survey_templates?id=eq.${templateId}&select=id,version_no,survey_scope,status&limit=1`,
    "Survey template",
  );
  if (template.status !== "active") throw new ApiError(409, "INVALID_STATE", "Survey template is not active");
  const workResultId = optionalUuid(args.work_result_id, "work_result_id");
  const workOrderId = optionalUuid(args.work_order_id, "work_order_id");
  if (!workResultId && !workOrderId) {
    throw new ApiError(400, "SURVEY_SCOPE_REQUIRED", "work_result_id or work_order_id is required");
  }
  let linkedOrderId = workOrderId;
  let linkedOrder;
  if (workResultId) {
    const context = await workResultContext(workResultId, actor);
    linkedOrder = context.order;
    linkedOrderId = context.result.work_order_id;
    if (workOrderId && workOrderId !== linkedOrderId) {
      throw new ApiError(409, "SURVEY_SCOPE_MISMATCH", "work_result_id does not belong to work_order_id");
    }
  } else {
    linkedOrder = await one(`work_orders?id=eq.${workOrderId}&select=id,work_order_no,estate_id,plot_id,block_id,activity_id,team_id&limit=1`, "Work order");
    await authorizeWorkOrderScope(actor, linkedOrder);
  }
  const responseDate = dateOrToday(args.response_date);
  const resolvedTemplateId = await resolveSurveyTemplateForOrder(linkedOrder, args, responseDate);
  const canChooseManual = actorIsAdmin(actor) || actor.permissions.has("survey.template.manage");
  if (resolvedTemplateId && resolvedTemplateId !== templateId && !canChooseManual) {
    throw new ApiError(409, "SURVEY_TEMPLATE_MISMATCH", "Survey template does not match the server assignment precedence");
  }
  if (!resolvedTemplateId && !canChooseManual) {
    throw new ApiError(403, "SURVEY_MANUAL_TEMPLATE_FORBIDDEN", "Manual survey template selection requires permission");
  }
  const existingFilter = workResultId
    ? `work_result_id=eq.${workResultId}`
    : `work_order_id=eq.${linkedOrderId}&response_date=eq.${responseDate}`;
  const existing = await rest(`survey_responses?template_id=eq.${templateId}&${existingFilter}&status=in.(draft,submitted,verified,closed)&select=*&order=created_at.desc&limit=1`)
    .then(({ data }) => data?.[0]);
  if (existing) return { ...existing, already_exists: true };
  const row = {
    response_no: `SV-${Date.now()}-${randomUUID().slice(0, 8)}`,
    template_id: templateId,
    template_version_snapshot: template.version_no || 1,
    survey_scope: requireText(args.survey_scope || template.survey_scope, "survey_scope", 80),
    response_date: responseDate,
    respondent_profile_id: actor.profile.id,
    remarks: args.remarks == null ? null : String(args.remarks).slice(0, 1000),
    context_snapshot: args.context_snapshot && typeof args.context_snapshot === "object" ? args.context_snapshot : {},
  };
  Object.assign(row, { work_order_id: linkedOrderId, work_result_id: workResultId });
  for (const field of ["employee_id", "team_id", "vehicle_id", "material_id", "block_id"]) {
    row[field] = optionalUuid(args[field], field);
  }
  const { data } = await rest("survey_responses", {
    method: "POST", body: JSON.stringify([row]), headers: { Prefer: "return=representation" },
  });
  return { ...data[0], already_exists: false };
}

async function linkInboundWeightTicket({ args, actor }) {
  const allocatedWeight = Number(args.allocated_weight_kg);
  if (!Number.isFinite(allocatedWeight) || allocatedWeight <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "allocated_weight_kg must be greater than zero");
  }
  const workResultId = requireUuid(args.work_result_id, "work_result_id");
  await workResultContext(workResultId, actor);
  const transportSourceRecordId = requireUuid(args.transport_source_record_id, "transport_source_record_id");
  const source = await one(
    `v_available_inbound_weight_tickets?transport_source_record_id=eq.${transportSourceRecordId}&select=transport_source_record_id,remaining_weight_kg&limit=1`,
    "Available inbound weight ticket",
  );
  if (allocatedWeight > Number(source.remaining_weight_kg || 0)) {
    throw new ApiError(409, "WEIGHT_OVER_ALLOCATED", "Allocated weight exceeds the remaining inbound weight");
  }
  const row = {
    work_result_id: workResultId,
    transport_source_record_id: transportSourceRecordId,
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

function calculateConsumedFuel({ opening, issued, closing, fallback }, field = "consumed_fuel_liter") {
  const openingValue = optionalNumber(opening, "opening_fuel_liter");
  const issuedValue = optionalNumber(issued, "issued_fuel_liter");
  const closingValue = optionalNumber(closing, "closing_fuel_liter");
  if (openingValue != null && issuedValue != null && closingValue != null) {
    const consumed = Math.round((openingValue + issuedValue - closingValue) * 1000) / 1000;
    if (consumed < 0) {
      throw new ApiError(400, "INVALID_FUEL_CONSUMPTION", "Closing fuel cannot exceed opening fuel plus issued fuel");
    }
    return consumed;
  }
  return optionalNumber(fallback, field) || 0;
}

async function getOrCreateWorkResult({ args, actor }) {
  const workOrderId = requireUuid(args.work_order_id, "work_order_id");
  const resultDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.result_date || ""))
    ? args.result_date : new Date().toISOString().slice(0, 10);
  const order = await one(
    `work_orders?id=eq.${workOrderId}&select=id,work_order_no,estate_id,plot_id,block_id,workflow_source,status&limit=1`,
    "Work order",
  );
  await authorizeWorkOrderScope(actor, order);
  if (order.workflow_source === "canonical_planning") {
    return rpc("get_or_create_canonical_work_result", {
      p_work_order_id: workOrderId,
      p_result_date: resultDate,
      p_profile_id: actor.profile.id,
    });
  }
  return rpc("get_or_create_work_result", {
    p_work_order_id: workOrderId,
    p_result_date: resultDate,
    p_profile_id: actor.profile.id,
  });
}

function canonicalWorkResultWorkerPayload(worker) {
  const resultWorkerId = optionalUuid(worker.work_result_worker_id, "work_result_worker_id");
  const assignmentId = optionalUuid(
    worker.work_order_worker_assignment_id || worker.assignment_id,
    "work_order_worker_assignment_id",
  );
  if (!resultWorkerId && !assignmentId) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "work_result_worker_id or work_order_worker_assignment_id is required",
    );
  }
  return {
    work_result_worker_id: resultWorkerId,
    work_order_worker_assignment_id: assignmentId,
    attendance_status: String(worker.attendance_status || "present").slice(0, 80),
    actual_hours: optionalNumber(worker.actual_hours, "actual_hours") || 0,
    actual_quantity: optionalNumber(worker.actual_quantity, "actual_quantity") || 0,
    actual_unit: worker.actual_unit == null ? null : String(worker.actual_unit).slice(0, 80),
    actual_area_rai: optionalNumber(worker.actual_area_rai, "actual_area_rai") || 0,
    actual_tree_count: optionalNumber(worker.actual_tree_count, "actual_tree_count") || 0,
    individual_quality_pct: optionalNumber(worker.individual_quality_pct, "individual_quality_pct"),
    individual_completion_pct: optionalNumber(worker.individual_completion_pct, "individual_completion_pct"),
    quantity_allocation_method: String(worker.quantity_allocation_method || "individual").slice(0, 80),
    is_quantity_estimated: worker.is_quantity_estimated === true,
    note: worker.note == null ? null : String(worker.note).slice(0, 1000),
  };
}

function canonicalWorkResultVehiclePayload(vehicle) {
  return {
    work_order_resource_requirement_id: requireUuid(
      vehicle.work_order_resource_requirement_id || vehicle.resource_requirement_id,
      "work_order_resource_requirement_id",
    ),
    vehicle_id: requireUuid(vehicle.vehicle_id, "vehicle_id"),
    start_at: vehicle.start_at || null,
    end_at: vehicle.end_at || null,
    start_odometer: optionalNumber(vehicle.start_odometer, "start_odometer"),
    end_odometer: optionalNumber(vehicle.end_odometer, "end_odometer"),
    start_hour_meter: optionalNumber(vehicle.start_hour_meter, "start_hour_meter"),
    end_hour_meter: optionalNumber(vehicle.end_hour_meter, "end_hour_meter"),
    distance_km: optionalNumber(vehicle.distance_km, "distance_km"),
    engine_hours: optionalNumber(vehicle.engine_hours, "engine_hours"),
    working_hours: optionalNumber(vehicle.working_hours, "working_hours") || 0,
    idle_hours: optionalNumber(vehicle.idle_hours, "idle_hours") || 0,
    actual_area_rai: optionalNumber(vehicle.actual_area_rai, "actual_area_rai") || 0,
    actual_tree_count: optionalNumber(vehicle.actual_tree_count, "actual_tree_count") || 0,
    actual_quantity: optionalNumber(vehicle.actual_quantity, "actual_quantity") || 0,
    actual_weight_ton: optionalNumber(vehicle.actual_weight_ton, "actual_weight_ton") || 0,
    actual_unit: vehicle.actual_unit == null ? null : String(vehicle.actual_unit).slice(0, 80),
    allocation_basis_value: optionalNumber(vehicle.allocation_basis_value, "allocation_basis_value") || 0,
    actual_fuel_liter: optionalNumber(vehicle.actual_fuel_liter ?? vehicle.allocated_fuel_liter, "actual_fuel_liter") || 0,
    opening_fuel_liter: optionalNumber(vehicle.opening_fuel_liter, "opening_fuel_liter"),
    issued_fuel_liter: optionalNumber(vehicle.issued_fuel_liter, "issued_fuel_liter") || 0,
    closing_fuel_liter: optionalNumber(vehicle.closing_fuel_liter, "closing_fuel_liter"),
    note: vehicle.note == null ? null : String(vehicle.note).slice(0, 1000),
  };
}

async function saveCanonicalWorkResultDraft(args, actor) {
  const workers = Array.isArray(args.workers) ? args.workers.map(canonicalWorkResultWorkerPayload) : [];
  const vehicles = Array.isArray(args.vehicles) ? args.vehicles.map(canonicalWorkResultVehiclePayload) : [];
  return rpc("save_canonical_work_result_draft_phase2f", {
    p_result_id: requireUuid(args.result_id, "result_id"),
    p_actor_profile_id: actor.profile.id,
    p_header: {
      actual_start_at: args.actual_start_at || null,
      actual_end_at: args.actual_end_at || null,
      actual_quantity: optionalNumber(args.actual_quantity, "actual_quantity"),
      actual_unit: args.actual_unit == null ? null : String(args.actual_unit).slice(0, 80),
      actual_area_rai: optionalNumber(args.actual_area_rai, "actual_area_rai"),
      actual_tree_count: optionalNumber(args.actual_tree_count, "actual_tree_count"),
      working_minutes: optionalNumber(args.working_minutes, "working_minutes"),
      stoppage_minutes: optionalNumber(args.stoppage_minutes, "stoppage_minutes"),
      quality_score: optionalNumber(args.quality_score, "quality_score"),
      completion_pct: optionalNumber(args.completion_pct, "completion_pct"),
      rework_quantity: optionalNumber(args.rework_quantity, "rework_quantity"),
      weather_condition: args.weather_condition == null ? null : String(args.weather_condition).slice(0, 120),
      terrain_condition: args.terrain_condition == null ? null : String(args.terrain_condition).slice(0, 120),
      note: args.note == null ? null : String(args.note).slice(0, 2000),
    },
    p_workers: workers,
    p_vehicles: vehicles,
  });
}

async function saveWorkResultDraft({ args, actor }) {
  const resultId = requireUuid(args.result_id, "result_id");
  const { result, order } = await workResultContext(resultId, actor);
  if (order.workflow_source === "canonical_planning") {
    return saveCanonicalWorkResultDraft(args, actor);
  }
  if (result.result_status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft work results can be edited");
  const workers = Array.isArray(args.workers) ? args.workers : [];
  const materials = Array.isArray(args.materials) ? args.materials : [];
  const vehicles = Array.isArray(args.vehicles) ? args.vehicles : [];
  if (workers.length > 200 || materials.length > 200 || vehicles.length > 50) {
    throw new ApiError(400, "VALIDATION_ERROR", "Draft detail exceeds the maximum row count");
  }
  const actualStartAt = args.actual_start_at == null || args.actual_start_at === ""
    ? null : requireTimestamp(args.actual_start_at, "actual_start_at");
  const actualEndAt = args.actual_end_at == null || args.actual_end_at === ""
    ? null : requireTimestamp(args.actual_end_at, "actual_end_at");
  if ((actualStartAt && !actualEndAt) || (!actualStartAt && actualEndAt)) {
    throw new ApiError(400, "VALIDATION_ERROR", "actual_start_at and actual_end_at must be provided together");
  }
  if (actualStartAt && actualEndAt && new Date(actualEndAt) <= new Date(actualStartAt)) {
    throw new ApiError(400, "INVALID_RESULT_TIME", "actual_end_at must be later than actual_start_at");
  }
  const seenVehicleIds = new Set();
  const validatedVehicles = [];
  for (const vehicle of vehicles) {
    const vehicleId = requireUuid(vehicle.vehicle_id, "vehicle_id");
    if (seenVehicleIds.has(vehicleId)) {
      throw new ApiError(400, "DUPLICATE_VEHICLE", "A vehicle can appear only once in a work result");
    }
    seenVehicleIds.add(vehicleId);
    const startAt = vehicle.start_at == null || vehicle.start_at === ""
      ? null : requireTimestamp(vehicle.start_at, "vehicle.start_at");
    const endAt = vehicle.end_at == null || vehicle.end_at === ""
      ? null : requireTimestamp(vehicle.end_at, "vehicle.end_at");
    if ((startAt && !endAt) || (!startAt && endAt)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Vehicle start_at and end_at must be provided together");
    }
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      throw new ApiError(400, "INVALID_VEHICLE_TIME", "Vehicle end_at must be later than start_at");
    }
    const startOdometer = optionalNumber(vehicle.start_odometer, "start_odometer");
    const endOdometer = optionalNumber(vehicle.end_odometer, "end_odometer");
    const startHourMeter = optionalNumber(vehicle.start_hour_meter, "start_hour_meter");
    const endHourMeter = optionalNumber(vehicle.end_hour_meter, "end_hour_meter");
    if (startOdometer != null && endOdometer != null && endOdometer < startOdometer) {
      throw new ApiError(400, "INVALID_ODOMETER", "Vehicle end_odometer cannot be lower than start_odometer");
    }
    if (startHourMeter != null && endHourMeter != null && endHourMeter < startHourMeter) {
      throw new ApiError(400, "INVALID_HOUR_METER", "Vehicle end_hour_meter cannot be lower than start_hour_meter");
    }
    await one(
      `work_order_machines?work_order_id=eq.${result.work_order_id}&vehicle_id=eq.${vehicleId}&select=id&limit=1`,
      "Assigned work-order vehicle",
    );
    const existing = await rest(
      `work_result_vehicle_usage?work_result_id=eq.${resultId}&vehicle_id=eq.${vehicleId}&select=id&limit=1`,
    ).then(({ data }) => data?.[0]);
    if (startAt && endAt) {
      const otherUsage = await rest(
        `work_result_vehicle_usage?vehicle_id=eq.${vehicleId}&select=id,start_at,end_at`,
      ).then(({ data }) => data || []);
      if (otherUsage.some((usage) => usage.id !== existing?.id && usage.start_at && usage.end_at
        && new Date(startAt) < new Date(usage.end_at) && new Date(endAt) > new Date(usage.start_at))) {
        throw new ApiError(409, "VEHICLE_TIME_OVERLAP", "Vehicle usage overlaps another work result");
      }
    }
    validatedVehicles.push({
      vehicle, vehicleId, existing, startAt, endAt,
      startOdometer, endOdometer, startHourMeter, endHourMeter,
    });
  }
  const resultPatch = {
    actual_start_at: actualStartAt,
    actual_end_at: actualEndAt,
    actual_quantity: optionalNumber(args.actual_quantity, "actual_quantity"),
    actual_unit: args.actual_unit == null ? null : String(args.actual_unit).slice(0, 80),
    actual_area_rai: optionalNumber(args.actual_area_rai, "actual_area_rai"),
    actual_tree_count: optionalNumber(args.actual_tree_count, "actual_tree_count"),
    total_labor_hours: optionalNumber(args.total_labor_hours, "total_labor_hours"),
    working_minutes: optionalNumber(args.working_minutes, "working_minutes"),
    stoppage_minutes: optionalNumber(args.stoppage_minutes, "stoppage_minutes"),
    quality_score: optionalNumber(args.quality_score, "quality_score"),
    completion_pct: optionalNumber(args.completion_pct, "completion_pct"),
    rework_quantity: optionalNumber(args.rework_quantity, "rework_quantity"),
    weather_condition: args.weather_condition == null ? null : String(args.weather_condition).slice(0, 120),
    terrain_condition: args.terrain_condition == null ? null : String(args.terrain_condition).slice(0, 120),
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

  for (const validated of validatedVehicles) {
    const {
      vehicle, vehicleId, existing, startAt, endAt,
      startOdometer, endOdometer, startHourMeter, endHourMeter,
    } = validated;
    const distanceKm = startOdometer != null && endOdometer != null
      ? Math.round((endOdometer - startOdometer) * 1000) / 1000 : null;
    const engineHours = startHourMeter != null && endHourMeter != null
      ? Math.round((endHourMeter - startHourMeter) * 1000) / 1000 : null;
    const workingHours = optionalNumber(vehicle.working_hours, "vehicle.working_hours")
      ?? (startAt && endAt ? Math.round(((new Date(endAt) - new Date(startAt)) / 3_600_000) * 1000) / 1000 : null);
    const consumedFuelLiter = calculateConsumedFuel({
      opening: vehicle.opening_fuel_liter,
      issued: vehicle.issued_fuel_liter,
      closing: vehicle.closing_fuel_liter,
      fallback: vehicle.allocated_fuel_liter,
    });
    const row = {
      work_result_id: resultId,
      work_order_id: result.work_order_id,
      vehicle_id: vehicleId,
      driver_employee_id: optionalUuid(vehicle.driver_employee_id, "driver_employee_id"),
      start_at: startAt,
      end_at: endAt,
      start_odometer: startOdometer,
      end_odometer: endOdometer,
      start_hour_meter: startHourMeter,
      end_hour_meter: endHourMeter,
      distance_km: distanceKm,
      engine_hours: engineHours,
      working_hours: workingHours,
      idle_hours: optionalNumber(vehicle.idle_hours, "vehicle.idle_hours") || 0,
      actual_area_rai: optionalNumber(vehicle.actual_area_rai, "vehicle.actual_area_rai"),
      actual_tree_count: optionalNumber(vehicle.actual_tree_count, "vehicle.actual_tree_count"),
      actual_quantity: optionalNumber(vehicle.actual_quantity, "vehicle.actual_quantity"),
      actual_unit: String(vehicle.actual_unit || args.actual_unit || "").slice(0, 80) || null,
      allocation_basis_value: optionalNumber(vehicle.allocation_basis_value, "vehicle.allocation_basis_value"),
      allocated_fuel_liter: consumedFuelLiter,
      allocation_method: String(vehicle.allocation_method || "manual_work_result").slice(0, 80),
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

function requireTimestamp(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid timestamp`);
  return date.toISOString();
}

async function refreshVehicleFuelRequisition({ args, actor }) {
  const vehicleId = requireUuid(args.vehicle_id, "vehicle_id");
  const workOrderId = requireUuid(args.work_order_id, "work_order_id");
  const order = await one(
    `work_orders?id=eq.${workOrderId}&select=id,work_order_no,estate_id,plot_id,block_id&limit=1`,
    "Work order",
  );
  await authorizeWorkOrderScope(actor, order);
  await one(
    `work_order_machines?work_order_id=eq.${workOrderId}&vehicle_id=eq.${vehicleId}&select=id&limit=1`,
    "Assigned work-order vehicle",
  );
  return rpc("refresh_vehicle_fuel_requisition", {
    p_vehicle_id: vehicleId,
    p_work_order_id: workOrderId,
  });
}

async function issueFuel({ args, actor }) {
  const issuedLiter = optionalNumber(args.issued_liter, "issued_liter", { minimum: Number.EPSILON });
  if (issuedLiter == null) throw new ApiError(400, "VALIDATION_ERROR", "issued_liter is required");
  const requisitionId = requireUuid(args.fuel_requisition_id, "fuel_requisition_id");
  const requisition = await one(
    `fuel_requisitions?id=eq.${requisitionId}&select=id,work_order_id,vehicle_id,requested_liter,status&limit=1`,
    "Fuel requisition",
  );
  if (!requisition.work_order_id || !requisition.vehicle_id) {
    throw new ApiError(409, "FUEL_REQUISITION_INCOMPLETE", "Fuel requisition must be linked to a work order and vehicle");
  }
  const order = await one(
    `work_orders?id=eq.${requisition.work_order_id}&select=id,work_order_no,estate_id,plot_id,block_id&limit=1`,
    "Work order",
  );
  await authorizeWorkOrderScope(actor, order);
  if (["cancelled", "rejected", "closed"].includes(requisition.status)) {
    throw new ApiError(409, "INVALID_STATE", "Fuel cannot be issued from this requisition state");
  }
  const previousIssues = await rest(
    `fuel_issues?fuel_requisition_id=eq.${requisitionId}&select=issued_liter,status`,
  ).then(({ data }) => data || []);
  const issuedTotal = previousIssues
    .filter((issue) => !["cancelled", "void"].includes(issue.status))
    .reduce((sum, issue) => sum + Number(issue.issued_liter || 0), 0);
  if (issuedTotal + issuedLiter > Number(requisition.requested_liter || 0) + 0.000001) {
    throw new ApiError(409, "FUEL_OVER_ISSUE", "Fuel issue exceeds the requisition quantity");
  }
  const row = {
    fuel_requisition_id: requisitionId,
    issue_no: `FUEL-${Date.now()}-${randomUUID().slice(0, 8)}`,
    tank_id: requireUuid(args.tank_id, "tank_id"),
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

async function workResultContext(resultId, actor = null) {
  const result = await one(
    `work_results?id=eq.${resultId}&select=id,work_order_id,result_date,result_status,actual_quantity&limit=1`,
    "Work result",
  );
  if (!result.work_order_id) throw new ApiError(409, "RESULT_INCOMPLETE", "Work result is not linked to a work order");
  const order = await one(
    `work_orders?id=eq.${result.work_order_id}&select=id,estate_id,plot_id,activity_id,block_id,team_id,status,workflow_source,survey_required&limit=1`,
    "Work order",
  );
  if (actor) await authorizeWorkOrderScope(actor, order);
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

async function validateCanonicalResolvedSurveys(context, acceptedStatuses) {
  const [assignments, responses, workers, vehicles] = await Promise.all([
    rest("survey_template_assignments?required=eq.true&status=eq.active&select=template_id,trigger_event")
      .then(({ data }) => data || []),
    rest(`survey_responses?work_result_id=eq.${context.result.id}&select=template_id,status,pass_status`)
      .then(({ data }) => data || []),
    rest(`work_result_workers?work_result_id=eq.${context.result.id}&select=employee_id`)
      .then(({ data }) => data || []),
    rest(`work_result_vehicle_usage?work_result_id=eq.${context.result.id}&select=vehicle_id`)
      .then(({ data }) => data || []),
  ]);
  const requiredTemplateIds = new Set(assignments
    .filter((row) => ["after_result", "before_close"].includes(row.trigger_event))
    .map((row) => String(row.template_id)));
  const resolutionContexts = [
    {},
    ...workers.filter((row) => row.employee_id).map((row) => ({ employee_id: row.employee_id })),
    ...vehicles.filter((row) => row.vehicle_id).map((row) => ({ vehicle_id: row.vehicle_id })),
  ];
  const resolved = new Set();
  for (const resolverArgs of resolutionContexts) {
    const templateId = await resolveSurveyTemplateForOrder(
      context.order,
      resolverArgs,
      context.result.result_date,
    );
    if (templateId && (requiredTemplateIds.has(String(templateId)) || context.order.survey_required)) {
      resolved.add(String(templateId));
    }
  }
  if (context.order.survey_required && !resolved.size) {
    const templateId = await resolveSurveyTemplateForOrder(context.order, {}, context.result.result_date);
    if (templateId) resolved.add(String(templateId));
  }
  if (!resolved.size) return;
  const complete = new Set(responses
    .filter((row) => acceptedStatuses.has(row.status) && row.pass_status !== "failed")
    .map((row) => String(row.template_id)));
  const missing = [...resolved].filter((templateId) => !complete.has(templateId));
  if (missing.length) {
    throw new ApiError(409, "WORK_RESULT_SURVEY_NOT_VERIFIED", "Required Survey must be verified and pass before Work Result verification");
  }
}

async function submitWorkResult({ args, actor }) {
  const resultId = requireUuid(args.result_id, "result_id");
  const context = await workResultContext(resultId, actor);
  if (context.result.result_status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft results can be submitted");
  if (context.order.workflow_source === "canonical_planning") {
    return rpc("submit_canonical_work_result_phase2e", {
      p_result_id: resultId,
      p_actor_profile_id: actor.profile.id,
    });
  }
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
  return changeWorkResultStatus(args, actor, "draft", "submitted", context);
}

async function changeWorkResultStatus(args, actor, from, to, context = null) {
  const resultId = requireUuid(args.result_id, "result_id");
  const authorizedContext = context || await workResultContext(resultId, actor);
  if (authorizedContext.order.workflow_source === "canonical_planning") {
    if (to === "verified" || to === "closed") {
      await validateCanonicalResolvedSurveys(
        authorizedContext,
        new Set(["verified", "closed"]),
      );
    }
    const canonicalRpc = to === "verified"
      ? "verify_canonical_work_result_phase2e"
      : to === "closed" ? "close_canonical_work_result_phase2e" : null;
    if (!canonicalRpc) throw new ApiError(409, "INVALID_STATE", "Unsupported canonical Work Result transition");
    return rpc(canonicalRpc, {
      p_result_id: resultId,
      p_actor_profile_id: actor.profile.id,
    });
  }
  if (to === "closed") {
    await validateRequiredSurveys(authorizedContext, new Set(["verified", "closed"]));
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
  const { response } = await surveyResponseContext(responseId, actor);
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

function surveyConditionValue(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function surveyQuestionVisible(question, answerByKey) {
  const condition = surveyConditionValue(question.conditional_json);
  if (!Object.keys(condition).length) return true;
  const sourceKey = condition.question_code || condition.depends_on || condition.question_id || condition.source_question;
  if (!sourceKey) return true;
  const source = answerByKey.get(String(sourceKey));
  const current = source?.answer_boolean ?? source?.answer_number ?? source?.answer_date ?? source?.answer_text
    ?? source?.answer_json?.values ?? source?.answer_json;
  const expected = condition.value ?? condition.equals ?? condition.eq;
  const operator = String(condition.operator || (condition.not_equals !== undefined ? "not_equals" : "equals")).toLowerCase();
  if (operator === "in") return (Array.isArray(condition.values) ? condition.values : [expected]).map(String).includes(String(current));
  if (operator === "not_equals" || operator === "neq") return String(current) !== String(condition.not_equals ?? expected);
  if (operator === "contains") return Array.isArray(current) ? current.map(String).includes(String(expected)) : String(current || "").includes(String(expected || ""));
  return String(current) === String(expected);
}

function surveyAnswerComplete(answer) {
  return Boolean(answer && (answer.is_not_applicable
    || answer.answer_text != null || answer.answer_number != null || answer.answer_boolean != null
    || answer.answer_date != null || Object.keys(answer.answer_json || {}).length));
}

async function submitSurveyResponse({ args, actor }) {
  const responseId = requireUuid(args.response_id, "response_id");
  const { response } = await surveyResponseContext(responseId, actor);
  if (response.status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft surveys can be submitted");
  const [questions, answered, template, responseAttachments] = await Promise.all([
    rest(`survey_questions?template_id=eq.${response.template_id}&status=eq.active&select=id,question_code,question_text,required,answer_type,conditional_json,attachment_required,failure_severity`).then(({ data }) => data || []),
    rest(`survey_answers?response_id=eq.${responseId}&select=id,question_id,is_not_applicable,answer_text,answer_number,answer_boolean,answer_date,answer_json,is_compliant`).then(({ data }) => data || []),
    one(`survey_templates?id=eq.${response.template_id}&select=id,requires_attachment_on_failure&limit=1`, "Survey template"),
    rest(`survey_response_attachments?response_id=eq.${responseId}&select=attachment_id`).then(({ data }) => data || []),
  ]);
  const questionById = new Map(questions.map((question) => [String(question.id), question]));
  const answerByKey = new Map();
  answered.forEach((answer) => {
    answerByKey.set(String(answer.question_id), answer);
    const code = questionById.get(String(answer.question_id))?.question_code;
    if (code) answerByKey.set(String(code), answer);
  });
  const visible = questions.filter((question) => surveyQuestionVisible(question, answerByKey));
  const hasResponseEvidence = responseAttachments.length > 0;
  const missing = visible.filter((question) => question.required && !surveyAnswerComplete(answerByKey.get(String(question.id)))
    && !(["photo", "image", "file", "signature"].includes(String(question.answer_type)) && hasResponseEvidence));
  if (missing.length) throw new ApiError(409, "SURVEY_INCOMPLETE", `${missing.length} required answer(s) are missing`);
  const failureAnswers = answered.filter((answer) => answer.is_compliant === false
    && (template.requires_attachment_on_failure || questionById.get(String(answer.question_id))?.attachment_required));
  if (failureAnswers.length && !hasResponseEvidence) {
    const answerIds = failureAnswers.map((answer) => answer.id);
    const answerEvidence = await rest(`survey_answer_attachments?answer_id=in.(${answerIds.join(",")})&select=answer_id`).then(({ data }) => data || []);
    const covered = new Set(answerEvidence.map((row) => String(row.answer_id)));
    if (failureAnswers.some((answer) => !covered.has(String(answer.id)))) {
      throw new ApiError(409, "SURVEY_EVIDENCE_REQUIRED", "Evidence is required for failed survey answers");
    }
  }
  await ensureSurveyFailureFindings(responseId, failureAnswers, questionById, actor);
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
  await surveyResponseContext(responseId, actor);
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
  const responseId = requireUuid(args.response_id, "response_id");
  await surveyResponseContext(responseId, actor);
  const row = {
    finding_no: `FND-${Date.now()}-${randomUUID().slice(0, 8)}`,
    response_id: responseId,
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
  const finding = await one(`survey_findings?id=eq.${findingId}&select=id,response_id,status&limit=1`, "Survey finding");
  await surveyResponseContext(finding.response_id, actor);
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

async function ensureSurveyFailureFindings(responseId, failureAnswers, questionById, actor) {
  if (!failureAnswers.length) return { created: 0 };
  const existing = await rest(`survey_findings?response_id=eq.${responseId}&select=id,answer_id`)
    .then(({ data }) => data || []);
  const existingAnswerIds = new Set(existing.map((row) => String(row.answer_id || "")).filter(Boolean));
  const dueDays = { low: 14, medium: 7, high: 3, critical: 1 };
  const rows = failureAnswers.filter((answer) => !existingAnswerIds.has(String(answer.id))).map((answer) => {
    const question = questionById.get(String(answer.question_id)) || {};
    const requestedSeverity = String(question.failure_severity || "medium").toLowerCase();
    const severity = ["low", "medium", "high", "critical"].includes(requestedSeverity)
      ? requestedSeverity : "medium";
    const due = new Date(Date.now() + dueDays[severity] * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
      finding_no: `FND-AUTO-${Date.now()}-${randomUUID().slice(0, 8)}`,
      response_id: responseId,
      answer_id: answer.id,
      finding_code: question.question_code ? `AUTO-${String(question.question_code).slice(0, 100)}` : "AUTO-NONCOMPLIANCE",
      severity,
      finding_type: "non_compliance",
      description: `Survey answer did not comply: ${String(question.question_text || question.question_code || answer.question_id).slice(0, 4500)}`,
      corrective_action: "Review the evidence, assign corrective work, and record the resolution.",
      owner_profile_id: actor.profile.id,
      due_date: due,
      status: "open",
    };
  });
  if (!rows.length) return { created: 0 };
  const { data } = await rest("survey_findings", {
    method: "POST",
    body: JSON.stringify(rows),
    headers: { Prefer: "return=representation" },
  });
  return { created: data?.length || 0 };
}

const SURVEY_EVIDENCE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);
const SURVEY_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

async function storageRequest(path, options = {}) {
  const { url, serviceKey } = config();
  const response = await fetch(`${url}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status >= 500 ? 502 : response.status, "STORAGE_ERROR", "Private evidence storage request failed");
  return data;
}

function surveyEvidenceInput(args = {}) {
  const fileName = requireText(args.file_name, "file_name", 180).replace(/[\\/\u0000-\u001f]/g, "-");
  const contentType = String(args.content_type || "").toLowerCase();
  const extension = SURVEY_EVIDENCE_TYPES.get(contentType);
  if (!extension) throw new ApiError(400, "UNSUPPORTED_FILE_TYPE", "Evidence must be JPG, PNG, WEBP, or PDF");
  const size = Number(args.file_size);
  if (!Number.isInteger(size) || size <= 0 || size > SURVEY_EVIDENCE_MAX_BYTES) {
    throw new ApiError(400, "INVALID_FILE_SIZE", "Evidence must be larger than 0 bytes and no more than 10 MB");
  }
  return { fileName, contentType, extension, size };
}

async function createSurveyEvidenceUpload({ args, actor }) {
  const responseId = requireUuid(args.response_id, "response_id");
  const { response } = await surveyResponseContext(responseId, actor);
  if (response.status !== "draft") throw new ApiError(409, "INVALID_STATE", "Evidence may only be added to a draft survey");
  const file = surveyEvidenceInput(args);
  const answerId = optionalUuid(args.answer_id, "answer_id");
  if (answerId) await one(`survey_answers?id=eq.${answerId}&response_id=eq.${responseId}&select=id&limit=1`, "Survey answer");
  const month = new Date().toISOString().slice(0, 7);
  const objectPath = `${responseId}/${month}/${randomUUID()}.${file.extension}`;
  const signed = await storageRequest(`object/upload/sign/survey-evidence/${objectPath}`, {
    method: "POST",
    body: JSON.stringify({ upsert: false }),
  });
  const signedPath = signed?.url || signed?.signedUrl || signed?.signedURL;
  if (!signedPath || !signed?.token) throw new ApiError(502, "STORAGE_ERROR", "Signed evidence upload could not be created");
  const { url } = config();
  const uploadUrl = /^https?:\/\//i.test(signedPath)
    ? signedPath
    : `${url}/storage/v1${String(signedPath).startsWith("/") ? "" : "/"}${signedPath}`;
  return {
    bucket: "survey-evidence",
    object_path: objectPath,
    upload_url: uploadUrl,
    token: signed.token,
    content_type: file.contentType,
    file_name: file.fileName,
    file_size: file.size,
  };
}

async function finalizeSurveyEvidence({ args, actor }) {
  const responseId = requireUuid(args.response_id, "response_id");
  const { response } = await surveyResponseContext(responseId, actor);
  if (response.status !== "draft") throw new ApiError(409, "INVALID_STATE", "Evidence may only be linked to a draft survey");
  const file = surveyEvidenceInput(args);
  const objectPath = requireText(args.object_path, "object_path", 500);
  if (!objectPath.startsWith(`${responseId}/`) || objectPath.includes("..") || objectPath.startsWith("/")) {
    throw new ApiError(400, "INVALID_STORAGE_PATH", "Evidence path does not belong to this survey response");
  }
  const info = await storageRequest(`object/info/survey-evidence/${objectPath.split("/").map(encodeURIComponent).join("/")}`, { method: "GET" });
  const storedSize = Number(info?.metadata?.size ?? info?.size);
  const storedType = String(info?.metadata?.mimetype || info?.metadata?.contentType || info?.mimetype || "").toLowerCase();
  if (!Number.isFinite(storedSize) || storedSize !== file.size || storedSize > SURVEY_EVIDENCE_MAX_BYTES) {
    throw new ApiError(409, "EVIDENCE_SIZE_MISMATCH", "Uploaded evidence size does not match the approved upload");
  }
  if (storedType && storedType !== file.contentType) {
    throw new ApiError(409, "EVIDENCE_TYPE_MISMATCH", "Uploaded evidence type does not match the approved upload");
  }
  const storagePath = `survey-evidence/${objectPath}`;
  let attachment = await rest(`attachments?storage_path=eq.${encodeURIComponent(storagePath)}&select=*&limit=1`)
    .then(({ data }) => data?.[0]);
  if (!attachment) {
    attachment = await rest("attachments", {
      method: "POST",
      body: JSON.stringify([{
        module_name: "farm_survey",
        record_id: responseId,
        file_name: file.fileName,
        file_type: file.contentType,
        storage_path: storagePath,
        uploaded_by: actor.profile.id,
        entity_table: "survey_responses",
        entity_id: responseId,
        status: "active",
      }]),
      headers: { Prefer: "return=representation" },
    }).then(({ data }) => data?.[0]);
  }
  if (!attachment) throw new ApiError(502, "STORAGE_METADATA_FAILED", "Evidence metadata could not be recorded");
  await rest("survey_response_attachments?on_conflict=response_id,attachment_id", {
    method: "POST",
    body: JSON.stringify([{
      response_id: responseId,
      attachment_id: attachment.id,
      attachment_category: String(args.attachment_category || "evidence").slice(0, 80),
      caption: args.caption == null ? null : String(args.caption).slice(0, 500),
    }]),
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
  });
  const answerId = optionalUuid(args.answer_id, "answer_id");
  if (answerId) {
    await one(`survey_answers?id=eq.${answerId}&response_id=eq.${responseId}&select=id&limit=1`, "Survey answer");
    await rest("survey_answer_attachments?on_conflict=answer_id,attachment_id", {
      method: "POST",
      body: JSON.stringify([{
        answer_id: answerId,
        attachment_id: attachment.id,
        attachment_category: String(args.attachment_category || "evidence").slice(0, 80),
        caption: args.caption == null ? null : String(args.caption).slice(0, 500),
      }]),
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    });
  }
  return { attachment_id: attachment.id, response_id: responseId, storage_path: storagePath };
}

async function notificationContext(notificationId, actor, { allowManage = false } = {}) {
  const id = requireUuid(notificationId, "notification_id");
  const notification = await one(
    `app_notifications?id=eq.${id}&select=id,recipient_profile_id,recipient_employee_id,status,read_at,acknowledged_at,snoozed_until,closed_at&limit=1`,
    "Notification",
  );
  const ownsProfile = notification.recipient_profile_id === actor.profile.id;
  const ownsEmployee = notification.recipient_employee_id
    && notification.recipient_employee_id === actor.profile.employee_id;
  const canManage = allowManage && (actorIsAdmin(actor) || actor.permissions.has("notification.manage"));
  if (!ownsProfile && !ownsEmployee && !canManage) {
    throw new ApiError(403, "SCOPE_FORBIDDEN", "Notification is assigned to another recipient");
  }
  return notification;
}

async function markNotificationRead({ args, actor }) {
  const notification = await notificationContext(args.notification_id, actor);
  if (notification.closed_at) return notification;
  const now = new Date().toISOString();
  const { data } = await rest(`app_notifications?id=eq.${notification.id}`, {
    method: "PATCH",
    body: JSON.stringify({ read_at: notification.read_at || now, updated_at: now }),
    headers: { Prefer: "return=representation" },
  });
  return data?.[0] || notification;
}

async function markAllNotificationsRead({ actor }) {
  const now = new Date().toISOString();
  const { data } = await rest(
    `app_notifications?recipient_profile_id=eq.${actor.profile.id}&read_at=is.null&closed_at=is.null`,
    {
      method: "PATCH",
      body: JSON.stringify({ read_at: now, updated_at: now }),
      headers: { Prefer: "return=representation" },
    },
  );
  return { updated: data?.length || 0, read_at: now };
}

async function acknowledgeNotification({ args, actor }) {
  const notification = await notificationContext(args.notification_id, actor);
  if (notification.closed_at || ["closed", "cancelled"].includes(notification.status)) {
    throw new ApiError(409, "INVALID_STATE", "Closed notifications cannot be acknowledged");
  }
  const now = new Date().toISOString();
  const { data } = await rest(`app_notifications?id=eq.${notification.id}&closed_at=is.null`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "acknowledged",
      read_at: notification.read_at || now,
      acknowledged_at: notification.acknowledged_at || now,
      snoozed_until: null,
      updated_at: now,
    }),
    headers: { Prefer: "return=representation" },
  });
  if (!data?.length) throw new ApiError(409, "STATE_CONFLICT", "Notification state changed before acknowledgement");
  return data[0];
}

async function snoozeNotification({ args, actor }) {
  const notification = await notificationContext(args.notification_id, actor);
  if (notification.closed_at || ["closed", "cancelled"].includes(notification.status)) {
    throw new ApiError(409, "INVALID_STATE", "Closed notifications cannot be snoozed");
  }
  const snoozedUntil = requireTimestamp(args.snoozed_until, "snoozed_until");
  const now = new Date();
  const until = new Date(snoozedUntil);
  if (until <= now || until > new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) {
    throw new ApiError(400, "INVALID_SNOOZE", "snoozed_until must be in the next 30 days");
  }
  const { data } = await rest(`app_notifications?id=eq.${notification.id}&closed_at=is.null`, {
    method: "PATCH",
    body: JSON.stringify({ status: "snoozed", snoozed_until: snoozedUntil, updated_at: now.toISOString() }),
    headers: { Prefer: "return=representation" },
  });
  if (!data?.length) throw new ApiError(409, "STATE_CONFLICT", "Notification state changed before snooze");
  return data[0];
}

async function closeNotification({ args, actor }) {
  const notification = await notificationContext(args.notification_id, actor, { allowManage: true });
  if (notification.closed_at) return notification;
  const now = new Date().toISOString();
  const { data } = await rest(`app_notifications?id=eq.${notification.id}&closed_at=is.null`, {
    method: "PATCH",
    body: JSON.stringify({ status: "closed", closed_at: now, updated_at: now }),
    headers: { Prefer: "return=representation" },
  });
  return data?.[0] || notification;
}

async function saveNotificationPreference({ args, actor }) {
  const notificationType = requireText(args.notification_type, "notification_type", 120);
  const row = {
    profile_id: actor.profile.id,
    notification_type: notificationType,
    in_app_enabled: args.in_app_enabled !== false,
    push_enabled: args.push_enabled === true,
    quiet_hours_start: args.quiet_hours_start || null,
    quiet_hours_end: args.quiet_hours_end || null,
    timezone_name: "Asia/Bangkok",
    updated_at: new Date().toISOString(),
  };
  const { data } = await rest("app_notification_preferences?on_conflict=profile_id,notification_type", {
    method: "POST",
    body: JSON.stringify([row]),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return data?.[0] || row;
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
    throw new ApiError(
      409,
      "IDEMPOTENCY_PAYLOAD_MISMATCH",
      "The idempotency key was already used for a different request payload",
    );
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
      authorize(actor, {
        permissions: definition.permissions || [definition.permission],
      });
    }
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
    await enforceActionScope(actor, action, args);
    await enforceUatMutation(actor, action, args);
    if (definition.confirmation && body.confirmed !== true) {
      throw new ApiError(409, "CONFIRMATION_REQUIRED", "This action requires confirmed=true");
    }
    idempotencyKey = requireText(req.headers?.["idempotency-key"] || body.idempotency_key, "idempotency_key", 200);
    const hash = requestHash(action, args, actor);
    const claim = await claimIdempotency(idempotencyKey, action, hash, actor);
    if (!claim.claimed) return json(res, 200, claim.response);

    const params = definition.params(args, actor, { idempotencyKey });
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
    if (idempotencyKey
        && error?.code !== "ACTION_IN_PROGRESS"
        && error?.code !== "IDEMPOTENCY_PAYLOAD_MISMATCH") {
      await finishIdempotency(idempotencyKey, null, {
        code: error?.code || "INTERNAL_ERROR", message: error?.message || "Unexpected error",
      }).catch(() => {});
    }
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  ACTIONS, INVENTORY_UAT_ACTIONS, PLANNING_UAT_ACTIONS, PLANNING_UAT_PLAN_PREFIX,
  UAT_MUTATION_ACTIONS, enforceActionScope, enforcePlanningUatMutation, enforceUatMutation,
  createWorkOrderFromPlanItem, submitWorkOrder,
  requireInventoryUatIssue, requirePlanningUatPlan, requirePlanningUatPlanName,
  requireUatWorkOrder, requireWebTestCode, requestHash,
  activityMaterialStandardInput, budgetBlockMaterialActionParams, calculateConsumedFuel,
  canonicalWorkResultVehiclePayload, canonicalWorkResultWorkerPayload,
  ensureSurveyFailureFindings, getOrCreateWorkResult,
  nextActivityMaterialStandardVersion, notificationContext, resolveSurveyTemplateForOrder,
  selectResolvedSurveyTemplate,
  standardPeriodsOverlap,
  surveyAnswerComplete, surveyQuestionVisible, validateCanonicalResolvedSurveys,
};
