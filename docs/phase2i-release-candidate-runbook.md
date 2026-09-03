# Phase 2I release candidate runbook

This runbook validates the Phase 2C.2–2H stack in a standalone isolated Supabase Staging project and a Vercel Preview. It does not authorize a Production database migration, a Production deployment, or a merge of `main`, PR #1, or PR #2.

Current gate state is recorded in `docs/phase2i-rc-manifest.json`. The gate must remain failed while the staging project ref or the staging-bound Preview is absent.

## A. Pre-deploy checks

1. Confirm Git HEAD descends directly from `7521cfca5fe5d90028a4ea8da2c3309a16949875` on `codex/phase2i-integration-release-candidate`.
2. Confirm `git status --short` is empty and no Phase 2I business migration exists.
3. Run `node scripts/phase2i-rc-preflight.mjs`. This verifies migration filenames, order, SHA-256 digests, and absence of a hard-coded Production ref in runtime source.
4. Use the standalone Staging project `bertkuucbcegsvvvatyy`. Do not copy Production data. Record only the project ref; never record credentials or keys.
5. Confirm the Staging project is healthy and isolated. Its ref must differ from `xhtwmzlorceebsemqkww`.
6. Update the RC manifest with the staging ref. Keep secrets in the hosting provider's encrypted environment store only.
7. Production DB must remain read-only throughout Phase 2I.

Stop immediately if the standalone Staging project is unavailable, the staging ref equals Production, a migration digest differs, or any Production count changes.

## B. Backup and read-only evidence

Before any staging action:

1. Record Production PostgreSQL version, latest `supabase_migrations.schema_migrations.version`, and migration count.
2. Record exact counts for Planning, Work Order, Result, Survey, Payroll, Inventory, Vehicle, and Budget tables.
3. Serialize the ordered count map and record its MD5 fingerprint.
4. Confirm Phase 2C.2–2H objects are absent from Production before release.
5. Confirm the platform's normal Production backup/PITR posture. Do not initiate a restore or mutate Production during RC.

Repeat the same read-only count query after RC. Before/after counts and fingerprint must match exactly.

## C. Migration order

Production currently ends at `20260820090323` with 69 recorded migrations. The RC migration gate has two distinct parts:

- **2I-C1 SQL compatibility replay:** restore the verified Production schema-only snapshot, create the synthetic compatibility fixture, and execute the exact SQL to prove schema/data compatibility. This evidence does not satisfy deployment bookkeeping by itself.
- **2I-C2 managed deployment:** rebuild Staging from the same verified snapshot, recreate the fixture, and apply the seven exact files through Supabase managed `db push`, which must create durable `supabase_migrations.schema_migrations` records.

Apply every pending migration to Staging in this exact order, with no SQL extraction or cherry-picking:

1. `20260830135944_phase2c2_full_resource_snapshot.sql`
2. `20260830144232_phase2c2_1_full_resource_snapshot_hardening.sql`
3. `20260830232530_phase2d_scheduler_work_order_snapshot.sql`
4. `20260831034621_phase2e_daily_result_survey_integration.sql`
5. `20260831063205_phase2f_actual_variance.sql`
6. `20260831222521_phase2g_payroll_contractor.sql`
7. `20260901061931_phase2h_performance_analytics.sql`

Use the complete checked-in files. Verify applied migration versions and digests against the manifest. A missing dependency, duplicate object error, hidden replay conflict, signature mismatch, missing migration-history table, or missing bookkeeping record fails the RC.

After managed application, list remote migrations and require seven timestamp/name records matching the manifest. Run the same deployment bundle a second time with `db push --dry-run`; it must report zero pending migrations and must not execute any migration body.

### Eventual Production deployment mechanism

Production rollout is managed `supabase db push`; raw SQL without bookkeeping is forbidden. Because the repository does not contain fabricated bodies for every historical Production migration, create an ephemeral release workdir and use `supabase migration fetch` against Production to hydrate its 69 official history records. Verify count `69` and head `20260820090323`, then add only the seven exact manifest-pinned files and verify every SHA-256. `db push --dry-run` must list exactly the seven release migrations. An actual Production `db push` requires separate promotion authorization and is not permitted during Phase 2I.

The C2 preflight performed only the read-only Production history fetch and dry-run; it did not execute any Production migration.

## D. Expected schema objects

At minimum verify these contracts on staging:

- Planning: `planned_work_labor_requirements`, `planned_work_resource_requirements`, canonical material snapshot tables, readiness views, explicit refresh/action functions, freeze guards.
- Scheduler/WO: frozen labor/material/resource/fuel requirements and operational assignment tables/functions.
- Result: worker lineage to WO labor requirement, material actuals, vehicle meter snapshots, fuel actuals, Survey linkage, verification guards.
- Variance: canonical labor/material/resource/fuel result and WO views.
- Payroll/Contractor: employee earning summaries/lines, contractor estimates, team-pool reconciliation, eligibility and B-Pay views, period prepare/approve/close actions.
- Performance: Phase 2H read-only result/worker/material/resource/fuel/payroll-reconciliation views.

