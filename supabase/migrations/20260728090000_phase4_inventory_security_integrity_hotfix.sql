begin;

alter table public.goods_return_lines
  add column if not exists destination_bin_id uuid references public.bin_locations(id) on delete restrict;

alter table public.goods_issue_daily_usage
  add column if not exists request_hash text;

create index if not exists idx_goods_return_lines_issue_line
  on public.goods_return_lines(goods_issue_line_id);
create index if not exists idx_goods_return_lines_destination_bin
  on public.goods_return_lines(destination_bin_id);
create index if not exists idx_goods_issue_daily_usage_issue_line_status
  on public.goods_issue_daily_usage(goods_issue_line_id,status);
create index if not exists idx_goods_return_lines_return_issue
  on public.goods_return_lines(return_id,goods_issue_line_id);
create unique index if not exists ux_stock_balances_phase4_scope
  on public.stock_balances(
    warehouse_id,
    coalesce(bin_id,'00000000-0000-0000-0000-000000000000'::uuid),
    material_id,
    coalesce(material_lot_id,'00000000-0000-0000-0000-000000000000'::uuid),
    unit_id
  );

do $$
declare
  v_constraint_name text;
begin
  select c.conname into v_constraint_name
  from pg_constraint c
  where c.conrelid='public.goods_issue_daily_usage'::regclass
    and c.contype='u'
    and pg_get_constraintdef(c.oid)='UNIQUE (idempotency_key)';

  if v_constraint_name is not null then
    execute format(
      'alter table public.goods_issue_daily_usage drop constraint %I',
      v_constraint_name
    );
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.goods_issue_daily_usage'::regclass
      and conname='goods_issue_daily_usage_issue_idempotency_key_key'
  ) then
    alter table public.goods_issue_daily_usage
      add constraint goods_issue_daily_usage_issue_idempotency_key_key
      unique(goods_issue_id,idempotency_key);
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.goods_return_lines'::regclass
      and conname='goods_return_lines_quantity_positive'
  ) then
    alter table public.goods_return_lines
      add constraint goods_return_lines_quantity_positive
      check(quantity>0) not valid;
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.goods_return_lines'::regclass
      and conname='goods_return_lines_condition_status_check'
  ) then
    alter table public.goods_return_lines
      add constraint goods_return_lines_condition_status_check
      check(condition_status in ('good','damaged','expired','contaminated','quarantine'))
      not valid;
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.goods_return_lines'::regclass
      and conname='goods_return_lines_issue_unit_required'
  ) then
    alter table public.goods_return_lines
      add constraint goods_return_lines_issue_unit_required
      check(goods_issue_line_id is null or unit_id is not null)
      not valid;
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.goods_issues'::regclass
      and conname='goods_issues_period_order_check'
  ) then
    alter table public.goods_issues
      add constraint goods_issues_period_order_check
      check(
        issue_start_date is null
        or issue_end_date is null
        or issue_start_date<=issue_end_date
      ) not valid;
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.goods_issues'::regclass
      and conname='goods_issues_single_day_period_check'
  ) then
    alter table public.goods_issues
      add constraint goods_issues_single_day_period_check
      check(
        allow_multi_day
        or issue_start_date is null
        or issue_end_date is null
        or issue_start_date=issue_end_date
      ) not valid;
  end if;
end
$$;

create or replace function public.validate_goods_issue_daily_usage_integrity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_issue public.goods_issues;
  v_line public.goods_issue_lines;
  v_result public.work_results;
  v_material public.materials;
begin
  select * into v_issue
  from public.goods_issues
  where id=new.goods_issue_id;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;

  select * into v_line
  from public.goods_issue_lines
  where id=new.goods_issue_line_id;
  if not found or v_line.issue_id is distinct from new.goods_issue_id then
    raise exception 'GOODS_ISSUE_LINE_NOT_MATCH_ISSUE';
  end if;
  if v_line.material_id is distinct from new.material_id then
    raise exception 'MATERIAL_NOT_IN_GOODS_ISSUE';
  end if;
  if new.work_order_id is distinct from v_issue.work_order_id then
    raise exception 'WORK_ORDER_NOT_MATCH_ISSUE';
  end if;

  if new.work_result_id is not null then
    select * into v_result
    from public.work_results
    where id=new.work_result_id;
    if not found then raise exception 'WORK_RESULT_NOT_FOUND'; end if;
    if v_result.work_order_id is distinct from v_issue.work_order_id then
      raise exception 'WORK_RESULT_NOT_MATCH_ISSUE';
    end if;
  end if;

  select * into v_material
  from public.materials
  where id=new.material_id;
  if not found then raise exception 'MATERIAL_NOT_FOUND'; end if;

  if new.issue_unit_id is distinct from v_line.unit_id
     or new.base_unit_id is distinct from v_material.base_unit_id then
    raise exception 'MATERIAL_UNIT_CONVERSION_NOT_CONFIGURED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_goods_issue_daily_usage_integrity
  on public.goods_issue_daily_usage;
