const FARM_TABLES = new Set([
  "profiles",
  "areas",
  "people",
  "person_housing_assignments",
  "activity_wage_codes",
  "activity_material_rates",
  "inventory_master",
  "inventory_documents",
  "inventory_document_lines",
  "work_plans",
  "plan_materials",
  "work_order_resources",
  "payroll_lines",
  "payroll_rules",
  "access_scopes",
  "approval_logs",
  "master_versions",
  "estates",
  "zones",
  "plot_groups",
  "plots",
  "blocks",
  "departments",
  "housing_units",
  "employees",
  "employee_housing_assignments",
  "housing_utility_charges",
  "contractors",
  "teams",
  "team_members",
  "team_activity_skills",
  "activity_groups",
  "wage_codes",
  "activities",
  "activity_wage_code_mappings",
  "material_categories",
  "units",
  "unit_conversions",
  "materials",
  "material_lots",
  "activity_material_usage_rates",
  "survey_templates",
  "vehicles",
  "annual_work_plans",
  "planned_work_items",
  "planned_work_materials",
  "work_orders",
  "work_order_workers",
  "work_order_materials",
  "work_order_machines",
  "work_order_approvals",
  "work_order_qr_codes",
  "work_order_locations",
  "work_order_status_logs",
  "work_attendance",
  "work_results",
  "warehouses",
  "bin_locations",
  "stock_transactions",
  "stock_balances",
  "budget_years",
  "budget_activity_rates",
  "budget_rate_materials",
  "budget_rate_roles",
  "budget_rate_import_rows",
  "budget_rates",
  "contractor_period_estimates",
  "cost_entries",
  "payroll_periods",
  "payroll_period_lines",
  "payroll_rates",
  "deduction_types",
  "allowance_types",
  "permissions",
  "role_permissions",
  "user_access_scopes",
  "master_record_versions",
  "audit_logs",
  "system_settings",
  "attachments",
  "report_exports",
]);

const REQUIRED_TABLES = new Set([
  "estates",
  "zones",
  "plot_groups",
  "plots",
  "blocks",
  "activity_groups",
  "activities",
  "materials",
  "vehicles",
  "budget_years",
  "budget_activity_rates",
  "work_orders",
]);

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || "https://xhtwmzlorceebsemqkww.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  if (String(key).startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is a publishable key. Use the Supabase service_role/secret key for server writes.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.error || text || `Supabase ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function validTables(value) {
  const requested = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const tables = requested.length ? requested : Array.from(FARM_TABLES);
  return tables.filter((table) => FARM_TABLES.has(table));
}

