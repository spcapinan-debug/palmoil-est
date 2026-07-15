const FARM_TABLES = new Set([
  "profiles",
  "areas",
  "people",
  "worker_documents",
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
  "attendance_records",
  "leave_requests",
  "training_records",
  "performance_reviews",
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
  "sku_conversions",
  "materials",
  "material_lots",
  "activity_material_usage_rates",
  "survey_templates",
  "survey_questions",
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
  "budget_rate_blocks",
  "budget_rate_materials",
  "budget_rate_roles",
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

async function supabaseFetchAll(path, limit = 50000) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const take = Math.min(pageSize, limit - rows.length);
    const separator = path.includes("?") ? "&" : "?";
    const page = await supabaseFetch(`${path}${separator}limit=${take}&offset=${offset}`);
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < take) break;
  }
  return rows;
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

function stableHashHex8(input = "", seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  const text = String(input || "empty");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function stableUuid(value = "") {
  const raw = String(value || "empty").trim() || "empty";
  if (isUuid(raw)) return raw.toLowerCase();
  const a = stableHashHex8(`a:${raw}`, 0x811c9dc5);
  const b = stableHashHex8(`b:${raw}`, 0x9e3779b9);
  const c = stableHashHex8(`c:${raw}`, 0x85ebca6b);
  const d = stableHashHex8(`d:${raw}`, 0xc2b2ae35);
  const hex = `${a}${b}${c}${d}`.padEnd(32, "0").slice(0, 32);
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function stableChildUuid(prefix, ...parts) {
  return stableUuid([prefix, ...parts].map((part) => String(part ?? "")).join(":"));
}

function normalizeWorkResultUuid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isUuid(raw)) return raw.toLowerCase();
  const legacy = raw.match(/^result-(.+)-(\d{4}-\d{2}-\d{2})$/);
  if (legacy) return stableChildUuid("work_results", legacy[1], legacy[2]);
  return stableUuid(`work_results:${raw}`);
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
    row.category_code,
    row.unit_code,
    row.material_code,
    row.item_code,
    row.vehicle_code,
    row.document_no,
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
  const rows = await supabaseFetchAll(`est_master_records?category=eq.${category}&target_table=eq.${encodeURIComponent(table)}&order=updated_at.desc`, 50000);
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

async function saveFallbackRows(table, rows, reason = "") {
  const payloadRows = rows.map((row) => {
    const localId = fallbackLocalId(table, row);
    return {
      local_id: localId,
      category: farmRecordCategory(table),
      target_table: table,
      payload: { ...row, id: row.id || localId },
      note: reason || null,
      updated_at: new Date().toISOString(),
    };
  });
  const savedRows = [];
  for (const part of chunkRows(payloadRows, 300)) {
    const saved = await supabaseFetch("est_master_records?on_conflict=local_id", {
      method: "POST",
      body: JSON.stringify(part),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    savedRows.push(...(Array.isArray(saved) ? saved.map(fromFallbackRecord) : []));
  }
  return savedRows;
}

async function deleteFallbackRow(table, id) {
  const ids = [`${table}:${id}`, id].filter(Boolean);
  let deleted = 0;
  for (const localId of ids) {
    const rows = await supabaseFetch(`est_master_records?local_id=eq.${encodeURIComponent(localId)}&category=eq.${encodeURIComponent(farmRecordCategory(table))}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    }).catch(() => []);
    deleted += Array.isArray(rows) ? rows.length : 0;
  }
  if (isUuid(id)) {
    const rows = await supabaseFetch(`est_master_records?id=eq.${encodeURIComponent(id)}&category=eq.${encodeURIComponent(farmRecordCategory(table))}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    }).catch(() => []);
    deleted += Array.isArray(rows) ? rows.length : 0;
  }
  const payloadRows = await supabaseFetch(`est_master_records?category=eq.${encodeURIComponent(farmRecordCategory(table))}&target_table=eq.${encodeURIComponent(table)}&payload->>id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  }).catch(() => []);
  deleted += Array.isArray(payloadRows) ? payloadRows.length : 0;
  return deleted;
}

async function deleteFallbackTableRows(table) {
  const rows = await supabaseFetch(`est_master_records?category=eq.${encodeURIComponent(farmRecordCategory(table))}&target_table=eq.${encodeURIComponent(table)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(rows) ? rows.length : 0;
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
  budget_rate_blocks: new Set(["id", "budget_rate_id", "block_id"]),
  budget_rate_materials: new Set(["id", "budget_rate_id"]),
  budget_rate_roles: new Set(["id", "budget_rate_id"]),
  survey_templates: new Set(["id", "activity_id"]),
  survey_questions: new Set(["id", "template_id"]),
  work_orders: new Set(["planned_work_item_id", "plot_id", "block_id", "plot_group_id", "activity_id", "survey_template_id", "team_id", "rescheduled_by_manager_id", "approved_by", "budget_rate_id"]),
  work_order_workers: new Set(["id", "work_order_id", "employee_id"]),
  work_order_materials: new Set(["id", "work_order_id", "material_id", "unit_id"]),
  work_order_machines: new Set(["id", "work_order_id", "vehicle_id", "driver_employee_id", "fuel_material_id"]),
  work_order_qr_codes: new Set(["id", "work_order_id"]),
  work_order_locations: new Set(["id", "work_order_id"]),
  work_order_status_logs: new Set(["id", "work_order_id", "entity_id"]),
  work_results: new Set(["work_order_id", "supervisor_id"]),
  work_attendance: new Set(["id", "work_order_id", "employee_id"]),
  attachments: new Set(["id", "entity_id", "survey_template_id"]),
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
  budget_rate_blocks: "id",
  budget_rate_materials: "id",
  budget_rate_roles: "id",
  work_orders: "work_order_no",
  permissions: "permission_key",
  areas: "area_code",
  people: "person_code",
  worker_documents: "document_no",
  inventory_master: "item_code",
  inventory_documents: "document_no",
  work_plans: "plan_code",
  payroll_rules: "rule_code",
  survey_templates: "template_code",
  survey_questions: "question_code",
};

function sanitizeDbRow(table, row) {
  const out = {};
  const textIdKeys = TEXT_ID_KEYS_BY_TABLE[table] || new Set();
  for (const [key, value] of Object.entries(row || {})) {
    if (META_KEYS.has(key) || GENERATED_KEYS.has(key)) continue;
    if (table === "work_results" && key === "id" && value && !isUuid(value)) {
      out.id = normalizeWorkResultUuid(value);
      continue;
    }
    if (key === "work_result_id" && value && !isUuid(value)) {
      out.work_result_id = normalizeWorkResultUuid(value);
      continue;
    }
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

function missingColumnFromError(error) {
  const message = String(error?.message || error || "");
  return message.match(/Could not find the '([^']+)' column/i)?.[1]
    || message.match(/column \"([^\"]+)\" of relation/i)?.[1]
    || "";
}

async function upsertRealTableRow(table, row) {
  const dbRow = sanitizeDbRow(table, row);
  const hadWritableId = Boolean(dbRow.id);
  if (!dbRow.id) dbRow.id = newUuid();
  if (!Object.keys(dbRow).length) throw new Error("No writable columns");
  const uniqueKey = UNIQUE_KEYS[table];
  const conflictKey = hadWritableId ? "id" : (uniqueKey && dbRow[uniqueKey] ? uniqueKey : "id");
  const path = conflictKey
    ? `${table}?on_conflict=${encodeURIComponent(conflictKey)}`
    : table;
  let writableRow = { ...dbRow };
  let saved = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      saved = await supabaseFetch(path, {
        method: "POST",
        body: JSON.stringify([writableRow]),
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      });
      break;
    } catch (error) {
      const missing = missingColumnFromError(error);
      if (!missing || !Object.prototype.hasOwnProperty.call(writableRow, missing)) throw error;
      delete writableRow[missing];
      if (!Object.keys(writableRow).length) throw new Error("No writable columns after schema cleanup");
    }
  }
  return saved?.[0] || dbRow;
}

function chunkRows(rows, size = 300) {
  const out = [];
  for (let index = 0; index < rows.length; index += size) out.push(rows.slice(index, index + size));
  return out;
}

async function upsertRealTableRows(table, rows) {
  const uniqueKey = UNIQUE_KEYS[table];
  const dbRows = rows.map((row) => {
    const dbRow = sanitizeDbRow(table, row);
    if (!dbRow.id) dbRow.id = newUuid();
    return dbRow;
  }).filter((row) => Object.keys(row).length);
  if (!dbRows.length) throw new Error("No writable columns");
  const conflictKey = uniqueKey && dbRows.every((row) => row[uniqueKey]) ? uniqueKey : "id";
  const allKeys = [...new Set(dbRows.flatMap((row) => Object.keys(row)))];
  const normalizedRows = dbRows.map((row) => Object.fromEntries(allKeys.map((key) => [key, Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null])));
  const savedRows = [];
  for (const part of chunkRows(normalizedRows)) {
    let writablePart = part.map((row) => ({ ...row }));
    let saved = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        saved = await supabaseFetch(`${table}?on_conflict=${encodeURIComponent(conflictKey)}`, {
          method: "POST",
          body: JSON.stringify(writablePart),
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        });
        break;
      } catch (error) {
        const missing = missingColumnFromError(error);
        if (!missing || !writablePart.some((row) => Object.prototype.hasOwnProperty.call(row, missing))) throw error;
        writablePart = writablePart.map((row) => {
          const next = { ...row };
          delete next[missing];
          return next;
        });
        if (!writablePart.some((row) => Object.keys(row).length)) throw new Error("No writable columns after schema cleanup");
      }
    }
    savedRows.push(...(Array.isArray(saved) ? saved : []));
  }
  return savedRows;
}

async function upsertFarmTableRows(table, rows, reason = "") {
  return { rows: await upsertRealTableRows(table, rows), warnings: [] };
}

async function deleteRealTableRow(table, id) {
  if (!id) throw new Error("No id");
  const rows = await supabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(rows) ? rows.length : 0;
}

function supabaseInFilter(values = []) {
  return `in.(${values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(",")})`;
}

async function deleteRealTableRows(table) {
  const rows = await supabaseFetchAll(`${table}?select=id`, 50000);
  const ids = rows.map((row) => row.id).filter(Boolean);
  let deleted = 0;
  for (const part of chunkRows(ids, 300)) {
    const result = await supabaseFetch(`${table}?id=${supabaseInFilter(part)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    deleted += Array.isArray(result) ? result.length : 0;
  }
  return deleted;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    if (req.method === "POST") {
      const body = await readBody(req);
      const table = validTable(body.table);
      if (!table) return json(res, 400, { ok: false, error: "Invalid farm table" });
      if (Array.isArray(body.rows)) {
        const rows = body.rows.filter((row) => row && typeof row === "object");
        if (!rows.length) return json(res, 400, { ok: false, error: "No rows" });
        const result = await upsertFarmTableRows(table, rows, body.reason || "");
        return json(res, 200, {
          ok: true,
          table,
          mode: result.warnings.length ? "mixed" : "supabase-real-table",
          count: result.rows.length,
          warningCount: result.warnings.length,
          warnings: [...new Set(result.warnings)].slice(0, 20),
          rows: result.rows,
        });
      }
      const row = body.row && typeof body.row === "object" ? body.row : null;
      if (!row) return json(res, 400, { ok: false, error: "No row" });
      try {
        const saved = await upsertRealTableRow(table, row);
        return json(res, 200, { ok: true, table, mode: "supabase-real-table", row: saved });
      } catch (err) {
        return json(res, 500, { ok: false, table, mode: "supabase-real-table", error: err.message });
      }
    }

    if (req.method === "DELETE") {
      const body = await readBody(req).catch(() => ({}));
      const table = validTable(body.table || requestUrl.searchParams.get("table"));
      if (!table) return json(res, 400, { ok: false, error: "Invalid farm table" });
      if (body.all === true) {
        let realDeleted = 0;
        let realError = null;
        if (body.fallbackOnly !== true) {
          try {
            realDeleted = await deleteRealTableRows(table);
          } catch (err) {
            realError = err;
          }
        }
        const deleted = await deleteFallbackTableRows(table);
        if (realError && !deleted) return json(res, 500, { ok: false, table, error: realError.message });
        return json(res, 200, {
          ok: true,
          table,
          mode: realDeleted ? "supabase-real-table" : "farm-master-fallback",
          deleted: realDeleted + deleted,
          realDeleted,
          fallbackDeleted: deleted,
          warning: realError ? realError.message : "",
        });
      }
      const id = cleanText(body.id || requestUrl.searchParams.get("id"), 220);
      if (!id) return json(res, 400, { ok: false, error: "No id" });
      let realDeleted = 0;
      let realError = null;
      try {
        realDeleted = await deleteRealTableRow(table, id);
      } catch (err) {
        realError = err;
      }
      const fallbackDeleted = await deleteFallbackRow(table, id).catch(() => 0);
      if (realError && !fallbackDeleted) {
        return json(res, 500, { ok: false, table, error: realError.message });
      }
      return json(res, 200, {
        ok: true,
        table,
        id,
        mode: realDeleted ? "supabase-real-table" : "farm-master-fallback",
        deleted: realDeleted + fallbackDeleted,
        warning: realError ? realError.message : "",
      });
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
      try {
        realRows = await supabaseFetchAll(`${table}?select=*`, limit);
      } catch (err) {
        realError = err;
      }
      const map = new Map();
      for (const row of Array.isArray(realRows) ? realRows : []) map.set(row.id || JSON.stringify(row), row);
      result[table] = [...map.values()];
      if (realError) {
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
        mode: "supabase-real-only",
        tableCount: tables.length,
        rowCount: Object.values(result).reduce((sum, rows) => sum + rows.length, 0),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
};
