const fs = require("node:fs");
const path = require("node:path");
const {
  ApiError,
  actorCanAccessBlock,
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

function redactOutsideScopeFeature(feature) {
  const inScope = Boolean(feature?.properties?.in_scope);
  return {
    ...feature,
    properties: {
      ...(feature.properties || {}),
      block_id: inScope ? (feature.properties?.block_id || null) : null,
    },
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

    const [blockResult, mapArtifact] = await Promise.all([
      rest("blocks?select=*&order=block_name.asc&limit=5000"),
      Promise.resolve().then(readBlockMapArtifact),
    ]);
    const canonicalBlocks = Array.isArray(blockResult.data) ? blockResult.data : [];
    const result = reconcileFarmAreaMap({
      blocks: canonicalBlocks,
      features: mapArtifact.features,
      canAccessBlock: (block) => actorCanAccessBlock(actor, block),
    });
    const visibleBlocks = result.visibleBlocks
      .slice()
      .sort((a, b) => String(a.block_name || "").localeCompare(String(b.block_name || ""), "th", { numeric: true }));
    const visibleBlockIds = visibleBlocks.map((block) => block.id).filter(Boolean);

    return json(res, 200, {
      ok: true,
      actor: {
        profileId: actor.profile.id,
        displayName: actor.profile.display_name || actor.profile.full_name || actor.profile.email || "User",
        roles: [...actor.roles],
        scopeTypes: [...new Set(actor.scopes.map((scope) => scope.scope_type || (scope.block_id ? "block" : "unknown")))],
      },
      visibleBlocks,
      diagnostics: {
        visibleBlockCount: visibleBlocks.length,
        firstBlockIds: visibleBlockIds.slice(0, 10),
        lastBlockIds: visibleBlockIds.slice(-10),
      },
      reconciliation: result.reconciliation,
      map: {
        type: mapArtifact.type,
        source: mapArtifact.source,
        bounds: mapArtifact.bounds,
        features: result.map.features.map(redactOutsideScopeFeature),
      },
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = { readBlockMapArtifact, redactOutsideScopeFeature };
