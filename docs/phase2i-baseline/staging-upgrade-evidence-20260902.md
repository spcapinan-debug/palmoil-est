# Phase 2I standalone Staging baseline and upgrade evidence — 2026-09-02

## Gate status

Phase 2I remains **BLOCKED / DO NOT PROMOTE**. Gates 2I-A (Production baseline),
2I-B (baseline equivalence), and 2I-C (pending migration replay) passed. Runtime
E2E, security/idempotency, Vercel Preview binding, visual regression, and final
release gates remain pending.

No Production migration, data write, deployment, or Vercel environment change
was performed.

## Isolated environment

- Strategy: standalone Supabase Staging project
- Project name: `spc-est-rc`
- Staging ref: `bertkuucbcegsvvvatyy`
- Production ref: `xhtwmzlorceebsemqkww`
- Region: `ap-northeast-1`
- PostgreSQL: `17.6.1.166` (engine 17)
- Created: `2026-09-01T12:15:56.9513Z`
- Status after replay: `ACTIVE_HEALTHY`

Every Staging write path used a fail-closed target check requiring the Staging
ref and rejecting the Production ref.

## Production schema-only baseline

- Artifact: `docs/phase2i-baseline/production-schema-20260820090323.sql`
- Size: 1,124,245 bytes
- SHA-256: `ee1a723813d16b2b75bfe0e36777110b322e979c134c19c8ed8396eb4f1b6e8b`
- Production migration head: `20260820090323`
- Production migration count: 69
- Data statements: `COPY=0`, `INSERT=0`
- Secret scan: PASS; no JWT/key shape, credentialed connection string, URL, or token value

The snapshot contains application-owned `public` objects only. Supabase-managed
`auth`, `storage`, `realtime`, GraphQL, Vault, and internal schemas were not
dumped or recreated. The existing Staging platform `auth.users` relation satisfies
the single application FK from `public.profiles`. `btree_gist` was prepared in
the Staging `extensions` schema because the application baseline contains a GiST
exclusion constraint over UUID columns. Platform-owned `supabase_admin` default
ACL statements were excluded from the restore stream; application objects,
postgres-owned defaults, policies, grants, and revokes were replayed.

## Deterministic catalog equivalence

The fingerprint uses sorted canonical records for relations/RLS state, columns,
constraints, indexes, function signatures and definitions, triggers, policies,
enums, and application grants. OIDs, timestamps, row data, and platform schemas
are excluded.

- Production: `f8fc5e5633f1baf79bed3dc3dc344e2b` / 11,626 records
- Staging before pending migrations: `f8fc5e5633f1baf79bed3dc3dc344e2b` / 11,626 records
- `APPLICATION_SCHEMA_EQUIVALENT`: PASS
- All 10 component fingerprints and counts matched.

## Synthetic pre-upgrade compatibility fixture

- File: `docs/phase2i-baseline/pre-upgrade-compatibility-fixture.sql`
- SHA-256: `98116ccffe971b2cdb4bae4e20860968193f58ef2dbbd6e97f26f6874bd45a84`
- Status: PASS
- Assertions retained after every migration: 16/16

The fixture contains only deterministic synthetic values and covers Estate,
Block, Activity, Budget Rate, Budget Rate Block, Annual Plan, Planned Work Item,
legacy Work Order, legacy Work Result and worker, inventory balance, Survey
response/finding, Payroll period/summary/earning, Employee, Material/Unit,
Warehouse, and Vehicle. It contains no Production identity, Production UUID,
employee name, payroll record, or business transaction.

## Exact pending migration replay

Every file SHA-256 matched `docs/phase2i-rc-manifest.json` before execution.
Transactions and file ordering were unchanged.

| Migration | Elapsed | Fixture | Tables | Views | Result |
|---|---:|---:|---:|---:|---|
| `20260830135944_phase2c2_full_resource_snapshot.sql` | 3,052 ms | 16 | 163 | 67 | PASS |
| `20260830144232_phase2c2_1_full_resource_snapshot_hardening.sql` | 7,748 ms | 16 | 166 | 68 | PASS |
| `20260830232530_phase2d_scheduler_work_order_snapshot.sql` | 8,351 ms | 16 | 169 | 69 | PASS |
| `20260831034621_phase2e_daily_result_survey_integration.sql` | 7,850 ms | 16 | 169 | 72 | PASS |
| `20260831063205_phase2f_actual_variance.sql` | 5,084 ms | 16 | 169 | 78 | PASS |
| `20260831222521_phase2g_payroll_contractor.sql` | 10,017 ms | 16 | 170 | 82 | PASS |
| `20260901061931_phase2h_performance_analytics.sql` | 2,703 ms | 16 | 170 | 88 | PASS |

The RC validates the upgrade from the exact current Production schema state. It
does not reconstruct the unavailable bodies of 69 historical migrations. The
Staging migration-history table intentionally remains empty; the baseline and
seven exact migration files are tracked by their manifests and replay evidence.

## Post-migration schema health

- Tables: 170
- Views/materialized views: 88; all compiled with `LIMIT 0`
- Functions: 151; representative Phase 2E/2F/2G/2H calls passed
- Application triggers: 96
- Expected Phase 2C.2–2H relations/views/functions: PASS
- RLS enabled on all new canonical snapshot tables: PASS
- Fixture rows after replay: 16/16
- Unvalidated checks: 22, with zero violating rows

The `NOT VALID` constraints are intentional in the reviewed migration files for
historical-row compatibility. They were evaluated read-only against all Staging
rows and had zero violations; their catalog state was not changed.

Supabase advisors were run after DDL. Security reported 84 informational
`rls_enabled_no_policy` findings and 43 mutable-search-path warnings inherited
from the baseline. The new canonical snapshot tables are among the RLS/no-policy
findings, which is the expected default-deny direct table path; writes use the
reviewed service action functions. The only phase-prefix-filtered mutable-path
warnings were two pre-existing Budget preparation/sync functions. Performance
advisors reported informational unindexed-FK/unused-index findings and existing
policy optimization warnings; no migration replay failure or invalid object was
reported. Advisor reference: https://supabase.com/docs/guides/database/database-linter

## Production read-only after-check

- Migration count: 69 (unchanged)
- Migration head: `20260820090323` (unchanged)
- Application fingerprint: `f8fc5e5633f1baf79bed3dc3dc344e2b` (unchanged)
- All 29 recorded domain/table counts match the pre-run manifest exactly.
- Recorded counts fingerprint remains `72978762e921e91f795d27db765d53f6`.

## Remaining blockers before Preview

- Staging E2E scenarios 1–6 and frozen-lineage reconciliation
- Roles/security matrix and idempotency gate
- Preview-scoped environment binding to `bertkuucbcegsvvvatyy`
- Preview redeploy, Playwright six-viewport matrix, and visual regression
- Final Release runbook/gate

Vercel Preview and Production environments were not changed in this stage.
