# PHP/MySQL backend สำหรับงานจัดการสวนปาล์ม

ไฟล์นี้เป็นโครงเริ่มต้นสำหรับเก็บข้อมูลจาก workflow ที่วิเคราะห์จากระบบ SPC Cultivate

## ติดตั้งฐานข้อมูล

1. สร้างฐานข้อมูลด้วย `schema.sql`
2. คัดลอก `config.example.php` เป็น `config.php`
3. แก้ host, database, username, password ให้ตรงกับ MySQL/MariaDB

```powershell
mysql -u root -p < php_backend/schema.sql
Copy-Item php_backend/config.example.php php_backend/config.php
```

## ตัวอย่าง API

เปิดด้วย PHP built-in server:

```powershell
php -S 127.0.0.1:8080 -t php_backend
```

อ่าน dashboard:

```text
GET http://127.0.0.1:8080/api/palm_records.php?resource=dashboard&from=2026-01-01&to=2026-01-31
```

บันทึก daily entry:

```text
POST http://127.0.0.1:8080/api/palm_records.php?resource=daily-entry
```

บันทึก weighbridge ticket:

```text
POST http://127.0.0.1:8080/api/palm_records.php?resource=weighbridge-ticket
```

หมายเหตุ: ก่อนนำขึ้นใช้งานจริงควรเพิ่มระบบ login/session, permission, audit log และ CSRF protection

