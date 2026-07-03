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

async function optionalSupabaseFetchAll(path, limit = 50000) {
  try {
    return { rows: await supabaseFetchAll(path, limit), available: true, error: "" };
  } catch (error) {
    if (String(error.message || "").includes("schema cache") || String(error.message || "").includes("Could not find the table")) {
      return { rows: [], available: false, error: error.message };
    }
    throw error;
  }
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
  delete out.moduleId;
  delete out.tableId;
  delete out.databaseId;
  delete out._overrideOf;
  delete out._source;
  delete out._farmFallback;
  delete out._budgetGroupIds;
  delete out._budgetGroupSize;
  return out;
}

function farmRecordCategory(table) {
  return `farm_table:${table}`;
}

function fallbackLocalId(table, row = {}) {
  return `${table}:${row.id || Date.now()}`.slice(0, 180);
}

function fromFallbackRecord(row = {}) {
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
  const rows = await supabaseFetchAll(`est_master_records?category=eq.${encodeURIComponent(farmRecordCategory(table))}&target_table=eq.${encodeURIComponent(table)}&order=updated_at.desc`);
  return Array.isArray(rows) ? rows.map(fromFallbackRecord) : [];
}

async function saveFallbackRows(table, rows = [], reason = "budget cleanup") {
  const payload = rows.map((row) => {
    const localId = fallbackLocalId(table, row);
    return {
      local_id: localId,
      category: farmRecordCategory(table),
      target_table: table,
      payload: cleanDbRow({ ...row, id: row.id || localId }),
      note: reason,
      updated_at: new Date().toISOString(),
    };
  });
  let count = 0;
  for (const chunk of chunks(payload, 200)) {
    if (!chunk.length) continue;
    const saved = await supabaseFetch("est_master_records?on_conflict=local_id", {
      method: "POST",
      body: JSON.stringify(chunk),
      prefer: "resolution=merge-duplicates,return=representation",
    });
    count += Array.isArray(saved) ? saved.length : chunk.length;
  }
  return count;
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

async function bulkDeleteFallback(table, ids = []) {
  const localIds = unique(ids.flatMap((id) => [`${table}:${id}`, id]));
  let count = 0;
  for (const chunk of chunks(localIds, 200)) {
    if (!chunk.length) continue;
    const deleted = await supabaseFetch(`est_master_records?category=eq.${encodeURIComponent(farmRecordCategory(table))}&local_id=${inFilter(chunk)}`, { method: "DELETE" });
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
    const [realRates, fallbackRates, blockRelations, materialRelations, roleRelations, blocks, fallbackBlockRelations, fallbackMaterialRelations, fallbackRoleRelations] = await Promise.all([
      supabaseFetchAll("budget_activity_rates?select=*"),
      loadFallbackRows("budget_activity_rates"),
      optionalSupabaseFetchAll("budget_rate_blocks?select=*"),
      optionalSupabaseFetchAll("budget_rate_materials?select=*"),
      optionalSupabaseFetchAll("budget_rate_roles?select=*"),
      optionalSupabaseFetchAll("blocks?select=*"),
      loadFallbackRows("budget_rate_blocks"),
      loadFallbackRows("budget_rate_materials"),
      loadFallbackRows("budget_rate_roles"),
    ]);
    const availableRelations = {
      budget_rate_blocks: blockRelations.available,
      budget_rate_materials: materialRelations.available,
      budget_rate_roles: roleRelations.available,
    };
    const blockRows = blocks.rows || [];
    const ratesById = new Map();
    for (const row of realRates) ratesById.set(row.id || JSON.stringify(row), row);
    for (const row of fallbackRates) ratesById.set(row.id || row.databaseId || JSON.stringify(row), row);
    const rates = [...ratesById.values()];
    const relationRows = {
      budget_rate_blocks: [...(blockRelations.rows || []), ...fallbackBlockRelations],
      budget_rate_materials: [...(materialRelations.rows || []), ...fallbackMaterialRelations],
      budget_rate_roles: [...(roleRelations.rows || []), ...fallbackRoleRelations],
    };

    const groups = new Map();
    for (const row of rates) {
      const key = groupKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const targets = [...groups.entries()].filter(([, rows]) => rows.length > 1 && rows.every(isOldBlockRate));
    const canonicalRealRates = [];
    const canonicalFallbackRates = [];
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
        return tokens.map((token) => findBlock(blockRows, token)?.id).filter(Boolean);
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
      if (keep._farmFallback) canonicalFallbackRates.push(nextRate);
      else canonicalRealRates.push(nextRate);

      const blockRelationRows = selectedBlocks.map((id, index) => {
        const block = blockRows.find((item) => String(item.id) === String(id)) || {};
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
        budget_rate_blocks: relationRows.budget_rate_blocks,
        budget_rate_materials: relationRows.budget_rate_materials,
        budget_rate_roles: relationRows.budget_rate_roles,
      })) {
        const oldRows = sourceRows.filter((row) => ids.has(String(row.budget_rate_id || "")));
        relationDeletes[table].push(...oldRows.map((row) => row.id).filter(Boolean));
        const rowsToCreate = table === "budget_rate_blocks" ? blockRelationRows : oldRows.map((row, index) => relationRow(table, row, keepId, index + 1));
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
        availableRelations,
        missingRelations: Object.fromEntries(Object.entries(availableRelations).filter(([, ok]) => !ok)),
        staleRateRows: staleRateIds.length,
        canonicalRealRates: canonicalRealRates.length,
        canonicalFallbackRates: canonicalFallbackRates.length,
        relationDeletes: Object.fromEntries(Object.entries(relationDeletes).map(([key, rows]) => [key, rows.length])),
        relationCreates: Object.fromEntries(Object.entries(relationCreates).map(([key, rows]) => [key, rows.length])),
        details,
      });
    }

    const result = {
      targetGroups: targets.length,
      upsertedRates: await bulkUpsert("budget_activity_rates", canonicalRealRates),
      upsertedFallbackRates: await saveFallbackRows("budget_activity_rates", canonicalFallbackRates),
      deletedRelations: {},
      deletedFallbackRelations: {},
      upsertedRelations: {},
      upsertedFallbackRelations: {},
      deletedRates: 0,
      deletedFallbackRates: 0,
    };
    for (const table of Object.keys(relationDeletes)) {
      result.deletedFallbackRelations[table] = await bulkDeleteFallback(table, relationDeletes[table]);
      result.deletedRelations[table] = availableRelations[table] ? await bulkDelete(table, relationDeletes[table]) : 0;
    }
    for (const table of Object.keys(relationCreates)) {
      if (!availableRelations[table]) {
        result.upsertedRelations[table] = 0;
        result.upsertedFallbackRelations[table] = await saveFallbackRows(table, relationCreates[table]);
        continue;
      }
      result.upsertedRelations[table] = await bulkUpsert(table, relationCreates[table]);
      result.upsertedFallbackRelations[table] = 0;
    }
    result.deletedRates = await bulkDelete("budget_activity_rates", staleRateIds);
    result.deletedFallbackRates = await bulkDeleteFallback("budget_activity_rates", staleRateIds);

    return json(res, 200, { ok: true, ...result, details });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
};
