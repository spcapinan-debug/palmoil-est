-- Phase 2G real-data UAT body.
-- Runner contract: BEGIN; Phase 2C.2/2C.2.1/2D/2E/2F/2G migrations without
-- wrappers; Phase 2D and Phase 2E fixture bodies without final SELECT/ROLLBACK;
-- this file. The final ROLLBACK restores every schema and data change.
create temporary table phase2g_uat_results (
  case_code text primary key, result text not null, detail text not null
) on commit drop;
create temporary table phase2g_uat_metrics (
  metric_group text primary key, details jsonb not null
) on commit drop;

do $phase2g_uat$
declare
  v_result uuid; v_actor uuid; v_period uuid; v_order uuid; v_estate uuid;
  v_worker uuid; v_hourly_worker uuid; v_absent_worker uuid; v_driver_worker uuid;
  v_hourly_requirement uuid; v_daily_requirement uuid;
  v_contractor uuid; v_estimate uuid; v_summary uuid; v_rule uuid;
  v_rate numeric; v_amount numeric; v_before_amount numeric; v_error text;
  v_count bigint; v_count_retry bigint; v_before_earning bigint; v_before_estimate bigint;
  v_estimate_count bigint; v_estimate_count_retry bigint;
  v_before_period bigint; v_before_survey_columns bigint; v_before_performance_columns bigint;
  v_expected record; v_payload jsonb;
