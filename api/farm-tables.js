const FARM_TABLES = new Set([
  "profiles",
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
  "activity_groups",
  "wage_codes",
  "activities",
  "activity_wage_code_mappings",
  "material_categories",
  "units",
  "materials",
  "activity_material_usage_rates",
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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const requestUrl = new URL(req.url, "http://localhost");
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

    for (const table of tables) {
      try {
        result[table] = await supabaseFetch(`${table}?select=*&limit=${limit}`);
      } catch (err) {
        result[table] = [];
        errors[table] = err.message;
      }
    }

    return json(res, 200, {
      ok: Object.keys(errors).length === 0,
      tables: result,
      errors,
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
