# วิเคราะห์ระบบ SPC Cultivate สำหรับกลุ่มเมนู "งานจัดการสวนปาล์ม"

วันที่วิเคราะห์: 30/05/2026

ขอบเขตที่ตรวจสอบ: ระบบหลัก Cultivate และรายงานภายใน Apache Superset โดยดูเฉพาะโครงสร้างเมนู หน้าฟอร์ม ตาราง รายงาน และลำดับงาน ไม่บันทึก/ลบ/แก้ไขข้อมูลในระบบจริง

## ภาพรวมเมนูที่พบ

ระบบหลักแบ่งเมนูเป็นกลุ่มใหญ่ดังนี้:

- Daily operations: Work Order Print Outs, Cost Data Navigator, Approval, Daily Entries, Weighbridge, Stock Management
- Plan & Schedule: Planner Workbench, Scheduler Workbench
- Cheque-roll: Cheque-roll Console, Employee A&D Console, Cheque-roll Groups, Manual Avg. Bunch Terrain
- Master Data: Contracts, Partner Master, Crop Phases, Approval Schemes, MDM, Gang Master, Activities, Activity Groups, Settlement Classes, Materials, Material Groups, Terrains, Warehouses, Weighbridges, Terrain Materials และ master data อื่น
- Maintenance and EOY Activities: Materials Master, Budget Calendars, Terrains, Material Groups, Nursery
- Reports: Dashboard, For HDRF, Cheque-roll Audit, Reporting, Maps
- Security/Settings: Users, Roles, User Groups, Datagroups, Dataprofiles, Configuration, Monitoring

## โครงเมนูที่ควรจัดใหม่เป็น "งานจัดการสวนปาล์ม"

1. Dashboard และรายงานวิเคราะห์
   - Dashboard ภาพรวมสวน
   - Harvest Dashboard
   - Work Order Workflow Dashboard
   - รายงาน FFB Block Yield
   - รายงาน Oil Palm Crop Statement
   - รายงาน Stock Inventory และ Ramp Inbound/Outbound

2. แผนงานและใบงานสวน
   - Planner Workbench: สร้างแผน, เลือก Crop Phase, เลือกแปลง, กำหนดกิจกรรม, ทรัพยากร, วัสดุ, ค่าใช้จ่าย, รอบงาน
   - Scheduler Workbench: จัดตารางงาน, เลื่อนสถานะ, ตรวจสอบ Gantt, คุม Planned/Scheduled/Executed
   - Work Order Print Outs: พิมพ์ใบงานตาม Type, Activity, Activity Group, Terrain, Gang, ช่วงวันที่
   - Approval: อนุมัติ/ปฏิเสธรายการที่รอดำเนินการ

3. บันทึกงานประจำวัน
   - Daily Entries: สแกน QR ใบงาน, ค้นหา Work Orders, กรอง Type/Activity/Terrain/Estate/Contract/วันที่, แยก Open/Closed
   - ใช้บันทึกผลปฏิบัติงานจริง, คนงาน, ปริมาณงาน, หมายเหตุ และสถานะใบงาน

4. เก็บเกี่ยวและชั่งน้ำหนัก
   - Harvest workflow อยู่ใน Activity Group AG08 - การเก็บเกี่ยว
   - Weighbridge Console: อัปโหลดไฟล์ชั่ง, ประมวลผล pending, จัดการ ticket, ค้นหาตาม weighbridge/material/status/date
   - รายงาน Harvest ใน Superset มีหัวข้อ Planned vs Actual, Total Harvest Terrain, Harvested Terrain, Harvested Status Distribution

5. คลังวัสดุและสต๊อก
   - Stock Management: ดูวัสดุ, inventory, SKU, movement
   - Movement types ที่พบ: Good Receipt, Good Issue, Transfer, Good Delivery, SKU Convert, Amend Movement, Stock Take, Issue Return
   - Master data ที่เกี่ยวข้อง: Materials, Material Groups, Warehouses, Terrain Materials

6. ค่าแรงและผู้รับเหมา
   - Cheque-roll Console: period, budget, status
   - Employee A&D Console: allowance/deduction, discharge partner, ค้นหาตาม estate/group/partner/payment period
   - Partner Master: พนักงาน/คู่ค้า/ผู้รับเหมา, เอกสาร, gang, designation, nationality
   - Contracts: ผูก contract กับ terrains, activity groups, activities, materials, supplier, datagroup

7. ข้อมูลแปลงและแผนที่
   - Terrains: รหัสแปลง, description, terrain type, superior, company, characteristic class, status, area, geometry, estate, structure level
   - Maps: แผนที่ Leaflet/Mapbox แสดง terrains
   - Terrain Materials: กำหนดวัสดุตามแปลง, characteristic, dosage, rate

