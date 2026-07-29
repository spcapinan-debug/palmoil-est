alter table public.goods_issues
  add column if not exists issue_start_date date,
  add column if not exists issue_end_date date,
  add column if not exists allow_multi_day boolean not null default false,
  add column if not exists usage_status text not null default 'open',
  add column if not exists usage_closed_at timestamptz,
  add column if not exists usage_closed_by_profile_id uuid references public.profiles(id) on delete set null;

update public.goods_issues
set issue_start_date=coalesce(issue_start_date,issue_date),
    issue_end_date=coalesce(issue_end_date,issue_date)
where issue_start_date is null or issue_end_date is null;

alter table public.goods_returns
  add column if not exists goods_issue_id uuid references public.goods_issues(id) on delete set null,
  add column if not exists work_result_id uuid references public.work_results(id) on delete set null,
  add column if not exists requested_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists posted_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists posted_at timestamptz,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.goods_return_lines
  add column if not exists goods_issue_line_id uuid references public.goods_issue_lines(id) on delete set null,
  add column if not exists material_lot_id uuid references public.material_lots(id) on delete set null,
  add column if not exists base_quantity numeric,
  add column if not exists base_unit_id uuid references public.units(id) on delete set null,
  add column if not exists unit_cost numeric not null default 0,
  add column if not exists amount numeric not null default 0,
  add column if not exists condition_status text not null default 'good';

