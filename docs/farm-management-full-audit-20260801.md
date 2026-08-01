# Farm Management Full Audit — 2026-08-01

## Audit scope and safety

- Repository: `spcapinan-debug/palmoil-est`
- Workspace: `C:\Users\com_e\AppData\Local\Temp\palmoil-est-phase4-inventory-multiday-returns-unit-conversion`
- Branch: `codex/phase4-inventory-multiday-returns-unit-conversion` (not `main`)
- Baseline local/remote commit: `40389122baf6dee8973470cf4a8cc64a240c8cb3`
- Baseline Preview: `dpl_2yxsVNdK7t7Yaw6UURuYquY9yK9p`, `READY`, target Preview, same branch/commit
- Supabase project: `xhtwmzlorceebsemqkww`
- Method: database queries were run in an explicit read-only transaction. No data, migration, RLS, role, scope, environment variable, credential, or feature flag was changed.

## Executive finding

The main data is present and relational Scope resolution is correct. `v_farm_workflow_workspace` contains 719 rows; each UAT profile's three active block scopes resolve to 27 rows (approved 22, dispatched 1, in-progress 3, closed 1). Data disappeared in the API read-context stage because `api/farm-tables.js` filtered scoped rows again by `WEBTEST-*` record-name prefixes. A second frontend issue did not recognize the database status `dispatched` and admitted `approved/completed` into Daily candidates.

The repair removes prefix checks from reads only, follows relational IDs for inventory/payroll/views, preserves all existing UAT write-prefix isolation, adds refresh-token rotation and sequential authenticated loading, contains table-level failures, and recognizes the real workflow statuses. No database repair or migration is needed.

## Preflight baseline

| Check | Result |
| --- | --- |
| Working directory | Expected Phase 4 workspace |
| Branch | `codex/phase4-inventory-multiday-returns-unit-conversion` |
| Working tree before audit | Clean |
| Local SHA / remote SHA | Both `40389122baf6dee8973470cf4a8cc64a240c8cb3` |
| Latest baseline Preview | `READY`, same branch and SHA |
| Production/main | Not touched |

## 1. Master Data

| Object | Actual | Baseline diff |
| --- | ---: | ---: |
| blocks | 103 | 0 |
| areas | Missing optional compatibility object | n/a |
| activity_groups | 17 | 0 |
| activities | 76 | 0 |
| teams | 20 | 0 |
| employees | 176 | 0 |
| contractors | 0 | 0 |
| materials | 121 | 0 |
| units | 70 | Not previously specified |
| warehouses | 1 | 0 |
| bin_locations | 0 | 0 |
| vehicles | 45 | Not previously specified |

## 2. Planning

| Object / status | Actual |
| --- | ---: |
| annual_work_plans | 2 |
| annual plans: approved | 2 |
| planned_work_items | 717 |
| planned items: planned | 717 |
| planned_work_materials | 0 |

No planned item is missing an annual plan. One potential duplicate business-key group contains five planned items with the same plan/block/activity/date range. It is reported as a repair preview only because recurrence/source intent has not been established.

## 3. Work Orders

| Object / status | Actual |
| --- | ---: |
| work_orders | 719 |
| approved | 712 |
| draft | 1 |
| dispatched | 1 |
| in_progress | 4 |
| closed | 1 |
| work_order_workers | 77 |
| work_order_materials | 713 |
| work_order_machines | 4 |
| work_order_actions | Missing requested object; current lifecycle uses server actions |

Two work orders have no planned item; both are isolated UAT workflow records. One draft order (`W69-001`) has no block. There are no missing activities, orphan teams, missing work-order materials, or duplicate work orders per planned item. No automatic change was made.

## 4. Daily Work Results

| Object / status | Actual |
| --- | ---: |
| work_results | 7 |
| draft | 4 |
| verified | 1 |
| closed | 2 |
| work_result_workers | 47 |
| work_result_materials | Missing requested object; current material usage is recorded through issue/daily-usage relations |
| work_result_vehicle_usage | 2 |
| work_result_weight_tickets | 2 |

No result is orphaned or outside its planned date range. One potential duplicate group has three results for one work order/date; it was not changed.

## 5. Inventory

| Object | Actual |
| --- | ---: |
| goods_issues / goods_issue_lines | 1 / 1 |
| goods_issue_daily_usage | 0 |
| goods_returns / goods_return_lines | 0 / 0 |
| stock_balances / stock_transactions | 1 / 2 |
| sku_conversions / unit_conversions | 2 / 0 |

All audited issue, material, issue-line, warehouse, material, and unit links are valid. Transaction tables remain action-only; generic writes are still blocked. Inbound ticket reads now match `source_area_key` to the assigned block code/name instead of a test prefix.

## 6. Payroll Linkage

| Object | Actual |
| --- | ---: |
| payroll_periods | 3 |
| payroll_period_lines | 37 |
| payroll_employee_summaries | 19 |
| payroll_earning_lines | 37 |

UAT reads now follow `work_result_id → payroll_period_id → payroll_summary_id`; period-name prefixes are not used for read authorization.

## 7. Survey / Performance

| Object | Actual |
| --- | ---: |
| survey_templates / survey_questions | 4 / 28 |
| survey_responses / survey_findings | 5 / 3 |
| activity_performance_standards | 79 |
| work_performance_metrics | 24 |

Survey responses, answers, attachments, and findings remain constrained by scoped work-order/result relationships.

## 8. Users / Roles / Permissions / Scopes

| Profile | Status | Active role | Scope | Resolved workflow |
| --- | --- | --- | --- | ---: |
| `9602ba04-dd51-4cbe-baa4-bdf1091a759c` | active | `uat_manager` | 3 active `read_write` blocks | 27 |
| `4a216447-bf6c-4952-857d-bfadbc793ffe` | active | `uat_supervisor` | 3 active `read_write` blocks | 27 |

