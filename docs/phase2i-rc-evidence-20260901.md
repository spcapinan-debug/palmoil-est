# Phase 2I RC evidence — 2026-09-01

## Outcome

**RC BLOCKED / DO NOT PROMOTE.** The requested isolated Supabase branch could not be created. Supabase returned `PaymentRequiredException` with the message that Branching is supported only on Pro plan or above. The quoted branch cost was USD 0.01344/hour and cost confirmation completed before the rejected creation request.

No staging project ref exists. Consequently no Phase 2C.2–2H migration was applied, no staging mutation/E2E was run, and no Vercel RC Preview was deployed. This is deliberate fail-closed behavior: Production was not used as a substitute runtime.

## Source and local branch

- Release candidate source: `7521cfca5fe5d90028a4ea8da2c3309a16949875`
- Local branch: `codex/phase2i-integration-release-candidate`
- Production project ref: `xhtwmzlorceebsemqkww` (read-only inspection only)
- Requested staging name: `phase2i-rc-20260901`
- Staging project ref: not created
- Preview hostname: not deployed without staging

## Production read-only baseline

- PostgreSQL: 17.6
- Latest migration: `20260820090323`
- Migration count: 69
- Counts fingerprint: `72978762e921e91f795d27db765d53f6`
- Historical Work Orders: 719

The full ordered count map is in `docs/phase2i-rc-manifest.json`. Read-only checks also confirmed the Phase 2C.2–2H representative objects were absent from Production at capture time.

The identical query was repeated after local validation. Migration version remained `20260820090323`, migration count remained 69, every recorded count matched, and the fingerprint remained `72978762e921e91f795d27db765d53f6`. Supabase branch listing showed only the default Production branch; the rejected staging request left no development branch behind.

## Pending migration stack

Seven checked-in migrations follow the Production baseline, from Phase 2C.2 through Phase 2H. Their exact order and SHA-256 digests are pinned in the manifest. They were not applied to Production.

## Gates not executed

- clean staging migration application and fresh-branch replay;
- controlled historical compatibility fixture;
- E2E employee, contractor, material, tractor, road-vehicle, and Survey scenarios;
- both payroll periods and B-Pay reconciliation;
- roles/estate/block/action-only security matrix;
- cross-module idempotency and Performance reconciliation;
- staging-bound Vercel Preview;
- 42-route/viewport Playwright RC matrix.

These gates must not be marked skipped-pass. They remain blocking until a valid isolated environment exists.

## Completed local-only checks

- `npm test`: 555/555 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Migration order and SHA-256 manifest preflight: passed.
- Runtime RC gate: failed as designed because staging and Preview bindings are absent.

Remote `main` remained `bf9b7e26702dfdd8416fb0aa75bb262086941c0e`. Neither the Phase 2G commit `dc25be0178bb44708b1675c68c712f5566ff6194` nor the Phase 2H commit `7521cfca5fe5d90028a4ea8da2c3309a16949875` is an ancestor of that remote `main`, confirming both remain unmerged.

## Known baseline condition

`renderFarmWorkPlanner()` Step 01–04 remains unwired as at the Release Candidate source. Phase 2I does not rewire it.

## Safety confirmation

- Production DB: read-only and no Phase 2C.2–2H migration applied.
- Production deployment: not performed.
- `main`: not merged or modified.
- PR #1 and PR #2: not merged by Phase 2I.
- Secrets/tokens: not written to source or evidence.