create table if not exists public.goods_issue_daily_usage (
  id uuid primary key default gen_random_uuid(),
  goods_issue_id uuid not null references public.goods_issues(id) on delete cascade,
  goods_issue_line_id uuid not null references public.goods_issue_lines(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete set null,
  work_result_id uuid references public.work_results(id) on delete set null,
  usage_date date not null,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit_id uuid not null references public.units(id) on delete restrict,
  issue_unit_quantity numeric not null check (issue_unit_quantity > 0),
  issue_unit_id uuid not null references public.units(id) on delete restrict,
  base_quantity numeric not null check (base_quantity > 0),
  base_unit_id uuid not null references public.units(id) on delete restrict,
  status text not null default 'posted',
  idempotency_key text,
  recorded_by_profile_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(idempotency_key)
);

create index if not exists idx_goods_issue_daily_usage_issue_date
  on public.goods_issue_daily_usage(goods_issue_id,usage_date);
create index if not exists idx_goods_issue_daily_usage_result
  on public.goods_issue_daily_usage(work_result_id);
create index if not exists idx_goods_returns_issue_status
  on public.goods_returns(goods_issue_id,status,return_date);

create or replace function public.material_conversion_rate(
  p_material_id uuid,
  p_from_unit_id uuid,
  p_to_unit_id uuid
) returns numeric
language plpgsql
stable
set search_path=public
as $$
declare v_rate numeric;
begin
  if p_from_unit_id is null or p_to_unit_id is null then return null; end if;
  if p_from_unit_id=p_to_unit_id then return 1; end if;

  select conversion_rate into v_rate
  from public.sku_conversions
  where material_id=p_material_id and from_unit_id=p_from_unit_id and to_unit_id=p_to_unit_id and status='active'
  limit 1;
  if v_rate is not null then return v_rate; end if;

  select conversion_rate into v_rate
  from public.unit_conversions
  where from_unit_id=p_from_unit_id and to_unit_id=p_to_unit_id and status='active'
  limit 1;
  if v_rate is not null then return v_rate; end if;

  select 1/conversion_rate into v_rate
  from public.sku_conversions
  where material_id=p_material_id and from_unit_id=p_to_unit_id and to_unit_id=p_from_unit_id and status='active' and conversion_rate<>0
  limit 1;
  if v_rate is not null then return v_rate; end if;

  select 1/conversion_rate into v_rate
  from public.unit_conversions
  where from_unit_id=p_to_unit_id and to_unit_id=p_from_unit_id and status='active' and conversion_rate<>0
  limit 1;
  return v_rate;
end;
$$;

create or replace function public.convert_material_quantity(
  p_material_id uuid,
  p_quantity numeric,
  p_from_unit_id uuid,
  p_to_unit_id uuid
) returns numeric
language plpgsql
stable
set search_path=public
as $$
declare v_rate numeric;
begin
  if p_quantity is null then return null; end if;
  v_rate:=public.material_conversion_rate(p_material_id,p_from_unit_id,p_to_unit_id);
  if v_rate is null then
    raise exception 'MATERIAL_UNIT_CONVERSION_NOT_CONFIGURED';
  end if;
  return round(p_quantity*v_rate,6);
end;
$$;

create or replace function public.record_goods_issue_daily_usage(
  p_issue_id uuid,
  p_usage_date date,
  p_work_result_id uuid,
  p_material_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_profile_id uuid,
  p_note text default null,
  p_idempotency_key text default null
) returns public.goods_issue_daily_usage
language plpgsql
security definer
set search_path=public
as $$
declare
  v_issue public.goods_issues;
  v_line public.goods_issue_lines;
  v_material public.materials;
  v_result public.work_results;
  v_issue_qty numeric;
  v_base_qty numeric;
  v_used numeric;
  v_returned numeric;
  v_row public.goods_issue_daily_usage;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'INVALID_USAGE_QUANTITY'; end if;
  select * into v_issue from public.goods_issues where id=p_issue_id for update;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;
  if v_issue.status<>'posted' then raise exception 'GOODS_ISSUE_NOT_POSTED'; end if;
  if v_issue.usage_status='closed' then raise exception 'GOODS_ISSUE_USAGE_CLOSED'; end if;
  if p_usage_date<coalesce(v_issue.issue_start_date,v_issue.issue_date)
     or p_usage_date>coalesce(v_issue.issue_end_date,v_issue.issue_date) then
    raise exception 'USAGE_DATE_OUTSIDE_ISSUE_PERIOD';
  end if;

  if p_work_result_id is not null then
    select * into v_result from public.work_results where id=p_work_result_id;
    if not found then raise exception 'WORK_RESULT_NOT_FOUND'; end if;
    if v_issue.work_order_id is not null and v_result.work_order_id is distinct from v_issue.work_order_id then
      raise exception 'WORK_RESULT_NOT_MATCH_ISSUE';
    end if;
  end if;

  select * into v_line from public.goods_issue_lines
  where issue_id=p_issue_id and material_id=p_material_id
  order by created_at,id limit 1;
  if not found then raise exception 'MATERIAL_NOT_IN_GOODS_ISSUE'; end if;
  select * into v_material from public.materials where id=p_material_id;

  v_issue_qty:=public.convert_material_quantity(p_material_id,p_quantity,p_unit_id,v_line.unit_id);
  v_base_qty:=public.convert_material_quantity(p_material_id,p_quantity,p_unit_id,v_material.base_unit_id);

  select coalesce(sum(issue_unit_quantity),0) into v_used
  from public.goods_issue_daily_usage
  where goods_issue_line_id=v_line.id and status<>'cancelled';

  select coalesce(sum(public.convert_material_quantity(p_material_id,quantity,unit_id,v_line.unit_id)),0) into v_returned
  from public.goods_return_lines grl join public.goods_returns gr on gr.id=grl.return_id
  where grl.goods_issue_line_id=v_line.id and gr.status='posted';

  if v_used+v_returned+v_issue_qty>v_line.quantity+0.000001 then
    raise exception 'USAGE_EXCEEDS_AVAILABLE_ISSUED_QUANTITY';
  end if;

  insert into public.goods_issue_daily_usage(
    goods_issue_id,goods_issue_line_id,work_order_id,work_result_id,usage_date,material_id,
    quantity,unit_id,issue_unit_quantity,issue_unit_id,base_quantity,base_unit_id,
    idempotency_key,recorded_by_profile_id,note
  ) values(
    p_issue_id,v_line.id,v_issue.work_order_id,p_work_result_id,p_usage_date,p_material_id,
    p_quantity,p_unit_id,v_issue_qty,v_line.unit_id,v_base_qty,v_material.base_unit_id,
    p_idempotency_key,p_profile_id,p_note
  ) returning * into v_row;

  update public.work_order_materials wom
  set used_quantity=coalesce((
      select sum(public.convert_material_quantity(u.material_id,u.quantity,u.unit_id,wom.unit_id))
      from public.goods_issue_daily_usage u
      where u.work_order_id=wom.work_order_id and u.material_id=wom.material_id and u.status<>'cancelled'
    ),0), updated_at=now()
  where wom.work_order_id=v_issue.work_order_id and wom.material_id=p_material_id;

  return v_row;
exception when unique_violation then
  if p_idempotency_key is not null then
    select * into v_row from public.goods_issue_daily_usage where idempotency_key=p_idempotency_key;
    return v_row;
  end if;
  raise;
end;
$$;

create or replace function public.prepare_goods_return_from_issue(
  p_issue_id uuid,
  p_profile_id uuid,
  p_return_date date default current_date,
  p_work_result_id uuid default null
) returns public.goods_returns
language plpgsql
security definer
set search_path=public
as $$
declare
  v_issue public.goods_issues;
  v_return public.goods_returns;
  v_no text;
  r record;
  v_used numeric;
  v_returned numeric;
  v_available numeric;
begin
  select * into v_issue from public.goods_issues where id=p_issue_id for update;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;
  if v_issue.status<>'posted' then raise exception 'GOODS_ISSUE_NOT_POSTED'; end if;

  select * into v_return from public.goods_returns
  where goods_issue_id=p_issue_id and status in ('draft','pending_approval','approved')
  order by created_at desc limit 1;
  if found then return v_return; end if;

  v_no:='GR-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public.goods_returns(return_no,warehouse_id,work_order_id,work_result_id,goods_issue_id,
    return_date,status,created_by,requested_by_profile_id,created_at,updated_at)
  values(v_no,v_issue.warehouse_id,v_issue.work_order_id,p_work_result_id,p_issue_id,
    p_return_date,'draft',p_profile_id,p_profile_id,now(),now())
  returning * into v_return;

  for r in select * from public.goods_issue_lines where issue_id=p_issue_id loop
    select coalesce(sum(issue_unit_quantity),0) into v_used
    from public.goods_issue_daily_usage where goods_issue_line_id=r.id and status<>'cancelled';
    select coalesce(sum(public.convert_material_quantity(r.material_id,grl.quantity,grl.unit_id,r.unit_id)),0) into v_returned
    from public.goods_return_lines grl join public.goods_returns gr on gr.id=grl.return_id
    where grl.goods_issue_line_id=r.id and gr.status='posted';
    v_available:=greatest(r.quantity-v_used-v_returned,0);
    if v_available>0 then
      insert into public.goods_return_lines(return_id,material_id,material_lot_id,goods_issue_line_id,
        quantity,unit_id,base_quantity,base_unit_id,unit_cost,amount)
      select v_return.id,r.material_id,r.material_lot_id,r.id,v_available,r.unit_id,
        public.convert_material_quantity(r.material_id,v_available,r.unit_id,m.base_unit_id),m.base_unit_id,
        r.unit_cost,round(v_available*r.unit_cost,2)
      from public.materials m where m.id=r.material_id;
    end if;
  end loop;
  return v_return;
