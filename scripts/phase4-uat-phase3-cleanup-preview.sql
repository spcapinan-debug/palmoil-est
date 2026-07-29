-- Phase 4: Phase 3 UAT Cleanup Preview
-- Preview only. There is intentionally no DELETE/UPDATE statement in this file.

begin transaction read only;

with target_orders as (
  select id,work_order_no
  from public.work_orders
  where work_order_no in ('WEBTEST-UAT-MGR-WO-001','WEBTEST-UAT-SUP-WO-001')
),
target_results as (
  select wr.id,wr.work_order_id,wr.result_status
  from public.work_results wr
  join target_orders wo on wo.id=wr.work_order_id
),
target_surveys as (
  select sr.id,sr.work_order_id,sr.work_result_id,sr.status
  from public.survey_responses sr
  where sr.work_order_id in(select id from target_orders)
     or sr.work_result_id in(select id from target_results)
),
target_metrics as (
  select pm.id,pm.work_order_id,pm.work_result_id
  from public.work_performance_metrics pm
  where pm.work_order_id in(select id from target_orders)
     or pm.work_result_id in(select id from target_results)
),
target_audit as (
  select al.id,al.entity_table,al.entity_id,al.action,al.created_at
  from public.audit_logs al
  where (
    al.entity_table='work_orders'
    and al.entity_id in(select id::text from target_orders)
  ) or (
    al.entity_table='work_results'
    and al.entity_id in(select id::text from target_results)
  ) or (
    al.entity_table='survey_responses'
    and al.entity_id in(select id::text from target_surveys)
  ) or (
    al.entity_table='work_performance_metrics'
    and al.entity_id in(select id::text from target_metrics)
  )
),
counts as (
  select 'work_orders'::text as table_name,count(*)::bigint as record_count from target_orders
  union all
  select 'work_results',count(*) from target_results
  union all
  select 'survey_responses',count(*) from target_surveys
  union all
  select 'work_performance_metrics',count(*) from target_metrics
  union all
  select 'audit_logs',count(*) from target_audit
)
select * from counts order by table_name;

with target_orders as (
  select id,work_order_no
  from public.work_orders
  where work_order_no in ('WEBTEST-UAT-MGR-WO-001','WEBTEST-UAT-SUP-WO-001')
)
select
  'work_orders' as table_name,
  id as record_id,
  work_order_no as business_key,
  'parent of work_results and related Phase 3 UAT records' as dependency
from target_orders
order by work_order_no;

with target_orders as (
  select id
  from public.work_orders
  where work_order_no in ('WEBTEST-UAT-MGR-WO-001','WEBTEST-UAT-SUP-WO-001')
),
target_results as (
  select wr.id,wr.work_order_id,wr.result_status
  from public.work_results wr
  where wr.work_order_id in(select id from target_orders)
)
select
  'work_results' as table_name,
  id as record_id,
  work_order_id::text as business_key,
  concat('depends on work_orders; status=',coalesce(result_status,'-')) as dependency
from target_results
order by id;

with target_orders as (
  select id
  from public.work_orders
  where work_order_no in ('WEBTEST-UAT-MGR-WO-001','WEBTEST-UAT-SUP-WO-001')
),
target_results as (
  select id from public.work_results
  where work_order_id in(select id from target_orders)
)
select
  'survey_responses' as table_name,
  sr.id as record_id,
  coalesce(sr.work_order_id::text,sr.work_result_id::text) as business_key,
  'depends on UAT work_order/work_result; inspect answers and attachments before cleanup' as dependency
from public.survey_responses sr
where sr.work_order_id in(select id from target_orders)
   or sr.work_result_id in(select id from target_results)
order by sr.id;

with target_orders as (
  select id
  from public.work_orders
  where work_order_no in ('WEBTEST-UAT-MGR-WO-001','WEBTEST-UAT-SUP-WO-001')
),
target_results as (
  select id from public.work_results
  where work_order_id in(select id from target_orders)
)
select
  'work_performance_metrics' as table_name,
  pm.id as record_id,
  coalesce(pm.work_order_id::text,pm.work_result_id::text) as business_key,
  'depends on UAT work_order/work_result' as dependency
from public.work_performance_metrics pm
where pm.work_order_id in(select id from target_orders)
   or pm.work_result_id in(select id from target_results)
order by pm.id;

select
  count(*) filter(where work_order_no like 'WEBTEST-2569%') as protected_webtest_2569_orders,
  count(*) filter(
    where work_order_no in ('WEBTEST-UAT-MGR-WO-001','WEBTEST-UAT-SUP-WO-001')
  ) as phase3_uat_orders,
  case
    when count(*) filter(where work_order_no like 'WEBTEST-2569%')>0
      then 'WEBTEST-2569 remains outside the cleanup target'
    else 'WEBTEST-2569 was not found; stop and investigate before cleanup'
  end as webtest_2569_impact
from public.work_orders;

rollback;
