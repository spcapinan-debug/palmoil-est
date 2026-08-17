const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationsDirectory = path.join(__dirname, "..", "supabase", "migrations");
const remediationFilename = "20260817152530_phase2b_budget_material_unit_conversions.sql";
const backfillFilename = "20260817152557_phase2b_budget_block_material_rates.sql";
const migration = fs.readFileSync(
  path.join(migrationsDirectory, remediationFilename),
  "utf8",
);

const packageMap = new Map([
  ["F-CM-0001", { packageKg: 25, forwardRate: 25000, reverseRate: 0.00004 }],
  ["F-CM-0004", { packageKg: 50, forwardRate: 50000, reverseRate: 0.00002 }],
  ["F-CM-0005", { packageKg: 25, forwardRate: 25000, reverseRate: 0.00004 }],
  ["F-CM-0006", { packageKg: 50, forwardRate: 50000, reverseRate: 0.00002 }],
  ["F-CM-0007", { packageKg: 50, forwardRate: 50000, reverseRate: 0.00002 }],
]);

function remediationFixture({ duplicateGram = false } = {}) {
  const bagUnit = { id: "unit-bag", unit_name: "กระสอบ", status: "active" };
  const gramUnit = { id: "unit-gram", unit_name: "กรัม", status: "active" };
  const units = [bagUnit, gramUnit];
  if (duplicateGram) {
    units.push({ id: "unit-gram-duplicate", unit_name: "กรัม", status: "active" });
  }

  const legacyCounts = new Map([
    ["F-CM-0001", 4],
    ["F-CM-0004", 3],
    ["F-CM-0005", 2],
    ["F-CM-0006", 12],
    ["F-CM-0007", 12],
  ]);
  const materials = Array.from(packageMap, ([materialCode], index) => ({
    id: `material-${index + 1}`,
    material_code: materialCode,
    base_unit_id: bagUnit.id,
    status: "active",
  }));
  const skuConversions = materials.flatMap((material) => {
    const rates = packageMap.get(material.material_code);
    const rows = [
      {
        material_id: material.id,
        from_unit_id: bagUnit.id,
        to_unit_id: gramUnit.id,
        conversion_rate: rates.forwardRate,
        status: "active",
      },
      {
        material_id: material.id,
        from_unit_id: gramUnit.id,
        to_unit_id: bagUnit.id,
        conversion_rate: rates.reverseRate,
        status: "active",
      },
    ];
    if (duplicateGram) {
      rows.push({
        material_id: material.id,
        from_unit_id: bagUnit.id,
        to_unit_id: "unit-gram-duplicate",
        conversion_rate: rates.forwardRate,
        status: "active",
      });
    }
    return rows;
  });
  const legacyRows = materials.flatMap((material) => Array.from(
    { length: legacyCounts.get(material.material_code) },
    (_, index) => ({
      id: `${material.material_code}-legacy-${index + 1}`,
      material_id: material.id,
      usage_unit: "กรัม",
    }),
  ));
  return { units, materials, skuConversions, unitConversions: [], legacyRows, gramUnit };
}

function activeGram(units) {
  const candidates = units.filter(
    (unit) => unit.status === "active" && unit.unit_name.trim().toLowerCase() === "กรัม",
  );
  if (candidates.length !== 1) {
    throw new Error(`expected one active canonical gram Unit, found ${candidates.length}`);
  }
  return candidates[0];
}

function phase2bResolution(fixture) {
  const anchorsByMaterial = new Map(
    fixture.materials.map((material) => [material.id, new Set([material.base_unit_id])]),
  );
  for (const conversion of fixture.skuConversions.filter((row) => row.status === "active")) {
    anchorsByMaterial.get(conversion.material_id)?.add(conversion.from_unit_id);
    anchorsByMaterial.get(conversion.material_id)?.add(conversion.to_unit_id);
  }

  const compatibleByMaterial = new Map();
  for (const [materialId, anchors] of anchorsByMaterial) {
    const compatible = new Set(anchors);
    for (const conversion of fixture.unitConversions.filter((row) => row.status === "active")) {
      if (anchors.has(conversion.from_unit_id) || anchors.has(conversion.to_unit_id)) {
        compatible.add(conversion.from_unit_id);
        compatible.add(conversion.to_unit_id);
      }
    }
    compatibleByMaterial.set(materialId, compatible);
  }

  const result = { safe: 0, ambiguous: 0, unmapped: 0, resolvedUnitIds: [] };
  for (const legacy of fixture.legacyRows) {
    const compatible = compatibleByMaterial.get(legacy.material_id) || new Set();
    const candidates = fixture.units.filter(
      (unit) => unit.status === "active"
        && compatible.has(unit.id)
        && unit.unit_name.trim().toLowerCase() === legacy.usage_unit.trim().toLowerCase(),
    );
    if (candidates.length === 1) {
      result.safe += 1;
      result.resolvedUnitIds.push(candidates[0].id);
    } else if (candidates.length > 1) {
      result.ambiguous += 1;
    } else {
      result.unmapped += 1;
    }
  }
  return result;
}

