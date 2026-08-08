# Mobile operations gap matrix

Audit point: branch `codex/mobile-dispatch-daily-entry-ux` at `a339a87df657b87db84aa23bb7cfaa88d4536603`, including the preserved uncommitted work present when this continuation started.

| Workstream | Status before continuation | Evidence | Remaining gap at audit point |
|---|---|---|---|
| Mobile Dispatch Candidate List | Complete | `webapp/app.js`: `farmDispatchCandidateOrders`, `renderFarmDispatchCandidatePanel` | Browser UAT only |
| Mobile Dispatch Entry | Complete | `webapp/app.js`: `renderFarmDispatchPanel`; `api/farm-actions.js`: `saveDispatchAssignment` and work-order transitions | Browser UAT only |
| Mobile Daily Candidate List | Complete | `webapp/app.js`: `renderFarmResultCandidatePanel`, `farmResultResumeInfo` | Browser UAT only |
| Mobile Daily Entry | Partial | `webapp/app.js`: `saveFarmDailyEntry`; `api/farm-actions.js`: `saveWorkResultDraft` | Finish vehicle/fuel server calculations and targeted tests |
| Survey Integration | Partial | `webapp/app.js`: `farmSurveyForOrder`, `ensureFarmDailySurveyDraft`; `api/farm-actions.js`: survey response lifecycle and private evidence actions | Automatic finding rules and targeted tests |
| Finding / Evidence | Partial | `api/farm-actions.js`: `createSurveyFinding`, signed private evidence upload/finalize | Idempotent automatic finding creation for failed answers |
| Vehicle Usage | Partial | Preserved working diff validates assigned vehicles, meter order, time overlap, and persists usage | Remove duplicate validation and cover with tests |
| Fuel Requisition | Partial | `refresh_vehicle_fuel_requisition` server RPC is wrapped with work-order scope checks | Targeted workflow/security tests |
| Fuel Issue | Partial | `issueFuel` checks requisition state, scope, quantity, tank, and action idempotency | Targeted workflow/security tests |
| Fuel Measurement / Actual Usage | Partial | Preserved working diff separates issued fuel from `allocated_fuel_liter` | Server-owned consumed-fuel formula and explicit no-standard behavior |
| Work Notification Schema | Not started | Existing audit found no generic work-notification model | Add additive migration with RLS, grants, indexes, idempotency |
| Notification API | Not started | Existing top-bar bell is presentation only | Add scoped action-only mutations and reads |
| Notification Mobile UI | Not started | `webapp/index.html` has an inert bell | Add full-screen center, badge, filters and deep links |
| Notification Desktop UI | Not started | No drawer or `/notifications` view | Add shared-data drawer/page and delivery visibility gate |
| Scheduler / Cron | Not started | `vercel.json` has no cron and audit found no `pg_cron`/`pg_net` | Add one protected Vercel Cron path, disabled by default, with lock/dry-run/job summary |
| Tests | Partial | Baseline: build/lint and 126 tests pass | Add the seven requested focused test files |
| Browser UAT | Not started for this continuation | No authenticated browser session or current preview validation evidence | Run emulated viewport UAT and report limitations accurately |
| Preview Deployment | Not started for this continuation | Branch remote exists at `a339a87` | Deploy preview only after code/tests pass; never production |

“Complete” above means the code path has UI, state, authenticated API, database persistence, permission/scope checks, idempotency, validation, and automated coverage. Browser UAT and preview are tracked separately because they depend on a runnable authenticated environment.

## Closure status

| Workstream | Status after continuation | Closure evidence |
|---|---|---|
| Dispatch and Daily entry | Complete in code and automated coverage | Candidate/resume flow, assignment transitions, draft persistence, rejection recovery and responsive regression tests pass |
| Survey, finding and private evidence | Complete in code and automated coverage | Server-side template precedence, version snapshots, conditional validation, idempotent failure findings and signed private evidence paths pass |
| Vehicle and fuel | Complete in code and automated coverage | Assignment, overlap, meter/time, requisition, issue, server-owned consumed fuel and no-standard behavior pass |
| Work notifications | Complete but disabled by default | Additive RLS migration, inactive seeded rules, scoped action API, shared UI state and protected single scheduler path are present |
| Browser UAT | Partial by environment | Anonymous notification-center UAT passed; authenticated Dispatch/Daily and private evidence upload require a preview session and were not fabricated |
| Preview deployment | Complete for unauthenticated smoke checks | Preview `palmoil-ihv917qfh-spc-est.vercel.app` is READY; direct workflow routes return 200 and protected APIs return 401 without credentials; production was not changed |
