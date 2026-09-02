-- Destructive only for synthetic Phase 2I RC rows. Run on isolated staging only.
begin;

set local session_replication_role='replica';

do $phase2i_cleanup_guard$
begin
  if exists (
    select 1 from public.profiles
    where id='2a000000-0000-4000-8000-000000000001'
      and coalesce(username,'') not like 'rc2i.%'
  ) then
    raise exception 'PHASE2I_CLEANUP_PREFIX_GUARD';
  end if;
end
$phase2i_cleanup_guard$;

-- Operational rows created by Phase 2I-D/E are removed from leaves to roots.
delete from public.survey_findings where finding_no like 'UAT2I-%' or finding_no like 'RC2I-%';
delete from public.survey_answers where response_id in (
  select id from public.survey_responses where response_no like 'UAT2I-%' or response_no like 'RC2I-%'
);
delete from public.survey_responses where response_no like 'UAT2I-%' or response_no like 'RC2I-%';

delete from public.payroll_team_pool_reconciliations where payroll_period_id in (
  select id from public.payroll_periods where period_code like 'UAT2I-%' or period_code like 'RC2I-%'
);
delete from public.payroll_adjustment_lines where payroll_summary_id in (
  select s.id from public.payroll_employee_summaries s join public.payroll_periods p on p.id=s.payroll_period_id
  where p.period_code like 'UAT2I-%' or p.period_code like 'RC2I-%'
);
delete from public.payroll_earning_lines where payroll_summary_id in (
  select s.id from public.payroll_employee_summaries s join public.payroll_periods p on p.id=s.payroll_period_id
  where p.period_code like 'UAT2I-%' or p.period_code like 'RC2I-%'
);
delete from public.contractor_estimate_lines where contractor_estimate_id in (
  select e.id from public.contractor_period_estimates e join public.payroll_periods p on p.id=e.payroll_period_id
  where p.period_code like 'UAT2I-%' or p.period_code like 'RC2I-%'
);
delete from public.contractor_period_estimates where payroll_period_id in (
  select id from public.payroll_periods where period_code like 'UAT2I-%' or period_code like 'RC2I-%'
);
delete from public.payroll_employee_summaries where payroll_period_id in (
  select id from public.payroll_periods where period_code like 'UAT2I-%' or period_code like 'RC2I-%'
);
delete from public.payroll_periods where period_code like 'UAT2I-%' or period_code like 'RC2I-%';

delete from public.goods_return_lines where goods_return_id in (
  select id from public.goods_returns where return_no like 'UAT2I-%' or return_no like 'RC2I-%'
);
delete from public.goods_returns where return_no like 'UAT2I-%' or return_no like 'RC2I-%';
delete from public.goods_issue_daily_usage where source_reference like 'UAT2I-%' or source_reference like 'RC2I-%';
delete from public.goods_issue_lines where goods_issue_id in (
  select id from public.goods_issues where issue_no like 'UAT2I-%' or issue_no like 'RC2I-%'
);
delete from public.goods_issues where issue_no like 'UAT2I-%' or issue_no like 'RC2I-%';

delete from public.work_result_vehicle_usage where work_result_id in (
  select id from public.work_results where result_no like 'UAT2I-%' or result_no like 'RC2I-%'
);
delete from public.work_result_resource_usage where work_result_id in (
  select id from public.work_results where result_no like 'UAT2I-%' or result_no like 'RC2I-%'
);
delete from public.work_result_workers where work_result_id in (
  select id from public.work_results where result_no like 'UAT2I-%' or result_no like 'RC2I-%'
);
delete from public.work_results where result_no like 'UAT2I-%' or result_no like 'RC2I-%';