end;
$$;

create or replace function public.approve_goods_return(p_return_id uuid,p_profile_id uuid)
returns public.goods_returns
language plpgsql security definer set search_path=public
as $$
declare v_row public.goods_returns;
begin
  select * into v_row from public.goods_returns where id=p_return_id for update;
  if not found then raise exception 'GOODS_RETURN_NOT_FOUND'; end if;
  if v_row.status='approved' then return v_row; end if;
  if v_row.status not in ('draft','pending_approval') then raise exception 'INVALID_GOODS_RETURN_STATUS'; end if;
  if not exists(select 1 from public.goods_return_lines where return_id=p_return_id and quantity>0) then
    raise exception 'GOODS_RETURN_HAS_NO_LINES';
  end if;
  update public.goods_returns set status='approved',approved_by_profile_id=p_profile_id,approved_at=now(),updated_at=now()
  where id=p_return_id returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.post_goods_return(p_return_id uuid,p_profile_id uuid)
returns public.goods_returns
language plpgsql security definer set search_path=public
as $$
declare
  v_return public.goods_returns;
  r record;
  v_base_qty numeric;
  v_updated integer;
begin
  select * into v_return from public.goods_returns where id=p_return_id for update;
  if not found then raise exception 'GOODS_RETURN_NOT_FOUND'; end if;
  if v_return.status='posted' then return v_return; end if;
  if v_return.status<>'approved' then raise exception 'GOODS_RETURN_NOT_APPROVED'; end if;

  for r in
    select grl.*,m.base_unit_id
    from public.goods_return_lines grl join public.materials m on m.id=grl.material_id
    where grl.return_id=p_return_id
  loop
    v_base_qty:=public.convert_material_quantity(r.material_id,r.quantity,r.unit_id,r.base_unit_id);

    update public.stock_balances
    set quantity_on_hand=quantity_on_hand+v_base_qty,updated_at=now()
    where warehouse_id=v_return.warehouse_id and material_id=r.material_id
      and material_lot_id is not distinct from r.material_lot_id and unit_id=r.base_unit_id;
    get diagnostics v_updated=row_count;
    if v_updated=0 then
      insert into public.stock_balances(warehouse_id,material_id,material_lot_id,quantity_on_hand,unit_id,updated_at)
      values(v_return.warehouse_id,r.material_id,r.material_lot_id,v_base_qty,r.base_unit_id,now());
    end if;

    if r.material_lot_id is not null then
      update public.material_lots set remaining_quantity=remaining_quantity+v_base_qty where id=r.material_lot_id;
    end if;

    insert into public.stock_transactions(material_id,warehouse_id,work_order_id,transaction_type,quantity,
      quantity_in,quantity_out,unit_id,unit_cost,transaction_date,status,created_by,source_table,source_id,source_line_id,note)
    values(r.material_id,v_return.warehouse_id,v_return.work_order_id,'return',v_base_qty,
      v_base_qty,0,r.base_unit_id,r.unit_cost,v_return.return_date,'posted',p_profile_id,
      'goods_returns',v_return.id,r.id,'คืนพัสดุเข้าคลัง');
  end loop;

  update public.goods_returns set status='posted',posted_by_profile_id=p_profile_id,posted_at=now(),updated_at=now()
  where id=p_return_id returning * into v_return;

  update public.work_order_materials wom
  set returned_quantity=coalesce((
      select sum(public.convert_material_quantity(grl.material_id,grl.quantity,grl.unit_id,wom.unit_id))
      from public.goods_return_lines grl join public.goods_returns gr on gr.id=grl.return_id
      where gr.work_order_id=wom.work_order_id and grl.material_id=wom.material_id and gr.status='posted'
    ),0),updated_at=now()
  where wom.work_order_id=v_return.work_order_id;

  return v_return;
