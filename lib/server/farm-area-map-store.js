const fs = require("node:fs");
const path = require("node:path");
const { ApiError, config, rest } = require("./farm-api");

const AREA_MAP_BUCKET = "area-map-files";

function areaMapDeploymentContext(env = process.env) {
  const explicit = String(env.AREA_MAP_CONTEXT || "").trim();
  const raw = explicit || (env.VERCEL_ENV === "production"
    ? "production"
    : env.VERCEL_ENV === "preview"
      ? `preview:${env.VERCEL_GIT_COMMIT_REF || String(env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || "uat"}`
      : "local");
  const safe = raw.toLowerCase().replace(/[^a-z0-9:._/-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
  if (!safe || safe.startsWith("/") || safe.includes("..")) throw new ApiError(500, "AREA_MAP_CONTEXT_INVALID", "Area map deployment context is invalid");
  return safe;
}

function encodeStoragePath(objectPath) {
  const value = String(objectPath || "");
  if (!value || value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) {
    throw new ApiError(500, "STORAGE_PATH_INVALID", "Area map storage path is invalid");
  }
  return value.split("/").map(encodeURIComponent).join("/");
}

async function areaMapStorageRequest(objectPath, options = {}) {
  const { url, serviceKey } = config();
  const response = await fetch(`${url}/storage/v1/object/${AREA_MAP_BUCKET}/${encodeStoragePath(objectPath)}`, {
    method: options.method || "GET",
    body: options.body,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.contentType ? { "Content-Type": options.contentType } : {}),
      ...(options.upsert ? { "x-upsert": "true" } : {}),
    },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new ApiError(response.status >= 500 ? 502 : response.status, "AREA_MAP_STORAGE_ERROR", "Private Area map storage request failed", {
      storageStatus: response.status,
      storageCode: detail?.error || detail?.statusCode || null,
    });
  }
  return response;
}

async function uploadAreaMapObject(objectPath, buffer, contentType, { upsert = false } = {}) {
  const response = await areaMapStorageRequest(objectPath, {
    method: "POST",
    body: buffer,
    contentType,
    upsert,
  });
  return response.json().catch(() => ({}));
}

async function downloadAreaMapObject(objectPath) {
  const response = await areaMapStorageRequest(objectPath);
  return Buffer.from(await response.arrayBuffer());
}

function readStaticAreaMapArtifact() {
  const filePath = path.join(process.cwd(), "webapp", "data", "block_map.json");
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    type: payload.type || "FeatureCollection",
    source: { ...(payload.source || {}), mode: "bootstrap" },
    bounds: Array.isArray(payload.bounds) ? payload.bounds : [],
    features: Array.isArray(payload.features) ? payload.features : [],
  };
}

function areaMapVersionClient(row = null) {
  if (!row) {
    return {
      id: null,
      versionNo: 0,
      status: "bootstrap",
      originalFileName: "block_map.json",
      publishedAt: null,
      deploymentContext: areaMapDeploymentContext(),
    };
  }
  return {
    id: row.id,
    versionNo: Number(row.version_no),
    status: row.status,
    sourceVersionId: row.source_version_id || null,
    originalFileName: row.original_file_name,
    sha256: row.sha256,
    fileSizeBytes: Number(row.file_size_bytes || 0),
    featureCount: Number(row.feature_count || 0),
    matchedCount: Number(row.matched_count || 0),
    unmatchedCount: Number(row.unmatched_count || 0),
    masterWithoutMapCount: Number(row.master_without_map_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    conflictCount: Number(row.conflict_count || 0),
    bounds: row.bounds || [],
    sourceMetadata: row.source_metadata || {},
    reconciliationSummary: row.reconciliation_summary || {},
    validationErrors: row.validation_errors || [],
    unmatchedAcknowledged: Boolean(row.unmatched_acknowledged),
    uploadedByProfileId: row.uploaded_by_profile_id || null,
    publishedByProfileId: row.published_by_profile_id || null,
    createdAt: row.created_at || null,
    publishedAt: row.published_at || null,
    archivedAt: row.archived_at || null,
    deploymentContext: row.deployment_context,
  };
}

async function activeAreaMapVersion(context = areaMapDeploymentContext()) {
  const query = `area_map_versions?deployment_context=eq.${encodeURIComponent(context)}&status=eq.published&select=*&order=version_no.desc&limit=1`;
  const { data } = await rest(query);
  return Array.isArray(data) ? data[0] || null : null;
}

async function loadActiveAreaMapArtifact(context = areaMapDeploymentContext()) {
  const version = await activeAreaMapVersion(context);
  if (!version) return { artifact: readStaticAreaMapArtifact(), version: null, sourceMode: "bootstrap" };
  if (!version.processed_storage_path) throw new ApiError(503, "AREA_MAP_UNAVAILABLE", "Published Area map artifact is unavailable", { version });
  try {
    const buffer = await downloadAreaMapObject(version.processed_storage_path);
    const artifact = JSON.parse(buffer.toString("utf8"));
    if (!Array.isArray(artifact.features) || !Array.isArray(artifact.bounds)) throw new Error("invalid artifact");
    return {
      artifact: {
        type: artifact.type || "FeatureCollection",
        source: { ...(artifact.source || {}), mode: "published" },
        bounds: artifact.bounds,
        features: artifact.features,
      },
      version,
      sourceMode: "published",
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "AREA_MAP_STORAGE_ERROR") {
      throw new ApiError(503, "AREA_MAP_UNAVAILABLE", "Published Area map artifact is temporarily unavailable", { version });
    }
    throw new ApiError(503, "AREA_MAP_UNAVAILABLE", "Published Area map artifact is invalid or unavailable", { version });
  }
}

module.exports = {
  AREA_MAP_BUCKET,
  activeAreaMapVersion,
  areaMapDeploymentContext,
  areaMapStorageRequest,
  areaMapVersionClient,
  downloadAreaMapObject,
  encodeStoragePath,
  loadActiveAreaMapArtifact,
  readStaticAreaMapArtifact,
  uploadAreaMapObject,
};
