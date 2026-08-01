-- Farm management full audit — 2026-08-01
-- Safety: the transaction is explicitly READ ONLY. This script contains no DDL/DML.

begin transaction read only;

-- 1) Object presence. Missing requested objects are evidence, not a reason to create them.
with targets(object_name) as (
  values
    ('blocks'), ('areas'), ('activity_groups'), ('activities'), ('teams'),
    ('employees'), ('contractors'), ('materials'), ('units'), ('warehouses'),
    ('bin_locations'), ('vehicles'), ('annual_work_plans'), ('planned_work_items'),
    ('planned_work_materials'), ('work_orders'), ('work_order_workers'),
    ('work_order_materials'), ('work_order_machines'), ('work_order_actions'),
    ('work_results'), ('work_result_workers'), ('work_result_materials'),
    ('work_result_vehicle_usage'), ('work_result_weight_tickets'), ('goods_issues'),
    ('goods_issue_lines'), ('goods_issue_daily_usage'), ('goods_returns'),
    ('goods_return_lines'), ('stock_balances'), ('stock_transactions'),
    ('sku_conversions'), ('unit_conversions'), ('profiles'), ('roles'),
    ('permissions'), ('role_permissions'), ('profile_roles'), ('user_access_scopes'),
    ('farm_action_idempotency'), ('v_farm_workflow_workspace'),
    ('v_daily_work_entry_context'), ('v_inventory_work_order_workspace'),
    ('v_app_navigation'), ('v_app_workspace_definition'), ('v_app_workspace_tabs'),
    ('v_profile_menu')
)
select
  object_name,
  to_regclass(format('public.%I', object_name)) is not null as exists,
  coalesce(c.relkind::text, '-') as relkind
from targets t
left join pg_class c on c.oid = to_regclass(format('public.%I', object_name))
order by object_name;

-- 2) Exact row counts for every existing target table/view.
with targets(object_name) as (
  values
    ('blocks'), ('areas'), ('activity_groups'), ('activities'), ('teams'),
    ('employees'), ('contractors'), ('materials'), ('units'), ('warehouses'),
    ('bin_locations'), ('vehicles'), ('annual_work_plans'), ('planned_work_items'),
    ('planned_work_materials'), ('work_orders'), ('work_order_workers'),
    ('work_order_materials'), ('work_order_machines'), ('work_order_actions'),
    ('work_results'), ('work_result_workers'), ('work_result_materials'),
    ('work_result_vehicle_usage'), ('work_result_weight_tickets'), ('goods_issues'),
    ('goods_issue_lines'), ('goods_issue_daily_usage'), ('goods_returns'),
    ('goods_return_lines'), ('stock_balances'), ('stock_transactions'),
    ('sku_conversions'), ('unit_conversions'), ('profiles'), ('roles'),
    ('permissions'), ('role_permissions'), ('profile_roles'), ('user_access_scopes'),
    ('farm_action_idempotency'), ('v_farm_workflow_workspace'),
    ('v_daily_work_entry_context'), ('v_inventory_work_order_workspace'),
    ('v_app_navigation'), ('v_app_workspace_definition'), ('v_app_workspace_tabs'),
    ('v_profile_menu')
), existing as (
  select object_name
  from targets
  where to_regclass(format('public.%I', object_name)) is not null
)
select
  object_name,
  ((xpath('/row/count/text()', query_to_xml(
    format('select count(*) as count from public.%I', object_name),
    false, true, ''
  )))[1]::text)::bigint as actual_count
from existing
order by object_name;

-- 3) Additional exact counts by audit domain.
select 'payroll_periods' as object_name, count(*)::bigint as actual_count from public.payroll_periods
union all select 'payroll_period_lines', count(*) from public.payroll_period_lines
union all select 'payroll_employee_summaries', count(*) from public.payroll_employee_summaries
union all select 'payroll_earning_lines', count(*) from public.payroll_earning_lines
union all select 'survey_templates', count(*) from public.survey_templates
union all select 'survey_questions', count(*) from public.survey_questions
union all select 'survey_responses', count(*) from public.survey_responses
union all select 'survey_findings', count(*) from public.survey_findings
union all select 'activity_performance_standards', count(*) from public.activity_performance_standards
union all select 'work_performance_metrics', count(*) from public.work_performance_metrics
order by object_name;

