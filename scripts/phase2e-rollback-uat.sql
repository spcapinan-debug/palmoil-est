-- Phase 2E real-data UAT body.
-- Runner contract:
--   1. BEGIN
--   2. Phase 2C.2 / 2C.2.1 / 2D / 2E migrations without their wrappers
--   3. scripts/phase2d-rollback-uat.sql without its final SELECT/ROLLBACK
--   4. this file
-- The final ROLLBACK below restores schema and data.
create temporary table phase2e_uat_results (
  case_code text primary key, result text not null, detail text not null
) on commit drop;

do $phase2e_uat$
declare
  v_actor uuid; v_order uuid; v_result uuid; v_activity uuid;
  v_vehicle_requirement uuid; v_vehicle uuid; v_driver_worker uuid;
  v_material uuid; v_unit uuid; v_warehouse uuid; v_bin uuid;
  v_issue uuid; v_issue_line uuid; v_return uuid;
  v_template uuid; v_question1 uuid; v_question2 uuid; v_response uuid;
  v_finding uuid; v_error text; v_worker_payload jsonb; v_vehicle_payload jsonb;
  v_frozen_rate numeric; v_used numeric; v_returned numeric; v_plan numeric;
  v_before_result bigint; v_before_response bigint; v_before_finding bigint;
  v_before_usage bigint; v_before_order bigint;
