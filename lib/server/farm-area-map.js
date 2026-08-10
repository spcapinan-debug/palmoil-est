class FarmAreaMapConflictError extends Error {
  constructor(message, conflicts = []) {
    super(message);
    this.name = "FarmAreaMapConflictError";
    this.code = "FARM_AREA_MAP_CONFLICT";
    this.conflicts = conflicts;
  }
}

function normalizeFarmBlockName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-");
}

function farmAreaCatalogBlocks(blocks = []) {
  return (blocks || []).filter((block) => String(block?.status || "active").toLowerCase() === "active");
}

function buildCanonicalBlockIndex(blocks = [], { throwOnConflict = true } = {}) {
  const grouped = new Map();
  const unkeyedBlocks = [];
  for (const block of blocks || []) {
    const mapKey = normalizeFarmBlockName(block?.block_name);
    if (!mapKey) {
      unkeyedBlocks.push(block);
      continue;
    }
    if (!grouped.has(mapKey)) grouped.set(mapKey, []);
    grouped.get(mapKey).push(block);
  }

  const canonicalBlockByMapKey = new Map();
  const duplicateMasterKeys = [];
  for (const [mapKey, rows] of grouped) {
    if (rows.length === 1) {
      canonicalBlockByMapKey.set(mapKey, rows[0]);
      continue;
    }
    duplicateMasterKeys.push({
      mapKey,
      blockIds: rows.map((row) => row.id).filter(Boolean),
      blockNames: rows.map((row) => row.block_name).filter(Boolean),
      count: rows.length,
    });
  }

  if (throwOnConflict && duplicateMasterKeys.length) {
    throw new FarmAreaMapConflictError("Duplicate normalized blocks.block_name map keys", duplicateMasterKeys);
  }
  return { canonicalBlockByMapKey, duplicateMasterKeys, unkeyedBlocks };
}

function geometryFingerprint(geometry) {
  return JSON.stringify(geometry || null);
}

function farmMapCoordinatePairs(value, output = []) {
  if (!Array.isArray(value)) return output;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    output.push([Number(value[0]), Number(value[1])]);
    return output;
  }
  for (const item of value) farmMapCoordinatePairs(item, output);
  return output;
}

