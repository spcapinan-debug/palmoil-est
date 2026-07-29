begin;

create or replace function public.update_goods_return_line(
  p_return_line_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_condition_status text,
  p_destination_bin_id uuid,
  p_profile_id uuid
) returns public.goods_return_lines
language plpgsql
security definer
set search_path=public
as $$
declare
  v_header public.goods_returns;
  v_line public.goods_return_lines;
  v_base_unit_id uuid;
  v_base_quantity numeric;
begin
  select h.* into v_header
  from public.goods_returns h
  join public.goods_return_lines l on l.return_id=h.id
  where l.id=p_return_line_id
  for update of h;
  if not found then raise exception 'GOODS_RETURN_NOT_FOUND'; end if;
  if v_header.status<>'draft' then raise exception 'INVALID_GOODS_RETURN_STATUS'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'INVALID_RETURN_QUANTITY'; end if;
  if p_condition_status not in ('good','damaged','expired','contaminated','quarantine') then
    raise exception 'INVALID_RETURN_CONDITION';
  end if;
  if p_condition_status<>'good' then raise exception 'RETURN_REQUIRES_QUARANTINE'; end if;
  if not exists(
    select 1 from public.bin_locations bl
    where bl.id=p_destination_bin_id
      and bl.warehouse_id=v_header.warehouse_id
      and bl.status='active'
  ) then
    raise exception 'INVALID_DESTINATION_BIN';
  end if;

  select * into v_line
  from public.goods_return_lines
  where id=p_return_line_id
  for update;

  select m.base_unit_id into v_base_unit_id
  from public.materials m
  where m.id=v_line.material_id;
  v_base_quantity:=public.convert_material_quantity(
    v_line.material_id,p_quantity,p_unit_id,v_base_unit_id
  );

  update public.goods_return_lines
  set quantity=p_quantity,
      unit_id=p_unit_id,
      condition_status=p_condition_status,
      destination_bin_id=p_destination_bin_id,
      base_quantity=v_base_quantity,
      base_unit_id=v_base_unit_id,
      amount=round(p_quantity*unit_cost,2)
  where id=p_return_line_id
  returning * into v_line;

  -- Validate inside the same statement so an overage rolls the line edit back.
  perform public.validate_goods_return_integrity(v_header.id);

  return v_line;
end;
$$;

revoke execute on function public.update_goods_return_line(
  uuid,numeric,uuid,text,uuid,uuid
) from public,anon,authenticated;
grant execute on function public.update_goods_return_line(
  uuid,numeric,uuid,text,uuid,uuid
) to service_role;

commit;
