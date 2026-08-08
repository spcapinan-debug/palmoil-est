begin;

create table if not exists public.app_notification_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null unique,
  rule_name text not null,
  module_key text not null default 'farm.work',
  event_type text not null,
  days_before integer,
  minutes_before integer,
  repeat_interval_minutes integer,
  max_repeat_count integer not null default 0,
  recipient_strategy jsonb not null default '["work_order_manager","supervisor"]'::jsonb,
  channel_config jsonb not null default '{"in_app":true,"push":false}'::jsonb,
  severity text not null default 'info' check (severity in ('info','low','medium','high','critical')),
  action_required boolean not null default false,
  effective_from date,
  effective_to date,
  status text not null default 'inactive' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  module_key text not null default 'farm.work',
  entity_type text not null,
  entity_id uuid not null,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  work_result_id uuid references public.work_results(id) on delete cascade,
  recipient_profile_id uuid references public.profiles(id) on delete cascade,
  recipient_employee_id uuid references public.employees(id) on delete cascade,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','low','medium','high','critical')),
  action_url text,
  scheduled_at timestamptz,
  available_at timestamptz not null default now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  snoozed_until timestamptz,
  closed_at timestamptz,
  status text not null default 'available' check (status in ('scheduled','available','acknowledged','snoozed','closed','cancelled')),
  idempotency_key text not null,
  version_no integer not null default 1,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipient_profile_id is not null or recipient_employee_id is not null),
  unique (idempotency_key)
);

create table if not exists public.app_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app','web_push','email','sms')),
  attempt_no integer not null default 1,
  provider_message_id text,
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  failed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','delivered','failed','skipped')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel, attempt_no)
);

create table if not exists public.app_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone_name text not null default 'Asia/Bangkok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, notification_type)
);

create table if not exists public.app_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  dry_run boolean not null default true,
  examined_count integer not null default 0,
  created_count integer not null default 0,
  closed_count integer not null default 0,
  skipped_count integer not null default 0,
  status text not null default 'running' check (status in ('running','completed','failed','locked')),
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_notifications_recipient_available
  on public.app_notifications(recipient_profile_id,status,available_at desc);
create index if not exists idx_app_notifications_recipient_unread
  on public.app_notifications(recipient_profile_id,read_at,available_at desc)
  where closed_at is null;
create index if not exists idx_app_notifications_work_order
  on public.app_notifications(work_order_id,notification_type,status);
create index if not exists idx_app_notifications_snoozed
  on public.app_notifications(snoozed_until)
  where status='snoozed';
create index if not exists idx_app_notification_deliveries_status
  on public.app_notification_deliveries(status,requested_at);
create index if not exists idx_app_notification_rules_event
  on public.app_notification_rules(event_type,status,effective_from,effective_to);

drop trigger if exists set_app_notification_rules_updated_at on public.app_notification_rules;
create trigger set_app_notification_rules_updated_at before update on public.app_notification_rules
for each row execute function public.set_updated_at();
drop trigger if exists set_app_notifications_updated_at on public.app_notifications;
create trigger set_app_notifications_updated_at before update on public.app_notifications
for each row execute function public.set_updated_at();
drop trigger if exists set_app_notification_deliveries_updated_at on public.app_notification_deliveries;
create trigger set_app_notification_deliveries_updated_at before update on public.app_notification_deliveries
for each row execute function public.set_updated_at();
drop trigger if exists set_app_notification_preferences_updated_at on public.app_notification_preferences;
create trigger set_app_notification_preferences_updated_at before update on public.app_notification_preferences
for each row execute function public.set_updated_at();

alter table public.app_notification_rules enable row level security;
alter table public.app_notifications enable row level security;
alter table public.app_notification_deliveries enable row level security;
alter table public.app_notification_preferences enable row level security;
alter table public.app_notification_jobs enable row level security;

revoke all on public.app_notification_rules from public, anon, authenticated;
revoke all on public.app_notifications from public, anon, authenticated;
revoke all on public.app_notification_deliveries from public, anon, authenticated;
revoke all on public.app_notification_preferences from public, anon, authenticated;
revoke all on public.app_notification_jobs from public, anon, authenticated;
grant all on public.app_notification_rules to service_role;
grant all on public.app_notifications to service_role;
grant all on public.app_notification_deliveries to service_role;
grant all on public.app_notification_preferences to service_role;
grant all on public.app_notification_jobs to service_role;