create trigger trg_goods_issue_daily_usage_integrity
before insert or update on public.goods_issue_daily_usage
for each row execute function public.validate_goods_issue_daily_usage_integrity();

drop function if exists public.record_goods_issue_daily_usage(
  uuid,date,uuid,uuid,numeric,uuid,uuid,text,text
);

create function public.record_goods_issue_daily_usage(
  p_issue_id uuid,
  p_issue_line_id uuid,
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
  v_hash text;
  v_row public.goods_issue_daily_usage;
begin
  if p_quantity is null or p_quantity<=0 then
    raise exception 'INVALID_USAGE_QUANTITY';
  end if;

  select * into v_issue
  from public.goods_issues
  where id=p_issue_id
  for update;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;
  if v_issue.status<>'posted' then raise exception 'GOODS_ISSUE_NOT_POSTED'; end if;
  if v_issue.usage_status='closed' then raise exception 'GOODS_ISSUE_USAGE_CLOSED'; end if;
  if p_usage_date<coalesce(v_issue.issue_start_date,v_issue.issue_date)
     or p_usage_date>coalesce(v_issue.issue_end_date,v_issue.issue_date) then
    raise exception 'USAGE_DATE_OUTSIDE_ISSUE_PERIOD';
  end if;

  select * into v_line
  from public.goods_issue_lines
  where id=p_issue_line_id
  for update;
  if not found or v_line.issue_id is distinct from p_issue_id then
    raise exception 'GOODS_ISSUE_LINE_NOT_MATCH_ISSUE';
  end if;
  if v_line.material_id is distinct from p_material_id then
    raise exception 'MATERIAL_NOT_IN_GOODS_ISSUE';
  end if;

  if p_work_result_id is not null then
    select * into v_result
    from public.work_results
    where id=p_work_result_id;
    if not found then raise exception 'WORK_RESULT_NOT_FOUND'; end if;
    if v_result.work_order_id is distinct from v_issue.work_order_id then
      raise exception 'WORK_RESULT_NOT_MATCH_ISSUE';
    end if;
  end if;

  select * into v_material
  from public.materials
  where id=p_material_id;
  if not found then raise exception 'MATERIAL_NOT_FOUND'; end if;

  v_issue_qty:=public.convert_material_quantity(
    p_material_id,p_quantity,p_unit_id,v_line.unit_id
  );
  v_base_qty:=public.convert_material_quantity(
    p_material_id,p_quantity,p_unit_id,v_material.base_unit_id
  );
  v_hash:=md5(jsonb_build_object(
    'issue_id',p_issue_id,
    'issue_line_id',p_issue_line_id,
    'usage_date',p_usage_date,
    'work_result_id',p_work_result_id,
    'material_id',p_material_id,
    'quantity',p_quantity,
    'unit_id',p_unit_id,
    'note',p_note
  )::text);

  if p_idempotency_key is not null then
    select * into v_row
    from public.goods_issue_daily_usage
    where goods_issue_id=p_issue_id
      and idempotency_key=p_idempotency_key;
    if found then
      if v_row.request_hash is distinct from v_hash then
        raise exception 'IDEMPOTENCY_PAYLOAD_MISMATCH';
      end if;
      return v_row;
    end if;
  end if;

  select coalesce(sum(issue_unit_quantity),0) into v_used
  from public.goods_issue_daily_usage
  where goods_issue_line_id=v_line.id
    and status='posted';

  select coalesce(sum(
    public.convert_material_quantity(
      p_material_id,grl.quantity,grl.unit_id,v_line.unit_id
    )
  ),0) into v_returned
  from public.goods_return_lines grl
  join public.goods_returns gr on gr.id=grl.return_id
  where grl.goods_issue_line_id=v_line.id
    and gr.status='posted';

  if v_used+v_returned+v_issue_qty>v_line.quantity+0.000001 then
    raise exception 'USAGE_EXCEEDS_AVAILABLE_ISSUED_QUANTITY';
  end if;

  insert into public.goods_issue_daily_usage(
    goods_issue_id,goods_issue_line_id,work_order_id,work_result_id,
    usage_date,material_id,quantity,unit_id,issue_unit_quantity,
    issue_unit_id,base_quantity,base_unit_id,idempotency_key,
    request_hash,recorded_by_profile_id,note
  ) values(
    p_issue_id,v_line.id,v_issue.work_order_id,p_work_result_id,
    p_usage_date,p_material_id,p_quantity,p_unit_id,v_issue_qty,
    v_line.unit_id,v_base_qty,v_material.base_unit_id,p_idempotency_key,
    v_hash,p_profile_id,p_note
  ) returning * into v_row;

  update public.work_order_materials wom
  set used_quantity=coalesce((
      select sum(public.convert_material_quantity(
        u.material_id,u.quantity,u.unit_id,wom.unit_id
      ))
      from public.goods_issue_daily_usage u
      where u.work_order_id=wom.work_order_id
        and u.material_id=wom.material_id
        and u.status='posted'
    ),0),
    updated_at=now()
  where wom.work_order_id=v_issue.work_order_id
    and wom.material_id=p_material_id;

  return v_row;
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select * into v_row
      from public.goods_issue_daily_usage
      where goods_issue_id=p_issue_id
        and idempotency_key=p_idempotency_key;
      if found and v_row.request_hash is not distinct from v_hash then
        return v_row;
      end if;
      if found then raise exception 'IDEMPOTENCY_PAYLOAD_MISMATCH'; end if;
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
  v_destination_bin_id uuid;
  r record;
  v_used numeric;
  v_returned numeric;
  v_available numeric;
begin
  select * into v_issue
  from public.goods_issues
  where id=p_issue_id
  for update;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;
  if v_issue.status<>'posted' then raise exception 'GOODS_ISSUE_NOT_POSTED'; end if;
  if v_issue.usage_status='closed' then raise exception 'GOODS_ISSUE_USAGE_CLOSED'; end if;

  if p_work_result_id is not null
     and not exists(
       select 1 from public.work_results wr
       where wr.id=p_work_result_id
         and wr.work_order_id is not distinct from v_issue.work_order_id
     ) then
    raise exception 'WORK_RESULT_NOT_MATCH_ISSUE';
  end if;

  select * into v_return
  from public.goods_returns
  where goods_issue_id=p_issue_id
    and status in ('draft','pending_approval','approved')
  order by created_at desc,id
  limit 1;
  if found then return v_return; end if;

  v_no:='GR-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public.goods_returns(
    return_no,warehouse_id,work_order_id,work_result_id,goods_issue_id,
    return_date,status,created_by,requested_by_profile_id,created_at,updated_at
  ) values(
    v_no,v_issue.warehouse_id,v_issue.work_order_id,p_work_result_id,p_issue_id,
    p_return_date,'draft',p_profile_id,p_profile_id,now(),now()
  ) returning * into v_return;

  for r in
    select *
    from public.goods_issue_lines
    where issue_id=p_issue_id
    order by id
    for update
  loop
    select coalesce(sum(issue_unit_quantity),0) into v_used
    from public.goods_issue_daily_usage
    where goods_issue_line_id=r.id
      and status='posted';

    select coalesce(sum(public.convert_material_quantity(
      r.material_id,grl.quantity,grl.unit_id,r.unit_id
    )),0) into v_returned
    from public.goods_return_lines grl
    join public.goods_returns gr on gr.id=grl.return_id
    where grl.goods_issue_line_id=r.id
      and gr.status='posted';

    v_available:=greatest(r.quantity-v_used-v_returned,0);
    if v_available>0 then
      v_destination_bin_id:=r.bin_id;
      if v_destination_bin_id is null then
        select bl.id into v_destination_bin_id
        from public.bin_locations bl
        where bl.warehouse_id=v_issue.warehouse_id
          and bl.status='active'
        order by bl.bin_code,bl.id
        limit 1;
      end if;

      insert into public.goods_return_lines(
        return_id,material_id,material_lot_id,goods_issue_line_id,
        destination_bin_id,quantity,unit_id,base_quantity,base_unit_id,
        unit_cost,amount,condition_status
      )
      select
        v_return.id,r.material_id,r.material_lot_id,r.id,
        v_destination_bin_id,v_available,r.unit_id,
        public.convert_material_quantity(
          r.material_id,v_available,r.unit_id,m.base_unit_id
        ),
        m.base_unit_id,r.unit_cost,round(v_available*r.unit_cost,2),'good'
      from public.materials m
      where m.id=r.material_id;
    end if;
  end loop;

  return v_return;
