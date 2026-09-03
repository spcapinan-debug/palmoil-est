# Phase 2I rollback and forward-fix runbook

This document separates application rollback from database recovery. Phase 2I rehearses these decisions only in staging; it does not execute them on Production.

## Application rollback

Use application rollback when the schema is compatible but the deployed UI/API SHA is faulty.

1. Stop promotion and disable further application mutations if safety is uncertain.
2. Redeploy the last known compatible application SHA through the normal Vercel rollback/promote mechanism.
3. Do not change Supabase credentials or point a Preview/Production application at a different database as a shortcut.
4. Smoke-test auth, Planning reads, WO reads, Result reads, Payroll reads, and Performance reads.
5. Confirm that the older application does not call unavailable or changed function signatures.

Application rollback never rolls back database rows or immutable snapshots.

## Database forward-fix

Prefer a reviewed additive forward-fix after a migration has been applied and Production writes may have occurred.

1. Freeze affected actions while preserving read access and evidence.
2. Identify the smallest compatible correction: function/view replacement, grant correction, constraint validation, or additive column/index.
3. Test the forward-fix from the same Production baseline in staging, including replay and role/security checks.
4. Create a new ordered migration. Never edit a migration already recorded by Production.
5. Require a separate approval before applying it to Production.

Do not use a data rewrite to make historical rows resemble new snapshots.

## Database rollback

Use destructive DDL rollback only when all of the following are proven:

- no live rows depend on the new object or column;
- no immutable Planning/WO/Result/Payroll snapshot would be removed or rewritten;
- dependent functions, views, grants, triggers, and signatures have a tested reverse order;
- a verified backup/PITR recovery point exists;
- the release owner explicitly approves the operation.

If any condition is false, use a forward-fix. Dropping an analytics view may be reversible; dropping a snapshot column after writes is not presumed safe.

## Data safety

- Preserve source IDs from Budget → Planning → WO → Result → Payroll/Contractor → Performance.
- Never replace frozen Rate, material, resource, meter-basis, fuel-standard, or cost assumptions from current Master data.
- Never treat issued Material/Fuel as actual consumption.
- Keep employee earnings separate from contractor estimates and Operational Cost separate from Payroll Net.
- Capture counts, fingerprints, migration versions, and audit logs before and after any authorized recovery.
- Do not copy service keys, access tokens, database passwords, or Production credentials into logs, source, fixtures, screenshots, or reports.

## Immutable snapshots

Approved Planning snapshots, canonical WO snapshots, verified Result inputs, and closed Payroll records are immutable business evidence. Recovery may restore availability or correct derived views, but it must not mutate those snapshots to match a newer Master.

If an immutable value is wrong, preserve the original record and use the domain's explicit correction/reversal workflow in a separately reviewed phase. Phase 2I does not invent such a workflow.

## Decision record

For every rollback or forward-fix decision record:

- triggering symptom and first timestamp;
- application SHA and migration versions;
- affected estate/block/period scope;
- whether writes occurred after migration;
- Production before/after counts and fingerprint;
- selected application rollback, database forward-fix, or database rollback;
- approver and executor;
- verification evidence and residual risks.