delete from public.work_order_resource_assignments where work_order_id in (
  select id from public.work_orders where work_order_no like 'UAT2I-%' or work_order_no like 'RC2I-%'
);
delete from public.work_order_workers where work_order_id in (
  select id from public.work_orders where work_order_no like 'UAT2I-%' or work_order_no like 'RC2I-%'
);
delete from public.work_order_resource_requirements where work_order_id in (
  select id from public.work_orders where work_order_no like 'UAT2I-%' or work_order_no like 'RC2I-%'
);
delete from public.work_order_labor_requirements where work_order_id in (
  select id from public.work_orders where work_order_no like 'UAT2I-%' or work_order_no like 'RC2I-%'
);
delete from public.work_order_materials where work_order_id in (
  select id from public.work_orders where work_order_no like 'UAT2I-%' or work_order_no like 'RC2I-%'
);
delete from public.work_orders where work_order_no like 'UAT2I-%' or work_order_no like 'RC2I-%';

delete from public.planned_work_resource_requirements where planned_work_item_id in (
  select id from public.planned_work_items where planning_request_key like 'UAT2I-%' or planning_request_key like 'RC2I-%'
);
delete from public.planned_work_labor_requirements where planned_work_item_id in (
  select id from public.planned_work_items where planning_request_key like 'UAT2I-%' or planning_request_key like 'RC2I-%'
);
delete from public.planned_work_materials where planned_work_item_id in (
  select id from public.planned_work_items where planning_request_key like 'UAT2I-%' or planning_request_key like 'RC2I-%'
);
delete from public.planned_work_items where planning_request_key like 'UAT2I-%' or planning_request_key like 'RC2I-%';
delete from public.annual_work_plans where planning_request_key like 'UAT2I-%' or planning_request_key like 'RC2I-%';

delete from public.budget_rate_block_materials where budget_rate_block_id in (
  select id from public.budget_rate_blocks where budget_rate_id='rc2i-runtime-rate'
);
delete from public.budget_rate_resource_requirements where budget_rate_id='rc2i-runtime-rate';
delete from public.budget_rate_blocks where budget_rate_id='rc2i-runtime-rate';
delete from public.budget_rate_roles where budget_rate_id='rc2i-runtime-rate';
delete from public.budget_activity_rates where id='rc2i-runtime-rate';
delete from public.budget_rate_rule_blocks where rule_id='2a000000-0000-4000-8000-000000000052';
delete from public.budget_rate_rule_conditions where rule_id='2a000000-0000-4000-8000-000000000052';
delete from public.budget_rate_rules where id='2a000000-0000-4000-8000-000000000052';
delete from public.budget_rate_rule_sets where id='2a000000-0000-4000-8000-000000000051';
delete from public.budget_years where id='RC2I-BY-2569';

delete from public.team_members where team_id='2a000000-0000-4000-8000-000000000031';
delete from public.teams where id='2a000000-0000-4000-8000-000000000031';
delete from public.contractors where id='2a000000-0000-4000-8000-000000000021';
delete from public.vehicles where id in (
  '2a000000-0000-4000-8000-000000000041','2a000000-0000-4000-8000-000000000042'
);
delete from public.employees where id in (
  '2a000000-0000-4000-8000-000000000011','2a000000-0000-4000-8000-000000000012'
);
delete from public.profile_roles where profile_id in (
  '2a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000002',
  '2a000000-0000-4000-8000-000000000003','2a000000-0000-4000-8000-000000000004'
);
delete from public.role_permissions where role_id in (
  '2a000000-0000-4000-8000-000000000061','2a000000-0000-4000-8000-000000000062',
  '2a000000-0000-4000-8000-000000000063','2a000000-0000-4000-8000-000000000064'
);
delete from public.permissions where id between
  '2a000000-0000-4000-8000-000000000075' and '2a000000-0000-4000-8000-00000000007e';
delete from public.roles where id in (
  '2a000000-0000-4000-8000-000000000061','2a000000-0000-4000-8000-000000000062',
  '2a000000-0000-4000-8000-000000000063','2a000000-0000-4000-8000-000000000064'
);
delete from public.profiles where id in (
  '2a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000002',
  '2a000000-0000-4000-8000-000000000003','2a000000-0000-4000-8000-000000000004'
);
delete from auth.identities where user_id in (
  '2a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000002',
  '2a000000-0000-4000-8000-000000000003','2a000000-0000-4000-8000-000000000004'
);
delete from auth.users where id in (
  '2a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000002',
  '2a000000-0000-4000-8000-000000000003','2a000000-0000-4000-8000-000000000004'
);

commit;
