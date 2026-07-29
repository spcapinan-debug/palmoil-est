# Phase 4 Unit Master Cleanup Preview

สถานะ: รอการยืนยันจากผู้ใช้ก่อน cleanup จริง

รายงานนี้ไม่ merge หน่วย ไม่แก้ foreign key และไม่แก้ข้อมูลถาวร คำสั่ง preview อยู่ที่ `scripts/phase4-unit-master-cleanup-preview.sql` และแสดง:

- Unit ID
- Code
- Name
- Base Unit
- Conversion Rate
- จำนวน Foreign Key References
- หน่วยที่เสนอเป็น Canonical
- Alias ที่เสนอ
- ผลกระทบหาก Merge

กลุ่มที่ต้องทบทวนเป็นพิเศษ:

- `กก`, `กก.`, `กิโลกรัม`, `kg`
- รายการตันที่มีหลาย Unit ID หรือ Conversion Rate ต่างกัน

หลักการเสนอ canonical คือเลือกรายการที่มี foreign key reference มากที่สุดก่อน แล้วใช้ code และ Unit ID เป็นลำดับตัดสินที่คงที่ รายงานนี้เป็นข้อเสนอเพื่อทบทวนเท่านั้น เพราะ conversion และ snapshot ของ transaction เก่าอาจทำให้การ merge เปลี่ยนความหมายเชิงบัญชี

ข้อจำกัดปัจจุบัน: workspace ไม่มี database credential/project link จึงยังไม่มีผลลัพธ์ Unit ID จริงจาก remote ในไฟล์นี้ ต้องรัน query preview กับ Supabase Remote แล้วแนบผลให้ผู้ใช้ยืนยันก่อนดำเนินการใด ๆ
