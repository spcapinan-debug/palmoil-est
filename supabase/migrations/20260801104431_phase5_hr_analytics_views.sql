begin;

create or replace view public.v_hr_employee_360
with (security_invoker = true) as
select
  employee.id as employee_id,
  employee.employee_code,
  employee.full_name,
  employee.nationality,
  employee.employee_type,
  employee.status as employee_status,
  employee.start_date,
  employee.end_date,
  term.department_id,
  department.department_code,
  department.department_name,
  term.position_id,
  position.position_code,
  position.position_name,
  term.worker_type,
  term.payment_type,
  migrant.current_compliance_status,
  migrant.passport_reference_masked,
  coalesce(document_summary.document_count, 0) as document_count,
  coalesce(document_summary.expired_document_count, 0) as expired_document_count,
  coalesce(document_summary.due_90_document_count, 0) as due_90_document_count,
  coalesce(renewal_summary.open_renewal_count, 0) as open_renewal_count,
  coalesce(emergency_contact.has_emergency_contact, false) as has_emergency_contact
from public.employees employee
left join public.employee_employment_terms term
  on term.employee_id = employee.id and term.is_current is true
left join public.departments department on department.id = term.department_id
left join public.positions position on position.id = term.position_id
left join public.employee_migrant_profiles migrant on migrant.employee_id = employee.id
left join lateral (
  select
    count(*)::integer as document_count,
    count(*) filter (where document.expiry_date < current_date)::integer as expired_document_count,
    count(*) filter (where document.expiry_date between current_date and current_date + 90)::integer as due_90_document_count
  from public.employee_documents document
  where document.employee_id = employee.id and document.archived_at is null
) document_summary on true
left join lateral (
  select count(*)::integer as open_renewal_count
  from public.employee_renewal_cases renewal
  where renewal.employee_id = employee.id
    and renewal.status not in ('completed', 'cancelled', 'rejected')
) renewal_summary on true
left join lateral (
  select true as has_emergency_contact
  from public.employee_emergency_contacts contact
  where contact.employee_id = employee.id and contact.status = 'active'
  limit 1
) emergency_contact on true
where employee.is_current is true;

create or replace view public.v_hr_headcount_summary
with (security_invoker = true) as
select
  employee.status as employee_status,
  coalesce(nullif(employee.nationality, ''), 'unspecified') as nationality,
  term.department_id,
  department.department_name,
  term.position_id,
  position.position_name,
  coalesce(term.worker_type, 'unspecified') as worker_type,
  coalesce(term.payment_type, 'unspecified') as payment_type,
  count(*)::integer as employee_count
from public.employees employee
left join public.employee_employment_terms term
  on term.employee_id = employee.id and term.is_current is true
left join public.departments department on department.id = term.department_id
left join public.positions position on position.id = term.position_id
where employee.is_current is true
group by employee.status, coalesce(nullif(employee.nationality, ''), 'unspecified'),
         term.department_id, department.department_name,
         term.position_id, position.position_name,
         coalesce(term.worker_type, 'unspecified'), coalesce(term.payment_type, 'unspecified');

create or replace view public.v_hr_employee_data_quality
with (security_invoker = true) as
select
  employee.id as employee_id,
  employee.employee_code,
  employee.full_name,
  term.department_id is null as missing_department,
  nullif(btrim(employee.nationality), '') is null as missing_nationality,
  nullif(btrim(employee.phone), '') is null as missing_phone,
  nullif(btrim(employee.id_card_no), '') is null as missing_identification,
  term.id is null as missing_current_employment_term,
  contact.id is null as missing_emergency_contact,
  coalesce(requirement.missing_required_document_count, 0) as missing_required_document_count,
  ((term.department_id is null)::integer
    + (nullif(btrim(employee.nationality), '') is null)::integer
    + (nullif(btrim(employee.phone), '') is null)::integer
    + (nullif(btrim(employee.id_card_no), '') is null)::integer
    + (term.id is null)::integer
    + (contact.id is null)::integer
    + (coalesce(requirement.missing_required_document_count, 0) > 0)::integer) as issue_count
from public.employees employee
left join public.employee_employment_terms term
  on term.employee_id = employee.id and term.is_current is true
