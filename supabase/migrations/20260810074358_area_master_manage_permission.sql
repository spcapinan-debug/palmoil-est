with desired(permission_key, permission_name, module_key, action_key, description) as (
  values
    ('farm.area.manage', 'Manage Area Master Blocks', 'farm', 'area_manage', 'Edit canonical Block master records through the authenticated Area action')
)
insert into public.permissions (
  code, name, module, action, description,
  permission_key, permission_name, module_key, action_key, status
)
select
  permission_key, permission_name, module_key, action_key, description,
  permission_key, permission_name, module_key, action_key, 'active'
from desired d
where not exists (
  select 1 from public.permissions p
  where p.permission_key = d.permission_key or p.code = d.permission_key
);

with desired(role_key, permission_key) as (
  values
    ('super_admin', 'farm.area.manage'),
    ('director', 'farm.area.manage'),
    ('manager', 'farm.area.manage'),
    ('uat_manager', 'farm.area.manage')
)
insert into public.role_permissions (role_id, permission_id, is_allowed, status)
select r.id, p.id, true, 'active'
from desired d
join public.roles r on r.role_key = d.role_key and r.status = 'active'
join public.permissions p on p.permission_key = d.permission_key and p.status = 'active'
on conflict (role_id, permission_id)
  where role_id is not null and permission_id is not null
do update set is_allowed = true, status = 'active';
