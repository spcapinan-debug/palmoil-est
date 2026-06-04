# EST Palm Management Stack

ระบบ EST ออกแบบให้ใช้เฉพาะ 3 ส่วนนี้:

- GitHub: เก็บ source code, schema, migration และ history
- Vercel: deploy webapp จาก `webapp/`
- Supabase: Postgres, Auth, RLS, Realtime และ Storage

## ข้อมูลตั้งต้น

- Requirement หลัก: `Master Data/est.docx`
- งบประมาณหลัก: `Master Data/ประมาณการค่าใช้จ่าย 2569.xlsx`
- ข้อมูลอ้างอิงอื่น: ทุกไฟล์ใน `Master Data/`
- Static seed สำหรับหน้าเว็บ: `webapp/data/est_data.json`

## Deploy Flow

1. Push project ขึ้น GitHub
2. Import repository ใน Vercel
3. ตั้ง Vercel ให้ใช้ `vercel.json`
4. สร้าง Supabase project
5. Run SQL จาก `supabase/schema.sql`
6. ตั้ง environment variables ใน Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
7. เมื่อ data import เข้า Supabase แล้ว ค่อยเปลี่ยน frontend จาก static JSON เป็น Supabase query

## เมนูระบบ

- Dashboard EST
- ข้อมูลหลัก
- งบประมาณ 2569
- วางแผนงาน
- สั่งงาน
- บันทึกทำงาน
- อัตราค่าแรง
- รายงาน
- Stack
