# Clear Ramp Online Sync Setup

ถ้าใส่ข้อมูล `Clear_Ramp_Log` บนเว็บออนไลน์แล้วข้อมูลไม่อัปเดต ให้ตรวจ 2 จุดนี้ก่อน:

1. รัน SQL สร้างตาราง transport ใน Supabase

   เปิด Supabase Dashboard > SQL Editor แล้วรันไฟล์นี้ทั้งไฟล์:

   `supabase/migrations/20260617_transport_reconciliation.sql`

   ตารางที่ต้องมีหลังรัน:

   - `transport_sync_runs`
   - `transport_source_records`
   - `transport_clear_ramp_log`
   - `transport_mill_weight_records`
   - `transport_mill_reconciliations`

2. ตั้ง Environment Variables บน Vercel

   ต้องมีค่า:

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   `SUPABASE_SERVICE_ROLE_KEY` ต้องเป็น service role/secret key สำหรับ server เท่านั้น ห้ามใช้ key ที่ขึ้นต้นด้วย `sb_publishable_` เพราะเขียนข้อมูลไม่ได้

หลังแก้แล้วให้ Redeploy บน Vercel แล้วทดสอบ:

`https://palmoil-est.vercel.app/api/transport-sync?healthcheck=1`

ถ้าใช้งานได้ ค่า `ok` ต้องเป็น `true` และทุก table ใน `checks` ต้องเป็น `ok`
