# Mobile Dispatch, Daily Entry, Survey, Fuel และ Work Notification Audit

วันที่ตรวจ: 1 สิงหาคม 2569 (Asia/Bangkok)

## สถานะก่อนแก้โค้ด

- Repository: `spcapinan-debug/palmoil-est`
- Worktree: `C:\Users\com_e\AppData\Local\Temp\palmoil-est-mobile-dispatch-daily-entry-ux`
- Branch: `codex/mobile-dispatch-daily-entry-ux`
- Base remote branch: `origin/codex/phase4-inventory-multiday-returns-unit-conversion`
- Base SHA: `9c6cb14427c4ded1b0e96c4787089d2345d3bd7c`
- Local SHA ก่อนเริ่มงาน: `9c6cb14427c4ded1b0e96c4787089d2345d3bd7c`
- Remote SHA หลังสร้าง Branch: `9c6cb14427c4ded1b0e96c4787089d2345d3bd7c`
- Working tree ก่อนเริ่มงาน: สะอาด
- Remote branch: สร้างและตั้ง upstream แล้ว
- ยืนยันว่าไม่ได้อยู่บน `main`, ไม่แก้ `main`, ไม่สร้าง Vercel Project ใหม่ และไม่ Deploy Production

## โครงสร้างที่มีอยู่แล้ว

### Mobile Dispatch

- Route `/farm/dispatch` ใช้ workspace `farm.dispatch` และ renderer `renderFarmDispatchPanel()`
- มีรายการงานผู้สมัคร, filter, ทีม, คนงาน, วัสดุ, รถ/เครื่องจักร และข้อมูลเชื้อเพลิงตามแผนแล้ว
- การเปลี่ยนสถานะงานผ่าน allowlisted action API, permission และ idempotency key กลาง
- งาน Phase A จึงเป็นการปรับ candidate-first mobile UX, validation และ deep-link state โดยไม่สร้าง workflow ใหม่

### Mobile Daily Entry

- Route `/farm/daily` ใช้ workspace `farm.daily` และ renderer `renderFarmResultPanel()` / `renderFarmDailyWorkspace()`
- มี local draft แยกด้วย `workOrderId::resultDate` ใน `sessionStorage`
- มีส่วนผลผลิต, คนงาน, วัสดุ, รถ, Survey, ใบชั่ง และตรวจทาน
- การบันทึกใช้ `get_or_create_work_result` และ `save_work_result_draft`; action API ตรวจ permission, scope, state conflict และ idempotency
- ช่องว่างหลักคือ mobile step order, candidate/resume UX, การผูก Survey draft จริง และการบันทึกข้อมูล Fuel จากฟอร์มรถให้ครบ

### Survey

- ใช้ตารางเดิม: `survey_templates`, `survey_questions`, `survey_template_assignments`, `survey_responses`, `survey_answers`, attachment link และ `survey_findings`
- มี action เดิมครบวงจร: create, save draft, submit, verify, close, create/resolve finding
- `survey_responses.template_version_snapshot` และ answer snapshots มีอยู่แล้ว จึงไม่สร้างตาราง Survey ซ้ำ
- Template assignment มี activity/block/team/vehicle/employee, priority, effective period และ condition JSON
- คำถามรองรับ choice JSON, conditional JSON, scoring, attachment requirement และ failure severity
- Bucket `survey-evidence` เป็น private bucket; evidence ต้องเข้าถึงผ่าน authenticated/signed flow เท่านั้น
- ค่า `survey.frontend_ready=false` ต้องคงเดิม และงานนี้ห้ามเปิด Feature Flag
- ช่องว่างหลัก: frontend เดิมเลือก template ด้วย activity/name fallback, ยังไม่ใช้ assignment precedence เต็มรูปแบบ, ยังไม่ persist answers/findings/evidence ใน Daily flow และ conditional/validation บน mobile ยังไม่ครบ

### Vehicle / Fuel

- ใช้ schema เดิม: `fuel_requisitions`, `fuel_issues`, balances, measurements, consumption periods, standards และ `work_result_vehicle_usage`
- มี action เดิมสำหรับ refresh requisition, allocation และ issue fuel; ไม่ใช้ generic writes สำหรับ `fuel_issues`
- Bucket `fuel-photos` เป็น private bucket
- `fuel.configuration_confirmed=false` ต้องคงเดิม
- Daily UI เดิมมี meter/hour/fuel fields แต่ `save_work_result_draft` ยังไม่ส่ง/บันทึก allocated fuel และเวลาการใช้รถครบทุกฟิลด์

