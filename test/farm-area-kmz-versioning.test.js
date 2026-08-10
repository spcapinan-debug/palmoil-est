const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260810061501_area_kmz_map_versioning.sql"), "utf8");
const grantHardeningMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260810064408_area_kmz_map_grants_hardening.sql"), "utf8");
const actorIndexMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260810065039_area_map_actor_fk_indexes.sql"), "utf8");
const endpointSource = fs.readFileSync(path.join(root, "api", "farm-area-map.js"), "utf8");
const masterSource = fs.readFileSync(path.join(root, "api", "farm-area-master.js"), "utf8");
const storeSource = fs.readFileSync(path.join(root, "lib", "server", "farm-area-map-store.js"), "utf8");
const { parseFarmAreaKmz } = require("../lib/server/farm-area-kmz");
const { compareFarmAreaMapVersions, reconcileFarmAreaMap } = require("../lib/server/farm-area-map");
const { areaMapDeploymentContext } = require("../lib/server/farm-area-map-store");
const { decodeKmzBase64, reconciliationPayload, sanitizeKmzFileName } = require("../api/farm-area-map")._test;
const { authorize } = require("../lib/server/farm-api");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content || "", "utf8");
    const compressed = zlib.deflateRawSync(content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, name, compressed);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function kml(placemarks = [{ name: "30-B14", coordinates: "100,8 101,8 101,9 100,8" }]) {
  return `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks.map((item) => `<Placemark><name>${item.name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${item.coordinates}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`).join("")}</Document></kml>`;
}

test("valid KMZ is parsed server-side into bounded polygon GeoJSON", async () => {
  const parsed = await parseFarmAreaKmz(zip([{ name: "doc.kml", content: kml() }]));
  assert.equal(parsed.features.length, 1);
  assert.equal(parsed.features[0].properties.name, "30-B14");
  assert.deepEqual(parsed.bounds, [100, 8, 101, 9]);
});

test("malformed KMZ and wrong file type are rejected", async () => {
  await assert.rejects(parseFarmAreaKmz(Buffer.from("not a zip")), { code: "KMZ_INVALID_SIGNATURE" });
  await assert.rejects(parseFarmAreaKmz(zip([{ name: "doc.kml", content: "<kml><Placemark>" }])), { code: "KML_MALFORMED_XML" });
  assert.throws(() => sanitizeKmzFileName("map.zip"), { code: "UNSUPPORTED_FILE_TYPE" });
  assert.throws(() => decodeKmzBase64("not-base64"), { code: "INVALID_FILE_BODY" });
});

test("KMZ without KML and ZIP path traversal are rejected", async () => {
  await assert.rejects(parseFarmAreaKmz(zip([{ name: "image.png", content: "png" }])), { code: "KMZ_KML_MISSING" });
  await assert.rejects(parseFarmAreaKmz(zip([{ name: "../doc.kml", content: kml() }])), (error) => ["KMZ_MALFORMED", "KMZ_UNSAFE_PATH"].includes(error.code));
});

test("zip bomb limits reject oversized uncompressed archives before publication", async () => {
  const huge = `<!--${"x".repeat(12 * 1024 * 1024 + 1)}-->${kml()}`;
  await assert.rejects(parseFarmAreaKmz(zip([{ name: "doc.kml", content: huge }])), (error) => ["KMZ_UNCOMPRESSED_TOO_LARGE", "KMZ_COMPRESSION_RATIO"].includes(error.code));
});

test("DTD, entities, remote NetworkLink, and unexpected executable content are rejected", async () => {
  await assert.rejects(parseFarmAreaKmz(zip([{ name: "doc.kml", content: `<!DOCTYPE x [<!ENTITY e "boom">]>${kml()}` }])), { code: "KML_DTD_REJECTED" });
  await assert.rejects(parseFarmAreaKmz(zip([{ name: "doc.kml", content: "<kml><NetworkLink><Link><href>https://example.com/map.kml</href></Link></NetworkLink></kml>" }])), { code: "KML_REMOTE_LINK_REJECTED" });
  await assert.rejects(parseFarmAreaKmz(zip([{ name: "doc.kml", content: kml() }, { name: "run.exe", content: "x" }])), { code: "KMZ_UNEXPECTED_CONTENT" });
});

test("remote IconStyle metadata is inert while Polygon and Point counts remain auditable", async () => {
  const styled = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Style id="pin"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon></IconStyle></Style>
    <Placemark><name>30-B14</name><Polygon><outerBoundaryIs><LinearRing><coordinates>100,8 101,8 101,9 100,8</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    <Placemark><name>reference point</name><styleUrl>#pin</styleUrl><Point><coordinates>100,8</coordinates></Point></Placemark>
  </Document></kml>`;
  const parsed = await parseFarmAreaKmz(zip([{ name: "doc.kml", content: styled }]));
  assert.equal(parsed.features.length, 1);
  assert.equal(parsed.source.placemarkCount, 2);
  assert.equal(parsed.source.polygonPlacemarkCount, 1);
  assert.equal(parsed.source.pointPlacemarkCount, 1);
  assert.equal(parsed.source.otherPlacemarkCount, 0);
});

test("exact canonical reconciliation keeps blocks.id and reports unmatched/master gaps", async () => {
  const parsed = await parseFarmAreaKmz(zip([{ name: "doc.kml", content: kml([
    { name: "30-B14", coordinates: "100,8 101,8 101,9 100,8" },
    { name: "99-X01", coordinates: "102,8 103,8 103,9 102,8" },
  ]) }]));
  const blocks = [{ id: "canonical-b14", block_name: "30-B14", status: "active" }, { id: "canonical-a01", block_name: "56-A01", status: "active" }];
  const result = reconcileFarmAreaMap({ blocks, features: parsed.features });
  assert.equal(result.reconciliation.matchedMaster, 1);
  assert.equal(result.reconciliation.mapWithoutMaster, 1);
  assert.equal(result.reconciliation.masterWithoutMap, 1);
  assert.equal(result.map.features[0].properties.block_id, "canonical-b14");
  assert.deepEqual(blocks.map((block) => block.id), ["canonical-b14", "canonical-a01"]);
});

test("disjoint duplicate Placemark parts merge without blocking validation", async () => {
  const parsed = await parseFarmAreaKmz(zip([{ name: "doc.kml", content: kml([
    { name: "30-B14", coordinates: "100,8 101,8 101,9 100,8" },
    { name: "30-B14", coordinates: "102,8 103,8 103,9 102,8" },
  ]) }]));
  const payload = reconciliationPayload({ parsed, blocks: [{ id: "b", block_name: "30-B14", status: "active" }] });
  assert.equal(payload.reconciliation.duplicatePlacemarks, 1);
  assert.equal(payload.reconciliation.mapConflicts, 0);
  assert.equal(payload.reconciliation.multipartBlocks, 1);
  assert.equal(payload.artifact.features[0].geometry.type, "MultiPolygon");
  assert.equal(payload.validationErrors.length, 0);
});

test("overlapping duplicate Placemark geometry blocks validation", async () => {
  const parsed = await parseFarmAreaKmz(zip([{ name: "doc.kml", content: kml([
    { name: "30-B14", coordinates: "100,8 104,8 104,12 100,12 100,8" },
    { name: "30-B14", coordinates: "101,9 102,9 102,10 101,9" },
  ]) }]));
  const payload = reconciliationPayload({ parsed, blocks: [{ id: "b", block_name: "30-B14", status: "active" }] });
  assert.equal(payload.reconciliation.duplicatePlacemarks, 1);
  assert.equal(payload.reconciliation.unresolvedDuplicates, 1);
  assert.equal(payload.reconciliation.mapConflicts, 1);
  assert.ok(payload.validationErrors.some((item) => item.code === "DUPLICATE_PLACEMARK"));
  assert.ok(payload.validationErrors.some((item) => item.code === "GEOMETRY_CONFLICT"));
});

test("preview comparison derives changed, unchanged, new, and removed polygons", () => {
  const feature = (name, x) => ({ type: "Feature", properties: { name }, geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 0]]] } });
  const comparison = compareFarmAreaMapVersions({
    previousFeatures: [feature("A", 0), feature("B", 2), feature("REMOVED", 4)],
    nextFeatures: [feature("A", 0), feature("B", 3), feature("NEW", 6)],
  });
  assert.equal(comparison.geometryUnchanged, 1);
  assert.equal(comparison.geometryChanged, 1);
  assert.equal(comparison.newPolygons, 1);
  assert.equal(comparison.removedPolygons, 1);
});

test("preview upload never publishes and publish gate is database-atomic", () => {
  assert.match(endpointSource, /status:\s*"draft"/);
  assert.doesNotMatch(endpointSource.slice(endpointSource.indexOf("async function createDraft"), endpointSource.indexOf("async function validateDraft")), /publish_area_map_version/);
  assert.match(migration, /ux_area_map_versions_one_published_context[\s\S]*where status = 'published'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /target\.status <> 'validated'/);
  assert.match(migration, /update public\.area_map_versions[\s\S]*status = 'archived'[\s\S]*status = 'published'/);
});

test("rollback creates a new immutable version that references the source", () => {
  const rollback = migration.slice(migration.indexOf("function public.rollback_area_map_version"));
  assert.match(rollback, /insert into public\.area_map_versions/);
  assert.match(rollback, /source\.id/);
  assert.match(rollback, /'rollbackOfVersionId'/);
  assert.doesNotMatch(rollback, /delete from public\.area_map_versions/);
});

test("failed publish rolls back prior active state and cache reads are no-store", () => {
  assert.match(migration, /or jsonb_array_length\(target\.validation_errors\) > 0/);
  assert.match(migration, /or target\.duplicate_count > 0/);
  assert.match(migration, /or target\.conflict_count > 0/);
  assert.match(fs.readFileSync(path.join(root, "lib", "server", "farm-api.js"), "utf8"), /"Cache-Control", "no-store"/);
});

test("permissions and private Storage prevent browser table writes", () => {
  for (const permission of ["farm.area_map.manage", "farm.area_map.publish", "farm.area_map.rollback"]) {
    assert.match(migration, new RegExp(permission.replaceAll(".", "\\.")));
    assert.match(endpointSource, new RegExp(`permissions: \\["${permission.replaceAll(".", "\\.")}\"\\]`));
  }
  assert.match(migration, /'area-map-files'[\s\S]*false/);
  assert.match(migration, /revoke all on table public\.area_map_versions from anon, authenticated/);
  assert.match(grantHardeningMigration, /revoke all on table public\.area_map_versions from service_role/);
  assert.match(grantHardeningMigration, /grant select, insert, update on table public\.area_map_versions to service_role/);
  assert.doesNotMatch(grantHardeningMigration, /grant[^;]*(?:delete|truncate)[^;]*to service_role/);
  assert.match(actorIndexMigration, /area_map_versions_uploaded_by_profile_idx[\s\S]*uploaded_by_profile_id/);
  assert.match(actorIndexMigration, /area_map_versions_published_by_profile_idx[\s\S]*published_by_profile_id/);
  assert.doesNotMatch(migration, /create policy[\s\S]*area-map-files/);
  assert.match(storeSource, /SUPABASE_SERVICE_ROLE_KEY|config\(\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("unauthorized upload and publish authorization returns 403", () => {
  const viewer = { roles: new Set(["viewer"]), permissions: new Set(["farm.dashboard.view"]) };
  assert.throws(() => authorize(viewer, { permissions: ["farm.area_map.manage"] }), (error) => error.status === 403 && error.code === "FORBIDDEN");
  assert.throws(() => authorize(viewer, { permissions: ["farm.area_map.publish"] }), (error) => error.status === 403 && error.code === "FORBIDDEN");
  assert.doesNotThrow(() => authorize({ roles: new Set(["manager"]), permissions: new Set(["farm.area_map.manage"]) }, { permissions: ["farm.area_map.manage"] }));
});

test("Preview and Production publication contexts are isolated and server-derived", () => {
  assert.equal(areaMapDeploymentContext({ VERCEL_ENV: "production" }), "production");
  assert.equal(areaMapDeploymentContext({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/Test Branch" }), "preview:codex/test-branch");
  assert.match(endpointSource, /const context = areaMapDeploymentContext\(\)/);
  assert.doesNotMatch(endpointSource, /body\.deployment_context/);
  assert.match(migration, /deployment_context/);
});

test("active map uses published Storage artifact with static bootstrap only when none exists", () => {
  assert.match(storeSource, /status=eq\.published/);
  assert.match(storeSource, /if \(!version\) return \{ artifact: readStaticAreaMapArtifact\(\)/);
  assert.match(storeSource, /throw new ApiError\(503, "AREA_MAP_UNAVAILABLE"/);
  assert.match(masterSource, /mapVersion: areaMapVersionClient/);
});

test("map processing remains outside login and canonical Block mutation paths", () => {
  const authSource = fs.readFileSync(path.join(root, "api", "farm-auth.js"), "utf8");
  assert.doesNotMatch(authSource, /farm-area-map|parseFarmAreaKmz|area_map_versions/);
  assert.doesNotMatch(endpointSource, /rest\("blocks"\s*,\s*\{\s*method:\s*"(?:POST|PATCH|DELETE)"/);
  assert.doesNotMatch(endpointSource, /block_name\s*:/);
});
