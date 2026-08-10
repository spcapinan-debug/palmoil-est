const { createHash } = require("node:crypto");
const {
  ApiError,
  audit,
  authenticate,
  authorize,
  errorResponse,
  json,
  readBody,
  refreshAuthentication,
  requireText,
  requireUuid,
  rest,
} = require("../lib/server/farm-api");
const {
  compareFarmAreaMapVersions,
  farmMapBounds,
  reconcileFarmAreaMap,
} = require("../lib/server/farm-area-map");
const { FarmAreaKmzError, KMZ_LIMITS, parseFarmAreaKmz } = require("../lib/server/farm-area-kmz");
const {
  activeAreaMapVersion,
  areaMapDeploymentContext,
  areaMapVersionClient,
  downloadAreaMapObject,
  loadActiveAreaMapArtifact,
  uploadAreaMapObject,
} = require("../lib/server/farm-area-map-store");

const AREA_MAP_BODY_LIMIT = 4_250_000;

function requestAction(req) {
  return new URL(req.url || "/", "https://area-map.local").searchParams.get("action") || "versions";
}

function sanitizeKmzFileName(value) {
  const fileName = requireText(value, "file_name", 180).replace(/[\\/\u0000-\u001f]/g, "-");
  if (!/\.kmz$/i.test(fileName)) throw new ApiError(400, "UNSUPPORTED_FILE_TYPE", "Area map upload must be a .kmz file");
  return fileName;
}

function decodeKmzBase64(value) {
  const encoded = String(value || "").replace(/\s+/g, "");
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new ApiError(400, "INVALID_FILE_BODY", "KMZ file content must be valid base64");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > KMZ_LIMITS.compressedBytes) {
    throw new ApiError(413, "KMZ_TOO_LARGE", "KMZ must be larger than 0 bytes and no more than 3 MB");
  }
  if (buffer.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new ApiError(400, "INVALID_FILE_BODY", "KMZ file content must be valid base64");
  }
  return buffer;
}

async function canonicalBlocks() {
  const { data } = await rest("blocks?status=eq.active&select=*&order=block_name.asc&limit=5000");
  return Array.isArray(data) ? data : [];
}

async function versionRow(versionId, context = areaMapDeploymentContext()) {
  const id = requireUuid(versionId, "version_id");
  const { data } = await rest(`area_map_versions?id=eq.${id}&deployment_context=eq.${encodeURIComponent(context)}&select=*&limit=1`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new ApiError(404, "AREA_MAP_VERSION_NOT_FOUND", "Area map version was not found in this deployment context");
  return row;
}

async function processedArtifact(row) {
  if (!row?.processed_storage_path) throw new ApiError(409, "AREA_MAP_NOT_PROCESSED", "Area map version does not have a processed artifact");
  try {
    const payload = JSON.parse((await downloadAreaMapObject(row.processed_storage_path)).toString("utf8"));
    if (!Array.isArray(payload.features) || !Array.isArray(payload.bounds)) throw new Error("invalid artifact");
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(409, "AREA_MAP_ARTIFACT_INVALID", "Processed Area map artifact is invalid");
  }
}

function reconciliationPayload({ parsed, blocks, previousFeatures = [] }) {
  const reconciled = reconcileFarmAreaMap({ blocks, features: parsed.features, source: parsed.source });
  const comparison = compareFarmAreaMapVersions({ previousFeatures, nextFeatures: reconciled.map.features });
  const bounds = farmMapBounds(reconciled.map.features);
  const reconciliation = reconciled.reconciliation;
  const validationErrors = [];
  if (!reconciliation.uniqueBlockKeys) validationErrors.push({ code: "EMPTY_GEOMETRY", message: "No publishable polygon geometry was found" });
  if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value))) {
    validationErrors.push({ code: "INVALID_BOUNDS", message: "Map bounds are invalid" });
  }
  if (reconciliation.unresolvedDuplicates > 0) {
    validationErrors.push({ code: "DUPLICATE_PLACEMARK", message: "Overlapping duplicate Placemark geometry must be resolved" });
  }
  if (reconciliation.mapConflicts > 0) {
    validationErrors.push({ code: "GEOMETRY_CONFLICT", message: "Geometry or canonical name conflicts must be resolved" });
  }
  if (reconciled.map.features.some((feature) => !feature.geometry)) {
    validationErrors.push({ code: "EMPTY_GEOMETRY", message: "Every publishable feature must have geometry" });
  }
  const summary = {
    ...reconciliation,
    ...comparison,
    matchedDecrease: 0,
  };
  const artifact = {
    type: "FeatureCollection",
    source: parsed.source || {},
    bounds,
    features: reconciled.map.features,
  };
  return { artifact, reconciliation, comparison, summary, validationErrors };
}

