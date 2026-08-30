-- Phase 2C.2: immutable full-resource snapshots on canonical Planned Items.
-- Historical rows are not backfilled; Work Order, Survey, Performance and Payroll are untouched.
begin;
alter table public.planned_work_items
 add column planned_labor_rate_snapshot jsonb,
 add column planned_resource_rate_snapshot jsonb,
 add column budget_block_resolution_snapshot jsonb,
 add column resource_snapshot_reconciliation_status text,
 add column resource_snapshot_reconciliation_errors jsonb,
 add column full_resource_snapshot_at timestamptz,
 add constraint planned_work_items_resource_reconciliation_valid check(
  resource_snapshot_reconciliation_status is null or resource_snapshot_reconciliation_status in('matched','unresolved'));

create or replace function public.planning_rate_basis(u text,m text,c text)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare x text:=lower(coalesce(u,''));y text:=lower(concat_ws(' ',m,c));a text;b text;
begin
 a:=case when x~'(ต้น|tree)' then 'tree_count' when x~'(ไร่|rai)' then 'area_rai'
 when x~'(วัน|day)' then 'day_count' when x~'(ชั่วโมง|ชม|hour|hr)' then 'hour_count'
 when x~'(ตัน|ton)' then 'weight_ton' when x~'(ครั้ง|job|fixed|เหมา)' then 'fixed' end;
 b:=case when y~'(tree|ต้น)' then 'tree_count' when y~'(rai|area|ไร่)' then 'area_rai'
 when y~'(day|daily|วัน)' then 'day_count' when y~'(hour|hourly|ชั่วโมง|ชม)' then 'hour_count'
 when y~'(ton|weight|ตัน)' then 'weight_ton' when y~'(fixed|job|ครั้ง|เหมา)' then 'fixed' end;
 if a is not null and b is not null and a<>b then return null;end if;return coalesce(b,a);end $$;
create or replace function public.planning_resource_type(t text)
returns text language sql immutable security invoker set search_path='' as $$
select case when lower(coalesce(t,''))~'(fuel|diesel|น้ำมัน)' then 'fuel'
when lower(coalesce(t,''))~'(machine|เครื่องจักร)' then 'machine'
when lower(coalesce(t,''))~'(equipment|อุปกรณ์)' then 'equipment'
when lower(coalesce(t,''))~'(vehicle|truck|tractor|รถ)' then 'vehicle'
when lower(coalesce(t,''))~'(material|วัสดุ)' then 'material'
when nullif(btrim(t),'') is null or lower(t)~'(labor|wage|worker|payroll|contractor|ค่าแรง|แรงงาน|ผู้รับเหมา)' then 'labor'
else 'other' end $$;

