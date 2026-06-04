const allowedCategories = new Set([
  "areas",
  "people",
  "payrollTypes",
  "system",
  "budget",
  "activities",
]);

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
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

function toDbRecord(row, category, targetTable) {
  return {
    local_id: row.id || null,
    category,
    target_table: targetTable || row.targetTable || "",
    payload: row,
    note: row.note || null,
    updated_at: new Date().toISOString(),
  };
}

function fromDbRecord(row) {
  return {
    ...(row.payload || {}),
    id: row.local_id || row.id,
    databaseId: row.id,
    category: row.category,
    targetTable: row.target_table,
    _source: "database",
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    if (req.method === "GET") {
      const requestUrl = new URL(req.url, "http://localhost");
      const category = requestUrl.searchParams.get("category") || "areas";
      if (!allowedCategories.has(category)) return json(res, 400, { ok: false, error: "Invalid category" });
      const rows = await supabaseFetch(`est_master_records?category=eq.${encodeURIComponent(category)}&order=updated_at.desc`);
      return json(res, 200, { ok: true, rows: rows.map(fromDbRecord) });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const category = body.category || "areas";
      if (!allowedCategories.has(category)) return json(res, 400, { ok: false, error: "Invalid category" });
      const targetTable = body.table || "";
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, error: "No rows" });
      const records = rows.map((row) => toDbRecord(row, category, targetTable));
      const saved = await supabaseFetch("est_master_records?on_conflict=local_id", {
        method: "POST",
        body: JSON.stringify(records),
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      });
      return json(res, 200, { ok: true, rows: saved.map(fromDbRecord) });
    }

    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
};