### Notifications

- Top bar มีปุ่ม notification เชิง UI แต่ไม่มี work-notification data model/API เฉพาะ
- Live database มี HR reminder/notification จาก Phase 5 แต่ข้อกำหนดห้ามใช้ `hr_notifications` สำหรับงานปฏิบัติการ
- Database ไม่มี `pg_cron` หรือ `pg_net`; scheduling จึงต้องเป็น idempotent server action ที่เรียกได้จาก Vercel Cron โดยไม่เปิด endpoint สาธารณะ และต้องมี fallback refresh เมื่อผู้ใช้เปิดแอป
- Work notifications ต้องเป็น schema แยก, scope ตามผู้รับ/พื้นที่, deep link เฉพาะ route และไม่เพิ่มเข้าช่อง generic write

## Security และ Data Integrity

- `/api/farm-actions` authenticate ทุก mutation, allowlist action, ตรวจ permission, confirmation, scope และใช้ `farm_action_idempotency`
- Survey response/answer/finding และ fuel issue อยู่ใน `ACTION_ONLY_TABLES`; ต้องคงหลักการ action-only และเพิ่ม work notifications เข้า guard เดียวกัน
- Scoped reads เดิมไล่ความสัมพันธ์จาก work order/work result ไปยัง survey/fuel; implementation ใหม่ต้อง reuse scope graph นี้
- Survey/Fuel operational child tables ส่วนใหญ่ไม่มี authenticated direct policy จึงเข้าถึงผ่าน service-role API; public/private storage ต้องคง private
- Live row counts ยืนยันว่ามีข้อมูล Survey/Fuel จริง จึงห้ามแก้ applied migration, truncate, backfill แบบเดาสุ่ม หรือสร้าง test data ปะปน
- Supabase changelog ปัจจุบันระบุว่า table ใหม่จะไม่ถูกเปิดใน Data API โดยอัตโนมัติ; migration ใหม่จะยัง revoke `anon`/`authenticated`, enable RLS และให้ service role เท่านั้นเพื่อให้พฤติกรรมชัดเจนทุก installation

## Migration expectation

- ไม่ต้อง migration สำหรับ Dispatch/Daily UX
- ไม่แก้ migration Survey/Fuel ที่ apply แล้ว
- คาดว่าต้องมี additive migration เพียงชุดเดียวสำหรับ work notification model, permission keys, indexes, RLS และ safe settings defaults
- หากต้องเพิ่ม constraint/index ให้ Survey/Fuel จะทำเฉพาะแบบ additive, ตรวจข้อมูลเดิมก่อน และไม่เปลี่ยน feature flags
- Migration ทุกชุดต้องตรวจ syntax/transaction rollback, ตรวจ migration list และรัน security/performance advisor หลัง apply

## ความเสี่ยงและแนวทางควบคุม

1. **ข้อมูล draft ซ้ำจาก retry** — ใช้ action idempotency เดิมและ natural uniqueness ของ work result/survey response/notification occurrence
2. **Template ผิดงาน** — เลือกจาก assignment ที่ active/effective โดยลำดับ exact activity, activity group/work type condition, general และ manual; ไม่จับจากชื่อกิจกรรมอย่างเดียว
3. **ข้าม required Survey/evidence** — validate เฉพาะคำถามที่มองเห็นตาม conditional logic และตรวจ evidence/finding ก่อน submit
4. **Fuel เกิน/ติดลบ** — ใช้ action/RPC เดิม, validate meter progression และห้ามเปิด `fuel.configuration_confirmed`
5. **แจ้งเตือนข้าม scope** — recipient + work-order scope filtering, action-only acknowledge/read และ deep link allowlist
6. **Mobile overflow/สูญเสีย draft** — accordion/step navigation, touch targets, responsive regression และ browser UAT หลาย viewport
7. **Production impact** — ทำเฉพาะ Preview branch, ไม่เปิด flags, ไม่ Deploy Production และไม่สร้าง Vercel Project ใหม่