left join lateral (
  select emergency.id
  from public.employee_emergency_contacts emergency
  where emergency.employee_id = employee.id and emergency.status = 'active'
  limit 1
) contact on true
left join lateral (
  select count(*)::integer as missing_required_document_count
  from public.employee_document_requirements required
  where required.status = 'active'
    and required.is_required is true
    and current_date between required.effective_from and coalesce(required.effective_to, 'infinity'::date)
    and (required.nationality is null or required.nationality = employee.nationality)
    and (required.worker_type is null or required.worker_type = term.worker_type)
    and (required.employee_type is null or required.employee_type = employee.employee_type)
    and (required.position_id is null or required.position_id = term.position_id)
    and (required.department_id is null or required.department_id = term.department_id)
    and not exists (
      select 1 from public.employee_documents document
      where document.employee_id = employee.id
        and document.document_type_id = required.document_type_id
        and document.status in ('active', 'due_soon', 'in_renewal')
        and document.archived_at is null
    )
) requirement on true
where employee.is_current is true;

create or replace view public.v_hr_document_compliance
with (security_invoker = true) as
select
  employee.id as employee_id,
  employee.employee_code,
  employee.full_name,
  count(document.id)::integer as document_count,
  count(document.id) filter (where document.status = 'active')::integer as active_count,
  count(document.id) filter (where document.expiry_date < current_date)::integer as expired_count,
  count(document.id) filter (where document.expiry_date between current_date and current_date + 7)::integer as due_7_count,
  count(document.id) filter (where document.expiry_date between current_date and current_date + 30)::integer as due_30_count,
  count(document.id) filter (where document.expiry_date between current_date and current_date + 60)::integer as due_60_count,
  count(document.id) filter (where document.expiry_date between current_date and current_date + 90)::integer as due_90_count,
  count(document.id) filter (where document.status = 'in_renewal')::integer as in_renewal_count
from public.employees employee
left join public.employee_documents document
  on document.employee_id = employee.id and document.archived_at is null
where employee.is_current is true
group by employee.id, employee.employee_code, employee.full_name;

create or replace view public.v_hr_document_expiry
with (security_invoker = true) as
select
  document.id as document_id,
  document.employee_id,
  employee.employee_code,
  employee.full_name,
  document.document_type_id,
  document_type.document_type_code,
  document_type.document_type_name_th,
  document.document_number_masked,
  document.expiry_date,
  document.expiry_date - current_date as days_to_expiry,
  document.status,
  document.verification_status,
  document.renewal_case_id
from public.employee_documents document
join public.employees employee on employee.id = document.employee_id
join public.employee_document_types document_type on document_type.id = document.document_type_id
where document.archived_at is null and document.expiry_date is not null;

create or replace view public.v_hr_migrant_compliance
with (security_invoker = true) as
select
  migrant.employee_id,
  employee.employee_code,
  employee.full_name,
  migrant.nationality,
  migrant.current_compliance_status,
  migrant.assigned_hr_profile_id,
  coalesce(document_summary.document_count, 0) as document_count,
  coalesce(document_summary.expired_count, 0) as expired_count,
  coalesce(renewal_summary.open_renewal_count, 0) as open_renewal_count,
  coalesce(renewal_summary.completed_renewal_cost, 0) as completed_renewal_cost
from public.employee_migrant_profiles migrant
join public.employees employee on employee.id = migrant.employee_id
left join lateral (
  select count(*)::integer as document_count,
         count(*) filter (where document.expiry_date < current_date)::integer as expired_count
  from public.employee_documents document
  where document.employee_id = migrant.employee_id and document.archived_at is null
) document_summary on true
left join lateral (
  select count(*) filter (where renewal.status not in ('completed', 'cancelled', 'rejected'))::integer as open_renewal_count,
         coalesce(sum(renewal.actual_cost) filter (where renewal.status = 'completed'), 0) as completed_renewal_cost
  from public.employee_renewal_cases renewal
  where renewal.employee_id = migrant.employee_id
) renewal_summary on true;

create or replace view public.v_hr_renewal_pipeline
with (security_invoker = true) as
select
  renewal.status,
  renewal.priority,
  count(*)::integer as case_count,
  count(*) filter (where renewal.target_completion_date < current_date)::integer as overdue_count,
  coalesce(sum(renewal.estimated_cost), 0) as estimated_cost,
  coalesce(sum(renewal.actual_cost), 0) as actual_cost
from public.employee_renewal_cases renewal
group by renewal.status, renewal.priority;