-- 4) Workflow status distributions.
select 'annual_work_plans' as object_name, status, count(*)::bigint as row_count
from public.annual_work_plans group by status
union all
select 'planned_work_items', status, count(*) from public.planned_work_items group by status
union all
select 'work_orders', status, count(*) from public.work_orders group by status
union all
select 'work_results', result_status, count(*) from public.work_results group by result_status
order by object_name, status;

-- 5) Relationship and required-link anomalies. Results are counts only.
with anomaly_counts as (
  select 'planned_item_missing_annual_plan' as issue, count(*)::bigint as issue_count
  from public.planned_work_items pwi
  left join public.annual_work_plans awp on awp.id = pwi.annual_plan_id
  where pwi.annual_plan_id is null or awp.id is null

  union all
  select 'work_order_missing_planned_item', count(*)
  from public.work_orders wo
  left join public.planned_work_items pwi on pwi.id = wo.planned_work_item_id
  where wo.planned_work_item_id is null or pwi.id is null

  union all
  select 'work_order_missing_block', count(*)
  from public.work_orders wo
  left join public.blocks b on b.id = wo.block_id
  where wo.block_id is null or b.id is null

  union all
  select 'work_order_missing_activity', count(*)
  from public.work_orders wo
  left join public.activities a on a.id = wo.activity_id
  where wo.activity_id is null or a.id is null

  union all
  select 'work_order_orphan_team', count(*)
  from public.work_orders wo
  left join public.teams t on t.id = wo.team_id
  where wo.team_id is not null and t.id is null

  union all
  select 'work_order_material_missing_material', count(*)
  from public.work_order_materials wom
  left join public.materials m on m.id = wom.material_id
  where wom.material_id is null or m.id is null

  union all
  select 'work_result_missing_work_order', count(*)
  from public.work_results wr
  left join public.work_orders wo on wo.id = wr.work_order_id
  where wr.work_order_id is null or wo.id is null

  union all
  select 'work_result_outside_planned_range', count(*)
  from public.work_results wr
  join public.work_orders wo on wo.id = wr.work_order_id
  left join public.planned_work_items pwi on pwi.id = wo.planned_work_item_id
  where wr.result_date is not null
    and ((pwi.planned_start_date is not null and wr.result_date < pwi.planned_start_date)
      or (pwi.planned_end_date is not null and wr.result_date > pwi.planned_end_date))

  union all
  select 'goods_issue_missing_work_order', count(*)
  from public.goods_issues gi
  left join public.work_orders wo on wo.id = gi.work_order_id
  where gi.work_order_id is null or wo.id is null

  union all
  select 'goods_issue_line_missing_material', count(*)
  from public.goods_issue_lines gil
  left join public.materials m on m.id = gil.material_id
  where gil.material_id is null or m.id is null

  union all
  select 'daily_usage_missing_issue_line', count(*)
  from public.goods_issue_daily_usage du
  left join public.goods_issue_lines gil on gil.id = du.goods_issue_line_id
  where du.goods_issue_line_id is null or gil.id is null

  union all
  select 'stock_balance_missing_warehouse_material_or_unit', count(*)
  from public.stock_balances sb
  left join public.warehouses w on w.id = sb.warehouse_id
  left join public.materials m on m.id = sb.material_id
  left join public.units u on u.id = sb.unit_id
  where sb.warehouse_id is null or w.id is null
     or sb.material_id is null or m.id is null
     or sb.unit_id is null or u.id is null
)
select * from anomaly_counts order by issue;