with desired(permission_key,permission_name,module_key,action_key,description) as (
  values
    ('notification.view','View work notifications','notification','view','View notifications scoped to the signed-in recipient'),
    ('notification.manage','Manage work notifications','notification','manage','Close and administratively manage work notifications'),
    ('notification.rule.manage','Manage notification rules','notification','rule.manage','Configure notification rules after UAT approval'),
    ('notification.acknowledge','Acknowledge work notifications','notification','acknowledge','Acknowledge a notification assigned to the signed-in recipient'),
    ('notification.snooze','Snooze work notifications','notification','snooze','Snooze a notification assigned to the signed-in recipient'),
    ('notification.delivery.view','View notification delivery','notification','delivery.view','View notification delivery attempts')
)
insert into public.permissions(code,name,module,action,description,permission_key,permission_name,module_key,action_key,status)
select permission_key,permission_name,module_key,action_key,description,
       permission_key,permission_name,module_key,action_key,'active'
from desired
where not exists (
  select 1 from public.permissions p where p.permission_key=desired.permission_key or p.code=desired.permission_key
);

with desired(role_key,permission_key) as (
  values
    ('uat_manager','notification.view'),
    ('uat_manager','notification.acknowledge'),
    ('uat_manager','notification.snooze'),
    ('uat_supervisor','notification.view'),
    ('uat_supervisor','notification.acknowledge'),
    ('uat_supervisor','notification.snooze'),
    ('estate_manager','notification.view'),
    ('estate_manager','notification.manage'),
    ('estate_manager','notification.rule.manage'),
    ('estate_manager','notification.acknowledge'),
    ('estate_manager','notification.snooze'),
    ('estate_manager','notification.delivery.view'),
    ('director','notification.view'),
    ('director','notification.manage'),
    ('director','notification.rule.manage'),
    ('director','notification.acknowledge'),
    ('director','notification.snooze'),
    ('director','notification.delivery.view'),
    ('super_admin','notification.view'),
    ('super_admin','notification.manage'),
    ('super_admin','notification.rule.manage'),
    ('super_admin','notification.acknowledge'),
    ('super_admin','notification.snooze'),
    ('super_admin','notification.delivery.view')
)
insert into public.role_permissions(role_id,permission_id,is_allowed,status)
select r.id,p.id,true,'active'
from desired d
join public.roles r on r.role_key=d.role_key
join public.permissions p on p.permission_key=d.permission_key
on conflict(role_id,permission_id) where role_id is not null and permission_id is not null
do update set is_allowed=true,status='active';

insert into public.app_notification_rules(
  rule_code,rule_name,event_type,days_before,minutes_before,severity,action_required,status
)
values
  ('WORK_DUE_TOMORROW','Work due tomorrow','WORK_DUE_TOMORROW',1,null,'info',false,'inactive'),
  ('WORK_DUE_TODAY','Work due today','WORK_DUE_TODAY',0,null,'medium',true,'inactive'),
  ('WORK_STARTING_SOON','Work starting soon','WORK_STARTING_SOON',null,60,'medium',true,'inactive'),
  ('WORK_NOT_ACCEPTED','Work not accepted','WORK_NOT_ACCEPTED',null,120,'high',true,'inactive'),
  ('WORK_NOT_STARTED','Work not started','WORK_NOT_STARTED',null,120,'high',true,'inactive'),
  ('WORK_DAILY_RESULT_MISSING','Daily result missing','WORK_DAILY_RESULT_MISSING',0,null,'high',true,'inactive'),
  ('WORK_DRAFT_NOT_SUBMITTED','Draft result not submitted','WORK_DRAFT_NOT_SUBMITTED',0,null,'medium',true,'inactive'),
  ('WORK_OVERDUE','Work overdue','WORK_OVERDUE',0,null,'high',true,'inactive'),
  ('WORK_SURVEY_INCOMPLETE','Survey incomplete','WORK_SURVEY_INCOMPLETE',0,null,'high',true,'inactive'),
  ('WORK_FUEL_ENTRY_INCOMPLETE','Fuel entry incomplete','WORK_FUEL_ENTRY_INCOMPLETE',0,null,'high',true,'inactive'),
  ('WORK_MATERIAL_USAGE_INCOMPLETE','Material usage incomplete','WORK_MATERIAL_USAGE_INCOMPLETE',0,null,'high',true,'inactive'),
  ('WORK_FINDING_OVERDUE','Finding overdue','WORK_FINDING_OVERDUE',0,null,'critical',true,'inactive'),
  ('WORK_RESULT_REJECTED','Work result rejected','WORK_RESULT_REJECTED',0,null,'high',true,'inactive'),
  ('WORK_RESULT_APPROVED','Work result approved','WORK_RESULT_APPROVED',0,null,'info',false,'inactive')