end;
$$;

create or replace function public.close_goods_issue_usage(p_issue_id uuid,p_profile_id uuid)
returns public.goods_issues
language plpgsql security definer set search_path=public
as $$
declare v_issue public.goods_issues; r record; v_used numeric; v_returned numeric;
begin
  select * into v_issue from public.goods_issues where id=p_issue_id for update;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;
  if v_issue.status<>'posted' then raise exception 'GOODS_ISSUE_NOT_POSTED'; end if;
  if v_issue.usage_status='closed' then return v_issue; end if;
  for r in select * from public.goods_issue_lines where issue_id=p_issue_id loop
    select coalesce(sum(issue_unit_quantity),0) into v_used from public.goods_issue_daily_usage where goods_issue_line_id=r.id and status<>'cancelled';
    select coalesce(sum(public.convert_material_quantity(r.material_id,grl.quantity,grl.unit_id,r.unit_id)),0) into v_returned
    from public.goods_return_lines grl join public.goods_returns gr on gr.id=grl.return_id
    where grl.goods_issue_line_id=r.id and gr.status='posted';
    if abs(r.quantity-v_used-v_returned)>0.000001 then raise exception 'ISSUE_BALANCE_NOT_CLEARED'; end if;
  end loop;
  update public.goods_issues set usage_status='closed',usage_closed_at=now(),usage_closed_by_profile_id=p_profile_id,updated_at=now()
  where id=p_issue_id returning * into v_issue;
  return v_issue;
end;
$$;

create or replace view public.v_goods_issue_multi_day_status as
select gi.id,gi.issue_no,gi.warehouse_id,gi.work_order_id,gi.work_result_id,gi.issue_date,
  coalesce(gi.issue_start_date,gi.issue_date) issue_start_date,
  coalesce(gi.issue_end_date,gi.issue_date) issue_end_date,
  gi.allow_multi_day,gi.status,gi.usage_status,gi.issued_to_employee_id,
  gil.id goods_issue_line_id,gil.material_id,m.material_code,m.material_name,
  gil.quantity issued_quantity,gil.unit_id issued_unit_id,u.unit_name issued_unit_name,
  coalesce(us.used_quantity,0) used_quantity,
  coalesce(rt.returned_quantity,0) returned_quantity,
  greatest(gil.quantity-coalesce(us.used_quantity,0)-coalesce(rt.returned_quantity,0),0) outstanding_quantity,
  coalesce(us.usage_day_count,0) usage_day_count,
  us.first_usage_date,us.last_usage_date
from public.goods_issues gi
join public.goods_issue_lines gil on gil.issue_id=gi.id
join public.materials m on m.id=gil.material_id
left join public.units u on u.id=gil.unit_id
left join lateral (
  select sum(x.issue_unit_quantity) used_quantity,count(distinct x.usage_date) usage_day_count,
    min(x.usage_date) first_usage_date,max(x.usage_date) last_usage_date
  from public.goods_issue_daily_usage x where x.goods_issue_line_id=gil.id and x.status<>'cancelled'
) us on true
left join lateral (
  select sum(public.convert_material_quantity(gil.material_id,x.quantity,x.unit_id,gil.unit_id)) returned_quantity
  from public.goods_return_lines x join public.goods_returns h on h.id=x.return_id
  where x.goods_issue_line_id=gil.id and h.status='posted'
) rt on true;

comment on table public.goods_issue_daily_usage is 'การใช้วัสดุรายวันภายใต้ใบจ่ายเดียว รองรับงานต่อเนื่องหลายวัน';
comment on function public.convert_material_quantity(uuid,numeric,uuid,uuid) is 'แปลงปริมาณวัสดุตาม SKU conversion ก่อนใช้ conversion กลาง';
comment on view public.v_goods_issue_multi_day_status is 'สรุปยอดจ่าย ใช้รายวัน คืน และคงเหลือของใบจ่ายหลายวัน';