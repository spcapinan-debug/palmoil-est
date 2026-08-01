begin;

create table if not exists public.user_hr_access_scopes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  scope_type text not null check (scope_type in (
    'all_employees', 'department', 'estate', 'direct_reports', 'individual', 'self'
  )),
  department_id uuid references public.departments(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  estate_id uuid references public.estates(id) on delete restrict,
  access_level text not null default 'view' check (access_level in ('view', 'edit', 'manage')),
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (
    (scope_type = 'department' and department_id is not null and employee_id is null)
    or (scope_type = 'individual' and employee_id is not null)
    or (scope_type = 'estate' and estate_id is not null and employee_id is null)
    or (scope_type in ('all_employees', 'direct_reports', 'self') and department_id is null and employee_id is null)
  )
);

create unique index if not exists user_hr_access_scopes_unique_active_idx
  on public.user_hr_access_scopes(
    profile_id,
    scope_type,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(estate_id, '00000000-0000-0000-0000-000000000000'::uuid),
    access_level,
    effective_from
  ) where status = 'active';
create index if not exists user_hr_access_scopes_effective_idx
  on public.user_hr_access_scopes(profile_id, status, effective_from, effective_to);

alter table public.user_hr_access_scopes enable row level security;
revoke all on table public.user_hr_access_scopes from public, anon, authenticated;
grant select, insert, update, delete on table public.user_hr_access_scopes to service_role;

insert into public.roles (role_key, role_name, description, status)
values ('hr_admin', 'ผู้ดูแลระบบบริหารบุคคล', 'HR administration with explicit HR scope and sensitive-data permissions', 'active')
on conflict (role_key) do update
set role_name = excluded.role_name,
    description = excluded.description,
    status = excluded.status,
    updated_at = now();

with desired(permission_key, permission_name, action_key) as (
  values
    ('hr.dashboard.view', 'ดู Dashboard HR', 'view'),
    ('hr.employee.create', 'สร้างพนักงาน', 'create'),
    ('hr.employee.archive', 'เก็บถาวรพนักงาน', 'archive'),
    ('hr.employee.sensitive.view', 'ดูข้อมูลพนักงานอ่อนไหว', 'sensitive_view'),
    ('hr.employee.sensitive.edit', 'แก้ข้อมูลพนักงานอ่อนไหว', 'sensitive_edit'),
    ('hr.document.view', 'ดูสถานะเอกสารพนักงาน', 'view'),
    ('hr.document.upload', 'อัปโหลดเอกสารพนักงาน', 'upload'),
    ('hr.document.download', 'ดาวน์โหลดเอกสารพนักงาน', 'download'),
    ('hr.document.verify', 'ตรวจสอบเอกสารพนักงาน', 'verify'),
    ('hr.document.archive', 'เก็บถาวรเอกสารพนักงาน', 'archive'),
    ('hr.renewal.view', 'ดูกระบวนการต่ออายุ', 'view'),
    ('hr.renewal.create', 'เปิดกระบวนการต่ออายุ', 'create'),
    ('hr.renewal.manage', 'จัดการกระบวนการต่ออายุ', 'manage'),
    ('hr.renewal.approve', 'อนุมัติกระบวนการต่ออายุ', 'approve'),
    ('hr.alert.view', 'ดูการแจ้งเตือน HR', 'view'),
    ('hr.alert.manage', 'จัดการการแจ้งเตือน HR', 'manage'),
    ('hr.leave.view', 'ดูข้อมูลการลา', 'view'),
    ('hr.leave.manage', 'จัดการการลา', 'manage'),
    ('hr.leave.approve', 'อนุมัติการลา', 'approve'),
    ('hr.training.view', 'ดูข้อมูลการอบรม', 'view'),
    ('hr.training.manage', 'จัดการการอบรม', 'manage'),
    ('hr.medical.view', 'ดูข้อมูลสุขภาพการทำงาน', 'view'),
    ('hr.medical.manage', 'จัดการข้อมูลสุขภาพการทำงาน', 'manage'),
    ('hr.asset.view', 'ดูทรัพย์สินพนักงาน', 'view'),
    ('hr.asset.manage', 'จัดการทรัพย์สินพนักงาน', 'manage'),
    ('hr.case.view', 'ดูกรณีพนักงาน', 'view'),
    ('hr.case.manage', 'จัดการกรณีพนักงาน', 'manage'),
    ('hr.analytics.view', 'ดูรายงานวิเคราะห์ HR', 'view'),
    ('hr.analytics.export', 'ส่งออกรายงาน HR', 'export'),
    ('hr.data_quality.view', 'ดูรายงานคุณภาพข้อมูล HR', 'view'),
    ('hr.attendance.view', 'ดูสรุปเวลาทำงาน HR', 'view'),
    ('hr.payroll.view', 'ดูสรุปต้นทุน Payroll สำหรับ HR', 'view'),
    ('hr.settings.manage', 'จัดการตั้งค่า HR', 'manage')
)
insert into public.permissions (
  code, name, module, action, description,
  permission_key, permission_name, module_key, action_key, status
)
select permission_key, permission_name, 'hr', action_key, permission_name,
       permission_key, permission_name, 'hr', action_key, 'active'
