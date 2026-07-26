insert into public.roles (role_key, role_name, description, status)
values
  ('uat_manager', 'ผู้จัดการทดสอบ UAT', 'Phase 3 test identity; writes are restricted to WEBTEST-UAT records by the server API', 'active'),
  ('uat_supervisor', 'หัวหน้างานทดสอบ UAT', 'Phase 3 test identity; scoped field-operation access only', 'active')
on conflict (role_key) do update
set role_name = excluded.role_name,
    description = excluded.description,
    status = excluded.status,
    updated_at = now();

with desired(role_key, permission_key) as (
  values
    ('uat_manager', 'farm.dashboard.view'),
    ('uat_manager', 'farm.plan.view'),
    ('uat_manager', 'farm.plan.create'),
    ('uat_manager', 'farm.plan.approve'),
    ('uat_manager', 'farm.work_order.view'),
    ('uat_manager', 'farm.work_order.create'),
    ('uat_manager', 'farm.work_order.dispatch'),
    ('uat_manager', 'farm.result.record'),
    ('uat_manager', 'farm.result.verify'),
    ('uat_manager', 'farm.result.close'),
    ('uat_manager', 'farm.weigh_ticket.link'),
    ('uat_manager', 'fuel.view'),
    ('uat_manager', 'hr.employee.view'),
    ('uat_manager', 'payroll.view'),
    ('uat_manager', 'performance.view'),
    ('uat_manager', 'report.view'),
    ('uat_manager', 'survey.view'),
    ('uat_manager', 'survey.analyze'),
    ('uat_supervisor', 'farm.dashboard.view'),
    ('uat_supervisor', 'farm.plan.view'),
    ('uat_supervisor', 'farm.work_order.view'),
    ('uat_supervisor', 'farm.result.record'),
    ('uat_supervisor', 'farm.weigh_ticket.link'),
    ('uat_supervisor', 'fuel.view'),
    ('uat_supervisor', 'hr.employee.view'),
    ('uat_supervisor', 'payroll.view'),
    ('uat_supervisor', 'survey.view'),
    ('uat_supervisor', 'survey.respond')
)
insert into public.role_permissions (role_id, permission_id, is_allowed, status)
select r.id, p.id, true, 'active'
from desired d
join public.roles r on r.role_key = d.role_key
join public.permissions p on p.permission_key = d.permission_key
on conflict (role_id, permission_id)
  where role_id is not null and permission_id is not null
do update set is_allowed = true, status = 'active';

with desired(role_key, permission_key) as (
  values
    ('uat_manager', 'farm.dashboard.view'),
    ('uat_manager', 'farm.plan.view'),
    ('uat_manager', 'farm.plan.create'),
    ('uat_manager', 'farm.plan.approve'),
    ('uat_manager', 'farm.work_order.view'),
    ('uat_manager', 'farm.work_order.create'),
    ('uat_manager', 'farm.work_order.dispatch'),
    ('uat_manager', 'farm.result.record'),
    ('uat_manager', 'farm.result.verify'),
    ('uat_manager', 'farm.result.close'),
    ('uat_manager', 'farm.weigh_ticket.link'),
    ('uat_manager', 'fuel.view'),
    ('uat_manager', 'hr.employee.view'),
    ('uat_manager', 'payroll.view'),
    ('uat_manager', 'performance.view'),
    ('uat_manager', 'report.view'),
    ('uat_manager', 'survey.view'),
    ('uat_manager', 'survey.analyze'),
    ('uat_supervisor', 'farm.dashboard.view'),
    ('uat_supervisor', 'farm.plan.view'),
    ('uat_supervisor', 'farm.work_order.view'),
    ('uat_supervisor', 'farm.result.record'),
    ('uat_supervisor', 'farm.weigh_ticket.link'),
    ('uat_supervisor', 'fuel.view'),
    ('uat_supervisor', 'hr.employee.view'),
    ('uat_supervisor', 'payroll.view'),
    ('uat_supervisor', 'survey.view'),
    ('uat_supervisor', 'survey.respond')
)
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.role_key in ('uat_manager', 'uat_supervisor')
  and not exists (
    select 1
    from desired d
    where d.role_key = r.role_key
      and d.permission_key = p.permission_key
  );