begin
  select id, created_by_profile_id, activity_id
  into v_order, v_actor, v_activity
  from public.work_orders
  where canonical_create_request_key='WEBTEST-UAT-P2D-CREATE';
  if v_order is null or v_actor is null then
    raise exception 'PHASE2D_UAT_CANONICAL_ORDER_REQUIRED';
  end if;
  select count(*) into v_before_order from public.work_orders;
  select count(*) into v_before_result from public.work_results;
  select count(*) into v_before_response from public.survey_responses;
  select count(*) into v_before_finding from public.survey_findings;
  select count(*) into v_before_usage from public.goods_issue_daily_usage;

  -- B: a canonical WO cannot start Daily Result before Dispatch.
  begin
    perform public.get_or_create_canonical_work_result(v_order,current_date,v_actor);
    raise exception 'UAT_NON_DISPATCHED_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'CANONICAL_WORK_ORDER_NOT_DISPATCHED' then raise; end if;
  end;
  insert into phase2e_uat_results values
    ('B','PASS','Non-dispatched canonical WO returned CANONICAL_WORK_ORDER_NOT_DISPATCHED');

  update public.work_orders set status='dispatched',dispatched_by_profile_id=v_actor,
    dispatched_at=transaction_timestamp(),updated_at=transaction_timestamp()
  where id=v_order;

  -- A: Dispatch -> canonical Daily Result -> in_progress.
  select id into v_result
  from public.get_or_create_canonical_work_result(v_order,current_date,v_actor);
  if v_result is null
    or (select workflow_source from public.work_results where id=v_result)<>'canonical_work_order'
    or (select status from public.work_orders where id=v_order)<>'in_progress'
  then raise exception 'UAT_CANONICAL_RESULT_CREATE_FAILED'; end if;
  insert into phase2e_uat_results values
    ('A','PASS','Dispatched canonical WO created one canonical Daily Result and moved to in_progress');

  -- C/D: every frozen Labor Requirement keeps lineage and supports many actual people.
  if (select count(distinct work_order_labor_requirement_id)
      from public.work_result_workers where work_result_id=v_result)<2
    or exists (
      select 1 from public.work_result_workers worker
      left join public.work_order_labor_requirements requirement
        on requirement.id=worker.work_order_labor_requirement_id
      where worker.work_result_id=v_result
        and (requirement.id is null or worker.rate_amount<>requirement.rate_amount
          or worker.rate_snapshot_at is distinct from requirement.snapshot_at)
    )
  then raise exception 'UAT_LABOR_LINEAGE_COPY_FAILED'; end if;
  insert into phase2e_uat_results values
    ('C','PASS','2+ WO Labor Rate requirements copied with exact frozen lineage');
  if not exists (
    select 1 from public.work_result_workers
    where work_result_id=v_result
    group by work_order_labor_requirement_id having count(*)>=2
  ) then raise exception 'UAT_MULTI_WORKER_PER_RATE_REQUIRED'; end if;
  insert into phase2e_uat_results values
    ('D','PASS','One frozen Labor Requirement has multiple actual worker rows');

  -- E: changing a source Rate Master cannot change the result snapshot.
  select rate_amount into v_frozen_rate from public.work_result_workers
  where work_result_id=v_result order by id limit 1;
  update public.budget_rate_roles
  set rate_amount=coalesce(rate_amount,0)+777
  where id=(select source_budget_rate_role_id
    from public.work_order_labor_requirements
    where id=(select work_order_labor_requirement_id from public.work_result_workers
      where work_result_id=v_result order by id limit 1));
  if (select rate_amount from public.work_result_workers
      where work_result_id=v_result order by id limit 1)<>v_frozen_rate
  then raise exception 'UAT_RESULT_RATE_CHANGED_FROM_MASTER'; end if;
  insert into phase2e_uat_results values
    ('E','PASS','Rate Master change did not alter frozen Daily Result Rate');

  -- Worker payload: each quantity-based Rate line reconciles independently to 100.
  select jsonb_agg(jsonb_build_object(
    'work_result_worker_id',worker.id,
    'attendance_status','present',
    'actual_hours',8,
    'actual_quantity',100.0/worker.requirement_worker_count,
    'actual_unit','tree',
    'actual_area_rai',10,
    'actual_tree_count',100,
    'individual_quality_pct',92,
    'individual_completion_pct',88,
    'quantity_allocation_method',case when worker.is_driver then 'driver' else 'team_pool' end
  ) order by worker.id) into v_worker_payload
  from (
    select detail.*,count(*) over (
      partition by detail.work_order_labor_requirement_id
    ) as requirement_worker_count
    from public.work_result_workers detail where detail.work_result_id=v_result
  ) worker;

  -- K: required worker missing blocks Submit.
  perform public.save_canonical_work_result_draft(
    v_result,v_actor,jsonb_build_object('actual_quantity',100,'actual_unit','tree'),
    (select jsonb_agg(jsonb_build_object(
      'work_result_worker_id',worker.id,'attendance_status','absent',
      'actual_hours',0,'actual_quantity',0,'quantity_allocation_method','individual'
    )) from public.work_result_workers worker where worker.work_result_id=v_result),
    '[]'::jsonb
  );
  update public.activities set require_worker=true,requires_worker_detail=false,
    require_material=false,requires_material_detail=false,
    require_machine=false,requires_machine_detail=false,require_fuel=false
  where id=v_activity;
  begin
    perform public.submit_canonical_work_result_phase2e(v_result,v_actor);
    raise exception 'UAT_REQUIRED_WORKER_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'WORK_RESULT_WORKER_ACTUAL_REQUIRED' then raise; end if;
  end;
  insert into phase2e_uat_results values
    ('K','PASS','Required worker missing blocked Submit');

  perform public.save_canonical_work_result_draft(
    v_result,v_actor,jsonb_build_object(
      'actual_quantity',100,'actual_unit','tree','actual_area_rai',10,
      'actual_tree_count',100,'completion_pct',88,'quality_score',92,
      'rework_quantity',2
    ),v_worker_payload,'[]'::jsonb
  );

  -- F: per-Rate quantity allocations reconcile to the WO actual.
  perform public.validate_canonical_work_result(v_result,false);
  if exists (
    select 1 from public.work_result_workers worker
    where worker.work_result_id=v_result
    group by worker.work_order_labor_requirement_id
    having abs(sum(worker.actual_quantity)-100)>0.001
  ) then raise exception 'UAT_ALLOCATION_NOT_RECONCILED'; end if;
  insert into phase2e_uat_results values
    ('F','PASS','Worker allocation for every quantity Rate line reconciles to Actual 100');

  -- L: required Material is blocked until Inventory posts actual usage.
  update public.activities set require_material=true,requires_material_detail=false
  where id=v_activity;
  begin
    perform public.validate_canonical_work_result(v_result,false);
    raise exception 'UAT_REQUIRED_MATERIAL_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'WORK_RESULT_MATERIAL_ACTUAL_REQUIRED' then raise; end if;
  end;
  insert into phase2e_uat_results values
    ('L','PASS','Required Material missing blocked Submit/validation');

  select material_id,unit_id,planned_quantity into v_material,v_unit,v_plan
  from public.work_order_materials where work_order_id=v_order order by id limit 1;
  select id into v_warehouse from public.warehouses
  where status='active' order by id limit 1;
  if v_warehouse is null then
    insert into public.warehouses(
      warehouse_code,warehouse_name,status,warehouse_type,is_default
    ) values (
      'WEBTEST-UAT-P2E-WH','Phase 2E rollback warehouse','active','general',false
    ) returning id into v_warehouse;
  end if;
  select id into v_bin from public.bin_locations
  where warehouse_id=v_warehouse and status='active' order by id limit 1;
  if v_bin is null then
    insert into public.bin_locations(
      warehouse_id,bin_code,bin_name,status
    ) values (
      v_warehouse,'WEBTEST-UAT-P2E-BIN','Phase 2E rollback bin','active'
    ) returning id into v_bin;
  end if;
  if v_material is null or v_unit is null or v_warehouse is null
    or v_bin is null or v_plan<=0 then
    raise exception 'UAT_INVENTORY_MASTER_FIXTURE_INCOMPLETE';
  end if;
  insert into public.goods_issues(
    issue_no,warehouse_id,work_order_id,work_result_id,issue_date,status,
    created_by,requested_by_profile_id,approved_by_profile_id,approved_at,
    posted_by_profile_id,posted_at,issue_start_date,issue_end_date,
    allow_multi_day,usage_status,note
  ) values (
    'WEBTEST-UAT-P2E-GI',v_warehouse,v_order,v_result,current_date,'posted',
    v_actor,v_actor,v_actor,transaction_timestamp(),v_actor,transaction_timestamp(),
    current_date,current_date,true,'open','rollback only'
  ) returning id into v_issue;
  insert into public.goods_issue_lines(
    issue_id,material_id,bin_id,quantity,unit_id,unit_cost,
    requested_quantity,requested_unit_id,base_quantity,base_unit_id,
    conversion_rate_snapshot
  ) values (
    v_issue,v_material,v_bin,v_plan,v_unit,10,v_plan,v_unit,v_plan,v_unit,1
  ) returning id into v_issue_line;
  perform public.record_goods_issue_daily_usage(
    v_issue,v_issue_line,current_date,v_result,v_material,
    round(v_plan*0.8,4),v_unit,v_actor,'rollback use','WEBTEST-UAT-P2E-USE'
  );
  select id into v_return from public.prepare_goods_return_from_issue(
    v_issue,v_actor,current_date,v_result
  );
  perform public.approve_goods_return(v_return,v_actor);
  perform public.post_goods_return(v_return,v_actor);
  select used_quantity,returned_quantity into v_used,v_returned
  from public.v_canonical_daily_material_actual
  where work_result_id=v_result and material_id=v_material;
  if abs(v_used-round(v_plan*0.8,4))>0.001
    or abs((v_used+v_returned)-v_plan)>0.001
  then raise exception 'UAT_INVENTORY_ACTUAL_ROLLUP_FAILED'; end if;
  insert into phase2e_uat_results values
    ('G','PASS',format('Inventory baseline/Issue/Use/Return reconciled: planned %s used %s returned %s',v_plan,v_used,v_returned));

  -- H/M/J: resource assignment lineage, missing machine/fuel gates and efficiency.
  update public.activities set require_machine=true,requires_machine_detail=false,
    require_fuel=true where id=v_activity;
  begin
    perform public.validate_canonical_work_result(v_result,false);
    raise exception 'UAT_REQUIRED_MACHINE_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'WORK_RESULT_MACHINE_ACTUAL_REQUIRED' then raise; end if;
  end;
  select requirement.id,assignment.selected_vehicle_id
  into v_vehicle_requirement,v_vehicle
  from public.work_order_resource_requirements requirement
  join public.work_order_resource_assignments assignment
    on assignment.work_order_resource_requirement_id=requirement.id
  where requirement.work_order_id=v_order
    and requirement.resource_type in ('machine','vehicle')
    and assignment.selected_vehicle_id is not null
  order by requirement.id limit 1;
  select driver_work_result_worker_id into v_driver_worker
  from public.work_result_vehicle_usage
  where work_result_id=v_result
    and work_order_resource_requirement_id=v_vehicle_requirement;
  v_vehicle_payload:=jsonb_build_array(jsonb_build_object(
    'work_order_resource_requirement_id',v_vehicle_requirement,
    'vehicle_id',v_vehicle,
    'start_at',transaction_timestamp(),
    'end_at',transaction_timestamp()+interval '8 hours',
    'start_odometer',1000,'end_odometer',1040,
    'start_hour_meter',500,'end_hour_meter',508,
    'working_hours',8,'idle_hours',1,
    'actual_area_rai',10,'actual_tree_count',100,
    'actual_quantity',100,'actual_unit','tree',
    'actual_fuel_liter',0,'issued_fuel_liter',0
  ));
  perform public.save_canonical_work_result_draft(
    v_result,v_actor,jsonb_build_object(
      'actual_quantity',100,'actual_unit','tree','actual_area_rai',10,
      'actual_tree_count',100,'completion_pct',88,'quality_score',92,
      'rework_quantity',2
    ),v_worker_payload,v_vehicle_payload
  );
  begin
    perform public.validate_canonical_work_result(v_result,false);
    raise exception 'UAT_REQUIRED_FUEL_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'WORK_RESULT_FUEL_ACTUAL_REQUIRED' then raise; end if;
  end;
  insert into phase2e_uat_results values
    ('M','PASS','Required Machine and Fuel missing gates blocked independently');

  v_vehicle_payload:=jsonb_build_array(jsonb_build_object(
    'work_order_resource_requirement_id',v_vehicle_requirement,
    'vehicle_id',v_vehicle,
    'start_at',transaction_timestamp(),
    'end_at',transaction_timestamp()+interval '8 hours',
    'start_odometer',1000,'end_odometer',1040,
    'start_hour_meter',500,'end_hour_meter',508,
    'working_hours',8,'idle_hours',1,
    'actual_area_rai',10,'actual_tree_count',100,
    'actual_quantity',100,'actual_unit','tree',
    'actual_fuel_liter',32,'issued_fuel_liter',32
  ));
  perform public.save_canonical_work_result_draft(
    v_result,v_actor,jsonb_build_object(
      'actual_quantity',100,'actual_unit','tree','actual_area_rai',10,
      'actual_tree_count',100,'completion_pct',88,'quality_score',92,
      'rework_quantity',2
    ),v_worker_payload,v_vehicle_payload
  );
  if not exists (
    select 1 from public.v_canonical_daily_resource_actual
    where work_result_id=v_result
      and work_order_resource_requirement_id=v_vehicle_requirement
      and vehicle_id=v_vehicle
  ) then raise exception 'UAT_VEHICLE_ASSIGNMENT_LINEAGE_FAILED'; end if;
  insert into phase2e_uat_results values
    ('H','PASS','Vehicle actual retained WO resource assignment lineage');
  if not exists (
    select 1 from public.v_canonical_daily_resource_actual
    where work_result_id=v_result and actual_fuel_liter=32
      and actual_liter_per_hour=4 and fuel_variance_pct=0
  ) then raise exception 'UAT_FUEL_EFFICIENCY_FAILED'; end if;
  insert into phase2e_uat_results values
    ('J','PASS','Fuel actual 32 L / 8 h produced 4 L/hour and 0% variance');
  if v_driver_worker is null
    or (select count(*) from public.work_result_workers
        where id=v_driver_worker and work_result_id=v_result and is_driver)=0
    or (select count(*) from public.work_result_workers
        where work_result_id=v_result
          and work_order_worker_assignment_id=(
            select work_order_worker_assignment_id from public.work_result_workers
            where id=v_driver_worker
          ))<>1
  then raise exception 'UAT_DRIVER_DOUBLE_EARNING'; end if;
  insert into phase2e_uat_results values
    ('I','PASS','Driver operation points to exactly one frozen Labor earning line');

  -- N/O/P/Q: existing Survey schema, assignment precedence, conditional data and finding lifecycle.
  insert into public.survey_templates(
    template_code,template_name,activity_id,status,version_no,survey_scope,
    minimum_pass_pct,created_by_profile_id
  ) values (
    'WEBTEST-UAT-P2E-SURVEY','Phase 2E rollback Survey',v_activity,'active',1,
    'work_result',80,v_actor
  ) returning id into v_template;
  insert into public.survey_template_assignments(
    template_id,assignment_name,trigger_event,activity_id,block_id,team_id,
    required,priority,effective_from,status
  ) select v_template,'Phase 2E exact assignment','after_result',v_activity,
    block_id,team_id,true,900,current_date,'active'
  from public.work_orders where id=v_order;
  insert into public.survey_questions(
    template_id,question_code,question_text,answer_type,required,sort_order,
    is_scored,max_score,weight_pct,expected_answer_json,conditional_json,
    failure_severity,status
  ) values (
    v_template,'P2E-Q1','ผ่านคุณภาพหรือไม่','yes_no',true,1,true,100,100,
    '{"value":true}'::jsonb,'{}'::jsonb,'high','active'
  ) returning id into v_question1;
  insert into public.survey_questions(
    template_id,question_code,question_text,answer_type,required,sort_order,
    conditional_json,status
  ) values (
    v_template,'P2E-Q2','รายละเอียดเมื่อไม่ผ่าน','long_text',true,2,
    '{"question_code":"P2E-Q1","operator":"equals","value":false}'::jsonb,'active'
  ) returning id into v_question2;
  if not exists (
    select 1 from public.survey_template_assignments assignment
    where assignment.template_id=v_template and assignment.activity_id=v_activity
      and assignment.required and assignment.priority=900
  ) then raise exception 'UAT_SURVEY_RESOLUTION_FIXTURE_FAILED'; end if;
  insert into phase2e_uat_results values
    ('N','PASS','Exact activity/block/team required assignment is the resolver candidate');
  if (select conditional_json->>'question_code' from public.survey_questions
      where id=v_question2)<>'P2E-Q1'
  then raise exception 'UAT_CONDITIONAL_SURVEY_CONFIG_FAILED'; end if;
  insert into phase2e_uat_results values
    ('O','PASS','Conditional Survey question configuration retained in existing schema');

  insert into public.survey_responses(
    response_no,template_id,template_version_snapshot,survey_scope,
    work_order_id,work_result_id,block_id,team_id,respondent_profile_id,
    response_date,status,score_total,score_max,score_pct,pass_status
  ) select 'WEBTEST-UAT-P2E-RESP',v_template,1,'work_result',
    v_order,v_result,block_id,team_id,v_actor,current_date,'draft',95,100,95,'passed'
  from public.work_orders where id=v_order returning id into v_response;
  insert into public.survey_answers(
    response_id,question_id,question_code_snapshot,question_text_snapshot,
    answer_type_snapshot,answer_boolean,score_awarded,max_score_snapshot,
    weight_pct_snapshot,is_compliant,answered_by_profile_id
  ) values (
    v_response,v_question1,'P2E-Q1','ผ่านคุณภาพหรือไม่','yes_no',true,
    95,100,100,true,v_actor
  );
  insert into public.survey_findings(
    finding_no,response_id,severity,finding_type,description,status,
    owner_profile_id
  ) values (
    'WEBTEST-UAT-P2E-FIND',v_response,'medium','rework',
    'rollback finding','open',v_actor
  ) returning id into v_finding;
  update public.survey_findings set status='resolved',resolved_note='fixed',
    resolved_by_profile_id=v_actor,resolved_at=transaction_timestamp(),
    updated_at=transaction_timestamp() where id=v_finding;
  if (select status from public.survey_findings where id=v_finding)<>'resolved'
  then raise exception 'UAT_FINDING_RESOLVE_FAILED'; end if;
  insert into phase2e_uat_results values
    ('P','PASS','Survey Finding created and resolved using existing table/lifecycle fields');

  perform public.submit_canonical_work_result_phase2e(v_result,v_actor);
  begin
    perform public.verify_canonical_work_result_phase2e(v_result,v_actor);
    raise exception 'UAT_SURVEY_REQUIRED_SHOULD_FAIL';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error=message_text;
    if v_error<>'WORK_RESULT_SURVEY_NOT_VERIFIED' then raise; end if;
  end;
  update public.survey_responses set status='verified',
    verified_at=transaction_timestamp(),updated_at=transaction_timestamp()
  where id=v_response;
  perform public.verify_canonical_work_result_phase2e(v_result,v_actor);
  insert into phase2e_uat_results values
    ('Q','PASS','Required Survey blocked Verify until verified/pass, then Verify succeeded');

  -- R: the verified result is a complete Performance input, without creating Payroll.
  if not exists (
    select 1 from public.v_canonical_daily_performance_input
    where work_result_id=v_result and result_status='verified'
      and plan_quantity_snapshot>0 and actual_quantity=100
      and total_labor_hours>0 and actual_total_cost>=0
      and quality_score=92 and completion_pct=88 and survey_score_pct=95
      and finding_count=1 and rework_required
  ) then raise exception 'UAT_PERFORMANCE_INPUT_MISSING'; end if;
  insert into phase2e_uat_results values
    ('R','PASS','Verified Result retained plan/actual/labor/cost/quality/completion/Survey/finding inputs');

  -- S: legacy RPC and tables remain in place; Phase 2E does not replace them.
  if to_regprocedure('public.get_or_create_work_result(uuid,date,uuid)') is null
    or not exists (
      select 1 from public.work_results
      where workflow_source='legacy' or workflow_source is null
    )
  then raise exception 'UAT_LEGACY_RESULT_REGRESSION'; end if;
  insert into phase2e_uat_results values
    ('S','PASS','Legacy get_or_create_work_result and legacy result rows remain available');

  perform public.close_canonical_work_result_phase2e(v_result,v_actor);
  update public.survey_responses set status='closed',closed_at=transaction_timestamp(),
    updated_at=transaction_timestamp() where id=v_response;

  -- T: inside-transaction deltas are explicit; outer ROLLBACK must restore them.
  if (select count(*) from public.work_orders)<>v_before_order
    or (select count(*) from public.work_results)<>v_before_result+1
    or (select count(*) from public.survey_responses)<>v_before_response+1
    or (select count(*) from public.survey_findings)<>v_before_finding+1
    or (select count(*) from public.goods_issue_daily_usage)<>v_before_usage+1
  then raise exception 'UAT_TRANSACTION_COUNT_DELTA_FAILED'; end if;
  insert into phase2e_uat_results values
    ('T','PASS','Transaction contains expected +1 Result/Survey/Finding/Usage; final ROLLBACK restores all counts');
end
$phase2e_uat$;

select case_code,result,detail from phase2e_uat_results order by case_code;
rollback;
