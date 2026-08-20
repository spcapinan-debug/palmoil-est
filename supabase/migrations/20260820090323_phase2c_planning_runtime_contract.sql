-- Phase 2C-D0: canonical Planning runtime lifecycle and action-only database contract.
-- Additive hardening only. Historical Annual Plans, Planned Items, Work Orders, and Budget rows are not rewritten.

begin;

alter table public.annual_work_plans
  add column planning_request_key text;

alter table public.annual_work_plans
  add constraint annual_work_plans_canonical_request_consistent
    check (
      (
        source_type is distinct from 'canonical_budget'
        and planning_request_key is null
      )
      or
      (
        source_type = 'canonical_budget'
        and nullif(btrim(planning_request_key), '') is not null
        and planning_request_key = btrim(planning_request_key)
        and char_length(btrim(planning_request_key)) between 1 and 200
      )
    );

create unique index annual_work_plans_planning_request_key_uidx
  on public.annual_work_plans (planning_request_key)
  where planning_request_key is not null;

comment on column public.annual_work_plans.planning_request_key is
  'Stable service-only idempotency key for canonical Annual Plan creation. Historical rows remain NULL.';

create or replace function public.guard_canonical_annual_plan_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $phase2c_plan_guard$
declare
  v_old_canonical boolean := false;
  v_new_canonical boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_canonical :=
      coalesce(old.source_type = 'canonical_budget', false)
      or old.planning_request_key is not null;
  end if;
  if tg_op <> 'DELETE' then
    v_new_canonical :=
      coalesce(new.source_type = 'canonical_budget', false)
      or new.planning_request_key is not null;
  end if;

  if not (v_old_canonical or v_new_canonical) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if current_setting('app.phase2c_plan_header_rpc', true) is distinct from 'on' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ACTION_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if new.source_type is distinct from 'canonical_budget'
      or nullif(btrim(new.planning_request_key), '') is null
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
    end if;
    if new.status is distinct from 'draft'
      or new.approved_by is not null
      or new.approved_at is not null
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status is distinct from 'draft' then
      raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
    end if;
    return old;
  end if;

  if old.source_type is distinct from new.source_type then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_SOURCE_IMMUTABLE';
  end if;
  if old.planning_request_key is distinct from new.planning_request_key then
    raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_IMMUTABLE';
  end if;
  if old.plan_year is distinct from new.plan_year then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_YEAR_IMMUTABLE';
  end if;
  if old.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;
  if new.status not in ('draft', 'approved') then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;
  if new.status = 'draft'
    and (new.approved_by is not null or new.approved_at is not null)
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_APPROVAL_INVALID';
  end if;
  if new.status = 'approved'
    and (new.approved_by is null or new.approved_at is null)
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_APPROVAL_INVALID';
  end if;

  return new;
end
$phase2c_plan_guard$;

create trigger guard_canonical_annual_plan_insert
before insert on public.annual_work_plans
for each row
when (
  new.source_type = 'canonical_budget'
  or new.planning_request_key is not null
)
execute function public.guard_canonical_annual_plan_mutation();

create trigger guard_canonical_annual_plan_update
before update on public.annual_work_plans
for each row
when (
  old.source_type = 'canonical_budget'
  or new.source_type = 'canonical_budget'
  or old.planning_request_key is not null
  or new.planning_request_key is not null
)
execute function public.guard_canonical_annual_plan_mutation();

create trigger guard_canonical_annual_plan_delete
before delete on public.annual_work_plans
for each row
when (
  old.source_type = 'canonical_budget'
  or old.planning_request_key is not null
)
execute function public.guard_canonical_annual_plan_mutation();

