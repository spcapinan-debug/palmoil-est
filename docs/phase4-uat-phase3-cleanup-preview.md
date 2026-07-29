# Phase 4 — UAT Phase 3 Cleanup Preview

สถานะ: Preview เท่านั้น รอการยืนยันจากผู้ใช้ก่อนลบจริง

เป้าหมายที่อนุญาตให้ตรวจ:

- `WEBTEST-UAT-MGR-WO-001`
- `WEBTEST-UAT-SUP-WO-001`
- Work Result ที่อ้างถึงสอง Work Order นี้
- Survey Response ที่อ้างถึง Work Order/Work Result เป้าหมาย
- Performance Metric ที่อ้างถึง Work Order/Work Result เป้าหมาย
- Audit Log ที่เกี่ยวข้อง

คำสั่ง preview อยู่ที่ `scripts/phase4-uat-phase3-cleanup-preview.sql` และรายงาน record, dependency, จำนวนต่อ table, audit ที่เกี่ยวข้อง และผลกระทบต่อ `WEBTEST-2569`

ข้อห้าม:

- ห้ามลบจนกว่าผู้ใช้ยืนยัน
- ห้ามขยาย target ด้วย wildcard `WEBTEST-*`
- ห้ามแก้หรือลบ `WEBTEST-2569`
- หากไม่พบ `WEBTEST-2569` ใน remote ให้หยุดและตรวจสอบก่อน cleanup

ข้อจำกัดปัจจุบัน: workspace ไม่มี database credential/project link จึงยังไม่สามารถแนบจำนวนจริงจาก Supabase Remote ได้