8. เพาะชำและงานบำรุงรักษา
   - Nursery: Receive, Transfer, Issue, stage, division, entry type, material, count, date, comments
   - Maintenance/EOY: วัสดุ, budget calendar, terrain, nursery

## ขั้นตอนงานหลัก end-to-end

1. เตรียม master data
   - ตั้งค่า estate/company/datagroup
   - สร้าง terrain/block/sub-block พร้อม area และ geometry
   - สร้าง activity group และ activity เช่น AG08 เก็บเกี่ยว, AG10 ขนส่ง, AG05 ใส่ปุ๋ย
   - สร้าง partner/gang/contract/material/warehouse/weighbridge

2. วางแผนงาน
   - Planner Workbench เลือก plan, crop phase, budget calendar
   - เลือก activity group/activity
   - เลือก terrains และพื้นที่
   - ใส่ partner/equipment/material
   - คำนวณ planned quantity, duration, cost
   - สร้าง work orders

3. จัดตารางและแจกงาน
   - Scheduler Workbench กำหนดวันที่เริ่ม/จบ
   - เปลี่ยนสถานะ Planned -> Scheduled
   - พิมพ์ Work Order

4. ปฏิบัติงานและบันทึกรายวัน
   - Daily Entries สแกน QR หรือค้นหา work order
   - บันทึกผลงานจริง แรงงาน วัสดุ อุปกรณ์ หมายเหตุ
   - เปลี่ยนสถานะ Scheduled -> Executed/Open/Closed

5. เก็บเกี่ยวและชั่งน้ำหนัก
   - งานเก็บเกี่ยวอยู่บน work order และ daily entry
   - Weighbridge รับ ticket จากเครื่องชั่งหรืออัปโหลดไฟล์
   - ตรวจ matched/unmatched/ticket without weights
   - ผูกน้ำหนักกับ material, partner, terrain, ticket date

6. ตัดสต๊อกและรับเข้า
   - Stock Management รับเข้า/ส่งออก/โอน/นับสต๊อก
   - เชื่อมโยง movement กับ warehouse, material, SKU, partner, reference document
   - ใช้ stock take สำหรับปรับยอดจริง

7. ค่าแรง/ผู้รับเหมา/อนุมัติ
   - Cheque-roll รวมผลงานตาม period
   - Employee A&D เพิ่ม allowance/deduction
   - Approval ตรวจรายการก่อนจ่ายหรือปิดงาน

8. วิเคราะห์ผล
   - Superset 01 Operations ดูสถานะ work order
   - Superset 02 Harvest ดูผลเก็บเกี่ยวเทียบแผน
   - Reporting ดู FFB Block Yield, Oil Palm Crop Statement, Stock Inventory, Ramp Inbound/Outbound

## รายงานที่เกี่ยวข้องกับสวนปาล์ม

รายงานสำคัญที่พบใน Reporting:

- 1 - Terrains Master List
- 3 - Upkeep & Maintenance Cost Analysed over Manday & Prime Costs
- 9 - Material Management Report
- 12 - Contract Work Edit List
- 14 - Expenditure
- 15 - Harvest Incentives Estimation Report
- 18 - FFB Block Yield
- 19 - FFB Block Yield (Totals Per Block)
- 20 - Oil Palm Payment Rate Summary
- 21 - Oil Palm Payment Rate Summary (kg)
- 22 - Oil Palm Crop Statement
- 23 - Stock Inventory Report
- 30 - Ramp Inbound and outbound materials report
- 31 - Ramp Inbound and outbound materials consolidated report
- 33 - Stock Take

Dashboard ภายใน Superset:

- 01 - OPERATIONS - WORK ORDER WORKFLOWS: สถานะ work order, daily entry statistics, scheduled/active/closed, ตาราง work order ตาม terrain/activity/date/cost
- 02 - Harvest: Planned vs Actual, Total Harvest Terrain, Harvested Terrain, Harvested Status Distribution
- Master Data Lists: รายการ master data
- Survey: ข้อมูลสำรวจ เช่น harvester weight, bunch per tree, block info

## ข้อเสนอสำหรับฐานข้อมูล PHP/MySQL

ควรแยกฐานข้อมูลเป็น 8 กลุ่ม:

1. master_org: company, estate, datagroup, user, role
2. master_terrain: terrain hierarchy, block/sub-block, geometry, area, crop year, characteristic
3. master_operation: activity group, activity, crop phase, plan, budget calendar
4. master_partner: partner, gang, contract, contract terrain/activity/material
5. work_execution: work order, work order terrain, work order resource, daily entry
6. harvest_weighbridge: harvest record, weighbridge ticket, harvester weight
7. inventory_stock: material, material group, warehouse, stock balance, inventory movement, stock take
8. payroll_approval_report: checkroll period, employee allowance/deduction, approvals, report definitions

ไฟล์ schema เริ่มต้นอยู่ที่ `php_backend/schema.sql`

