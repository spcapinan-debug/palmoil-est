create extension if not exists "pgcrypto";

create table if not exists public.survey_templates (
  id text primary key default gen_random_uuid()::text,
  template_code text unique not null,
  template_name text not null,
  activity_id text,
  file_name text,
  file_url text,
  required_for_work_order boolean not null default true,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_questions (
  id text primary key default gen_random_uuid()::text,
  template_id text not null,
  question_code text not null,
  question_text text not null,
  answer_type text not null default 'number',
  answer_unit text,
  section_title text,
  score_weight numeric,
  choices_json text,
  help_text text,
  required boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.survey_questions'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.survey_questions drop constraint if exists %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.survey_templates'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.survey_templates drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.survey_templates alter column id drop default;
alter table public.survey_templates alter column id type text using id::text;
alter table public.survey_templates alter column id set default gen_random_uuid()::text;
alter table public.survey_templates alter column activity_id type text using activity_id::text;
alter table public.survey_templates add column if not exists file_name text;
alter table public.survey_templates add column if not exists file_url text;
alter table public.survey_templates add column if not exists required_for_work_order boolean not null default true;

alter table public.survey_questions alter column id drop default;
alter table public.survey_questions alter column id type text using id::text;
alter table public.survey_questions alter column id set default gen_random_uuid()::text;
alter table public.survey_questions alter column template_id type text using template_id::text;
alter table public.survey_questions add column if not exists answer_unit text;
alter table public.survey_questions add column if not exists section_title text;
alter table public.survey_questions add column if not exists score_weight numeric;
alter table public.survey_questions add column if not exists choices_json text;
alter table public.survey_questions add column if not exists help_text text;
alter table public.survey_questions add column if not exists status text not null default 'active';

create unique index if not exists survey_questions_template_code_key
  on public.survey_questions (template_id, question_code);

insert into public.survey_templates (
  id, template_code, template_name, activity_id, file_name, file_url, required_for_work_order, status
) values
  ('survey-opr-002', 'FM-RSPO-OPR-002', 'รายงานตรวจงานถางป่า', null, 'FM - RSPO - OPR 002  รายงานตรวจงานถางป่า.doc', 'Master Data/Survay/FM - RSPO - OPR 002  รายงานตรวจงานถางป่า.doc', true, 'active'),
  ('survey-opr-004', 'FM-RSPO-OPR-004', 'รายงานตรวจงานฉีดยา', null, 'FM - RSPO - OPR 004 รายงานตรวจงานฉีดยา.doc', 'Master Data/Survay/FM - RSPO - OPR 004 รายงานตรวจงานฉีดยา.doc', true, 'active'),
  ('survey-opr-005', 'FM-RSPO-OPR-005', 'รายงานตรวจงานตัดปาล์ม', 'activity-harvest', 'FM - RSPO - OPR 005 รายงานตรวจงานตัดปาล์ม.doc', 'Master Data/Survay/FM - RSPO - OPR 005 รายงานตรวจงานตัดปาล์ม.doc', true, 'active'),
  ('survey-opr-006', 'FM-RSPO-OPR-006', 'รายงานตรวจงานใส่ปุ๋ย', 'activity-fertilizer-0030', 'FM - RSPO - OPR 006 รายงานตรวจงานใส่ปู่ย.doc', 'Master Data/Survay/FM - RSPO - OPR 006 รายงานตรวจงานใส่ปู่ย.doc', true, 'active'),
  ('survey-opr-007', 'FM-RSPO-OPR-007', 'รายงานตรวจงานตัดแต่งทางใบ', null, 'FM - RSPO - OPR 007 รายงานตรวจงงานตัดแต่งทางใบ.doc', 'Master Data/Survay/FM - RSPO - OPR 007 รายงานตรวจงงานตัดแต่งทางใบ.doc', true, 'active')
on conflict (template_code) do update set
  id = excluded.id,
  template_name = excluded.template_name,
  activity_id = excluded.activity_id,
  file_name = excluded.file_name,
  file_url = excluded.file_url,
  required_for_work_order = excluded.required_for_work_order,
  status = excluded.status,
  updated_at = now();

insert into public.survey_questions (
  id, template_id, question_code, question_text, answer_type, answer_unit, section_title, score_weight, choices_json, required, sort_order, status
) values
  ('sq-opr006-bags', 'survey-opr-006', 'BAGS_USED', 'ปุ๋ยใช้จริง', 'number', 'กระสอบ', 'ข้อมูลปริมาณงาน', null, null, true, 1, 'active'),
  ('sq-opr006-trees', 'survey-opr-006', 'TREES_COVERED', 'จำนวนต้นที่ใส่ครบ', 'number', 'ต้น', 'ข้อมูลปริมาณงาน', null, null, true, 2, 'active'),
  ('sq-opr006-missed', 'survey-opr-006', 'MISSED_TREES', 'จำนวนต้นที่ตกหล่น', 'number', 'ต้น', 'ข้อมูลปริมาณงาน', null, null, false, 3, 'active'),
  ('sq-opr006-rate', 'survey-opr-006', 'DOSAGE_RATE', 'อัตราเฉลี่ยต่อต้น', 'number', 'กก./ต้น', 'ข้อมูลปริมาณงาน', null, null, false, 4, 'active'),
  ('sq-opr006-spread', 'survey-opr-006', 'FERT_SPREAD', 'ใส่ปุ๋ยกระจายทั่วถึง', 'choice', 'คะแนน', 'ใส่ปุ๋ยคะแนน 90 คะแนน', 10, '[{"value":"10","label":"ใส่ปุ๋ยกระจายทั่วถึง"},{"value":"5","label":"กระจายไม่สม่ำเสมอบางจุด"},{"value":"0","label":"กระจายไม่ทั่วถึง"}]', true, 10, 'active'),
  ('sq-opr006-radius', 'survey-opr-006', 'FERT_RADIUS', 'ใส่ปุ๋ยรอบโคนตามระยะ', 'choice', 'คะแนน', 'ใส่ปุ๋ยคะแนน 90 คะแนน', 20, '[{"value":"20","label":"ใส่ปุ๋ยรอบโคนถึง 3 เมตร"},{"value":"10","label":"ระยะไม่ครบทุกจุด"},{"value":"0","label":"ใส่ผิดตำแหน่ง"}]', true, 11, 'active'),
  ('sq-opr006-accuracy', 'survey-opr-006', 'FERT_RATE_ACCURACY', 'อัตราการใส่ถูกต้อง', 'choice', 'คะแนน', 'ใส่ปุ๋ยคะแนน 90 คะแนน', 15, '[{"value":"15","label":"อัตราการใส่ถูกต้อง"},{"value":"8","label":"อัตราคลาดเคลื่อนเล็กน้อย"},{"value":"0","label":"อัตราไม่ถูกต้อง"}]', true, 12, 'active'),
  ('sq-opr006-coverage', 'survey-opr-006', 'FERT_TREE_COVERAGE', 'ใส่ปุ๋ยครบทุกต้น', 'choice', 'คะแนน', 'ใส่ปุ๋ยคะแนน 90 คะแนน', 55, '[{"value":"55","label":"ใส่ปุ๋ยครบทุกต้น"},{"value":"28","label":"ตกหล่นบางต้น"},{"value":"0","label":"ตกหล่นมาก"}]', true, 13, 'active'),
  ('sq-opr006-cleanup', 'survey-opr-006', 'FERT_CLEANUP', 'ความเรียบร้อยหลังงาน', 'choice', 'คะแนน', 'สรุปงานใส่ปุ๋ยอื่นๆ 10 คะแนน', 10, '[{"value":"10","label":"ปุ๋ยหกบนถนน/พื้นที่ 100%"},{"value":"5","label":"มีปุ๋ยตกหล่นเล็กน้อย"},{"value":"0","label":"ไม่เรียบร้อย/ต้องแก้ไข"}]', true, 20, 'active'),
  ('sq-opr006-dress', 'survey-opr-006', 'DRESS_WELL', 'คนงานแต่งกายเหมาะสมหรือไม่', 'yes_no', 'Dress Well?', 'ความพร้อม (Readiness)', 0, null, true, 30, 'active'),
  ('sq-opr006-ppe', 'survey-opr-006', 'PPE_READY', 'การใช้อุปกรณ์ PPE เหมาะสมหรือไม่', 'yes_no', 'PPE?', 'ความพร้อม (Readiness)', 0, null, true, 31, 'active')
on conflict (template_id, question_code) do update set
  id = excluded.id,
  question_text = excluded.question_text,
  answer_type = excluded.answer_type,
  answer_unit = excluded.answer_unit,
  section_title = excluded.section_title,
  score_weight = excluded.score_weight,
  choices_json = excluded.choices_json,
  required = excluded.required,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = now();
