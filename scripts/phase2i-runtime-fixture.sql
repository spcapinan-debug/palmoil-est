-- Phase 2I-D/E synthetic runtime fixture for the isolated RC staging project.
-- This file is never a migration. Run only through phase2i-staging-sql.sh.
begin;

do $phase2i_runtime_target$
begin
  if current_database() is null then
    raise exception 'PHASE2I_STAGING_DATABASE_REQUIRED';
  end if;
end
$phase2i_runtime_target$;

update public.blocks
set rspo_status='RC2I-CERTIFIED', planting_year=2020
where id='00000000-0000-4000-8000-000000000002'
  and note='PHASE2I_SYNTHETIC_PRE_UPGRADE';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '2a000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'rc2i-manager@example.invalid',
  extensions.crypt(
    'RC2I-runtime-only-not-a-production-secret', extensions.gen_salt('bf')
  ),
  transaction_timestamp(),
  '{"provider":"email","providers":["email"],"fixture":"RC2I"}'::jsonb,
  '{"full_name":"RC2I Synthetic Manager","fixture":"RC2I"}'::jsonb,
  transaction_timestamp(), transaction_timestamp(), '', '', '', '', '', false, false
) on conflict (id) do nothing;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000','2a000000-0000-4000-8000-000000000002',
   'authenticated','authenticated','rc2i-supervisor@example.invalid',
   extensions.crypt('RC2I-runtime-only-not-a-production-secret',extensions.gen_salt('bf')),
   transaction_timestamp(),'{"provider":"email","providers":["email"],"fixture":"RC2I"}'::jsonb,
   '{"full_name":"RC2I Synthetic Supervisor","fixture":"RC2I"}'::jsonb,
   transaction_timestamp(),transaction_timestamp(),'','','','','',false,false),
  ('00000000-0000-0000-0000-000000000000','2a000000-0000-4000-8000-000000000003',
   'authenticated','authenticated','rc2i-payroll@example.invalid',
   extensions.crypt('RC2I-runtime-only-not-a-production-secret',extensions.gen_salt('bf')),
   transaction_timestamp(),'{"provider":"email","providers":["email"],"fixture":"RC2I"}'::jsonb,
   '{"full_name":"RC2I Synthetic Payroll","fixture":"RC2I"}'::jsonb,
   transaction_timestamp(),transaction_timestamp(),'','','','','',false,false),
  ('00000000-0000-0000-0000-000000000000','2a000000-0000-4000-8000-000000000004',
   'authenticated','authenticated','rc2i-viewer@example.invalid',
   extensions.crypt('RC2I-runtime-only-not-a-production-secret',extensions.gen_salt('bf')),
   transaction_timestamp(),'{"provider":"email","providers":["email"],"fixture":"RC2I"}'::jsonb,
   '{"full_name":"RC2I Synthetic Viewer","fixture":"RC2I"}'::jsonb,
   transaction_timestamp(),transaction_timestamp(),'','','','','',false,false)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, status, username)
values
  ('2a000000-0000-4000-8000-000000000001','RC2I Synthetic Manager','manager','active','rc2i.manager'),
  ('2a000000-0000-4000-8000-000000000002','RC2I Synthetic Supervisor','supervisor','active','rc2i.supervisor'),
  ('2a000000-0000-4000-8000-000000000003','RC2I Synthetic Payroll','payroll_officer','active','rc2i.payroll'),
  ('2a000000-0000-4000-8000-000000000004','RC2I Synthetic Viewer','viewer','active','rc2i.viewer')
on conflict (id) do update set
  full_name=excluded.full_name, role=excluded.role, status='active', username=excluded.username;

insert into public.roles (id,role_key,role_name,description,status)
values
  ('2a000000-0000-4000-8000-000000000061','rc2i_manager','RC2I Manager','RC2I_SYNTHETIC_RUNTIME','active'),
  ('2a000000-0000-4000-8000-000000000062','rc2i_supervisor','RC2I Supervisor','RC2I_SYNTHETIC_RUNTIME','active'),
  ('2a000000-0000-4000-8000-000000000063','rc2i_payroll','RC2I Payroll','RC2I_SYNTHETIC_RUNTIME','active'),
  ('2a000000-0000-4000-8000-000000000064','rc2i_viewer','RC2I Viewer','RC2I_SYNTHETIC_RUNTIME','active')
on conflict (id) do nothing;

