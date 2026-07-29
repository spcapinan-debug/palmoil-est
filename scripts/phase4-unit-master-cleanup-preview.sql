-- Phase 4 Unit Master Cleanup Preview
-- Read-only against permanent tables. This script only creates session-local temp data.
-- Review the result and obtain explicit user approval before any canonicalization.

begin;

create temporary table phase4_unit_fk_counts (
  unit_id uuid primary key,
  foreign_key_references bigint not null default 0
) on commit drop;

insert into phase4_unit_fk_counts(unit_id)
select id from public.units;

do $$
declare
  fk record;
begin
  for fk in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a
      on a.attrelid=con.conrelid
      and a.attnum=con.conkey[1]
    where con.contype='f'
      and con.confrelid='public.units'::regclass
      and array_length(con.conkey,1)=1
    order by n.nspname,c.relname,a.attname
  loop
    execute format(
      'update phase4_unit_fk_counts c
       set foreign_key_references=c.foreign_key_references+x.reference_count
       from (
         select %1$I as unit_id,count(*)::bigint as reference_count
         from %2$I.%3$I
         where %1$I is not null
         group by %1$I
       ) x
       where c.unit_id=x.unit_id',
      fk.column_name,
      fk.schema_name,
      fk.table_name
    );
  end loop;
end
$$;

with normalized as (
  select
    u.id as unit_id,
    u.unit_code as code,
    u.unit_name as name,
    u.base_unit,
    u.conversion_rate,
    coalesce(c.foreign_key_references,0) as foreign_key_references,
    case
      when regexp_replace(lower(coalesce(u.unit_code,u.unit_name,'')),'[.\s]','','g')
        in ('กก','kg','กิโลกรัม','kilogram') then 'kg'
      when regexp_replace(lower(coalesce(u.unit_code,u.unit_name,'')),'[.\s]','','g')
        in ('ตัน','ton','tonne') then 'ton'
      else regexp_replace(lower(coalesce(u.unit_code,u.unit_name,'')),'[.\s]','','g')
    end as canonical_group
  from public.units u
  left join phase4_unit_fk_counts c on c.unit_id=u.id
),
ranked as (
  select
    n.*,
    first_value(n.unit_id) over(
      partition by n.canonical_group
      order by n.foreign_key_references desc,n.code nulls last,n.unit_id
    ) as proposed_canonical_unit_id,
    count(*) over(partition by n.canonical_group) as duplicate_count
  from normalized n
),
aliases as (
  select
    canonical_group,
    string_agg(
      distinct concat_ws(' / ',nullif(code,''),nullif(name,'')),
      ', '
      order by concat_ws(' / ',nullif(code,''),nullif(name,''))
    ) as proposed_aliases
  from normalized
  group by canonical_group
)
select
  r.unit_id,
  r.code,
  r.name,
  r.base_unit,
  r.conversion_rate,
  r.foreign_key_references,
  r.proposed_canonical_unit_id,
  a.proposed_aliases,
  case
    when r.duplicate_count=1 then 'ไม่มีรายการซ้ำจาก normalization นี้'
    when r.unit_id=r.proposed_canonical_unit_id then
      format('เสนอเป็น canonical; ต้องตรวจ conversion และ FK ของ alias อีก %s รายการ',r.duplicate_count-1)
    else
      format(
        'หาก merge จะย้าย FK %s reference ไป canonical; ต้องตรวจ conversion rate และ snapshot ย้อนหลังก่อน',
        r.foreign_key_references
      )
  end as merge_impact_preview
from ranked r
join aliases a using(canonical_group)
where r.canonical_group in ('kg','ton') or r.duplicate_count>1
order by r.canonical_group,
  (r.unit_id=r.proposed_canonical_unit_id) desc,
  r.foreign_key_references desc,
  r.code,
  r.unit_id;

rollback;
