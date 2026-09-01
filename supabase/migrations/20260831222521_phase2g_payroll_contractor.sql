-- Phase 2G: verified canonical Actual -> Payroll / Contractor Estimate.
-- The frozen Work Result / Work Order labor snapshot is authoritative. This migration
-- does not post to B-Pay and does not read current Budget or Payroll Rate masters.
begin;

alter table public.payroll_periods
  add column if not exists estate_id uuid references public.estates(id) on delete restrict,
  add column if not exists period_half smallint,
  add column if not exists source_kind text not null default 'legacy',
  add column if not exists carry_forward_from_period_id uuid references public.payroll_periods(id) on delete restrict,
  add column if not exists carry_forward_reason text,
  add column if not exists external_export_status text not null default 'not_exported',
  add column if not exists external_export_reference text;

alter table public.payroll_earning_lines
  add column if not exists earning_component text not null default 'base',
  add column if not exists work_order_labor_requirement_id uuid
    references public.work_order_labor_requirements(id) on delete restrict,
  add column if not exists source_planned_work_labor_requirement_id uuid
    references public.planned_work_labor_requirements(id) on delete restrict,
  add column if not exists source_budget_rate_role_id text,
  add column if not exists attendance_status text,
  add column if not exists actual_hours numeric not null default 0,
  add column if not exists actual_quantity numeric not null default 0,
  add column if not exists rate_uom text,
  add column if not exists calculation_method text,
  add column if not exists rate_category text,
  add column if not exists payee_type text,
  add column if not exists allocation_method text,
  add column if not exists allocation_group_key text,
  add column if not exists is_driver boolean not null default false,
  add column if not exists frozen_rate_amount numeric,
  add column if not exists regular_hours numeric not null default 0,
  add column if not exists overtime_hours numeric not null default 0,
  add column if not exists overtime_rule_id uuid references public.overtime_rules(id) on delete restrict,
  add column if not exists overtime_multiplier numeric,
  add column if not exists source_result_verified_at timestamptz;

drop index if exists public.ux_payroll_earning_work_result_worker;
create unique index if not exists payroll_earning_worker_component_unique
  on public.payroll_earning_lines (work_result_worker_id, earning_component)
  where work_result_worker_id is not null;
create index if not exists payroll_earning_requirement_idx
  on public.payroll_earning_lines (work_order_labor_requirement_id, work_result_id);

alter table public.payroll_allowance_lines
  add column if not exists source_type text,
  add column if not exists source_reference text,
  add column if not exists reason text,
  add column if not exists approved_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists approved_at timestamptz,
  add column if not exists idempotency_key text;
create unique index if not exists payroll_allowance_idempotency_unique
  on public.payroll_allowance_lines (idempotency_key) where idempotency_key is not null;

alter table public.payroll_deduction_lines
  add column if not exists deduction_category text,
  add column if not exists source_type text,
  add column if not exists source_reference text,
  add column if not exists reason text,
  add column if not exists approved_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists approved_at timestamptz,
  add column if not exists idempotency_key text;
create unique index if not exists payroll_deduction_idempotency_unique
  on public.payroll_deduction_lines (idempotency_key) where idempotency_key is not null;

alter table public.overtime_rules
  add column if not exists applicable_position text,
  add column if not exists applicable_employee_type text,
  add column if not exists normal_hours_per_day numeric not null default 8,
  add column if not exists effective_start_date date,
  add column if not exists effective_end_date date,
  add column if not exists approved_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists approved_at timestamptz;

alter table public.contractor_period_estimates
  add column if not exists work_result_worker_id uuid references public.work_result_workers(id) on delete restrict,
  add column if not exists work_result_id uuid references public.work_results(id) on delete restrict,
  add column if not exists work_order_labor_requirement_id uuid
    references public.work_order_labor_requirements(id) on delete restrict,
  add column if not exists source_planned_work_labor_requirement_id uuid
    references public.planned_work_labor_requirements(id) on delete restrict,
  add column if not exists source_budget_rate_role_id text,
  add column if not exists actual_unit text,
  add column if not exists actual_hours numeric not null default 0,
  add column if not exists frozen_rate_amount numeric,
  add column if not exists calculation_method text,
  add column if not exists rate_category text,
  add column if not exists gross_amount numeric not null default 0,
  add column if not exists quality_deduction_amount numeric not null default 0,
  add column if not exists quality_deduction_source text,
  add column if not exists quality_deduction_reference text,
  add column if not exists adjustment_reason text,
  add column if not exists result_verified_at timestamptz,
  add column if not exists snapshot_at timestamptz,
  add column if not exists idempotency_key text;
create unique index if not exists contractor_estimate_worker_unique
  on public.contractor_period_estimates (work_result_worker_id)
  where work_result_worker_id is not null;
create unique index if not exists contractor_estimate_idempotency_unique
  on public.contractor_period_estimates (idempotency_key) where idempotency_key is not null;
create index if not exists contractor_estimate_period_contractor_idx
  on public.contractor_period_estimates (payroll_period_id, contractor_id);

create table if not exists public.payroll_team_pool_reconciliations (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  work_result_id uuid not null references public.work_results(id) on delete restrict,
  work_order_labor_requirement_id uuid not null
    references public.work_order_labor_requirements(id) on delete restrict,
  allocation_group_key text not null,
  expected_amount numeric not null,
  allocated_amount numeric not null,
  difference_amount numeric not null,
  status text not null,
  reconciled_at timestamptz not null default transaction_timestamp(),
  reconciled_by_profile_id uuid references public.profiles(id) on delete restrict,
  unique (payroll_period_id, work_result_id, work_order_labor_requirement_id, allocation_group_key),
  check (status in ('reconciled', 'review_required'))
);
create index if not exists payroll_team_pool_result_idx
  on public.payroll_team_pool_reconciliations (work_result_id, work_order_labor_requirement_id);
alter table public.payroll_team_pool_reconciliations enable row level security;

