begin;

alter view public.v_budget_year_rule_readiness set (security_invoker = true);
alter view public.v_menu_consolidation_audit set (security_invoker = true);
alter view public.v_hr_setup_queue set (security_invoker = true);
alter view public.v_web_test_run_summary set (security_invoker = true);
alter view public.v_survey_template_readiness set (security_invoker = true);
alter view public.v_web_test_survey_summary set (security_invoker = true);
alter view public.budget_activity_rate_editor set (security_invoker = true);
alter view public.v_vehicle_fuel_setup_queue set (security_invoker = true);
alter view public.v_fuel_tank_setup_queue set (security_invoker = true);
alter view public.v_budget_block_age_projection set (security_invoker = true);
alter view public.v_budget_rate_rule_matches set (security_invoker = true);
alter view public.v_budget_rate_rule_resolution set (security_invoker = true);
alter view public.v_budget_rate_rule_conflicts set (security_invoker = true);
alter view public.v_budget_rate_rule_set_summary set (security_invoker = true);
alter view public.v_budget_rate_rule_validation_issues set (security_invoker = true);

commit;