insert into public.permissions (
  id,code,name,module,action,permission_key,permission_name,module_key,action_key,status
) values
  ('2a000000-0000-4000-8000-000000000075','farm.result.record','Result record','farm','result.record','farm.result.record','Result record','farm','result.record','active'),
  ('2a000000-0000-4000-8000-000000000076','farm.result.verify','Result verify','farm','result.verify','farm.result.verify','Result verify','farm','result.verify','active'),
  ('2a000000-0000-4000-8000-000000000077','survey.respond','Survey respond','survey','respond','survey.respond','Survey respond','survey','respond','active'),
  ('2a000000-0000-4000-8000-000000000078','survey.verify','Survey verify','survey','verify','survey.verify','Survey verify','survey','verify','active'),
  ('2a000000-0000-4000-8000-000000000079','survey.finding.manage','Finding manage','survey','finding.manage','survey.finding.manage','Finding manage','survey','finding.manage','active'),
  ('2a000000-0000-4000-8000-00000000007a','payroll.view','Payroll view','payroll','view','payroll.view','Payroll view','payroll','view','active'),
  ('2a000000-0000-4000-8000-00000000007b','payroll.calculate','Payroll calculate','payroll','calculate','payroll.calculate','Payroll calculate','payroll','calculate','active'),
  ('2a000000-0000-4000-8000-00000000007c','payroll.approve','Payroll approve','payroll','approve','payroll.approve','Payroll approve','payroll','approve','active'),
  ('2a000000-0000-4000-8000-00000000007d','payroll.close','Payroll close','payroll','close','payroll.close','Payroll close','payroll','close','active'),
  ('2a000000-0000-4000-8000-00000000007e','performance.view','Performance view','performance','view','performance.view','Performance view','performance','view','active')
on conflict (id) do nothing;

