alter table public.goods_issue_lines
  add column if not exists requested_quantity numeric,
  add column if not exists requested_unit_id uuid references public.units(id) on delete set null,
  add column if not exists base_quantity numeric,
  add column if not exists base_unit_id uuid references public.units(id) on delete set null,
  add column if not exists conversion_rate_snapshot numeric,
  add column if not exists rounding_difference numeric not null default 0;

update public.goods_issue_lines gil
set requested_quantity=coalesce(gil.requested_quantity,gil.quantity),
    requested_unit_id=coalesce(gil.requested_unit_id,gil.unit_id),
    base_unit_id=coalesce(gil.base_unit_id,m.base_unit_id),
    base_quantity=coalesce(gil.base_quantity,
      case when gil.unit_id=m.base_unit_id then gil.quantity else null end),
    conversion_rate_snapshot=coalesce(gil.conversion_rate_snapshot,
      case when gil.unit_id=m.base_unit_id then 1 else null end)
from public.materials m
where m.id=gil.material_id;

create or replace function public.calculate_material_issue_quantity(
  p_material_id uuid,
  p_required_quantity numeric,
  p_required_unit_id uuid,
  p_issue_unit_id uuid,
  p_allow_fraction boolean default false
) returns jsonb
language plpgsql
stable
set search_path=public
as $$
declare
  v_raw numeric;
  v_issue numeric;
  v_back numeric;
  v_rate numeric;
begin
  if p_required_quantity is null or p_required_quantity<0 then
    raise exception 'INVALID_REQUIRED_QUANTITY';
  end if;
  v_rate:=public.material_conversion_rate(p_material_id,p_required_unit_id,p_issue_unit_id);
  if v_rate is null then raise exception 'MATERIAL_UNIT_CONVERSION_NOT_CONFIGURED'; end if;
  v_raw:=round(p_required_quantity*v_rate,6);
  v_issue:=case when p_allow_fraction then v_raw else round(v_raw) end;
  v_back:=public.convert_material_quantity(p_material_id,v_issue,p_issue_unit_id,p_required_unit_id);
  return jsonb_build_object(
    'material_id',p_material_id,
    'required_quantity',p_required_quantity,
    'required_unit_id',p_required_unit_id,
    'issue_unit_id',p_issue_unit_id,
    'conversion_rate',v_rate,
    'raw_issue_quantity',v_raw,
    'issue_quantity',v_issue,
    'allow_fraction',p_allow_fraction,
    'converted_back_quantity',v_back,
    'rounding_difference',round(v_back-p_required_quantity,6)
  );
end;
$$;

create or replace view public.v_material_unit_conversion_options as
select sc.material_id,m.material_code,m.material_name,
  sc.from_unit_id,fu.unit_code from_unit_code,fu.unit_name from_unit_name,
  sc.to_unit_id,tu.unit_code to_unit_code,tu.unit_name to_unit_name,
  sc.conversion_rate,sc.status,'material'::text conversion_scope
from public.sku_conversions sc
join public.materials m on m.id=sc.material_id
join public.units fu on fu.id=sc.from_unit_id
join public.units tu on tu.id=sc.to_unit_id
where sc.status='active'
union all
select null::uuid,null::text,null::text,
  uc.from_unit_id,fu.unit_code,fu.unit_name,
  uc.to_unit_id,tu.unit_code,tu.unit_name,
  uc.conversion_rate,uc.status,'global'::text
from public.unit_conversions uc
join public.units fu on fu.id=uc.from_unit_id
join public.units tu on tu.id=uc.to_unit_id
where uc.status='active';

create or replace view public.v_goods_return_readiness as
select v.id goods_issue_id,v.issue_no,v.work_order_id,v.warehouse_id,v.goods_issue_line_id,
  v.material_id,v.material_code,v.material_name,v.issued_quantity,v.issued_unit_id,v.issued_unit_name,
  v.used_quantity,v.returned_quantity,v.outstanding_quantity,v.usage_day_count,
  case
    when v.status<>'posted' then 'issue_not_posted'
    when v.usage_status='closed' then 'closed'
    when v.outstanding_quantity>0 then 'return_or_use_required'
    else 'ready_to_close'
  end return_readiness
from public.v_goods_issue_multi_day_status v;

insert into public.sku_conversions(material_id,from_unit_id,to_unit_id,conversion_rate,status)
select m.id,bag.id,kg.id,50,'active'
from public.materials m
join public.units bag on bag.id=m.base_unit_id and bag.unit_name='กระสอบ'
join public.units kg on kg.unit_name='กก'
where m.material_code='WEBTEST-2569-MAT-FERT50'
on conflict(material_id,from_unit_id,to_unit_id) do update
set conversion_rate=excluded.conversion_rate,status='active';

insert into public.sku_conversions(material_id,from_unit_id,to_unit_id,conversion_rate,status)
select m.id,kg.id,bag.id,0.02,'active'
from public.materials m
join public.units bag on bag.id=m.base_unit_id and bag.unit_name='กระสอบ'
join public.units kg on kg.unit_name='กก'
where m.material_code='WEBTEST-2569-MAT-FERT50'
on conflict(material_id,from_unit_id,to_unit_id) do update
set conversion_rate=excluded.conversion_rate,status='active';

insert into public.system_settings(setting_key,setting_value,description)
values
 ('inventory.multi_day_issue_enabled','false','เปิดใช้ใบจ่ายพัสดุหนึ่งครั้งสำหรับงานต่อเนื่องหลายวันหลัง UI/API ผ่าน UAT'),
 ('inventory.material_return_enabled','false','เปิดใช้การคืนพัสดุและ Posting กลับคลังหลัง UI/API ผ่าน UAT'),
 ('inventory.unit_conversion_enabled','false','เปิดใช้การแปลงหน่วยวัสดุตอนขอเบิกและจ่ายหลังตั้งค่า Conversion จริงครบ')
on conflict(setting_key) do update set description=excluded.description;

comment on function public.calculate_material_issue_quantity(uuid,numeric,uuid,uuid,boolean) is 'คำนวณหน่วยจ่ายและปัด .5 ขึ้น ต่ำกว่า .5 ลงเมื่อไม่อนุญาตเศษ พร้อมเก็บส่วนต่าง';
comment on view public.v_goods_return_readiness is 'สถานะยอดค้างที่ต้องใช้ต่อหรือคืนก่อนปิดใบจ่าย';