Verify RLS is enabled where required, canonical tables reject generic `anon`/`authenticated` writes, action function signatures match the server calls, SECURITY DEFINER functions have constrained search paths and explicit grants, and analytics views use security-invoker semantics with service-only access.

## E. Controlled compatibility fixture

The standalone Staging project must not contain Production data. Create staging-only fixtures that reproduce the historical row shapes used by:

- 719 legacy Work Orders;
- existing Work Results, Payroll, Surveys, Inventory, Vehicles, Budget rates/blocks;
- nullable legacy columns and pre-canonical records.

The fixture must use synthetic identifiers prefixed for Phase 2I, stay inside staging, and include cleanup. It must not update historical Production records or introduce a data migration merely to satisfy a test.

## F. Application deployment order

1. Obtain staging `SUPABASE_URL` and server-only service credential without printing or writing them to source.
2. Add them to Vercel Preview scope for the Phase 2I branch only. Do not alter Production environment variables.
3. Verify the configured Supabase URL contains the staging ref and does not contain `xhtwmzlorceebsemqkww`.
4. Deploy the local RC to Vercel Preview, never with `--prod`.
5. Record Preview hostname, Environment=`Preview`, and staging project ref in the manifest. Never record tokens.
6. Call a read-only diagnostic from the Preview and prove its database ref is staging before any mutation test.
7. Run `npm run phase2i:gate`. It may pass only when the manifest records the same non-Production ref for staging and Preview and all runtime gates are complete.

## G. End-to-end smoke tests

Run through UI/API on staging only:

1. Employee: Budget → Plan with at least two labor lines → Approve → Scheduler → WO → Submit/Approve/Dispatch → Result → Verify → Payroll → Performance. Change Rate Master after snapshot and prove every downstream frozen amount is unchanged.
2. Contractor: Result → Contractor Estimate → Performance; prove no employee earning and no double count, and Operational Cost differs from Net Payable.
3. Material: Issue → Use → Return; prove issued differs from used, used is consumption, return reduces outstanding, and Performance cost uses consumption.
4. Tractor: hour-meter-only vehicle, 32 L / 8 h = 4 L/hour, with no odometer requirement; prove frozen standard lineage.
5. Road vehicle: odometer-only vehicle, 160 km / 40 L = 4 km/L, with no hour-meter requirement.
6. Survey: existing resolver → answer → submit → finding → resolve → verify Result → Performance.
7. Payroll: both 1–15 and 16–month-end periods, team pool, hourly/daily/piece/driver, allowance, deduction, contractor, idempotent retries, immutable close.
8. B-Pay: Base + OT + Allowance − Deduction = Net, correct `source_result_count`, correct `variance_state`, and no external B-Pay write.
9. Permissions: Admin, Planner, Approver/Manager, Scheduler/Dispatcher, Result Recorder, Result Verifier, Payroll View, Payroll Calculate, Performance View, including estate/block scope. A user with `performance.view` and without `payroll.view` must not receive restricted payroll fields.
10. Action-only security: generic browser/API writes to canonical Planning, WO, Result, Payroll, and Performance objects must fail.
11. Idempotency: retry Plan Item, WO, Result, Payroll, and Contractor Estimate actions without duplicate rows.

Reconcile identifiers and frozen amounts across every hop. Any missing lineage, master reread, duplicate cost, or permission bypass fails the RC.

## H. Visual and runtime regression

Use Playwright against the staging-bound Preview. Check Planning, Budget, Work, Scheduler, Daily Result, Payroll, and Performance at:

- 1728×992
- 1440×900
- 1366×768
- 1024×768
- 768×1024
- 390×844

Reject blank workspaces, overlaps, critical clipping, document-level horizontal overflow, console/page errors, or CSS leakage. Internal table scrolling is allowed. Preserve the known baseline condition: `renderFarmWorkPlanner()` Step 01–04 remains unwired; Phase 2I must not rewire or redesign it.

## I. Rollback decision points

Do not promote when any of these is true:

- migration application/replay fails;
- historical fixture requires destructive rewrite;
- lineage or frozen Rate/standard changes after Master edits;
- employee/contractor or issued/consumed costs double count;
- RLS, grants, role scope, or action-only enforcement is bypassed;
- Preview points to Production;
- Payroll/B-Pay/Performance reconciliation differs;
- visual/runtime regression is present;
- Production before/after evidence differs.

Use `docs/phase2i-rollback-runbook.md` to select application rollback versus database forward-fix. Do not assume deployed DDL is transactionally reversible after live writes.

## J. Post-deploy verification

For an eventual authorized release only (not Phase 2I):

1. Confirm exact application SHA and database migration versions.
2. Run read-only smoke checks, role checks, and frozen-lineage probes.
3. Reconcile Payroll/B-Pay and Performance for a controlled period.
4. Compare Production counts/fingerprint and audit logs to the pre-deploy evidence.
5. Watch server, database, auth, and deployment logs.
6. Record release owner, decision, timestamps, and any forward-fix reference.

Phase 2I does not execute these Production steps.