insert into public.profile_roles (id,profile_id,role_id,effective_from,is_active,assigned_by_profile_id)
values
  ('2a000000-0000-4000-8000-000000000081','2a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000061',date '2026-01-01',true,'2a000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000082','2a000000-0000-4000-8000-000000000002','2a000000-0000-4000-8000-000000000062',date '2026-01-01',true,'2a000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000083','2a000000-0000-4000-8000-000000000003','2a000000-0000-4000-8000-000000000063',date '2026-01-01',true,'2a000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000084','2a000000-0000-4000-8000-000000000004','2a000000-0000-4000-8000-000000000064',date '2026-01-01',true,'2a000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.role_permissions (id,role_id,permission_id,is_allowed,status)
select md5('RC2I:'||role_id::text||':'||permission_id::text)::uuid,
  role_id,permission_id,true,'active'
from (values
  ('2a000000-0000-4000-8000-000000000061'::uuid,'2a000000-0000-4000-8000-000000000075'::uuid),
  ('2a000000-0000-4000-8000-000000000061'::uuid,'2a000000-0000-4000-8000-000000000076'::uuid),
  ('2a000000-0000-4000-8000-000000000061'::uuid,'2a000000-0000-4000-8000-000000000077'::uuid),
  ('2a000000-0000-4000-8000-000000000061'::uuid,'2a000000-0000-4000-8000-000000000078'::uuid),
  ('2a000000-0000-4000-8000-000000000061'::uuid,'2a000000-0000-4000-8000-000000000079'::uuid),
  ('2a000000-0000-4000-8000-000000000061'::uuid,'2a000000-0000-4000-8000-00000000007e'::uuid),
  ('2a000000-0000-4000-8000-000000000062'::uuid,'2a000000-0000-4000-8000-000000000075'::uuid),
  ('2a000000-0000-4000-8000-000000000062'::uuid,'2a000000-0000-4000-8000-000000000076'::uuid),
  ('2a000000-0000-4000-8000-000000000062'::uuid,'2a000000-0000-4000-8000-000000000077'::uuid),
  ('2a000000-0000-4000-8000-000000000062'::uuid,'2a000000-0000-4000-8000-000000000078'::uuid),
  ('2a000000-0000-4000-8000-000000000062'::uuid,'2a000000-0000-4000-8000-000000000079'::uuid),
  ('2a000000-0000-4000-8000-000000000062'::uuid,'2a000000-0000-4000-8000-00000000007e'::uuid),
  ('2a000000-0000-4000-8000-000000000063'::uuid,'2a000000-0000-4000-8000-00000000007a'::uuid),
  ('2a000000-0000-4000-8000-000000000063'::uuid,'2a000000-0000-4000-8000-00000000007b'::uuid),
  ('2a000000-0000-4000-8000-000000000063'::uuid,'2a000000-0000-4000-8000-00000000007c'::uuid),
  ('2a000000-0000-4000-8000-000000000063'::uuid,'2a000000-0000-4000-8000-00000000007d'::uuid),
  ('2a000000-0000-4000-8000-000000000063'::uuid,'2a000000-0000-4000-8000-00000000007e'::uuid),
  ('2a000000-0000-4000-8000-000000000064'::uuid,'2a000000-0000-4000-8000-00000000007e'::uuid)
) permission_map(role_id,permission_id)
on conflict (id) do nothing;

insert into public.employees (
  id, employee_code, full_name, employee_type, position, daily_wage,
  normal_hours_per_day, worker_type, payment_type,
  status, start_date, effective_from, is_current
) values
  ('2a000000-0000-4000-8000-000000000011','RC2I-EMP-002','RC2I Synthetic Driver',
   'employee','driver',480,8,'employee','hourly','active',date '2026-01-01',date '2026-01-01',true),
  ('2a000000-0000-4000-8000-000000000012','RC2I-EMP-003','RC2I Synthetic Field Worker',
   'employee','field_worker',420,8,'employee','daily','active',date '2026-01-01',date '2026-01-01',true)
on conflict (id) do update set status='active', is_current=true;

insert into public.contractors (
  id, contractor_code, contractor_name, contractor_type, status, note
) values (
  '2a000000-0000-4000-8000-000000000021','RC2I-CON-001',
  'RC2I Synthetic Contractor','labor_equipment','active','RC2I_SYNTHETIC_RUNTIME'
) on conflict (id) do nothing;

insert into public.teams (
  id, team_code, team_name, team_type, supervisor_employee_id, status
) values (
  '2a000000-0000-4000-8000-000000000031','RC2I-TEAM-001',
  'RC2I Synthetic Mixed Team','mixed','2a000000-0000-4000-8000-000000000011','active'
) on conflict (id) do nothing;

insert into public.team_members (id, team_id, employee_id, member_role, start_date, is_active)
values
  ('2a000000-0000-4000-8000-000000000032','2a000000-0000-4000-8000-000000000031',
   '00000000-0000-4000-8000-000000000008','worker',date '2026-01-01',true),
  ('2a000000-0000-4000-8000-000000000033','2a000000-0000-4000-8000-000000000031',
   '2a000000-0000-4000-8000-000000000011','driver',date '2026-01-01',true),
  ('2a000000-0000-4000-8000-000000000034','2a000000-0000-4000-8000-000000000031',
   '2a000000-0000-4000-8000-000000000012','worker',date '2026-01-01',true)
on conflict (id) do update set is_active=true;

insert into public.vehicles (
  id, vehicle_code, vehicle_name, vehicle_type, status, fuel_type,
  fuel_measurement_basis, standard_liter_per_hour, standard_km_per_liter,
  requires_hour_meter, requires_odometer, note
) values
  ('2a000000-0000-4000-8000-000000000041','RC2I-VEH-ROAD',
   'RC2I Synthetic Road Vehicle','truck','active','diesel','distance_km',null,4,
   false,true,'RC2I_SYNTHETIC_RUNTIME'),
  ('2a000000-0000-4000-8000-000000000042','RC2I-VEH-DUAL',
   'RC2I Synthetic Dual Meter Vehicle','utility','active','diesel','engine_hours',4,4,
   true,true,'RC2I_SYNTHETIC_RUNTIME')
on conflict (id) do update set
  status='active', fuel_measurement_basis=excluded.fuel_measurement_basis,
  standard_liter_per_hour=excluded.standard_liter_per_hour,
  standard_km_per_liter=excluded.standard_km_per_liter,
  requires_hour_meter=excluded.requires_hour_meter,
  requires_odometer=excluded.requires_odometer;

insert into public.budget_years (
  id, fiscal_year, budget_name, effective_from, effective_to, status,
  age_basis_mode, rule_engine_status, snapshot_required, configuration_json, note
) values (
  'RC2I-BY-2569','2569','RC2I Synthetic Runtime Budget',date '2026-01-01',date '2026-12-31',
  'active','fiscal_year','active',true,'{"fixture":"RC2I"}'::jsonb,'RC2I_SYNTHETIC_RUNTIME'
) on conflict (id) do update set status='active', rule_engine_status='active';

insert into public.budget_rate_rule_sets (
  id, budget_year_id, fiscal_year, rule_set_code, rule_set_name,
  effective_from, effective_to, version_no, status, source_document_payload, description,
  approved_by_profile_id, approved_at, activated_by_profile_id, activated_at
) values (
  '2a000000-0000-4000-8000-000000000051','RC2I-BY-2569','2569',
  'RC2I-RULESET-01','RC2I Synthetic Runtime Rule Set',date '2026-01-01',date '2026-12-31',
  1,'active','{"fixture":"RC2I"}'::jsonb,'RC2I_SYNTHETIC_RUNTIME',
  '2a000000-0000-4000-8000-000000000001',transaction_timestamp(),
  '2a000000-0000-4000-8000-000000000001',transaction_timestamp()
) on conflict (id) do nothing;

insert into public.budget_rate_rules (
  id, rule_set_id, rule_code, rule_name, activity_id, activity_code_snapshot,
  activity_name_snapshot, rate_type, rate_dimension_key, unit_name,
  calculation_method, comparison_basis, condition_mode, condition_name,
  rate_current, rate_proposed, rate_approved, priority, needs_mapping,
  effective_from, effective_to, status, source_payload,
  approved_by_profile_id, approved_at, note
) values (
  '2a000000-0000-4000-8000-000000000052','2a000000-0000-4000-8000-000000000051',
  'RC2I-RULE-01','RC2I Synthetic Block Rule',
  '00000000-0000-4000-8000-000000000003','RC01','RC Synthetic Activity',
  'labor','default','rai','quantity','area_rai','specific_blocks','RC2I Block',
  125,125,125,10,false,date '2026-01-01',date '2026-12-31','active',
  '{"fixture":"RC2I"}'::jsonb,'2a000000-0000-4000-8000-000000000001',
  transaction_timestamp(),'RC2I_SYNTHETIC_RUNTIME'
) on conflict (id) do nothing;

insert into public.budget_rate_rule_blocks (id, rule_id, block_id, is_included, note)
values (
  '2a000000-0000-4000-8000-000000000053','2a000000-0000-4000-8000-000000000052',
  '00000000-0000-4000-8000-000000000002',true,'RC2I_SYNTHETIC_RUNTIME'
) on conflict (id) do nothing;

insert into public.budget_activity_rates (
  id, budget_year_id, fiscal_year, rate_code, activity_id, activity_code,
  activity_name, rate_type, area_rai, tree_count, unit_name, calculation_method,
  comparison_basis, rate_amount, effective_from, effective_to, version_no,
  is_current, approval_status, status, rule_set_id, rule_id,
  rate_dimension_key, condition_mode, priority, rate_current, rate_proposed,
  rate_approved, condition_json, rule_sync_status, approved_by_profile_id,
  approved_at, note
) values (
  'rc2i-runtime-rate','RC2I-BY-2569','2569','RC2I-RATE-01',
  '00000000-0000-4000-8000-000000000003','RC01','RC Synthetic Activity',
  'labor',10,1000,'rai','quantity',null,125,date '2026-01-01',date '2026-12-31',1,
  true,'approved','active','2a000000-0000-4000-8000-000000000051',
  '2a000000-0000-4000-8000-000000000052','default','specific_blocks',10,
  125,125,125,'{"fixture":"RC2I"}'::jsonb,'synced',
  '2a000000-0000-4000-8000-000000000001',transaction_timestamp(),'RC2I_SYNTHETIC_RUNTIME'
) on conflict (id) do nothing;

insert into public.budget_rate_roles (
  id, budget_rate_id, team_id, worker_group_name, line_type, rate_category,
  payee_type, role_name, rate_amount, uom, calculation_method,
  is_hourly_enabled, affects_payroll, status, note
) values
  ('rc2i-rate-role-daily','rc2i-runtime-rate','2a000000-0000-4000-8000-000000000031',
   'RC2I Field Team','wage','daily','employee','field_worker',420,'baht/day','daily',false,true,'active','RC2I_SYNTHETIC_RUNTIME'),
  ('rc2i-rate-role-hourly','rc2i-runtime-rate','2a000000-0000-4000-8000-000000000031',
   'RC2I Driver Team','wage','hourly','employee','driver',60,'baht/hour','hours',true,true,'active','RC2I_SYNTHETIC_RUNTIME'),
  ('rc2i-rate-role-piece','rc2i-runtime-rate','2a000000-0000-4000-8000-000000000031',
   'RC2I Piece Team','wage','piece_rate','contractor','contractor_worker',25,'baht/rai','quantity',false,true,'active','RC2I_SYNTHETIC_RUNTIME')
on conflict (id) do nothing;

update public.budget_activity_rates
set rule_sync_status='synced', last_rule_synced_at=transaction_timestamp()
where id='rc2i-runtime-rate';

select public.sync_budget_rate_rule_blocks('rc2i-runtime-rate');

do $phase2i_runtime_assert$
declare
  v_readiness text;
begin
  select readiness_status into v_readiness
  from public.v_budget_rate_block_materialization_readiness
  where budget_rate_id='rc2i-runtime-rate';
  if v_readiness is distinct from 'READY' then
    raise exception 'PHASE2I_RUNTIME_RATE_NOT_READY: %', v_readiness;
  end if;
  if (select count(*) from public.budget_rate_roles where budget_rate_id='rc2i-runtime-rate' and status='active') < 3
    or (select count(*) from public.employees where employee_code like 'RC2I-%' and status='active') < 2
    or (select count(*) from public.vehicles where vehicle_code like 'RC2I-%' and status='active') < 2
  then
    raise exception 'PHASE2I_RUNTIME_FIXTURE_INCOMPLETE';
  end if;
end
$phase2i_runtime_assert$;

commit;