create or replace view public.v_hr_attendance_summary
with (security_invoker = true) as
select
  attendance.employee_id,
  date_trunc('month', attendance.check_in_at)::date as attendance_month,
  count(*)::integer as attendance_count,
  count(*) filter (where attendance.check_out_at is null)::integer as missing_checkout_count,
  count(*) filter (where attendance.attendance_status = 'late')::integer as late_count,
  coalesce(sum(extract(epoch from (attendance.check_out_at - attendance.check_in_at)) / 3600)
    filter (where attendance.check_out_at is not null), 0)::numeric(14,2) as worked_hours
from public.work_attendance attendance
where attendance.employee_id is not null and attendance.check_in_at is not null
group by attendance.employee_id, date_trunc('month', attendance.check_in_at)::date;

create or replace view public.v_hr_payroll_cost_summary
with (security_invoker = true) as
select
  period.id as payroll_period_id,
  period.period_code,
  period.start_date,
  period.end_date,
  term.department_id,
  department.department_name,
  count(summary.employee_id)::integer as employee_count,
  coalesce(sum(summary.gross_amount), 0) as gross_amount,
  coalesce(sum(summary.net_amount), 0) as net_amount,
  coalesce(sum(summary.overtime_earning), 0) as overtime_amount,
  coalesce(sum(summary.allowance_amount), 0) as allowance_amount,
  coalesce(sum(summary.deduction_amount), 0) as deduction_amount
from public.payroll_periods period
left join public.payroll_employee_summaries summary on summary.payroll_period_id = period.id
left join public.employee_employment_terms term
  on term.employee_id = summary.employee_id
 and term.effective_from <= period.end_date
 and (term.effective_to is null or term.effective_to >= period.start_date)
left join public.departments department on department.id = term.department_id
group by period.id, period.period_code, period.start_date, period.end_date,
         term.department_id, department.department_name;

create or replace view public.v_hr_employee_turnover
with (security_invoker = true) as
select
  date_trunc('month', coalesce(employee.end_date, employee.start_date))::date as event_month,
  count(*) filter (where employee.start_date is not null)::integer as joined_count,
  count(*) filter (where employee.end_date is not null)::integer as left_count,
  avg((coalesce(employee.end_date, current_date) - employee.start_date))
    filter (where employee.start_date is not null)::numeric(14,2) as average_tenure_days
from public.employees employee
where employee.is_current is true
group by date_trunc('month', coalesce(employee.end_date, employee.start_date))::date;

create or replace view public.v_hr_training_compliance
with (security_invoker = true) as
select
  employee.id as employee_id,
  employee.employee_code,
  employee.full_name,
  count(distinct training.id) filter (where training.result_status = 'passed')::integer as passed_course_count,
  count(distinct certification.id) filter (where certification.status = 'active')::integer as active_certification_count,
  count(distinct certification.id) filter (where certification.expires_on < current_date)::integer as expired_certification_count,
  count(distinct certification.id) filter (where certification.expires_on between current_date and current_date + 90)::integer as due_90_certification_count
from public.employees employee
left join public.employee_training_records training on training.employee_id = employee.id
left join public.employee_certifications certification on certification.employee_id = employee.id
where employee.is_current is true
group by employee.id, employee.employee_code, employee.full_name;

create or replace view public.v_hr_notification_queue
with (security_invoker = true) as
select
  notification.id,
  notification.notification_type,
  notification.employee_id,
  notification.document_id,
  notification.renewal_case_id,
  notification.recipient_profile_id,
  notification.recipient_employee_id,
  notification.channel,
  notification.title,
  notification.scheduled_at,
  notification.status,
  notification.attempt_count,
  notification.last_error_code,
  notification.created_at
from public.hr_notifications notification;

do $$
declare
  target_view text;
begin
  foreach target_view in array array[
    'v_hr_employee_360', 'v_hr_headcount_summary', 'v_hr_employee_data_quality',
    'v_hr_document_compliance', 'v_hr_document_expiry', 'v_hr_migrant_compliance',
    'v_hr_renewal_pipeline', 'v_hr_attendance_summary', 'v_hr_payroll_cost_summary',
    'v_hr_employee_turnover', 'v_hr_training_compliance', 'v_hr_notification_queue'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', target_view);
    execute format('grant select on table public.%I to service_role', target_view);
  end loop;
end
$$;

commit;