function validTable(value) {
  const table = String(value || "").trim();
  return FARM_TABLES.has(table) ? table : "";
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function newUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function cleanText(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function farmRecordCategory(table) {
  return `farm_table:${table}`;
}

function fallbackLocalId(table, row) {
  const candidates = [
    row.id,
    row[`${table.replace(/s$/, "")}_code`],
    row.estate_code,
    row.zone_code,
    row.plot_code,
    row.block_code,
    row.employee_code,
    row.contractor_code,
    row.team_code,
    row.activity_code,
    row.group_code,
    row.material_code,
    row.vehicle_code,
    row.work_order_no,
  ].filter(Boolean);
  return cleanText(`${table}:${candidates[0] || Date.now()}`, 180);
}

function fromFallbackRecord(row) {
  return {
    ...(row.payload || {}),
    id: row.payload?.id || row.local_id,
    databaseId: row.id,
    _source: "farm_master_records",
    _farmFallback: true,
    updated_at: row.updated_at,
  };
}

async function loadFallbackRows(table) {
  const category = encodeURIComponent(farmRecordCategory(table));
  const rows = await supabaseFetch(`est_master_records?category=eq.${category}&target_table=eq.${encodeURIComponent(table)}&order=updated_at.desc&limit=50000`);
  return Array.isArray(rows) ? rows.map(fromFallbackRecord) : [];
}

async function saveFallbackRow(table, row, reason = "") {
  const localId = fallbackLocalId(table, row);
  const payload = {
    local_id: localId,
    category: farmRecordCategory(table),
    target_table: table,
    payload: { ...row, id: row.id || localId },
    note: reason || null,
    updated_at: new Date().toISOString(),
  };
  const saved = await supabaseFetch("est_master_records?on_conflict=local_id", {
    method: "POST",
    body: JSON.stringify([payload]),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return fromFallbackRecord(saved?.[0] || payload);
}

const META_KEYS = new Set([
  "moduleId",
  "tableId",
  "readonly",
  "_source",
  "_overrideOf",
  "_deleted",
  "_farmFallback",
  "updatedAt",
  "databaseId",
]);

const GENERATED_KEYS = new Set([
  "tree_per_rai",
  "hourly_wage_rate",
  "total_utility_amount",
  "estimated_amount",
  "amount",
  "variance_quantity",
  "net_amount",
  "created_at",
  "updated_at",
]);

const TEXT_ID_KEYS_BY_TABLE = {
  budget_years: new Set(["id"]),
  budget_activity_rates: new Set(["id", "budget_year_id"]),
  budget_rate_materials: new Set(["id", "budget_rate_id"]),
  budget_rate_roles: new Set(["id", "budget_rate_id"]),
  budget_rate_import_rows: new Set(["id", "budget_year_id"]),
};

const UNIQUE_KEYS = {
  estates: "estate_code",
  plot_groups: "group_code",
  plots: "plot_code",
  employees: "employee_code",
  contractors: "contractor_code",
  teams: "team_code",
  activity_groups: "group_code",
  wage_codes: "wage_code",
  activities: "activity_code",
  material_categories: "category_code",
  units: "unit_code",
  materials: "material_code",
  vehicles: "vehicle_code",
  budget_years: "fiscal_year",
  budget_activity_rates: "rate_code",
  budget_rate_materials: "id",
  budget_rate_roles: "id",
  budget_rate_import_rows: "id",
  work_orders: "work_order_no",
  permissions: "permission_key",
  areas: "area_code",
  people: "person_code",
  inventory_master: "item_code",
  inventory_documents: "document_no",
  work_plans: "plan_code",
  payroll_rules: "rule_code",
};

function sanitizeDbRow(table, row) {
  const out = {};
  const textIdKeys = TEXT_ID_KEYS_BY_TABLE[table] || new Set();
  for (const [key, value] of Object.entries(row || {})) {
    if (META_KEYS.has(key) || GENERATED_KEYS.has(key)) continue;
    if (key === "id" && !isUuid(value) && !textIdKeys.has(key)) continue;
    if (key.endsWith("_id") || key === "id") {
      if (value && (isUuid(value) || textIdKeys.has(key))) out[key] = value;
      continue;
    }
    if (value === "") continue;
    if (value === "true") out[key] = true;
    else if (value === "false") out[key] = false;
    else out[key] = value;
  }
  return out;
}

async function upsertRealTableRow(table, row) {
  const dbRow = sanitizeDbRow(table, row);
  if (!dbRow.id) dbRow.id = newUuid();
  if (!Object.keys(dbRow).length) throw new Error("No writable columns");
  const conflictKey = dbRow.id ? "id" : (UNIQUE_KEYS[table] && dbRow[UNIQUE_KEYS[table]] ? UNIQUE_KEYS[table] : "");
  const path = conflictKey
    ? `${table}?on_conflict=${encodeURIComponent(conflictKey)}`
    : table;
  const saved = await supabaseFetch(path, {
    method: "POST",
    body: JSON.stringify([dbRow]),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return saved?.[0] || dbRow;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    if (req.method === "POST") {
      const body = await readBody(req);
      const table = validTable(body.table);
      if (!table) return json(res, 400, { ok: false, error: "Invalid farm table" });
      const row = body.row && typeof body.row === "object" ? body.row : null;
      if (!row) return json(res, 400, { ok: false, error: "No row" });
      try {
        const saved = await upsertRealTableRow(table, row);
        return json(res, 200, { ok: true, table, mode: "supabase-real-table", row: saved });
      } catch (err) {
        const fallback = await saveFallbackRow(table, row, err.message);
        return json(res, 200, {
          ok: true,
          table,
          mode: "farm-master-fallback",
          warning: err.message,
          row: fallback,
        });
      }
    }

    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

    if (requestUrl.searchParams.get("healthcheck") === "1") {
      return json(res, 200, {
        ok: true,
        route: "farm-tables",
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      });
    }

    const tables = validTables(requestUrl.searchParams.get("tables"));
    const limit = Math.min(Math.max(Number(requestUrl.searchParams.get("limit") || 50000), 1), 50000);
    const result = {};
    const errors = {};
    const warnings = {};

    for (const table of tables) {
      let realRows = [];
      let realError = null;
      let fallbackRows = [];
      try {
        realRows = await supabaseFetch(`${table}?select=*&limit=${limit}`);
      } catch (err) {
        realError = err;
      }
      try {
        fallbackRows = await loadFallbackRows(table);
      } catch {}
      const map = new Map();
      for (const row of Array.isArray(realRows) ? realRows : []) map.set(row.id || JSON.stringify(row), row);
      for (const row of fallbackRows) map.set(row.id || row.databaseId || JSON.stringify(row), row);
      result[table] = [...map.values()];
      if (realError && !result[table].length) {
        if (REQUIRED_TABLES.has(table)) errors[table] = realError.message;
        else warnings[table] = realError.message;
      }
    }

    return json(res, 200, {
      ok: Object.keys(errors).length === 0,
      tables: result,
      errors,
      warnings,
      source: {
        mode: "supabase-real-tables",
        tableCount: tables.length,
        rowCount: Object.values(result).reduce((sum, rows) => sum + rows.length, 0),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
};