function versionDbPatch(payload, { unmatchedAcknowledged = false } = {}) {
  return {
    feature_count: Number(payload.reconciliation.uniqueBlockKeys || 0),
    matched_count: Number(payload.reconciliation.matchedMaster || 0),
    unmatched_count: Number(payload.reconciliation.mapWithoutMaster || 0),
    master_without_map_count: Number(payload.reconciliation.masterWithoutMap || 0),
    duplicate_count: Number(payload.reconciliation.duplicatePlacemarks || 0),
    conflict_count: Number(payload.reconciliation.mapConflicts || 0),
    bounds: payload.artifact.bounds,
    source_metadata: payload.artifact.source || {},
    reconciliation_summary: payload.summary,
    validation_errors: payload.validationErrors,
    unmatched_acknowledged: Boolean(unmatchedAcknowledged),
  };
}

async function patchVersion(row, patch) {
  const { data } = await rest(`area_map_versions?id=eq.${row.id}&deployment_context=eq.${encodeURIComponent(row.deployment_context)}&select=*`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(data) ? data[0] : data;
}

async function activeComparison(context) {
  const current = await loadActiveAreaMapArtifact(context);
  return {
    version: current.version,
    features: current.artifact.features || [],
    matchedCount: Number(current.version?.matched_count || 0),
  };
}

async function createDraft(req, actor, body, context) {
  const fileName = sanitizeKmzFileName(body.file_name);
  const buffer = decodeKmzBase64(body.file_base64);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const { data } = await rest("area_map_versions", {
    method: "POST",
    body: JSON.stringify([{
      deployment_context: context,
      status: "draft",
      original_file_name: fileName,
      sha256,
      file_size_bytes: buffer.length,
      uploaded_by_profile_id: actor.profile.id,
    }]),
    headers: { Prefer: "return=representation" },
  });
  let row = data?.[0];
  if (!row?.id) throw new ApiError(502, "AREA_MAP_DRAFT_FAILED", "Area map draft could not be created");
  const rawPath = `raw/${row.id}/source.kmz`;
  const processedPath = `processed/${row.id}/block_map.json`;
  try {
    await uploadAreaMapObject(rawPath, buffer, "application/vnd.google-earth.kmz");
    row = await patchVersion(row, { raw_storage_path: rawPath });
    const [parsed, blocks, previous] = await Promise.all([
      parseFarmAreaKmz(buffer),
      canonicalBlocks(),
      activeComparison(context),
    ]);
    const payload = reconciliationPayload({ parsed, blocks, previousFeatures: previous.features });
    payload.summary.matchedDecrease = Math.max(0, previous.matchedCount - Number(payload.reconciliation.matchedMaster || 0));
    payload.artifact.source = {
      ...(payload.artifact.source || {}),
      originalFileName: fileName,
      sha256,
      versionId: row.id,
      deploymentContext: context,
    };
    await uploadAreaMapObject(processedPath, Buffer.from(JSON.stringify(payload.artifact)), "application/geo+json");
    row = await patchVersion(row, {
      raw_storage_path: rawPath,
      processed_storage_path: processedPath,
      ...versionDbPatch(payload),
    });
    await audit(req, actor, "area_map.upload", "area_map_versions", row.id, {
      versionNo: row.version_no,
      filename: fileName,
      sha256,
      summary: payload.summary,
    });
    return { row, payload };
  } catch (error) {
    const parserError = error instanceof FarmAreaKmzError;
    const safeCode = parserError ? error.code : (error?.code || "AREA_MAP_PROCESSING_FAILED");
    const safeMessage = parserError ? error.message : "Area map draft could not be processed";
    row = await patchVersion(row, {
      status: "rejected",
      raw_storage_path: row.raw_storage_path || rawPath,
      validation_errors: [{ code: safeCode, message: safeMessage }],
      source_metadata: { parseRejected: true },
    }).catch(() => row);
    await audit(req, actor, "area_map.reject", "area_map_versions", row.id, {
      versionNo: row.version_no,
      filename: fileName,
      sha256,
      reason: safeCode,
    }).catch(() => null);
    throw new ApiError(parserError ? 422 : (error?.status || 502), safeCode, safeMessage, { versionId: row.id });
  }
}

async function validateDraft(req, actor, body, context) {
  let row = await versionRow(body.version_id, context);
  if (!['draft', 'validated'].includes(row.status)) throw new ApiError(409, "AREA_MAP_INVALID_STATE", "Only a draft Area map version can be validated");
  if (!row.raw_storage_path) throw new ApiError(409, "AREA_MAP_RAW_MISSING", "Area map draft does not have a raw KMZ artifact");
  const [rawBuffer, blocks, previous] = await Promise.all([
    downloadAreaMapObject(row.raw_storage_path),
    canonicalBlocks(),
    activeComparison(context),
  ]);
  const parsed = await parseFarmAreaKmz(rawBuffer);
  const payload = reconciliationPayload({ parsed, blocks, previousFeatures: previous.features });
  payload.summary.matchedDecrease = Math.max(0, previous.matchedCount - Number(payload.reconciliation.matchedMaster || 0));
  const unmatchedAcknowledged = Boolean(body.acknowledge_unmatched) || payload.reconciliation.mapWithoutMaster === 0;
  if (!unmatchedAcknowledged) {
    payload.validationErrors.push({ code: "UNMATCHED_REVIEW_REQUIRED", message: "Unmatched KMZ Placemarks must be reviewed and acknowledged" });
  }
  payload.artifact.source = {
    ...(parsed.source || {}),
    originalFileName: row.original_file_name,
    sha256: row.sha256,
    versionId: row.id,
    deploymentContext: context,
  };
  await uploadAreaMapObject(row.processed_storage_path, Buffer.from(JSON.stringify(payload.artifact)), "application/geo+json", { upsert: true });
  const valid = payload.validationErrors.length === 0;
  row = await patchVersion(row, {
    status: valid ? "validated" : "draft",
    ...versionDbPatch(payload, { unmatchedAcknowledged }),
  });
  await audit(req, actor, "area_map.validate", "area_map_versions", row.id, {
    versionNo: row.version_no,
    filename: row.original_file_name,
    sha256: row.sha256,
    valid,
    summary: payload.summary,
    validationErrors: payload.validationErrors,
  });
  return { row, payload, valid };
}

async function publishVersion(req, actor, body, context) {
  const target = await versionRow(body.version_id, context);
  const summary = target.reconciliation_summary || {};
  const warnings = Number(summary.removedPolygons || 0) > 0 || Number(summary.matchedDecrease || 0) > 0;
  if (warnings && !body.confirm_warnings) {
    throw new ApiError(409, "AREA_MAP_PUBLISH_CONFIRMATION_REQUIRED", "Removed polygons or a matched-count decrease require explicit confirmation", {
      removedPolygons: Number(summary.removedPolygons || 0),
      matchedDecrease: Number(summary.matchedDecrease || 0),
    });
  }
  const oldActive = await activeAreaMapVersion(context);
  const { data } = await rest("rpc/publish_area_map_version", {
    method: "POST",
    body: JSON.stringify({
      p_version_id: target.id,
      p_deployment_context: context,
      p_actor_profile_id: actor.profile.id,
    }),
    headers: { Prefer: "return=representation" },
  });
  const published = Array.isArray(data) ? data[0] : data;
  await audit(req, actor, "area_map.publish", "area_map_versions", published.id, {
    versionNo: published.version_no,
    filename: published.original_file_name,
    sha256: published.sha256,
    oldActiveVersionId: oldActive?.id || null,
    newActiveVersionId: published.id,
    summary: published.reconciliation_summary || {},
  });
  return published;
}

async function rollbackVersion(req, actor, body, context) {
  const source = await versionRow(body.version_id, context);
  const reason = requireText(body.reason, "reason", 500);
  if (!body.confirm) throw new ApiError(409, "AREA_MAP_ROLLBACK_CONFIRMATION_REQUIRED", "Rollback requires explicit confirmation");
  const oldActive = await activeAreaMapVersion(context);
  const { data } = await rest("rpc/rollback_area_map_version", {
    method: "POST",
    body: JSON.stringify({
      p_source_version_id: source.id,
      p_deployment_context: context,
      p_actor_profile_id: actor.profile.id,
      p_reason: reason,
    }),
    headers: { Prefer: "return=representation" },
  });
  const restored = Array.isArray(data) ? data[0] : data;
  await audit(req, actor, "area_map.rollback", "area_map_versions", restored.id, {
    versionNo: restored.version_no,
    filename: restored.original_file_name,
    sha256: restored.sha256,
    oldActiveVersionId: oldActive?.id || null,
    newActiveVersionId: restored.id,
    sourceVersionId: source.id,
    reason,
    summary: restored.reconciliation_summary || {},
  });
  return restored;
}

async function rejectVersion(req, actor, body, context) {
  const row = await versionRow(body.version_id, context);
  if (!['draft', 'validated'].includes(row.status)) throw new ApiError(409, "AREA_MAP_INVALID_STATE", "Only a draft or validated version can be rejected");
  const reason = requireText(body.reason, "reason", 500);
  const rejected = await patchVersion(row, {
    status: "rejected",
    validation_errors: [...(row.validation_errors || []), { code: "USER_REJECTED", message: reason }],
  });
  await audit(req, actor, "area_map.reject", "area_map_versions", rejected.id, {
    versionNo: rejected.version_no,
    filename: rejected.original_file_name,
    sha256: rejected.sha256,
    reason,
  });
  return rejected;
}

async function versionList(context) {
  const { data } = await rest(`area_map_versions?deployment_context=eq.${encodeURIComponent(context)}&select=*&order=version_no.desc&limit=100`);
  const rows = Array.isArray(data) ? data : [];
  const profileIds = [...new Set(rows.flatMap((row) => [row.uploaded_by_profile_id, row.published_by_profile_id]).filter(Boolean))];
  const profiles = profileIds.length
    ? await rest(`profiles?id=in.(${profileIds.join(",")})&select=id,display_name,full_name,email&limit=500`).then(({ data: values }) => values || [])
    : [];
  const names = new Map(profiles.map((profile) => [profile.id, profile.display_name || profile.full_name || profile.email || profile.id]));
  return rows.map((row) => ({
    ...areaMapVersionClient(row),
    uploadedBy: names.get(row.uploaded_by_profile_id) || null,
    publishedBy: names.get(row.published_by_profile_id) || null,
  }));
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    let actor;
    try {
      actor = await authenticate(req);
    } catch (error) {
      if (error?.status !== 401) throw error;
      actor = await refreshAuthentication(req, res);
    }
    const action = requestAction(req);
    const context = areaMapDeploymentContext();

    if (req.method === "GET") {
      authorize(actor, { permissions: ["farm.area_map.manage"] });
      if (action === "versions") return json(res, 200, { ok: true, deploymentContext: context, versions: await versionList(context) });
      if (action === "version" || action === "preview") {
        const versionId = new URL(req.url, "https://area-map.local").searchParams.get("version_id");
        const row = await versionRow(versionId, context);
        return json(res, 200, {
          ok: true,
          deploymentContext: context,
          version: areaMapVersionClient(row),
          ...(action === "preview" ? { map: await processedArtifact(row) } : {}),
        });
      }
      throw new ApiError(404, "AREA_MAP_ACTION_NOT_FOUND", "Area map action was not found");
    }

    if (req.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await readBody(req, AREA_MAP_BODY_LIMIT);
    if (action === "upload") {
      authorize(actor, { permissions: ["farm.area_map.manage"] });
      const result = await createDraft(req, actor, body, context);
      return json(res, 201, {
        ok: true,
        deploymentContext: context,
        version: areaMapVersionClient(result.row),
        preview: result.payload,
      });
    }
    if (action === "validate") {
      authorize(actor, { permissions: ["farm.area_map.manage"] });
      const result = await validateDraft(req, actor, body, context);
      return json(res, result.valid ? 200 : 422, {
        ok: result.valid,
        deploymentContext: context,
        version: areaMapVersionClient(result.row),
        preview: result.payload,
      });
    }
    if (action === "publish") {
      authorize(actor, { permissions: ["farm.area_map.publish"] });
      return json(res, 200, { ok: true, deploymentContext: context, version: areaMapVersionClient(await publishVersion(req, actor, body, context)) });
    }
    if (action === "rollback") {
      authorize(actor, { permissions: ["farm.area_map.rollback"] });
      return json(res, 200, { ok: true, deploymentContext: context, version: areaMapVersionClient(await rollbackVersion(req, actor, body, context)) });
    }
    if (action === "reject") {
      authorize(actor, { permissions: ["farm.area_map.manage"] });
      return json(res, 200, { ok: true, deploymentContext: context, version: areaMapVersionClient(await rejectVersion(req, actor, body, context)) });
    }
    throw new ApiError(404, "AREA_MAP_ACTION_NOT_FOUND", "Area map action was not found");
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  AREA_MAP_BODY_LIMIT,
  decodeKmzBase64,
  reconciliationPayload,
  requestAction,
  sanitizeKmzFileName,
  versionDbPatch,
};
