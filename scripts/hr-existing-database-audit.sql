-- Phase 5 HR baseline audit (read-only)
-- Safe to run repeatedly. This file contains no INSERT/UPDATE/DELETE/DDL.

begin transaction read only;

-- 1. Required relations and views.
with required_relations(name) as (values
  ('employees'), ('employee_employment_terms'), ('employee_housing_assignments'),
  ('departments'), ('positions'), ('profiles'), ('profile_roles'), ('roles'),
  ('permissions'), ('role_permissions'), ('user_access_scopes'), ('teams'),
  ('team_members'), ('work_attendance'), ('work_order_workers'),
  ('work_result_workers'), ('payroll_periods'), ('payroll_period_lines'),
  ('payroll_employee_summaries'), ('payroll_earning_lines'),
  ('payroll_overtime_records'), ('payroll_allowances'),
  ('payroll_allowance_lines'), ('payroll_deductions'),
  ('payroll_deduction_lines'), ('payroll_rates'),
  ('v_employee_current_employment'),
  ('v_employee_department_assignment_queue'),
  ('v_employee_activity_performance_summary'),
  ('v_payroll_period_workspace'), ('audit_logs')
)
select name, to_regclass('public.' || name) is not null as exists
from required_relations
order by name;

-- 2. Baseline and data-quality counts.
with current_employees as (
  select * from public.employees where is_current is true
),
current_terms as (
  select * from public.employee_employment_terms where is_current is true
),
metrics as (
  select 'current_employees' metric, count(*)::bigint value from current_employees
  union all select 'all_employee_versions', count(*) from public.employees
  union all select 'current_employment_terms', count(*) from current_terms
  union all select 'active_employees', count(*) from current_employees where status = 'active'
  union all select 'departments', count(*) from public.departments
  union all select 'positions', count(*) from public.positions
  union all select 'work_attendance', count(*) from public.work_attendance
  union all select 'payroll_periods', count(*) from public.payroll_periods
  union all select 'payroll_employee_summaries', count(*) from public.payroll_employee_summaries
  union all select 'missing_department', count(*) from current_terms where department_id is null
  union all select 'missing_phone', count(*) from current_employees where nullif(btrim(phone), '') is null
  union all select 'missing_identification', count(*) from current_employees where nullif(btrim(id_card_no), '') is null
  union all select 'missing_nationality', count(*) from current_employees where nullif(btrim(nationality), '') is null
  union all select 'missing_worker_type', count(*) from current_terms where nullif(btrim(worker_type), '') is null
  union all select 'missing_payment_type', count(*) from current_terms where nullif(btrim(payment_type), '') is null
  union all select 'duplicate_current_employee_codes', count(*) from (
    select employee_code from current_employees group by employee_code having count(*) > 1
  ) duplicate_codes
  union all select 'employee_without_current_term', count(*) from current_employees employee
    where not exists (select 1 from current_terms term where term.employee_id = employee.id)
  union all select 'duplicate_current_terms_per_employee', count(*) from (
    select employee_id from current_terms group by employee_id having count(*) > 1
  ) duplicate_terms
  union all select 'overlapping_employment_term_pairs', count(*)
    from public.employee_employment_terms left_term
    join public.employee_employment_terms right_term
      on left_term.employee_id = right_term.employee_id and left_term.id < right_term.id
   where daterange(left_term.effective_from, coalesce(left_term.effective_to, 'infinity'::date), '[]')
      && daterange(right_term.effective_from, coalesce(right_term.effective_to, 'infinity'::date), '[]')
  union all select 'orphan_term_department', count(*) from current_terms term
    left join public.departments department on department.id = term.department_id
    where term.department_id is not null and department.id is null
  union all select 'orphan_term_position', count(*) from current_terms term
    left join public.positions position on position.id = term.position_id
    where term.position_id is not null and position.id is null
  union all select 'orphan_department_manager', count(*) from public.departments department
    left join current_employees employee on employee.id = department.manager_employee_id
    where department.manager_employee_id is not null and employee.id is null
  union all select 'duplicate_profiles_per_employee', count(*) from (
    select employee_id from public.profiles
    where employee_id is not null group by employee_id having count(*) > 1
  ) duplicate_profiles
  union all select 'active_with_elapsed_end_date', count(*) from current_employees
    where status = 'active' and end_date is not null and end_date <= current_date
  union all select 'employee_term_rate_mismatch', count(*) from current_employees employee
    join current_terms term on term.employee_id = employee.id
    where employee.daily_wage is distinct from term.daily_wage
       or employee.hourly_wage_rate is distinct from term.hourly_wage_rate
       or employee.monthly_salary is distinct from term.monthly_salary
       or employee.contract_rate is distinct from term.contract_rate
  union all select 'overlapping_housing_pairs', count(*)
    from public.employee_housing_assignments left_assignment
    join public.employee_housing_assignments right_assignment
      on left_assignment.employee_id = right_assignment.employee_id
     and left_assignment.id < right_assignment.id
   where daterange(left_assignment.start_date, coalesce(left_assignment.end_date, 'infinity'::date), '[]')
      && daterange(right_assignment.start_date, coalesce(right_assignment.end_date, 'infinity'::date), '[]')
  union all select 'attendance_orphan_employee', count(*) from public.work_attendance attendance
    left join public.employees employee on employee.id = attendance.employee_id
    where attendance.employee_id is not null and employee.id is null
  union all select 'payroll_summary_orphan_employee', count(*) from public.payroll_employee_summaries summary
    left join public.employees employee on employee.id = summary.employee_id
    where summary.employee_id is not null and employee.id is null
)
select metric, value from metrics order by metric;

-- 3. Nationality distribution. Values are aggregate-only and contain no identifiers.
select coalesce(nullif(btrim(nationality), ''), 'ไม่ระบุ') as nationality,
       count(*)::bigint as employee_count
from public.employees
where is_current is true
group by 1
order by employee_count desc, nationality;

-- 4. Cleanup preview: identifiers and sensitive values remain masked.
select
  employee.id as employee_id,
  employee.employee_code,
  employee.full_name,
  case when term.department_id is null then 'missing_department' end as department_issue,
  case when nullif(btrim(employee.nationality), '') is null then 'missing_nationality' end as nationality_issue,
  case when nullif(btrim(employee.phone), '') is null then 'missing_phone' else 'present' end as phone_status,
  case when nullif(btrim(employee.id_card_no), '') is null then 'missing_identification' else 'present_masked' end as identification_status,
  'preview_only'::text as disposition
from public.employees employee
left join public.employee_employment_terms term
  on term.employee_id = employee.id and term.is_current is true
where employee.is_current is true
  and (
    term.department_id is null
    or nullif(btrim(employee.nationality), '') is null
    or nullif(btrim(employee.phone), '') is null
    or nullif(btrim(employee.id_card_no), '') is null
  )
order by employee.employee_code;

-- 5. Existing HR permissions and settings.
select permission_key, status
from public.permissions
where permission_key like 'hr.%'
order by permission_key;

select setting_key, setting_value, value_json, status
from public.system_settings
where setting_key like 'hr.%'
order by setting_key;

-- 6. Storage and scheduler infrastructure.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select extname, extversion
from pg_extension
where extname in ('pg_cron', 'pg_net')
order by extname;

rollback;