end;
$$;

create or replace function public.validate_goods_return_integrity(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_return public.goods_returns;
  v_issue public.goods_issues;
  v_used numeric;
  v_posted_returns numeric;
  v_current_return numeric;
  v_available numeric;
  v_base_qty numeric;
  r record;
begin
  select * into v_return
  from public.goods_returns
  where id=p_return_id
  for update;
  if not found then raise exception 'GOODS_RETURN_NOT_FOUND'; end if;
  if v_return.goods_issue_id is null then
    raise exception 'GOODS_ISSUE_NOT_FOUND';
  end if;

  select * into v_issue
  from public.goods_issues
  where id=v_return.goods_issue_id
  for update;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;
  if v_return.warehouse_id is distinct from v_issue.warehouse_id then
    raise exception 'GOODS_RETURN_WAREHOUSE_NOT_MATCH_ISSUE';
  end if;

  perform grl.id
  from public.goods_return_lines grl
  where grl.return_id=p_return_id
  order by grl.goods_issue_line_id,grl.id
  for update;

  perform gil.id
  from public.goods_issue_lines gil
  where gil.id in(
    select grl.goods_issue_line_id
    from public.goods_return_lines grl
    where grl.return_id=p_return_id
  )
  order by gil.id
  for update;

  if not exists(
    select 1
    from public.goods_return_lines
    where return_id=p_return_id
  ) then
    raise exception 'GOODS_RETURN_HAS_NO_LINES';
  end if;

  for r in
    select
      grl.*,
      gil.issue_id as line_issue_id,
      gil.material_id as issued_material_id,
      gil.material_lot_id as issued_lot_id,
      gil.quantity as issued_quantity,
      gil.unit_id as issued_unit_id,
      m.base_unit_id as material_base_unit_id
    from public.goods_return_lines grl
    left join public.goods_issue_lines gil on gil.id=grl.goods_issue_line_id
    left join public.materials m on m.id=grl.material_id
    where grl.return_id=p_return_id
    order by grl.goods_issue_line_id,grl.id
  loop
    if r.quantity is null or r.quantity<=0 then
      raise exception 'INVALID_RETURN_QUANTITY';
    end if;
    if r.goods_issue_line_id is null
       or r.line_issue_id is distinct from v_return.goods_issue_id then
      raise exception 'GOODS_ISSUE_LINE_NOT_MATCH_ISSUE';
    end if;
    if r.material_id is distinct from r.issued_material_id then
      raise exception 'MATERIAL_NOT_IN_GOODS_ISSUE';
    end if;
    if r.material_lot_id is distinct from r.issued_lot_id then
      raise exception 'MATERIAL_LOT_NOT_MATCH_ISSUE';
    end if;
    if r.unit_id is null or r.material_base_unit_id is null then
      raise exception 'MATERIAL_UNIT_CONVERSION_NOT_CONFIGURED';
    end if;
    if r.condition_status is distinct from 'good' then
      raise exception 'RETURN_REQUIRES_QUARANTINE';
    end if;
    if r.destination_bin_id is null
       or not exists(
         select 1
         from public.bin_locations bl
         where bl.id=r.destination_bin_id
           and bl.warehouse_id=v_return.warehouse_id
           and bl.status='active'
       ) then
      raise exception 'INVALID_DESTINATION_BIN';
    end if;

    v_base_qty:=public.convert_material_quantity(
      r.material_id,r.quantity,r.unit_id,r.material_base_unit_id
    );

    update public.goods_return_lines
    set base_quantity=v_base_qty,
        base_unit_id=r.material_base_unit_id,
        amount=round(r.quantity*r.unit_cost,2)
    where id=r.id;

    select coalesce(sum(u.issue_unit_quantity),0) into v_used
    from public.goods_issue_daily_usage u
    where u.goods_issue_line_id=r.goods_issue_line_id
      and u.status='posted';

    select coalesce(sum(public.convert_material_quantity(
      x.material_id,x.quantity,x.unit_id,r.issued_unit_id
    )),0) into v_posted_returns
    from public.goods_return_lines x
    join public.goods_returns h on h.id=x.return_id
    where x.goods_issue_line_id=r.goods_issue_line_id
      and h.status='posted'
      and h.id<>p_return_id;

    select coalesce(sum(public.convert_material_quantity(
      x.material_id,x.quantity,x.unit_id,r.issued_unit_id
    )),0) into v_current_return
    from public.goods_return_lines x
    where x.return_id=p_return_id
      and x.goods_issue_line_id=r.goods_issue_line_id;

    v_available:=r.issued_quantity-v_used-v_posted_returns;
    if v_current_return>v_available+0.000001 then
      raise exception 'RETURN_EXCEEDS_AVAILABLE_QUANTITY';
    end if;
  end loop;
end;
$$;

create or replace function public.approve_goods_return(
  p_return_id uuid,
  p_profile_id uuid
) returns public.goods_returns
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.goods_returns;
begin
  select * into v_row
  from public.goods_returns
  where id=p_return_id
  for update;
  if not found then raise exception 'GOODS_RETURN_NOT_FOUND'; end if;
  if v_row.status='approved' then
    perform public.validate_goods_return_integrity(p_return_id);
    return v_row;
  end if;
  if v_row.status not in ('draft','pending_approval') then
    raise exception 'INVALID_GOODS_RETURN_STATUS';
  end if;

  perform public.validate_goods_return_integrity(p_return_id);

  update public.goods_returns
  set status='approved',
      approved_by_profile_id=p_profile_id,
      approved_at=now(),
      updated_at=now()
  where id=p_return_id
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.post_goods_return(
  p_return_id uuid,
  p_profile_id uuid
) returns public.goods_returns
language plpgsql
security definer
set search_path=public
as $$
declare
  v_return public.goods_returns;
  v_base_qty numeric;
  r record;
begin
  select * into v_return
  from public.goods_returns
  where id=p_return_id
  for update;
  if not found then raise exception 'GOODS_RETURN_NOT_FOUND'; end if;
  if v_return.status='posted' then return v_return; end if;
  if v_return.status<>'approved' then
    raise exception 'GOODS_RETURN_NOT_APPROVED';
  end if;

  perform public.validate_goods_return_integrity(p_return_id);

  for r in
    select grl.*,m.base_unit_id as material_base_unit_id
    from public.goods_return_lines grl
    join public.materials m on m.id=grl.material_id
    where grl.return_id=p_return_id
    order by grl.goods_issue_line_id,grl.id
  loop
    v_base_qty:=public.convert_material_quantity(
      r.material_id,r.quantity,r.unit_id,r.material_base_unit_id
    );

    insert into public.stock_balances(
      warehouse_id,bin_id,material_id,material_lot_id,
      quantity_on_hand,unit_id,updated_at
    ) values(
      v_return.warehouse_id,r.destination_bin_id,r.material_id,r.material_lot_id,
      v_base_qty,r.material_base_unit_id,now()
    )
    on conflict(
      warehouse_id,
      (coalesce(bin_id,'00000000-0000-0000-0000-000000000000'::uuid)),
      material_id,
      (coalesce(material_lot_id,'00000000-0000-0000-0000-000000000000'::uuid)),
      unit_id
    )
    do update set
      quantity_on_hand=public.stock_balances.quantity_on_hand+excluded.quantity_on_hand,
      updated_at=now();

    if r.material_lot_id is not null then
      update public.material_lots
      set remaining_quantity=remaining_quantity+v_base_qty
      where id=r.material_lot_id;
      if not found then raise exception 'MATERIAL_LOT_NOT_MATCH_ISSUE'; end if;
    end if;

    insert into public.stock_transactions(
      material_id,warehouse_id,work_order_id,transaction_type,quantity,
      quantity_in,quantity_out,unit_id,unit_cost,transaction_date,status,
      created_by,source_table,source_id,source_line_id,note
    ) values(
      r.material_id,v_return.warehouse_id,v_return.work_order_id,'return',v_base_qty,
      v_base_qty,0,r.material_base_unit_id,r.unit_cost,v_return.return_date,'posted',
      p_profile_id,'goods_returns',v_return.id,r.id,'คืนพัสดุเข้าคลัง'
    );
  end loop;

  update public.goods_returns
  set status='posted',
      posted_by_profile_id=p_profile_id,
      posted_at=now(),
      updated_at=now()
  where id=p_return_id
  returning * into v_return;

  update public.work_order_materials wom
  set returned_quantity=coalesce((
      select sum(public.convert_material_quantity(
        grl.material_id,grl.quantity,grl.unit_id,wom.unit_id
      ))
      from public.goods_return_lines grl
      join public.goods_returns gr on gr.id=grl.return_id
      where gr.work_order_id=wom.work_order_id
        and grl.material_id=wom.material_id
        and gr.status='posted'
    ),0),
    updated_at=now()
  where wom.work_order_id=v_return.work_order_id;

  return v_return;
end;
$$;

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

  return v_line;
end;
$$;

create or replace function public.configure_goods_issue_period(
  p_issue_id uuid,
  p_issue_start_date date,
  p_issue_end_date date,
  p_allow_multi_day boolean,
  p_profile_id uuid
) returns public.goods_issues
language plpgsql
security definer
set search_path=public
as $$
declare
  v_issue public.goods_issues;
begin
  if p_issue_start_date is null or p_issue_end_date is null
     or p_issue_start_date>p_issue_end_date then
    raise exception 'INVALID_ISSUE_PERIOD';
  end if;
  if not coalesce(p_allow_multi_day,false)
     and p_issue_start_date<>p_issue_end_date then
    raise exception 'INVALID_ISSUE_PERIOD';
  end if;

  select * into v_issue
  from public.goods_issues
  where id=p_issue_id
  for update;
  if not found then raise exception 'GOODS_ISSUE_NOT_FOUND'; end if;
  if v_issue.status not in ('draft','approved')
     and exists(
       select 1 from public.goods_issue_daily_usage
       where goods_issue_id=p_issue_id
     ) then
    raise exception 'GOODS_ISSUE_PERIOD_LOCKED';
  end if;

  update public.goods_issues
  set issue_start_date=p_issue_start_date,
      issue_end_date=p_issue_end_date,
      allow_multi_day=coalesce(p_allow_multi_day,false),
      updated_at=now()
  where id=p_issue_id
  returning * into v_issue;
  return v_issue;
end;
$$;

create or replace function public.save_material_conversion(
  p_material_id uuid,
  p_from_unit_id uuid,
  p_to_unit_id uuid,
  p_conversion_rate numeric,
  p_status text,
  p_profile_id uuid
) returns public.sku_conversions
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.sku_conversions;
begin
  if p_conversion_rate is null or p_conversion_rate<=0 then
    raise exception 'INVALID_CONVERSION_RATE';
  end if;
  if p_status not in ('active','inactive') then
    raise exception 'INVALID_CONVERSION_STATUS';
  end if;
  if not exists(select 1 from public.materials where id=p_material_id)
     or not exists(select 1 from public.units where id=p_from_unit_id)
     or not exists(select 1 from public.units where id=p_to_unit_id) then
    raise exception 'MATERIAL_UNIT_CONVERSION_NOT_CONFIGURED';
  end if;

  insert into public.sku_conversions(
    material_id,from_unit_id,to_unit_id,conversion_rate,status
  ) values(
    p_material_id,p_from_unit_id,p_to_unit_id,p_conversion_rate,p_status
  )
  on conflict(material_id,from_unit_id,to_unit_id)
  do update set
    conversion_rate=excluded.conversion_rate,
    status=excluded.status
  returning * into v_row;

  return v_row;
end;
$$;

alter view public.v_goods_issue_multi_day_status set (security_invoker=true);
alter view public.v_goods_return_readiness set (security_invoker=true);
alter view public.v_material_unit_conversion_options set (security_invoker=true);

revoke all on public.v_goods_issue_multi_day_status from public,anon,authenticated;
revoke all on public.v_goods_return_readiness from public,anon,authenticated;
revoke all on public.v_material_unit_conversion_options from public,anon,authenticated;
grant select on public.v_goods_issue_multi_day_status to service_role;
grant select on public.v_goods_return_readiness to service_role;
grant select on public.v_material_unit_conversion_options to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'goods_issue_daily_usage','goods_issues','goods_issue_lines',
    'goods_returns','goods_return_lines','sku_conversions','unit_conversions',
    'stock_balances','stock_transactions'
  ]
  loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format(
      'drop policy if exists %I on public.%I',
      'authenticated write '||v_table,
      v_table
    );
    execute format(
      'revoke all on table public.%I from public,anon,authenticated',
      v_table
    );
    execute format(
      'grant select,insert,update,delete on table public.%I to service_role',
      v_table
    );
  end loop;
