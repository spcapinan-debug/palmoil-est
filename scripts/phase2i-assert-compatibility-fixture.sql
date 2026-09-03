set role postgres;

do $phase2i_fixture_assert$
declare
  v_present integer;
begin
  select count(*) into v_present
  from (values
    ('estates', exists(select 1 from public.estates where id='00000000-0000-4000-8000-000000000001')),
    ('blocks', exists(select 1 from public.blocks where id='00000000-0000-4000-8000-000000000002')),
    ('activities', exists(select 1 from public.activities where id='00000000-0000-4000-8000-000000000003')),
    ('budget_activity_rates', exists(select 1 from public.budget_activity_rates where id='phase2i-legacy-budget-rate')),
    ('budget_rate_blocks', exists(select 1 from public.budget_rate_blocks where id='phase2i-legacy-budget-rate-block')),
    ('annual_work_plans', exists(select 1 from public.annual_work_plans where id='00000000-0000-4000-8000-000000000004')),
    ('planned_work_items', exists(select 1 from public.planned_work_items where id='00000000-0000-4000-8000-000000000005')),
    ('work_orders', exists(select 1 from public.work_orders where id='00000000-0000-4000-8000-000000000006')),
    ('work_results', exists(select 1 from public.work_results where id='00000000-0000-4000-8000-000000000007')),
    ('work_result_workers', exists(select 1 from public.work_result_workers where id='00000000-0000-4000-8000-000000000009')),
    ('stock_balances', exists(select 1 from public.stock_balances where id='00000000-0000-4000-8000-00000000000d')),
    ('survey_responses', exists(select 1 from public.survey_responses where id='00000000-0000-4000-8000-000000000010')),
    ('survey_findings', exists(select 1 from public.survey_findings where id='00000000-0000-4000-8000-000000000011')),
    ('payroll_periods', exists(select 1 from public.payroll_periods where id='00000000-0000-4000-8000-000000000012')),
    ('payroll_earning_lines', exists(select 1 from public.payroll_earning_lines where id='00000000-0000-4000-8000-000000000014')),
    ('vehicles', exists(select 1 from public.vehicles where id='00000000-0000-4000-8000-00000000000e'))
  ) fixture(object_name, present)
  where present;

  if v_present <> 16 then
    raise exception 'PHASE2I_HISTORICAL_FIXTURE_ROW_DELETED present=% expected=16', v_present;
  end if;
end
$phase2i_fixture_assert$;

select
  16 as fixture_rows_present,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')) as public_table_count,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('v','m')) as public_view_count,
  (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace
    where n.nspname='public' and not c.convalidated) as unvalidated_constraint_count;