-- 6) Duplicate business keys. This is a preview only; no automatic repair.
select 'duplicate_planned_work_item' as issue, count(*)::bigint as duplicate_groups
from (
  select annual_plan_id, block_id, activity_id, planned_start_date, planned_end_date
  from public.planned_work_items
  group by annual_plan_id, block_id, activity_id, planned_start_date, planned_end_date
  having count(*) > 1
) d
union all
select 'duplicate_work_order_per_planned_item', count(*)
from (
  select planned_work_item_id
  from public.work_orders
  where planned_work_item_id is not null
  group by planned_work_item_id
  having count(*) > 1
) d
union all
select 'duplicate_result_per_work_order_date', count(*)
from (
  select work_order_id, result_date
  from public.work_results
  where work_order_id is not null and result_date is not null
  group by work_order_id, result_date
  having count(*) > 1
) d;

-- 7) UAT profile, active role, and block-scope evidence (no auth data).
select
  p.id as profile_id,
  p.status as profile_status,
  array_agg(distinct r.role_key order by r.role_key) filter (where r.role_key is not null) as active_roles,
  count(distinct uas.id) filter (where uas.status = 'active') as active_scope_count,
  count(distinct uas.block_id) filter (where uas.status = 'active' and uas.block_id is not null) as active_block_count,
  array_agg(distinct uas.scope_type order by uas.scope_type) filter (where uas.status = 'active') as scope_types
from public.profiles p
left join public.profile_roles pr
  on pr.profile_id = p.id and pr.is_active = true
  and (pr.effective_from is null or pr.effective_from <= current_date)
  and (pr.effective_to is null or pr.effective_to >= current_date)
left join public.roles r on r.id = pr.role_id and r.status = 'active'
left join public.user_access_scopes uas on uas.profile_id = p.id
where p.id in (
  '9602ba04-dd51-4cbe-baa4-bdf1091a759c'::uuid,
  '4a216447-bf6c-4952-857d-bfadbc793ffe'::uuid
)
group by p.id, p.status
order by p.id;

-- 8) Raw and block-scoped workflow counts for each UAT profile.
select 'raw_view' as stage, null::uuid as profile_id, work_order_status as status, count(*)::bigint as row_count
from public.v_farm_workflow_workspace
group by work_order_status
union all
select
  'active_block_scope',
  uas.profile_id,
  v.work_order_status,
  count(distinct v.work_order_id)
from public.user_access_scopes uas
join public.v_farm_workflow_workspace v on v.block_id = uas.block_id
where uas.status = 'active'
  and uas.block_id is not null
  and uas.profile_id in (
    '9602ba04-dd51-4cbe-baa4-bdf1091a759c'::uuid,
    '4a216447-bf6c-4952-857d-bfadbc793ffe'::uuid
  )
group by uas.profile_id, v.work_order_status
order by stage, profile_id, status;

-- 9) Required feature flags. Every returned value must remain false.
select setting_key, setting_value, value_json, status
from public.system_settings
where setting_key in (
  'system.dynamic_menu_enabled',
  'system.frontend_workspace_ready',
  'system.rls_ready',
  'inventory.multi_day_issue_enabled',
  'inventory.material_return_enabled',
  'inventory.unit_conversion_enabled',
  'budget.rule_engine_enabled',
  'performance.activity_metrics_enabled',
  'performance.budget_recommendations_enabled',
  'fuel.configuration_confirmed',
  'integration.weighbridge_enabled'
)
order by setting_key;

-- 10) View ownership/options and definitions for security and mapping review.
select
  c.relname as view_name,
  pg_get_userbyid(c.relowner) as owner,
  c.reloptions,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v', 'm')
  and c.relname in (
    'v_farm_workflow_workspace', 'v_daily_work_entry_context',
    'v_inventory_work_order_workspace', 'v_app_navigation',
    'v_app_workspace_definition', 'v_app_workspace_tabs', 'v_profile_menu'
  )
order by c.relname;

-- 11) Applied migration history, read-only.
select version, name
from supabase_migrations.schema_migrations
order by version;

rollback;