create or replace function public.populate_canonical_planning_full_resource_snapshot(item_id uuid,snap_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare i public.planned_work_items%rowtype;b public.blocks%rowtype;labor jsonb;resources jsonb;errs jsonb;
begin
 if current_setting('app.phase2c_snapshot_rpc',true) is distinct from 'on' then
  raise exception using errcode='P0001',message='PLANNING_CANONICAL_ACTION_REQUIRED';end if;
 select * into i from public.planned_work_items where id=item_id for update;
 select * into b from public.blocks where id=i.block_id and status='active';
 if not found then raise exception using errcode='P0001',message='PLANNING_BLOCK_NOT_FOUND';end if;
 if not exists(select 1 from public.budget_rate_blocks rb where rb.id=i.source_budget_rate_block_id
  and rb.budget_rate_id=i.source_budget_activity_rate_id and rb.block_id=i.block_id and rb.status='active')
 then raise exception using errcode='P0001',message='PLANNING_BUDGET_BLOCK_RESOLUTION_REQUIRED';end if;

 select coalesce(jsonb_agg(jsonb_build_object('source_budget_rate_role_id',role.id,'source_budget_activity_rate_id',r.id,
  'team_id',role.team_id,'position',coalesce(role.role_name,role.worker_group_name,role.rate_category,role.payee_type,'base_rate'),
  'line_type',coalesce(role.line_type,'wage'),'rate_category',role.rate_category,'rate_amount',coalesce(role.rate_amount,r.rate_amount),
  'uom',coalesce(role.uom,r.unit_name),'calculation_method',coalesce(role.calculation_method,r.calculation_method),
  'rate_basis',public.planning_rate_basis(coalesce(role.uom,r.unit_name),coalesce(role.calculation_method,r.calculation_method),r.comparison_basis),
  'affects_payroll',coalesce(role.affects_payroll,true),'snapshot_at',snap_at) order by r.id,role.id),'[]'::jsonb)
 into labor from public.budget_activity_rates r join public.budget_rate_blocks rb on rb.budget_rate_id=r.id and rb.block_id=i.block_id and rb.status='active'
 left join public.budget_rate_roles role on role.budget_rate_id=r.id and role.status='active'
 where r.budget_year_id=i.source_budget_year_id and r.activity_id=i.activity_id and r.approval_status='approved'
 and r.status='active' and r.is_current is true and public.planning_resource_type(r.rate_type)='labor';

 select coalesce(jsonb_agg(jsonb_build_object('source_budget_activity_rate_id',r.id,'source_budget_rate_block_id',rb.id,
  'resource_type',public.planning_resource_type(r.rate_type),'rate_code',r.rate_code,'rate_amount',r.rate_amount,'uom',r.unit_name,
  'calculation_method',r.calculation_method,'rate_basis',public.planning_rate_basis(r.unit_name,r.calculation_method,r.comparison_basis),
  'block_id',i.block_id,'area_rai',b.area_rai,'tree_count',b.tree_count,'terrain_code',rb.terrain_code,'ap_code',coalesce(b.ap_code,rb.ap_code),
  'snapshot_at',snap_at) order by r.id,rb.id),'[]'::jsonb) into resources
 from public.budget_activity_rates r join public.budget_rate_blocks rb on rb.budget_rate_id=r.id and rb.block_id=i.block_id and rb.status='active'
 where r.budget_year_id=i.source_budget_year_id and r.activity_id=i.activity_id and r.approval_status='approved'
 and r.status='active' and r.is_current is true;

 select coalesce(jsonb_agg(x),'[]'::jsonb) into errs from(
  select jsonb_build_object('source_id',v->>'source_budget_rate_role_id','code','RATE_MAPPING_MISMATCH') x
  from jsonb_array_elements(labor)v where v->'rate_amount'='null'::jsonb or v->'rate_basis'='null'::jsonb
  union all select jsonb_build_object('source_id',v->>'source_budget_activity_rate_id','code','RATE_MAPPING_MISMATCH')
  from jsonb_array_elements(resources)v where v->>'resource_type'='other'
   or (v->>'resource_type' not in('labor','material') and (v->'rate_amount'='null'::jsonb or v->'rate_basis'='null'::jsonb))
  union all select jsonb_build_object('source_id',r.id,'code','RATE_BLOCK_UNRESOLVED')
  from public.budget_activity_rates r where r.budget_year_id=i.source_budget_year_id and r.activity_id=i.activity_id
   and r.approval_status='approved' and r.status='active' and r.is_current is true
   and not exists(select 1 from public.budget_rate_blocks rb where rb.budget_rate_id=r.id
    and rb.block_id=i.block_id and rb.status='active'))q;
 update public.planned_work_items set planned_labor_rate_snapshot=labor,planned_resource_rate_snapshot=resources,
 budget_block_resolution_snapshot=jsonb_build_object('source_budget_activity_rate_id',i.source_budget_activity_rate_id,
  'source_budget_rate_block_id',i.source_budget_rate_block_id,'block_id',i.block_id,'area_rai',b.area_rai,'tree_count',b.tree_count),
 resource_snapshot_reconciliation_status=case when jsonb_array_length(errs)=0 then 'matched' else 'unresolved' end,
 resource_snapshot_reconciliation_errors=errs,full_resource_snapshot_at=snap_at where id=item_id;
end $$;

create or replace function public.snapshot_full_resources_after_item() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform public.populate_canonical_planning_full_resource_snapshot(new.id,coalesce(new.created_at,transaction_timestamp()));return new;end $$;
create trigger snapshot_full_resources_after_item after insert on public.planned_work_items for each row
when(new.source_type='canonical_budget') execute function public.snapshot_full_resources_after_item();
create or replace function public.snapshot_full_resources_after_refresh() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform public.populate_canonical_planning_full_resource_snapshot(new.planned_work_item_id,new.snapshot_at);return new;end $$;
create trigger snapshot_full_resources_after_refresh after update of material_count on public.planning_material_snapshot_requests
for each row execute function public.snapshot_full_resources_after_refresh();

-- Retain the Phase 2C validation/calculation function and only allow a genuinely empty active Material set.
alter function public.populate_canonical_planning_material_snapshot(uuid,text,text,text,uuid,uuid,timestamptz)
rename to populate_canonical_planning_material_snapshot_required;
create or replace function public.populate_canonical_planning_material_snapshot(i uuid,y text,r text,rb text,b uuid,a uuid,t timestamptz)
returns integer language plpgsql security invoker set search_path='' as $$
begin return public.populate_canonical_planning_material_snapshot_required(i,y,r,rb,b,a,t);
exception when raise_exception then
 if sqlerrm='PLANNING_MATERIAL_SNAPSHOT_EMPTY' and not exists(select 1 from public.budget_rate_block_materials
 where budget_rate_block_id=rb and status='active') then return 0;end if;raise;end $$;

create or replace function public.approve_canonical_annual_work_plan(p_annual_plan_id uuid,p_actor_profile_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.annual_work_plans%rowtype;n integer;
begin
 if p_actor_profile_id is null or not exists(select 1 from public.profiles where id=p_actor_profile_id and status='active')
 then raise exception using errcode='P0001',message='ACTOR_PROFILE_NOT_FOUND';end if;
 select * into p from public.annual_work_plans where id=p_annual_plan_id for update;
 if not found then raise exception using errcode='P0001',message='PLANNING_ANNUAL_PLAN_NOT_FOUND';end if;
 if p.source_type is distinct from 'canonical_budget' then raise exception using errcode='P0001',message='PLANNING_CANONICAL_LINEAGE_REQUIRED';end if;
 if p.status is distinct from 'draft' then raise exception using errcode='P0001',message='PLANNING_PLAN_FROZEN';end if;
 select count(*)::integer into n from public.planned_work_items where annual_plan_id=p_annual_plan_id;
 if n=0 then raise exception using errcode='P0001',message='PLANNING_PLAN_EMPTY';end if;
 if exists(select 1 from public.planned_work_items i where i.annual_plan_id=p_annual_plan_id and
 (i.source_type is distinct from 'canonical_budget' or i.full_resource_snapshot_at is null
 or i.resource_snapshot_reconciliation_status is distinct from 'matched'
 or i.budget_block_resolution_snapshot is null or jsonb_array_length(coalesce(i.planned_labor_rate_snapshot,'[]'))=0
 or jsonb_array_length(coalesce(i.planned_resource_rate_snapshot,'[]'))=0))
 then raise exception using errcode='P0001',message='PLANNING_RATE_RECONCILIATION_REQUIRED';end if;
 if exists(select 1 from public.planned_work_items i join public.planned_work_materials m on m.planned_work_item_id=i.id
 where i.annual_plan_id=p_annual_plan_id and(m.snapshot_source_type is distinct from 'canonical_budget_block_material'
 or m.source_budget_rate_block_material_id is null or m.snapshot_usage_rate<=0 or m.snapshot_basis_quantity<0
 or m.unit_id is null or m.planned_quantity<0 or m.snapshot_at is null))
 then raise exception using errcode='P0001',message='PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE';end if;
 perform set_config('app.phase2c_plan_header_rpc','on',true);
 update public.annual_work_plans set status='approved',approved_by=p_actor_profile_id,approved_at=transaction_timestamp(),
 updated_at=transaction_timestamp() where id=p_annual_plan_id returning * into p;
 return jsonb_build_object('annual_work_plan',to_jsonb(p),'planned_work_item_count',n);end $$;

revoke all on function public.planning_rate_basis(text,text,text),public.planning_resource_type(text),
public.populate_canonical_planning_full_resource_snapshot(uuid,timestamptz),public.snapshot_full_resources_after_item(),
public.snapshot_full_resources_after_refresh(),public.populate_canonical_planning_material_snapshot(uuid,text,text,text,uuid,uuid,timestamptz),
public.populate_canonical_planning_material_snapshot_required(uuid,text,text,text,uuid,uuid,timestamptz),
public.approve_canonical_annual_work_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function public.planning_rate_basis(text,text,text),public.planning_resource_type(text),
public.populate_canonical_planning_full_resource_snapshot(uuid,timestamptz),public.snapshot_full_resources_after_item(),
public.snapshot_full_resources_after_refresh(),public.populate_canonical_planning_material_snapshot(uuid,text,text,text,uuid,uuid,timestamptz),
public.populate_canonical_planning_material_snapshot_required(uuid,text,text,text,uuid,uuid,timestamptz),
public.approve_canonical_annual_work_plan(uuid,uuid) to service_role;
comment on column public.planned_work_items.planned_labor_rate_snapshot is 'Frozen multi-position Labor Rate lines. Later WO/Payroll must copy these values, not reread Rate Master.';
comment on column public.planned_work_items.planned_resource_rate_snapshot is 'Frozen Material, Equipment, Machine, Vehicle and Fuel Rate lines resolved to the selected Block.';
commit;
