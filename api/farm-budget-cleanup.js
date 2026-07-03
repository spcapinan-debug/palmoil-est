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
      Prefer: options.prefer || "return=representation",
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
    const separator = path.includes("?") ? "&" : "?";
    const page = await supabaseFetch(`${path}${separator}limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

function safe(value) {
  return String(value || "x")
    .trim()
    .replace(/[^\wก-๙-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "x";
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function groupKey(row = {}) {
  return [
    row.fiscal_year || "",
    row.activity_id || norm(row.activity_code) || norm(row.activity_name) || norm(row.rate_code || row.id),
  ].join("|");
}

function isOldBlockRate(row = {}) {
  return String(row.id || "").startsWith("bar-") || String(row.rate_code || "").startsWith("BR69-");
}

function parseList(value) {
  return String(value || "")
    .split(/[,+|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function blockMapKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "").replace(/-upper|-lower$/g, "");
}

function findBlock(blocks = [], token = "") {
  const key = blockMapKey(token);
  if (!key) return null;
  return blocks.find((block) => [block.id, block.block_code, block.terrain_code, block.area_code, block.block_name].some((value) => blockMapKey(value) === key)) || null;
}

function parseNote(raw = "") {
  try {
    return String(raw || "").trim().startsWith("{") ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function relationKey(table, row = {}) {
  if (table === "budget_rate_blocks") return [row.block_id, row.terrain_code, row.block_name].join("|");
  if (table === "budget_rate_materials") return [row.material_id, row.material_name, row.usage_quantity, row.usage_unit, row.usage_basis].join("|");
  if (table === "budget_rate_roles") return [row.team_id, row.worker_group_name, row.line_type, row.rate_category, row.payee_type, row.role_name, row.rate_amount, row.uom, row.calculation_method, row.note].join("|");
  return JSON.stringify(row);
}

function cleanDbRow(row = {}) {
  const out = { ...row };
  delete out.created_at;
  delete out.updated_at;
  delete out.createdAt;
  delete out.updatedAt;
  delete out.databaseId;
  delete out._overrideOf;
  delete out._budgetGroupIds;
  delete out._budgetGroupSize;
  return out;
}

function relationRow(table, row, keepId, index) {
  const out = cleanDbRow(row);
  out.budget_rate_id = keepId;
  out.id = `${table.replace("budget_rate_", "budget-")}-${safe(keepId)}-${index}`.slice(0, 180);
  out.tableId = table;
  out.moduleId = "farm-budget";
  return out;
}

function chunks(rows, size = 200) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function inFilter(ids = []) {
  const csv = ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",");
  return encodeURIComponent(`in.(${csv})`);
}

async function bulkDelete(table, ids = []) {
  let count = 0;
  for (const chunk of chunks(unique(ids), 200)) {
    if (!chunk.length) continue;
    const deleted = await supabaseFetch(`${table}?id=${inFilter(chunk)}`, { method: "DELETE" });
    count += Array.isArray(deleted) ? deleted.length : chunk.length;
  }
  return count;
}

async function bulkUpsert(table, rows = []) {
  let count = 0;
  for (const chunk of chunks(rows.map(cleanDbRow), 200)) {
    if (!chunk.length) continue;
    const saved = await supabaseFetch(`${table}?on_conflict=id`, {
      method: "POST",
      body: JSON.stringify(chunk),
      prefer: "resolution=merge-duplicates,return=representation",
    });
    count += Array.isArray(saved) ? saved.length : chunk.length;
  }
  return count;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST" && req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
    const dryRun = req.method === "GET" || String(new URL(req.url, "http://localhost").searchParams.get("dryRun") || "") === "1";
    const [rates, blockRelations, materialRelations, roleRelations, blocks] = await Promise.all([
      supabaseFetchAll("budget_activity_rates?select=*"),
      supabaseFetchAll("budget_rate_blocks?select=*"),
      supabaseFetchAll("budget_rate_materials?select=*"),
      supabaseFetchAll("budget_rate_roles?select=*"),
      supabaseFetchAll("blocks?select=*"),
    ]);

    const groups = new Map();
    for (const row of rates) {
      const key = groupKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const targets = [...groups.entries()].filter(([, rows]) => rows.length > 1 && rows.every(isOldBlockRate));
    const canonicalRates = [];
    const relationCreates = {
      budget_rate_blocks: [],
      budget_rate_materials: [],
      budget_rate_roles: [],
    };
    const relationDeletes = {
      budget_rate_blocks: [],
      budget_rate_materials: [],
      budget_rate_roles: [],
    };
    const staleRateIds = [];
    const details = [];

    for (const [, rows] of targets) {
      const keep = rows[0];
      const keepId = keep.id;
      const ids = new Set(rows.map((row) => String(row.id)));
      const selectedBlocks = unique(rows.flatMap((row) => {
        const tokens = [row.block_id, row.terrain_code, row.block_code, row.area_code, ...parseList(row.terrain_code || row.block_code || row.area_code)];
        return tokens.map((token) => findBlock(blocks, token)?.id).filter(Boolean);
      }));
      const note = parseNote(keep.note);
      const nextRate = cleanDbRow({
        ...keep,
        moduleId: "farm-budget",
        tableId: "budget_activity_rates",
        area_scope_type: selectedBlocks.length > 1 ? "multi_block" : (keep.area_scope_type || "block"),
        terrain_code: selectedBlocks.length > 1 ? `${selectedBlocks.length} Block` : (keep.terrain_code || ""),
        block_id: selectedBlocks.length === 1 ? selectedBlocks[0] : "",
        note: JSON.stringify({ ...note, selectedBlocks: unique([...(note.selectedBlocks || []), ...selectedBlocks]) }),
        updatedAt: new Date().toISOString(),
      });
      canonicalRates.push(nextRate);

      const blockRows = selectedBlocks.map((id, index) => {
        const block = blocks.find((item) => String(item.id) === String(id)) || {};
        return {
          id: `budget-block-${safe(keepId)}-${safe(id)}-${index + 1}`.slice(0, 180),
          moduleId: "farm-budget",
          tableId: "budget_rate_blocks",
          budget_rate_id: keepId,
          block_id: id,
          terrain_code: block.block_code || block.terrain_code || block.area_code || id,
          block_name: block.block_name || block.area_name || block.block_code || id,
          estate_name: block.estate_name || "",
          zone_name: block.zone_name || "",
          status: "active",
        };
      });

      for (const [table, sourceRows] of Object.entries({
        budget_rate_blocks: blockRelations,
        budget_rate_materials: materialRelations,
        budget_rate_roles: roleRelations,
      })) {
        const oldRows = sourceRows.filter((row) => ids.has(String(row.budget_rate_id || "")));
        relationDeletes[table].push(...oldRows.map((row) => row.id).filter(Boolean));
        const rowsToCreate = table === "budget_rate_blocks" ? blockRows : oldRows.map((row, index) => relationRow(table, row, keepId, index + 1));
        const map = new Map();
        for (const row of rowsToCreate) {
          const key = relationKey(table, row);
          if (!map.has(key)) map.set(key, row);
        }
        relationCreates[table].push(...map.values());
      }

      staleRateIds.push(...rows.slice(1).map((row) => row.id).filter(Boolean));
      details.push({ activity: keep.activity_name, kept: keepId, removed: rows.length - 1, blocks: selectedBlocks.length });
    }

    if (dryRun) {
      return json(res, 200, {
        ok: true,
        dryRun: true,
        targetGroups: targets.length,
        staleRateRows: staleRateIds.length,
        relationDeletes: Object.fromEntries(Object.entries(relationDeletes).map(([key, rows]) => [key, rows.length])),
        relationCreates: Object.fromEntries(Object.entries(relationCreates).map(([key, rows]) => [key, rows.length])),
        details,
      });
    }

    const result = {
      targetGroups: targets.length,
      upsertedRates: await bulkUpsert("budget_activity_rates", canonicalRates),
      deletedRelations: {},
      upsertedRelations: {},
      deletedRates: 0,
    };
    for (const table of Object.keys(relationDeletes)) result.deletedRelations[table] = await bulkDelete(table, relationDeletes[table]);
    for (const table of Object.keys(relationCreates)) result.upsertedRelations[table] = await bulkUpsert(table, relationCreates[table]);
    result.deletedRates = await bulkDelete("budget_activity_rates", staleRateIds);

    return json(res, 200, { ok: true, ...result, details });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
