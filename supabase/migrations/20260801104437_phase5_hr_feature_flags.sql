begin;

insert into public.system_settings (
  setting_key, setting_value, value_json, setting_group, description, status
)
values
  ('hr.employee_workspace_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด Employee 360 หลัง Preview UAT', 'active'),
  ('hr.document_vault_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด Document Vault หลัง security/storage UAT', 'active'),
  ('hr.migrant_renewal_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด Migrant Renewal หลัง workflow UAT', 'active'),
  ('hr.notification_engine_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด Reminder Engine หลัง idempotency UAT', 'active'),
  ('hr.leave_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด Leave หลัง policy/payroll UAT', 'active'),
  ('hr.training_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด Training หลัง HR ยืนยัน course master', 'active'),
  ('hr.medical_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด Medical หลัง permission/privacy UAT', 'active'),
  ('hr.analytics_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'เปิด HR Analytics หลัง baseline verification', 'active'),
  ('hr.employee_self_service_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'Self-service ปิดจนกว่าจะผ่าน permission UAT', 'active'),
  ('hr.external_notifications_enabled', 'false', '{}'::jsonb, 'hr_feature_flags', 'External notifications ปิดจนตั้งค่า provider และได้รับอนุมัติ', 'active'),
  ('hr.document_signed_url_seconds', '300', '{"minimum":60,"maximum":300}'::jsonb, 'hr_security', 'อายุ Signed URL เอกสาร ค่าเริ่มต้นไม่เกิน 5 นาที', 'active'),
  ('hr.document_max_file_bytes', '15728640', '{"allowed_mime_types":["application/pdf","image/jpeg","image/png","image/webp"]}'::jsonb, 'hr_security', 'ขนาดไฟล์เอกสารสูงสุดและ MIME ที่อนุญาต', 'active'),
  ('hr.reminder_timezone', 'Asia/Bangkok', '{}'::jsonb, 'hr_scheduler', 'เขตเวลาสำหรับคำนวณ Reminder', 'active'),
  ('hr.reminder_schedule', '0 7 * * *', '{"enabled":false,"provider":"vercel_cron","dry_run_default":true}'::jsonb, 'hr_scheduler', 'Schedule เป็น configurable และปิดจนผ่าน UAT', 'active'),
  ('hr.legal_configuration_status', 'requires_hr_review', '{"hardcoded_legal_deadlines":false}'::jsonb, 'hr_governance', 'HR ต้องยืนยันประเภทเอกสาร สิทธิการลา และกำหนดต่ออายุก่อนเปิดใช้งาน', 'active')
on conflict (setting_key) do nothing;

insert into public.system_settings (
  setting_key, setting_value, value_json, setting_group, description, status
)
values (
  'hr.scheduler_profile_id', '', '{"required_before_enable":true}'::jsonb,
  'hr_scheduler', 'Approved system profile for the protected Vercel Cron endpoint', 'active'
)
on conflict (setting_key) do nothing;

commit;
