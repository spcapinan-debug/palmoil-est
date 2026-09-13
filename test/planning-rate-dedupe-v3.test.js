const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

const appSource = fs.readFileSync(
  path.join(root, "webapp", "app.js"),
  "utf8",
);

function logicalRateHarness() {
  const start = appSource.indexOf(
    "function farmPlanLogicalRateKey"
  );

  const end = appSource.indexOf(
    "function farmPlanBudgetRateOptionLabel",
    start,
  );

  assert.ok(
    start >= 0 && end > start,
    "V3 logical Rate helpers must remain inspectable",
  );

  const sandbox = {
    farmNormalizeKey(value) {
      return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    },

    farmBudgetRateUnitLabel(value) {
      return String(value ?? "").trim();
    },

    farmBudgetRateIds(row = {}) {
      return new Set([
        row.id,
        row._overrideOf,
        row.databaseId,
        ...(Array.isArray(row._budgetGroupIds)
          ? row._budgetGroupIds
          : []),
      ].filter(Boolean).map(String));
    },

    farmRateMatchesActivity(rate, activity) {
      return String(rate?.activity_id || "")
        === String(activity?.id || "");
    },

    farmRateMatchesBlock(rate, block) {
      return Array.isArray(rate?.blocks)
        && rate.blocks.includes(block?.id);
    },

    farmBudgetMaterialUsageRows(rate, blocks) {
      return [{
        rateId: rate.id,
        blockIds: blocks.map((row) => row.id),
      }];
    },
  };

  vm.runInNewContext(
    `${appSource.slice(start, end)}
result = {
  farmPlanLogicalRateKey,
  farmPlanLogicalRateGroups,
  farmPlanLogicalRateGroupForId,
  farmPlanLogicalRateMemberForBlock,
  farmPlanResolveLogicalRateForBlock,
  farmPlanLogicalRateMaterialUsageRows,
};`,
    sandbox,
  );

  return sandbox.result;
}

const activity = {
  id: "A-FERT",
};

const block1 = {
  id: "B-01",
};

const block2 = {
  id: "B-02",
};

const block3 = {
  id: "B-03",
};

const rate1 = {
  id: "R-001",
  activity_id: "A-FERT",
  rate_amount: "19.50",
  unit_name: "ไร่",
  blocks: ["B-01"],
};

const rate2 = {
  id: "R-002",
  activity_id: "A-FERT",
  rate_amount: 19.5,
  unit_name: "ไร่",
  blocks: ["B-02"],
};

const differentRate = {
  id: "R-003",
  activity_id: "A-FERT",
  rate_amount: 20,
  unit_name: "ไร่",
  blocks: ["B-02", "B-03"],
};

test(
  "same Activity + Rate + UOM becomes one logical Rate",
  () => {
    const api = logicalRateHarness();

    const groups =
      api.farmPlanLogicalRateGroups([
        rate1,
        rate2,
        differentRate,
      ]);

    assert.equal(groups.length, 2);

    const group = groups.find(
      (row) =>
        row.members.some(
          (rate) => rate.id === "R-001"
        )
    );

    assert.ok(group);
    assert.equal(group.members.length, 2);
  },
);

test(
  "preferred source Rate stays representative",
  () => {
    const api = logicalRateHarness();

    const groups =
      api.farmPlanLogicalRateGroups(
        [rate1, rate2],
        "R-002",
      );

    assert.equal(
      groups[0].representative.id,
      "R-002",
    );
  },
);

test(
  "selected logical Rate resolves source member matching each Block",
  () => {
    const api = logicalRateHarness();

    assert.equal(
      api.farmPlanResolveLogicalRateForBlock(
        [rate1, rate2, differentRate],
        "R-001",
        activity,
        block1,
      ).id,
      "R-001",
    );

    assert.equal(
      api.farmPlanResolveLogicalRateForBlock(
        [rate1, rate2, differentRate],
        "R-001",
        activity,
        block2,
      ).id,
      "R-002",
    );
  },
);

test(
  "selected logical Rate cannot fall through to another Rate value",
  () => {
    const api = logicalRateHarness();

    assert.equal(
      api.farmPlanResolveLogicalRateForBlock(
        [rate1, rate2, differentRate],
        "R-001",
        activity,
        block3,
      ),
      null,
    );
  },
);

test(
  "material preview preserves per-Block source Rate lineage",
  () => {
    const api = logicalRateHarness();

    const group =
      api.farmPlanLogicalRateGroups(
        [rate1, rate2],
        "R-001",
      )[0];

    const rows =
      api.farmPlanLogicalRateMaterialUsageRows(
        group,
        [block1, block2],
        activity,
      );

    assert.deepEqual(
      Array.from(
        rows,
        (row) => row.rateId,
      ),
      ["R-001", "R-002"],
    );
  },
);

test(
  "Planning no longer auto-selects first row when multiple logical Rates exist",
  () => {
    assert.match(
      appSource,
      /FARM_RATE_DEDUPE_AUTOSELECT_V3/,
    );

    assert.doesNotMatch(
      appSource,
      /const autoBudgetRate\s*=\s*planBudgetRates\[0\]/,
    );

    assert.match(
      appSource,
      /<option value="" selected>เลือก Rate<\/option>/,
    );

    const resolverCalls =
      appSource.match(
        /farmPlanResolveLogicalRateForBlock\(/g
      ) || [];

    assert.ok(
      resolverCalls.length >= 3,
      "resolver must exist and be used in Create/Edit",
    );
  },
);