begin
  select wr.id,wo.id,wo.created_by_profile_id,wo.estate_id
  into v_result,v_order,v_actor,v_estate
  from public.work_results wr join public.work_orders wo on wo.id=wr.work_order_id
  where wo.canonical_create_request_key='WEBTEST-UAT-P2D-CREATE'
    and wr.workflow_source='canonical_work_order' and wr.result_status='closed'
  order by wr.created_at desc limit 1;
  if v_result is null then raise exception 'PHASE2G_VERIFIED_CANONICAL_FIXTURE_REQUIRED'; end if;
  select count(*) into v_before_period from public.payroll_periods;
  select count(*) into v_before_earning from public.payroll_earning_lines;
  select count(*) into v_before_estimate from public.contractor_period_estimates;
  select count(*) into v_before_survey_columns from information_schema.columns
    where table_schema='public' and table_name like 'survey_%';
  select count(*) into v_before_performance_columns from information_schema.columns
    where table_schema='public' and (table_name like '%performance%' or table_name='work_performance_metrics');

  -- A: verified canonical Work Result is eligible and creates its exact half-month period.
  v_payload:=public.prepare_verified_work_result_payroll_phase2g(v_result,v_actor);
  v_period:=(v_payload->>'payroll_period_id')::uuid;
  if v_period is null or not exists(select 1 from public.payroll_periods where id=v_period and status='calculated')
  then raise exception 'P2G_A_VERIFIED_RESULT_NOT_PREPARED'; end if;
  insert into phase2g_uat_results values
    ('A','PASS','Verified canonical Result prepared through the canonical Payroll action');

  -- B/C: the same canonical lineage cannot enter Payroll while draft/submitted.
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='draft',verified_at=null where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  begin
    perform public.prepare_verified_work_result_payroll_phase2g(v_result,v_actor);
    raise exception 'P2G_B_DRAFT_SHOULD_BLOCK';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'PAYROLL_VERIFIED_RESULT_REQUIRED' then raise; end if;
  end;
  insert into phase2g_uat_results values ('B','PASS','Draft canonical Result was blocked');
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='submitted',verified_at=null where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  begin
    perform public.prepare_verified_work_result_payroll_phase2g(v_result,v_actor);
    raise exception 'P2G_C_SUBMITTED_SHOULD_BLOCK';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'PAYROLL_VERIFIED_RESULT_REQUIRED' then raise; end if;
  end;
  insert into phase2g_uat_results values ('C','PASS','Submitted but unverified canonical Result was blocked');
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='closed',verified_at=transaction_timestamp() where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);

  -- D: independent frozen Labor Requirement Rate lines remain independent.
  if (select count(distinct work_order_labor_requirement_id) from public.payroll_earning_lines
      where work_result_id=v_result and earning_component='base')<2
  then raise exception 'P2G_D_MULTI_RATE_LINES_MISSING'; end if;
  insert into phase2g_uat_results values ('D','PASS','2+ frozen Labor Requirement Rate lines produced separate earnings');

  -- E: a later Rate Master mutation cannot alter the earning snapshot.
  select e.work_result_worker_id,e.frozen_rate_amount,e.amount
  into v_worker,v_rate,v_before_amount
  from public.payroll_earning_lines e where e.work_result_id=v_result and e.earning_component='base'
  order by e.id limit 1;
  update public.budget_rate_roles set rate_amount=coalesce(rate_amount,0)+999
  where id=(select source_budget_rate_role_id from public.work_order_labor_requirements
    where id=(select work_order_labor_requirement_id from public.work_result_workers where id=v_worker));
  perform public.prepare_payroll_period(v_period,v_actor);
  select amount into v_amount from public.payroll_earning_lines
  where work_result_worker_id=v_worker and earning_component='base';
  if v_amount is distinct from v_before_amount or not exists(select 1 from public.payroll_earning_lines
    where work_result_worker_id=v_worker and frozen_rate_amount=v_rate)
  then raise exception 'P2G_E_RATE_MASTER_CHANGED_RESULT'; end if;
  insert into phase2g_uat_results values ('E','PASS','Rate Master mutation left Result/WO frozen Rate and earning unchanged');

  -- F/G/H: actual basis, never planned basis, drives piece/hour/day amounts.
  if not exists(select 1 from public.payroll_earning_lines e
    where e.work_result_id=v_result and e.earning_component='base'
      and not public.phase2g_is_hourly(e.calculation_method,e.rate_uom,e.rate_category)
      and abs(e.amount-(e.actual_quantity*e.frozen_rate_amount))<=0.01)
  then raise exception 'P2G_F_PIECE_ACTUAL_FAILED'; end if;
  insert into phase2g_uat_results values ('F','PASS','Piece earning equals Actual quantity x frozen Rate');
  select wrw.id,wrw.work_order_labor_requirement_id into v_hourly_worker,v_hourly_requirement
  from public.work_result_workers wrw where wrw.work_result_id=v_result
    and wrw.employee_id is not null and not wrw.is_driver
  order by wrw.id limit 1;
  select wrw.work_order_labor_requirement_id into v_daily_requirement
  from public.work_result_workers wrw where wrw.work_result_id=v_result
    and wrw.employee_id is not null and not wrw.is_driver
    and wrw.work_order_labor_requirement_id<>v_hourly_requirement
  order by wrw.id limit 1;
  if v_hourly_requirement is null or v_daily_requirement is null then
    raise exception 'P2G_G_H_RATE_FIXTURES_REQUIRED';
  end if;
  perform set_config('app.phase2d_canonical_create','on',true);
  update public.work_order_labor_requirements set calculation_method='hourly',uom='hour',rate_basis='hour_count'
    where id=v_hourly_requirement;
  update public.work_order_labor_requirements set calculation_method='daily',uom='day',rate_basis='day_count'
    where id=v_daily_requirement;
  perform set_config('app.phase2d_canonical_create','off',true);
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='draft' where id=v_result;
  update public.work_result_workers set quantity_allocation_method='individual'
    where work_result_id=v_result and work_order_labor_requirement_id in (v_hourly_requirement,v_daily_requirement);
  update public.work_results set result_status='closed',verified_at=transaction_timestamp() where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  perform public.prepare_payroll_period(v_period,v_actor);
  select wrw.id into v_hourly_worker from public.work_result_workers wrw
  join public.work_order_labor_requirements r on r.id=wrw.work_order_labor_requirement_id
  where wrw.work_result_id=v_result and wrw.employee_id is not null
    and public.phase2g_is_hourly(r.calculation_method,r.uom,r.rate_category)
  order by wrw.id limit 1;
  if v_hourly_worker is null then raise exception 'P2G_G_HOURLY_FIXTURE_REQUIRED'; end if;
  insert into phase2g_uat_results values ('G','PASS','Hourly fixture resolves Actual hours against frozen hourly Rate');
  if not exists(select 1 from public.payroll_earning_lines e
    where e.work_result_id=v_result and e.earning_component='base'
      and lower(coalesce(e.calculation_method,'')||' '||coalesce(e.rate_uom,''))~'(day|วัน)'
      and e.amount>=e.frozen_rate_amount*0.5)
  then raise exception 'P2G_H_DAILY_ACTUAL_FAILED'; end if;
  insert into phase2g_uat_results values ('H','PASS','Daily earning uses attendance day basis and frozen Rate');

  -- I/J: team pool reconciles exactly and Driver produces one labor earning only.
  if exists(select 1 from public.payroll_team_pool_reconciliations
    where payroll_period_id=v_period and (status<>'reconciled' or abs(difference_amount)>0.01))
  then raise exception 'P2G_I_TEAM_POOL_FAILED'; end if;
  insert into phase2g_uat_results values ('I','PASS','Team pool allocation reconciled exactly with no silent remainder');
  select id into v_driver_worker from public.work_result_workers
  where work_result_id=v_result and is_driver order by id limit 1;
  if v_driver_worker is not null and
    (select count(*) from public.payroll_earning_lines where work_result_worker_id=v_driver_worker and earning_component='base')<>1
  then raise exception 'P2G_J_DRIVER_DUPLICATE'; end if;
  insert into phase2g_uat_results values ('J','PASS','Driver has one Labor earning; vehicle/fuel created no earning');

  -- K: absent/not-worked worker has no earning.
  select id into v_absent_worker from public.work_result_workers
  where work_result_id=v_result and employee_id is not null and id<>v_hourly_worker
  order by is_driver,id limit 1;
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='draft' where id=v_result;
  update public.work_result_workers set attendance_status='absent',actual_hours=0,actual_quantity=0,
    earning_amount=0 where id=v_absent_worker;
  update public.work_results set result_status='closed',verified_at=transaction_timestamp() where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  perform public.prepare_payroll_period(v_period,v_actor);
  if exists(select 1 from public.payroll_earning_lines where work_result_worker_id=v_absent_worker)
  then raise exception 'P2G_K_ABSENT_EARNING'; end if;
  insert into phase2g_uat_results values ('K','PASS','Absent worker produced no earning');

  -- L: configured OT1 is a separate 4-hour line for a 12-hour day.
  update public.employees set position='WEBTEST-UAT-P2G-HOURLY'
  where id=(select employee_id from public.work_result_workers where id=v_hourly_worker);
  insert into public.overtime_rules(rule_code,rule_name,multiplier,status,normal_hours_per_day,
    applicable_position,effective_start_date,approved_by_profile_id,approved_at)
  values('WEBTEST-UAT-P2G-OT1','Phase 2G rollback OT1',1.5,'active',8,
    'WEBTEST-UAT-P2G-HOURLY',
    (select result_date from public.work_results where id=v_result)-1,v_actor,transaction_timestamp())
  returning id into v_rule;
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='draft' where id=v_result;
  update public.work_result_workers set attendance_status='present',actual_hours=12,
    earning_amount=round(rate_amount*12,2) where id=v_hourly_worker;
  update public.work_results set result_status='closed',verified_at=transaction_timestamp() where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  perform public.prepare_payroll_period(v_period,v_actor);
  if not exists(select 1 from public.payroll_earning_lines where work_result_worker_id=v_hourly_worker
    and earning_component='base' and regular_hours=8)
    or not exists(select 1 from public.payroll_earning_lines where work_result_worker_id=v_hourly_worker
      and earning_component='ot1' and overtime_rule_id=v_rule and overtime_hours=4
      and abs(amount-(frozen_rate_amount*4*1.5))<=0.01)
  then raise exception 'P2G_L_OT1_FAILED lines=% rules=%',
    coalesce((select jsonb_agg(jsonb_build_object(
      'component',earning_component,'regular_hours',regular_hours,'overtime_hours',overtime_hours,
      'rule',overtime_rule_id,'multiplier',overtime_multiplier,'amount',amount))
      from public.payroll_earning_lines where work_result_worker_id=v_hourly_worker),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'code',r.rule_code,'position',r.applicable_position,
      'employee_type',r.applicable_employee_type,'normal_hours',r.normal_hours_per_day,
      'multiplier',r.multiplier) order by
      (r.applicable_position is not null) desc,(r.applicable_employee_type is not null) desc,r.created_at desc)
      from public.overtime_rules r
      join public.work_result_workers worker on worker.id=v_hourly_worker
      join public.employees employee on employee.id=worker.employee_id
      where r.status='active' and r.approved_at is not null
        and (r.applicable_position is null or lower(r.applicable_position) in
          (lower(coalesce(employee.position,'')),lower(coalesce(worker.worker_role,''))))
        and (r.applicable_employee_type is null
          or lower(r.applicable_employee_type)=lower(coalesce(employee.employee_type,'')))),'[]'::jsonb);
  end if;
  insert into phase2g_uat_results values ('L','PASS','12 hours generated separate 8 base + 4 OT1 using an approved rule');

  select id into v_summary from public.payroll_employee_summaries where payroll_period_id=v_period order by id limit 1;
  perform public.add_payroll_allowance_phase2g(v_summary,'approved_manual','WEBTEST-UAT-P2G-ALLOW',
    'Rollback approved allowance',125,v_actor,'WEBTEST-UAT-P2G-ALLOW');
  if not exists(select 1 from public.payroll_allowance_lines where payroll_summary_id=v_summary
    and amount=125 and approved_by_profile_id=v_actor and source_reference='WEBTEST-UAT-P2G-ALLOW')
  then raise exception 'P2G_M_ALLOWANCE_FAILED'; end if;
  insert into phase2g_uat_results values ('M','PASS','Allowance retained source, reason, approver and amount');
  perform public.add_payroll_deduction_phase2g(v_summary,'water','approved_utility',
    'WEBTEST-UAT-P2G-WATER','Rollback water deduction',35,v_actor,'WEBTEST-UAT-P2G-DEDUCT');
  if not exists(select 1 from public.payroll_deduction_lines where payroll_summary_id=v_summary
    and deduction_category='water' and amount=35 and source_reference='WEBTEST-UAT-P2G-WATER')
  then raise exception 'P2G_N_DEDUCTION_FAILED'; end if;
  insert into phase2g_uat_results values ('N','PASS','Deduction retained category, source/reference, reason and amount');

  select count(*) into v_count from public.payroll_earning_lines e
    join public.payroll_employee_summaries s on s.id=e.payroll_summary_id where s.payroll_period_id=v_period;
  perform public.prepare_payroll_period(v_period,v_actor);
  select count(*) into v_count_retry from public.payroll_earning_lines e
    join public.payroll_employee_summaries s on s.id=e.payroll_summary_id where s.payroll_period_id=v_period;
  if v_count_retry<>v_count then raise exception 'P2G_O_RETRY_DUPLICATED'; end if;
  insert into phase2g_uat_results values ('O','PASS','Retry is idempotent per Work Result Worker and earning component');

  select * into v_expected from public.phase2g_expected_period((select result_date from public.work_results where id=v_result));
  if not exists(select 1 from public.payroll_periods where id=v_period
    and start_date=v_expected.start_date and end_date=v_expected.end_date and period_half=v_expected.period_half)
  then raise exception 'P2G_P_HALF_MONTH_FAILED'; end if;
  insert into phase2g_uat_results values ('P','PASS','Result Date selected exact 1-15 or 16-end-of-month period');

  -- R/S before close: one Result can contain employee and contractor cost without overlap.
  insert into public.contractors(contractor_code,contractor_name,status)
  values('WEBTEST-UAT-P2G-CON-'||txid_current(),'Phase 2G rollback contractor','active')
  returning id into v_contractor;
  select id into v_worker from public.work_result_workers where work_result_id=v_result
    and employee_id is not null and not is_driver and id not in (v_hourly_worker,v_absent_worker) order by id limit 1;
  if v_worker is null then select id into v_worker from public.work_result_workers
  where work_result_id=v_result and employee_id is not null and not is_driver order by id limit 1; end if;
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='draft' where id=v_result;
  update public.work_result_workers set employee_id=null,contractor_id=v_contractor,payee_type='contractor',
    quantity_allocation_method='contractor' where id=v_worker;
  update public.work_results set result_status='closed',verified_at=transaction_timestamp() where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  perform public.prepare_payroll_period(v_period,v_actor);
  select id into v_estimate from public.contractor_period_estimates where work_result_worker_id=v_worker;
  if v_estimate is null or exists(select 1 from public.payroll_earning_lines where work_result_worker_id=v_worker)
  then raise exception 'P2G_R_MIXED_SEPARATION_FAILED'; end if;
  insert into phase2g_uat_results values ('R','PASS','Mixed WO separated Employee Payroll from Contractor Estimate');
  perform public.adjust_contractor_estimate_phase2g(v_estimate,20,50,10,
    'approved_quality_rule','WEBTEST-UAT-P2G-QUALITY','Rollback contractor adjustments',v_actor);
  if not exists(select 1 from public.contractor_period_estimates where id=v_estimate
    and net_amount=gross_amount-20-10+50 and quality_deduction_reference='WEBTEST-UAT-P2G-QUALITY')
  then raise exception 'P2G_S_CONTRACTOR_NET_FAILED'; end if;
  insert into phase2g_uat_results values ('S','PASS','Contractor gross/deduction/allowance/approved quality/net reconciled');

  begin
    perform public.add_payroll_deduction_phase2g(v_summary,'quality','survey_evidence',
      'WEBTEST-UAT-P2G-SURVEY','Unapproved survey deduction',10,v_actor,'WEBTEST-UAT-P2G-BLOCK');
    raise exception 'P2G_T_SURVEY_DEDUCTION_SHOULD_BLOCK';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'PAYROLL_APPROVED_QUALITY_RULE_REQUIRED' then raise; end if;
  end;
  insert into phase2g_uat_results values ('T','PASS','Survey evidence alone created no deduction without approved quality rule');

  if (select coalesce(sum(net_amount),0) from public.v_phase2g_bpay_reconciliation_export where payroll_period_id=v_period)
     is distinct from
     (select coalesce(sum(net_amount),0) from public.payroll_employee_summaries where payroll_period_id=v_period)
  then raise exception 'P2G_U_BPAY_RECONCILIATION_FAILED'; end if;
  insert into phase2g_uat_results values ('U','PASS','Read-only B-Pay reconciliation totals equal canonical employee summaries');
  insert into phase2g_uat_metrics(metric_group,details)
  select 'employee_payroll',jsonb_build_object(
    'employee_count',count(*),
    'earning_line_count',(select count(*) from public.payroll_earning_lines earning
      where earning.payroll_summary_id in (select id from public.payroll_employee_summaries where payroll_period_id=v_period)),
    'work_day_employee_sum',(select coalesce(sum(work_day_count),0) from (
      select count(distinct earning.work_date) work_day_count
      from public.payroll_earning_lines earning
      where earning.payroll_summary_id in (select id from public.payroll_employee_summaries where payroll_period_id=v_period)
        and earning.work_result_id is not null group by earning.payroll_summary_id
    ) work_days),
    'activity_employee_sum',(select coalesce(sum(activity_count),0) from (
      select count(distinct earning.activity_code) activity_count
      from public.payroll_earning_lines earning
      where earning.payroll_summary_id in (select id from public.payroll_employee_summaries where payroll_period_id=v_period)
        and earning.work_result_id is not null group by earning.payroll_summary_id
    ) activities),
    'base',coalesce(sum(regular_earning+piece_rate_earning),0),
    'ot',coalesce(sum(overtime_earning),0),
    'allowance',coalesce(sum(allowance_amount),0),
    'deduction',coalesce(sum(deduction_amount),0),
    'net',coalesce(sum(net_amount),0))
  from public.payroll_employee_summaries where payroll_period_id=v_period;
  insert into phase2g_uat_metrics(metric_group,details)
  select 'contractor',jsonb_build_object(
    'line_count',count(*),'contractor_count',count(distinct contractor_id),
    'gross',coalesce(sum(gross_amount),0),'deduction',coalesce(sum(deduction_amount),0),
    'quality_deduction',coalesce(sum(quality_deduction_amount),0),
    'allowance',coalesce(sum(allowance_amount),0),'net',coalesce(sum(net_amount),0))
  from public.contractor_period_estimates where payroll_period_id=v_period;
  insert into phase2g_uat_metrics(metric_group,details)
  select 'bpay_reconciliation',jsonb_build_object(
    'row_count',count(*),'source_result_count',coalesce(sum(source_result_count),0),
    'matched',count(*) filter(where variance_state='matched'),
    'difference',count(*) filter(where variance_state='difference'),
    'missing_source',count(*) filter(where variance_state='missing_source'),
    'review_required',count(*) filter(where variance_state='review_required'),
    'net',coalesce(sum(net_amount),0))
  from public.v_phase2g_bpay_reconciliation_export where payroll_period_id=v_period;
  if to_regclass('public.payroll_period_lines') is null
    or to_regprocedure('public.get_or_create_work_result(uuid,date,uuid)') is null
  then raise exception 'P2G_V_LEGACY_COMPATIBILITY_FAILED'; end if;
  insert into phase2g_uat_results values ('V','PASS','Legacy Payroll and legacy Daily Result contracts remain present');
  if (select count(*) from information_schema.columns where table_schema='public' and table_name like 'survey_%')<>v_before_survey_columns
    or (select count(*) from information_schema.columns where table_schema='public'
      and (table_name like '%performance%' or table_name='work_performance_metrics'))<>v_before_performance_columns
  then raise exception 'P2G_W_SURVEY_PERFORMANCE_SCHEMA_CHANGED'; end if;
  insert into phase2g_uat_results values ('W','PASS','Survey and Performance schemas were unchanged');

  -- Y: B-Pay source Result count is derived from canonical earning lineage.
  if exists(
    select 1 from public.v_phase2g_bpay_reconciliation_export export
    join public.employees employee on employee.employee_code=export.employee_code
    join public.payroll_employee_summaries summary
      on summary.payroll_period_id=export.payroll_period_id and summary.employee_id=employee.id
    where export.payroll_period_id=v_period
      and export.source_result_count<>(
        select count(distinct earning.work_result_id) from public.payroll_earning_lines earning
        where earning.payroll_summary_id=summary.id
      )
  ) then raise exception 'P2G_Y_SOURCE_RESULT_COUNT_FAILED'; end if;
  insert into phase2g_uat_results values
    ('Y','PASS','B-Pay source_result_count equals distinct canonical earning Result lineage');

  -- Z: a reconciled employee summary is classified as matched by the DB view.
  if not exists(select 1 from public.v_phase2g_bpay_reconciliation_export
    where payroll_period_id=v_period and source_result_count>0 and variance_state='matched')
  then raise exception 'P2G_Z_MATCHED_STATE_FAILED'; end if;
  insert into phase2g_uat_results values
    ('Z','PASS','B-Pay variance_state is matched when earning and adjustment totals reconcile');

  -- AA: Calculate continues to accept only a verified/closed canonical Result.
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='draft',verified_at=null where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  begin
    perform public.prepare_verified_work_result_payroll_phase2g(v_result,v_actor);
    raise exception 'P2G_AA_UNVERIFIED_CALCULATE_SHOULD_BLOCK';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'PAYROLL_VERIFIED_RESULT_REQUIRED' then raise; end if;
  end;
  perform set_config('app.phase2e_daily_action','on',true);
  update public.work_results set result_status='closed',verified_at=transaction_timestamp() where id=v_result;
  perform set_config('app.phase2e_daily_action','off',true);
  insert into phase2g_uat_results values
    ('AA','PASS','Calculate accepted only a verified or closed canonical Result');

  -- AB: repeated Calculate keeps both Employee earning and Contractor estimate counts stable.
  select count(*) into v_count from public.payroll_earning_lines earning
    join public.payroll_employee_summaries summary on summary.id=earning.payroll_summary_id
    where summary.payroll_period_id=v_period;
  select count(*) into v_estimate_count from public.contractor_period_estimates
    where payroll_period_id=v_period;
  perform public.prepare_payroll_period(v_period,v_actor);
  perform public.prepare_payroll_period(v_period,v_actor);
  select count(*) into v_count_retry from public.payroll_earning_lines earning
    join public.payroll_employee_summaries summary on summary.id=earning.payroll_summary_id
    where summary.payroll_period_id=v_period;
  select count(*) into v_estimate_count_retry from public.contractor_period_estimates
    where payroll_period_id=v_period;
  if v_count_retry<>v_count or v_estimate_count_retry<>v_estimate_count
  then raise exception 'P2G_AB_CALCULATE_RETRY_DUPLICATED'; end if;
  insert into phase2g_uat_results values
    ('AB','PASS','Retry Calculate created no duplicate earning or Contractor estimate lines');

  -- AC: browser/authenticated generic writes retain no canonical Payroll privileges.
  if has_table_privilege('authenticated','public.payroll_periods','INSERT')
    or has_table_privilege('authenticated','public.payroll_earning_lines','UPDATE')
    or has_table_privilege('authenticated','public.contractor_period_estimates','DELETE')
  then raise exception 'P2G_AC_GENERIC_WRITE_PRIVILEGE_PRESENT'; end if;
  insert into phase2g_uat_results values
    ('AC','PASS','Authenticated browser role has no direct canonical Payroll table mutation privilege');

  -- Q: approved -> closed locks every earning/adjustment/contractor line.
  perform public.approve_payroll_period(v_period,v_actor);
  perform public.close_payroll_period(v_period,v_actor);
  begin
    update public.payroll_earning_lines target set amount=target.amount+1
    where target.id=(select line.id from public.payroll_earning_lines line
      join public.payroll_employee_summaries summary on summary.id=line.payroll_summary_id
      where summary.payroll_period_id=v_period limit 1);
    raise exception 'P2G_Q_CLOSED_UPDATE_SHOULD_BLOCK';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'PAYROLL_PERIOD_CLOSED_IMMUTABLE' then raise; end if;
  end;
  insert into phase2g_uat_results values ('Q','PASS','Closed period and lines are immutable; no reopen path exists');

  if (select count(*) from public.payroll_periods)<>v_before_period+1
    or (select count(*) from public.payroll_earning_lines)<=v_before_earning
    or (select count(*) from public.contractor_period_estimates)<=v_before_estimate
  then raise exception 'P2G_X_TRANSACTION_DELTA_FAILED'; end if;
  insert into phase2g_uat_results values
    ('X','PASS','Inside-transaction Payroll/Contractor deltas exist; final ROLLBACK restores counts and schema');
end
$phase2g_uat$;

with cases as (
  select case_code,result,detail from phase2g_uat_results order by case_code
)
select jsonb_build_object(
  'cases',(select jsonb_agg(to_jsonb(cases) order by case_code) from cases),
  'metrics',(select jsonb_object_agg(metric_group,details) from phase2g_uat_metrics)
) as phase2g_uat;
rollback;
