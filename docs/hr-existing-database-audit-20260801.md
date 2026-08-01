# HR existing database audit — 2026-08-01

## Scope and safety

This audit is read-only. It does not update, import, delete, merge, or renumber any employee record. The existing `employees` table remains the employee identity master and `employee_employment_terms` remains the employment/rate master.

Source project: `xhtwmzlorceebsemqkww` (`spc-est Project`, PostgreSQL 17)

Base branch: `codex/phase4-inventory-multiday-returns-unit-conversion`

Base SHA: `9c6cb14427c4ded1b0e96c4787089d2345d3bd7c`

## Baseline comparison

| Metric | Expected | Observed | Difference |
|---|---:|---:|---:|
| Current employees | 176 | 176 | 0 |
| Current employment terms | 176 | 176 | 0 |
| Active employees | 176 | 176 | 0 |
| Departments | 3 | 3 | 0 |
| Positions | 5 | 5 | 0 |
| Work attendance | 37 | 37 | 0 |
| Payroll periods | 3 | 3 | 0 |
| Payroll employee summaries | 19 | 19 | 0 |
| Missing department | 171 | 171 | 0 |
| Missing phone | 176 | 176 | 0 |
| Missing identification | 176 | 176 | 0 |
| Nationality: Myanmar | 4 | 4 | 0 |
| Nationality: Thai | 1 | 1 | 0 |
| Nationality: unspecified | 171 | 171 | 0 |

## Data-quality findings

| Check | Count | Treatment |
|---|---:|---|
| Duplicate current employee codes | 0 | No action |
| Duplicate current terms per employee | 0 | No action |
| Employee without a current term | 0 | No action |
| Overlapping employment-term pairs | 0 | No action |
| Orphan employment-term department | 0 | No action |
| Orphan employment-term position | 0 | No action |
| Orphan department manager | 0 | No action |
| Duplicate profiles per employee | 0 | No action |
| Active employee with elapsed end date | 0 | No action |
| Employee/current-term rate mismatch | 0 | No action |
| Overlapping housing assignments | 0 | No action |
| Attendance with missing employee | 0 | No action |
| Payroll summary with missing employee | 0 | No action |
| Missing worker type | 0 | No action |
| Missing payment type | 0 | No action |
| Missing department | 171 | Cleanup preview only |
| Missing phone | 176 | Cleanup preview only |
| Missing identification | 176 | Cleanup preview only; never expose raw values |
| Missing nationality | 171 | Cleanup preview only |

No baseline data was changed to make these counts match.

## Existing masters to reuse

- Identity and version history: `employees`
- Department, position, worker/payment type and rates: `employee_employment_terms`
- Organization: `departments`, `positions`
- Housing: `employee_housing_assignments`
- Attendance and daily work: `work_attendance`, `work_order_workers`, `work_result_workers`
- Payroll: `payroll_periods`, `payroll_period_lines`, `payroll_employee_summaries`, `payroll_earning_lines`, overtime, allowance, deduction and rate tables
- Authorization and audit: `profiles`, `roles`, `permissions`, `profile_roles`, `role_permissions`, `user_access_scopes`, `audit_logs`

The Phase 5 schema may only add satellite tables with `employee_id uuid references employees(id)`. It must not create another employee master or duplicate payroll calculation.

## Existing HR/security infrastructure

- Existing permissions: `hr.employee.view`, `hr.employee.edit`, `hr.attendance.manage`, `hr.team.manage`.
- Existing HR settings: `hr.primary_employment_table=employee_employment_terms`, `hr.employee_term_sync_enabled=true`, `hr.department_mapping_confirmed=false`.
- All required Phase 5 satellite tables were absent at audit time.
- Existing storage buckets are private. `employee-documents` did not exist.
- `pg_cron`, `pg_net`, and the `cron` schema were not installed. Phase 5 must use one scheduler only; the proposed implementation is a protected Vercel endpoint in dry-run/disabled mode until approval.
- The Supabase security advisor reports pre-existing findings outside Phase 5, including mutable function search paths and permissive policies on legacy/archive tables. Phase 5 migrations must not add equivalent findings.

## Migration ledger observation

The Base Branch working tree and Git remote are aligned, but the repository migration filenames are not a byte-for-byte timestamp match with the Supabase migration ledger. Several semantic migration names match with different timestamps, and the remote ledger contains historical migrations whose files are not present in this checkout. No applied migration or remote ledger entry was edited or repaired during this audit. Phase 5 migrations must be additive and recorded with newly generated timestamps.

## Cleanup/import guardrails

- Produce preview rows containing current value, proposed value, validation result, impact, error count, and warning count.
- Never update all 176 employees automatically.
- Require explicit confirmation before import.
- UAT data must use `WEBTEST-UAT-HR-*` and be rolled back or cleaned up only by that prefix.
- Never log or export full identification, passport, bank-account, medical, or document-storage details without the dedicated permission.

## Audit query

The reproducible read-only query set is in `scripts/hr-existing-database-audit.sql`.
