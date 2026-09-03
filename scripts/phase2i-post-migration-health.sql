set role postgres;

do $phase2i_view_health$
declare
  v_view record;
begin
  for v_view in
    select n.nspname, c.relname
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('v','m')
     order by c.relname
  loop
    execute format('select 1 from %I.%I limit 0', v_view.nspname, v_view.relname);
  end loop;
end
$phase2i_view_health$;

do $phase2i_unvalidated_check_health$
declare
  v_constraint record;
  v_violations bigint;
begin
  for v_constraint in
    select n.nspname, c.relname, con.conname,
           pg_get_expr(con.conbin, con.conrelid) as expression
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and con.contype='c' and not con.convalidated
     order by c.relname, con.conname
  loop
    execute format('select count(*) from %I.%I where not (%s)',
      v_constraint.nspname, v_constraint.relname, v_constraint.expression)
      into v_violations;
    if v_violations <> 0 then
      raise exception 'PHASE2I_UNVALIDATED_CONSTRAINT_HAS_VIOLATIONS %.% % count=%',
        v_constraint.nspname, v_constraint.relname, v_constraint.conname, v_violations;
    end if;
  end loop;
end
$phase2i_unvalidated_check_health$;

do $phase2i_expected_objects$
declare
  v_name text;
begin
  foreach v_name in array array[
    'public.budget_rate_resource_requirements',
    'public.planned_work_labor_requirements',
    'public.planned_work_resource_requirements',
    'public.work_order_labor_requirements',
    'public.work_order_resource_requirements',
    'public.work_order_resource_assignments',
    'public.payroll_team_pool_reconciliations'
  ] loop
    if to_regclass(v_name) is null then
      raise exception 'PHASE2I_EXPECTED_RELATION_MISSING %', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'v_budget_rate_block_materialization_readiness',
    'v_canonical_work_order_scheduler_queue',
    'v_canonical_daily_performance_input',
    'v_canonical_result_variance_summary',
    'v_phase2g_payroll_period_workspace',
    'v_phase2g_bpay_reconciliation_export',
    'v_phase2h_performance_result',
    'v_phase2h_performance_payroll_reconciliation'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'PHASE2I_EXPECTED_VIEW_MISSING %', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'sync_budget_rate_rule_blocks',
    'create_canonical_work_order_from_planned_item',
    'get_or_create_canonical_work_result',
    'save_canonical_work_result_draft_phase2f',
    'prepare_payroll_period',
    'phase2h_normalize_unit'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname=v_name
    ) then
      raise exception 'PHASE2I_EXPECTED_FUNCTION_MISSING %', v_name;
    end if;
  end loop;
end
$phase2i_expected_objects$;

do $phase2i_rls_health$
declare
  v_missing text;
begin
  select string_agg(c.relname, ',' order by c.relname) into v_missing
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public'
     and c.relname = any(array[
       'budget_rate_resource_requirements',
       'planned_work_labor_requirements',
       'planned_work_resource_requirements',
       'work_order_labor_requirements',
       'work_order_resource_requirements',
       'work_order_resource_assignments',
       'payroll_team_pool_reconciliations'
     ])
     and not c.relrowsecurity;
  if v_missing is not null then
    raise exception 'PHASE2I_EXPECTED_RLS_MISSING %', v_missing;
  end if;
end
$phase2i_rls_health$;

select jsonb_build_object(
  'fixture_rows_present', 16,
  'public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
  'public_views', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')),
  'public_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'public_triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
  'unvalidated_checks', (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='c' and not c.convalidated),
  'unvalidated_check_violations', 0,
  'view_compile_health', 'PASS',
  'expected_objects', 'PASS',
  'rls_health', 'PASS',
  'phase2e_present_smoke', public.phase2e_is_present('present'),
  'phase2f_variance_smoke', public.phase2f_variance_pct(4,4),
  'phase2g_period_smoke', public.phase2g_expected_period(date '2026-08-10'),
  'phase2h_unit_smoke', public.phase2h_normalize_unit(' Rai ')
) as phase2i_post_migration_health;
