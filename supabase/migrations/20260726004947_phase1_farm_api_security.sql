begin;

create table if not exists public.farm_action_idempotency (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  action_name text not null,
  actor_profile_id uuid not null references public.profiles(id),
  request_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  response_json jsonb,
  error_json jsonb,
  expires_at timestamptz not null default (now() + interval '7 days'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.farm_action_idempotency enable row level security;
revoke all on table public.farm_action_idempotency from public, anon, authenticated;
grant select, insert, update, delete on table public.farm_action_idempotency to service_role;

alter view public.v_app_navigation set (security_invoker = true);
alter view public.v_app_workspace_definition set (security_invoker = true);
alter view public.v_app_workspace_tabs set (security_invoker = true);
alter view public.v_management_action_center set (security_invoker = true);
alter view public.v_system_module_readiness set (security_invoker = true);
alter view public.v_farm_workflow_workspace set (security_invoker = true);
alter view public.v_daily_work_entry_context set (security_invoker = true);
alter view public.v_inventory_work_order_workspace set (security_invoker = true);
alter view public.v_inventory_setup_queue set (security_invoker = true);
alter view public.v_vehicle_fuel_status set (security_invoker = true);
alter view public.v_work_result_vehicle_fuel_detail set (security_invoker = true);
alter view public.v_fuel_control_exceptions set (security_invoker = true);
alter view public.v_hr_people_workspace set (security_invoker = true);
alter view public.v_payroll_period_workspace set (security_invoker = true);
alter view public.v_budget_activity_rates_unified set (security_invoker = true);
alter view public.v_budget_rate_rule_editor set (security_invoker = true);
alter view public.v_budget_rate_announcement_matrix set (security_invoker = true);
alter view public.v_survey_response_summary set (security_invoker = true);
alter view public.v_survey_question_analysis set (security_invoker = true);
alter view public.v_survey_finding_followup set (security_invoker = true);
alter view public.v_survey_action_center set (security_invoker = true);

revoke execute on function public.get_or_create_work_result(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.prepare_goods_issue_from_work_order(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.approve_goods_issue(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.post_goods_issue(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.prepare_payroll_period(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.approve_payroll_period(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.close_payroll_period(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cleanup_full_web_test_run(text) from public, anon, authenticated;
revoke execute on function public.create_full_web_test_run(text) from public, anon, authenticated;

grant execute on function public.get_or_create_work_result(uuid, date, uuid) to service_role;
grant execute on function public.prepare_goods_issue_from_work_order(uuid, uuid, uuid) to service_role;
grant execute on function public.approve_goods_issue(uuid, uuid) to service_role;
grant execute on function public.post_goods_issue(uuid, uuid) to service_role;
grant execute on function public.prepare_payroll_period(uuid, uuid) to service_role;
grant execute on function public.approve_payroll_period(uuid, uuid) to service_role;
grant execute on function public.close_payroll_period(uuid, uuid) to service_role;
grant execute on function public.cleanup_full_web_test_run(text) to service_role;
grant execute on function public.create_full_web_test_run(text) to service_role;

do $$
declare
  secured_function regprocedure;
begin
  for secured_function in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      secured_function
    );
    execute format(
      'grant execute on function %s to service_role',
      secured_function
    );
  end loop;
end
$$;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

insert into public.system_settings (
  setting_key, setting_value, value_json, setting_group, description, status
)
values
  ('performance.activity_metrics_enabled', 'false', '{}'::jsonb, 'performance', 'เปิดหน้าตัวชี้วัดประสิทธิภาพเมื่อ API/UI/tests ผ่าน', 'active'),
  ('performance.budget_recommendations_enabled', 'false', '{}'::jsonb, 'performance', 'เปิดหน้าข้อเสนออัตรางบประมาณเมื่อ API/UI/tests ผ่าน', 'active')
on conflict (setting_key) do nothing;

commit;