do $phase2g_constraints$
begin
  if not exists (select 1 from pg_constraint where conname='payroll_periods_phase2g_half') then
    alter table public.payroll_periods add constraint payroll_periods_phase2g_half
      check (period_half is null or period_half in (1,2)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='payroll_periods_phase2g_source') then
    alter table public.payroll_periods add constraint payroll_periods_phase2g_source
      check (source_kind in ('legacy','canonical_actual','mixed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='payroll_earning_phase2g_amounts') then
    alter table public.payroll_earning_lines add constraint payroll_earning_phase2g_amounts
      check (actual_hours>=0 and actual_quantity>=0 and regular_hours>=0 and overtime_hours>=0
        and coalesce(frozen_rate_amount,0)>=0 and coalesce(overtime_multiplier,0)>=0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='payroll_earning_phase2g_component') then
    alter table public.payroll_earning_lines add constraint payroll_earning_phase2g_component
      check (earning_component in ('base','ot1','carry_forward','legacy')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='payroll_deduction_phase2g_category') then
    alter table public.payroll_deduction_lines add constraint payroll_deduction_phase2g_category
      check (deduction_category is null or deduction_category in
        ('water','electric','raw_palm','quality','rework','other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='contractor_estimate_phase2g_amounts') then
    alter table public.contractor_period_estimates add constraint contractor_estimate_phase2g_amounts
      check (coalesce(actual_quantity,0)>=0 and actual_hours>=0 and coalesce(frozen_rate_amount,0)>=0
        and gross_amount>=0 and coalesce(deduction_amount,0)>=0 and coalesce(allowance_amount,0)>=0
        and quality_deduction_amount>=0) not valid;
  end if;
end
$phase2g_constraints$;

create or replace function public.phase2g_expected_period(p_result_date date)
returns table(start_date date, end_date date, period_half smallint)
language sql immutable security invoker set search_path=''
as $phase2g_period$
  select case when extract(day from p_result_date)<=15 then date_trunc('month',p_result_date)::date
              else (date_trunc('month',p_result_date)::date+15) end,
         case when extract(day from p_result_date)<=15 then date_trunc('month',p_result_date)::date+14
              else (date_trunc('month',p_result_date)+interval '1 month'-interval '1 day')::date end,
         case when extract(day from p_result_date)<=15 then 1::smallint else 2::smallint end;
$phase2g_period$;

create or replace function public.phase2g_is_hourly(p_method text,p_uom text,p_rate_category text)
returns boolean language sql immutable security invoker set search_path=''
as $phase2g_hourly$
  select lower(coalesce(p_method,'')||' '||coalesce(p_uom,'')||' '||coalesce(p_rate_category,''))
    ~ '(hour|hourly|ชั่วโมง)';
$phase2g_hourly$;

create or replace function public.phase2g_guard_closed_payroll()
returns trigger language plpgsql security invoker set search_path=''
as $phase2g_closed_guard$
declare v_period_id uuid; v_status text;
begin
  if current_setting('app.phase2g_payroll_action',true)='on' then return coalesce(new,old); end if;
  if tg_table_name='payroll_periods' then
    if tg_op<>'INSERT' and old.status='closed' then
      raise exception using errcode='P0001',message='PAYROLL_PERIOD_CLOSED_IMMUTABLE';
    end if;
    return coalesce(new,old);
  elsif tg_table_name='payroll_employee_summaries' then
    v_period_id:=coalesce(new.payroll_period_id,old.payroll_period_id);
  elsif tg_table_name in ('payroll_earning_lines','payroll_allowance_lines','payroll_deduction_lines') then
    select s.payroll_period_id into v_period_id from public.payroll_employee_summaries s
    where s.id=coalesce(new.payroll_summary_id,old.payroll_summary_id);
  elsif tg_table_name='contractor_period_estimates' then
    v_period_id:=coalesce(new.payroll_period_id,old.payroll_period_id);
  elsif tg_table_name='payroll_team_pool_reconciliations' then
    v_period_id:=coalesce(new.payroll_period_id,old.payroll_period_id);
  end if;
  select status into v_status from public.payroll_periods where id=v_period_id;
  if v_status='closed' then
    raise exception using errcode='P0001',message='PAYROLL_PERIOD_CLOSED_IMMUTABLE';
  end if;
  return coalesce(new,old);
end
$phase2g_closed_guard$;

drop trigger if exists guard_phase2g_payroll_period on public.payroll_periods;
create trigger guard_phase2g_payroll_period before update or delete on public.payroll_periods
for each row execute function public.phase2g_guard_closed_payroll();
drop trigger if exists guard_phase2g_payroll_summary on public.payroll_employee_summaries;
create trigger guard_phase2g_payroll_summary before insert or update or delete on public.payroll_employee_summaries
for each row execute function public.phase2g_guard_closed_payroll();
drop trigger if exists guard_phase2g_payroll_earning on public.payroll_earning_lines;
create trigger guard_phase2g_payroll_earning before insert or update or delete on public.payroll_earning_lines
for each row execute function public.phase2g_guard_closed_payroll();
drop trigger if exists guard_phase2g_payroll_allowance on public.payroll_allowance_lines;
create trigger guard_phase2g_payroll_allowance before insert or update or delete on public.payroll_allowance_lines
for each row execute function public.phase2g_guard_closed_payroll();
drop trigger if exists guard_phase2g_payroll_deduction on public.payroll_deduction_lines;
create trigger guard_phase2g_payroll_deduction before insert or update or delete on public.payroll_deduction_lines
for each row execute function public.phase2g_guard_closed_payroll();
drop trigger if exists guard_phase2g_contractor_estimate on public.contractor_period_estimates;
create trigger guard_phase2g_contractor_estimate before insert or update or delete on public.contractor_period_estimates
for each row execute function public.phase2g_guard_closed_payroll();
drop trigger if exists guard_phase2g_team_pool on public.payroll_team_pool_reconciliations;
create trigger guard_phase2g_team_pool before insert or update or delete on public.payroll_team_pool_reconciliations
for each row execute function public.phase2g_guard_closed_payroll();

create or replace function public.prepare_payroll_period(
  p_period_id uuid,p_profile_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='public'
as $phase2g_prepare$
declare
  v_period public.payroll_periods%rowtype; v_expected record;
  v_worker record; v_summary_id uuid; v_rule public.overtime_rules%rowtype;
  v_base_hours numeric; v_ot_hours numeric; v_base_amount numeric; v_ot_amount numeric;
  v_inserted_employee integer:=0; v_inserted_contractor integer:=0; v_reconciled integer:=0;
begin
  perform set_config('app.phase2g_payroll_action','on',true);
  select * into v_period from public.payroll_periods where id=p_period_id for update;
  if not found then raise exception 'PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_period.status not in ('open','calculated','reviewing') then
    raise exception using errcode='P0001',message='PAYROLL_PERIOD_NOT_RECALCULABLE';
  end if;
  if v_period.start_date is null or v_period.end_date is null then
    raise exception using errcode='P0001',message='PAYROLL_PERIOD_DATES_REQUIRED';
  end if;
  select * into v_expected from public.phase2g_expected_period(v_period.start_date);
  if v_period.source_kind in ('canonical_actual','mixed') and
     (v_period.start_date<>v_expected.start_date or v_period.end_date<>v_expected.end_date) then
    raise exception using errcode='P0001',message='PAYROLL_PERIOD_HALF_MONTH_REQUIRED';
  end if;

  -- Rebuild only unlocked canonical lines. Historical legacy lines stay untouched.
  delete from public.payroll_earning_lines e using public.payroll_employee_summaries s
  where e.payroll_summary_id=s.id and s.payroll_period_id=p_period_id
    and e.source_snapshot->>'workflow_source'='canonical_work_order' and not e.is_locked;
  delete from public.contractor_period_estimates c
  where c.payroll_period_id=p_period_id and c.work_result_worker_id is not null
    and coalesce(c.status,'draft') not in ('approved','closed');
  delete from public.payroll_team_pool_reconciliations where payroll_period_id=p_period_id;

  for v_worker in
    select wrw.*,wr.verified_at,wr.result_date,wr.workflow_source,wr.result_status,
      wo.work_order_no,wo.activity_id,wo.estate_id,
      requirement.source_planned_work_labor_requirement_id,
      requirement.source_budget_rate_role_id,requirement.rate_amount as requirement_rate,
      requirement.uom as requirement_uom,requirement.calculation_method as requirement_method,
      requirement.rate_category as requirement_category,requirement.payee_type as requirement_payee,
      requirement.role_position,a.activity_code,e.position as employee_position,
      e.employee_type,e.normal_hours_per_day
    from public.work_result_workers wrw
    join public.work_results wr on wr.id=wrw.work_result_id
    join public.work_orders wo on wo.id=wr.work_order_id
    join public.work_order_labor_requirements requirement
      on requirement.id=wrw.work_order_labor_requirement_id and requirement.work_order_id=wo.id
    left join public.activities a on a.id=wo.activity_id
    left join public.employees e on e.id=wrw.employee_id
    where wr.workflow_source='canonical_work_order' and wr.result_status in ('verified','closed')
      and wr.result_date between v_period.start_date and v_period.end_date
      and coalesce(wrw.affects_payroll,true)
      and public.phase2e_is_present(wrw.attendance_status)
      and (v_period.estate_id is null or wo.estate_id=v_period.estate_id)
    order by wr.result_date,wrw.id
  loop
    if v_worker.rate_amount is distinct from v_worker.requirement_rate then
      raise exception using errcode='P0001',message='PAYROLL_FROZEN_RATE_LINEAGE_MISMATCH';
    end if;
    if v_worker.employee_id is not null then
      insert into public.payroll_employee_summaries(payroll_period_id,employee_id,status,created_at,updated_at)
      values(p_period_id,v_worker.employee_id,'draft',transaction_timestamp(),transaction_timestamp())
      on conflict(payroll_period_id,employee_id) do update set updated_at=excluded.updated_at
      returning id into v_summary_id;

      if public.phase2g_is_hourly(v_worker.requirement_method,v_worker.requirement_uom,v_worker.requirement_category) then
        select r.* into v_rule from public.overtime_rules r
        where r.status='active' and r.approved_at is not null
          and (r.effective_start_date is null or r.effective_start_date<=v_worker.result_date)
          and (r.effective_end_date is null or r.effective_end_date>=v_worker.result_date)
          and (r.applicable_position is null or lower(r.applicable_position) in
            (lower(coalesce(v_worker.employee_position,'')),lower(coalesce(v_worker.worker_role,'')),lower(coalesce(v_worker.role_position,''))))
          and (r.applicable_employee_type is null or lower(r.applicable_employee_type)=lower(coalesce(v_worker.employee_type,'')))
        order by (r.applicable_position is not null) desc,(r.applicable_employee_type is not null) desc,r.created_at desc limit 1;
      end if;
      v_ot_hours:=case when v_rule.id is null then 0 else greatest(v_worker.actual_hours-coalesce(v_rule.normal_hours_per_day,v_worker.normal_hours_per_day,8),0) end;
      v_base_hours:=case when v_rule.id is null then v_worker.actual_hours else greatest(v_worker.actual_hours-v_ot_hours,0) end;
      v_base_amount:=case
        when public.phase2g_is_hourly(v_worker.requirement_method,v_worker.requirement_uom,v_worker.requirement_category)
          then round(v_base_hours*v_worker.requirement_rate,2)
        else round(v_worker.earning_amount,2) end;
      v_ot_amount:=round(v_ot_hours*v_worker.requirement_rate*coalesce(v_rule.multiplier,0),2);

      insert into public.payroll_earning_lines(
        payroll_summary_id,work_result_worker_id,work_result_id,earning_type,earning_component,
        work_date,work_order_no,activity_code,quantity,unit,rate,amount,source_snapshot,status,
        calculation_version,is_locked,prepared_by_profile_id,work_order_labor_requirement_id,
        source_planned_work_labor_requirement_id,source_budget_rate_role_id,attendance_status,
        actual_hours,actual_quantity,rate_uom,calculation_method,rate_category,payee_type,
        allocation_method,allocation_group_key,is_driver,frozen_rate_amount,regular_hours,
        overtime_hours,source_result_verified_at,created_at
      ) values (
        v_summary_id,v_worker.id,v_worker.work_result_id,
        case when coalesce(v_worker.quantity_allocation_method,'') in ('piece_rate','team_pool')
          or not public.phase2g_is_hourly(v_worker.requirement_method,v_worker.requirement_uom,v_worker.requirement_category)
          then 'piece_rate' else 'regular' end,'base',v_worker.result_date,v_worker.work_order_no,
        v_worker.activity_code,case when public.phase2g_is_hourly(v_worker.requirement_method,v_worker.requirement_uom,v_worker.requirement_category)
          then v_base_hours else v_worker.actual_quantity end,v_worker.requirement_uom,v_worker.requirement_rate,
        v_base_amount,jsonb_build_object(
          'workflow_source','canonical_work_order','work_result_worker_id',v_worker.id,
          'work_result_id',v_worker.work_result_id,'work_order_labor_requirement_id',v_worker.work_order_labor_requirement_id,
          'source_planned_work_labor_requirement_id',v_worker.source_planned_work_labor_requirement_id,
          'source_budget_rate_role_id',v_worker.source_budget_rate_role_id,'frozen_rate_amount',v_worker.requirement_rate,
          'actual_hours',v_worker.actual_hours,'actual_quantity',v_worker.actual_quantity,
          'result_verified_at',v_worker.verified_at
        ),'draft',v_period.calculation_version,false,p_profile_id,v_worker.work_order_labor_requirement_id,
        v_worker.source_planned_work_labor_requirement_id,v_worker.source_budget_rate_role_id,
        v_worker.attendance_status,v_worker.actual_hours,v_worker.actual_quantity,v_worker.requirement_uom,
        v_worker.requirement_method,v_worker.requirement_category,v_worker.requirement_payee,
        v_worker.quantity_allocation_method,v_worker.allocation_group_key,v_worker.is_driver,
        v_worker.requirement_rate,v_base_hours,0,v_worker.verified_at,transaction_timestamp()
      ) on conflict(work_result_worker_id,earning_component) where work_result_worker_id is not null do nothing;
      if found then v_inserted_employee:=v_inserted_employee+1; end if;

      if v_ot_hours>0 then
        insert into public.payroll_earning_lines(
          payroll_summary_id,work_result_worker_id,work_result_id,earning_type,earning_component,
          work_date,work_order_no,activity_code,quantity,unit,rate,amount,source_snapshot,status,
          calculation_version,is_locked,prepared_by_profile_id,work_order_labor_requirement_id,
          source_planned_work_labor_requirement_id,source_budget_rate_role_id,attendance_status,
          actual_hours,actual_quantity,rate_uom,calculation_method,rate_category,payee_type,
          allocation_method,allocation_group_key,is_driver,frozen_rate_amount,regular_hours,
          overtime_hours,overtime_rule_id,overtime_multiplier,source_result_verified_at,created_at
        ) values (
          v_summary_id,v_worker.id,v_worker.work_result_id,'overtime','ot1',v_worker.result_date,
          v_worker.work_order_no,v_worker.activity_code,v_ot_hours,'hour',v_worker.requirement_rate,
          v_ot_amount,jsonb_build_object('workflow_source','canonical_work_order','component','OT1',
            'overtime_rule_id',v_rule.id,'multiplier',v_rule.multiplier,'frozen_rate_amount',v_worker.requirement_rate),
          'draft',v_period.calculation_version,false,p_profile_id,v_worker.work_order_labor_requirement_id,
          v_worker.source_planned_work_labor_requirement_id,v_worker.source_budget_rate_role_id,
          v_worker.attendance_status,v_worker.actual_hours,v_worker.actual_quantity,v_worker.requirement_uom,
          v_worker.requirement_method,v_worker.requirement_category,v_worker.requirement_payee,
          v_worker.quantity_allocation_method,v_worker.allocation_group_key,v_worker.is_driver,
          v_worker.requirement_rate,0,v_ot_hours,v_rule.id,v_rule.multiplier,v_worker.verified_at,transaction_timestamp()
        ) on conflict(work_result_worker_id,earning_component) where work_result_worker_id is not null do nothing;
      end if;
    elsif v_worker.contractor_id is not null then
      insert into public.contractor_period_estimates(
        payroll_period_id,contractor_id,estate_id,activity_id,estimate_date,
        estimated_quantity,estimated_unit,estimated_rate,estimated_amount,
        actual_quantity,actual_amount,deduction_amount,allowance_amount,net_amount,status,created_by,
        work_result_worker_id,work_result_id,work_order_labor_requirement_id,
        source_planned_work_labor_requirement_id,source_budget_rate_role_id,actual_unit,actual_hours,
        frozen_rate_amount,calculation_method,rate_category,gross_amount,result_verified_at,snapshot_at
      ) values (
        p_period_id,v_worker.contractor_id,v_worker.estate_id,v_worker.activity_id,v_worker.result_date,
        v_worker.actual_quantity,v_worker.requirement_uom,v_worker.requirement_rate,v_worker.earning_amount,
        v_worker.actual_quantity,v_worker.earning_amount,0,0,v_worker.earning_amount,'draft',p_profile_id,
        v_worker.id,v_worker.work_result_id,v_worker.work_order_labor_requirement_id,
        v_worker.source_planned_work_labor_requirement_id,v_worker.source_budget_rate_role_id,
        v_worker.requirement_uom,v_worker.actual_hours,v_worker.requirement_rate,
        v_worker.requirement_method,v_worker.requirement_category,v_worker.earning_amount,
        v_worker.verified_at,transaction_timestamp()
      ) on conflict(work_result_worker_id) where work_result_worker_id is not null do nothing;
      if found then v_inserted_contractor:=v_inserted_contractor+1; end if;
    end if;
  end loop;

  insert into public.payroll_team_pool_reconciliations(
    payroll_period_id,work_result_id,work_order_labor_requirement_id,allocation_group_key,
    expected_amount,allocated_amount,difference_amount,status,reconciled_by_profile_id
  )
  select p_period_id,wrw.work_result_id,wrw.work_order_labor_requirement_id,
    coalesce(wrw.allocation_group_key,wrw.work_order_labor_requirement_id::text),
    round(sum(wrw.earning_amount),2),round(sum(coalesce(e.amount,0)),2),
    round(sum(coalesce(e.amount,0))-sum(wrw.earning_amount),2),
    case when abs(sum(coalesce(e.amount,0))-sum(wrw.earning_amount))<=0.01 then 'reconciled' else 'review_required' end,
    p_profile_id
  from public.work_result_workers wrw
  join public.work_results wr on wr.id=wrw.work_result_id
  join public.payroll_earning_lines e on e.work_result_worker_id=wrw.id and e.earning_component='base'
  where wr.workflow_source='canonical_work_order' and wr.result_status in ('verified','closed')
    and wr.result_date between v_period.start_date and v_period.end_date
    and wrw.quantity_allocation_method='team_pool'
  group by wrw.work_result_id,wrw.work_order_labor_requirement_id,
    coalesce(wrw.allocation_group_key,wrw.work_order_labor_requirement_id::text)
  on conflict(payroll_period_id,work_result_id,work_order_labor_requirement_id,allocation_group_key)
  do update set expected_amount=excluded.expected_amount,allocated_amount=excluded.allocated_amount,
    difference_amount=excluded.difference_amount,status=excluded.status,
    reconciled_at=transaction_timestamp(),reconciled_by_profile_id=excluded.reconciled_by_profile_id;
  get diagnostics v_reconciled=row_count;
  if exists(select 1 from public.payroll_team_pool_reconciliations
    where payroll_period_id=p_period_id and status<>'reconciled') then
    raise exception using errcode='P0001',message='PAYROLL_TEAM_POOL_NOT_RECONCILED';
  end if;

  for v_summary_id in select id from public.payroll_employee_summaries where payroll_period_id=p_period_id loop
    perform public.recalculate_payroll_employee_summary(v_summary_id);
  end loop;
  update public.payroll_periods set status='calculated',source_kind=case when source_kind='legacy' then 'mixed' else source_kind end,
    period_half=coalesce(period_half,v_expected.period_half),prepared_by_profile_id=coalesce(prepared_by_profile_id,p_profile_id),
    prepared_at=coalesce(prepared_at,transaction_timestamp()),calculated_by_profile_id=p_profile_id,
    calculated_at=transaction_timestamp(),updated_at=transaction_timestamp() where id=p_period_id;
  perform set_config('app.phase2g_payroll_action','off',true);
  return jsonb_build_object('payroll_period_id',p_period_id,'employee_base_lines',v_inserted_employee,
    'contractor_lines',v_inserted_contractor,'team_pool_reconciliations',v_reconciled,'status','calculated');
end
$phase2g_prepare$;

create or replace function public.prepare_verified_work_result_payroll_phase2g(
  p_work_result_id uuid,p_profile_id uuid default null
) returns jsonb language plpgsql security definer set search_path='public'
as $phase2g_prepare_result$
declare v_result record; v_expected record; v_period_id uuid; v_code text;
begin
  select wr.*,wo.estate_id into v_result from public.work_results wr
  join public.work_orders wo on wo.id=wr.work_order_id where wr.id=p_work_result_id;
  if not found or v_result.workflow_source<>'canonical_work_order' then
    raise exception using errcode='P0001',message='PAYROLL_CANONICAL_RESULT_REQUIRED';
  end if;
  if v_result.result_status not in ('verified','closed') or v_result.verified_at is null then
    raise exception using errcode='P0001',message='PAYROLL_VERIFIED_RESULT_REQUIRED';
  end if;
  select * into v_expected from public.phase2g_expected_period(v_result.result_date);
  v_code:=format('PAY-%s-H%s-%s',to_char(v_result.result_date,'YYYYMM'),v_expected.period_half,
    left(coalesce(v_result.estate_id::text,'GLOBAL'),8));
  insert into public.payroll_periods(period_code,period_name,start_date,end_date,status,estate_id,period_half,source_kind)
  values(v_code,format('งวดค่าแรง %s ครึ่งเดือน %s',to_char(v_result.result_date,'YYYY-MM'),v_expected.period_half),
    v_expected.start_date,v_expected.end_date,'open',v_result.estate_id,v_expected.period_half,'canonical_actual')
  on conflict(period_code) do update set updated_at=transaction_timestamp()
  returning id into v_period_id;
  return public.prepare_payroll_period(v_period_id,p_profile_id);
end
$phase2g_prepare_result$;

create or replace function public.add_payroll_allowance_phase2g(
  p_summary_id uuid,p_source_type text,p_source_reference text,p_reason text,p_amount numeric,
  p_profile_id uuid,p_idempotency_key text
) returns public.payroll_allowance_lines
language plpgsql security definer set search_path='public'
as $phase2g_allowance$
declare v_row public.payroll_allowance_lines%rowtype; v_status text;
begin
  select p.status into v_status from public.payroll_employee_summaries s
  join public.payroll_periods p on p.id=s.payroll_period_id where s.id=p_summary_id for update of p;
  if v_status not in ('open','calculated','reviewing') then raise exception 'PAYROLL_ADJUSTMENT_PERIOD_LOCKED'; end if;
  if coalesce(p_amount,0)<=0 or nullif(trim(p_source_type),'') is null or nullif(trim(p_reason),'') is null
    then raise exception 'PAYROLL_ALLOWANCE_SOURCE_REASON_AMOUNT_REQUIRED'; end if;
  perform set_config('app.phase2g_payroll_action','on',true);
  insert into public.payroll_allowance_lines(payroll_summary_id,allowance_code,allowance_name,amount,note,status,
    source_type,source_reference,reason,approved_by_profile_id,approved_at,idempotency_key)
  values(p_summary_id,upper(left(p_source_type,60)),p_reason,p_amount,p_reason,'approved',p_source_type,
    p_source_reference,p_reason,p_profile_id,transaction_timestamp(),p_idempotency_key)
  on conflict(idempotency_key) where idempotency_key is not null do update set idempotency_key=excluded.idempotency_key
  returning * into v_row;
  perform public.recalculate_payroll_employee_summary(p_summary_id);
  perform set_config('app.phase2g_payroll_action','off',true);
  return v_row;
end
$phase2g_allowance$;

create or replace function public.add_payroll_deduction_phase2g(
  p_summary_id uuid,p_category text,p_source_type text,p_source_reference text,p_reason text,p_amount numeric,
  p_profile_id uuid,p_idempotency_key text
) returns public.payroll_deduction_lines
language plpgsql security definer set search_path='public'
as $phase2g_deduction$
declare v_row public.payroll_deduction_lines%rowtype; v_status text;
begin
  select p.status into v_status from public.payroll_employee_summaries s
  join public.payroll_periods p on p.id=s.payroll_period_id where s.id=p_summary_id for update of p;
  if v_status not in ('open','calculated','reviewing') then raise exception 'PAYROLL_ADJUSTMENT_PERIOD_LOCKED'; end if;
  if p_category not in ('water','electric','raw_palm','quality','rework','other')
    then raise exception 'PAYROLL_DEDUCTION_CATEGORY_INVALID'; end if;
  if coalesce(p_amount,0)<=0 or nullif(trim(p_source_type),'') is null
    or nullif(trim(p_source_reference),'') is null or nullif(trim(p_reason),'') is null
    then raise exception 'PAYROLL_DEDUCTION_SOURCE_REFERENCE_REASON_AMOUNT_REQUIRED'; end if;
  if p_category in ('quality','rework') and p_source_type<>'approved_quality_rule' then
    raise exception using errcode='P0001',message='PAYROLL_APPROVED_QUALITY_RULE_REQUIRED';
  end if;
  perform set_config('app.phase2g_payroll_action','on',true);
  insert into public.payroll_deduction_lines(payroll_summary_id,deduction_code,deduction_name,amount,note,status,
    deduction_category,source_type,source_reference,reason,approved_by_profile_id,approved_at,idempotency_key)
  values(p_summary_id,upper(left(p_category,60)),p_reason,p_amount,p_reason,'approved',p_category,p_source_type,
    p_source_reference,p_reason,p_profile_id,transaction_timestamp(),p_idempotency_key)
  on conflict(idempotency_key) where idempotency_key is not null do update set idempotency_key=excluded.idempotency_key
  returning * into v_row;
  perform public.recalculate_payroll_employee_summary(p_summary_id);
  perform set_config('app.phase2g_payroll_action','off',true);
  return v_row;
end
$phase2g_deduction$;

create or replace function public.adjust_contractor_estimate_phase2g(
  p_estimate_id uuid,p_deduction_amount numeric,p_allowance_amount numeric,p_quality_deduction_amount numeric,
  p_quality_source text,p_quality_reference text,p_reason text,p_profile_id uuid
) returns public.contractor_period_estimates
language plpgsql security definer set search_path='public'
as $phase2g_contractor_adjust$
declare v_row public.contractor_period_estimates%rowtype; v_status text;
begin
  select p.status into v_status from public.contractor_period_estimates c
  join public.payroll_periods p on p.id=c.payroll_period_id where c.id=p_estimate_id for update of p;
  if v_status not in ('open','calculated','reviewing') then raise exception 'CONTRACTOR_ESTIMATE_PERIOD_LOCKED'; end if;
  if coalesce(p_quality_deduction_amount,0)>0 and
    (p_quality_source<>'approved_quality_rule' or nullif(trim(p_quality_reference),'') is null) then
    raise exception using errcode='P0001',message='CONTRACTOR_APPROVED_QUALITY_RULE_REQUIRED';
  end if;
  perform set_config('app.phase2g_payroll_action','on',true);
  update public.contractor_period_estimates set deduction_amount=greatest(coalesce(p_deduction_amount,0),0),
    allowance_amount=greatest(coalesce(p_allowance_amount,0),0),
    quality_deduction_amount=greatest(coalesce(p_quality_deduction_amount,0),0),
    quality_deduction_source=p_quality_source,quality_deduction_reference=p_quality_reference,
    adjustment_reason=p_reason,approved_by=p_profile_id,
    net_amount=gross_amount-greatest(coalesce(p_deduction_amount,0),0)
      -greatest(coalesce(p_quality_deduction_amount,0),0)+greatest(coalesce(p_allowance_amount,0),0)
  where id=p_estimate_id returning * into v_row;
  perform set_config('app.phase2g_payroll_action','off',true);
  return v_row;
end
$phase2g_contractor_adjust$;

create or replace function public.approve_payroll_period(p_period_id uuid,p_profile_id uuid default null)
returns public.payroll_periods language plpgsql security definer set search_path='public'
as $phase2g_approve$
declare v_period public.payroll_periods%rowtype;
begin
  select * into v_period from public.payroll_periods where id=p_period_id for update;
  if v_period.status not in ('calculated','reviewing') then raise exception 'PAYROLL_PERIOD_NOT_READY_FOR_APPROVAL'; end if;
  if exists(select 1 from public.payroll_team_pool_reconciliations
    where payroll_period_id=p_period_id and status<>'reconciled') then raise exception 'PAYROLL_TEAM_POOL_NOT_RECONCILED'; end if;
  if exists(
    select 1 from public.work_result_workers wrw join public.work_results wr on wr.id=wrw.work_result_id
    join public.work_orders wo on wo.id=wr.work_order_id
    where wr.workflow_source='canonical_work_order' and wr.result_status in ('verified','closed')
      and wr.result_date between v_period.start_date and v_period.end_date
      and (v_period.estate_id is null or wo.estate_id=v_period.estate_id)
      and public.phase2e_is_present(wrw.attendance_status) and coalesce(wrw.affects_payroll,true)
      and ((wrw.employee_id is not null and not exists(select 1 from public.payroll_earning_lines e where e.work_result_worker_id=wrw.id))
        or (wrw.contractor_id is not null and not exists(select 1 from public.contractor_period_estimates c where c.work_result_worker_id=wrw.id)))
  ) then raise exception using errcode='P0001',message='PAYROLL_ELIGIBLE_RESULT_NOT_PREPARED'; end if;
  perform set_config('app.phase2g_payroll_action','on',true);
  update public.payroll_periods set status='approved',approved_by_profile_id=p_profile_id,
    approved_at=transaction_timestamp(),updated_at=transaction_timestamp() where id=p_period_id returning * into v_period;
  update public.payroll_employee_summaries set status='approved',approved_at=transaction_timestamp(),updated_at=transaction_timestamp()
    where payroll_period_id=p_period_id;
  update public.contractor_period_estimates set status='approved',approved_by=p_profile_id
    where payroll_period_id=p_period_id;
  perform set_config('app.phase2g_payroll_action','off',true);
  return v_period;
end
$phase2g_approve$;

create or replace function public.close_payroll_period(p_period_id uuid,p_profile_id uuid default null)
returns public.payroll_periods language plpgsql security definer set search_path='public'
as $phase2g_close$
declare v_period public.payroll_periods%rowtype;
begin
  perform set_config('app.phase2g_payroll_action','on',true);
  update public.payroll_periods set status='closed',closed_by_profile_id=p_profile_id,
    closed_at=transaction_timestamp(),updated_at=transaction_timestamp()
    where id=p_period_id and status='approved' returning * into v_period;
  if not found then raise exception 'PAYROLL_PERIOD_MUST_BE_APPROVED'; end if;
  update public.payroll_employee_summaries set status='closed',closed_at=transaction_timestamp(),updated_at=transaction_timestamp()
    where payroll_period_id=p_period_id;
  update public.payroll_earning_lines e set status='closed',is_locked=true,locked_at=transaction_timestamp()
    from public.payroll_employee_summaries s where s.id=e.payroll_summary_id and s.payroll_period_id=p_period_id;
  update public.payroll_allowance_lines a set status='closed' from public.payroll_employee_summaries s
    where s.id=a.payroll_summary_id and s.payroll_period_id=p_period_id;
  update public.payroll_deduction_lines d set status='closed' from public.payroll_employee_summaries s
    where s.id=d.payroll_summary_id and s.payroll_period_id=p_period_id;
  update public.contractor_period_estimates set status='closed',closed_by=p_profile_id where payroll_period_id=p_period_id;
  perform set_config('app.phase2g_payroll_action','off',true);
  return v_period;
end
$phase2g_close$;

create or replace view public.v_phase2g_payroll_period_workspace
with (security_invoker=true) as
select p.id as payroll_period_id,p.period_code,p.period_name,p.start_date,p.end_date,p.period_half,
  p.estate_id,p.status,p.external_export_status,
  count(distinct s.employee_id)::integer as employee_count,
  coalesce(sum(s.regular_earning+s.piece_rate_earning),0) as base_earning,
  coalesce(sum(s.overtime_earning),0) as overtime_earning,
  coalesce(sum(s.allowance_amount),0) as allowance_amount,
  coalesce(sum(s.deduction_amount),0) as deduction_amount,
  coalesce(sum(s.net_amount),0) as employee_net_amount,
  coalesce((select count(distinct c.contractor_id) from public.contractor_period_estimates c where c.payroll_period_id=p.id),0)::integer as contractor_count,
  coalesce((select sum(c.gross_amount) from public.contractor_period_estimates c where c.payroll_period_id=p.id),0) as contractor_gross_amount,
  coalesce((select sum(coalesce(c.net_amount,0)) from public.contractor_period_estimates c where c.payroll_period_id=p.id),0) as contractor_net_amount,
  coalesce((select count(*) from public.payroll_team_pool_reconciliations r where r.payroll_period_id=p.id and r.status<>'reconciled'),0)::integer as exception_count,
  p.calculated_at,p.approved_at,p.closed_at
from public.payroll_periods p left join public.payroll_employee_summaries s on s.payroll_period_id=p.id
group by p.id;

create or replace view public.v_phase2g_payroll_employee_drilldown
with (security_invoker=true) as
select s.payroll_period_id,s.id as payroll_summary_id,s.employee_id,e.employee_code,e.full_name,
  l.id as earning_line_id,l.earning_component,l.earning_type,l.work_date,l.work_order_no,l.activity_code,
  l.work_date as result_date,
  l.work_result_id,l.work_result_worker_id,l.work_order_labor_requirement_id,
  l.source_planned_work_labor_requirement_id,l.source_budget_rate_role_id,
  l.attendance_status,l.actual_hours,l.actual_quantity,l.unit,l.frozen_rate_amount,
  l.overtime_hours,l.overtime_multiplier,l.amount,l.source_snapshot,s.net_amount,
  coalesce((select count(distinct d.work_date) from public.payroll_earning_lines d
    where d.payroll_summary_id=s.id and d.work_result_id is not null),0)::integer as work_day_count,
  coalesce((select count(distinct d.activity_code) from public.payroll_earning_lines d
    where d.payroll_summary_id=s.id and d.work_result_id is not null and d.activity_code is not null),0)::integer as activity_count
from public.payroll_employee_summaries s join public.employees e on e.id=s.employee_id
left join public.payroll_earning_lines l on l.payroll_summary_id=s.id;

create or replace view public.v_phase2g_payroll_eligibility_preview
with (security_invoker=true) as
with eligible_results as (
  select wr.id as work_result_id,wr.result_date,wo.estate_id,period.start_date,period.end_date,period.period_half
  from public.work_results wr
  join public.work_orders wo on wo.id=wr.work_order_id
  cross join lateral public.phase2g_expected_period(wr.result_date) period
  where wr.workflow_source='canonical_work_order'
    and wr.result_status in ('verified','closed') and wr.verified_at is not null
), worker_scope as (
  select result.*,worker.id as work_result_worker_id,worker.employee_id,worker.contractor_id,
    (exists(select 1 from public.payroll_earning_lines earning where earning.work_result_worker_id=worker.id)
      or exists(select 1 from public.contractor_period_estimates estimate where estimate.work_result_worker_id=worker.id)) as is_processed,
    (worker.id is null or requirement.id is null
      or worker.rate_amount is distinct from requirement.rate_amount) as has_exception
  from eligible_results result
  left join public.work_result_workers worker on worker.work_result_id=result.work_result_id
    and coalesce(worker.affects_payroll,true)
    and public.phase2e_is_present(worker.attendance_status)
  left join public.work_order_labor_requirements requirement
    on requirement.id=worker.work_order_labor_requirement_id
), result_status as (
  select work_result_id,bool_and(is_processed) as is_processed,bool_or(has_exception) as has_exception
  from worker_scope group by work_result_id
)
select estate_id,start_date,end_date,period_half,
  'PAY-'||to_char(start_date,'YYYY-MM')||'-H'||period_half as period_code,
  count(distinct worker.work_result_id)::integer as verified_result_count,
  count(distinct worker.employee_id) filter (where not result.has_exception)::integer as employee_count,
  count(distinct worker.contractor_id) filter (where not result.has_exception)::integer as contractor_count,
  count(distinct worker.work_result_id) filter (where not result.is_processed and not result.has_exception)::integer as ready_result_count,
  count(distinct worker.work_result_id) filter (where result.is_processed)::integer as already_processed_count,
  count(distinct worker.work_result_id) filter (where result.has_exception)::integer as exception_count,
  min(worker.work_result_id::text) filter (where not result.is_processed and not result.has_exception)::uuid as next_work_result_id
from worker_scope worker join result_status result on result.work_result_id=worker.work_result_id
group by estate_id,start_date,end_date,period_half;

create or replace view public.v_phase2g_bpay_reconciliation_export
with (security_invoker=true) as
select p.id as payroll_period_id,p.period_code,p.start_date,p.end_date,p.status,
  e.employee_code,e.full_name,s.regular_earning+s.piece_rate_earning as base_earning,
  s.overtime_earning,s.allowance_amount,s.deduction_amount,s.gross_amount,s.net_amount,
  earning.source_result_count,
  case
    when earning.source_result_count=0 then 'missing_source'
    when exists(select 1 from public.payroll_team_pool_reconciliations r
      where r.payroll_period_id=p.id and r.status<>'reconciled') then 'review_required'
    when abs((earning.earning_amount+adjustment.allowance_amount-adjustment.deduction_amount)-s.net_amount)>0.01 then 'difference'
    else 'matched'
  end as variance_state,
  p.external_export_status,p.external_export_reference
from public.payroll_periods p join public.payroll_employee_summaries s on s.payroll_period_id=p.id
join public.employees e on e.id=s.employee_id
left join lateral (
  select count(distinct line.work_result_id)::integer as source_result_count,coalesce(sum(line.amount),0) as earning_amount
  from public.payroll_earning_lines line where line.payroll_summary_id=s.id
) earning on true
left join lateral (
  select
    coalesce((select sum(line.amount) from public.payroll_allowance_lines line where line.payroll_summary_id=s.id),0) as allowance_amount,
    coalesce((select sum(line.amount) from public.payroll_deduction_lines line where line.payroll_summary_id=s.id),0) as deduction_amount
) adjustment on true;

revoke insert,update,delete on
  public.payroll_periods,
  public.payroll_employee_summaries,
  public.payroll_earning_lines,
  public.payroll_allowance_lines,
  public.payroll_deduction_lines,
  public.contractor_period_estimates
from public,anon,authenticated;
revoke all on public.payroll_team_pool_reconciliations from public,anon,authenticated;
revoke all on public.v_phase2g_payroll_period_workspace from public,anon,authenticated;
revoke all on public.v_phase2g_payroll_employee_drilldown from public,anon,authenticated;
revoke all on public.v_phase2g_payroll_eligibility_preview from public,anon,authenticated;
revoke all on public.v_phase2g_bpay_reconciliation_export from public,anon,authenticated;
grant select on public.payroll_team_pool_reconciliations to service_role;
grant select on public.v_phase2g_payroll_period_workspace to service_role;
grant select on public.v_phase2g_payroll_employee_drilldown to service_role;
grant select on public.v_phase2g_payroll_eligibility_preview to service_role;
grant select on public.v_phase2g_bpay_reconciliation_export to service_role;

revoke all on function public.phase2g_expected_period(date) from public,anon,authenticated;
revoke all on function public.phase2g_is_hourly(text,text,text) from public,anon,authenticated;
revoke all on function public.prepare_payroll_period(uuid,uuid) from public,anon,authenticated;
revoke all on function public.prepare_verified_work_result_payroll_phase2g(uuid,uuid) from public,anon,authenticated;
revoke all on function public.add_payroll_allowance_phase2g(uuid,text,text,text,numeric,uuid,text) from public,anon,authenticated;
revoke all on function public.add_payroll_deduction_phase2g(uuid,text,text,text,text,numeric,uuid,text) from public,anon,authenticated;
revoke all on function public.adjust_contractor_estimate_phase2g(uuid,numeric,numeric,numeric,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.approve_payroll_period(uuid,uuid) from public,anon,authenticated;
revoke all on function public.close_payroll_period(uuid,uuid) from public,anon,authenticated;
grant execute on function public.phase2g_expected_period(date) to service_role;
grant execute on function public.phase2g_is_hourly(text,text,text) to service_role;
grant execute on function public.prepare_payroll_period(uuid,uuid) to service_role;
grant execute on function public.prepare_verified_work_result_payroll_phase2g(uuid,uuid) to service_role;
grant execute on function public.add_payroll_allowance_phase2g(uuid,text,text,text,numeric,uuid,text) to service_role;
grant execute on function public.add_payroll_deduction_phase2g(uuid,text,text,text,text,numeric,uuid,text) to service_role;
grant execute on function public.adjust_contractor_estimate_phase2g(uuid,numeric,numeric,numeric,text,text,text,uuid) to service_role;
grant execute on function public.approve_payroll_period(uuid,uuid) to service_role;
grant execute on function public.close_payroll_period(uuid,uuid) to service_role;

comment on column public.payroll_earning_lines.frozen_rate_amount is
  'Frozen from Work Result Worker / Work Order Labor Requirement; never refreshed from Rate Master.';
comment on view public.v_phase2g_bpay_reconciliation_export is
  'Read-only reconciliation/export source. Phase 2G performs no external B-Pay writes.';

commit;