end
$$;

revoke execute on function public.material_conversion_rate(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.convert_material_quantity(uuid,numeric,uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.calculate_material_issue_quantity(uuid,numeric,uuid,uuid,boolean)
  from public,anon,authenticated;
revoke execute on function public.record_goods_issue_daily_usage(
  uuid,uuid,date,uuid,uuid,numeric,uuid,uuid,text,text
) from public,anon,authenticated;
revoke execute on function public.prepare_goods_return_from_issue(uuid,uuid,date,uuid)
  from public,anon,authenticated;
revoke execute on function public.validate_goods_return_integrity(uuid)
  from public,anon,authenticated;
revoke execute on function public.approve_goods_return(uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.post_goods_return(uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.close_goods_issue_usage(uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.update_goods_return_line(uuid,numeric,uuid,text,uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.configure_goods_issue_period(uuid,date,date,boolean,uuid)
  from public,anon,authenticated;
revoke execute on function public.save_material_conversion(uuid,uuid,uuid,numeric,text,uuid)
  from public,anon,authenticated;
revoke execute on function public.validate_goods_issue_daily_usage_integrity()
  from public,anon,authenticated;

grant execute on function public.material_conversion_rate(uuid,uuid,uuid)
  to service_role;
grant execute on function public.convert_material_quantity(uuid,numeric,uuid,uuid)
  to service_role;
grant execute on function public.calculate_material_issue_quantity(uuid,numeric,uuid,uuid,boolean)
  to service_role;
grant execute on function public.record_goods_issue_daily_usage(
  uuid,uuid,date,uuid,uuid,numeric,uuid,uuid,text,text
) to service_role;
grant execute on function public.prepare_goods_return_from_issue(uuid,uuid,date,uuid)
  to service_role;
grant execute on function public.validate_goods_return_integrity(uuid)
  to service_role;
grant execute on function public.approve_goods_return(uuid,uuid)
  to service_role;
grant execute on function public.post_goods_return(uuid,uuid)
  to service_role;
grant execute on function public.close_goods_issue_usage(uuid,uuid)
  to service_role;
grant execute on function public.update_goods_return_line(uuid,numeric,uuid,text,uuid,uuid)
  to service_role;
grant execute on function public.configure_goods_issue_period(uuid,date,date,boolean,uuid)
  to service_role;
grant execute on function public.save_material_conversion(uuid,uuid,uuid,numeric,text,uuid)
  to service_role;
grant execute on function public.validate_goods_issue_daily_usage_integrity()
  to service_role;

insert into public.system_settings(setting_key,setting_value,description)
values
  ('inventory.multi_day_issue_enabled','false','Phase 4 remains disabled until preview approval'),
  ('inventory.material_return_enabled','false','Phase 4 remains disabled until preview approval'),
  ('inventory.unit_conversion_enabled','false','Phase 4 remains disabled until preview approval'),
  ('system.dynamic_menu_enabled','false','Dynamic navigation remains disabled until preview approval'),
  ('system.frontend_workspace_ready','false','Frontend workspace remains disabled until preview approval'),
  ('budget.rule_engine_enabled','false','Budget rule engine remains disabled'),
  ('performance.activity_metrics_enabled','false','Performance activity metrics remain disabled'),
  ('performance.budget_recommendations.enabled','false','Performance recommendations remain disabled'),
  ('fuel.configuration_confirmed','false','Fuel configuration remains unconfirmed'),
  ('integration.weighbridge.enabled','false','Weighbridge integration remains disabled'),
  ('system.rls_ready','false','RLS readiness remains unconfirmed')
on conflict(setting_key) do update
set setting_value='false';

with desired(
  permission_key,permission_name,module_key,action_key,description
) as (
  values
    ('inventory.view','ดูพื้นที่งานคลัง','inventory','view','ดูข้อมูลคลังผ่าน Server API'),
    ('inventory.issue.prepare','เตรียมใบจ่าย','inventory','issue.prepare','เตรียมใบจ่ายพัสดุ'),
    ('inventory.issue.approve','อนุมัติใบจ่าย','inventory','issue.approve','อนุมัติใบจ่ายพัสดุ'),
    ('inventory.issue.post','ลงบัญชีใบจ่าย','inventory','issue.post','ลงบัญชีใบจ่ายพัสดุ'),
    ('inventory.issue.usage.record','บันทึกการใช้รายวัน','inventory','issue.usage.record','บันทึกการใช้พัสดุรายวัน'),
    ('inventory.issue.close','ปิดยอดใบจ่าย','inventory','issue.close','ปิดยอดใช้และคืนของใบจ่าย'),
    ('inventory.return.prepare','เตรียมใบคืน','inventory','return.prepare','เตรียมใบคืนจากใบจ่าย'),
    ('inventory.return.edit','แก้ไขใบคืน','inventory','return.edit','แก้ไขใบคืนสถานะร่าง'),
    ('inventory.return.approve','อนุมัติใบคืน','inventory','return.approve','อนุมัติใบคืน'),
    ('inventory.return.post','ลงบัญชีใบคืน','inventory','return.post','ลงบัญชีใบคืนเข้าคลัง'),
    ('inventory.conversion.view','ดูการแปลงหน่วย','inventory','conversion.view','ดูการแปลงหน่วยวัสดุ'),
    ('inventory.conversion.manage','จัดการการแปลงหน่วย','inventory','conversion.manage','จัดการการแปลงหน่วยวัสดุ'),
    ('inventory.stock.view','ดูสต๊อก','inventory','stock.view','ดูสต๊อกตามคลัง ล็อต และตำแหน่ง'),
    ('inventory.stock.adjust','ปรับยอดสต๊อก','inventory','stock.adjust','ปรับยอดสต๊อกผ่าน Server Action')
)
insert into public.permissions(
  code,name,module,action,description,
  permission_key,permission_name,module_key,action_key,status
)
select
  d.permission_key,d.permission_name,d.module_key,d.action_key,d.description,
  d.permission_key,d.permission_name,d.module_key,d.action_key,'active'
from desired d
where not exists(
  select 1 from public.permissions p
  where p.permission_key=d.permission_key or p.code=d.permission_key
);

with desired(
  permission_key,permission_name,module_key,action_key,description
) as (
  values
    ('inventory.view','ดูพื้นที่งานคลัง','inventory','view','ดูข้อมูลคลังผ่าน Server API'),
    ('inventory.issue.prepare','เตรียมใบจ่าย','inventory','issue.prepare','เตรียมใบจ่ายพัสดุ'),
    ('inventory.issue.approve','อนุมัติใบจ่าย','inventory','issue.approve','อนุมัติใบจ่ายพัสดุ'),
    ('inventory.issue.post','ลงบัญชีใบจ่าย','inventory','issue.post','ลงบัญชีใบจ่ายพัสดุ'),
    ('inventory.issue.usage.record','บันทึกการใช้รายวัน','inventory','issue.usage.record','บันทึกการใช้พัสดุรายวัน'),
    ('inventory.issue.close','ปิดยอดใบจ่าย','inventory','issue.close','ปิดยอดใช้และคืนของใบจ่าย'),
    ('inventory.return.prepare','เตรียมใบคืน','inventory','return.prepare','เตรียมใบคืนจากใบจ่าย'),
    ('inventory.return.edit','แก้ไขใบคืน','inventory','return.edit','แก้ไขใบคืนสถานะร่าง'),
    ('inventory.return.approve','อนุมัติใบคืน','inventory','return.approve','อนุมัติใบคืน'),
    ('inventory.return.post','ลงบัญชีใบคืน','inventory','return.post','ลงบัญชีใบคืนเข้าคลัง'),
    ('inventory.conversion.view','ดูการแปลงหน่วย','inventory','conversion.view','ดูการแปลงหน่วยวัสดุ'),
    ('inventory.conversion.manage','จัดการการแปลงหน่วย','inventory','conversion.manage','จัดการการแปลงหน่วยวัสดุ'),
    ('inventory.stock.view','ดูสต๊อก','inventory','stock.view','ดูสต๊อกตามคลัง ล็อต และตำแหน่ง'),
    ('inventory.stock.adjust','ปรับยอดสต๊อก','inventory','stock.adjust','ปรับยอดสต๊อกผ่าน Server Action')
)
update public.permissions p
set name=d.permission_name,
    module=d.module_key,
    action=d.action_key,
    description=d.description,
    permission_key=d.permission_key,
    permission_name=d.permission_name,
    module_key=d.module_key,
    action_key=d.action_key,
    status='active'
from desired d
where p.permission_key=d.permission_key or p.code=d.permission_key;

with desired(role_key,permission_key) as (
  values
    ('uat_manager','inventory.view'),
    ('uat_manager','inventory.issue.prepare'),
    ('uat_manager','inventory.issue.approve'),
    ('uat_manager','inventory.issue.post'),
    ('uat_manager','inventory.issue.usage.record'),
    ('uat_manager','inventory.issue.close'),
    ('uat_manager','inventory.return.prepare'),
    ('uat_manager','inventory.return.edit'),
    ('uat_manager','inventory.return.approve'),
    ('uat_manager','inventory.return.post'),
    ('uat_manager','inventory.conversion.view'),
    ('uat_manager','inventory.conversion.manage'),
    ('uat_manager','inventory.stock.view'),
    ('uat_supervisor','inventory.view'),
    ('uat_supervisor','inventory.issue.usage.record'),
    ('uat_supervisor','inventory.return.prepare'),
    ('uat_supervisor','inventory.return.edit'),
    ('uat_supervisor','inventory.conversion.view'),
    ('uat_supervisor','inventory.stock.view')
)
insert into public.role_permissions(
  role_id,permission_id,is_allowed,status
)
select r.id,p.id,true,'active'
from desired d
join public.roles r on r.role_key=d.role_key
join public.permissions p on p.permission_key=d.permission_key
on conflict(role_id,permission_id)
  where role_id is not null and permission_id is not null
do update set is_allowed=true,status='active';

commit;
