import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "docs", "phase2i-rc-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const migrationsDir = path.join(root, "supabase", "migrations");

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const actual = fs.readdirSync(migrationsDir)
  .filter((file) => /^\d{14}_.+[.]sql$/.test(file))
  .map((file) => ({ file, version: file.slice(0, 14) }))
  .filter(({ version }) => version > manifest.production.migration_version)
  .sort((a, b) => a.version.localeCompare(b.version));

assert.deepEqual(
  actual.map(({ file }) => file),
  manifest.migration_stack.map(({ file }) => file),
  "post-Production migration stack differs from the reviewed RC manifest",
);

for (const migration of manifest.migration_stack) {
  assert.equal(
    digest(path.join(migrationsDir, migration.file)),
    migration.sha256,
    `migration digest changed: ${migration.file}`,
  );
}

const deployment = manifest.migration_deployment || {};
assert.equal(
  deployment.classification?.["2I-C2_deployment_mechanism_and_bookkeeping"],
  "PASS",
  "managed migration bookkeeping gate is not complete",
);
assert.equal(deployment.mechanism, "supabase_cli_db_push");
assert.equal(deployment.history_table, "supabase_migrations.schema_migrations");
assert.equal(deployment.release_record_count, manifest.migration_stack.length);
assert.equal(deployment.second_run_pending_count, 0);
assert.equal(deployment.deployment_replay_idempotent, true);

const bookkeepingPath = path.join(root, deployment.managed_bookkeeping_evidence || "");
assert.ok(fs.existsSync(bookkeepingPath), "managed migration bookkeeping evidence is missing");
const bookkeeping = JSON.parse(fs.readFileSync(bookkeepingPath, "utf8"));
assert.equal(bookkeeping.status, "PASS");
assert.equal(bookkeeping.execution.history_record_count, manifest.migration_stack.length);
assert.equal(bookkeeping.execution.second_run_pending_count, 0);
assert.deepEqual(
  bookkeeping.records.map(({ version, file, sha256 }) => ({ version, file, sha256 })),
  manifest.migration_stack.map(({ version, file, sha256 }) => ({ version, file, sha256 })),
  "bookkeeping version/name mapping differs from the reviewed release stack",
);

const runtimeFiles = [
  "api",
  "lib",
  "webapp",
  "vercel.json",
  ".env.example",
];
const forbiddenRef = manifest.production.project_ref;
const violations = [];

function scan(entry) {
  const fullPath = path.join(root, entry);
  if (!fs.existsSync(fullPath)) return;
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(fullPath)) {
      if (["node_modules", "dist", ".git"].includes(child)) continue;
      scan(path.join(entry, child));
    }
    return;
  }
  if (fs.readFileSync(fullPath).toString().includes(forbiddenRef)) violations.push(entry);
}

runtimeFiles.forEach(scan);
assert.deepEqual(violations, [], "Production project ref is hard-coded in runtime source");

const result = {
  phase: manifest.phase,
  release_candidate_source: manifest.release_candidate_source,
  production: {
    migration_version: manifest.production.migration_version,
    migration_count: manifest.production.migration_count,
    counts_fingerprint: manifest.production.counts_fingerprint,
  },
  staging: {
    project_ref: manifest.staging.project_ref,
    status: manifest.staging.status,
  },
  preview: manifest.preview,
  migrations: manifest.migration_stack.map(({ version, file, sha256 }) => ({ version, file, sha256 })),
  migration_deployment: manifest.migration_deployment,
  blocking_gates: manifest.blocking_gates,
  rc_status: manifest.rc_status,
};

console.log(JSON.stringify(result, null, 2));

if (process.argv.includes("--require-runtime")) {
  const runtimeGatesPassed = Object.values(manifest.runtime_gates || {}).length > 0
    && Object.values(manifest.runtime_gates).every(Boolean);
  const ready = manifest.rc_status === "passed"
    && Boolean(manifest.staging.project_ref)
    && manifest.staging.project_ref !== manifest.production.project_ref
    && manifest.preview.status === "ready"
    && manifest.preview.database_project_ref === manifest.staging.project_ref
    && manifest.blocking_gates.length === 0
    && runtimeGatesPassed;
  if (!ready) {
    console.error("Phase 2I RC gate FAILED: an isolated staging runtime and staging-bound Preview are required.");
    process.exitCode = 1;
  }
}