create or replace function public.create_canonical_annual_work_plan(
  p_plan_year integer,
  p_plan_name text,
  p_actor_profile_id uuid,
  p_request_key text,
  p_estate_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_plan_create$
declare
  v_plan public.annual_work_plans%rowtype;
  v_request_key text := nullif(btrim(p_request_key), '');
  v_plan_name text := nullif(btrim(p_plan_name), '');
  v_note text := nullif(btrim(p_note), '');
  v_now timestamptz := transaction_timestamp();
begin
  if v_request_key is null or char_length(v_request_key) > 200 then
    raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_INVALID';
  end if;
  if p_plan_year is null or p_plan_year < 1 then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_YEAR_INVALID';
  end if;
  if v_plan_name is null then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_NAME_INVALID';
  end if;
  if p_actor_profile_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select annual_plan.*
  into v_plan
  from public.annual_work_plans annual_plan
  where annual_plan.planning_request_key = v_request_key
  for key share;

  if found then
    if v_plan.source_type is distinct from 'canonical_budget'
      or v_plan.plan_year is distinct from p_plan_year
      or v_plan.plan_name is distinct from v_plan_name
      or v_plan.created_by is distinct from p_actor_profile_id
      or v_plan.estate_id is distinct from p_estate_id
      or v_plan.note is distinct from v_note
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REUSED';
    end if;
    return jsonb_build_object('annual_work_plan', to_jsonb(v_plan), 'already_exists', true);
  end if;

  perform set_config('app.phase2c_plan_header_rpc', 'on', true);

  insert into public.annual_work_plans (
    plan_year,
    estate_id,
    plan_name,
    created_by,
    approved_by,
    status,
    created_at,
    approved_at,
    note,
    source_type,
    source_reference,
    is_default,
    updated_at,
    planning_request_key
  )
  values (
    p_plan_year,
    p_estate_id,
    v_plan_name,
    p_actor_profile_id,
    null,
    'draft',
    v_now,
    null,
    v_note,
    'canonical_budget',
    null,
    false,
    v_now,
    v_request_key
  )
  on conflict (planning_request_key)
    where planning_request_key is not null
  do nothing
  returning * into v_plan;

  if not found then
    select annual_plan.*
    into v_plan
    from public.annual_work_plans annual_plan
    where annual_plan.planning_request_key = v_request_key
    for key share;

    if not found
      or v_plan.source_type is distinct from 'canonical_budget'
      or v_plan.plan_year is distinct from p_plan_year
      or v_plan.plan_name is distinct from v_plan_name
      or v_plan.created_by is distinct from p_actor_profile_id
      or v_plan.estate_id is distinct from p_estate_id
      or v_plan.note is distinct from v_note
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REUSED';
    end if;
    return jsonb_build_object('annual_work_plan', to_jsonb(v_plan), 'already_exists', true);
  end if;

  return jsonb_build_object('annual_work_plan', to_jsonb(v_plan), 'already_exists', false);
end
$phase2c_plan_create$;

comment on function public.create_canonical_annual_work_plan(
  integer, text, uuid, text, uuid, text
) is
  'Creates one draft canonical Annual Plan through a stable service-only request key.';

create or replace function public.update_canonical_annual_work_plan(
  p_annual_plan_id uuid,
  p_actor_profile_id uuid,
  p_plan_name text,
  p_estate_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_plan_update$
declare
  v_plan public.annual_work_plans%rowtype;
  v_plan_name text := nullif(btrim(p_plan_name), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if v_plan_name is null then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_NAME_INVALID';
  end if;
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select annual_plan.*
  into v_plan
  from public.annual_work_plans annual_plan
  where annual_plan.id = p_annual_plan_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;
  if v_plan.source_type is distinct from 'canonical_budget' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;
  if v_plan.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  perform set_config('app.phase2c_plan_header_rpc', 'on', true);

  update public.annual_work_plans
  set plan_name = v_plan_name,
      estate_id = p_estate_id,
      note = v_note,
      updated_at = transaction_timestamp()
  where id = p_annual_plan_id
  returning * into v_plan;

  return jsonb_build_object('annual_work_plan', to_jsonb(v_plan));
end
$phase2c_plan_update$;

comment on function public.update_canonical_annual_work_plan(
  uuid, uuid, text, uuid, text
) is
  'Updates only non-workflow header fields of a draft canonical Annual Plan.';

create or replace function public.approve_canonical_annual_work_plan(
  p_annual_plan_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_plan_approve$
declare
  v_plan public.annual_work_plans%rowtype;
  v_item_count integer := 0;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select annual_plan.*
  into v_plan
  from public.annual_work_plans annual_plan
  where annual_plan.id = p_annual_plan_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;
  if v_plan.source_type is distinct from 'canonical_budget' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;
  if v_plan.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  select count(*)::integer
  into v_item_count
  from public.planned_work_items planned_item
  where planned_item.annual_plan_id = p_annual_plan_id;

  if v_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_EMPTY';
  end if;

  if exists (
    select 1
    from public.planned_work_items planned_item
    where planned_item.annual_plan_id = p_annual_plan_id
      and (
        planned_item.source_type is distinct from 'canonical_budget'
        or planned_item.source_budget_year_id is null
        or planned_item.source_budget_activity_rate_id is null
        or planned_item.source_budget_rate_block_id is null
        or nullif(btrim(planned_item.planning_request_key), '') is null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ITEM_REQUIRED';
  end if;

  if exists (
    select 1
    from public.planned_work_items planned_item
    join public.planned_work_materials material_snapshot
      on material_snapshot.planned_work_item_id = planned_item.id
    where planned_item.annual_plan_id = p_annual_plan_id
      and material_snapshot.snapshot_source_type is distinct from 'canonical_budget_block_material'
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_MATERIAL_REQUIRED';
  end if;

  if exists (
    select 1
    from public.planned_work_items planned_item
    where planned_item.annual_plan_id = p_annual_plan_id
      and not exists (
        select 1
        from public.planned_work_materials material_snapshot
        where material_snapshot.planned_work_item_id = planned_item.id
          and material_snapshot.snapshot_source_type = 'canonical_budget_block_material'
          and material_snapshot.source_budget_rate_block_material_id is not null
          and material_snapshot.material_id is not null
          and material_snapshot.snapshot_usage_basis is not null
          and material_snapshot.snapshot_usage_rate > 0
          and material_snapshot.snapshot_basis_quantity >= 0
          and material_snapshot.unit_id is not null
          and material_snapshot.planned_quantity >= 0
          and material_snapshot.snapshot_at is not null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_MATERIAL_SNAPSHOT_INCOMPLETE';
  end if;

  perform set_config('app.phase2c_plan_header_rpc', 'on', true);

  update public.annual_work_plans
  set status = 'approved',
      approved_by = p_actor_profile_id,
      approved_at = transaction_timestamp(),
      updated_at = transaction_timestamp()
  where id = p_annual_plan_id
  returning * into v_plan;

  return jsonb_build_object(
    'annual_work_plan', to_jsonb(v_plan),
    'planned_work_item_count', v_item_count
  );
end
$phase2c_plan_approve$;

comment on function public.approve_canonical_annual_work_plan(uuid, uuid) is
  'Approves a complete canonical Annual Plan exactly once; no reopen transition exists.';

create or replace function public.delete_canonical_annual_work_plan(
  p_annual_plan_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_plan_delete$
declare
  v_plan public.annual_work_plans%rowtype;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select annual_plan.*
  into v_plan
  from public.annual_work_plans annual_plan
  where annual_plan.id = p_annual_plan_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;
  if v_plan.source_type is distinct from 'canonical_budget' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;
  if v_plan.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;
  if exists (
    select 1
    from public.planned_work_items planned_item
    where planned_item.annual_plan_id = p_annual_plan_id
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_NOT_EMPTY';
  end if;

  perform set_config('app.phase2c_plan_header_rpc', 'on', true);

  delete from public.annual_work_plans
  where id = p_annual_plan_id;

  return jsonb_build_object('annual_work_plan_id', p_annual_plan_id, 'deleted', true);
end
$phase2c_plan_delete$;

comment on function public.delete_canonical_annual_work_plan(uuid, uuid) is
  'Deletes an empty draft canonical Annual Plan without cascading Planned Items.';

create or replace function public.guard_canonical_planning_item_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $phase2c_item_guard$
declare
  v_expected_plan_count integer := 0;
  v_locked_plan_count integer := 0;
  v_plan record;
  v_item_is_canonical boolean := false;
  v_item_is_complete_canonical boolean := false;
  v_parent_is_canonical boolean := false;
begin
  if tg_op = 'INSERT' then
    v_item_is_canonical :=
      coalesce(new.source_type = 'canonical_budget', false)
      or new.planning_request_key is not null
      or new.source_budget_year_id is not null
      or new.source_budget_activity_rate_id is not null
      or new.source_budget_rate_block_id is not null;
    v_item_is_complete_canonical :=
      new.source_type = 'canonical_budget'
      and new.source_budget_year_id is not null
      and new.source_budget_activity_rate_id is not null
      and new.source_budget_rate_block_id is not null
      and nullif(btrim(new.planning_request_key), '') is not null;
  elsif tg_op = 'DELETE' then
    v_item_is_canonical :=
      coalesce(old.source_type = 'canonical_budget', false)
      or old.planning_request_key is not null
      or old.source_budget_year_id is not null
      or old.source_budget_activity_rate_id is not null
      or old.source_budget_rate_block_id is not null;
    v_item_is_complete_canonical :=
      old.source_type = 'canonical_budget'
      and old.source_budget_year_id is not null
      and old.source_budget_activity_rate_id is not null
      and old.source_budget_rate_block_id is not null
      and nullif(btrim(old.planning_request_key), '') is not null;
  else
    v_item_is_canonical :=
      coalesce(new.source_type = 'canonical_budget', false)
      or coalesce(old.source_type = 'canonical_budget', false)
      or new.planning_request_key is not null
      or new.source_budget_year_id is not null
      or new.source_budget_activity_rate_id is not null
      or new.source_budget_rate_block_id is not null
      or old.planning_request_key is not null
      or old.source_budget_year_id is not null
      or old.source_budget_activity_rate_id is not null
      or old.source_budget_rate_block_id is not null;
    v_item_is_complete_canonical :=
      new.source_type = 'canonical_budget'
      and new.source_budget_year_id is not null
      and new.source_budget_activity_rate_id is not null
      and new.source_budget_rate_block_id is not null
      and nullif(btrim(new.planning_request_key), '') is not null;
  end if;

  select count(distinct plan_id)::integer
  into v_expected_plan_count
  from unnest(array[
    case when tg_op <> 'INSERT' then old.annual_plan_id else null end,
    case when tg_op <> 'DELETE' then new.annual_plan_id else null end
  ]::uuid[]) as selected(plan_id)
  where selected.plan_id is not null;

  if v_expected_plan_count = 0 and not v_item_is_canonical then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  for v_plan in
    select annual_plan.id, annual_plan.status, annual_plan.source_type
    from public.annual_work_plans annual_plan
    where annual_plan.id in (
      select distinct selected.plan_id
      from unnest(array[
        case when tg_op <> 'INSERT' then old.annual_plan_id else null end,
        case when tg_op <> 'DELETE' then new.annual_plan_id else null end
      ]::uuid[]) as selected(plan_id)
      where selected.plan_id is not null
    )
    order by annual_plan.id
    for update
  loop
    v_locked_plan_count := v_locked_plan_count + 1;
    v_parent_is_canonical :=
      v_parent_is_canonical or v_plan.source_type = 'canonical_budget';

    if v_plan.source_type = 'canonical_budget' then
      if not v_item_is_complete_canonical then
        raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ITEM_REQUIRED';
      end if;
    elsif v_item_is_canonical then
      raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_PLAN_REQUIRED';
    end if;

    if (v_item_is_canonical or v_plan.source_type = 'canonical_budget')
      and v_plan.status <> 'draft'
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
    end if;
  end loop;

  if v_expected_plan_count = 0 or v_locked_plan_count <> v_expected_plan_count then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;

  if not (v_item_is_canonical or v_parent_is_canonical) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if current_setting('app.phase2c_snapshot_rpc', true) is distinct from 'on' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_ACTION_REQUIRED';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$phase2c_item_guard$;

drop trigger if exists guard_canonical_planning_item_insert on public.planned_work_items;
drop trigger if exists guard_canonical_planning_item_update on public.planned_work_items;
drop trigger if exists guard_canonical_planning_item_delete on public.planned_work_items;

create trigger guard_canonical_planning_item_insert
before insert on public.planned_work_items
for each row
execute function public.guard_canonical_planning_item_mutation();

create trigger guard_canonical_planning_item_update
before update on public.planned_work_items
for each row
execute function public.guard_canonical_planning_item_mutation();

create trigger guard_canonical_planning_item_delete
before delete on public.planned_work_items
for each row
execute function public.guard_canonical_planning_item_mutation();

create or replace function public.create_canonical_planned_work_item_snapshot(
  p_annual_plan_id uuid,
  p_budget_year_id text,
  p_budget_activity_rate_id text,
  p_budget_rate_block_id text,
  p_block_id uuid,
  p_activity_id uuid,
  p_planning_request_key text,
  p_actor_profile_id uuid,
  p_plot_id uuid default null,
  p_planned_start_date date default null,
  p_planned_end_date date default null,
  p_recurrence_type text default null,
  p_recurrence_interval integer default null,
  p_repeat_after_last_done_days integer default null,
  p_target_quantity numeric default null,
  p_target_unit text default null,
  p_planned_budget numeric default null,
  p_suggested_team_id uuid default null,
  p_status text default 'planned',
  p_note text default null,
  p_ap_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_create_rpc$
declare
  v_item public.planned_work_items%rowtype;
  v_material_count integer := 0;
  v_request_key text := nullif(btrim(p_planning_request_key), '');
  v_snapshot_at timestamptz := transaction_timestamp();
  v_normalized_note text := nullif(btrim(p_note), '');
  v_normalized_status text := lower(nullif(btrim(p_status), ''));
  v_plan_year integer;
  v_plan_source_type text;
  v_plan_status text;
  v_budget_fiscal_year text;
begin
  if v_request_key is null then
    raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REQUIRED';
  end if;
  if char_length(v_request_key) > 200 then
    raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_INVALID';
  end if;
  if v_normalized_status is distinct from 'planned' then
    raise exception using errcode = 'P0001', message = 'PLANNING_ITEM_STATUS_INVALID';
  end if;

  if p_actor_profile_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select planned_item.*
  into v_item
  from public.planned_work_items planned_item
  where planned_item.planning_request_key = v_request_key
  for key share;

  if found then
    if v_item.source_type is distinct from 'canonical_budget'
      or v_item.annual_plan_id is distinct from p_annual_plan_id
      or v_item.source_budget_year_id is distinct from p_budget_year_id
      or v_item.source_budget_activity_rate_id is distinct from p_budget_activity_rate_id
      or v_item.source_budget_rate_block_id is distinct from p_budget_rate_block_id
      or v_item.block_id is distinct from p_block_id
      or v_item.activity_id is distinct from p_activity_id
      or v_item.plot_id is distinct from p_plot_id
      or v_item.planned_start_date is distinct from p_planned_start_date
      or v_item.planned_end_date is distinct from p_planned_end_date
      or v_item.recurrence_type is distinct from p_recurrence_type
      or v_item.recurrence_interval is distinct from p_recurrence_interval
      or v_item.repeat_after_last_done_days is distinct from p_repeat_after_last_done_days
      or v_item.target_quantity is distinct from p_target_quantity
      or v_item.target_unit is distinct from p_target_unit
      or v_item.planned_budget is distinct from p_planned_budget
      or v_item.suggested_team_id is distinct from p_suggested_team_id
      or v_item.status is distinct from 'planned'
      or v_item.note is distinct from v_normalized_note
      or v_item.ap_code is distinct from p_ap_code
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REUSED';
    end if;

    select count(*)::integer
    into v_material_count
    from public.planned_work_materials material_snapshot
    where material_snapshot.planned_work_item_id = v_item.id
      and material_snapshot.snapshot_source_type = 'canonical_budget_block_material';

    return jsonb_build_object(
      'planned_work_item', to_jsonb(v_item),
      'material_count', v_material_count,
      'already_exists', true
    );
  end if;

  select annual_plan.plan_year, annual_plan.source_type, annual_plan.status
  into v_plan_year, v_plan_source_type, v_plan_status
  from public.annual_work_plans annual_plan
  where annual_plan.id = p_annual_plan_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;
  if v_plan_source_type is distinct from 'canonical_budget' then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_PLAN_REQUIRED';
  end if;
  if v_plan_status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  select budget_year.fiscal_year
  into v_budget_fiscal_year
  from public.budget_years budget_year
  where budget_year.id = p_budget_year_id
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_BUDGET_YEAR_NOT_ELIGIBLE';
  end if;
  if nullif(btrim(v_budget_fiscal_year), '') is null
    or btrim(v_budget_fiscal_year) !~ '^[0-9]+$'
    or v_plan_year::text <> btrim(v_budget_fiscal_year)
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_BUDGET_YEAR_PLAN_MISMATCH';
  end if;

  perform set_config('app.phase2c_snapshot_rpc', 'on', true);

  insert into public.planned_work_items (
    annual_plan_id,
    plot_id,
    activity_id,
    planned_start_date,
    planned_end_date,
    recurrence_type,
    recurrence_interval,
    repeat_after_last_done_days,
    target_quantity,
    target_unit,
    planned_budget,
    suggested_team_id,
    status,
    note,
    block_id,
    ap_code,
    source_type,
    source_budget_year_id,
    source_budget_activity_rate_id,
    source_budget_rate_block_id,
    planning_request_key,
    created_at,
    updated_at
  )
  values (
    p_annual_plan_id,
    p_plot_id,
    p_activity_id,
    p_planned_start_date,
    p_planned_end_date,
    p_recurrence_type,
    p_recurrence_interval,
    p_repeat_after_last_done_days,
    p_target_quantity,
    p_target_unit,
    p_planned_budget,
    p_suggested_team_id,
    'planned',
    v_normalized_note,
    p_block_id,
    p_ap_code,
    'canonical_budget',
    p_budget_year_id,
    p_budget_activity_rate_id,
    p_budget_rate_block_id,
    v_request_key,
    v_snapshot_at,
    v_snapshot_at
  )
  on conflict (planning_request_key)
    where planning_request_key is not null
  do nothing
  returning * into v_item;

  if not found then
    select planned_item.*
    into v_item
    from public.planned_work_items planned_item
    where planned_item.planning_request_key = v_request_key
    for key share;

    if not found
      or v_item.source_type is distinct from 'canonical_budget'
      or v_item.annual_plan_id is distinct from p_annual_plan_id
      or v_item.source_budget_year_id is distinct from p_budget_year_id
      or v_item.source_budget_activity_rate_id is distinct from p_budget_activity_rate_id
      or v_item.source_budget_rate_block_id is distinct from p_budget_rate_block_id
      or v_item.block_id is distinct from p_block_id
      or v_item.activity_id is distinct from p_activity_id
      or v_item.plot_id is distinct from p_plot_id
      or v_item.planned_start_date is distinct from p_planned_start_date
      or v_item.planned_end_date is distinct from p_planned_end_date
      or v_item.recurrence_type is distinct from p_recurrence_type
      or v_item.recurrence_interval is distinct from p_recurrence_interval
      or v_item.repeat_after_last_done_days is distinct from p_repeat_after_last_done_days
      or v_item.target_quantity is distinct from p_target_quantity
      or v_item.target_unit is distinct from p_target_unit
      or v_item.planned_budget is distinct from p_planned_budget
      or v_item.suggested_team_id is distinct from p_suggested_team_id
      or v_item.status is distinct from 'planned'
      or v_item.note is distinct from v_normalized_note
      or v_item.ap_code is distinct from p_ap_code
    then
      raise exception using errcode = 'P0001', message = 'PLANNING_REQUEST_KEY_REUSED';
    end if;

    select count(*)::integer
    into v_material_count
    from public.planned_work_materials material_snapshot
    where material_snapshot.planned_work_item_id = v_item.id
      and material_snapshot.snapshot_source_type = 'canonical_budget_block_material';

    return jsonb_build_object(
      'planned_work_item', to_jsonb(v_item),
      'material_count', v_material_count,
      'already_exists', true
    );
  end if;

  v_material_count := public.populate_canonical_planning_material_snapshot(
    v_item.id,
    p_budget_year_id,
    p_budget_activity_rate_id,
    p_budget_rate_block_id,
    p_block_id,
    p_activity_id,
    v_snapshot_at
  );

  return jsonb_build_object(
    'planned_work_item', to_jsonb(v_item),
    'material_count', v_material_count,
    'already_exists', false
  );
end
$phase2c_create_rpc$;

comment on function public.create_canonical_planned_work_item_snapshot(
  uuid, text, text, text, uuid, uuid, text, uuid, uuid, date, date,
  text, integer, integer, numeric, text, numeric, uuid, text, text, text
) is
  'Creates one canonical Planned Item only under a draft canonical Annual Plan and snapshots its Materials atomically.';

create or replace function public.update_canonical_planned_work_item(
  p_planned_work_item_id uuid,
  p_actor_profile_id uuid,
  p_planned_start_date date default null,
  p_planned_end_date date default null,
  p_recurrence_type text default null,
  p_recurrence_interval integer default null,
  p_repeat_after_last_done_days integer default null,
  p_target_quantity numeric default null,
  p_target_unit text default null,
  p_planned_budget numeric default null,
  p_suggested_team_id uuid default null,
  p_note text default null,
  p_ap_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_item_update$
declare
  v_item public.planned_work_items%rowtype;
  v_plan public.annual_work_plans%rowtype;
  v_annual_plan_id uuid;
  v_material_count integer := 0;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select planned_item.annual_plan_id
  into v_annual_plan_id
  from public.planned_work_items planned_item
  where planned_item.id = p_planned_work_item_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;

  select annual_plan.*
  into v_plan
  from public.annual_work_plans annual_plan
  where annual_plan.id = v_annual_plan_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;

  select planned_item.*
  into v_item
  from public.planned_work_items planned_item
  where planned_item.id = p_planned_work_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;
  if v_item.annual_plan_id is distinct from v_plan.id then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;
  if v_plan.source_type is distinct from 'canonical_budget'
    or v_item.source_type is distinct from 'canonical_budget'
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;
  if v_plan.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  perform set_config('app.phase2c_snapshot_rpc', 'on', true);

  update public.planned_work_items
  set planned_start_date = p_planned_start_date,
      planned_end_date = p_planned_end_date,
      recurrence_type = p_recurrence_type,
      recurrence_interval = p_recurrence_interval,
      repeat_after_last_done_days = p_repeat_after_last_done_days,
      target_quantity = p_target_quantity,
      target_unit = p_target_unit,
      planned_budget = p_planned_budget,
      suggested_team_id = p_suggested_team_id,
      note = nullif(btrim(p_note), ''),
      ap_code = p_ap_code,
      updated_at = transaction_timestamp()
  where id = p_planned_work_item_id
  returning * into v_item;

  select count(*)::integer
  into v_material_count
  from public.planned_work_materials material_snapshot
  where material_snapshot.planned_work_item_id = p_planned_work_item_id;

  return jsonb_build_object(
    'planned_work_item', to_jsonb(v_item),
    'material_count', v_material_count,
    'materials_refreshed', false
  );
end
$phase2c_item_update$;

comment on function public.update_canonical_planned_work_item(
  uuid, uuid, date, date, text, integer, integer, numeric, text, numeric, uuid, text, text
) is
  'Updates mutable metadata of a draft canonical Planned Item without refreshing its Material snapshot.';

create or replace function public.delete_canonical_planned_work_item(
  p_planned_work_item_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $phase2c_item_delete$
declare
  v_item public.planned_work_items%rowtype;
  v_plan public.annual_work_plans%rowtype;
  v_annual_plan_id uuid;
  v_material_count integer := 0;
  v_request_count integer := 0;
begin
  if p_actor_profile_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id and profile.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTOR_PROFILE_NOT_FOUND';
  end if;

  select planned_item.annual_plan_id
  into v_annual_plan_id
  from public.planned_work_items planned_item
  where planned_item.id = p_planned_work_item_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;

  select annual_plan.*
  into v_plan
  from public.annual_work_plans annual_plan
  where annual_plan.id = v_annual_plan_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_ANNUAL_PLAN_NOT_FOUND';
  end if;

  select planned_item.*
  into v_item
  from public.planned_work_items planned_item
  where planned_item.id = p_planned_work_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLANNED_ITEM_NOT_FOUND';
  end if;
  if v_item.annual_plan_id is distinct from v_plan.id
    or v_plan.source_type is distinct from 'canonical_budget'
    or v_item.source_type is distinct from 'canonical_budget'
  then
    raise exception using errcode = 'P0001', message = 'PLANNING_CANONICAL_LINEAGE_REQUIRED';
  end if;
  if v_plan.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'PLANNING_PLAN_FROZEN';
  end if;

  if exists (
    select 1
    from public.work_orders work_order
    where work_order.planned_work_item_id = p_planned_work_item_id
  ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_ITEM_HAS_WORK_ORDER';
  end if;

  perform set_config('app.phase2c_snapshot_rpc', 'on', true);

  delete from public.planning_material_snapshot_requests
  where planned_work_item_id = p_planned_work_item_id;
  get diagnostics v_request_count = row_count;

  delete from public.planned_work_materials
  where planned_work_item_id = p_planned_work_item_id;
  get diagnostics v_material_count = row_count;

  delete from public.planned_work_items
  where id = p_planned_work_item_id;

  return jsonb_build_object(
    'planned_work_item_id', p_planned_work_item_id,
    'deleted', true,
    'material_count', v_material_count,
    'request_count', v_request_count
  );
end
$phase2c_item_delete$;

comment on function public.delete_canonical_planned_work_item(uuid, uuid) is
  'Deletes one draft canonical Planned Item, its Material snapshot, and refresh ledger after rejecting Work Order references.';

drop policy if exists "authenticated write annual_work_plans"
  on public.annual_work_plans;

alter table public.annual_work_plans enable row level security;

revoke all on table public.annual_work_plans from public, anon, authenticated;
grant select on table public.annual_work_plans to authenticated;
grant all on table public.annual_work_plans to service_role;

revoke all on function public.guard_canonical_annual_plan_mutation()
  from public, anon, authenticated;
grant execute on function public.guard_canonical_annual_plan_mutation()
  to service_role;

revoke all on function public.guard_canonical_planning_item_mutation()
  from public, anon, authenticated;
grant execute on function public.guard_canonical_planning_item_mutation()
  to service_role;

revoke all on function public.create_canonical_annual_work_plan(
  integer, text, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_canonical_annual_work_plan(
  integer, text, uuid, text, uuid, text
) to service_role;

revoke all on function public.update_canonical_annual_work_plan(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.update_canonical_annual_work_plan(
  uuid, uuid, text, uuid, text
) to service_role;

revoke all on function public.approve_canonical_annual_work_plan(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_canonical_annual_work_plan(uuid, uuid)
  to service_role;

revoke all on function public.delete_canonical_annual_work_plan(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_canonical_annual_work_plan(uuid, uuid)
  to service_role;

revoke all on function public.create_canonical_planned_work_item_snapshot(
  uuid, text, text, text, uuid, uuid, text, uuid, uuid, date, date,
  text, integer, integer, numeric, text, numeric, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_canonical_planned_work_item_snapshot(
  uuid, text, text, text, uuid, uuid, text, uuid, uuid, date, date,
  text, integer, integer, numeric, text, numeric, uuid, text, text, text
) to service_role;

revoke all on function public.update_canonical_planned_work_item(
  uuid, uuid, date, date, text, integer, integer, numeric, text, numeric, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.update_canonical_planned_work_item(
  uuid, uuid, date, date, text, integer, integer, numeric, text, numeric, uuid, text, text
) to service_role;

revoke all on function public.refresh_canonical_planned_work_item_snapshot(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.refresh_canonical_planned_work_item_snapshot(uuid, uuid, text)
  to service_role;

revoke all on function public.delete_canonical_planned_work_item(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_canonical_planned_work_item(uuid, uuid)
  to service_role;

commit;
