const {
  ApiError,
  actorCanAccessBlock,
  actorHasPermission,
  authenticate,
  authorize,
  errorResponse,
  json,
  rest,
} = require("../lib/server/farm-api");

const MAX_ROWS = 5000;
const VIEW_NAMES = Object.freeze({
  results: "v_phase2h_performance_result",
  workers: "v_phase2h_performance_worker",
  materials: "v_phase2h_performance_material",
  resources: "v_phase2h_performance_resource",
  fuel: "v_phase2h_performance_fuel",
  payroll: "v_phase2h_performance_payroll_reconciliation",
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, precision = 2) {
  const scale = 10 ** precision;
  return Math.round((number(value) + Number.EPSILON) * scale) / scale;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + number(row[field]), 0);
}

function average(rows, field) {
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  return values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 2) : null;
}

function uniqueBy(rows, field) {
  return [...new Map(rows.map((row) => [row[field], row])).values()];
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function selected(url, key) {
  return String(url.searchParams.get(key) || "").trim();
}

function filterResults(rows, url) {
  const filters = {
    from: selected(url, "from"),
    to: selected(url, "to"),
    estate: selected(url, "estate"),
    block: selected(url, "block"),
    plantingYear: selected(url, "planting_year"),
    rspo: selected(url, "rspo"),
    activityGroup: selected(url, "activity_group"),
    activity: selected(url, "activity"),
    team: selected(url, "team"),
    contractor: selected(url, "contractor"),
    status: selected(url, "status"),
  };
  return rows.filter((row) => {
    if (filters.from && String(row.result_date || "") < filters.from) return false;
    if (filters.to && String(row.result_date || "") > filters.to) return false;
    if (filters.estate && row.estate_id !== filters.estate) return false;
    if (filters.block && row.block_id !== filters.block) return false;
    if (filters.plantingYear && String(row.planting_year || "") !== filters.plantingYear) return false;
    if (filters.rspo && normalized(row.rspo_status) !== normalized(filters.rspo)) return false;
    if (filters.activityGroup && row.activity_group_id !== filters.activityGroup) return false;
    if (filters.activity && row.activity_id !== filters.activity) return false;
    if (filters.status && normalized(row.data_completeness_status) !== normalized(filters.status)) return false;
    return true;
  });
}

function groupRows(rows, keys, metricFields) {
  const groups = new Map();
  for (const row of rows) {
    const key = keys.map((field) => String(row[field] ?? "")).join("\u001f");
    if (!groups.has(key)) {
      groups.set(key, {
        ...Object.fromEntries(keys.map((field) => [field, row[field] ?? null])),
        result_count: 0,
        work_order_count: new Set(),
        ...Object.fromEntries(metricFields.map((field) => [field, 0])),
      });
    }
    const group = groups.get(key);
    group.result_count += 1;
    group.work_order_count.add(row.work_order_id);
    metricFields.forEach((field) => { group[field] += number(row[field]); });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    work_order_count: group.work_order_count.size,
    ...Object.fromEntries(metricFields.map((field) => [field, round(group[field])])),
  }));
}

function groupExecutiveRows(rows) {
  const groups = groupRows(rows, ["activity_group_id", "activity_group_name"], ["actual_operational_cost"]);
  return groups.map((group) => {
    const matchingRows = rows.filter((row) =>
      String(row.activity_group_id ?? "") === String(group.activity_group_id ?? "")
      && String(row.activity_group_name ?? "") === String(group.activity_group_name ?? "")
    );
    return {
      ...group,
      planned_operational_cost: round(sum(uniqueBy(matchingRows, "work_order_id"), "planned_operational_cost")),
    };
  });
}

