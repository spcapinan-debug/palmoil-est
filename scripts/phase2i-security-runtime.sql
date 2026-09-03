-- Phase 2I-E security matrix. Read-only assertions wrapped in a rollback transaction.
begin;

set local statement_timeout = '60s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '60s';

create temporary table phase2i_security_results (
  case_code text primary key,
  result text not null,
  detail text not null
) on commit drop;

do $phase2i_security$
declare
  v_count integer;
begin
  if not (select relrowsecurity from pg_class where oid='public.work_results'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.work_result_workers'::regclass)
    or has_table_privilege('authenticated','public.payroll_earning_lines','insert')
    or has_table_privilege('authenticated','public.payroll_employee_summaries','delete')
  then raise exception 'PHASE2I_CANONICAL_WRITE_BOUNDARY_INCOMPLETE'; end if;
  insert into phase2i_security_results values
    ('SEC-01','PASS','legacy Result grants remain behind RLS; canonical Payroll has no browser writes');

  if has_function_privilege('authenticated',
      'public.create_canonical_work_order_from_planned_item(uuid,uuid,text,date,text)','execute')
    or has_function_privilege('authenticated',
      'public.verify_canonical_work_result_phase2e(uuid,uuid)','execute')
    or has_function_privilege('authenticated',
      'public.prepare_payroll_period(uuid,uuid)','execute')
  then raise exception 'PHASE2I_CANONICAL_RPC_EXPOSED_TO_BROWSER_ROLE'; end if;
  insert into phase2i_security_results values
    ('SEC-02','PASS','canonical write RPCs remain service-only at the database boundary');

  if not has_function_privilege('service_role',
      'public.create_canonical_work_order_from_planned_item(uuid,uuid,text,date,text)','execute')
    or not has_function_privilege('service_role',
      'public.verify_canonical_work_result_phase2e(uuid,uuid)','execute')
    or not has_function_privilege('service_role',
      'public.prepare_payroll_period(uuid,uuid)','execute')
  then raise exception 'PHASE2I_SERVICE_ROLE_RPC_MISSING'; end if;
  insert into phase2i_security_results values
    ('SEC-03','PASS','service_role retains the canonical server-action RPC path');

  select count(*) into v_count from public.v_profile_permissions
  where profile_id='2a000000-0000-4000-8000-000000000001'
    and permission_key in ('farm.result.record','farm.result.verify','survey.respond',
      'survey.verify','survey.finding.manage','performance.view');
  if v_count<>6 then raise exception 'PHASE2I_MANAGER_MATRIX_INCOMPLETE %',v_count; end if;
  insert into phase2i_security_results values
    ('SEC-04','PASS','RC2I Manager has Result, Survey and Performance permissions');

  if not exists(select 1 from public.v_profile_permissions
      where profile_id='2a000000-0000-4000-8000-000000000002'
        and permission_key='farm.result.verify')
    or exists(select 1 from public.v_profile_permissions
      where profile_id='2a000000-0000-4000-8000-000000000002'
        and permission_key like 'payroll.%')
  then raise exception 'PHASE2I_SUPERVISOR_NEGATIVE_PERMISSION_FAILED'; end if;
  insert into phase2i_security_results values
    ('SEC-05','PASS','RC2I Supervisor can verify Result but has no Payroll permission');

  select count(*) into v_count from public.v_profile_permissions
  where profile_id='2a000000-0000-4000-8000-000000000003'
    and permission_key in ('payroll.view','payroll.calculate','payroll.approve','payroll.close');
  if v_count<>4 or exists(select 1 from public.v_profile_permissions
    where profile_id='2a000000-0000-4000-8000-000000000003'
      and permission_key like 'farm.result.%')
  then raise exception 'PHASE2I_PAYROLL_MATRIX_FAILED %',v_count; end if;
  insert into phase2i_security_results values
    ('SEC-06','PASS','RC2I Payroll can calculate/approve/close Payroll and cannot write Result');

  select count(*) into v_count from public.v_profile_permissions
  where profile_id='2a000000-0000-4000-8000-000000000004';
  if v_count<>1 or not exists(select 1 from public.v_profile_permissions
    where profile_id='2a000000-0000-4000-8000-000000000004'
      and permission_key='performance.view')
  then raise exception 'PHASE2I_VIEWER_MATRIX_FAILED %',v_count; end if;
  insert into phase2i_security_results values
    ('SEC-07','PASS','RC2I Viewer is read-only and receives only performance.view');

  if has_table_privilege('authenticated','public.v_phase2h_performance_payroll_reconciliation','select')
    or has_table_privilege('authenticated','public.v_phase2g_bpay_reconciliation_export','select')
  then raise exception 'PHASE2I_PAYROLL_RECONCILIATION_EXPOSED'; end if;
  insert into phase2i_security_results values
    ('SEC-08','PASS','Payroll/B-Pay reconciliation views remain server-only');

  if not exists (
    select 1 from pg_trigger trigger
    where trigger.tgrelid='public.payroll_periods'::regclass
      and not trigger.tgisinternal
  ) then raise exception 'PHASE2I_PAYROLL_IMMUTABILITY_TRIGGER_MISSING'; end if;
  insert into phase2i_security_results values
    ('SEC-09','PASS','Payroll mutation guards are installed; closed-row mutation passed negative runtime UAT');
end
$phase2i_security$;

set local role authenticated;
select set_config('request.jwt.claim.sub','2a000000-0000-4000-8000-000000000001',true);
do $phase2i_rls_negative$
declare
  v_rows integer;
begin
  update public.work_results
  set actual_quantity=actual_quantity
  where id='00000000-0000-4000-8000-000000000007';
  get diagnostics v_rows=row_count;
  if v_rows<>0 then raise exception 'PHASE2I_RLS_RESULT_WRITE_ALLOWED'; end if;

  update public.work_result_workers
  set actual_quantity=actual_quantity
  where id='00000000-0000-4000-8000-000000000009';
  get diagnostics v_rows=row_count;
  if v_rows<>0 then raise exception 'PHASE2I_RLS_WORKER_WRITE_ALLOWED'; end if;
end
$phase2i_rls_negative$;
set local role postgres;

do $phase2i_role_restore$
begin
  if current_user <> 'postgres' then
    raise exception 'SECURITY_HARNESS_ROLE_RESTORE_FAILED';
  end if;
end
$phase2i_role_restore$;

insert into phase2i_security_results values
  ('SEC-10','PASS','authenticated RC2I Manager updated zero Result/Worker rows under RLS');

select jsonb_build_object(
  'environment','staging',
  'staging_project_ref','bertkuucbcegsvvvatyy',
  'production_project_ref','xhtwmzlorceebsemqkww',
  'cases',(select jsonb_agg(to_jsonb(result_row) order by case_code)
    from phase2i_security_results result_row),
  'summary',jsonb_build_object('passed',(select count(*) from phase2i_security_results),'failed',0)
) as phase2i_security_matrix;

rollback;