from desired
on conflict (permission_key) where permission_key is not null do update
set code = excluded.code,
    name = excluded.name,
    module = excluded.module,
    action = excluded.action,
    description = excluded.description,
    permission_name = excluded.permission_name,
    module_key = excluded.module_key,
    action_key = excluded.action_key,
    status = excluded.status;

with role_matrix(role_key, permission_key) as (
  select role_key, permission_key
  from (values ('super_admin'), ('hr_admin')) roles(role_key)
  cross join (
    select permission_key from public.permissions where permission_key like 'hr.%'
  ) permissions
  union all values
    ('hr_officer', 'hr.dashboard.view'),
    ('hr_officer', 'hr.employee.view'),
    ('hr_officer', 'hr.employee.edit'),
    ('hr_officer', 'hr.employee.create'),
    ('hr_officer', 'hr.document.view'),
    ('hr_officer', 'hr.document.upload'),
    ('hr_officer', 'hr.document.download'),
    ('hr_officer', 'hr.document.verify'),
    ('hr_officer', 'hr.renewal.view'),
    ('hr_officer', 'hr.renewal.create'),
    ('hr_officer', 'hr.renewal.manage'),
    ('hr_officer', 'hr.alert.view'),
    ('hr_officer', 'hr.alert.manage'),
    ('hr_officer', 'hr.leave.view'),
    ('hr_officer', 'hr.leave.manage'),
    ('hr_officer', 'hr.training.view'),
    ('hr_officer', 'hr.training.manage'),
    ('hr_officer', 'hr.data_quality.view'),
    ('hr_officer', 'hr.attendance.view'),
    ('hr_officer', 'hr.payroll.view'),
    ('manager', 'hr.dashboard.view'),
    ('manager', 'hr.employee.view'),
    ('manager', 'hr.document.view'),
    ('manager', 'hr.renewal.view'),
    ('manager', 'hr.alert.view'),
    ('manager', 'hr.leave.view'),
    ('manager', 'hr.leave.approve'),
    ('manager', 'hr.analytics.view'),
    ('manager', 'hr.data_quality.view'),
    ('manager', 'hr.attendance.view'),
    ('supervisor', 'hr.employee.view'),
    ('supervisor', 'hr.leave.view'),
    ('supervisor', 'hr.attendance.view'),
    ('payroll_officer', 'hr.employee.view'),
    ('payroll_officer', 'hr.analytics.view'),
    ('payroll_officer', 'hr.payroll.view')
)
insert into public.role_permissions (role_id, permission_id, is_allowed, status)
select role.id, permission.id, true, 'active'
from role_matrix matrix
join public.roles role on role.role_key = matrix.role_key
join public.permissions permission on permission.permission_key = matrix.permission_key
on conflict (role_id, permission_id)
  where role_id is not null and permission_id is not null
do update set is_allowed = true, status = 'active';

commit;
