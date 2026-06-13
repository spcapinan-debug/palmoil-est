# ระบบบริหารงานสวนปาล์ม Stack

ระบบบริหารงานสวนปาล์มจาก `Prompt EST.docx` ออกแบบให้ใช้เฉพาะ 3 ส่วนนี้:

- GitHub: เก็บ source code, schema, migration และ history
- Vercel: deploy webapp จาก `webapp/`
- Supabase: Postgres, Auth, RLS, Realtime และ Storage

## ข้อมูลตั้งต้น

- Requirement หลัก: `Prompt EST.docx`
- Supabase migration หลัก: `supabase/migrations/20260614_prompt_est_foundation.sql`
- Static foundation UI: `webapp/`

## Deploy Flow

1. Push project ขึ้น GitHub
2. Import repository ใน Vercel
3. ตั้ง Vercel ให้ใช้ `vercel.json`
4. สร้าง Supabase project
5. Run SQL จาก `supabase/migrations/20260614_prompt_est_foundation.sql`
6. ตั้ง environment variables ใน Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` เฉพาะ Server Actions / API Routes
7. เมื่อ data import เข้า Supabase แล้ว ค่อยเปลี่ยน CRUD foundation จาก localStorage เป็น Supabase query

## เมนูระบบ

- ข้อมูลพื้นที่
- ข้อมูลพนักงาน / ผู้รับเหมา
- ข้อมูลกิจกรรม
- ระบบทำงาน
- พัสดุ / อุปกรณ์
- ระบบคำนวณค่าแรง
- อัตรางบประมาณ
- ข้อมูลทั่วไป
- รายงาน