function summarize(results, workers, materials, resources, fuel, payroll) {
  const workOrders = uniqueBy(results, "work_order_id");
  const verified = results.filter((row) => row.is_verified_actual === true);
  const verifiedWorkers = workers.filter((row) => row.is_verified_actual === true);
  const verifiedMaterials = materials.filter((row) => row.is_verified_actual === true);
  const verifiedResources = resources.filter((row) => row.is_verified_actual === true);
  const verifiedFuel = fuel.filter((row) => row.is_verified_actual === true);
  const plannedCost = sum(workOrders, "planned_operational_cost");
  const actualCost = sum(verified, "actual_operational_cost");
  const costVariance = actualCost - plannedCost;
  const quantityByUnit = groupRows(verified, ["actual_unit_basis"], ["planned_quantity", "actual_verified_quantity"])
    .filter((row) => row.actual_unit_basis)
    .map((row) => ({
      ...row,
      variance_quantity: round(row.actual_verified_quantity - row.planned_quantity, 4),
      completion_pct: row.planned_quantity > 0 ? round(row.actual_verified_quantity / row.planned_quantity * 100, 2) : null,
    }));
  const laborHours = sum(verifiedWorkers, "actual_hours");
  const verifiedQuantityUnits = new Set(verified.map((row) => row.actual_unit_basis).filter(Boolean));
  const laborProductivity = laborHours > 0 && verifiedQuantityUnits.size === 1
    ? round(sum(verified, "actual_verified_quantity") / laborHours, 4)
    : null;
  const workerDays = new Set(verifiedWorkers
    .filter((row) => number(row.operational_earning_amount) > 0)
    .map((row) => `${row.employee_id || row.contractor_id}|${row.result_date}`)).size;
  const resultIds = new Set(results.map((row) => row.work_result_id));
  const payrollRows = payroll.filter((row) => !row.work_result_id || resultIds.has(row.work_result_id));
  return {
    kpis: {
      plan_completion_pct: average(verified.filter((row) => row.calculated_completion_pct != null), "calculated_completion_pct"),
      planned_operational_cost: round(plannedCost),
      actual_operational_cost: round(actualCost),
      cost_variance: round(costVariance),
      cost_variance_pct: plannedCost > 0 ? round(costVariance / plannedCost * 100, 2) : null,
      labor_productivity: laborProductivity,
      material_variance_pct: average(verifiedMaterials, "variance_pct"),
      survey_quality_pct: average(verified, "survey_score_pct"),
    },
    counts: {
      work_orders: workOrders.length,
      results: results.length,
      verified_results: verified.length,
      draft_or_submitted_results: results.length - verified.length,
      employees: new Set(verifiedWorkers.map((row) => row.employee_id).filter(Boolean)).size,
      contractors: new Set(verifiedWorkers.map((row) => row.contractor_id).filter(Boolean)).size,
      worker_days: workerDays,
    },
    quantity_by_unit: quantityByUnit,
    cost_components: {
      planned_employee_labor: round(sum(workOrders, "planned_employee_labor_cost")),
      planned_contractor: round(sum(workOrders, "planned_contractor_cost")),
      planned_material: round(sum(workOrders, "planned_material_cost")),
      planned_equipment: round(sum(workOrders, "planned_equipment_cost")),
      planned_machine_vehicle: round(sum(workOrders, "planned_machine_vehicle_cost")),
      planned_fuel: round(sum(workOrders, "planned_fuel_cost")),
      actual_employee_labor: round(sum(verified, "employee_operational_labor_cost")),
      actual_contractor: round(sum(verified, "contractor_operational_cost")),
      actual_material_consumed: round(sum(verifiedMaterials, "actual_material_consumption_cost")),
      actual_equipment: round(sum(verified, "actual_equipment_cost")),
      actual_machine_vehicle: round(sum(verified, "actual_machine_vehicle_cost")),
      actual_fuel: round(sum(verifiedFuel, "actual_fuel_cost")),
    },
    operational: {
      labor_hours: round(laborHours, 4),
      material_issued: round(sum(verifiedMaterials, "issued_quantity"), 4),
      material_used: round(sum(verifiedMaterials, "used_quantity"), 4),
      material_returned: round(sum(verifiedMaterials, "returned_quantity"), 4),
      material_outstanding: round(sum(verifiedMaterials, "outstanding_quantity"), 4),
      fuel_issued_liters: round(sum(verifiedFuel, "issued_fuel_liter"), 4),
      fuel_consumed_liters: round(sum(verifiedFuel, "actual_fuel_liters"), 4),
      machine_hours: round(sum(verifiedResources, "actual_hours"), 4),
      distance_km: round(sum(verifiedResources, "actual_km"), 4),
    },
    payroll_reconciliation: payrollRows,
  };
}

function dimensions(rows, workers) {
  const values = (field, labelField) => uniqueBy(rows.filter((row) => row[field]), field)
    .map((row) => ({ value: row[field], label: row[labelField] || row[field] }))
    .sort((left, right) => String(left.label).localeCompare(String(right.label), "th"));
  return {
    estates: values("estate_id", "estate_name"),
    blocks: values("block_id", "block_code"),
    planting_years: [...new Set(rows.map((row) => row.planting_year).filter(Boolean))].sort(),
    rspo: [...new Set(rows.map((row) => row.rspo_status).filter(Boolean))].sort(),
    activity_groups: values("activity_group_id", "activity_group_name"),
    activities: values("activity_id", "activity_name"),
    teams: uniqueBy(workers.filter((row) => row.team_id), "team_id")
      .map((row) => ({ value: row.team_id, label: row.team_name || row.team_code })),
    contractors: uniqueBy(workers.filter((row) => row.contractor_id), "contractor_id")
      .map((row) => ({ value: row.contractor_id, label: row.contractor_name || row.contractor_code })),
    employees: uniqueBy(workers.filter((row) => row.employee_id), "employee_id")
      .map((row) => ({ value: row.employee_id, label: row.full_name || row.employee_code })),
  };
}