test("remediation migration sorts before the guarded Block Material backfill", () => {
  assert.ok(remediationFilename < backfillFilename);
  assert.equal(fs.existsSync(path.join(migrationsDirectory, remediationFilename)), true);
  assert.equal(fs.existsSync(path.join(migrationsDirectory, backfillFilename)), true);
});

test("only the five intended fertilizer codes and exact package rates are present", () => {
  const codes = new Set(migration.match(/F-CM-\d{4}/g) || []);
  const insertSection = migration.slice(
    migration.indexOf("$phase2b_unit_remediation_guard$;")
      + "$phase2b_unit_remediation_guard$;".length,
  );
  assert.deepEqual([...codes].sort(), [...packageMap.keys()].sort());
  for (const [code, rates] of packageMap) {
    const escapedReverse = String(rates.reverseRate).replace(".", "\\.");
    assert.match(
      migration,
      new RegExp(
        `\\('${code}', ${rates.packageKg}::numeric, ${rates.forwardRate}::numeric, ${escapedReverse}::numeric\\)`,
      ),
    );
    assert.match(
      insertSection,
      new RegExp(
        `\\('${code}', ${rates.forwardRate}::numeric, ${escapedReverse}::numeric\\)`,
      ),
    );
  }
  assert.match(migration, /union all[\s\S]*reverse_rate as conversion_rate/i);
});

test("canonical Material and gram resolution are guarded before insert", () => {
  const guardEnd = migration.indexOf("$phase2b_unit_remediation_guard$;");
  const insertStart = migration.indexOf("insert into public.sku_conversions");
  assert.ok(guardEnd > 0 && insertStart > guardEnd);
  assert.match(migration, /candidate_count <> 1 or active_count <> 1/i);
  assert.match(migration, /material\.base_unit_id is null/i);
  assert.match(migration, /base_unit\.status <> 'active'/i);
  assert.match(migration, /base_unit\.unit_name[\s\S]*กระสอบ/i);
  assert.match(migration, /gram_candidate_count <> 1/i);
  assert.match(migration, /unit_row\.status = 'active'[\s\S]*unit_row\.unit_name[\s\S]*กรัม/i);
  assert.match(migration, /raise exception using[\s\S]*conflicting existing SKU conversion/i);
});

test("migration is insert-only, idempotent, and touches no protected legacy data", () => {
  assert.match(migration, /insert into public\.sku_conversions/i);
  assert.match(migration, /where not exists/i);
  assert.match(migration, /on conflict \(material_id, from_unit_id, to_unit_id\) do nothing/i);
  assert.doesNotMatch(migration, /\bupdate\b/i);
  assert.doesNotMatch(migration, /\bdelete\b/i);
  assert.doesNotMatch(migration, /\bdrop\b/i);
  assert.doesNotMatch(migration, /\balter\s+table\b/i);
  assert.doesNotMatch(migration, /budget_rate_(?:blocks|materials)|budget_activity_rates/i);
  assert.doesNotMatch(migration, /work_order_materials|activity_material_usage_rates/i);
  assert.doesNotMatch(
    migration,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  );
});

test("remediated Phase 2B fixture resolves SAFE 33, AMBIGUOUS 0, UNMAPPED 0", () => {
  const fixture = remediationFixture();
  const gram = activeGram(fixture.units);
  const result = phase2bResolution(fixture);
  assert.deepEqual(
    { safe: result.safe, ambiguous: result.ambiguous, unmapped: result.unmapped },
    { safe: 33, ambiguous: 0, unmapped: 0 },
  );
  assert.equal(result.resolvedUnitIds.length, 33);
  assert.equal(result.resolvedUnitIds.every((unitId) => unitId === gram.id), true);
});

test("a duplicate active gram identity aborts and cannot be first-row guessed", () => {
  const fixture = remediationFixture({ duplicateGram: true });
  assert.throws(() => activeGram(fixture.units), /found 2/);
  const result = phase2bResolution(fixture);
  assert.equal(result.safe, 0);
  assert.equal(result.ambiguous, 33);
  assert.equal(result.unmapped, 0);
});
