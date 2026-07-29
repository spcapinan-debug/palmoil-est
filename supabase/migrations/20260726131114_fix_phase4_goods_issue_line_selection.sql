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
  order by id limit 1;
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