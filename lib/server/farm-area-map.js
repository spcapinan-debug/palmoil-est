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
  let duplicatePlacemarkCount = 0;
  for (const [, entries] of grouped) {
    duplicatePlacemarkCount += Math.max(entries.length - 1, 0);
    const first = entries[0];
    const sources = [...new Set(entries.map(({ feature }) => feature?.properties?.source_file).filter(Boolean))];
    const geometryFingerprints = [...new Set(entries.map(({ feature }) => geometryFingerprint(feature?.geometry)))];
    const geometryConflict = entries.length > 1 && geometryFingerprints.length > 1;
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
    geometryConflicts,
    features: uniqueFeatures,
  };
}

function reconcileFarmAreaMap({ blocks = [], features = [], canAccessBlock = () => false } = {}) {
  const masterIndex = buildCanonicalBlockIndex(blocks, { throwOnConflict: false });
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
    const inScope = Boolean(canonicalBlock && canAccessBlock(canonicalBlock));
    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        match_status: matchStatus,
        block_id: canonicalBlock?.id || null,
        in_scope: inScope,
      },
    };
  });

  const visibleBlocks = blocks
    .filter((block) => canAccessBlock(block))
    .map((block) => {
      const mapKey = normalizeFarmBlockName(block.block_name);
      return {
        ...block,
        map_status: duplicateMasterKeySet.has(mapKey)
          ? "master_conflict"
          : (mapStatusByKey.get(mapKey) || "master_without_map"),
      };
    });
  const masterWithoutMap = blocks.filter((block) => {
    const mapKey = normalizeFarmBlockName(block.block_name);
    return mapKey && !mapKeys.has(mapKey);
  }).length;

  return {
    canonicalBlockByMapKey: masterIndex.canonicalBlockByMapKey,
    visibleBlocks,
    map: {
      type: "FeatureCollection",
      features: reconciledFeatures,
    },
    reconciliation: {
      canonicalDbBlocks: blocks.length,
      canonicalUniqueBlockKeys: masterIndex.canonicalBlockByMapKey.size,
      rawPlacemarks: mapAudit.rawPlacemarkCount,
      uniqueBlockKeys: mapAudit.uniqueBlockKeyCount,
      matchedMaster,
      mapWithoutMaster,
      masterWithoutMap,
      duplicatePlacemarks: mapAudit.duplicatePlacemarkCount,
      duplicateMasterKeys: masterIndex.duplicateMasterKeys,
      unkeyedMasterBlocks: masterIndex.unkeyedBlocks.length,
      geometryConflicts: mapAudit.geometryConflicts,
      mapConflicts: mapAudit.geometryConflicts.length + masterIndex.duplicateMasterKeys.length,
    },
  };
}

module.exports = {
  FarmAreaMapConflictError,
  buildCanonicalBlockIndex,
  dedupeFarmMapFeatures,
  normalizeFarmBlockName,
  reconcileFarmAreaMap,
};