async function readView(name) {
  const { data } = await rest(`${name}?select=*&limit=${MAX_ROWS}`);
  return Array.isArray(data) ? data : [];
}

async function handleGet(req, res, actor, url) {
  authorize(actor, { permissions: ["performance.view"] });
  const [allResults, allWorkers, allMaterials, allResources, allFuel, blocks] = await Promise.all([
    readView(VIEW_NAMES.results), readView(VIEW_NAMES.workers), readView(VIEW_NAMES.materials),
    readView(VIEW_NAMES.resources), readView(VIEW_NAMES.fuel),
    rest("blocks?select=id,estate_id,zone_id,plot_id,status&limit=5000").then(({ data }) => data || []),
  ]);
  const allowedBlocks = new Set(blocks.filter((block) => actorCanAccessBlock(actor, block)).map((block) => block.id));
  const scopedResults = allResults.filter((row) => allowedBlocks.has(row.block_id));
  let results = filterResults(scopedResults, url);
  const employeeId = selected(url, "employee");
  const contractorId = selected(url, "contractor");
  const teamId = selected(url, "team");
  if (employeeId || contractorId || teamId) {
    const personResultIds = new Set(allWorkers.filter((row) =>
      (!employeeId || row.employee_id === employeeId)
      && (!contractorId || row.contractor_id === contractorId)
      && (!teamId || row.team_id === teamId)
    ).map((row) => row.work_result_id));
    results = results.filter((row) => personResultIds.has(row.work_result_id));
  }
  const resultIds = new Set(results.map((row) => row.work_result_id));
  const keepResult = (row) => resultIds.has(row.work_result_id);
  const workers = allWorkers.filter(keepResult);
  const materials = allMaterials.filter(keepResult);
  const resources = allResources.filter(keepResult);
  const fuel = allFuel.filter(keepResult);
  const payrollAllowed = actorHasPermission(actor, "payroll.view") || actorHasPermission(actor, "payroll.calculate");
  const payroll = payrollAllowed ? (await readView(VIEW_NAMES.payroll))
    .filter((row) => !row.estate_id || results.some((result) => result.estate_id === row.estate_id)) : [];
  const summary = summarize(results, workers, materials, resources, fuel, payroll);
  return json(res, 200, {
    ok: true,
    readOnly: true,
    generatedAt: new Date().toISOString(),
    payrollRestricted: !payrollAllowed,
    filters: Object.fromEntries(url.searchParams),
    dimensions: dimensions(scopedResults, allWorkers.filter((row) => scopedResults.some((result) => result.work_result_id === row.work_result_id))),
    summary,
    views: {
      executive: groupExecutiveRows(results),
      plan_vs_actual: summary.quantity_by_unit,
      cost_analysis: summary.cost_components,
      labor_productivity: groupRows(workers.filter((row) => row.is_verified_actual), ["team_id", "team_name", "actual_unit_basis"], ["actual_hours", "actual_quantity", "operational_earning_amount"]),
      material_efficiency: materials,
      vehicle_fuel_efficiency: fuel,
      survey_quality: results.map((row) => ({
        work_result_id: row.work_result_id, work_order_no: row.work_order_no,
        survey_required: row.survey_required, survey_completed_count: row.survey_completed_count,
        survey_score_pct: row.survey_score_pct, finding_count: row.finding_count,
        unresolved_finding_count: row.unresolved_finding_count, rework_required: row.rework_required,
      })),
      employee_team: workers,
    },
    drilldown: { results, workers, materials, resources, fuel },
  });
}

async function handler(req, res) {
  const allowedMethods = "GET, OPTIONS";
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", allowedMethods);
    return json(res, 200, { ok: true });
  }
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", allowedMethods);
      throw new ApiError(405, "READ_ONLY_ANALYTICS", "Performance analytics is read-only");
    }
    const actor = await authenticate(req);
    return await handleGet(req, res, actor, new URL(req.url, "http://localhost"));
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  VIEW_NAMES,
  dimensions,
  filterResults,
  groupExecutiveRows,
  groupRows,
  summarize,
};