function farmMapBounds(features = []) {
  const points = (features || []).flatMap((feature) => farmMapCoordinatePairs(feature?.geometry?.coordinates));
  if (!points.length) return [];
  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

function compareFarmAreaMapVersions({ previousFeatures = [], nextFeatures = [] } = {}) {
  const index = (features) => new Map((features || []).map((feature) => [
    normalizeFarmBlockName(feature?.properties?.name || feature?.properties?.map_key),
    feature,
  ]).filter(([key]) => key));
  const previous = index(previousFeatures);
  const next = index(nextFeatures);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  for (const [key, feature] of next) {
    if (!previous.has(key)) added.push(key);
    else if (geometryFingerprint(previous.get(key)?.geometry) === geometryFingerprint(feature?.geometry)) unchanged.push(key);
    else changed.push(key);
  }
  for (const key of previous.keys()) {
    if (!next.has(key)) removed.push(key);
  }
  return {
    geometryChanged: changed.length,
    geometryUnchanged: unchanged.length,
    newPolygons: added.length,
    removedPolygons: removed.length,
    changedKeys: changed,
    unchangedKeys: unchanged,
    newKeys: added,
    removedKeys: removed,
  };
}

function farmMapGeometryStatus(feature = {}) {
  if (feature?.properties?.geometry_conflict) return "conflict";
  if (!feature?.geometry) return "missing";
  return "valid";
}

function farmMapAuditEntry(feature = {}) {
  return {
    mapKey: feature?.properties?.map_key || "",
    placemarkName: feature?.properties?.name || "",
    sourceFiles: feature?.properties?.source_files || [feature?.properties?.source_file].filter(Boolean),
    geometryStatus: farmMapGeometryStatus(feature),
  };
}

function farmMasterAuditEntry(block = {}) {
  return {
    blockId: block.id || null,
    blockName: block.block_name || "",
    blockCode: block.block_code || "",
    apCode: block.ap_code || block.AP_code || "",
    estateId: block.estate_id || null,
    zoneId: block.zone_id || null,
    plantingYear: block.planting_year ?? null,
  };
}

function farmBlockNameStructure(value = "") {
  const key = normalizeFarmBlockName(value);
  const canonical = key.match(/^(\d{2})-([A-Z]+\d+)(-R)?$/);
  return {
    key,
    tokens: key.split("-").filter(Boolean),
    year: canonical?.[1] || "",
    blockCode: canonical?.[2] || "",
    suffix: canonical?.[3] || "",
  };
}

function buildFarmMapReconciliationCandidates(mapEntries = [], masterEntries = []) {
  return (mapEntries || []).map((mapEntry) => {
    const mapStructure = farmBlockNameStructure(mapEntry.mapKey || mapEntry.placemarkName);
    const candidates = [];
    for (const masterEntry of masterEntries || []) {
      const masterStructure = farmBlockNameStructure(masterEntry.blockName);
      const sameTokens = mapStructure.tokens.length === masterStructure.tokens.length
        && [...mapStructure.tokens].sort().join("|") === [...masterStructure.tokens].sort().join("|");
      if (sameTokens && mapStructure.key !== masterStructure.key) {
        candidates.push({
          ...masterEntry,
          reason: "same normalized tokens in a different order; source verification required",
          confidence: 0.95,
        });
        continue;
      }
      const sameBlockCodeAndSuffix = mapStructure.blockCode
        && mapStructure.blockCode === masterStructure.blockCode
        && mapStructure.suffix === masterStructure.suffix
        && mapStructure.year !== masterStructure.year;
      if (sameBlockCodeAndSuffix) {
        candidates.push({
          ...masterEntry,
          reason: "same block-code segment and suffix but different year; source verification required",
          confidence: 0.7,
        });
      }
    }
    return {
      mapKey: mapEntry.mapKey,
      placemarkName: mapEntry.placemarkName,
      candidates: candidates.sort((a, b) => b.confidence - a.confidence || String(a.blockName).localeCompare(String(b.blockName))),
    };
  });
}

function dedupeFarmMapFeatures(features = []) {
  const grouped = new Map();
  for (const [index, feature] of (features || []).entries()) {
    const placemarkName = feature?.properties?.name;
    const mapKey = normalizeFarmBlockName(placemarkName);
    const groupKey = mapKey || `__MISSING_MAP_KEY_${index}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push({ feature, index, mapKey, placemarkName: String(placemarkName || "") });
  }

  const uniqueFeatures = [];
  const geometryConflicts = [];
  const duplicateMapKeys = [];
  let duplicatePlacemarkCount = 0;
  for (const [, entries] of grouped) {
    duplicatePlacemarkCount += Math.max(entries.length - 1, 0);
    const first = entries[0];
    const sources = [...new Set(entries.map(({ feature }) => feature?.properties?.source_file).filter(Boolean))];
    const geometryFingerprints = [...new Set(entries.map(({ feature }) => geometryFingerprint(feature?.geometry)))];
    const geometryConflict = entries.length > 1 && geometryFingerprints.length > 1;
    if (entries.length > 1) {
      duplicateMapKeys.push({
        mapKey: first.mapKey,
        placemarkNames: entries.map((entry) => entry.placemarkName),
        sources,
        count: entries.length,
        geometryConflict,
      });
    }
    if (geometryConflict) {
      geometryConflicts.push({
        mapKey: first.mapKey,
        placemarkNames: entries.map((entry) => entry.placemarkName),
        sources,
        count: entries.length,
      });
    }
    uniqueFeatures.push({
      ...first.feature,
      properties: {
        ...(first.feature?.properties || {}),
        name: first.placemarkName,
        map_key: first.mapKey,
        source_files: sources,
        duplicate_count: entries.length,
        geometry_conflict: geometryConflict,
      },
      geometry: geometryConflict ? null : (first.feature?.geometry || null),
    });
  }

  return {
    rawPlacemarkCount: (features || []).length,
    uniqueBlockKeyCount: uniqueFeatures.length,
    duplicatePlacemarkCount,
    duplicateMapKeys,
    geometryConflicts,
    features: uniqueFeatures,
  };
}

function reconcileFarmAreaMap({ blocks = [], features = [] } = {}) {
  const catalogBlocks = farmAreaCatalogBlocks(blocks);
  const masterIndex = buildCanonicalBlockIndex(catalogBlocks, { throwOnConflict: false });
  const mapAudit = dedupeFarmMapFeatures(features);
  const duplicateMasterKeySet = new Set(masterIndex.duplicateMasterKeys.map((item) => item.mapKey));
  const mapKeys = new Set(mapAudit.features.map((feature) => feature?.properties?.map_key).filter(Boolean));
  const mapStatusByKey = new Map();
  let matchedMaster = 0;
  let mapWithoutMaster = 0;

  const reconciledFeatures = mapAudit.features.map((feature) => {
    const mapKey = feature?.properties?.map_key || "";
    const canonicalBlock = masterIndex.canonicalBlockByMapKey.get(mapKey) || null;
    let matchStatus = "map_without_master";
    if (feature?.properties?.geometry_conflict) matchStatus = "map_conflict";
    else if (duplicateMasterKeySet.has(mapKey)) matchStatus = "master_conflict";
    else if (canonicalBlock) matchStatus = "matched";

    if (matchStatus === "matched") matchedMaster += 1;
    if (matchStatus === "map_without_master") mapWithoutMaster += 1;
    if (mapKey) mapStatusByKey.set(mapKey, matchStatus);
    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        match_status: matchStatus,
        block_id: canonicalBlock?.id || null,
      },
    };
  });

  const reconciledCatalogBlocks = catalogBlocks
    .map((block) => {
      const mapKey = normalizeFarmBlockName(block.block_name);
      return {
        ...block,
        map_status: duplicateMasterKeySet.has(mapKey)
          ? "master_conflict"
          : (mapStatusByKey.get(mapKey) || "master_without_map"),
      };
    });
  const masterWithoutMapBlocks = catalogBlocks.filter((block) => {
    const mapKey = normalizeFarmBlockName(block.block_name);
    return mapKey && !mapKeys.has(mapKey);
  });
  const mapWithoutMasterEntries = reconciledFeatures
    .filter((feature) => feature?.properties?.match_status === "map_without_master")
    .map(farmMapAuditEntry);
  const masterWithoutMapEntries = masterWithoutMapBlocks.map(farmMasterAuditEntry);

  return {
    canonicalBlockByMapKey: masterIndex.canonicalBlockByMapKey,
    catalogBlocks: reconciledCatalogBlocks,
    map: {
      type: "FeatureCollection",
      features: reconciledFeatures,
    },
    reconciliation: {
      canonicalDbBlocks: catalogBlocks.length,
      canonicalUniqueBlockKeys: masterIndex.canonicalBlockByMapKey.size,
      rawPlacemarks: mapAudit.rawPlacemarkCount,
      uniqueBlockKeys: mapAudit.uniqueBlockKeyCount,
      matchedMaster,
      mapWithoutMaster,
      masterWithoutMap: masterWithoutMapBlocks.length,
      duplicatePlacemarks: mapAudit.duplicatePlacemarkCount,
      duplicateMapKeys: mapAudit.duplicateMapKeys,
      duplicateMasterKeys: masterIndex.duplicateMasterKeys,
      unkeyedMasterBlocks: masterIndex.unkeyedBlocks.length,
      geometryConflicts: mapAudit.geometryConflicts,
      mapConflicts: mapAudit.geometryConflicts.length + masterIndex.duplicateMasterKeys.length,
      mapWithoutMasterEntries,
      masterWithoutMapEntries,
      reconciliationCandidates: buildFarmMapReconciliationCandidates(mapWithoutMasterEntries, masterWithoutMapEntries),
    },
  };
}

module.exports = {
  FarmAreaMapConflictError,
  buildFarmMapReconciliationCandidates,
  buildCanonicalBlockIndex,
  compareFarmAreaMapVersions,
  dedupeFarmMapFeatures,
  farmAreaCatalogBlocks,
  farmMapBounds,
  farmMapCoordinatePairs,
  normalizeFarmBlockName,
  reconcileFarmAreaMap,
};
