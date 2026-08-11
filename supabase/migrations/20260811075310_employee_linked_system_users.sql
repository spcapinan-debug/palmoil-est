alter table public.profiles
  add column if not exists username text,
  add column if not exists line_id text;

update public.profiles
set username = lower(btrim(username))
where username is not null
  and username <> lower(btrim(username));

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (
    username is null
    or (
      username = lower(btrim(username))
      and username ~ '^[a-z0-9._-]{3,50}$'
    )
  );

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create unique index if not exists profiles_one_active_account_per_employee
  on public.profiles (employee_id)
  where employee_id is not null and status = 'active';

create index if not exists profiles_employee_id_idx
  on public.profiles (employee_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_employee_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_employee_id_fkey
      foreign key (employee_id) references public.employees(id) on delete restrict;
  end if;
end
$$;

with wanted(permission_key, permission_name, module_key, action_key, description) as (
  values
    ('system.user.view', 'ดูบัญชีผู้ใช้งาน', 'system.user', 'view', 'ดูบัญชีผู้ใช้งานที่ผูกกับพนักงาน'),
    ('system.user.manage', 'จัดการบัญชีผู้ใช้งาน', 'system.user', 'manage', 'สร้างและแก้ไขบัญชีผู้ใช้งาน'),
    ('system.user.role.manage', 'จัดการบทบาทผู้ใช้งาน', 'system.user', 'role_manage', 'กำหนดบทบาทให้บัญชีผู้ใช้งาน'),
    ('system.user.password.reset', 'ตั้งรหัสผ่านผู้ใช้งานใหม่', 'system.user', 'password_reset', 'ตั้งรหัสผ่านใหม่ผ่าน Supabase Auth Admin')
)
update public.permissions p
set permission_name = wanted.permission_name,
    module_key = wanted.module_key,
    action_key = wanted.action_key,
    description = wanted.description,
    status = 'active'
from wanted
where p.permission_key = wanted.permission_key;

with wanted(permission_key, permission_name, module_key, action_key, description) as (
  values
    ('system.user.view', 'ดูบัญชีผู้ใช้งาน', 'system.user', 'view', 'ดูบัญชีผู้ใช้งานที่ผูกกับพนักงาน'),
    ('system.user.manage', 'จัดการบัญชีผู้ใช้งาน', 'system.user', 'manage', 'สร้างและแก้ไขบัญชีผู้ใช้งาน'),
    ('system.user.role.manage', 'จัดการบทบาทผู้ใช้งาน', 'system.user', 'role_manage', 'กำหนดบทบาทให้บัญชีผู้ใช้งาน'),
    ('system.user.password.reset', 'ตั้งรหัสผ่านผู้ใช้งานใหม่', 'system.user', 'password_reset', 'ตั้งรหัสผ่านใหม่ผ่าน Supabase Auth Admin')
)
insert into public.permissions (
  permission_key, permission_name, module_key, action_key, description, status
)
select permission_key, permission_name, module_key, action_key, description, 'active'
from wanted
where not exists (
  select 1 from public.permissions p where p.permission_key = wanted.permission_key
);

do $$
declare
  target_profile_id constant uuid := '4a216447-bf6c-4952-857d-bfadbc793ffe';
  target_employee_id constant uuid := '707fe2c5-301f-4d3f-b094-faa88acf7a22';
  target_super_admin_role_id constant uuid := '66256cd4-f138-49f3-a5c9-66cc5b825f99';
  employee_row public.employees%rowtype;
  profile_before jsonb;
  roles_before jsonb := '[]'::jsonb;
  scopes_before jsonb := '[]'::jsonb;
begin
  select * into employee_row
  from public.employees
  where id = target_employee_id
    and employee_code = '200066';

  if not found then
    if exists (select 1 from public.profiles where id = target_profile_id) then
      raise exception 'SPC_APINAN_EMPLOYEE_NOT_FOUND';
    end if;
    return;
  end if;

  select to_jsonb(p) into profile_before
  from public.profiles p
  where p.id = target_profile_id;

  if profile_before is null then
    raise exception 'SPC_APINAN_PROFILE_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(username) = 'apinan'
      and id <> target_profile_id
  ) then
    raise exception 'SPC_APINAN_USERNAME_CONFLICT';
  end if;

  if to_regclass('public.profile_roles') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(pr)), ''[]''::jsonb) from public.profile_roles pr where pr.profile_id = $1'
      into roles_before using target_profile_id;
  end if;

  if to_regclass('public.user_access_scopes') is not null then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into scopes_before
    from public.user_access_scopes s
    where s.profile_id = target_profile_id;
  end if;

  insert into public.audit_logs (
    user_id, changed_by, action, module_name, table_name,
    entity_table, entity_id, old_value, new_value, note
  )
  values (
    target_profile_id, target_profile_id, 'system_user_repair_backup',
    'system_user', 'profiles', 'profiles', target_profile_id::text,
    jsonb_build_object(
      'profile', profile_before,
      'profile_roles', roles_before,
      'scopes', scopes_before
    ),
    '{}'::jsonb,
    'Idempotent pre-mutation backup for employee-linked account repair'
  );

  update public.profiles
  set employee_id = target_employee_id,
      full_name = employee_row.full_name,
      username = 'apinan',
      line_id = null,
      role = 'super_admin',
      status = 'active',
      updated_at = now()
  where id = target_profile_id;

  if to_regclass('public.profile_roles') is not null
     and to_regclass('public.roles') is not null then
    update public.profile_roles pr
    set is_active = false,
        effective_to = coalesce(pr.effective_to, current_date)
    from public.roles r
    where pr.role_id = r.id
      and pr.profile_id = target_profile_id
      and pr.is_active = true
      and r.role_key = 'uat_supervisor';

    update public.profile_roles
    set is_active = true,
        effective_from = coalesce(effective_from, current_date),
        effective_to = null
    where profile_id = target_profile_id
      and role_id = target_super_admin_role_id;

    if not exists (
      select 1
      from public.profile_roles
      where profile_id = target_profile_id
        and role_id = target_super_admin_role_id
    ) then
      insert into public.profile_roles (
        profile_id, role_id, effective_from, is_active
      )
      values (
        target_profile_id, target_super_admin_role_id, current_date, true
      );
    end if;
  end if;

  insert into public.audit_logs (
    user_id, changed_by, action, module_name, table_name,
    entity_table, entity_id, old_value, new_value, note
  )
  select
    target_profile_id, target_profile_id, 'system_user_repair',
    'system_user', 'profiles', 'profiles', target_profile_id::text,
    profile_before, to_jsonb(p),
    'Linked employee 200066, assigned username apinan and super_admin; password unchanged'
  from public.profiles p
  where p.id = target_profile_id;
end
$$;
