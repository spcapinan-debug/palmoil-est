const fs = require("fs");
const path = require("path");

const IMPORT_TABLES = [
  "budget_years",
  "budget_activity_rates",
  "budget_rate_materials",
  "budget_rate_roles",
  "budget_rate_import_rows",
];

const CONFLICT_KEYS = {
  budget_years: "fiscal_year",
  budget_activity_rates: "rate_code",
  budget_rate_materials: "id",
  budget_rate_roles: "id",
  budget_rate_import_rows: "id",
};

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

async function supabaseFetch(restPath, options = {}) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${restPath}`, {
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

function loadSeedData() {
  const filePath = path.join(process.cwd(), "webapp", "data", "farm_budget_rates_2569.json");
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!payload?.ok || !payload.tables) throw new Error("Invalid farm budget seed data");
  return payload;
}

function cleanRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value === "") out[key] = null;
    else out[key] = value;
  }
  return out;
}

function chunks(rows, size = 500) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function fallbackLocalId(table, row) {
  const key = row.rate_code || row.fiscal_year || row.terrain_code || row.id || Date.now();
  return `${table}:${key}`;
}

async function saveFallbackRows(table, rows, reason) {
  const payload = rows.map((row) => ({
    local_id: fallbackLocalId(table, row),
    category: `farm_table:${table}`,
    target_table: table,
    payload: { ...row, id: row.id || fallbackLocalId(table, row) },
    note: reason || null,
    updated_at: new Date().toISOString(),
  }));
  let count = 0;
  for (const batch of chunks(payload, 500)) {
    const saved = await supabaseFetch("est_master_records?on_conflict=local_id", {
      method: "POST",
      body: JSON.stringify(batch),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    count += Array.isArray(saved) ? saved.length : batch.length;
  }
  return count;
}

async function upsertTable(table, rows) {
  const cleanRows = rows.map(cleanRow);
  const conflictKey = CONFLICT_KEYS[table] || "id";
  let count = 0;
  for (const batch of chunks(cleanRows, 500)) {
    const saved = await supabaseFetch(`${table}?on_conflict=${encodeURIComponent(conflictKey)}`, {
      method: "POST",
      body: JSON.stringify(batch),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    count += Array.isArray(saved) ? saved.length : batch.length;
  }
  return count;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const seed = loadSeedData();
    const counts = {};
    const warnings = {};
    let fallbackCount = 0;

    for (const table of IMPORT_TABLES) {
      const rows = Array.isArray(seed.tables?.[table]) ? seed.tables[table] : [];
      if (!rows.length) {
        counts[table] = 0;
        continue;
      }
      try {
        counts[table] = await upsertTable(table, rows);
      } catch (error) {
        warnings[table] = error.message;
        counts[table] = await saveFallbackRows(table, rows, error.message);
        fallbackCount += counts[table];
      }
    }

    return json(res, 200, {
      ok: true,
      mode: fallbackCount ? "fallback" : "supabase-real-tables",
      source: seed.source,
      counts,
      warnings,
      importedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