on conflict(rule_code) do nothing;

create or replace function public.generate_work_notifications(
  p_now timestamptz default now(),
  p_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_local_date date := (p_now at time zone 'Asia/Bangkok')::date;
  v_job_id uuid;
  v_job_key text := 'work-notifications:' || to_char(p_now at time zone 'Asia/Bangkok','YYYYMMDDHH24MI') || ':' || case when p_dry_run then 'dry' else 'apply' end;
  v_examined integer := 0;
  v_created integer := 0;
  v_closed integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('app-work-notifications',0)) then
    return jsonb_build_object('ok',false,'status','locked','timezone','Asia/Bangkok','dryRun',p_dry_run);
  end if;

  insert into public.app_notification_jobs(job_key,dry_run,status)
  values(v_job_key,p_dry_run,'running')
  on conflict(job_key) do update set started_at=excluded.started_at,dry_run=excluded.dry_run,status='running'
  returning id into v_job_id;

  select count(*) into v_examined
  from public.work_orders wo
  where wo.status not in ('cancelled','closed')
    and wo.scheduled_date between v_local_date - 30 and v_local_date + 1;

  if not p_dry_run then
    with work_events as (
      select wo.id work_order_id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,
        null::uuid work_result_id,null::uuid direct_recipient_profile_id,
        case when wo.scheduled_date=v_local_date+1 then 'WORK_DUE_TOMORROW'
             when wo.scheduled_date=v_local_date then 'WORK_DUE_TODAY'
             else 'WORK_OVERDUE' end notification_type
      from public.work_orders wo
      where wo.status not in ('cancelled','closed','completed')
        and wo.scheduled_date between v_local_date - 30 and v_local_date + 1
      union all
      select wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,null,null,'WORK_NOT_ACCEPTED'
      from public.work_orders wo
      where wo.status in ('approved','pending_acceptance') and wo.scheduled_date<=v_local_date
      union all
      select wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,null,null,'WORK_NOT_STARTED'
      from public.work_orders wo
      where wo.status in ('approved','dispatched') and wo.scheduled_date<v_local_date
      union all
      select wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,null,null,'WORK_DAILY_RESULT_MISSING'
      from public.work_orders wo
      where wo.status in ('dispatched','in_progress') and wo.scheduled_date<=v_local_date
        and not exists(select 1 from public.work_results wr where wr.work_order_id=wo.id and wr.result_date=wo.scheduled_date)
      union all
      select wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,wr.id,null,'WORK_DRAFT_NOT_SUBMITTED'
      from public.work_results wr join public.work_orders wo on wo.id=wr.work_order_id
      where wr.result_status='draft' and wr.result_date<v_local_date
      union all
      select distinct wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,wr.id,null,'WORK_SURVEY_INCOMPLETE'
      from public.work_results wr join public.work_orders wo on wo.id=wr.work_order_id
      join public.survey_template_assignments sta on sta.status='active' and sta.required=true
        and (sta.activity_id is null or sta.activity_id=wo.activity_id)
        and (sta.block_id is null or sta.block_id=wo.block_id)
        and (sta.team_id is null or sta.team_id=wo.team_id)
      where wr.result_status in ('draft','submitted')
        and not exists(select 1 from public.survey_responses sr where sr.work_result_id=wr.id and sr.template_id=sta.template_id and sr.status in ('submitted','verified','closed'))
      union all
      select distinct wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,wr.id,null,'WORK_FUEL_ENTRY_INCOMPLETE'
      from public.work_results wr join public.work_orders wo on wo.id=wr.work_order_id
      join public.work_order_machines wom on wom.work_order_id=wo.id
      where wr.result_status in ('draft','submitted')
        and not exists(select 1 from public.work_result_vehicle_usage u where u.work_result_id=wr.id and u.vehicle_id=wom.vehicle_id and u.allocated_fuel_liter>=0)
      union all
      select distinct wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,wr.id,null,'WORK_MATERIAL_USAGE_INCOMPLETE'
      from public.work_results wr join public.work_orders wo on wo.id=wr.work_order_id
      join public.work_order_materials wom on wom.work_order_id=wo.id
      where wr.result_status in ('draft','submitted') and coalesce(wom.used_quantity,0)<=0
      union all
      select wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,wr.id,sf.owner_profile_id,'WORK_FINDING_OVERDUE'
      from public.survey_findings sf join public.survey_responses sr on sr.id=sf.response_id
      left join public.work_results wr on wr.id=sr.work_result_id
      join public.work_orders wo on wo.id=coalesce(sr.work_order_id,wr.work_order_id)
      where sf.status in ('open','in_progress') and sf.due_date<v_local_date and sf.owner_profile_id is not null
      union all
      select wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,wr.id,null,'WORK_RESULT_REJECTED'
      from public.work_results wr join public.work_orders wo on wo.id=wr.work_order_id where wr.result_status='rejected'
      union all
      select wo.id,wo.work_order_no,wo.scheduled_date,wo.estate_id,wo.plot_id,wo.block_id,wr.id,null,'WORK_RESULT_APPROVED'
      from public.work_results wr join public.work_orders wo on wo.id=wr.work_order_id where wr.result_status in ('verified','closed')
    ), recipient_candidates as (
      select e.*,e.direct_recipient_profile_id recipient_profile_id from work_events e where e.direct_recipient_profile_id is not null
      union all
      select e.*,wo.manager_id from work_events e join public.work_orders wo on wo.id=e.work_order_id where wo.manager_id is not null
      union all
      select e.*,p.id from work_events e join public.work_orders wo on wo.id=e.work_order_id join public.profiles p on p.employee_id=wo.supervisor_employee_id and p.status='active'
      union all
      select e.*,woa.approver_profile_id from work_events e join public.work_order_approvals woa on woa.work_order_id=e.work_order_id where woa.approver_profile_id is not null
      union all
      select e.*,p.id from work_events e join public.work_orders wo on wo.id=e.work_order_id join public.teams t on t.id=wo.team_id join public.profiles p on p.employee_id=t.supervisor_employee_id and p.status='active'
      union all
      select e.*,p.id from work_events e join public.work_order_workers wow on wow.work_order_id=e.work_order_id join public.profiles p on p.employee_id=wow.employee_id and p.status='active'
      union all
      select e.*,p.id from work_events e join public.work_order_machines wom on wom.work_order_id=e.work_order_id join public.profiles p on p.employee_id=wom.driver_employee_id and p.status='active'
      union all
      select e.*,wosl.changed_by from work_events e join public.work_order_status_logs wosl on wosl.work_order_id=e.work_order_id and wosl.to_status='dispatched' where wosl.changed_by is not null
      union all
      select e.*,est.manager_id from work_events e join public.estates est on est.id=e.estate_id where est.manager_id is not null
    ), candidates as (
      select distinct rc.*
      from recipient_candidates rc
      join public.profiles profile on profile.id=rc.recipient_profile_id and profile.status='active'
      where (
        profile.role in ('super_admin','director','estate_manager')
        or exists(
          select 1 from public.profile_roles pr
          join public.role_permissions rp on rp.role_id=pr.role_id and rp.is_allowed=true and rp.status='active'
          join public.permissions permission on permission.id=rp.permission_id and permission.status='active'
          where pr.profile_id=profile.id and pr.is_active=true and permission.permission_key='notification.view'
            and (pr.effective_from is null or pr.effective_from<=v_local_date)
            and (pr.effective_to is null or pr.effective_to>=v_local_date)
        )
      ) and (
        not exists(select 1 from public.user_access_scopes uas where uas.profile_id=profile.id and uas.status='active')
        or exists(
          select 1 from public.user_access_scopes uas where uas.profile_id=profile.id and uas.status='active'
            and (uas.estate_id is null or uas.estate_id=rc.estate_id)
            and (uas.plot_id is null or uas.plot_id=rc.plot_id)
            and (uas.block_id is null or uas.block_id=rc.block_id)
        )
      )
    ), enabled as (
      select distinct c.*,r.severity,r.action_required
      from candidates c
      join public.app_notification_rules r on r.event_type=c.notification_type and r.status='active'
      where (r.effective_from is null or r.effective_from<=v_local_date)
        and (r.effective_to is null or r.effective_to>=v_local_date)
    ), inserted as (
      insert into public.app_notifications(
        notification_type,module_key,entity_type,entity_id,work_order_id,work_result_id,recipient_profile_id,
        title,message,severity,action_url,scheduled_at,available_at,status,idempotency_key,metadata_json
      )
      select e.notification_type,'farm.work','work_order',e.work_order_id,e.work_order_id,e.work_result_id,e.recipient_profile_id,
        case e.notification_type when 'WORK_DUE_TOMORROW' then 'Work due tomorrow'
          when 'WORK_DUE_TODAY' then 'Work due today'
          when 'WORK_OVERDUE' then 'Work overdue'
          when 'WORK_FINDING_OVERDUE' then 'Survey finding overdue'
          when 'WORK_RESULT_APPROVED' then 'Work result approved'
          when 'WORK_RESULT_REJECTED' then 'Work result rejected'
          else replace(initcap(lower(e.notification_type)), '_', ' ') end,
        e.work_order_no || ' · scheduled ' || e.scheduled_date::text,
        e.severity,
        case when e.notification_type='WORK_DUE_TOMORROW'
          then '/farm/dispatch?workOrderId='||e.work_order_id::text
          when e.notification_type='WORK_SURVEY_INCOMPLETE'
          then '/farm/daily?workOrderId='||e.work_order_id::text||'&date='||e.scheduled_date::text||'&section=survey'
          when e.notification_type='WORK_FUEL_ENTRY_INCOMPLETE'
          then '/farm/daily?workOrderId='||e.work_order_id::text||'&date='||e.scheduled_date::text||'&section=fuel'
          else '/farm/daily?workOrderId='||e.work_order_id::text||'&date='||e.scheduled_date::text end,
        e.scheduled_date::timestamp at time zone 'Asia/Bangkok',p_now,'available',
        e.notification_type||':'||e.work_order_id::text||':'||e.recipient_profile_id::text||':'||e.scheduled_date::text,
        jsonb_build_object('scheduled_date',e.scheduled_date,'action_required',e.action_required)
      from enabled e
      on conflict(idempotency_key) do nothing
      returning id
    ) select count(*) into v_created from inserted;

    with closed_rows as (
      update public.app_notifications n set status='closed',closed_at=p_now,updated_at=p_now
      from public.work_orders wo
      where n.work_order_id=wo.id and n.status in ('scheduled','available','acknowledged','snoozed')
        and (wo.status in ('cancelled','closed','completed')
          or coalesce(n.metadata_json->>'scheduled_date','')<>coalesce(wo.scheduled_date::text,''))
      returning n.id
    ) select count(*) into v_closed from closed_rows;
  end if;

  update public.app_notification_jobs
  set completed_at=now(),status='completed',examined_count=v_examined,created_count=v_created,
      closed_count=v_closed,skipped_count=greatest(v_examined-v_created,0),
      summary_json=jsonb_build_object('timezone','Asia/Bangkok','localDate',v_local_date,'dryRun',p_dry_run)
  where id=v_job_id;

  return jsonb_build_object('ok',true,'status','completed','timezone','Asia/Bangkok','localDate',v_local_date,
    'dryRun',p_dry_run,'examined',v_examined,'created',v_created,'closed',v_closed,'jobId',v_job_id);
exception when others then
  if v_job_id is not null then
    update public.app_notification_jobs set completed_at=now(),status='failed',
      summary_json=jsonb_build_object('errorCode',sqlstate) where id=v_job_id;
  end if;
  raise;
end;
$$;

revoke all on function public.generate_work_notifications(timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.generate_work_notifications(timestamptz,boolean) to service_role;

commit;