Both profiles resolve to approved 22, dispatched 1, in-progress 3, and closed 1. UUID comparisons and direct `block_id` resolution are valid. There is no unintended manager/supervisor employee filter. Scope was not expanded beyond the three assigned blocks.

Security object counts: profiles 2, roles 11, permissions 63, role_permissions 220, profile_roles 2, user_access_scopes 6, farm_action_idempotency 50.

## 9. API

Trace: sign-in → HttpOnly cookies → session → role/permission/scope → table reads → relational UAT filter → per-table response metadata.

- Root cause removed: read-time `WEBTEST-2569`, `WEBTEST-UAT`, `WEBTEST-UAT-INV`, and payroll-period prefix filters.
- Write isolation retained unchanged in `enforceUatTableWrite` and `api/farm-actions.js`.
- Each table reports `ok`, returned row count, raw count, scoped count, source, and warning through `tableMeta`.
- A failed table is omitted from the successful table map, reported in `errors`, is not cached, and does not clear successful/stale tables.
- Cookie configuration is host-only (no Domain attribute), `Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`; access expiry follows Supabase and refresh cookie max age is 30 days.
- Expired access sessions rotate access/refresh cookies through the existing refresh token. Failed refresh clears both cookies and returns `SESSION_EXPIRED`; anonymous access remains closed.

## 10. Frontend

- Workspace session loads before table requests, preventing an expired access cookie from racing the refresh request.
- All protected reads send `credentials: same-origin`, check HTTP status, and retry once after a successful session refresh.
- A 401/error is not marked loaded or cached as an empty table; inflight requests are removed in `finally`.
- `dispatched` is now a first-class UI status.
- Dispatch candidates retain approved scoped work orders (expected 22 for each UAT profile).
- Daily candidates are dispatched/in-progress (expected 4: 1 + 3); approved and completed orders are not fallback candidates.
- Empty states distinguish database-empty, scope-empty, status-empty, filter-empty, expired-session, and API failure, with Retry.
- Preview-only diagnostics log safe counts/status/route fields and never log passwords, tokens, cookies, keys, or credentials.

## 11. Deployment

The authorized delivery path is a Git-integrated Preview from the existing project and branch. No Production deployment is authorized. Final Preview deployment ID, commit, and URL are recorded in the handoff after Git/Vercel verification.

## Trace table

| Stage | Raw/global | UAT Manager | UAT Supervisor | Evidence / result |
| --- | ---: | ---: | ---: | --- |
| Database work_orders | 719 | 27 by block relation | 27 by block relation | Read-only SQL |
| Raw workflow view | 719 | 27 | 27 | Read-only SQL |
| API read context before fix | 719 | Prefix-limited | Prefix-limited | Root cause in `uatReadContext` |
| API scope after fix | 719 raw metadata | 27 | 27 | Relational filter + regression fixture |
| Client state after fix | n/a | Expected 27 | Expected 27 | Preserves API scoped rows; Preview UAT pending at commit time |
| Dispatch initial filter | n/a | 22 | 22 | approved candidates |
| Daily initial filter | n/a | 4 | 4 | dispatched 1 + in-progress 3 |
| Render | n/a | Must be >0 | Must be >0 | Preview browser evidence recorded in final handoff |

## Integrity anomaly ledger and Data Repair Preview

| Check | Count | Disposition |
| --- | ---: | --- |
| planned item missing annual plan | 0 | none |
| work order missing planned item | 2 | UAT isolation records; no repair |
| work order missing block | 1 | draft `W69-001`; investigate owner before any repair |
| work order missing activity | 0 | none |
| work order orphan team | 0 | none |
| work order material missing material | 0 | none |
| work result missing order | 0 | none |
| work result outside range | 0 | none |
| goods issue missing order | 0 | none |
| goods issue line missing material | 0 | none |
| daily usage missing issue line | 0 | none |
| stock balance missing warehouse/material/unit | 0 | none |
| potential duplicate planned-item groups | 1 (5 rows) | preview only; verify recurrence intent |
| duplicate work order per planned item | 0 | none |
| potential duplicate result/order/date groups | 1 (3 rows) | preview only; verify multi-entry intent |

No UPDATE/DELETE/INSERT repair SQL was prepared or applied because these findings are not proven corrupt data and are not the visibility root cause.

## Feature flags

All required flags remain active settings with value `false`: `system.dynamic_menu_enabled`, `system.frontend_workspace_ready`, `system.rls_ready`, `inventory.multi_day_issue_enabled`, `inventory.material_return_enabled`, `inventory.unit_conversion_enabled`, `budget.rule_engine_enabled`, `performance.activity_metrics_enabled`, `performance.budget_recommendations_enabled`, `fuel.configuration_confirmed`, and `integration.weighbridge_enabled`.

## Migration and secret review

- No migration file was added or modified.
- Recent applied migration logical names match the checked-in Phase 3/4 security and inventory migrations; some historical local/applied timestamps differ from earlier deployment tooling and were not rewritten.
- No environment variable was changed.
- No credential or token value is present in the diff. `.env.example` retains only empty server variable names.

## Validation ledger

| Validation | Result |
| --- | --- |
| New visibility/auth/scope tests | 12/12 passed |
| Full unit/integration/auth/permission/scope/API/route/responsive/security suite | 86/86 passed before final report update |
| Build | Passed (`standalone export check`) |
| Syntax | Passed for all modified JavaScript |
| Git diff check | Passed |
| Read-only audit SQL | Passed |
| Secret/migration review | Passed; no secret or migration change |
| Browser Preview UAT | Recorded in final handoff after Preview is built |
