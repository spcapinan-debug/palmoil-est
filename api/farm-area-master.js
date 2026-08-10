const fs = require("node:fs");
const path = require("node:path");
const {
  ApiError,
  authenticate,
  authorize,
  errorResponse,
  json,
  refreshAuthentication,
  rest,
} = require("../lib/server/farm-api");
const { reconcileFarmAreaMap } = require("../lib/server/farm-area-map");

function readBlockMapArtifact() {
  const filePath = path.join(process.cwd(), "webapp", "data", "block_map.json");
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    type: payload.type || "FeatureCollection",
    source: payload.source || {},
    bounds: Array.isArray(payload.bounds) ? payload.bounds : [],
    features: Array.isArray(payload.features) ? payload.features : [],
  };
}

function buildAreaCatalogAudit({ result, canonicalBlocks, estates, zones }) {
  const blockById = new Map((canonicalBlocks || []).map((block) => [block.id, block]));
  const estateById = new Map((estates || []).map((estate) => [estate.id, estate]));
  const zoneById = new Map((zones || []).map((zone) => [zone.id, zone]));
  const enrichMasterEntry = (entry) => {
    const block = blockById.get(entry.blockId) || {};
    const estate = estateById.get(block.estate_id) || {};
    const zone = zoneById.get(block.zone_id) || {};
    return {
      ...entry,
      estate: estate.estate_name || estate.estate_code || block.estate_id || "",
      zone: zone.zone_name || zone.zone_code || "ยังไม่ระบุ Zone",
    };
  };
  return {
    mapWithoutMaster: result.reconciliation.mapWithoutMasterEntries || [],
    masterWithoutMap: (result.reconciliation.masterWithoutMapEntries || [])
      .map(enrichMasterEntry),
    reconciliationCandidates: (result.reconciliation.reconciliationCandidates || []).map((entry) => ({
      ...entry,
      candidates: (entry.candidates || [])
        .map(enrichMasterEntry),
    })),
    duplicateMapKeys: result.reconciliation.duplicateMapKeys || [],
    duplicateMasterKeys: (result.reconciliation.duplicateMasterKeys || []).map((entry) => ({
      ...entry,
      blockIds: entry.blockIds || [],
      blockNames: (entry.blockIds || [])
        .map((id) => blockById.get(id)?.block_name)
        .filter(Boolean),
    })).filter((entry) => entry.blockIds.length > 1),
    geometryConflicts: result.reconciliation.geometryConflicts || [],
  };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (req.method !== "GET") return errorResponse(res, new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed"));
  try {
    let actor;
    try {
      actor = await authenticate(req);
    } catch (error) {
      if (error?.status !== 401) throw error;
      actor = await refreshAuthentication(req, res);
    }
    authorize(actor, {
      permissions: ["farm.dashboard.view", "farm.plan.view", "farm.work_order.view"],
      roles: ["uat_manager", "uat_supervisor"],
    });

    const [blockResult, estateResult, zoneResult, mapArtifact] = await Promise.all([
      rest("blocks?status=eq.active&select=*&order=block_name.asc&limit=5000"),
      rest("estates?select=id,estate_code,estate_name,status&limit=5000"),
      rest("zones?select=id,zone_code,zone_name,estate_id,status&limit=5000"),
      Promise.resolve().then(readBlockMapArtifact),
    ]);
    const canonicalBlocks = Array.isArray(blockResult.data) ? blockResult.data : [];
    const estates = Array.isArray(estateResult.data) ? estateResult.data : [];
    const zones = Array.isArray(zoneResult.data) ? zoneResult.data : [];
    const result = reconcileFarmAreaMap({
      blocks: canonicalBlocks,
      features: mapArtifact.features,
    });
    const catalogBlocks = result.catalogBlocks
      .slice()
      .sort((a, b) => String(a.block_name || "").localeCompare(String(b.block_name || ""), "th", { numeric: true }));
    const catalogBlockIds = catalogBlocks.map((block) => block.id).filter(Boolean);
    const audit = buildAreaCatalogAudit({ result, canonicalBlocks, estates, zones });
    const {
      duplicateMapKeys,
      duplicateMasterKeys,
      geometryConflicts,
      mapWithoutMasterEntries,
      masterWithoutMapEntries,
      reconciliationCandidates,
      ...reconciliation
    } = result.reconciliation;

    return json(res, 200, {
      ok: true,
      actor: {
        profileId: actor.profile.id,
        displayName: actor.profile.display_name || actor.profile.full_name || actor.profile.email || "User",
        roles: [...actor.roles],
      },
      catalogBlocks,
      diagnostics: {
        catalogBlockCount: catalogBlocks.length,
        firstBlockIds: catalogBlockIds.slice(0, 10),
        lastBlockIds: catalogBlockIds.slice(-10),
      },
      reconciliation,
      audit,
      map: {
        type: mapArtifact.type,
        source: mapArtifact.source,
        bounds: mapArtifact.bounds,
        features: result.map.features,
      },
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { buildAreaCatalogAudit, readBlockMapArtifact };
