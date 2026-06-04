function validCategory(category) {
  return typeof category === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(category);
}

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

async function deleteCategory(category) {
  await supabaseFetch(`est_master_records?category=eq.${encodeURIComponent(category)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

function toDbRecord(row, category, targetTable, index, seen) {
  const baseId = String(row.id || `${category}-${index + 1}`).trim();
  let localId = baseId;
  if (seen.has(localId)) localId = `${baseId}__dup_${index + 1}`;
  seen.add(localId);
  return {
    local_id: localId,
    category,
    target_table: targetTable || row.targetTable || "",
    payload: { ...row, id: localId },
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
      if (!validCategory(category)) return json(res, 400, { ok: false, error: "Invalid category" });
      if (category === "healthcheck") {
        return json(res, 200, {
          ok: true,
          route: "est-master",
          hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
          hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        });
      }
      const rows = await supabaseFetch(`est_master_records?category=eq.${encodeURIComponent(category)}&order=updated_at.desc&limit=50000`);
      return json(res, 200, { ok: true, rows: rows.map(fromDbRecord) });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const category = body.category || "areas";
      if (!validCategory(category)) return json(res, 400, { ok: false, error: "Invalid category" });
      const targetTable = body.table || "";
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { ok: false, error: "No rows" });
      const seen = new Set();
      const records = rows.map((row, index) => toDbRecord(row, category, targetTable, index, seen));
      if (body.action === "replace") await deleteCategory(category);
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
