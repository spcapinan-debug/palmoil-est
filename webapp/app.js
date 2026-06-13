const state = {
  payload: null,
  records: [],
  view: "dashboard",
  clearOverrides: [],
  currentRows: [],
  dailyFilters: { standard: "all", flow: "all" },
  palmFilters: { job: "all", from: "", to: "", area: "all", group: "all", query: "" },
  dashboardCompareMode: "area",
  payloadSignature: "",
  liveMode: !window.__PALM_DATA__,
  estData: null,
  estFilters: { fiscalYear: "2569", area: "all", activityGroup: "all", activity: "all", material: "all", workerGroup: "all", rateGroup: "all", datasetId: "", query: "" },
  estWorkPlans: [],
  estWorkOrders: [],
  estDailyEntries: [],
  estBudgetRateEdits: [],
  estMasterCategory: "areas",
  estMasterEditId: "",
  estMasterRecords: [],
  estMasterSyncMessage: "",
  estMasterSyncBusy: false,
  masterFolderData: null,
  masterFolderTableId: "",
  masterFolderEditId: "",
  masterFolderDetailId: "",
  masterFolderSearch: "",
  masterFolderGroupFilters: [],
  masterFolderSort: { tableId: "", key: "", dir: "asc" },
  masterFolderRecords: [],
  farmRecords: [],
  farmFilters: { query: "", status: "all", role: "super_admin" },
  farmTableId: "",
  farmDetailId: "",
  farmEditId: "",
  estSearchTimer: null,
  sidebarCollapsed: localStorage.getItem("sidebarCollapsed") === "1",
};

const els = {
  appShell: document.querySelector(".app-shell"),
  sidebar: document.querySelector("#appSidebar"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  sourceInfo: document.querySelector("#sourceInfo"),
  startDate: document.querySelector("#startDate"),
  endDate: document.querySelector("#endDate"),
  startDatePicker: document.querySelector("#startDatePicker"),
  endDatePicker: document.querySelector("#endDatePicker"),
  yardFilter: document.querySelector("#yardFilter"),
  datePanel: document.querySelector(".date-panel"),
  globalFilterPanel: document.querySelector("#globalFilterPanel"),
  tabs: document.querySelector("#tabs"),
  dashboard: document.querySelector("#dashboard"),
  reportPage: document.querySelector("#reportPage"),
  clearPage: document.querySelector("#clearPage"),
  kpiOpening: document.querySelector("#kpiOpening"),
  kpiInbound: document.querySelector("#kpiInbound"),
  kpiOutbound: document.querySelector("#kpiOutbound"),
  kpiLoss: document.querySelector("#kpiLoss"),
  kpiBalance: document.querySelector("#kpiBalance"),
  printBtn: document.querySelector("#printBtn"),
  refreshTransportBtn: document.querySelector("#refreshTransportBtn"),
  printPreviewModal: document.querySelector("#printPreviewModal"),
  printPreviewBody: document.querySelector("#printPreviewBody"),
  previewPrintBtn: document.querySelector("#previewPrintBtn"),
  previewCloseBtn: document.querySelector("#previewCloseBtn"),
  applyBtn: document.querySelector("#applyBtn"),
  csvBtn: document.querySelector("#csvBtn"),
  clearDate: document.querySelector("#clearDate"),
  clearPr: document.querySelector("#clearPr"),
  clearTk: document.querySelector("#clearTk"),
  clearNote: document.querySelector("#clearNote"),
  addClearRow: document.querySelector("#addClearRow"),
  clearTable: document.querySelector("#clearTable"),
};

const nf = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const tonNf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const moneyNf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CULTIVATE_API_BASE = window.__CULTIVATE_API_BASE__ || "http://127.0.0.1:8080/api/cultivate.php";
const TRANSPORT_REFRESH_API = window.__TRANSPORT_REFRESH_API__ || CULTIVATE_API_BASE.replace(/cultivate\.php.*$/, "transport_refresh.php");
const EST_DATA_URL = window.__EST_DATA_URL__ || "./data/est_data.json";
const EST_MASTER_API = window.__EST_MASTER_API__ || "/api/est-master";
const MASTER_FOLDER_DATA_URL = window.__MASTER_FOLDER_DATA_URL__ || "./data/master_data_full.json";
const DAILY_HEADERS = [
  "วันที่",
  "เวลา",
  "กลุ่ม",
  "กอง / รายการ",
  "เอกสาร/ใบชั่ง",
  "มาตรฐาน/ประเภท",
  "ผู้ส่ง",
  "ทะเบียน",
  "คนขับ",
  "โรงงาน",
  "ปลายราง (RSPO)",
  "ปลายราง (NON-RSPO)",
  "ตะกุก (RSPO)",
  "ตะกุก (NON-RSPO)",
  "รวม",
  "น้ำหนักปลายทางโรงงาน",
  "น้ำหนักเทียบปลายทาง",
];

const PALM_MENU = {
  "palm-overview": {
    title: "ภาพรวมงานจัดการสวนปาล์ม",
    subtitle: "รวมโครงสร้างงานจากระบบ SPC Cultivate และรายงาน Superset เพื่อจัดเป็นเมนูใช้งานในหน้า RSPO Ramp",
    accent: "Dashboard",
    steps: ["ดูสถานะงานสวน", "ติดตามแผนเทียบผลงานจริง", "ดูผลผลิตตามแปลง", "ดูแผนที่และข้อมูลบล็อก"],
    sources: ["Superset: 01 - OPERATIONS - WORK ORDER WORKFLOWS", "Superset: 02 - Harvest", "/web/maps", "/web/reporting"],
    tables: ["terrains", "work_orders", "daily_entries", "harvest_records", "inventory_movements"],
  },
  "palm-work": {
    title: "การทำงานสวนปาล์ม",
    subtitle: "หน้าติดตามงานจากแผน ประเมินกำหนดการ และผลทำงานจริง พร้อมค้นหาตามงาน เวลา พื้นที่ และกลุ่มทำงาน",
    accent: "Plan → Schedule → Work",
    steps: ["เลือกงานที่ต้องการติดตาม", "กำหนดช่วงวันที่ทำงาน", "เลือกพื้นที่หรือบล็อก", "เลือกกลุ่มทำงาน", "ตรวจผลจริงเทียบแผนประเมิน"],
    sources: ["/web/planner_workbench", "/web/scheduler_workbench", "/web/dailyEntry", "Superset: 01 - OPERATIONS - WORK ORDER WORKFLOWS"],
    tables: ["cultivate_work_orders", "cultivate_schedule", "cultivate_daily_entries", "cultivate_terrains", "cultivate_activity_groups"],
  },
  "palm-plan": {
    title: "แผนงานและใบงาน",
    subtitle: "สร้างแผนงานสวน จัดตาราง แจกใบงาน และควบคุมสถานะ Planned / Scheduled / Executed",
    accent: "Plan & Schedule",
    steps: ["เลือก Plan และ Crop Phase", "เลือกกิจกรรมและแปลง", "กำหนดแรงงาน วัสดุ อุปกรณ์", "สร้างและจัดตาราง Work Order", "พิมพ์ใบงานและส่งอนุมัติ"],
    sources: ["/web/planner_workbench", "/web/scheduler_workbench", "/web/workOrderPrintOut", "/web/approvalInbox"],
    tables: ["plans", "work_orders", "work_order_terrains", "activities", "contracts"],
  },
  "palm-daily": {
    title: "บันทึกงานประจำวัน",
    subtitle: "รับผลปฏิบัติงานจริงจากใบงานหรือ QR แล้วนำไปปิดงาน คำนวณต้นทุน และส่งต่อค่าแรง",
    accent: "Daily Entries",
    steps: ["ค้นหาหรือสแกนใบงาน", "กรอง Type / Activity / Terrain / Estate / Contract", "บันทึกปริมาณงาน คนงาน วัสดุ หมายเหตุ", "เปลี่ยนสถานะ Open / Closed"],
    sources: ["/web/dailyEntry", "Superset: Daily Entry Record"],
    tables: ["daily_entries", "work_orders", "partners", "terrains", "employee_allowance_deductions"],
  },
  "palm-harvest": {
    title: "เก็บเกี่ยวและชั่งน้ำหนัก",
    subtitle: "เชื่อมงานเก็บเกี่ยว AG08 กับตั๋วชั่ง เพื่อดูน้ำหนัก ผลผลิต และ ABW ตามบล็อก/แปลง",
    accent: "Harvest / Weighbridge",
    steps: ["สร้างใบงานเก็บเกี่ยว", "บันทึกผลเก็บเกี่ยวรายวัน", "นำเข้าไฟล์เครื่องชั่ง", "ตรวจ matched / unmatched ticket", "สรุปผลผลิตรายบล็อกและรายรุ่นปี"],
    sources: ["/web/weighbridge", "Reporting 18 - FFB Block Yield", "Reporting 19 - FFB Block Yield Totals", "Superset: 02 - Harvest"],
    tables: ["harvest_records", "weighbridge_tickets", "weighbridges", "terrains", "partners"],
  },
  "palm-inventory": {
    title: "คลังและสต๊อกสวน",
    subtitle: "ควบคุมรับเข้า ส่งออก โอนคลัง ตรวจนับ และวัสดุตามแปลง",
    accent: "Stock Management",
    steps: ["Good Receipt รับเข้า", "Good Issue / Good Delivery เบิกใช้หรือส่งออก", "Transfer โอนคลัง", "Stock Take ตรวจนับ", "วิเคราะห์ Material Management"],
    sources: ["/web/stockManagement", "/web/materials_master", "/web/warehouseMaster", "/web/terrain-materials", "Reporting 9 - Material Management Report"],
    tables: ["materials", "material_groups", "warehouses", "stock_balances", "inventory_movements", "stock_takes"],
  },
  "palm-payroll": {
    title: "ค่าแรงและผู้รับเหมา",
    subtitle: "จัดการ partner, gang, contract, allowance/deduction และรอบค่าแรง",
    accent: "Cheque-roll",
    steps: ["กำหนดกลุ่มค่าแรง", "ผูกพนักงาน/คู่ค้า/ผู้รับเหมา", "ตั้งสัญญาตามแปลงและกิจกรรม", "รวมผลงานตาม period", "เพิ่ม allowance/deduction และอนุมัติ"],
    sources: ["/web/checkroll_console", "/web/employeead", "/web/chequeroll_groups", "/web/partnersMaster", "/web/master_contracts"],
    tables: ["partners", "contracts", "contract_terrains", "contract_activities", "checkroll_periods", "employee_allowance_deductions"],
  },
  "palm-master": {
    title: "ข้อมูลหลักสวน",
    subtitle: "ฐานข้อมูลตั้งต้นสำหรับแปลง กิจกรรม วัสดุ คลัง เครื่องชั่ง และสิทธิ์การมองเห็นข้อมูล",
    accent: "Master Data",
    steps: ["สร้าง Estate / Datagroup", "สร้าง Terrain hierarchy", "สร้าง Activity Group / Activity", "สร้าง Material / Warehouse / Weighbridge", "ผูกวัสดุตามแปลงและอัตราใช้"],
    sources: ["/web/terrains_master", "/web/activityGroups", "/web/activities_master", "/web/materials_master", "/web/weighbridgeMaster"],
    tables: ["companies", "estates", "datagroups", "terrains", "activity_groups", "activities", "terrain_materials"],
  },
  "palm-report": {
    title: "รายงานสวนปาล์ม",
    subtitle: "รายงานผลผลิต ต้นทุน งานสวน สต๊อก และข้อมูล ramp ที่เกี่ยวข้องกับการขนส่งออก",
    accent: "Reports",
    steps: ["Terrains Master List", "FFB Block Yield", "Oil Palm Crop Statement", "Stock Inventory Report", "Ramp Inbound / Outbound", "Harvest Incentives"],
    sources: ["Reporting 1", "Reporting 18/19", "Reporting 22", "Reporting 23", "Reporting 30/31"],
    tables: ["vw_daily_harvest_by_block", "vw_stock_balance_by_material", "harvest_records", "inventory_movements", "weighbridge_tickets"],
  },
};

const PALM_DB_GROUPS = [
  ["Master org", "companies, estates, datagroups"],
  ["Terrain", "terrains, terrain_materials"],
  ["Operation", "activity_groups, activities, plans, work_orders"],
  ["Execution", "daily_entries, work_order_terrains"],
  ["Harvest", "harvest_records, weighbridge_tickets"],
  ["Inventory", "materials, warehouses, stock_balances, inventory_movements"],
  ["Payroll", "partners, contracts, checkroll_periods"],
  ["Reports", "vw_daily_harvest_by_block, vw_stock_balance_by_material"],
];

function fallbackCultivateMenu() {
  return {
    source: { system: "SPC Cultivate", mode: "fallback" },
    menuGroup: "งานจัดการสวนปาล์ม",
    modules: Object.entries(PALM_MENU).map(([id, item]) => ({
      id,
      title: item.title,
      pageTitle: item.title,
      ...item,
    })),
    cultivateGroups: [],
    databaseGroups: PALM_DB_GROUPS,
  };
}

function normalizeCultivateMenu(menu) {
  const fallback = fallbackCultivateMenu();
  const modules = Array.isArray(menu?.modules) && menu.modules.length ? menu.modules : fallback.modules;
  return {
    source: menu?.source || fallback.source,
    menuGroup: menu?.menuGroup || fallback.menuGroup,
    modules: modules.map((module) => ({
      id: module.id,
      title: module.title || module.pageTitle || module.id,
      pageTitle: module.pageTitle || module.title || module.id,
      accent: module.accent || "",
      subtitle: module.subtitle || "",
      sources: Array.isArray(module.sources) ? module.sources : [],
      steps: Array.isArray(module.steps) ? module.steps : [],
      tables: Array.isArray(module.tables) ? module.tables : [],
    })).filter((module) => module.id),
    cultivateGroups: Array.isArray(menu?.cultivateGroups) ? menu.cultivateGroups : fallback.cultivateGroups,
    databaseGroups: Array.isArray(menu?.databaseGroups) ? menu.databaseGroups : fallback.databaseGroups,
  };
}

function palmMenuModules() {
  return state.cultivateMenu?.modules || fallbackCultivateMenu().modules;
}

function palmMenuMap() {
  return Object.fromEntries(palmMenuModules().map((module) => [module.id, module]));
}

function palmDatabaseGroups() {
  return state.cultivateMenu?.databaseGroups || PALM_DB_GROUPS;
}

function cultivateGroups() {
  return state.cultivateMenu?.cultivateGroups || [];
}

const PALM_MENU_ICONS = ["◇", "◷", "▤", "◫", "◉", "▣", "฿", "⌘", "↗", "◆", "●"];

const FARM_ROLES = [
  "super_admin",
  "director",
  "estate_manager",
  "supervisor",
  "store_officer",
  "fuel_officer",
  "accounting",
  "auditor",
  "viewer",
];

const FARM_ROLE_PERMISSIONS = {
  super_admin: ["read", "create", "update", "delete", "approve", "export"],
  director: ["read", "create", "update", "approve", "export"],
  estate_manager: ["read", "create", "update", "export"],
  supervisor: ["read", "create", "update"],
  store_officer: ["read", "create", "update", "export"],
  fuel_officer: ["read", "create", "update", "export"],
  accounting: ["read", "update", "approve", "export"],
  auditor: ["read", "approve", "export"],
  viewer: ["read", "export"],
};

const FARM_MODULES = [
  {
    id: "farm-area",
    title: "ข้อมูลพื้นที่",
    group: "Master Data",
    accent: "Estate → Zone → Plot",
    description: "จัดการ Estate, Zone, Plot / Block และ Plot Group พร้อมคำนวณอายุปาล์ม จำนวนต้นต่อไร่ และสถานะผลผลิต",
    tables: ["estates", "zones", "plots", "plot_groups"],
    fields: [
      ["code", "รหัสพื้นที่", "PLT-001"],
      ["name", "ชื่อพื้นที่ / แปลง", "แปลงตัวอย่าง 01"],
      ["estate", "Estate", "SPC Estate"],
      ["zone", "Zone", "Zone A"],
      ["areaRai", "พื้นที่ไร่", "120"],
      ["plantingYear", "ปีปลูก", "2562"],
      ["treeCount", "จำนวนต้น", "2640"],
      ["rspoStatus", "RSPO", "RSPO"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "PLT-001", name: "แปลงตัวอย่าง 01", estate: "SPC Estate", zone: "Zone A", areaRai: "120", plantingYear: "2562", treeCount: "2640", rspoStatus: "RSPO", status: "active" },
      { code: "GRP-RSPO", name: "กลุ่มแปลง RSPO", estate: "SPC Estate", zone: "ทุกโซน", areaRai: "420", plantingYear: "-", treeCount: "9240", rspoStatus: "RSPO", status: "active" },
    ],
  },
  {
    id: "farm-people",
    title: "ข้อมูลพนักงาน / ผู้รับเหมา",
    group: "Master Data",
    accent: "Employees / Contractors / Teams",
    description: "จัดการพนักงาน ผู้รับเหมา ทีม สมาชิกทีม และทักษะตามกิจกรรม โดยเก็บประวัติการย้ายทีม",
    tables: ["employees", "contractors", "teams", "team_members", "team_activity_skills"],
    fields: [
      ["code", "รหัส", "EMP-001"],
      ["name", "ชื่อ", "หัวหน้าทีมตัวอย่าง"],
      ["type", "ประเภท", "supervisor"],
      ["team", "ทีม", "ทีมตัดปาล์ม A"],
      ["role", "บทบาท", "supervisor"],
      ["dailyWage", "ค่าแรง", "450"],
      ["phone", "เบอร์โทร", ""],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "EMP-001", name: "หัวหน้าทีมตัวอย่าง", type: "supervisor", team: "ทีมตัดปาล์ม A", role: "supervisor", dailyWage: "650", phone: "", status: "active" },
      { code: "CON-001", name: "ผู้รับเหมางานเก็บเกี่ยว", type: "harvest_contractor", team: "ผู้รับเหมา", role: "contractor", dailyWage: "0", phone: "", status: "active" },
    ],
  },
  {
    id: "farm-activities",
    title: "ข้อมูลกิจกรรม",
    group: "Master Data",
    accent: "Activity + Material Usage + Survey",
    description: "จัดการกลุ่มกิจกรรม กิจกรรม อัตราใช้วัสดุตามกิจกรรม และแบบประเมินประสิทธิภาพ",
    tables: ["activity_groups", "activities", "activity_material_usage_rates", "survey_templates", "survey_questions"],
    fields: [
      ["code", "รหัสกิจกรรม", "ACT-001"],
      ["name", "กิจกรรม", "ใส่ปุ๋ย"],
      ["group", "กลุ่มกิจกรรม", "ใส่ปุ๋ย"],
      ["unit", "หน่วยงาน", "ไร่"],
      ["material", "วัสดุหลัก", "ปุ๋ย"],
      ["usageRate", "อัตราใช้", "2"],
      ["usageBasis", "ฐานคำนวณ", "per_tree"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "ACT-001", name: "ใส่ปุ๋ย", group: "ใส่ปุ๋ย", unit: "ต้น", material: "ปุ๋ย", usageRate: "2", usageBasis: "per_tree", status: "active" },
      { code: "ACT-002", name: "ตัดปาล์ม", group: "เก็บเกี่ยว", unit: "ตัน", material: "-", usageRate: "0", usageBasis: "per_work_order", status: "active" },
    ],
  },
  {
    id: "farm-work",
    title: "ระบบทำงาน",
    group: "Operation",
    accent: "Plan → Work Order → Daily Record",
    description: "วางแผน สั่งงาน อนุมัติ QR Code Work Order เช็คอิน GPS และบันทึกประจำวันผ่านมือถือ",
    tables: ["annual_work_plans", "planned_work_items", "planned_work_materials", "work_orders", "work_order_workers", "work_order_materials", "work_order_qr_codes", "work_attendance", "work_results"],
    fields: [
      ["code", "เลขที่งาน", "WO-2569-001"],
      ["name", "ชื่องาน", "ใส่ปุ๋ยแปลง PLT-001"],
      ["plot", "แปลง", "PLT-001"],
      ["activity", "กิจกรรม", "ใส่ปุ๋ย"],
      ["team", "ทีม", "ทีมตัดปาล์ม A"],
      ["scheduledDate", "วันที่", "2026-01-15"],
      ["status", "สถานะ", "draft"],
    ],
    seed: [
      { code: "PLAN-2569-001", name: "แผนใส่ปุ๋ยไตรมาส 1", plot: "PLT-001", activity: "ใส่ปุ๋ย", team: "ทีมสวน A", scheduledDate: "2026-01-15", status: "planned" },
      { code: "WO-2569-001", name: "ใบสั่งงานตัดปาล์ม", plot: "PLT-001", activity: "ตัดปาล์ม", team: "ทีมตัดปาล์ม A", scheduledDate: "2026-01-20", status: "sent_to_mobile" },
    ],
  },
  {
    id: "farm-inventory",
    title: "พัสดุ / อุปกรณ์",
    group: "Inventory",
    accent: "Stock Transactions",
    description: "รับพัสดุ จ่ายพัสดุ คืนพัสดุ โอนย้าย ปรับยอด ตรวจนับ แปลง SKU รถ เครื่องจักร และน้ำมัน",
    tables: ["materials", "material_categories", "units", "warehouses", "goods_receipts", "goods_issues", "goods_returns", "stock_transactions", "stock_balances", "vehicles", "fuel_requisitions"],
    fields: [
      ["code", "รหัส", "MAT-001"],
      ["name", "รายการ", "ปุ๋ย 25kg"],
      ["category", "หมวด", "ปุ๋ย"],
      ["warehouse", "คลัง", "คลังกลาง"],
      ["quantity", "จำนวน", "100"],
      ["unit", "หน่วย", "กระสอบ"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "MAT-001", name: "ปุ๋ย 25kg", category: "ปุ๋ย", warehouse: "คลังกลาง", quantity: "100", unit: "กระสอบ", status: "active" },
      { code: "FUEL-001", name: "น้ำมันดีเซล", category: "น้ำมัน", warehouse: "ถังน้ำมันหลัก", quantity: "5000", unit: "ลิตร", status: "active" },
    ],
  },
  {
    id: "farm-payroll",
    title: "ระบบคำนวณค่าแรง",
    group: "Payroll",
    accent: "Rate / OT / Deduction / Allowance",
    description: "คำนวณค่าแรงจาก work_results, OT, เงินหัก, เงินเพิ่ม, งวดค่าแรง และปิดงวด",
    tables: ["payroll_periods", "payroll_period_lines", "payroll_rates", "overtime_rules", "payroll_overtime_records", "deduction_types", "payroll_deductions", "allowance_types", "payroll_allowances"],
    fields: [
      ["code", "งวด/รหัส", "PAY-2569-01"],
      ["name", "รายการ", "งวดค่าแรงมกราคม"],
      ["employee", "พนักงาน/ผู้รับเหมา", "EMP-001"],
      ["method", "วิธีคำนวณ", "daily"],
      ["amount", "ยอดเงิน", "0"],
      ["status", "สถานะ", "open"],
    ],
    seed: [
      { code: "PAY-2569-01", name: "งวดค่าแรงมกราคม", employee: "EMP-001", method: "daily", amount: "0", status: "open" },
      { code: "DED-LATE", name: "มาสาย", employee: "-", method: "deduction", amount: "50", status: "active" },
    ],
  },
  {
    id: "farm-budget",
    title: "อัตรางบประมาณ",
    group: "Budget",
    accent: "Budget Rates / Contractor Estimate",
    description: "ตั้ง budget rates ตาม Estate, Activity, Plot Group, Material และประมาณผลงานผู้รับเหมาเป็นงวด",
    tables: ["budget_rates", "contractor_period_estimates", "cost_entries"],
    fields: [
      ["code", "รหัสอัตรา", "BUD-001"],
      ["name", "ชื่ออัตรา", "ค่าแรงใส่ปุ๋ย"],
      ["estate", "Estate", "SPC Estate"],
      ["activity", "กิจกรรม", "ใส่ปุ๋ย"],
      ["budgetType", "ประเภท", "labor"],
      ["unit", "หน่วย", "ไร่"],
      ["rate", "อัตรา", "250"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "BUD-001", name: "ค่าแรงใส่ปุ๋ย", estate: "SPC Estate", activity: "ใส่ปุ๋ย", budgetType: "labor", unit: "ไร่", rate: "250", status: "active" },
      { code: "BUD-002", name: "ค่าวัสดุปุ๋ย", estate: "SPC Estate", activity: "ใส่ปุ๋ย", budgetType: "material", unit: "กก.", rate: "18", status: "active" },
    ],
  },
  {
    id: "farm-general",
    title: "ข้อมูลทั่วไป",
    group: "System",
    accent: "Users / Permissions / Settings / Audit",
    description: "จัดการผู้ใช้ Supabase Auth, สิทธิ์, access scope, system settings, attachments และ audit log",
    tables: ["profiles", "permissions", "role_permissions", "user_access_scopes", "system_settings", "attachments", "audit_logs"],
    fields: [
      ["code", "รหัส", "PERM-001"],
      ["name", "ชื่อรายการ", "work_orders.approve"],
      ["module", "Module", "work_orders"],
      ["action", "Action", "approve"],
      ["role", "Role", "director"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "PERM-001", name: "อนุมัติใบสั่งงาน", module: "work_orders", action: "approve", role: "director", status: "active" },
      { code: "SET-001", name: "ค่าเริ่มต้น GPS radius", module: "system", action: "settings", role: "super_admin", status: "active" },
    ],
  },
  {
    id: "farm-reports",
    title: "รายงาน",
    group: "Reports",
    accent: "Excel / PDF / Print",
    description: "ศูนย์รวมรายงานพื้นที่ พนักงาน กิจกรรม แผน ใบสั่งงาน บันทึกประจำวัน พัสดุ ค่าแรง งบประมาณ Survey และ Audit Log",
    tables: ["report_exports", "cost_entries", "audit_logs"],
    fields: [
      ["code", "รหัสรายงาน", "RPT-001"],
      ["name", "ชื่อรายงาน", "รายงานแผนงาน"],
      ["module", "Module", "planning"],
      ["filter", "ตัวกรองหลัก", "วันที่ / Estate / Activity"],
      ["format", "Format", "Excel/PDF"],
      ["status", "สถานะ", "ready"],
    ],
    seed: [
      { code: "RPT-001", name: "รายงานแผนงาน", module: "planning", filter: "วันที่ / Estate / Activity", format: "Excel/PDF", status: "ready" },
      { code: "RPT-002", name: "รายงานค่าแรงรายงวด", module: "payroll", filter: "งวด / ทีม / พนักงาน", format: "Excel/PDF", status: "ready" },
    ],
  },
];

const F = (key, label, options = {}) => ({ key, label, ...options });

const FARM_TABLE_SCHEMAS = {
  estates: {
    moduleId: "farm-area",
    title: "Estate / บริษัท / สวน",
    primaryKey: "id",
    codeField: "estate_code",
    labelField: "estate_name",
    fields: [
      F("estate_code", "รหัส Estate", { required: true }),
      F("estate_name", "ชื่อ Estate", { required: true }),
      F("company_name", "บริษัท"),
      F("manager_id", "ผู้จัดการ", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "estate-spc", estate_code: "SPC", estate_name: "SPC Estate", company_name: "SPC", status: "active" },
    ],
  },
  zones: {
    moduleId: "farm-area",
    title: "โซน",
    primaryKey: "id",
    codeField: "zone_code",
    labelField: "zone_name",
    fields: [
      F("estate_id", "Estate", { references: "estates", required: true }),
      F("zone_code", "รหัสโซน", { required: true }),
      F("zone_name", "ชื่อโซน", { required: true }),
      F("supervisor_id", "หัวหน้าโซน", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "zone-north", estate_id: "estate-spc", zone_code: "N", zone_name: "โซนบน", status: "active" },
      { id: "zone-south", estate_id: "estate-spc", zone_code: "S", zone_name: "โซนล่าง", status: "active" },
    ],
  },
  plots: {
    moduleId: "farm-area",
    title: "แปลง / บล็อก",
    primaryKey: "id",
    codeField: "plot_code",
    labelField: "plot_name",
    fields: [
      F("estate_id", "Estate", { references: "estates", required: true }),
      F("zone_id", "โซน", { references: "zones", required: true }),
      F("plot_code", "รหัสแปลง", { required: true }),
      F("plot_name", "ชื่อแปลง"),
      F("area_rai", "พื้นที่ไร่", { type: "number" }),
      F("planting_year", "ปีปลูก", { type: "number" }),
      F("tree_count", "จำนวนต้น", { type: "number" }),
      F("rspo_status", "RSPO", { options: ["RSPO", "Non-RSPO"] }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "plot-plt001", estate_id: "estate-spc", zone_id: "zone-north", plot_code: "PLT-001", plot_name: "แปลงตัวอย่าง 01", area_rai: "120", planting_year: "2562", tree_count: "2640", rspo_status: "RSPO", status: "active" },
      { id: "plot-plt002", estate_id: "estate-spc", zone_id: "zone-south", plot_code: "PLT-002", plot_name: "แปลงตัวอย่าง 02", area_rai: "95", planting_year: "2564", tree_count: "2090", rspo_status: "Non-RSPO", status: "active" },
    ],
  },
  plot_groups: {
    moduleId: "farm-area",
    title: "กลุ่มแปลง",
    primaryKey: "id",
    codeField: "group_code",
    labelField: "group_name",
    fields: [
      F("group_code", "รหัสกลุ่มแปลง", { required: true }),
      F("group_name", "ชื่อกลุ่มแปลง", { required: true }),
      F("group_type", "ประเภทกลุ่ม", { options: ["RSPO", "Zone", "Harvest", "Budget", "Custom"] }),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [
      { id: "plot-group-rspo", group_code: "GRP-RSPO", group_name: "กลุ่มแปลง RSPO", group_type: "RSPO", status: "active" },
    ],
  },
  employees: {
    moduleId: "farm-people",
    title: "พนักงาน",
    primaryKey: "id",
    codeField: "employee_code",
    labelField: "full_name",
    fields: [
      F("employee_code", "รหัสพนักงาน", { required: true }),
      F("full_name", "ชื่อ-สกุล", { required: true }),
      F("position", "ตำแหน่ง"),
      F("default_role", "Role", { options: FARM_ROLES }),
      F("daily_wage", "ค่าแรงรายวัน", { type: "number" }),
      F("phone", "เบอร์โทร"),
      F("start_date", "เริ่มงาน", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "emp-001", employee_code: "EMP-001", full_name: "หัวหน้าทีมตัวอย่าง", position: "Supervisor", default_role: "supervisor", daily_wage: "650", status: "active" },
      { id: "emp-002", employee_code: "EMP-002", full_name: "คนงานตัวอย่าง", position: "Worker", default_role: "viewer", daily_wage: "450", status: "active" },
    ],
  },
  contractors: {
    moduleId: "farm-people",
    title: "ผู้รับเหมา",
    primaryKey: "id",
    codeField: "contractor_code",
    labelField: "contractor_name",
    fields: [
      F("contractor_code", "รหัสผู้รับเหมา", { required: true }),
      F("contractor_name", "ชื่อผู้รับเหมา", { required: true }),
      F("contractor_type", "ประเภท"),
      F("default_activity_group_id", "กลุ่มกิจกรรมหลัก", { references: "activity_groups" }),
      F("contact_person", "ผู้ติดต่อ"),
      F("phone", "เบอร์โทร"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "con-001", contractor_code: "CON-001", contractor_name: "ผู้รับเหมางานเก็บเกี่ยว", contractor_type: "harvest", status: "active" },
    ],
  },
  teams: {
    moduleId: "farm-people",
    title: "ทีมงาน",
    primaryKey: "id",
    codeField: "team_code",
    labelField: "team_name",
    fields: [
      F("team_code", "รหัสทีม", { required: true }),
      F("team_name", "ชื่อทีม", { required: true }),
      F("team_type", "ประเภททีม", { options: ["worker", "contractor", "driver", "store", "supervisor"] }),
      F("supervisor_employee_id", "หัวหน้าทีม", { references: "employees" }),
      F("contractor_id", "ผู้รับเหมา", { references: "contractors" }),
      F("default_activity_group_id", "กลุ่มกิจกรรมหลัก", { references: "activity_groups" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "team-a", team_code: "TEAM-A", team_name: "ทีมสวน A", team_type: "worker", supervisor_employee_id: "emp-001", status: "active" },
    ],
  },
  team_members: {
    moduleId: "farm-people",
    title: "สมาชิกทีม",
    primaryKey: "id",
    codeField: "member_role",
    labelField: "employee_id",
    fields: [
      F("team_id", "ทีม", { references: "teams", required: true }),
      F("employee_id", "พนักงาน", { references: "employees", required: true }),
      F("member_role", "หน้าที่ในทีม"),
      F("start_date", "วันที่เริ่ม", { type: "date" }),
      F("end_date", "วันที่สิ้นสุด", { type: "date" }),
      F("is_active", "ใช้งาน", { type: "boolean" }),
    ],
    seed: [
      { id: "team-member-001", team_id: "team-a", employee_id: "emp-001", member_role: "หัวหน้าทีม", is_active: "true" },
      { id: "team-member-002", team_id: "team-a", employee_id: "emp-002", member_role: "คนงาน", is_active: "true" },
    ],
  },
  team_activity_skills: {
    moduleId: "farm-people",
    title: "ทักษะทีมตามกิจกรรม",
    primaryKey: "id",
    codeField: "skill_level",
    labelField: "team_id",
    fields: [
      F("team_id", "ทีม", { references: "teams", required: true }),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("skill_level", "ระดับทักษะ", { options: ["basic", "standard", "expert"] }),
      F("rate_group", "กลุ่มเรท"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  activity_groups: {
    moduleId: "farm-activities",
    title: "กลุ่มกิจกรรม",
    primaryKey: "id",
    codeField: "group_code",
    labelField: "group_name",
    fields: [
      F("group_code", "รหัสกลุ่มกิจกรรม", { required: true }),
      F("group_name", "ชื่อกลุ่มกิจกรรม", { required: true }),
      F("description", "รายละเอียด"),
      F("sort_order", "ลำดับ", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "act-group-fertilizer", group_code: "AG01", group_name: "การใส่ปุ๋ย", sort_order: "1", status: "active" },
      { id: "act-group-harvest", group_code: "AG08", group_name: "การเก็บเกี่ยว", sort_order: "8", status: "active" },
    ],
  },
  activities: {
    moduleId: "farm-activities",
    title: "กิจกรรม",
    primaryKey: "id",
    codeField: "activity_code",
    labelField: "activity_name",
    fields: [
      F("activity_group_id", "กลุ่มกิจกรรม", { references: "activity_groups", required: true }),
      F("activity_code", "รหัสกิจกรรม", { required: true }),
      F("activity_name", "ชื่อกิจกรรม", { required: true }),
      F("default_unit", "หน่วยงาน"),
      F("work_type", "ประเภทงาน"),
      F("require_material", "ใช้วัสดุ", { type: "boolean" }),
      F("allow_mobile_record", "บันทึกผ่านมือถือ", { type: "boolean" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "activity-fertilizer", activity_group_id: "act-group-fertilizer", activity_code: "AG01-01", activity_name: "ใส่ปุ๋ย", default_unit: "ต้น", work_type: "maintenance", require_material: "true", allow_mobile_record: "true", status: "active" },
      { id: "activity-harvest", activity_group_id: "act-group-harvest", activity_code: "AG08-01", activity_name: "ตัดปาล์ม", default_unit: "ตัน", work_type: "harvest", require_material: "false", allow_mobile_record: "true", status: "active" },
    ],
  },
  material_categories: {
    moduleId: "farm-inventory",
    title: "หมวดวัสดุ",
    primaryKey: "id",
    codeField: "category_code",
    labelField: "category_name",
    fields: [F("category_code", "รหัสหมวด", { required: true }), F("category_name", "ชื่อหมวด", { required: true }), F("status", "สถานะ", { type: "status" })],
    seed: [
      { id: "mat-cat-fertilizer", category_code: "FERT", category_name: "ปุ๋ย", status: "active" },
      { id: "mat-cat-fuel", category_code: "FUEL", category_name: "น้ำมัน", status: "active" },
    ],
  },
  units: {
    moduleId: "farm-inventory",
    title: "หน่วยนับ",
    primaryKey: "id",
    codeField: "unit_code",
    labelField: "unit_name",
    fields: [F("unit_code", "รหัสหน่วย", { required: true }), F("unit_name", "ชื่อหน่วย", { required: true }), F("base_unit", "หน่วยฐาน"), F("conversion_rate", "อัตราแปลง", { type: "number" }), F("status", "สถานะ", { type: "status" })],
    seed: [
      { id: "unit-kg", unit_code: "KG", unit_name: "กิโลกรัม", base_unit: "KG", conversion_rate: "1", status: "active" },
      { id: "unit-bag", unit_code: "BAG", unit_name: "กระสอบ", base_unit: "KG", conversion_rate: "25", status: "active" },
      { id: "unit-liter", unit_code: "L", unit_name: "ลิตร", base_unit: "L", conversion_rate: "1", status: "active" },
    ],
  },
  materials: {
    moduleId: "farm-inventory",
    title: "วัสดุ / อุปกรณ์",
    primaryKey: "id",
    codeField: "material_code",
    labelField: "material_name",
    fields: [
      F("material_code", "รหัสวัสดุ", { required: true }),
      F("material_name", "ชื่อวัสดุ", { required: true }),
      F("category_id", "หมวดวัสดุ", { references: "material_categories" }),
      F("base_unit_id", "หน่วยฐาน", { references: "units" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "material-fert-25", material_code: "MAT-001", material_name: "ปุ๋ย 25kg", category_id: "mat-cat-fertilizer", base_unit_id: "unit-bag", status: "active" },
      { id: "material-diesel", material_code: "FUEL-001", material_name: "น้ำมันดีเซล", category_id: "mat-cat-fuel", base_unit_id: "unit-liter", status: "active" },
    ],
  },
  activity_material_usage_rates: {
    moduleId: "farm-activities",
    title: "อัตราใช้วัสดุตามกิจกรรม",
    primaryKey: "id",
    codeField: "usage_basis",
    labelField: "activity_id",
    fields: [
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("usage_basis", "ฐานคำนวณ", { options: ["per_tree", "per_rai", "per_work_order", "per_ton"] }),
      F("usage_rate", "อัตราใช้", { type: "number", required: true }),
      F("usage_unit", "หน่วยใช้"),
      F("effective_start_date", "เริ่มใช้", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "usage-fert-tree", activity_id: "activity-fertilizer", material_id: "material-fert-25", usage_basis: "per_tree", usage_rate: "2", usage_unit: "kg", status: "active" },
    ],
  },
  survey_templates: {
    moduleId: "farm-activities",
    title: "แบบประเมิน",
    primaryKey: "id",
    codeField: "template_code",
    labelField: "template_name",
    fields: [
      F("template_code", "รหัสแบบประเมิน", { required: true }),
      F("template_name", "ชื่อแบบประเมิน", { required: true }),
      F("activity_id", "กิจกรรม", { references: "activities" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  survey_questions: {
    moduleId: "farm-activities",
    title: "คำถามประเมิน",
    primaryKey: "id",
    codeField: "question_code",
    labelField: "question_text",
    fields: [
      F("template_id", "แบบประเมิน", { references: "survey_templates", required: true }),
      F("question_code", "รหัสคำถาม", { required: true }),
      F("question_text", "คำถาม", { required: true }),
      F("answer_type", "ชนิดคำตอบ", { options: ["number", "text", "yes_no", "choice"] }),
      F("required", "จำเป็น", { type: "boolean" }),
      F("sort_order", "ลำดับ", { type: "number" }),
    ],
    seed: [],
  },
  annual_work_plans: {
    moduleId: "farm-work",
    title: "แผนงานรายปี",
    primaryKey: "id",
    codeField: "plan_year",
    labelField: "plan_name",
    fields: [
      F("plan_year", "ปีแผน", { type: "number", required: true }),
      F("estate_id", "Estate", { references: "estates", required: true }),
      F("plan_name", "ชื่อแผน", { required: true }),
      F("created_by", "ผู้สร้าง", { references: "profiles" }),
      F("approved_by", "ผู้อนุมัติ", { references: "profiles" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "plan-2569", plan_year: "2569", estate_id: "estate-spc", plan_name: "แผนงานสวนปาล์ม 2569", status: "draft" },
    ],
  },
  planned_work_items: {
    moduleId: "farm-work",
    title: "รายการแผนงาน",
    primaryKey: "id",
    codeField: "planned_month",
    labelField: "activity_id",
    fields: [
      F("annual_plan_id", "แผนรายปี", { references: "annual_work_plans", required: true }),
      F("plot_id", "แปลง", { references: "plots", required: true }),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("planned_month", "เดือนแผน", { type: "number" }),
      F("planned_quantity", "ปริมาณแผน", { type: "number" }),
      F("unit", "หน่วย"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "plan-item-001", annual_plan_id: "plan-2569", plot_id: "plot-plt001", activity_id: "activity-fertilizer", planned_month: "1", planned_quantity: "2640", unit: "ต้น", status: "planned" },
    ],
  },
  planned_work_materials: {
    moduleId: "farm-work",
    title: "วัสดุตามแผนงาน",
    primaryKey: "id",
    codeField: "planned_quantity",
    labelField: "material_id",
    fields: [
      F("planned_work_item_id", "รายการแผนงาน", { references: "planned_work_items", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("planned_quantity", "ปริมาณแผน", { type: "number" }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  work_orders: {
    moduleId: "farm-work",
    title: "ใบสั่งงาน",
    primaryKey: "id",
    codeField: "work_order_no",
    labelField: "work_order_title",
    fields: [
      F("planned_work_item_id", "รายการแผนงาน", { references: "planned_work_items" }),
      F("work_order_no", "เลขที่ WO", { required: true }),
      F("work_order_title", "ชื่องาน", { required: true }),
      F("plot_id", "แปลง", { references: "plots", required: true }),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("team_id", "ทีม", { references: "teams" }),
      F("scheduled_date", "วันที่ทำงาน", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "wo-001", planned_work_item_id: "plan-item-001", work_order_no: "WO-2569-001", work_order_title: "ใส่ปุ๋ยแปลง PLT-001", plot_id: "plot-plt001", activity_id: "activity-fertilizer", team_id: "team-a", scheduled_date: "2026-01-15", status: "sent_to_mobile" },
    ],
  },
  work_order_workers: {
    moduleId: "farm-work",
    title: "คนงานในใบสั่งงาน",
    primaryKey: "id",
    codeField: "role",
    labelField: "employee_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("employee_id", "พนักงาน", { references: "employees", required: true }),
      F("role", "หน้าที่"),
      F("planned_hours", "ชั่วโมงแผน", { type: "number" }),
      F("rate", "อัตรา", { type: "number" }),
    ],
    seed: [],
  },
  work_order_materials: {
    moduleId: "farm-work",
    title: "วัสดุในใบสั่งงาน",
    primaryKey: "id",
    codeField: "planned_quantity",
    labelField: "material_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("planned_quantity", "ปริมาณแผน", { type: "number" }),
      F("issued_quantity", "จ่ายจริง", { type: "number" }),
      F("unit_id", "หน่วย", { references: "units" }),
    ],
    seed: [],
  },
  work_order_machines: {
    moduleId: "farm-work",
    title: "รถ/เครื่องจักรในใบสั่งงาน",
    primaryKey: "id",
    codeField: "planned_hours",
    labelField: "vehicle_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("vehicle_id", "รถ/เครื่องจักร", { references: "vehicles", required: true }),
      F("driver_employee_id", "พนักงานขับ", { references: "employees" }),
      F("planned_hours", "ชั่วโมงแผน", { type: "number" }),
      F("fuel_plan_liter", "น้ำมันแผน", { type: "number" }),
    ],
    seed: [],
  },
  work_order_approvals: {
    moduleId: "farm-work",
    title: "อนุมัติใบสั่งงาน",
    primaryKey: "id",
    codeField: "approval_level",
    labelField: "work_order_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("approval_level", "ระดับอนุมัติ", { type: "number" }),
      F("approver_profile_id", "ผู้อนุมัติ", { references: "profiles" }),
      F("decision", "ผลอนุมัติ", { options: ["pending", "approved", "rejected"] }),
      F("decided_at", "วันที่อนุมัติ", { type: "date" }),
    ],
    seed: [],
  },
  work_order_qr_codes: {
    moduleId: "farm-work",
    title: "QR Code ใบสั่งงาน",
    primaryKey: "id",
    codeField: "qr_token",
    labelField: "work_order_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("qr_token", "QR Token", { required: true }),
      F("expires_at", "หมดอายุ", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  work_order_locations: {
    moduleId: "farm-work",
    title: "พิกัดงาน",
    primaryKey: "id",
    codeField: "location_type",
    labelField: "work_order_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("location_type", "ชนิดพิกัด", { options: ["planned", "check_in", "check_out", "actual"] }),
      F("gps_lat", "Latitude", { type: "number" }),
      F("gps_lng", "Longitude", { type: "number" }),
      F("recorded_by", "ผู้บันทึก", { references: "profiles" }),
    ],
    seed: [],
  },
  work_order_status_logs: {
    moduleId: "farm-work",
    title: "ประวัติสถานะใบสั่งงาน",
    primaryKey: "id",
    codeField: "to_status",
    labelField: "work_order_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("from_status", "จากสถานะ"),
      F("to_status", "เป็นสถานะ", { required: true }),
      F("changed_by", "ผู้เปลี่ยน", { references: "profiles" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [],
  },
  work_attendance: {
    moduleId: "farm-work",
    title: "Attendance",
    primaryKey: "id",
    codeField: "attendance_date",
    labelField: "employee_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("employee_id", "พนักงาน", { references: "employees", required: true }),
      F("attendance_date", "วันที่", { type: "date" }),
      F("check_in_time", "เวลาเข้า"),
      F("check_out_time", "เวลาออก"),
      F("work_hours", "ชั่วโมงทำงาน", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  work_results: {
    moduleId: "farm-work",
    title: "บันทึกผลงานจริง",
    primaryKey: "id",
    codeField: "result_date",
    labelField: "work_order_id",
    fields: [
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders", required: true }),
      F("result_date", "วันที่ผลงาน", { type: "date" }),
      F("actual_quantity", "ผลงานจริง", { type: "number" }),
      F("actual_unit", "หน่วย"),
      F("quality_score", "คะแนนคุณภาพ", { type: "number" }),
      F("recorded_by", "ผู้บันทึก", { references: "profiles" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  warehouses: {
    moduleId: "farm-inventory",
    title: "คลัง",
    primaryKey: "id",
    codeField: "warehouse_code",
    labelField: "warehouse_name",
    fields: [
      F("warehouse_code", "รหัสคลัง", { required: true }),
      F("warehouse_name", "ชื่อคลัง", { required: true }),
      F("estate_id", "Estate", { references: "estates" }),
      F("keeper_employee_id", "ผู้ดูแลคลัง", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "wh-main", warehouse_code: "WH-001", warehouse_name: "คลังกลาง", estate_id: "estate-spc", status: "active" },
    ],
  },
  bin_locations: {
    moduleId: "farm-inventory",
    title: "ตำแหน่งเก็บ",
    primaryKey: "id",
    codeField: "bin_code",
    labelField: "bin_name",
    fields: [
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("bin_code", "รหัสตำแหน่ง", { required: true }),
      F("bin_name", "ชื่อตำแหน่ง"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  goods_receipts: {
    moduleId: "farm-inventory",
    title: "รับพัสดุ",
    primaryKey: "id",
    codeField: "receipt_no",
    labelField: "supplier_name",
    fields: [
      F("receipt_no", "เลขที่รับ", { required: true }),
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("receipt_date", "วันที่รับ", { type: "date" }),
      F("supplier_name", "ผู้ขาย"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  goods_receipt_lines: {
    moduleId: "farm-inventory",
    title: "รายการรับพัสดุ",
    primaryKey: "id",
    codeField: "quantity",
    labelField: "material_id",
    fields: [
      F("receipt_id", "เอกสารรับ", { references: "goods_receipts", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("quantity", "จำนวน", { type: "number" }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("unit_cost", "ต้นทุน/หน่วย", { type: "number" }),
    ],
    seed: [],
  },
  goods_issues: {
    moduleId: "farm-inventory",
    title: "จ่ายพัสดุ",
    primaryKey: "id",
    codeField: "issue_no",
    labelField: "work_order_id",
    fields: [
      F("issue_no", "เลขที่จ่าย", { required: true }),
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders" }),
      F("issue_date", "วันที่จ่าย", { type: "date" }),
      F("issued_to_employee_id", "ผู้รับ", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  goods_issue_lines: {
    moduleId: "farm-inventory",
    title: "รายการจ่ายพัสดุ",
    primaryKey: "id",
    codeField: "quantity",
    labelField: "material_id",
    fields: [
      F("issue_id", "เอกสารจ่าย", { references: "goods_issues", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("quantity", "จำนวน", { type: "number" }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("bin_id", "ตำแหน่งเก็บ", { references: "bin_locations" }),
    ],
    seed: [],
  },
  goods_returns: {
    moduleId: "farm-inventory",
    title: "คืนพัสดุ",
    primaryKey: "id",
    codeField: "return_no",
    labelField: "work_order_id",
    fields: [
      F("return_no", "เลขที่คืน", { required: true }),
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders" }),
      F("return_date", "วันที่คืน", { type: "date" }),
      F("returned_by_employee_id", "ผู้คืน", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  goods_return_lines: {
    moduleId: "farm-inventory",
    title: "รายการคืนพัสดุ",
    primaryKey: "id",
    codeField: "quantity",
    labelField: "material_id",
    fields: [
      F("return_id", "เอกสารคืน", { references: "goods_returns", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("quantity", "จำนวน", { type: "number" }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("condition_note", "สภาพ/หมายเหตุ"),
    ],
    seed: [],
  },
  stock_transactions: {
    moduleId: "farm-inventory",
    title: "เคลื่อนไหวสต๊อค",
    primaryKey: "id",
    codeField: "transaction_type",
    labelField: "material_id",
    fields: [
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("transaction_date", "วันที่", { type: "date" }),
      F("transaction_type", "ประเภท", { options: ["receipt", "issue", "return", "transfer", "adjustment", "count"] }),
      F("quantity_in", "รับเข้า", { type: "number" }),
      F("quantity_out", "จ่ายออก", { type: "number" }),
      F("unit_id", "หน่วย", { references: "units" }),
    ],
    seed: [],
  },
  stock_balances: {
    moduleId: "farm-inventory",
    title: "ยอดคงเหลือสต๊อค",
    primaryKey: "id",
    codeField: "quantity_on_hand",
    labelField: "material_id",
    fields: [
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("bin_id", "ตำแหน่งเก็บ", { references: "bin_locations" }),
      F("quantity_on_hand", "คงเหลือ", { type: "number" }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("last_count_date", "ตรวจนับล่าสุด", { type: "date" }),
    ],
    seed: [],
  },
  stock_transfers: {
    moduleId: "farm-inventory",
    title: "โอนย้ายสต๊อค",
    primaryKey: "id",
    codeField: "transfer_no",
    labelField: "material_id",
    fields: [
      F("transfer_no", "เลขที่โอน", { required: true }),
      F("from_warehouse_id", "จากคลัง", { references: "warehouses", required: true }),
      F("to_warehouse_id", "เข้าคลัง", { references: "warehouses", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("quantity", "จำนวน", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  stock_adjustments: {
    moduleId: "farm-inventory",
    title: "ปรับยอดสต๊อค",
    primaryKey: "id",
    codeField: "adjustment_no",
    labelField: "material_id",
    fields: [
      F("adjustment_no", "เลขที่ปรับ", { required: true }),
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("adjustment_quantity", "จำนวนปรับ", { type: "number" }),
      F("reason", "เหตุผล"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  stock_counts: {
    moduleId: "farm-inventory",
    title: "ตรวจนับสต๊อค",
    primaryKey: "id",
    codeField: "count_no",
    labelField: "warehouse_id",
    fields: [
      F("count_no", "เลขที่ตรวจนับ", { required: true }),
      F("warehouse_id", "คลัง", { references: "warehouses", required: true }),
      F("count_date", "วันที่ตรวจนับ", { type: "date" }),
      F("counted_by", "ผู้ตรวจนับ", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  material_lots: {
    moduleId: "farm-inventory",
    title: "ล็อตวัสดุ",
    primaryKey: "id",
    codeField: "lot_no",
    labelField: "material_id",
    fields: [
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("lot_no", "Lot No.", { required: true }),
      F("expiry_date", "วันหมดอายุ", { type: "date" }),
      F("received_quantity", "จำนวนรับ", { type: "number" }),
      F("remaining_quantity", "คงเหลือ", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  unit_conversions: {
    moduleId: "farm-inventory",
    title: "แปลงหน่วย",
    primaryKey: "id",
    codeField: "conversion_rate",
    labelField: "from_unit_id",
    fields: [
      F("from_unit_id", "จากหน่วย", { references: "units", required: true }),
      F("to_unit_id", "เป็นหน่วย", { references: "units", required: true }),
      F("conversion_rate", "อัตราแปลง", { type: "number", required: true }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  sku_conversions: {
    moduleId: "farm-inventory",
    title: "แปลง SKU",
    primaryKey: "id",
    codeField: "conversion_rate",
    labelField: "material_id",
    fields: [
      F("material_id", "วัสดุ", { references: "materials", required: true }),
      F("from_unit_id", "จากหน่วย", { references: "units", required: true }),
      F("to_unit_id", "เป็นหน่วย", { references: "units", required: true }),
      F("conversion_rate", "อัตราแปลง", { type: "number", required: true }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  vehicles: {
    moduleId: "farm-inventory",
    title: "รถ / เครื่องจักร",
    primaryKey: "id",
    codeField: "vehicle_code",
    labelField: "vehicle_name",
    fields: [
      F("vehicle_code", "รหัสรถ", { required: true }),
      F("vehicle_name", "ชื่อรถ/เครื่องจักร", { required: true }),
      F("vehicle_type", "ประเภท"),
      F("plate_no", "ทะเบียน"),
      F("default_driver_id", "คนขับประจำ", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "vehicle-tractor-1", vehicle_code: "VEH-001", vehicle_name: "รถแทรกเตอร์ 1", vehicle_type: "tractor", default_driver_id: "emp-001", status: "active" },
    ],
  },
  fuel_tanks: {
    moduleId: "farm-inventory",
    title: "ถังน้ำมัน",
    primaryKey: "id",
    codeField: "tank_code",
    labelField: "tank_name",
    fields: [
      F("tank_code", "รหัสถัง", { required: true }),
      F("tank_name", "ชื่อถัง", { required: true }),
      F("warehouse_id", "คลัง", { references: "warehouses" }),
      F("capacity_liter", "ความจุ", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  fuel_requisitions: {
    moduleId: "farm-inventory",
    title: "เบิกน้ำมัน",
    primaryKey: "id",
    codeField: "requisition_no",
    labelField: "work_order_id",
    fields: [
      F("requisition_no", "เลขที่เบิก", { required: true }),
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders" }),
      F("vehicle_id", "รถ/เครื่องจักร", { references: "vehicles" }),
      F("requested_liter", "ขอเบิก (ลิตร)", { type: "number" }),
      F("requested_by", "ผู้ขอเบิก", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  fuel_issues: {
    moduleId: "farm-inventory",
    title: "จ่ายน้ำมัน",
    primaryKey: "id",
    codeField: "issue_no",
    labelField: "fuel_requisition_id",
    fields: [
      F("fuel_requisition_id", "ใบเบิกน้ำมัน", { references: "fuel_requisitions", required: true }),
      F("issue_no", "เลขที่จ่าย", { required: true }),
      F("tank_id", "ถังน้ำมัน", { references: "fuel_tanks" }),
      F("issued_liter", "จ่ายจริง (ลิตร)", { type: "number" }),
      F("issued_by", "ผู้จ่าย", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  payroll_periods: {
    moduleId: "farm-payroll",
    title: "งวดค่าแรง",
    primaryKey: "id",
    codeField: "period_code",
    labelField: "period_name",
    fields: [
      F("period_code", "รหัสงวด", { required: true }),
      F("period_name", "ชื่องวด", { required: true }),
      F("start_date", "วันที่เริ่ม", { type: "date" }),
      F("end_date", "วันที่สิ้นสุด", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "pay-period-2569-01", period_code: "PAY-2569-01", period_name: "งวดค่าแรงมกราคม 2569", start_date: "2026-01-01", end_date: "2026-01-31", status: "open" },
    ],
  },
  payroll_period_lines: {
    moduleId: "farm-payroll",
    title: "รายการค่าแรงรายงวด",
    primaryKey: "id",
    codeField: "gross_amount",
    labelField: "employee_id",
    fields: [
      F("payroll_period_id", "งวดค่าแรง", { references: "payroll_periods", required: true }),
      F("employee_id", "พนักงาน", { references: "employees" }),
      F("contractor_id", "ผู้รับเหมา", { references: "contractors" }),
      F("work_result_id", "ผลงานจริง", { references: "work_results" }),
      F("gross_amount", "ยอดก่อนหัก", { type: "number" }),
      F("net_amount", "ยอดสุทธิ", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  payroll_rates: {
    moduleId: "farm-payroll",
    title: "เรทค่าแรง",
    primaryKey: "id",
    codeField: "rate_code",
    labelField: "activity_id",
    fields: [
      F("rate_code", "รหัสเรท", { required: true }),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("team_id", "ทีม", { references: "teams" }),
      F("rate_type", "ประเภทเรท", { options: ["daily", "piece", "hourly", "driver", "pool"] }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("rate_amount", "อัตรา", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  overtime_rules: {
    moduleId: "farm-payroll",
    title: "กฎ OT",
    primaryKey: "id",
    codeField: "rule_code",
    labelField: "rule_name",
    fields: [
      F("rule_code", "รหัสกฎ", { required: true }),
      F("rule_name", "ชื่อกฎ", { required: true }),
      F("multiplier", "ตัวคูณ", { type: "number" }),
      F("start_time", "เวลาเริ่ม"),
      F("end_time", "เวลาสิ้นสุด"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  payroll_overtime_records: {
    moduleId: "farm-payroll",
    title: "บันทึก OT",
    primaryKey: "id",
    codeField: "ot_date",
    labelField: "employee_id",
    fields: [
      F("payroll_period_id", "งวดค่าแรง", { references: "payroll_periods", required: true }),
      F("employee_id", "พนักงาน", { references: "employees", required: true }),
      F("overtime_rule_id", "กฎ OT", { references: "overtime_rules" }),
      F("ot_date", "วันที่ OT", { type: "date" }),
      F("ot_hours", "ชั่วโมง OT", { type: "number" }),
      F("amount", "ยอดเงิน", { type: "number" }),
    ],
    seed: [],
  },
  deduction_types: {
    moduleId: "farm-payroll",
    title: "ประเภทเงินหัก",
    primaryKey: "id",
    codeField: "deduction_code",
    labelField: "deduction_name",
    fields: [
      F("deduction_code", "รหัสเงินหัก", { required: true }),
      F("deduction_name", "ชื่อเงินหัก", { required: true }),
      F("calculation_type", "วิธีคำนวณ", { options: ["fixed", "percent", "per_day", "per_hour"] }),
      F("default_amount", "ยอดเริ่มต้น", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "ded-late", deduction_code: "DED-LATE", deduction_name: "มาสาย", calculation_type: "fixed", default_amount: "50", status: "active" },
    ],
  },
  payroll_deductions: {
    moduleId: "farm-payroll",
    title: "เงินหักพนักงาน",
    primaryKey: "id",
    codeField: "amount",
    labelField: "employee_id",
    fields: [
      F("payroll_period_id", "งวดค่าแรง", { references: "payroll_periods", required: true }),
      F("employee_id", "พนักงาน", { references: "employees", required: true }),
      F("deduction_type_id", "ประเภทเงินหัก", { references: "deduction_types", required: true }),
      F("amount", "ยอดหัก", { type: "number" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [],
  },
  allowance_types: {
    moduleId: "farm-payroll",
    title: "ประเภทเงินเพิ่ม",
    primaryKey: "id",
    codeField: "allowance_code",
    labelField: "allowance_name",
    fields: [
      F("allowance_code", "รหัสเงินเพิ่ม", { required: true }),
      F("allowance_name", "ชื่อเงินเพิ่ม", { required: true }),
      F("calculation_type", "วิธีคำนวณ", { options: ["fixed", "percent", "per_day", "per_hour"] }),
      F("default_amount", "ยอดเริ่มต้น", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  payroll_allowances: {
    moduleId: "farm-payroll",
    title: "เงินเพิ่มพนักงาน",
    primaryKey: "id",
    codeField: "amount",
    labelField: "employee_id",
    fields: [
      F("payroll_period_id", "งวดค่าแรง", { references: "payroll_periods", required: true }),
      F("employee_id", "พนักงาน", { references: "employees", required: true }),
      F("allowance_type_id", "ประเภทเงินเพิ่ม", { references: "allowance_types", required: true }),
      F("amount", "ยอดเพิ่ม", { type: "number" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [],
  },
  budget_rates: {
    moduleId: "farm-budget",
    title: "อัตรางบประมาณ",
    primaryKey: "id",
    codeField: "budget_rate_code",
    labelField: "activity_id",
    fields: [
      F("budget_rate_code", "รหัสอัตรา", { required: true }),
      F("fiscal_year", "ปีงบประมาณ", { type: "number", required: true }),
      F("estate_id", "Estate", { references: "estates", required: true }),
      F("plot_group_id", "กลุ่มแปลง", { references: "plot_groups" }),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("material_id", "วัสดุ", { references: "materials" }),
      F("team_id", "กลุ่มคนงาน", { references: "teams" }),
      F("rate_type", "ประเภทเรท", { options: ["labor", "material", "contractor", "fuel", "machine"] }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("rate_amount", "อัตรา", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "budget-rate-001", budget_rate_code: "BUD-2569-001", fiscal_year: "2569", estate_id: "estate-spc", plot_group_id: "plot-group-rspo", activity_id: "activity-fertilizer", material_id: "material-fert-25", team_id: "team-a", rate_type: "labor", unit_id: "unit-kg", rate_amount: "250", status: "active" },
    ],
  },
  contractor_period_estimates: {
    moduleId: "farm-budget",
    title: "ประมาณงานผู้รับเหมารายงวด",
    primaryKey: "id",
    codeField: "estimate_code",
    labelField: "contractor_id",
    fields: [
      F("estimate_code", "รหัสประมาณการ", { required: true }),
      F("fiscal_year", "ปี", { type: "number" }),
      F("period_month", "เดือน", { type: "number" }),
      F("contractor_id", "ผู้รับเหมา", { references: "contractors", required: true }),
      F("activity_id", "กิจกรรม", { references: "activities" }),
      F("estimated_quantity", "ปริมาณประมาณการ", { type: "number" }),
      F("estimated_amount", "มูลค่าประมาณการ", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  cost_entries: {
    moduleId: "farm-budget",
    title: "บันทึกต้นทุน",
    primaryKey: "id",
    codeField: "cost_date",
    labelField: "activity_id",
    fields: [
      F("cost_date", "วันที่ต้นทุน", { type: "date" }),
      F("estate_id", "Estate", { references: "estates" }),
      F("plot_id", "แปลง", { references: "plots" }),
      F("activity_id", "กิจกรรม", { references: "activities" }),
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders" }),
      F("cost_type", "ประเภทต้นทุน", { options: ["labor", "material", "fuel", "machine", "other"] }),
      F("amount", "มูลค่า", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  profiles: {
    moduleId: "farm-general",
    title: "ผู้ใช้ระบบ",
    primaryKey: "id",
    codeField: "role",
    labelField: "full_name",
    fields: [
      F("full_name", "ชื่อผู้ใช้", { required: true }),
      F("employee_id", "พนักงาน", { references: "employees" }),
      F("role", "Role", { options: FARM_ROLES }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "profile-admin", full_name: "ผู้ดูแลระบบ", role: "super_admin", status: "active" },
    ],
  },
  permissions: {
    moduleId: "farm-general",
    title: "สิทธิ์ระบบ",
    primaryKey: "id",
    codeField: "permission_key",
    labelField: "permission_name",
    fields: [
      F("permission_key", "Permission Key", { required: true }),
      F("permission_name", "ชื่อสิทธิ์", { required: true }),
      F("module_key", "Module"),
      F("action_key", "Action"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "perm-work-approve", permission_key: "work_orders.approve", permission_name: "อนุมัติใบสั่งงาน", module_key: "work_orders", action_key: "approve", status: "active" },
    ],
  },
  role_permissions: {
    moduleId: "farm-general",
    title: "สิทธิ์ตาม Role",
    primaryKey: "id",
    codeField: "role",
    labelField: "permission_id",
    fields: [
      F("role", "Role", { options: FARM_ROLES, required: true }),
      F("permission_id", "สิทธิ์", { references: "permissions", required: true }),
      F("is_allowed", "อนุญาต", { type: "boolean" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "role-perm-admin-approve", role: "super_admin", permission_id: "perm-work-approve", is_allowed: "true", status: "active" },
    ],
  },
  user_access_scopes: {
    moduleId: "farm-general",
    title: "ขอบเขตการเข้าถึง",
    primaryKey: "id",
    codeField: "scope_type",
    labelField: "profile_id",
    fields: [
      F("profile_id", "ผู้ใช้", { references: "profiles", required: true }),
      F("estate_id", "Estate", { references: "estates" }),
      F("zone_id", "โซน", { references: "zones" }),
      F("plot_id", "แปลง", { references: "plots" }),
      F("scope_type", "ชนิดสิทธิ์", { options: ["read", "write", "approve"] }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  system_settings: {
    moduleId: "farm-general",
    title: "ตั้งค่าระบบ",
    primaryKey: "id",
    codeField: "setting_key",
    labelField: "setting_value",
    fields: [
      F("setting_key", "Setting Key", { required: true }),
      F("setting_value", "ค่า"),
      F("setting_group", "กลุ่มค่า"),
      F("description", "คำอธิบาย"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "setting-gps-radius", setting_key: "mobile.gps_radius_meter", setting_value: "100", setting_group: "mobile", description: "รัศมีเช็คอิน", status: "active" },
    ],
  },
  attachments: {
    moduleId: "farm-general",
    title: "ไฟล์แนบ",
    primaryKey: "id",
    codeField: "file_name",
    labelField: "entity_table",
    fields: [
      F("entity_table", "ตารางอ้างอิง", { required: true }),
      F("entity_id", "รหัสรายการ", { required: true }),
      F("file_name", "ชื่อไฟล์", { required: true }),
      F("file_url", "URL"),
      F("uploaded_by", "ผู้อัปโหลด", { references: "profiles" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  audit_logs: {
    moduleId: "farm-general",
    title: "Audit Log",
    primaryKey: "id",
    codeField: "action",
    labelField: "entity_table",
    fields: [
      F("entity_table", "ตาราง"),
      F("entity_id", "รหัสรายการ"),
      F("action", "Action"),
      F("changed_by", "ผู้ทำรายการ", { references: "profiles" }),
      F("changed_at", "วันที่ทำรายการ", { type: "date" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [],
  },
  report_exports: {
    moduleId: "farm-reports",
    title: "ประวัติออกรายงาน",
    primaryKey: "id",
    codeField: "report_key",
    labelField: "report_name",
    fields: [
      F("report_key", "Report Key", { required: true }),
      F("report_name", "ชื่อรายงาน", { required: true }),
      F("module_key", "Module"),
      F("export_format", "Format", { options: ["Excel", "PDF", "Print"] }),
      F("created_by", "ผู้สร้าง", { references: "profiles" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "rpt-plan", report_key: "planning.work_plan", report_name: "รายงานแผนงาน", module_key: "planning", export_format: "Excel", status: "ready" },
      { id: "rpt-payroll", report_key: "payroll.period", report_name: "รายงานค่าแรงรายงวด", module_key: "payroll", export_format: "PDF", status: "ready" },
    ],
  },
};

function farmModuleMap() {
  return Object.fromEntries(FARM_MODULES.map((module) => [module.id, module]));
}

function initialViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view") || params.get("page") || params.get("v") || "";
  const transportViews = new Set(["dashboard", "stock", "rspo", "daily", "summary", "clear", "master-data"]);
  if (requested.startsWith("farm-")) return requested;
  if (transportViews.has(requested) && requested !== "master-data") return requested;
  return state.view;
}

function renderPalmSidebar() {
  if (!els.palmMenuSection) return;
  const group = state.cultivateMenu?.menuGroup || "งานจัดการสวนปาล์ม";
  els.palmMenuSection.innerHTML = `
    <p class="menu-section-title">${esc(group)}</p>
    ${palmMenuModules().map((module, index) => `
      <button type="button" data-view="${esc(module.id)}" data-icon="${esc(PALM_MENU_ICONS[index % PALM_MENU_ICONS.length])}">
        <span>${esc(module.title)}</span>
      </button>`).join("")}`;
  for (const btn of els.tabs.querySelectorAll("button")) btn.classList.toggle("active", btn.dataset.view === state.view);
}

function applySidebarState() {
  els.sidebar?.classList.toggle("collapsed", state.sidebarCollapsed);
  els.appShell?.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  els.sidebarToggle?.setAttribute("aria-pressed", state.sidebarCollapsed ? "true" : "false");
}

async function loadCultivateMenu() {
  const raw = window.__CULTIVATE_MENU__ || await fetchCultivateResource("menu")
    .catch(() => fetch(`./data/cultivate_menu.json?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json()))
    .catch(() => fallbackCultivateMenu());
  state.cultivateMenu = normalizeCultivateMenu(raw);
  renderPalmSidebar();
}

async function loadCultivateWork() {
  const raw = window.__CULTIVATE_WORK__ || await fetchCultivateResource("work")
    .catch(() => fetch(`./data/cultivate_work.json?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json()))
    .catch(() => ({ source: { system: "SPC Cultivate", mode: "empty" }, workRows: [] }));
  state.cultivateWork = {
    source: raw.source || { system: "SPC Cultivate" },
    workRows: Array.isArray(raw.workRows) ? raw.workRows : [],
  };
}

async function loadCultivateMaster() {
  const raw = window.__CULTIVATE_MASTER__ || await fetchCultivateResource("master")
    .catch(() => fetch(`./data/cultivate_master.json?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json()))
    .catch(() => ({ source: { system: "SPC Cultivate", mode: "empty" } }));
  state.cultivateMaster = {
    source: raw.source || { system: "SPC Cultivate" },
    terrains: Array.isArray(raw.terrains) ? raw.terrains : [],
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    activityGroups: Array.isArray(raw.activityGroups) ? raw.activityGroups : [],
    gangs: Array.isArray(raw.gangs) ? raw.gangs : [],
    partners: Array.isArray(raw.partners) ? raw.partners : [],
    materials: Array.isArray(raw.materials) ? raw.materials : [],
    warehouses: Array.isArray(raw.warehouses) ? raw.warehouses : [],
    weighbridges: Array.isArray(raw.weighbridges) ? raw.weighbridges : [],
    rawTables: Array.isArray(raw.rawTables) ? raw.rawTables : [],
  };
}

function masterDataSignature(payload) {
  const source = payload?.source || {};
  return [source.generatedAt, source.editsUpdatedAt, source.datasetCount, source.rowCount].join("|");
}

async function loadMasterData({ silent = false } = {}) {
  const raw = window.__MASTER_DATA__ || await fetch(`${MASTER_DATA_API}?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => fetch(`./data/master_data.json?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json()))
    .catch(() => ({ ok: false, source: {}, groups: [], datasets: [] }));
  const signature = masterDataSignature(raw);
  if (silent && signature === state.masterDataSignature) return false;
  state.masterData = {
    ok: raw.ok !== false,
    source: raw.source || {},
    groups: Array.isArray(raw.groups) ? raw.groups : [],
    files: Array.isArray(raw.files) ? raw.files : [],
    datasets: Array.isArray(raw.datasets) ? raw.datasets : [],
  };
  state.masterDataSignature = signature;
  if (!state.masterFilters.datasetId && state.masterData.datasets[0]) {
    state.masterFilters.datasetId = state.masterData.datasets[0].id;
  }
  if (silent) render();
  return true;
}

async function loadCultivateCredentials() {
  state.cultivateCredentials = await fetch(CULTIVATE_CREDENTIALS_API, { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => ({ ok: false, hasCredentials: false }));
}

async function fetchCultivateResource(resource) {
  const url = `${CULTIVATE_API_BASE}?resource=${encodeURIComponent(resource)}&t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cultivate API ${resource} failed: ${res.status}`);
  const payload = await res.json();
  if (payload && payload.ok === false) throw new Error(payload.error || `Cultivate API ${resource} failed`);
  return payload?.data || payload;
}

async function importCultivateFiles() {
  const input = document.querySelector("#cultivateImportFiles");
  const status = document.querySelector("#cultivateImportStatus");
  const mode = document.querySelector("#cultivateImportMode")?.value || "work";
  if (!input?.files?.length) {
    if (mode === "master") {
      await importCultivateFromServer("master");
      return;
    }
    if (status) status.textContent = "กรุณาเลือกไฟล์ export ก่อน";
    return;
  }
  const form = new FormData();
  for (const file of input.files) form.append("files[]", file);
  if (status) status.textContent = "กำลังนำเข้า...";
  try {
    form.append("mode", mode);
    const res = await fetch(`${CULTIVATE_IMPORT_API}?mode=${encodeURIComponent(mode)}`, { method: "POST", body: form });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || "Import failed");
    if (mode === "master") await loadCultivateMaster();
    else await loadCultivateWork();
    const rowCount = payload.rows || Object.values(payload.counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    if (status) status.textContent = `นำเข้าแล้ว ${fmt(rowCount)} แถว จาก ${fmt(payload.files || input.files.length)} ไฟล์`;
    render();
  } catch (error) {
    if (status) status.textContent = `นำเข้าไม่สำเร็จ: ${error.message}`;
  }
}

async function importCultivateFromServer(mode = "master") {
  const status = document.querySelector("#cultivateImportStatus");
  if (status) status.textContent = mode === "master" ? "กำลังดึง Master Data อัตโนมัติ..." : "กำลังดึงข้อมูลอัตโนมัติ...";
  try {
    const form = new FormData();
    form.append("mode", mode);
    const res = await fetch(`${CULTIVATE_IMPORT_API}?mode=${encodeURIComponent(mode)}&source=server-folder`, {
      method: "POST",
      body: form,
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || "Auto import failed");
    if (mode === "master") await loadCultivateMaster();
    else await loadCultivateWork();
    const rowCount = payload.rows || Object.values(payload.counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    if (payload.warning) {
      if (status) status.textContent = "ยังไม่พบไฟล์ export ในโฟลเดอร์ cultivate_exports";
      return;
    }
    if (status) status.textContent = `ดึงอัตโนมัติแล้ว ${fmt(rowCount)} แถว จาก ${fmt(payload.files || 0)} ไฟล์`;
    render();
  } catch (error) {
    if (status) status.textContent = `ดึงอัตโนมัติไม่สำเร็จ: ${error.message}`;
  }
}

async function saveCultivateCredentials() {
  const status = document.querySelector("#cultivateCredentialStatus");
  const baseUrl = document.querySelector("#cultivateBaseUrl")?.value.trim() || "https://spc.cultivate-agri.com";
  const username = document.querySelector("#cultivateUsername")?.value.trim() || "";
  const password = document.querySelector("#cultivatePassword")?.value || "";
  if (!username || !password) {
    if (status) status.textContent = "กรุณากรอก user และ password";
    return;
  }
  if (status) status.textContent = "กำลังบันทึก...";
  try {
    const res = await fetch(CULTIVATE_CREDENTIALS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: baseUrl, username, password }),
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || "Save failed");
    await loadCultivateCredentials();
    document.querySelector("#cultivatePassword").value = "";
    if (status) status.textContent = "บันทึกแล้ว";
    render();
  } catch (error) {
    if (status) status.textContent = `บันทึกไม่สำเร็จ: ${error.message}`;
  }
}

async function refreshTransportFromQuery() {
  if (!els.refreshTransportBtn) return;
  const original = els.refreshTransportBtn.textContent;
  els.refreshTransportBtn.textContent = "Refreshing...";
  els.refreshTransportBtn.disabled = true;
  try {
    const res = await fetch(`${TRANSPORT_REFRESH_API}?t=${Date.now()}`, { method: "POST", cache: "no-store" });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || "Refresh failed");
    await loadPayload({ silent: true });
    els.refreshTransportBtn.textContent = `Query ${fmt(payload.source?.rowCount || 0)} rows`;
    window.setTimeout(() => {
      els.refreshTransportBtn.textContent = original;
    }, 2500);
  } catch (error) {
    els.refreshTransportBtn.textContent = "Refresh failed";
    window.setTimeout(() => {
      els.refreshTransportBtn.textContent = original;
    }, 3000);
  } finally {
    els.refreshTransportBtn.disabled = false;
  }
}

function autoRefreshTransportFromQuery() {
  window.setTimeout(() => {
    refreshTransportFromQuery();
  }, 500);
}

function ensurePrintPreviewElements() {
  if (!els.printPreviewModal) {
    document.body.insertAdjacentHTML("beforeend", `
      <div id="printPreviewModal" class="print-preview-modal hidden" aria-hidden="true">
        <div class="print-preview-panel">
          <div class="print-preview-bar">
            <div>
              <strong>Print Preview</strong>
              <span>ตรวจสอบหน้ารายงานก่อนพิมพ์หรือบันทึก PDF</span>
            </div>
            <div class="print-preview-actions">
              <button id="previewPrintBtn" type="button">พิมพ์ / PDF</button>
              <button id="previewCloseBtn" type="button">ปิด</button>
            </div>
          </div>
          <div id="printPreviewBody" class="print-preview-body"></div>
        </div>
      </div>`);
    els.printPreviewModal = document.querySelector("#printPreviewModal");
    els.printPreviewBody = document.querySelector("#printPreviewBody");
    els.previewPrintBtn = document.querySelector("#previewPrintBtn");
    els.previewCloseBtn = document.querySelector("#previewCloseBtn");
  }
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value) {
  return nf.format(Math.round(n(value)));
}

function lossOnly(value) {
  return Math.max(0, -n(value));
}

function isoDay(value) {
  if (!value) return "";
  const text = String(value).trim();
  const thaiDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (thaiDate) {
    const day = thaiDate[1].padStart(2, "0");
    const month = thaiDate[2].padStart(2, "0");
    let yearNumber = Number(thaiDate[3]);
    if (thaiDate[3].length === 2) yearNumber += 2500;
    if (yearNumber > 2400) yearNumber -= 543;
    const year = String(yearNumber).padStart(4, "0");
    return `${year}-${month}-${day}`;
  }
  return text.slice(0, 10);
}

function displayDate(value) {
  const d = isoDay(value);
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function dateValue(el) {
  return isoDay(el?.value);
}

function setDateValue(el, value) {
  if (!el) return;
  const iso = isoDay(value);
  el.value = displayDate(iso);
  if (el === els.startDate && els.startDatePicker) els.startDatePicker.value = iso;
  if (el === els.endDate && els.endDatePicker) els.endDatePicker.value = iso;
}

function normalizeDateInput(el) {
  const iso = dateValue(el);
  if (iso) setDateValue(el, iso);
}

function syncDatePickerFromText(el) {
  const iso = dateValue(el);
  if (el === els.startDate && els.startDatePicker) els.startDatePicker.value = iso;
  if (el === els.endDate && els.endDatePicker) els.endDatePicker.value = iso;
}

function dayNumber(value) {
  return Number(isoDay(value).slice(8, 10));
}

function monthTitle(start, end) {
  return `${displayDate(start)} - ${displayDate(end)}`;
}

function inRange(day) {
  const start = dateValue(els.startDate);
  const end = dateValue(els.endDate);
  return (!start || day >= start) && (!end || day <= end);
}

function isoDateFromUtc(date) {
  return date.toISOString().slice(0, 10);
}

function addIsoDays(day, amount) {
  const [year, month, date] = String(day).split("-").map(Number);
  if (!year || !month || !date) return "";
  const value = new Date(Date.UTC(year, month - 1, date + amount));
  return isoDateFromUtc(value);
}

function daysBetween(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(end || "") || start > end) return [];
  const days = [];
  for (let day = start; day <= end; day = addIsoDays(day, 1)) days.push(day);
  return days;
}

function yardScope() {
  if (els.yardFilter.value === "garden") return "garden";
  if (els.yardFilter.value === "takuk") return "takuk";
  return "combined";
}

function loadClearOverrides() {
  try {
    state.clearOverrides = JSON.parse(localStorage.getItem("palm-clear-ramp-log") || "[]");
  } catch {
    state.clearOverrides = [];
  }
}

function saveClearOverrides() {
  localStorage.setItem("palm-clear-ramp-log", JSON.stringify(state.clearOverrides));
}

function payloadSignature(payload) {
  const source = payload?.source || {};
  return [source.generatedAt, source.rowCount, source.dateMax].join("|");
}

function updateSourceInfo() {
  const source = state.payload?.source || {};
  const live = state.liveMode ? "LIVE" : "ONLINE SNAPSHOT";
  const recordSource = source.recordSource === "query" ? "ODBC Query" : "Excel Sheet";
  const generated = source.generatedAt ? `\nupdated ${source.generatedAt}` : "";
  els.sourceInfo.textContent = `${live} · ${recordSource}\n${fmt(source.rowCount)} rows\n${source.dateMin} - ${source.dateMax}${generated}`;
}

async function loadPayload({ silent = false } = {}) {
  const payload = window.__PALM_DATA__ || await fetch(`./data/data.json?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json());
  const signature = payloadSignature(payload);
  if (silent && signature === state.payloadSignature) return false;
  const previousStart = dateValue(els.startDate);
  const previousEnd = dateValue(els.endDate);
  state.payload = payload;
  state.payloadSignature = signature;
  state.records = state.payload.records || [];
  state.records.forEach((record, index) => {
    record._srcRow = record._srcRow || index + 2;
  });
  updateSourceInfo();
  if (!previousStart && state.payload.source?.dateMin) setDateValue(els.startDate, state.payload.source.dateMin);
  if (!previousEnd && state.payload.source?.dateMax) setDateValue(els.endDate, state.payload.source.dateMax);
  if (els.clearDate && state.payload.source?.dateMax) els.clearDate.value = state.payload.source.dateMax;
  if (!silent) return true;
  render();
  return true;
}

async function loadEstData() {
  const payload = window.__EST_DATA__ || await fetch(`${EST_DATA_URL}?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => ({ ok: false, source: {}, menu: [], budgetDatasets: [], activityTotals: {}, masterSummary: { groups: [], datasets: [] }, estDoc: { paragraphs: [] } }));
  state.estData = payload;
  if (!state.estFilters.datasetId && payload.budgetDatasets?.[0]) {
    state.estFilters.datasetId = payload.budgetDatasets[0].id;
  }
}

async function loadMasterFolderData() {
  const payload = window.__MASTER_FOLDER_DATA__ || await fetch(`${MASTER_FOLDER_DATA_URL}?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => ({ ok: false, domains: [], tables: [], skipped: [] }));
  state.masterFolderData = payload;
  if (!state.masterFolderTableId && payload.tables?.[0]) {
    const priority = payload.tables.find((table) => table.id === "cultivate_terrains")
      || payload.tables.find((table) => table.domain === "terrains")
      || payload.tables.find((table) => table.domain === "activities")
      || payload.tables[0];
    state.masterFolderTableId = priority.id;
  }
}

function startLiveRefresh() {
  if (!state.liveMode) return;
  window.setInterval(async () => {
    try {
      await loadPayload({ silent: true });
    } catch (error) {
      els.sourceInfo.textContent = `${els.sourceInfo.textContent}\nrefresh failed`;
    }
  }, 15000);
}

function workbookClearRows() {
  const sheet = state.payload.sheets.Clear_Ramp_Log;
  return (sheet?.rows || []).map((row) => ({
    date: row._date,
    clearPrSet: row["เคลียร์แรมป์ ปลายราง"] !== null && row["เคลียร์แรมป์ ปลายราง"] !== undefined,
    clearTkSet: row["เคลียร์แรมป์ ตะกุก"] !== null && row["เคลียร์แรมป์ ตะกุก"] !== undefined,
    clearPr: n(row["เคลียร์แรมป์ ปลายราง"]),
    clearTk: n(row["เคลียร์แรมป์ ตะกุก"]),
    lossRamp: lossOnly(row["Loss รวม - แรมป์"]),
    lossTransport: lossOnly(row["Loss รวม - ขนส่ง"]),
    lossPrRamp: lossOnly(row["Loss ปลายราง - แรมป์"]),
    lossPrTransport: lossOnly(row["Loss ปลายราง - ขนส่ง"]),
    lossTkRamp: lossOnly(row["Loss ตะกุก - แรมป์"]),
    lossTkTransport: lossOnly(row["Loss ตะกุก - ขนส่ง"]),
    note: row["หมายเหตุ"] || row["Source / Note"] || "",
    source: "workbook",
  })).filter((row) => row.date);
}

function clearRows() {
  const map = new Map();
  for (const row of workbookClearRows()) map.set(row.date, row);
  for (const row of state.clearOverrides) {
    const base = map.get(row.date) || autoClearLoss(row.date);
    map.set(row.date, { ...base, ...row, source: "manual" });
  }
  return [...map.values()]
    .map((row) => fillAutoClearLoss(row))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function movementBySourceRow() {
  const map = new Map();
  for (const row of state.payload.sheets.Movement.rows || []) {
    if (row["_srcRow"]) map.set(Number(row["_srcRow"]), row);
  }
  return map;
}

function autoClearLoss(date) {
  const loss = { garden: 0, takuk: 0 };
  for (const record of state.records || []) {
    const rowDate = isoDay(record.weightDate || record.date);
    if (rowDate !== date || record.wpInOutType !== "O") continue;
    const scope = dataRecordScope(record);
    const diff = n(record.wpFacNetWeight) - n(record.wpNetWeight);
    if (diff < 0) loss[scope] += Math.abs(diff);
  }
  return {
    date,
    clearPrSet: false,
    clearTkSet: false,
    clearPr: 0,
    clearTk: 0,
    lossRamp: 0,
    lossTransport: loss.garden + loss.takuk,
    lossPrRamp: 0,
    lossPrTransport: loss.garden,
    lossTkRamp: 0,
    lossTkTransport: loss.takuk,
    note: "",
    source: "auto",
  };
}

function fillAutoClearLoss(row) {
  const auto = autoClearLoss(row.date);
  return {
    ...row,
    lossRamp: n(row.lossRamp) || auto.lossRamp,
    lossTransport: auto.lossTransport,
    lossPrRamp: n(row.lossPrRamp) || auto.lossPrRamp,
    lossPrTransport: auto.lossPrTransport,
    lossTkRamp: n(row.lossTkRamp) || auto.lossTkRamp,
    lossTkTransport: auto.lossTkTransport,
  };
}

function dataRecordScope(record) {
  const movement = movementBySourceRow().get(Number(record._srcRow));
  if (movement) return movementScope(movement);
  if (String(record.location || "").startsWith("T")) return "takuk";
  if (String(record.location || "").startsWith("E")) return "garden";
  if (record.areaGroup === "Takuk" || String(record.name || "").includes("ตะกุก")) return "takuk";
  return "garden";
}

function dataInboundBucket(record) {
  if (record.standard === "Contract Farmer") return "customer";
  if (record.areaGroup === "Banggun") return "banggun";
  if (record.areaGroup === "Kapao") return "kapao";
  if (record.areaGroup === "Takuk" && String(record.name || "").includes("เหนือ")) return "takukNorth";
  if (record.areaGroup === "Takuk") return "takuk";
  return "estate";
}

function standardBucketFromText(text) {
  const value = String(text || "");
  if (value.includes("NON-RSPO")) return "NON-RSPO";
  if (value.includes("RSPO")) return "RSPO";
  return "";
}

function recordStandardBucket(record, movement) {
  const fromMovement = standardBucketFromText(movement?.["กอง"]);
  if (fromMovement) return fromMovement;
  if (record.standard === "RSPO") return "RSPO";
  if (record.standard === "Contract Farmer") return "Contract Farmer";
  return "NON-RSPO";
}

function recordFlow(record) {
  return record.wpInOutType === "O" ? "ส่งออก" : "รับเข้า";
}

function recordMatchesGlobalFilters(record, movement) {
  const standard = state.dailyFilters.standard;
  const flow = state.dailyFilters.flow;
  const recordStandard = recordFlow(record) === "รับเข้า"
    ? (record.standard || "")
    : recordStandardBucket(record, movement);
  return (
    (standard === "all" || standard === recordStandard) &&
    (flow === "all" || flow === recordFlow(record))
  );
}

function globalFiltersAreAll() {
  return state.dailyFilters.standard === "all" && state.dailyFilters.flow === "all";
}

function clearMap() {
  return new Map(clearRows().map((row) => [row.date, row]));
}

function filteredMovementRows() {
  return state.payload.sheets.Movement.rows.filter((row) => row._date && inRange(row._date));
}

function movementScope(row) {
  const yard = row["ลาน"];
  if (yard === "T" || String(row["กอง"] || "").includes("ตะกุก")) return "takuk";
  return "garden";
}

function inboundBucket(row) {
  const text = String(row["ชื่อแปลง / เลขที่เอกสาร"] || "");
  if (text.includes("Contract Farmer")) return "customer";
  if (text.includes("บางกัน")) return "banggun";
  if (text.includes("กะเปา")) return "kapao";
  if (text.includes("ตะกุกเหนือ")) return "takukNorth";
  if (text.includes("ตะกุก")) return "takuk";
  if (text.includes("RSPO")) return "estate";
  return "other";
}

function blankDaily(day) {
  return {
    date: day,
    opening: 0,
    customer: 0,
    estate: 0,
    banggun: 0,
    kapao: 0,
    takukNorth: 0,
    takuk: 0,
    totalRamp: 0,
    timeDay: 0,
    timeEvening: 0,
    inboundRspo: 0,
    inboundNonRspo: 0,
    inboundTotal: 0,
    totalAll: 0,
    outboundPr: 0,
    outboundBanggun: 0,
    outboundKapao: 0,
    outboundTakukNorth: 0,
    outboundTakuk: 0,
    outboundRspo: 0,
    outboundNonRspo: 0,
    outboundTotal: 0,
    facNet: 0,
    clearPr: 0,
    clearTk: 0,
    clear: 0,
    lossRamp: 0,
    lossTransport: 0,
    loss: 0,
    tripCount: 0,
    balance: 0,
  };
}

function buildDaily(scope) {
  const rows = filteredMovementRows();
  const map = new Map();
  const clears = clearMap();

  for (const row of rows) {
    const rowScope = movementScope(row);
    if (scope !== "combined" && rowScope !== scope) continue;
    const day = row._date;
    const item = map.get(day) || blankDaily(day);
    const inbound = n(row["รับเข้า (kg)"]);
    const outbound = n(row["ส่งออก (kg)"]);
    const fac = n(row["รับปลายทาง"]);
    const hour = Number(String(row["วันที่/เวลา (AE)"] || "T12").slice(11, 13));
    const bucket = inboundBucket(row);

    if (inbound > 0) item[bucket] += inbound;
    item.totalRamp += inbound;
    if (hour >= 17) item.timeEvening += inbound;
    else item.timeDay += inbound;

    if (outbound > 0) {
      if (rowScope === "takuk") item.outboundTakuk += outbound;
      else if (bucket === "banggun") item.outboundBanggun += outbound;
      else if (bucket === "kapao") item.outboundKapao += outbound;
      else item.outboundPr += outbound;
      item.outboundTotal += outbound;
      item.facNet += fac;
      const diff = n(row["น้ำหนักเทียบปลายทาง"]);
      if (diff < 0) item.lossTransport += Math.abs(diff);
    }
    map.set(day, item);
  }

  for (const clear of clearRows()) {
    if (!inRange(clear.date)) continue;
    if (!map.has(clear.date)) map.set(clear.date, blankDaily(clear.date));
  }

  let carry = 0;
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => {
      const clear = clears.get(item.date);
      item.clearPr = scope === "takuk" ? 0 : n(clear?.clearPr);
      item.clearTk = scope === "garden" ? 0 : n(clear?.clearTk);
      item.clear = item.clearPr + item.clearTk;
      const hasClearOpening = scope === "garden"
        ? clear?.clearPrSet
        : scope === "takuk"
          ? clear?.clearTkSet
          : clear?.clearPrSet || clear?.clearTkSet;
      if (hasClearOpening) {
        carry = scope === "garden"
          ? n(clear?.clearPr)
          : scope === "takuk"
            ? n(clear?.clearTk)
            : (clear?.clearPrSet ? n(clear?.clearPr) : 0) + (clear?.clearTkSet ? n(clear?.clearTk) : 0);
      }
      item.lossRamp = n(clear?.lossRamp);
      const explicitTransportLoss = item.lossTransport;
      if (scope === "garden") {
        item.lossRamp = n(clear?.lossPrRamp);
        item.lossTransport = n(clear?.lossPrTransport) || explicitTransportLoss;
      }
      if (scope === "takuk") {
        item.lossRamp = n(clear?.lossTkRamp);
        item.lossTransport = n(clear?.lossTkTransport) || explicitTransportLoss;
      }
      item.loss = item.lossRamp + item.lossTransport;
      item.totalAll = carry + item.totalRamp;
      item.opening = carry;
      item.balance = carry + item.totalRamp - item.outboundTotal - item.loss;
      carry = item.balance;
      return item;
    });
}

function totals(rows) {
  return rows.reduce((acc, row) => {
    for (const key of Object.keys(row)) {
      if (typeof row[key] === "number") acc[key] = (acc[key] || 0) + row[key];
    }
    return acc;
  }, {});
}

function periodBalance(rows) {
  const t = totals(rows);
  return n(rows[0]?.opening) + n(t.totalRamp) - n(t.outboundTotal) - n(t.loss);
}

function exactRows(scope) {
  const workbookReport = state.payload.workbookReports?.[scope];
  if (workbookReport?.rows?.length) {
    return workbookReport.rows.filter((row) => inRange(row.date));
  }
  const report = state.payload.monthlyReports?.[scope];
  if (!report) return [];
  return report.rows.filter((row) => inRange(row.date));
}

function exactMetric(scope, cells, metric) {
  const map = {
    combined: { opening: 1, inbound: 10, outbound: 18, loss: 25, balance: 19 },
    garden: { opening: 1, inbound: 11, outbound: 19, loss: 25, balance: 20 },
    takuk: { opening: 1, inbound: 9, outbound: 17, loss: 23, balance: 18 },
  };
  return n(cells[map[scope][metric]]);
}

function exactFooter(scope, rows) {
  const metricIndex = {
    combined: { opening: 1, balance: 19 },
    garden: { opening: 1, balance: 20 },
    takuk: { opening: 1, balance: 18 },
  }[scope];
  const width = rows[0]?.cells.length || 0;
  const cells = [];
  for (let i = 0; i < width; i += 1) {
    if (i === 0) {
      cells.push("<td>รวม</td>");
    } else if (i === metricIndex.opening) {
      cells.push(`<td class="num">${fmt(rows[0]?.cells[i])}</td>`);
    } else if (i === metricIndex.balance) {
      cells.push(`<td class="num">${fmt(rows.at(-1)?.cells[i])}</td>`);
    } else {
      const values = rows.map((row) => row.cells[i]).filter((value) => typeof value === "number");
      const total = values.reduce((sum, value) => sum + value, 0);
      cells.push(`<td class="${total < 0 ? "num loss" : "num"}">${values.length ? fmt(total) : ""}</td>`);
    }
  }
  return `<tfoot><tr>${cells.join("")}</tr></tfoot>`;
}

function renderExactStock(scope, rows) {
  state.currentRows = rows.map((row) => ({ date: row.date, ...Object.fromEntries(row.cells.map((value, index) => [`c${index + 1}`, value])) }));
  const report = state.payload.workbookReports?.[scope] || state.payload.monthlyReports[scope];
  const inbound = rows.reduce((sum, row) => sum + exactMetric(scope, row.cells, "inbound"), 0);
  const outbound = rows.reduce((sum, row) => sum + exactMetric(scope, row.cells, "outbound"), 0);
  const loss = rows.reduce((sum, row) => sum + Math.abs(exactMetric(scope, row.cells, "loss")), 0);
  els.kpiOpening.textContent = fmt(rows.length ? exactMetric(scope, rows[0].cells, "opening") : 0);
  els.kpiInbound.textContent = fmt(inbound);
  els.kpiOutbound.textContent = fmt(outbound);
  els.kpiLoss.textContent = fmt(loss);
  els.kpiBalance.textContent = fmt(rows.length ? exactMetric(scope, rows.at(-1).cells, "balance") : 0);

  const title = `
    <div class="report-title">
      <h2>บริษัท ทักษิณปาล์ม (2521) จำกัด${scope === "combined" ? " - ฝ่ายสวนปาล์มคีรีรัฐนิคม" : ""}</h2>
      <p>รายงานสต๊อคผลปาล์มสด ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}</p>
      <p>${reportMeta(scope)}</p>
    </div>`;
  const headerRows = report.headers.map((header) => `<tr>${header.map((cell) => `<th>${cell ?? ""}</th>`).join("")}</tr>`).join("");
  const bodyRows = rows.map((row) => `<tr>${row.cells.map((cell, index) => {
    const value = index === 0 ? dayNumber(row.date) : cell;
    return typeof value === "number" ? `<td class="num">${fmt(value)}</td>` : `<td>${value ?? ""}</td>`;
  }).join("")}</tr>`).join("");
  els.reportPage.innerHTML = `${title}<div class="table-wrap"><table><thead>${headerRows}</thead><tbody>${bodyRows}</tbody>${exactFooter(scope, rows)}</table></div>`;
}

function renderDashboard(rows) {
  const t = totals(rows);
  els.kpiOpening.textContent = fmt(rows[0]?.opening || 0);
  els.kpiInbound.textContent = fmt(t.totalRamp);
  els.kpiOutbound.textContent = fmt(t.outboundTotal);
  els.kpiLoss.textContent = fmt(t.loss);
  els.kpiBalance.textContent = fmt(periodBalance(rows));
}

function reportMeta(scope) {
  const titles = {
    combined: "เครื่องชั่งแรมป์ปลายราง+เครื่องชั่งแรมป์ตะกุก",
    garden: "เครื่องชั่งแรมป์ปลายราง",
    takuk: "เครื่องชั่งแรมป์ตะกุก",
  };
  return titles[scope] || "";
}

function stockPrintTitle(scope) {
  const scopeTitle = {
    combined: "เครื่องชั่งแรมป์ปลายราง+เครื่องชั่งแรมป์ตะกุก",
    garden: "เครื่องชั่งแรมป์ปลายราง",
    takuk: "เครื่องชั่งแรมป์ตะกุก",
  };
  return scopeTitle[scope] || reportMeta(scope);
}

function stockPrintGroups(scope) {
  if (scope === "garden") {
    return [
      { key: "day", label: "วันที่", value: (r) => dayNumber(r.date), total: () => "รวม", average: () => "เฉลี่ย / วัน", row: true },
      { key: "opening", label: "น้ำหนัก<br>ยกมา", value: (r) => r.opening, total: () => 0, average: () => "" },
      { label: "เทปลายราง", cols: [
        { key: "customer", label: "ลูกค้า", value: (r) => r.customer },
        { key: "estate", label: "ปลายราง", value: (r) => r.estate },
      ] },
      { label: "น้ำหนักส่งผ่าน", cols: [
        { key: "banggun", label: "บางกัน", value: (r) => r.banggun },
        { key: "kapao", label: "กะเปา", value: (r) => r.kapao },
      ] },
      { key: "totalRamp", label: "รวมน้ำหนัก<br>ลงแรมป์", value: (r) => r.totalRamp },
      { key: "totalAll", label: "รวมน้ำหนัก<br>ทั้งหมด", value: (r) => r.totalAll, totalKey: "totalRamp" },
      { label: "น้ำหนักส่งออก", cols: [
        { key: "outboundPr", label: "ปลายราง", value: (r) => r.outboundPr },
        { key: "outboundBanggun", label: "บางกัน", value: (r) => r.outboundBanggun },
        { key: "outboundKapao", label: "กะเปา", value: (r) => r.outboundKapao },
      ] },
      { key: "outboundTotal", label: "รวม<br>น้ำหนัก<br>ส่งออก", value: (r) => r.outboundTotal },
      { key: "balance", label: "น้ำหนัก<br>คงเหลือ", value: (r) => r.balance, total: (rows) => periodBalance(rows), average: (rows) => averageOf(rows, "balance") },
      { key: "clearPr", label: "เคลียร์<br>แรมป์", value: (r) => r.clearPr },
      { key: "facNet", label: "น้ำหนัก<br>โรงงาน", value: (r) => r.facNet },
      { label: "น้ำหนักสูญหาย", cols: [
        { key: "lossRamp", label: "แรมป์", value: (r) => -n(r.lossRamp), loss: true },
        { key: "lossTransport", label: "ขนส่ง", value: (r) => -n(r.lossTransport), loss: true },
        { key: "loss", label: "รวม", value: (r) => -n(r.loss), loss: true },
      ] },
    ];
  }
  if (scope === "takuk") {
    return [
      { key: "day", label: "วันที่", value: (r) => dayNumber(r.date), total: () => "รวม", average: () => "เฉลี่ย / วัน", row: true },
      { key: "opening", label: "น้ำหนัก<br>ยกมา", value: (r) => r.opening, total: () => 0, average: () => "" },
      { label: "น้ำหนักลงแรมป์", cols: [
        { key: "takukNorth", label: "ตะกุกเหนือ", value: (r) => r.takukNorth },
        { key: "takuk", label: "ตะกุก", value: (r) => r.takuk },
      ] },
      { key: "totalRamp", label: "รวม<br>น้ำหนัก<br>ลงแรมป์", value: (r) => r.totalRamp },
      { key: "totalAll", label: "รวม<br>น้ำหนัก<br>ทั้งหมด", value: (r) => r.totalAll, totalKey: "totalRamp" },
      { label: "น้ำหนักส่งออก", cols: [
        { key: "outboundTakukNorth", label: "ตะกุกเหนือ", value: (r) => r.outboundTakukNorth },
        { key: "outboundTakuk", label: "ตะกุก", value: (r) => r.outboundTakuk },
      ] },
      { key: "outboundTotal", label: "รวม<br>น้ำหนัก<br>ส่งออก", value: (r) => r.outboundTotal },
      { key: "balance", label: "น้ำหนัก<br>คงเหลือ", value: (r) => r.balance, total: (rows) => periodBalance(rows), average: (rows) => averageOf(rows, "balance") },
      { key: "clearTk", label: "เคลียร์<br>แรมป์", value: (r) => r.clearTk },
      { key: "facNet", label: "น้ำหนัก<br>โรงงาน", value: (r) => r.facNet },
      { label: "น้ำหนักสูญหาย", cols: [
        { key: "lossRamp", label: "แรมป์", value: (r) => -n(r.lossRamp), loss: true },
        { key: "lossTransport", label: "ขนส่ง", value: (r) => -n(r.lossTransport), loss: true },
        { key: "loss", label: "รวม", value: (r) => -n(r.loss), loss: true },
      ] },
    ];
  }
  return [
    { key: "day", label: "วันที่", value: (r) => dayNumber(r.date), total: () => "รวม", average: () => "เฉลี่ย / วัน", row: true },
    { key: "opening", label: "น้ำหนัก<br>ยกมา", value: (r) => r.opening, total: () => 0, average: () => "" },
    { label: "น้ำหนักลงแรมป์", cols: [
      { key: "customer", label: "ลูกค้า", value: (r) => r.customer },
      { key: "estate", label: "ปลายราง", value: (r) => r.estate },
      { key: "banggun", label: "บางกัน", value: (r) => r.banggun },
      { key: "kapao", label: "กะเปา", value: (r) => r.kapao },
      { key: "takukTotal", label: "ตะกุก", value: (r) => n(r.takukNorth) + n(r.takuk) },
      { key: "totalRamp", label: "รวม", value: (r) => r.totalRamp },
    ] },
    { key: "totalAll", label: "รวม<br>น้ำหนัก<br>ทั้งหมด", value: (r) => r.totalAll, totalKey: "totalRamp" },
    { label: "น้ำหนักส่งออก", cols: [
      { key: "outboundPr", label: "ปลายราง", value: (r) => r.outboundPr },
      { key: "outboundBanggun", label: "บางกัน", value: (r) => r.outboundBanggun },
      { key: "outboundKapao", label: "กะเปา", value: (r) => r.outboundKapao },
      { key: "outboundTakukTotal", label: "ตะกุก", value: (r) => n(r.outboundTakukNorth) + n(r.outboundTakuk) },
      { key: "outboundTotal", label: "รวม", value: (r) => r.outboundTotal },
    ] },
    { key: "balance", label: "น้ำหนัก<br>คงเหลือ", value: (r) => r.balance, total: (rows) => periodBalance(rows), average: (rows) => averageOf(rows, "balance") },
    { label: "เคลียร์แรมป์", cols: [
      { key: "clearPr", label: "ปลาย<br>ราง", value: (r) => r.clearPr },
      { key: "clearTk", label: "ตะกุก", value: (r) => r.clearTk },
    ] },
    { key: "facNet", label: "น้ำหนัก<br>โรงงาน", value: (r) => r.facNet },
    { label: "น้ำหนักสูญหาย", cols: [
      { key: "lossRamp", label: "แรมป์", value: (r) => -n(r.lossRamp), loss: true },
      { key: "lossTransport", label: "ขนส่ง", value: (r) => -n(r.lossTransport), loss: true },
      { key: "loss", label: "รวม", value: (r) => -n(r.loss), loss: true },
    ] },
  ];
}

function stockPrintLeaves(groups) {
  return groups.flatMap((group) => group.cols || [group]);
}

function averageOf(rows, key) {
  return rows.length ? rows.reduce((sum, row) => sum + n(row[key]), 0) / rows.length : 0;
}

function stockPrintValue(value, zero = "-") {
  if (typeof value === "string") return value;
  const parsed = n(value);
  if (!parsed) return zero;
  return fmt(parsed);
}

function stockPrintHeader(groups) {
  const top = groups.map((group) => {
    if (group.cols) return `<th colspan="${group.cols.length}">${group.label}</th>`;
    return `<th rowspan="2">${group.label}</th>`;
  }).join("");
  const sub = groups.filter((group) => group.cols).flatMap((group) => group.cols.map((col) => `<th>${col.label}</th>`)).join("");
  return `<thead><tr>${top}</tr><tr>${sub}</tr></thead>`;
}

function stockPrintSummaryCell(col, rows, mode) {
  if (mode === "total") {
    if (col.total) return col.total(rows);
    if (col.totalKey) return rows.reduce((sum, row) => sum + n(row[col.totalKey]), 0);
    return rows.reduce((sum, row) => sum + n(col.value(row)), 0);
  }
  if (col.average) return col.average(rows);
  if (col.loss) {
    const outbound = rows.reduce((sum, row) => sum + n(row.outboundTotal), 0);
    const loss = Math.abs(rows.reduce((sum, row) => sum + n(col.value(row)), 0));
    return outbound ? -((loss / outbound) * 100).toFixed(2) : 0;
  }
  if (col.row) return col.average(rows);
  if (col.key === "opening") return "";
  if (col.key === "balance") return averageOf(rows, "balance");
  const total = col.totalKey
    ? rows.reduce((sum, row) => sum + n(row[col.totalKey]), 0)
    : rows.reduce((sum, row) => sum + n(col.value(row)), 0);
  return rows.length ? total / rows.length : 0;
}

function stockPrintFooter(groups, rows) {
  const leaves = stockPrintLeaves(groups);
  const totalCells = leaves.map((col) => `<td class="${col.loss ? "loss" : ""}">${stockPrintValue(stockPrintSummaryCell(col, rows, "total"), "0")}</td>`).join("");
  const avgCells = leaves.map((col) => {
    const value = stockPrintSummaryCell(col, rows, "average");
    const display = col.loss && typeof value !== "string" ? n(value).toFixed(2) : stockPrintValue(value, col.loss ? "0" : "-");
    return `<td class="${col.loss ? "loss" : ""}">${display}</td>`;
  }).join("");
  return `<tfoot><tr>${totalCells}</tr><tr>${avgCells}</tr></tfoot>`;
}

function stockMoneyValue(scope) {
  const movementMap = movementBySourceRow();
  return (state.records || []).reduce((sum, record) => {
    const date = record.weightDate || record.date;
    if (!date || !inRange(date) || record.wpInOutType !== "I") return sum;
    const movement = movementMap.get(Number(record._srcRow));
    const rowScope = movement ? movementScope(movement) : dataRecordScope(record);
    if (scope !== "combined" && rowScope !== scope) return sum;
    if (!recordMatchesGlobalFilters(record, movement)) return sum;
    if (record.standard !== "Contract Farmer") return sum;
    return sum + (n(record.wpNetWeight) * n(record.wpBunchPrice));
  }, 0);
}

function stockAuditMetrics(rows, scope) {
  const t = totals(rows);
  return {
    opening: n(rows[0]?.opening),
    operation: n(t.estate) + n(t.banggun) + n(t.kapao) + n(t.takukNorth) + n(t.takuk),
    customer: n(t.customer),
    inbound: n(t.totalRamp),
    outboundKm8: n(t.outboundTotal),
    outboundKm20: 0,
    outbound: n(t.outboundTotal),
    balance: periodBalance(rows),
    factoryKm8: n(t.facNet),
    factoryKm20: 0,
    factory: n(t.facNet),
    transportLoss: n(t.lossTransport),
    estimate: 0,
    clear: scope === "takuk" ? n(t.clearTk) : scope === "garden" ? n(t.clearPr) : n(t.clearPr) + n(t.clearTk),
    rampLoss: n(t.lossRamp),
    loss: n(t.loss),
    money: stockMoneyValue(scope),
  };
}

function auditTon(value, dash = true) {
  const parsed = n(value);
  if (!parsed && dash) return "-";
  return tonNf.format(parsed / 1000);
}

function auditPct(value, outbound) {
  const parsed = n(value);
  return parsed && outbound ? `${((parsed / n(outbound)) * 100).toFixed(2)}%` : "";
}

function auditMetricCells(garden, takuk, key, percent = false) {
  const combined = n(garden[key]) + n(takuk[key]);
  const gardenPct = percent ? auditPct(garden[key], garden.outbound) : "";
  const takukPct = percent ? auditPct(takuk[key], takuk.outbound) : "";
  const combinedPct = percent ? auditPct(combined, n(garden.outbound) + n(takuk.outbound)) : "";
  return `
    <td class="num">${auditTon(garden[key])}</td><td>${gardenPct}</td>
    <td class="num">${auditTon(takuk[key])}</td><td>${takukPct}</td>
    <td class="num">${auditTon(combined)}</td><td>${combinedPct}</td>`;
}

function auditMoneyCells(garden, takuk) {
  const combined = n(garden.money) + n(takuk.money);
  return `
    <td colspan="5" class="num money">${moneyNf.format(n(garden.money))}</td><td>บาท</td>
    <td colspan="5" class="num money">${moneyNf.format(combined)}</td><td>บาท</td>`;
}

function stockAuditTable(garden, takuk) {
  const rows = [
    { label: "ยอดยกมา", key: "opening" },
    { label: "รับเข้า&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- แปลงปฏิบัติการ", key: "operation" },
    { label: "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- ลูกค้า (ธกส.)", key: "customer" },
    { label: "รวมน้ำหนักรับเข้า", key: "inbound", className: "audit-total" },
    { label: "น้ำหนักส่งออก&nbsp;&nbsp;&nbsp;- โรงงาน กม.8", key: "outboundKm8" },
    { label: "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- โรงงาน กม.20", key: "outboundKm20" },
    { label: "รวมน้ำหนักส่งออก", key: "outbound", className: "audit-total" },
    { label: "น้ำหนักคงเหลือที่แรมป์", key: "balance", className: "audit-balance" },
    { label: "น้ำหนักรับโรงงาน&nbsp;&nbsp;- โรงงาน กม.8", key: "factoryKm8" },
    { label: "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- โรงงาน กม.20", key: "factoryKm20" },
    { label: "รวมน้ำหนักรับโรงงาน", key: "factory", className: "audit-total" },
    { label: "น้ำหนักสูญเสียระหว่างขนส่ง", key: "transportLoss", percent: true },
    { label: "ตรวจนับสต็อค&nbsp;&nbsp;&nbsp;&nbsp;- ประมาณการ", key: "estimate" },
    { label: "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- ชั่งน้ำหนัก (เคลียร์แรมป์)", key: "clear" },
    { label: "น้ำหนักสูญเสียที่แรมป์", key: "rampLoss", percent: true, className: "audit-loss" },
    { label: "น้ำหนักสูญเสียทั้งหมด", key: "loss", percent: true, className: "audit-grand-loss" },
  ];
  return `
    <table class="stock-audit-table">
      <thead>
        <tr>
          <th rowspan="2">รายการ</th>
          <th colspan="6">${stockPeriodCaption("เดือน")}</th>
          <th colspan="6">สะสม ${stockPeriodCaption("")}</th>
        </tr>
        <tr>
          <th colspan="2">แรมป์สวน</th><th colspan="2">แรมป์ตะกุก</th><th colspan="2">รวม</th>
          <th colspan="2">แรมป์สวน</th><th colspan="2">แรมป์ตะกุก</th><th colspan="2">รวม</th>
        </tr>
        <tr>
          <th></th>
          <th>น้ำหนัก (ตัน)</th><th>%</th><th>น้ำหนัก (ตัน)</th><th>%</th><th>น้ำหนัก (ตัน)</th><th>%</th>
          <th>น้ำหนัก (ตัน)</th><th>%</th><th>น้ำหนัก (ตัน)</th><th>%</th><th>น้ำหนัก (ตัน)</th><th>%</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr class="${row.className || ""}">
          <td class="left">${row.label}</td>
          ${auditMetricCells(garden, takuk, row.key, row.percent)}
          ${auditMetricCells(garden, takuk, row.key, row.percent)}
        </tr>`).join("")}
        <tr class="audit-money">
          <td class="left">มูลค่ารับซื้อผลปาล์มลูกค้า (ธกส.)</td>
          ${auditMoneyCells(garden, takuk)}
        </tr>
      </tbody>
    </table>`;
}

function renderStockAuditPage(scope) {
  const garden = scope === "takuk" ? stockAuditMetrics([], "garden") : stockAuditMetrics(buildStockFromData("garden"), "garden");
  const takuk = scope === "garden" ? stockAuditMetrics([], "takuk") : stockAuditMetrics(buildStockFromData("takuk"), "takuk");
  return `
    <section class="stock-print-page stock-audit-page">
      <div class="stock-audit-title">
        <h2>รายงานการตรวจนับสต็อคผลปาล์มสด ประจำ${stockPeriodCaption("เดือน")}</h2>
        <h3>${stockPeriodCaption("เดือน")}</h3>
      </div>
      ${stockAuditTable(garden, takuk)}
      <div class="stock-signatures">
        <div>
          <strong>ผู้จัดทำรายงาน</strong>
          <span></span>
          <p>(........................................)</p>
          <small>วัน/เดือน/ปี........................</small>
        </div>
        <div>
          <strong>ผู้ตรวจสอบ</strong>
          <span></span>
          <p>( นายเพชรรัตน์&nbsp;&nbsp;ภิรอด )</p>
          <small>วัน/เดือน/ปี........................</small>
        </div>
        <div>
          <strong>ผช.ผอ.ฝ่ายสวนปาล์มฯ</strong>
          <span></span>
          <p>( นางสาวโสภิตา&nbsp;&nbsp;แซ่จู )</p>
          <small>วัน/เดือน/ปี........................</small>
        </div>
      </div>
      <div class="stock-copy-list">
        <p><b>สำเนาเรียน</b> คุณศรีนา/คุณศราฯ เพื่อโปรดทราบ</p>
        <p><b>สำเนา</b> บัญชี กม.8 เพื่อทราบ</p>
      </div>
    </section>`;
}

function stockPrintBody(groups, rows) {
  const leaves = stockPrintLeaves(groups);
  return `<tbody>${rows.map((row) => `<tr>${leaves.map((col) => {
    const value = col.value(row);
    return `<td class="${col.loss ? "loss" : ""}">${stockPrintValue(value, col.loss ? "0" : "-")}</td>`;
  }).join("")}</tr>`).join("")}</tbody>`;
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

function renderStockPrintPages(scope, rows) {
  const groups = stockPrintGroups(scope);
  const chunks = chunkRows(rows, 29);
  const detailPages = chunks.length;
  return `<div class="stock-print">
    ${chunks.map((chunk, index) => `
      <section class="stock-print-page">
        <div class="stock-print-head">
          <div>
            <h2>บริษัท ทักษิณปาล์ม (2521) จำกัด${scope === "combined" ? " - ฝ่ายสวนปาล์มคีรีรัฐนิคม" : ""}</h2>
            <h3>รายงานสต็อคผลปาล์มสด ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}</h3>
            <p>${stockPrintTitle(scope)}</p>
          </div>
          <span>${index + 1}/${detailPages}</span>
        </div>
        <table class="stock-print-table stock-print-${scope}">
          ${stockPrintHeader(groups)}
          ${stockPrintBody(groups, chunk)}
          ${index === chunks.length - 1 ? stockPrintFooter(groups, rows) : ""}
        </table>
      </section>`).join("")}
    ${renderStockAuditPage(scope)}
  </div>`;
}

function openPrintPreview() {
  if (state.view !== "stock") {
    window.print();
    return;
  }
  normalizeDateInput(els.startDate);
  normalizeDateInput(els.endDate);
  renderStock(yardScope());
  const printSource = els.reportPage.querySelector(".stock-print");
  if (!printSource) return;
  els.printPreviewBody.innerHTML = printSource.innerHTML;
  els.printPreviewModal.classList.remove("hidden");
  els.printPreviewModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("preview-open");
}

function closePrintPreview() {
  els.printPreviewModal.classList.add("hidden");
  els.printPreviewModal.setAttribute("aria-hidden", "true");
  els.printPreviewBody.innerHTML = "";
  document.body.classList.remove("preview-open");
}

function buildStockFromData(scope) {
  const movementMap = movementBySourceRow();
  const useClearAdjustments = globalFiltersAreAll();
  const clearByDate = useClearAdjustments ? clearMap() : new Map();
  const dayMap = new Map();
  const end = dateValue(els.endDate) || "9999-12-31";
  const start = dateValue(els.startDate) || "0000-00-00";

  function scopedDay(date, dayScope) {
    const key = `${date}|${dayScope}`;
    if (!dayMap.has(key)) dayMap.set(key, blankDaily(date));
    return dayMap.get(key);
  }

  for (const record of state.records) {
    const date = record.weightDate || record.date;
    if (!date || date > end) continue;
    const movement = movementMap.get(Number(record._srcRow));
    if (!recordMatchesGlobalFilters(record, movement)) continue;
    const rowScope = movement ? movementScope(movement) : dataRecordScope(record);
    const item = scopedDay(date, rowScope);
    const weight = n(record.wpNetWeight);
    const hour = Number(String(record.wpCarWeightDate || "T12").slice(11, 13));

    if (record.wpInOutType === "I") {
      const bucket = dataInboundBucket(record);
      item[bucket] += weight;
      item.totalRamp += weight;
      item.inboundTotal += weight;
      if (recordStandardBucket(record, movement) === "RSPO") item.inboundRspo += weight;
      else item.inboundNonRspo += weight;
      if (hour >= 17) item.timeEvening += weight;
      else item.timeDay += weight;
    }

    if (record.wpInOutType === "O") {
      if (rowScope === "takuk") item.outboundTakuk += weight;
      else item.outboundPr += weight;
      item.outboundTotal += weight;
      item.tripCount += 1;
      if (recordStandardBucket(record, movement) === "RSPO") item.outboundRspo += weight;
      else item.outboundNonRspo += weight;
      item.facNet += n(record.wpFacNetWeight);
      const diff = n(record.wpFacNetWeight) - weight;
      if (diff < 0) item.lossTransport += Math.abs(diff);
    }
  }

  if (useClearAdjustments) {
    for (const clear of clearRows()) {
      if (!clear.date || clear.date > end) continue;
      scopedDay(clear.date, "garden");
      scopedDay(clear.date, "takuk");
    }
  }

  for (const date of daysBetween(start, end)) {
    scopedDay(date, "garden");
    scopedDay(date, "takuk");
  }

  const dates = [...new Set([...dayMap.keys()].map((key) => key.split("|")[0]))].sort();
  let carryGarden = 0;
  let carryTakuk = 0;
  const result = [];

  for (const date of dates) {
    const clear = clearByDate.get(date);
    const garden = dayMap.get(`${date}|garden`) || blankDaily(date);
    const takuk = dayMap.get(`${date}|takuk`) || blankDaily(date);

    applyScopeOpening(garden, "garden", clear, carryGarden);
    applyScopeOpening(takuk, "takuk", clear, carryTakuk);
    carryGarden = garden.balance;
    carryTakuk = takuk.balance;

    const combined = combineScopeDays(date, garden, takuk, clear);
    if (date >= start && date <= end) {
      if (scope === "garden") result.push(garden);
      else if (scope === "takuk") result.push(takuk);
      else result.push(combined);
    }
  }

  return result;
}

function applyScopeOpening(item, scope, clear, previousBalance) {
  const useClear = scope === "garden" ? clear?.clearPrSet : clear?.clearTkSet;
  item.opening = useClear ? (scope === "garden" ? n(clear?.clearPr) : n(clear?.clearTk)) : previousBalance;
  item.clearPr = scope === "garden" ? n(clear?.clearPr) : 0;
  item.clearTk = scope === "takuk" ? n(clear?.clearTk) : 0;
  item.clear = item.clearPr + item.clearTk;
  item.lossRamp = scope === "garden" ? n(clear?.lossPrRamp) : n(clear?.lossTkRamp);
  item.lossTransport = (scope === "garden" ? n(clear?.lossPrTransport) : n(clear?.lossTkTransport)) || item.lossTransport;
  item.loss = item.lossRamp + item.lossTransport;
  item.totalAll = item.opening + item.totalRamp;
  item.balance = item.opening + item.totalRamp - item.outboundTotal - item.loss;
}

function combineScopeDays(date, garden, takuk, clear) {
  const combined = blankDaily(date);
  for (const key of Object.keys(combined)) {
    if (typeof combined[key] === "number") combined[key] = n(garden[key]) + n(takuk[key]);
  }
  combined.date = date;
  combined.clearPr = n(clear?.clearPr);
  combined.clearTk = n(clear?.clearTk);
  combined.clear = combined.clearPr + combined.clearTk;
  combined.lossRamp = n(garden.lossRamp) + n(takuk.lossRamp);
  combined.lossTransport = n(garden.lossTransport) + n(takuk.lossTransport);
  combined.loss = combined.lossRamp + combined.lossTransport;
  combined.opening = n(garden.opening) + n(takuk.opening);
  combined.balance = n(garden.balance) + n(takuk.balance);
  combined.totalAll = combined.opening + combined.totalRamp;
  return combined;
}

function renderStock(scope) {
  const rows = buildStockFromData(scope);
  state.currentRows = rows;
  renderDashboard(rows);
  els.reportPage.classList.add("stock-report-page");
  const t = totals(rows);

  const title = `
    <div class="report-title">
      <h2>บริษัท ทักษิณปาล์ม (2521) จำกัด${scope === "combined" ? " - ฝ่ายสวนปาล์มคีรีรัฐนิคม" : ""}</h2>
      <p>รายงานสต๊อคผลปาล์มสด ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}</p>
      <p>${reportMeta(scope)}</p>
    </div>`;

  const body = rows.map((r) => `
    <tr>
      <td>${dayNumber(r.date)}</td>
      <td class="num">${fmt(r.opening)}</td>
      <td class="num">${fmt(r.customer)}</td>
      <td class="num">${fmt(r.estate)}</td>
      <td class="num">${fmt(r.banggun + r.kapao)}</td>
      <td class="num">${fmt(r.customer)}</td>
      <td class="num">${fmt(r.estate)}</td>
      <td class="num">${fmt(r.banggun)}</td>
      <td class="num">${fmt(r.kapao)}</td>
      <td class="num">${fmt(r.takukNorth)}</td>
      <td class="num">${fmt(r.takuk)}</td>
      <td class="num">${fmt(r.totalRamp)}</td>
      <td class="num">${fmt(r.timeDay)}</td>
      <td class="num">${fmt(r.timeEvening)}</td>
      <td class="num">${fmt(r.inboundRspo)}</td>
      <td class="num">${fmt(r.inboundNonRspo)}</td>
      <td class="num">${fmt(r.inboundTotal || r.totalRamp)}</td>
      <td class="num">${fmt(r.outboundPr)}</td>
      <td class="num">${fmt(r.outboundBanggun)}</td>
      <td class="num">${fmt(r.outboundKapao)}</td>
      <td class="num">${fmt(r.outboundTakukNorth)}</td>
      <td class="num">${fmt(r.outboundTakuk)}</td>
      <td class="num">${fmt(r.outboundRspo)}</td>
      <td class="num">${fmt(r.outboundNonRspo)}</td>
      <td class="num">${fmt(r.outboundTotal)}</td>
      <td class="num">${fmt(r.balance)}</td>
      <td class="num">${fmt(r.clearPr)}</td>
      <td class="num">${fmt(r.clearTk)}</td>
      <td class="num">${fmt(r.facNet)}</td>
      <td class="num loss">${fmt(r.lossRamp)}</td>
      <td class="num loss">${fmt(r.lossTransport)}</td>
      <td class="num loss">${fmt(r.loss)}</td>
      <td class="num">${fmt(r.tripCount)}</td>
    </tr>`).join("");

  els.reportPage.innerHTML = `${title}
    <div class="table-wrap stock-web-table">
      <table>
        <thead>
          <tr>
            <th rowspan="2">วันที่/เดือน</th>
            <th rowspan="2">น้ำหนัก<br>ยกมา</th>
            <th colspan="3">ปลายราง / คีรีรัฐ</th>
            <th colspan="7">น้ำหนักลงแรมป์</th>
            <th colspan="2">ช่วงเวลา</th>
            <th colspan="3">น้ำหนักรับเข้า</th>
            <th colspan="8">น้ำหนักส่งออก</th>
            <th rowspan="2">น้ำหนัก<br>คงเหลือ</th>
            <th colspan="2">เคลียร์แรมป์</th>
            <th rowspan="2">น้ำหนัก<br>โรงงาน</th>
            <th colspan="3">น้ำหนักสูญหาย</th>
            <th rowspan="2">จำนวน<br>เที่ยว</th>
          </tr>
          <tr>
            <th>ลูกค้า</th><th>ปาล์มสวนฯ</th><th>บางกัน/กะเปา</th>
            <th>ลูกค้า</th><th>ปลายราง</th><th>บางกัน</th><th>กะเปา</th><th>ตะกุกเหนือ</th><th>ตะกุก</th><th>รวม</th>
            <th>8.00-17.00</th><th>17.00-19.00</th>
            <th>RSPO</th><th>NON-RSPO</th><th>รวม</th>
            <th>ปลายราง</th><th>บางกัน</th><th>กะเปา</th><th>ตะกุกเหนือ</th><th>ตะกุก</th><th>RSPO</th><th>NON-RSPO</th><th>รวม</th>
            <th>ปลายราง</th><th>ตะกุก</th>
            <th>แรมป์</th><th>ขนส่ง</th><th>รวม</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr>
            <td>รวม</td>
            <td class="num">${fmt(rows[0]?.opening || 0)}</td>
            <td class="num">${fmt(t.customer)}</td>
            <td class="num">${fmt(t.estate)}</td>
            <td class="num">${fmt((t.banggun || 0) + (t.kapao || 0))}</td>
            <td class="num">${fmt(t.customer)}</td>
            <td class="num">${fmt(t.estate)}</td>
            <td class="num">${fmt(t.banggun)}</td>
            <td class="num">${fmt(t.kapao)}</td>
            <td class="num">${fmt(t.takukNorth)}</td>
            <td class="num">${fmt(t.takuk)}</td>
            <td class="num">${fmt(t.totalRamp)}</td>
            <td class="num">${fmt(t.timeDay)}</td>
            <td class="num">${fmt(t.timeEvening)}</td>
            <td class="num">${fmt(t.inboundRspo)}</td>
            <td class="num">${fmt(t.inboundNonRspo)}</td>
            <td class="num">${fmt(t.inboundTotal || t.totalRamp)}</td>
            <td class="num">${fmt(t.outboundPr)}</td>
            <td class="num">${fmt(t.outboundBanggun)}</td>
            <td class="num">${fmt(t.outboundKapao)}</td>
            <td class="num">${fmt(t.outboundTakukNorth)}</td>
            <td class="num">${fmt(t.outboundTakuk)}</td>
            <td class="num">${fmt(t.outboundRspo)}</td>
            <td class="num">${fmt(t.outboundNonRspo)}</td>
            <td class="num">${fmt(t.outboundTotal)}</td>
            <td class="num">${fmt(periodBalance(rows))}</td>
            <td class="num">${fmt(t.clearPr)}</td>
            <td class="num">${fmt(t.clearTk)}</td>
            <td class="num">${fmt(t.facNet)}</td>
            <td class="num loss">${fmt(t.lossRamp)}</td>
            <td class="num loss">${fmt(t.lossTransport)}</td>
            <td class="num loss">${fmt(t.loss)}</td>
            <td class="num">${fmt(t.tripCount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    ${renderStockPrintPages(scope, rows)}`;
}

function renderMovement() {
  const rows = filteredMovementRows();
  const grouped = buildMovementGroups(rows);
  state.currentRows = grouped.flatMap((group) => group.days.map((day) => ({
    group: group.name,
    date: day.date,
    in: day.in,
    out: day.out,
    opening: day.opening,
    balance: day.balance,
  })));
  renderDashboard(buildDaily("combined"));
  els.reportPage.innerHTML = `
    <div class="report-title">
      <h2>รายงานเคลื่อนไหวปาล์มน้ำมัน</h2>
      <p>ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}</p>
      <p>หน้าเดียว แบ่งคอลัมน์ตามลานและมาตรฐาน พร้อมยอดรับเข้า/ส่งออก/คงเหลือรายวัน</p>
    </div>
    ${renderMovementMatrix(grouped)}`;
}

function renderDailyReport() {
  const headers = DAILY_HEADERS;
  const rows = dailyRowsFromData().filter((row) => row._date && inRange(row._date) && dailyRowMatches(row));
  state.currentRows = rows;
  renderDashboard(buildStockFromData(yardScope()));

  const totals = rows.reduce((acc, row) => {
    for (const key of ["ปลายราง (RSPO)", "ปลายราง (NON-RSPO)", "ตะกุก (RSPO)", "ตะกุก (NON-RSPO)", "รวม", "น้ำหนักปลายทางโรงงาน", "น้ำหนักเทียบปลายทาง"]) {
      acc[key] = (acc[key] || 0) + n(row[key]);
    }
    return acc;
  }, {});

  const grouped = groupDailyRows(rows);
  els.reportPage.innerHTML = `
    <div class="report-title">
      <h2>Daily Report - รายงานรับเข้า / ส่งออก แยกกลุ่มรายวัน</h2>
      <p>ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}</p>
      <p>คำนวณจากชีต data โดยตรง เพื่อให้รับเข้า/ส่งออกครบทุกเดือน</p>
    </div>
    <div class="daily-summary">
      <article><span>ปลายราง (RSPO)</span><strong>${fmt(totals["ปลายราง (RSPO)"])}</strong></article>
      <article><span>ปลายราง (NON-RSPO)</span><strong>${fmt(totals["ปลายราง (NON-RSPO)"])}</strong></article>
      <article><span>ตะกุก (RSPO)</span><strong>${fmt(totals["ตะกุก (RSPO)"])}</strong></article>
      <article><span>ตะกุก (NON-RSPO)</span><strong>${fmt(totals["ตะกุก (NON-RSPO)"])}</strong></article>
      <article><span>รวม</span><strong>${fmt(totals["รวม"])}</strong></article>
    </div>
    <div class="table-wrap daily-table-wrap">
      <table class="daily-report-table">
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${grouped.map((group) => `
            <tr class="section-label"><td colspan="${headers.length}">${displayDate(group.date)} | รับเข้า ${fmt(group.in)} | ส่งออก ${fmt(group.out)} | รวม ${fmt(group.total)}</td></tr>
            ${group.rows.map((row) => `<tr>${headers.map((h) => dailyCell(row[h], h)).join("")}</tr>`).join("")}
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            ${headers.map((h, index) => dailyFooterCell(h, index, totals, rows.length)).join("")}
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function dailyRowsFromData() {
  const movementMap = movementBySourceRow();
  return (state.records || [])
    .map((record) => {
      const date = record.weightDate || record.date;
      const flow = recordFlow(record);
      const movement = movementMap.get(Number(record._srcRow));
      if (!recordMatchesGlobalFilters(record, movement)) return null;
      const scope = movement ? movementScope(movement) : dataRecordScope(record);
      const standard = flow === "รับเข้า" ? (record.standard || "") : recordStandardBucket(record, movement) || "NON-RSPO";
      const groupStandard = standard === "RSPO" ? "RSPO" : "NON-RSPO";
      const yardName = scope === "takuk" ? "ตะกุก" : "ปลายราง";
      const groupName = `${yardName} (${groupStandard})`;
      const weight = n(record.wpNetWeight);
      const row = {
        "วันที่": date,
        "เวลา": record.wpCarWeightDate || record.wpDocDate || "",
        "กลุ่ม": flow,
        "กอง / รายการ": groupName,
        "เอกสาร/ใบชั่ง": record.wpDocNo || "",
        "มาตรฐาน/ประเภท": standard,
        "ผู้ส่ง": record.name || record.wpctCode || "",
        "ทะเบียน": record.wpCarLicense || "",
        "คนขับ": record.wpDriver || "",
        "โรงงาน": flow === "ส่งออก" ? (record.wpftcode || record.wpFacDocNo || "") : "",
        "ปลายราง (RSPO)": 0,
        "ปลายราง (NON-RSPO)": 0,
        "ตะกุก (RSPO)": 0,
        "ตะกุก (NON-RSPO)": 0,
        "รวม": weight,
        "น้ำหนักปลายทางโรงงาน": flow === "ส่งออก" ? n(record.wpFacNetWeight) : null,
        "น้ำหนักเทียบปลายทาง": flow === "ส่งออก" ? n(record.wpFacNetWeight) - weight : null,
        _date: date,
      };
      row[groupName] = weight;
      return row;
    })
    .filter(Boolean)
    .filter((row) => row._date && row["รวม"])
    .sort((a, b) => {
      const dateCompare = a._date.localeCompare(b._date);
      if (dateCompare) return dateCompare;
      return String(a["เวลา"] || "").localeCompare(String(b["เวลา"] || ""));
    });
}

function dailyFooterCell(header, index, totals, rowCount) {
  if (index === 0) return "<td>รวม</td>";
  if (header === "กลุ่ม") return `<td>${fmt(rowCount)} รายการ</td>`;
  if (totals[header] !== undefined) return `<td class="${n(totals[header]) < 0 ? "num loss" : "num"}">${fmt(totals[header])}</td>`;
  return "<td></td>";
}

function syncGlobalFilterBar() {
  for (const btn of els.globalFilterPanel.querySelectorAll("[data-daily-filter]")) {
    btn.classList.toggle("active", state.dailyFilters[btn.dataset.dailyFilter] === btn.dataset.value);
  }
}

function wireGlobalFilterBar() {
  els.globalFilterPanel.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-daily-filter]");
    if (!btn) return;
    state.dailyFilters[btn.dataset.dailyFilter] = btn.dataset.value;
    syncGlobalFilterBar();
    render();
  });
}

function dailyRowMatches(row) {
  const yard = els.yardFilter.value;
  const standard = state.dailyFilters.standard;
  const flow = state.dailyFilters.flow;
  const pile = String(row["กอง / รายการ"] || "");
  const rowYard = pile.includes("ตะกุก") ? "takuk" : "garden";
  const rowStandard = row["มาตรฐาน/ประเภท"] || "";
  const rowFlow = row["กลุ่ม"] || "";
  return (
    (yard === "all" || yard === rowYard) &&
    (standard === "all" || standard === rowStandard) &&
    (flow === "all" || flow === rowFlow)
  );
}

function groupDailyRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const date = row._date;
    if (!map.has(date)) map.set(date, { date, rows: [], in: 0, out: 0, total: 0 });
    const group = map.get(date);
    group.rows.push(row);
    group.total += n(row["รวม"]);
    if (row["กลุ่ม"] === "รับเข้า") group.in += n(row["รวม"]);
    if (row["กลุ่ม"] === "ส่งออก") group.out += n(row["รวม"]);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function dailyCell(value, header) {
  if (header === "วันที่") return `<td>${displayDate(value)}</td>`;
  if (header === "เวลา" && typeof value === "string") return `<td>${value.slice(11, 16) || value}</td>`;
  if (header === "เวลา" && typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    return `<td>${hh}:${mm}</td>`;
  }
  if (typeof value === "number") return `<td class="num">${fmt(value)}</td>`;
  return `<td class="${header === "ผู้ส่ง" ? "left" : ""}">${value ?? ""}</td>`;
}

function movementGroupName(row) {
  const pile = String(row["กอง"] || "");
  if (pile.includes("ปลายราง") && pile.includes("RSPO") && !pile.includes("NON")) return "ปลายราง (RSPO)";
  if (pile.includes("ปลายราง") && pile.includes("NON")) return "ปลายราง (NON-RSPO)";
  if (pile.includes("ตะกุก") && pile.includes("RSPO") && !pile.includes("NON")) return "ตะกุก (RSPO)";
  if (pile.includes("ตะกุก") && pile.includes("NON")) return "ตะกุก (NON-RSPO)";
  return pile || "ไม่ระบุ";
}

function buildMovementGroups(rows) {
  const order = ["ปลายราง (RSPO)", "ปลายราง (NON-RSPO)", "ตะกุก (RSPO)", "ตะกุก (NON-RSPO)"];
  const map = new Map(order.map((name) => [name, { name, days: new Map(), totalIn: 0, totalOut: 0, lastBalance: 0 }]));

  for (const row of rows) {
    const name = movementGroupName(row);
    if (!map.has(name)) map.set(name, { name, days: new Map(), totalIn: 0, totalOut: 0, lastBalance: 0 });
    const group = map.get(name);
    const date = row._date;
    if (!date) continue;
    if (!group.days.has(date)) {
      group.days.set(date, { date, in: 0, out: 0, opening: null, balance: null, inbound: [], outbound: [] });
    }
    const day = group.days.get(date);
    const inbound = n(row["รับเข้า (kg)"]);
    const outbound = n(row["ส่งออก (kg)"]);
    day.in += inbound;
    day.out += outbound;
    if (day.opening === null && row["ยอดยกมา"] !== null) day.opening = n(row["ยอดยกมา"]);
    if (row["ยอดคงเหลือ (kg)"] !== null) day.balance = n(row["ยอดคงเหลือ (kg)"]);
    const item = {
      time: String(row["วันที่/เวลา (AE)"] || "").slice(11, 16),
      label: row["ชื่อแปลง / เลขที่เอกสาร"] || "",
      car: row["ทะเบียน / คนขับ"] || "",
      weight: inbound || outbound,
      factory: row["โรงงาน"] || "",
      facNet: n(row["รับปลายทาง"]),
      diff: n(row["น้ำหนักเทียบปลายทาง"]),
    };
    if (inbound > 0) day.inbound.push(item);
    if (outbound > 0) day.outbound.push(item);
    group.totalIn += inbound;
    group.totalOut += outbound;
    group.lastBalance = day.balance ?? group.lastBalance;
  }

  return [...map.values()].map((group) => ({
    ...group,
    days: [...group.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

function renderMovementGroup(group) {
  return `
    <section class="movement-card">
      <div class="movement-card-head">
        <h3>${group.name}</h3>
        <div>
          <span>รับเข้า ${fmt(group.totalIn)}</span>
          <span>ส่งออก ${fmt(group.totalOut)}</span>
          <span>คงเหลือ ${fmt(group.lastBalance)}</span>
        </div>
      </div>
      <div class="movement-days">
        ${group.days.map((day) => renderMovementDay(day)).join("") || '<div class="empty-day">ไม่มีข้อมูล</div>'}
      </div>
    </section>`;
}

function renderMovementMatrix(groups) {
  const groupNames = ["ปลายราง (RSPO)", "ปลายราง (NON-RSPO)", "ตะกุก (RSPO)", "ตะกุก (NON-RSPO)"];
  const groupMap = new Map(groups.map((group) => [group.name, new Map(group.days.map((day) => [day.date, day]))]));
  const dates = [...new Set(groups.flatMap((group) => group.days.map((day) => day.date)))].sort();

  const body = dates.map((date) => `<tr>
    <td class="date-cell">${displayDate(date)}</td>
    ${groupNames.map((name) => movementMatrixCell(groupMap.get(name)?.get(date))).join("")}
  </tr>`).join("");

  const foot = `<tr>
    <td>รวม</td>
    ${groupNames.map((name) => {
      const group = groups.find((g) => g.name === name);
      return `<td class="movement-cell total-cell">
        <div><b>รับ</b> ${fmt(group?.totalIn || 0)}</div>
        <div><b>ส่ง</b> ${fmt(group?.totalOut || 0)}</div>
        <div><b>คงเหลือ</b> ${fmt(group?.lastBalance || 0)}</div>
      </td>`;
    }).join("")}
  </tr>`;

  return `<div class="table-wrap movement-matrix-wrap">
    <table class="movement-matrix">
      <thead>
        <tr>
          <th>วันที่</th>
          ${groupNames.map((name) => `<th>${name}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>${foot}</tfoot>
    </table>
  </div>`;
}

function movementMatrixCell(day) {
  if (!day) return `<td class="movement-cell empty-cell">-</td>`;
  return `<td class="movement-cell">
    <div class="movement-cell-top">
      <span>ยกมา ${fmt(day.opening || 0)}</span>
      <strong>${fmt(day.balance || 0)}</strong>
    </div>
    <div class="movement-totals">
      <span class="in">รับ ${fmt(day.in)}</span>
      <span class="out">ส่ง ${fmt(day.out)}</span>
    </div>
    <div class="movement-lists">
      <div>
        <b>รับเข้า</b>
        ${movementCompactItems(day.inbound)}
      </div>
      <div>
        <b>ส่งออก</b>
        ${movementCompactItems(day.outbound)}
      </div>
    </div>
  </td>`;
}

function movementCompactItems(items) {
  if (!items.length) return '<em>ไม่มี</em>';
  return `<ul>${items.slice(0, 5).map((item) => `<li><span>${item.time}</span><span>${item.label}</span><strong>${fmt(item.weight)}</strong></li>`).join("")}${items.length > 5 ? `<li><span></span><span>อีก ${items.length - 5} รายการ</span><strong></strong></li>` : ""}</ul>`;
}

function renderMovementDay(day) {
  return `
    <article class="movement-day">
      <header>
        <strong>${displayDate(day.date)}</strong>
        <span>ยกมา ${fmt(day.opening || 0)} | รับ ${fmt(day.in)} | ส่ง ${fmt(day.out)} | คงเหลือ ${fmt(day.balance || 0)}</span>
      </header>
      <div class="movement-flow">
        <div>
          <h4>รับเข้า</h4>
          ${movementItems(day.inbound)}
        </div>
        <div>
          <h4>ส่งออก</h4>
          ${movementItems(day.outbound, true)}
        </div>
      </div>
    </article>`;
}

function movementItems(items, outbound = false) {
  if (!items.length) return '<p class="muted">ไม่มีรายการ</p>';
  return `<table class="movement-mini"><tbody>${items.map((item) => `
    <tr>
      <td>${item.time}</td>
      <td class="left">${item.label}</td>
      <td>${outbound ? item.car : ""}</td>
      <td class="num">${fmt(item.weight)}</td>
      ${outbound ? `<td class="num">${fmt(item.facNet)}</td><td class="num loss">${fmt(item.diff)}</td>` : ""}
    </tr>`).join("")}</tbody></table>`;
}

function renderSummary() {
  const movementMap = movementBySourceRow();
  const rows = state.records.filter((r) => {
    const movement = movementMap.get(Number(r._srcRow));
    const scope = movement ? movementScope(movement) : dataRecordScope(r);
    return inRange(r.date) &&
      r.wpInOutType === "I" &&
      (yardScope() === "combined" || yardScope() === scope) &&
      recordMatchesGlobalFilters(r, movement);
  });
  state.currentRows = rows;
  renderDashboard(buildStockFromData(yardScope()));
  els.reportPage.innerHTML = `
    <div class="report-title">
      <h2>สรุปการรับปาล์มน้ำมัน</h2>
      <p>ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}</p>
      <p>แยกลานเทและมาตรฐาน RSPO / NON-RSPO / Contract Farmer</p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>วันที่</th><th>เวลา</th><th class="left">แปลง/ผู้ส่ง</th><th>มาตรฐาน</th><th>พื้นที่</th><th>ทะเบียน</th><th>น้ำหนัก</th><th>ทะลาย</th><th>ดิบ</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${displayDate(r.date)}</td>
          <td>${String(r.wpCarWeightDate || "").slice(11, 16)}</td>
          <td class="left">${r.name || r.wpctCode || ""}</td>
          <td>${r.standard || ""}</td>
          <td>${r.areaGroup || ""}</td>
          <td>${r.wpCarLicense || ""}</td>
          <td class="num">${fmt(r.wpNetWeight)}</td>
          <td class="num">${fmt(r.wpRampAmount)}</td>
          <td class="num">${fmt(r.wpRawPercent)}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderRspo() {
  const summaryRows = buildRspoSummaryRows();
  const detailRows = buildRspoDetailRows();
  const monthly = buildRspoMonthlyByEstate();
  state.currentRows = detailRows;
  renderDashboard(buildStockFromData(yardScope()));

  const summaryTable = `
    <table class="rspo-summary-table">
      <thead><tr><th>หมวด</th><th>รับเข้า (kg)</th><th>ส่งออก (kg)</th><th>ใบชั่ง</th><th>น้ำหนักโรงงาน</th><th>สูญหาย</th></tr></thead>
      <tbody>${summaryRows.map((row) => `<tr>
        <td class="left">${row.label}</td>
        <td class="num">${fmt(row.inbound)}</td>
        <td class="num">${fmt(row.outbound)}</td>
        <td class="num">${fmt(row.tickets)}</td>
        <td class="num">${fmt(row.factory)}</td>
        <td class="num loss">${fmt(row.loss)}</td>
      </tr>`).join("")}</tbody>
    </table>`;

  const detailTable = `
    <table>
      <thead><tr><th>วันที่</th><th class="left">ชื่อแปลง/ผู้ส่ง</th><th>มาตรฐาน</th><th>ลานเท</th><th>แปลงใหญ่</th><th>จำนวนใบชั่ง</th><th>รับเข้า (kg)</th><th>ทะลาย</th><th>ดิบ</th></tr></thead>
      <tbody>${detailRows.map((row) => `<tr>
        <td>${displayDate(row.date)}</td>
        <td class="left">${row.name}</td>
        <td>${row.standard}</td>
        <td>${row.yard}</td>
        <td>${row.estate}</td>
        <td class="num">${fmt(row.tickets)}</td>
        <td class="num">${fmt(row.inbound)}</td>
        <td class="num">${fmt(row.bunch)}</td>
        <td class="num">${fmt(row.raw)}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr>
        <td class="left">รวม</td><td></td><td></td><td></td><td></td>
        <td class="num">${fmt(detailRows.reduce((sum, row) => sum + row.tickets, 0))}</td>
        <td class="num">${fmt(detailRows.reduce((sum, row) => sum + row.inbound, 0))}</td>
        <td class="num">${fmt(detailRows.reduce((sum, row) => sum + row.bunch, 0))}</td>
        <td class="num">${fmt(detailRows.reduce((sum, row) => sum + row.raw, 0))}</td>
      </tr></tfoot>
    </table>`;

  els.reportPage.innerHTML = `
    <div class="report-title">
      <h2>RSPO Report</h2>
      <p>คำนวณจากชีต data ตามช่วงวันที่ ลานเท มาตรฐาน และรายการที่เลือก</p>
    </div>
    <div class="rspo-layout">
      <section class="rspo-card">
        <h3>สรุปตามมาตรฐาน / รายการ</h3>
        <div class="table-wrap">${summaryTable}</div>
      </section>
      <section class="rspo-card">
        <h3>ผลผลิตรับเข้า RSPO ตามแปลงใหญ่ / รายเดือน</h3>
        <div class="table-wrap">${renderRspoMonthlyTable(monthly)}</div>
      </section>
      <section class="rspo-card rspo-detail">
        <h3>รายละเอียดรับเข้า ตามชื่อแปลง</h3>
        <div class="table-wrap">${detailTable}</div>
      </section>
    </div>`;
}

function filteredReportRecords() {
  const movementMap = movementBySourceRow();
  return (state.records || []).filter((record) => {
    const date = record.weightDate || record.date;
    const movement = movementMap.get(Number(record._srcRow));
    const scope = movement ? movementScope(movement) : dataRecordScope(record);
    return date &&
      inRange(date) &&
      (yardScope() === "combined" || yardScope() === scope) &&
      recordMatchesGlobalFilters(record, movement);
  }).map((record) => ({
    record,
    movement: movementMap.get(Number(record._srcRow)),
    scope: movementMap.has(Number(record._srcRow)) ? movementScope(movementMap.get(Number(record._srcRow))) : dataRecordScope(record),
  }));
}

function buildRspoSummaryRows() {
  const order = ["RSPO", "NON-RSPO", "Contract Farmer", "Outbound Logistics"];
  const map = new Map(order.map((label) => [label, { label, inbound: 0, outbound: 0, tickets: 0, factory: 0, loss: 0 }]));
  for (const { record, movement } of filteredReportRecords()) {
    const flow = recordFlow(record);
    const label = flow === "ส่งออก" ? "Outbound Logistics" : recordStandardBucket(record, movement);
    if (!map.has(label)) map.set(label, { label, inbound: 0, outbound: 0, tickets: 0, factory: 0, loss: 0 });
    const item = map.get(label);
    const weight = n(record.wpNetWeight);
    item.tickets += 1;
    if (flow === "รับเข้า") item.inbound += weight;
    if (flow === "ส่งออก") {
      item.outbound += weight;
      item.factory += n(record.wpFacNetWeight);
      item.loss += lossOnly(n(record.wpFacNetWeight) - weight);
    }
  }
  return [...map.values()].filter((row) => row.inbound || row.outbound || row.tickets || state.dailyFilters.standard === "all");
}

function buildRspoDetailRows() {
  const map = new Map();
  for (const { record, movement, scope } of filteredReportRecords()) {
    if (record.wpInOutType !== "I") continue;
    const key = [record.weightDate || record.date, record.wpctCode || record.name, record.standard, scope].join("|");
    if (!map.has(key)) {
      map.set(key, {
        date: record.weightDate || record.date,
        name: record.name || record.wpctCode || "",
        standard: record.standard || "",
        yard: scope === "takuk" ? "ตะกุก" : "ปลายราง",
        estate: record.areaGroup || record.estate || "ไม่ระบุ",
        tickets: 0,
        inbound: 0,
        bunch: 0,
        raw: 0,
      });
    }
    const item = map.get(key);
    item.tickets += 1;
    item.inbound += n(record.wpNetWeight);
    item.bunch += n(record.wpRampAmount);
    item.raw += n(record.wpRawPercent);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || b.inbound - a.inbound);
}

function monthKey(dateText) {
  const d = isoDay(dateText);
  return d ? d.slice(0, 7) : "";
}

function monthLabel(key) {
  if (!key) return "";
  const [year, month] = key.split("-");
  return `${month}/${year}`;
}

function thaiMonthName(monthNumber) {
  return [
    "",
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ][Number(monthNumber)] || "";
}

function stockPeriodCaption(prefix = "") {
  const start = dateValue(els.startDate);
  const end = dateValue(els.endDate);
  if (start && end && start.slice(0, 7) === end.slice(0, 7)) {
    const [year, month] = start.split("-");
    return `${prefix}${thaiMonthName(month)} ${Number(year) + 543}`;
  }
  return `${prefix}${displayDate(start)} - ${displayDate(end)}`;
}

function buildRspoMonthlyByEstate() {
  const matrix = new Map();
  const monthSet = new Set();
  const movementMap = movementBySourceRow();
  for (const row of state.records) {
    const movement = movementMap.get(Number(row._srcRow));
    const scope = movement ? movementScope(movement) : dataRecordScope(row);
    if (row.wpInOutType !== "I" || row.standard !== "RSPO" || !inRange(row.date)) continue;
    if (yardScope() !== "combined" && yardScope() !== scope) continue;
    if (!recordMatchesGlobalFilters(row, movement)) continue;
    const estate = row.areaGroup || row["แปลงใหญ่"] || "ไม่ระบุ";
    const month = monthKey(row.date);
    if (!month) continue;
    monthSet.add(month);
    if (!matrix.has(estate)) matrix.set(estate, { estate, months: {}, total: 0, tickets: 0, bunch: 0 });
    const item = matrix.get(estate);
    const weight = n(row.wpNetWeight);
    item.months[month] = (item.months[month] || 0) + weight;
    item.total += weight;
    item.tickets += 1;
    item.bunch += n(row.wpRampAmount);
  }
  return {
    months: [...monthSet].sort(),
    rows: [...matrix.values()].sort((a, b) => b.total - a.total),
  };
}

function renderRspoMonthlyTable(data) {
  const monthHeaders = data.months.map((month) => `<th>${monthLabel(month)}</th>`).join("");
  const body = data.rows.map((row) => `<tr>
    <td class="left">${row.estate}</td>
    ${data.months.map((month) => `<td class="num">${fmt(row.months[month] || 0)}</td>`).join("")}
    <td class="num">${fmt(row.total)}</td>
    <td class="num">${fmt(row.tickets)}</td>
    <td class="num">${fmt(row.bunch)}</td>
  </tr>`).join("");
  const totalByMonth = Object.fromEntries(data.months.map((month) => [month, data.rows.reduce((sum, row) => sum + n(row.months[month]), 0)]));
  const grand = data.rows.reduce((sum, row) => sum + row.total, 0);
  const tickets = data.rows.reduce((sum, row) => sum + row.tickets, 0);
  const bunch = data.rows.reduce((sum, row) => sum + row.bunch, 0);
  return `
    <table>
      <thead>
        <tr>
          <th class="left">แปลงใหญ่</th>
          ${monthHeaders}
          <th>รวมรับเข้า (kg)</th>
          <th>จำนวนใบชั่ง</th>
          <th>ทะลาย</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td class="left">รวม</td>
          ${data.months.map((month) => `<td class="num">${fmt(totalByMonth[month])}</td>`).join("")}
          <td class="num">${fmt(grand)}</td>
          <td class="num">${fmt(tickets)}</td>
          <td class="num">${fmt(bunch)}</td>
        </tr>
      </tfoot>
    </table>`;
}

function pct(value, total) {
  return total ? `${((n(value) / n(total)) * 100).toFixed(1)}%` : "0.0%";
}

function signed(value) {
  const rounded = Math.round(n(value));
  return `${rounded > 0 ? "+" : ""}${nf.format(rounded)}`;
}

function signedPct(value) {
  const parsed = n(value);
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function dashboardStats(rows) {
  const t = totals(rows);
  const inbound = n(t.totalRamp);
  const outbound = n(t.outboundTotal);
  const loss = n(t.loss);
  const factory = n(t.facNet);
  return {
    opening: n(rows[0]?.opening),
    inbound,
    outbound,
    loss,
    factory,
    trips: n(t.tripCount),
    balance: periodBalance(rows),
    net: inbound - outbound - loss,
    lossRate: outbound ? (loss / outbound) * 100 : 0,
    factoryDiff: factory - outbound,
  };
}

function metricTile(label, value, detail, tone = "") {
  return `
    <article class="analytics-tile ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail || ""}</small>
    </article>`;
}

function deltaCell(current, previous, suffix = "") {
  const delta = n(current) - n(previous);
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return `<td class="num delta ${cls}">${signed(delta)}${suffix}</td>`;
}

function maxBy(items, getter) {
  return items.reduce((best, item) => (getter(item) > getter(best || {}) ? item : best), null);
}

function periodLabel(rows) {
  if (!rows.length) return "-";
  return `${displayDate(rows[0].date)} - ${displayDate(rows.at(-1).date)}`;
}

function buildPeriodComparison(rows) {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 2) {
    return {
      previousRows: [],
      currentRows: ordered,
      previous: dashboardStats([]),
      current: dashboardStats(ordered),
    };
  }
  const midpoint = Math.ceil(ordered.length / 2);
  const previousRows = ordered.slice(0, midpoint);
  const currentRows = ordered.slice(midpoint);
  return {
    previousRows,
    currentRows,
    previous: dashboardStats(previousRows),
    current: dashboardStats(currentRows),
  };
}

function buildStandardAnalytics(records) {
  const order = ["RSPO", "NON-RSPO", "Contract Farmer"];
  const map = new Map(order.map((label) => [label, {
    label,
    tickets: 0,
    inbound: 0,
    outbound: 0,
    factory: 0,
    loss: 0,
  }]));
  for (const { record, movement } of records) {
    const label = record.wpInOutType === "I" ? recordStandardBucket(record, movement) : recordStandardBucket(record, movement);
    if (!map.has(label)) map.set(label, { label, tickets: 0, inbound: 0, outbound: 0, factory: 0, loss: 0 });
    const item = map.get(label);
    const weight = n(record.wpNetWeight);
    item.tickets += 1;
    if (record.wpInOutType === "I") item.inbound += weight;
    if (record.wpInOutType === "O") {
      item.outbound += weight;
      item.factory += n(record.wpFacNetWeight);
      item.loss += lossOnly(n(record.wpFacNetWeight) - weight);
    }
  }
  return [...map.values()].filter((item) => item.tickets || state.dailyFilters.standard === "all");
}

function buildTopInbound(records) {
  const map = new Map();
  for (const { record, movement, scope } of records) {
    if (record.wpInOutType !== "I") continue;
    const label = record.name || record.wpctCode || "ไม่ระบุ";
    const key = `${label}|${recordStandardBucket(record, movement)}|${scope}`;
    if (!map.has(key)) {
      map.set(key, {
        label,
        standard: recordStandardBucket(record, movement),
        yard: scope === "takuk" ? "ตะกุก" : "ปลายราง",
        tickets: 0,
        weight: 0,
      });
    }
    const item = map.get(key);
    item.tickets += 1;
    item.weight += n(record.wpNetWeight);
  }
  return [...map.values()].sort((a, b) => b.weight - a.weight).slice(0, 10);
}

function buildFactoryAnalytics(records) {
  const map = new Map();
  for (const { record, scope } of records) {
    if (record.wpInOutType !== "O") continue;
    const label = record.wpftcode || record.wpFacDocNo || "ไม่ระบุ";
    if (!map.has(label)) {
      map.set(label, {
        label,
        yard: scope === "takuk" ? "ตะกุก" : "ปลายราง",
        trips: 0,
        outbound: 0,
        factory: 0,
        loss: 0,
      });
    }
    const item = map.get(label);
    const weight = n(record.wpNetWeight);
    const factory = n(record.wpFacNetWeight);
    item.trips += 1;
    item.outbound += weight;
    item.factory += factory;
    item.loss += lossOnly(factory - weight);
  }
  return [...map.values()].sort((a, b) => b.outbound - a.outbound).slice(0, 10);
}

function buildMonthlyTrend(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = monthKey(row.date);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { month: key, inbound: 0, outbound: 0, loss: 0, trips: 0, balance: 0 });
    const item = map.get(key);
    item.inbound += n(row.totalRamp);
    item.outbound += n(row.outboundTotal);
    item.loss += n(row.loss);
    item.trips += n(row.tripCount);
    item.balance = n(row.balance);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function terrainLookupByCode() {
  const rows = state.payload.lookups?.terrain || [];
  return new Map(rows.map((row) => [String(row.WpctCode || row.LookupKey_fast || ""), row]));
}

function terrainForRecord(record, terrainMap = terrainLookupByCode()) {
  return terrainMap.get(String(record.wpctCode || "")) || {};
}

function terrainArea(row) {
  return n(row["Area Planted"] || row.area);
}

function yieldGroupInfo(record, terrain, mode) {
  if (mode === "terrain") {
    const block = terrain.terrain || record.terrain || "ไม่ระบุ";
    return { key: String(block), label: String(block), type: "บล็อก" };
  }
  if (mode === "year") {
    const year = terrain["ปีปลูก"] || "ไม่ระบุ";
    return { key: String(year), label: String(year), type: "รุ่นปี" };
  }
  const area = terrain.wparea || record.areaGroup || "ไม่ระบุ";
  return { key: String(area), label: String(area), type: "แปลงใหญ่" };
}

function buildYieldComparison(records, mode) {
  const terrainMap = terrainLookupByCode();
  const map = new Map();
  const totalWeight = records.reduce((sum, item) => {
    return item.record.wpInOutType === "I" ? sum + n(item.record.wpNetWeight) : sum;
  }, 0);
  const allBlocks = new Map();

  for (const { record } of records) {
    if (record.wpInOutType !== "I") continue;
    const terrain = terrainForRecord(record, terrainMap);
    const group = yieldGroupInfo(record, terrain, mode);
    if (!map.has(group.key)) {
      map.set(group.key, {
        key: group.key,
        label: group.label,
        type: group.type,
        tickets: 0,
        weight: 0,
        area: 0,
        blocks: new Map(),
      });
    }
    const item = map.get(group.key);
    const blockKey = String(terrain.WpctCode || terrain.LookupKey_fast || record.wpctCode || `${group.key}-${record.name || ""}`);
    const blockArea = terrainArea(terrain);
    item.tickets += 1;
    item.weight += n(record.wpNetWeight);
    if (!item.blocks.has(blockKey)) item.blocks.set(blockKey, blockArea);
    if (!allBlocks.has(blockKey)) allBlocks.set(blockKey, blockArea);
  }

  const totalArea = [...allBlocks.values()].reduce((sum, value) => sum + n(value), 0);
  return [...map.values()].map((item) => {
    item.area = [...item.blocks.values()].reduce((sum, value) => sum + n(value), 0);
    item.yieldShare = totalWeight ? (item.weight / totalWeight) * 100 : 0;
    item.areaShare = totalArea ? (item.area / totalArea) * 100 : 0;
    item.yieldPerRai = item.area ? item.weight / item.area : 0;
    item.index = item.areaShare ? (item.yieldShare / item.areaShare) * 100 : 0;
    item.gap = item.yieldShare - item.areaShare;
    return item;
  }).sort((a, b) => b.weight - a.weight);
}

function compareModeLabel(mode) {
  if (mode === "terrain") return "บล็อก";
  if (mode === "year") return "รุ่นปี";
  return "แปลงใหญ่";
}

function barRows(rows, valueKey, labelKey = "label") {
  const max = Math.max(...rows.map((row) => n(row[valueKey])), 1);
  if (!rows.length) return '<p class="analytics-empty">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</p>';
  return rows.map((row) => {
    const width = Math.max(2, (n(row[valueKey]) / max) * 100);
    return `
      <div class="bar-row">
        <div class="bar-label"><strong>${row[labelKey]}</strong><span>${row.sub || ""}</span></div>
        <div class="bar-track"><span style="width:${width}%"></span></div>
        <div class="bar-value">${row.valueText || fmt(row[valueKey])}</div>
      </div>`;
  }).join("");
}

function simpleTable(headers, rows, emptyText = "ไม่มีข้อมูลตามเงื่อนไขที่เลือก") {
  if (!rows.length) return `<p class="analytics-empty">${emptyText}</p>`;
  return `
    <table class="mini-table">
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
}

function renderAdvancedDashboard() {
  const rows = buildStockFromData(yardScope());
  const stats = dashboardStats(rows);
  const records = filteredReportRecords();
  const comparison = buildPeriodComparison(rows);
  const standardRows = buildStandardAnalytics(records);
  const topInbound = buildTopInbound(records);
  const factoryRows = buildFactoryAnalytics(records);
  const monthly = buildMonthlyTrend(rows);
  const yieldRows = buildYieldComparison(records, state.dashboardCompareMode);
  const yieldTopRows = yieldRows.slice(0, state.dashboardCompareMode === "terrain" ? 20 : 12);
  const maxInbound = maxBy(rows, (row) => n(row.totalRamp));
  const maxOutbound = maxBy(rows, (row) => n(row.outboundTotal));
  const maxLoss = maxBy(rows, (row) => n(row.loss));
  const yardOptions = yardScope() === "combined" ? ["garden", "takuk"] : [yardScope()];
  const yardRows = yardOptions.map((scope) => ({
    scope,
    label: scope === "takuk" ? "ตะกุก" : "ปลายราง",
    stats: dashboardStats(buildStockFromData(scope)),
  }));

  state.currentRows = [
    ...rows.map((row) => ({ section: "daily", ...row })),
    ...standardRows.map((row) => ({ section: "standard", ...row })),
    ...yardRows.map((row) => ({ section: "yard", yard: row.label, ...row.stats })),
    ...yieldRows.map((row) => ({ section: `yield-${state.dashboardCompareMode}`, ...row })),
  ];
  renderDashboard(rows);

  const periodRows = [
    ["รับเข้า", "inbound"],
    ["ส่งออก", "outbound"],
    ["สูญหาย", "loss"],
    ["คงเหลือปลายช่วง", "balance"],
    ["จำนวนเที่ยว", "trips"],
  ].map(([label, key]) => `
    <tr>
      <td class="left">${label}</td>
      <td class="num">${fmt(comparison.previous[key])}</td>
      <td class="num">${fmt(comparison.current[key])}</td>
      ${deltaCell(comparison.current[key], comparison.previous[key])}
    </tr>`);

  const yardTableRows = yardRows.map((row) => `
    <tr>
      <td class="left">${row.label}</td>
      <td class="num">${fmt(row.stats.inbound)}</td>
      <td class="num">${fmt(row.stats.outbound)}</td>
      <td class="num loss">${fmt(row.stats.loss)}</td>
      <td class="num">${row.stats.lossRate.toFixed(2)}%</td>
      <td class="num">${fmt(row.stats.balance)}</td>
      <td class="num">${fmt(row.stats.trips)}</td>
    </tr>`);

  const standardTableRows = standardRows.map((row) => `
    <tr>
      <td class="left">${row.label}</td>
      <td class="num">${fmt(row.inbound)}</td>
      <td class="num">${fmt(row.outbound)}</td>
      <td class="num">${fmt(row.tickets)}</td>
      <td class="num">${fmt(row.factory)}</td>
      <td class="num loss">${fmt(row.loss)}</td>
      <td class="num">${pct(row.inbound, stats.inbound)}</td>
    </tr>`);

  const yieldTableRows = yieldTopRows.map((row) => `
    <tr>
      <td class="left">${row.label}</td>
      <td class="num">${fmt(row.area)}</td>
      <td class="num">${fmt(row.tickets)}</td>
      <td class="num">${fmt(row.weight)}</td>
      <td class="num">${row.yieldShare.toFixed(2)}%</td>
      <td class="num">${row.areaShare.toFixed(2)}%</td>
      <td class="num">${fmt(row.yieldPerRai)}</td>
      <td class="num ${row.gap < 0 ? "loss" : ""}">${signedPct(row.gap)}</td>
      <td class="num">${row.index ? row.index.toFixed(1) : "0.0"}</td>
    </tr>`);

  const yieldBars = yieldTopRows.slice(0, 10).map((row) => ({
    label: row.label,
    sub: `ผลผลิต ${row.yieldShare.toFixed(2)}% | พื้นที่ ${row.areaShare.toFixed(2)}% | ${fmt(row.yieldPerRai)} kg/ไร่`,
    value: row.yieldShare,
    valueText: `${row.yieldShare.toFixed(2)}%`,
  }));

  const supplierRows = topInbound.map((row) => `
    <tr>
      <td class="left">${row.label}</td>
      <td>${row.standard}</td>
      <td>${row.yard}</td>
      <td class="num">${fmt(row.tickets)}</td>
      <td class="num">${fmt(row.weight)}</td>
      <td class="num">${pct(row.weight, stats.inbound)}</td>
    </tr>`);

  const factoryTableRows = factoryRows.map((row) => `
    <tr>
      <td class="left">${row.label}</td>
      <td>${row.yard}</td>
      <td class="num">${fmt(row.trips)}</td>
      <td class="num">${fmt(row.outbound)}</td>
      <td class="num">${fmt(row.factory)}</td>
      <td class="num loss">${fmt(row.loss)}</td>
      <td class="num">${signed(row.factory - row.outbound)}</td>
    </tr>`);

  const monthlyBars = monthly.map((row) => ({
    label: monthLabel(row.month),
    sub: `ส่งออก ${fmt(row.outbound)} | สูญหาย ${fmt(row.loss)} | คงเหลือ ${fmt(row.balance)}`,
    value: row.inbound,
  }));

  const insightItems = [
    `รับเข้าสูงสุด: ${maxInbound ? `${displayDate(maxInbound.date)} (${fmt(maxInbound.totalRamp)} kg)` : "-"}`,
    `ส่งออกสูงสุด: ${maxOutbound ? `${displayDate(maxOutbound.date)} (${fmt(maxOutbound.outboundTotal)} kg)` : "-"}`,
    `สูญหายสูงสุด: ${maxLoss ? `${displayDate(maxLoss.date)} (${fmt(maxLoss.loss)} kg)` : "-"}`,
    `อัตราสูญหายต่อส่งออก: ${stats.lossRate.toFixed(2)}%`,
    `ส่วนต่างน้ำหนักโรงงานเทียบส่งออก: ${signed(stats.factoryDiff)} kg`,
  ];

  els.reportPage.innerHTML = `
    <div class="report-title">
      <h2>Dashboard วิเคราะห์เชิงลึก</h2>
      <p>ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))} | วิเคราะห์จากชีต data และการปรับยอด Clear Ramp ตามตัวกรองด้านบน</p>
    </div>
    <div class="analytics-layout">
      <section class="analytics-hero">
        <div>
          <h3>ภาพรวมการเคลื่อนไหว</h3>
          <p>คำนวณรับเข้า ส่งออก สูญหาย คงเหลือ และเปรียบเทียบตามลาน/มาตรฐานจากข้อมูลปัจจุบัน</p>
        </div>
        <div class="analytics-hero-grid">
          ${metricTile("Net Movement", fmt(stats.net), "รับเข้า - ส่งออก - สูญหาย", stats.net < 0 ? "danger" : "good")}
          ${metricTile("Loss Rate", `${stats.lossRate.toFixed(2)}%`, "สูญหาย / ส่งออก", stats.lossRate > 2 ? "danger" : "")}
          ${metricTile("Factory Diff", `${signed(stats.factoryDiff)} kg`, "โรงงาน - ส่งออก", stats.factoryDiff < 0 ? "danger" : "good")}
          ${metricTile("Trips", fmt(stats.trips), "จำนวนเที่ยวส่งออก")}
        </div>
      </section>

      <section class="analytics-card wide">
        <div class="section-head">
          <h3>เปรียบเทียบช่วงเวลา</h3>
          <span>${periodLabel(comparison.previousRows)} เทียบ ${periodLabel(comparison.currentRows)}</span>
        </div>
        ${simpleTable(["รายการ", "ช่วงก่อน", "ช่วงหลัง", "เปลี่ยนแปลง"], periodRows)}
      </section>

      <section class="analytics-card">
        <div class="section-head">
          <h3>เทียบตามลานเท</h3>
          <span>ปลายราง / ตะกุก ตามตัวกรองลานเท</span>
        </div>
        ${simpleTable(["ลานเท", "รับเข้า", "ส่งออก", "สูญหาย", "Loss %", "คงเหลือ", "เที่ยว"], yardTableRows)}
      </section>

      <section class="analytics-card">
        <div class="section-head">
          <h3>เทียบตามมาตรฐาน</h3>
          <span>RSPO / NON-RSPO / Contract Farmer</span>
        </div>
        ${simpleTable(["มาตรฐาน", "รับเข้า", "ส่งออก", "ใบชั่ง", "โรงงาน", "สูญหาย", "% รับเข้า"], standardTableRows)}
      </section>

      <section class="analytics-card wide">
        <div class="section-head">
          <h3>เปรียบเทียบ % ผลผลิตตาม ${compareModeLabel(state.dashboardCompareMode)}</h3>
          <label class="analytics-select">เปรียบเทียบ
            <select id="yieldCompareMode">
              <option value="terrain"${state.dashboardCompareMode === "terrain" ? " selected" : ""}>บล็อก</option>
              <option value="area"${state.dashboardCompareMode === "area" ? " selected" : ""}>แปลงใหญ่</option>
              <option value="year"${state.dashboardCompareMode === "year" ? " selected" : ""}>รุ่นปี</option>
            </select>
          </label>
        </div>
        <div class="yield-compare-grid">
          <div class="bar-list">${barRows(yieldBars, "value")}</div>
          <div class="table-wrap">
            ${simpleTable([compareModeLabel(state.dashboardCompareMode), "พื้นที่ไร่", "ใบชั่ง", "รับเข้า", "% ผลผลิต", "% พื้นที่", "kg/ไร่", "ส่วนต่าง", "Index"], yieldTableRows)}
          </div>
        </div>
      </section>

      <section class="analytics-card">
        <div class="section-head">
          <h3>แนวโน้มรายเดือน</h3>
          <span>แถบแสดงน้ำหนักรับเข้า</span>
        </div>
        <div class="bar-list">${barRows(monthlyBars, "value")}</div>
      </section>

      <section class="analytics-card">
        <div class="section-head">
          <h3>ผู้ส่งรับเข้าสูงสุด</h3>
          <span>Top 10 ตามน้ำหนักรับเข้า</span>
        </div>
        ${simpleTable(["ผู้ส่ง", "มาตรฐาน", "ลาน", "ใบชั่ง", "น้ำหนัก", "% รวม"], supplierRows)}
      </section>

      <section class="analytics-card">
        <div class="section-head">
          <h3>ส่งออกตามโรงงาน</h3>
          <span>เทียบน้ำหนักส่งออกกับน้ำหนักปลายทาง</span>
        </div>
        ${simpleTable(["โรงงาน", "ลาน", "เที่ยว", "ส่งออก", "โรงงาน", "สูญหาย", "ต่าง"], factoryTableRows)}
      </section>

      <section class="analytics-card insight-card">
        <div class="section-head">
          <h3>ข้อสังเกตสำคัญ</h3>
          <span>จุดที่ควรตรวจสอบต่อ</span>
        </div>
        <ul class="insight-list">
          ${insightItems.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      </section>
    </div>`;
}

function isPalmView(view) {
  return String(view || "").startsWith("palm-");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEstView(view) {
  return String(view || "").startsWith("est-");
}

function estDatasets() {
  return state.estData?.budgetDatasets || [];
}

function selectedEstDataset() {
  const datasets = estDatasets();
  const filtered = state.estFilters.activity === "all"
    ? datasets
    : datasets.filter((item) => item.activity === state.estFilters.activity);
  return filtered.find((item) => item.id === state.estFilters.datasetId) || filtered[0] || datasets[0] || null;
}

function estRows(dataset) {
  const rows = dataset?.rows || [];
  const query = state.estFilters.query.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => Object.entries(row).some(([key, value]) => !key.startsWith("_") && String(value ?? "").toLowerCase().includes(query)));
}

function renderEstToolbar() {
  const activities = Object.keys(state.estData?.activityTotals || {}).sort();
  const datasets = state.estFilters.activity === "all"
    ? estDatasets()
    : estDatasets().filter((item) => item.activity === state.estFilters.activity);
  const dataset = selectedEstDataset();
  return `
    <section class="est-toolbar">
      <label>กิจกรรม
        <select id="estActivity">
          <option value="all"${state.estFilters.activity === "all" ? " selected" : ""}>ทุกกิจกรรม</option>
          ${activities.map((activity) => `<option value="${esc(activity)}"${activity === state.estFilters.activity ? " selected" : ""}>${esc(activity)}</option>`).join("")}
        </select>
      </label>
      <label>ชีตงบประมาณ
        <select id="estDataset">
          ${datasets.map((item) => `<option value="${esc(item.id)}"${dataset?.id === item.id ? " selected" : ""}>${esc(item.sheet)} (${fmt(item.rowCount)})</option>`).join("")}
        </select>
      </label>
      <label>ค้นหา
        <input id="estSearch" type="search" value="${esc(state.estFilters.query)}" placeholder="แปลง บล็อก กิจกรรม ค่าแรง">
      </label>
    </section>`;
}

function renderEstBudgetTable(dataset = selectedEstDataset()) {
  if (!dataset) return `<p class="analytics-empty">ยังไม่มีข้อมูลงบประมาณ</p>`;
  const headers = (dataset.headers || []).filter((header) => !String(header).startsWith("_")).slice(0, 12);
  const rows = estRows(dataset);
  return `
    <section class="est-panel">
      <div class="section-head">
        <h3>${esc(dataset.sheet)}</h3>
        <span>${esc(dataset.activity)} · ${fmt(rows.length)} / ${fmt(dataset.rowCount)} rows</span>
      </div>
      <div class="table-wrap est-table-wrap">
        <table class="mini-table est-table">
          <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.slice(0, 220).map((row) => `<tr class="${row._isTotal ? "is-total" : ""}">${headers.map((header) => `<td>${esc(row[header] ?? "")}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${rows.length > 220 ? `<p class="master-note">แสดง 220 แถวแรกจาก ${fmt(rows.length)} แถว</p>` : ""}
    </section>`;
}

function loadEstDailyEntries() {
  try {
    state.estWorkPlans = JSON.parse(localStorage.getItem("est-work-plans") || "[]");
    state.estWorkOrders = JSON.parse(localStorage.getItem("est-work-orders") || "[]");
    state.estDailyEntries = JSON.parse(localStorage.getItem("est-daily-entries") || "[]");
    state.estBudgetRateEdits = JSON.parse(localStorage.getItem("est-budget-rate-edits") || "[]");
    state.estMasterRecords = JSON.parse(localStorage.getItem("est-master-records") || "[]");
    state.masterFolderRecords = JSON.parse(localStorage.getItem("master-folder-records") || "[]").filter((row) => row._source !== "editing");
    state.farmRecords = JSON.parse(localStorage.getItem("prompt-est-farm-records") || "[]");
  } catch {
    state.estWorkPlans = [];
    state.estWorkOrders = [];
    state.estDailyEntries = [];
    state.estBudgetRateEdits = [];
    state.estMasterRecords = [];
    state.masterFolderRecords = [];
    state.farmRecords = [];
  }
}

function saveEstWorkPlans() {
  localStorage.setItem("est-work-plans", JSON.stringify(state.estWorkPlans));
}

function saveEstWorkOrders() {
  localStorage.setItem("est-work-orders", JSON.stringify(state.estWorkOrders));
}

function saveEstDailyEntries() {
  localStorage.setItem("est-daily-entries", JSON.stringify(state.estDailyEntries));
}

function saveEstBudgetRateEdits() {
  localStorage.setItem("est-budget-rate-edits", JSON.stringify(state.estBudgetRateEdits));
}

function saveEstMasterRecords() {
  localStorage.setItem("est-master-records", JSON.stringify(state.estMasterRecords));
}

function saveMasterFolderRecords() {
  localStorage.setItem("master-folder-records", JSON.stringify(state.masterFolderRecords));
}

function saveFarmRecords() {
  localStorage.setItem("prompt-est-farm-records", JSON.stringify(state.farmRecords));
}

function estField(row, names) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const found = keys.find((key) => key.includes(name));
    if (found) return row[found];
  }
  return "";
}

function estBudgetOptions() {
  const rows = [];
  for (const dataset of estDatasets()) {
    for (const row of dataset.rows || []) {
      if (row._isTotal) continue;
      const block = estField(row, ["บล็อก", "รหัสบล็อก"]);
      if (!block || String(block).includes("รวม")) continue;
      rows.push({
        block: String(block),
        sheet: dataset.sheet,
        activity: dataset.activity,
        area: estField(row, ["แปลง"]),
        rai: estField(row, ["ไร่", "จำนวน(ไร่)"]),
        trees: estField(row, ["ต้น", "จำนวน(ต้น)"]),
        rate: estField(row, ["อัตรา", "ค่าแรง", "บาท/ตัน"]),
        sourceRow: row._rowNumber,
      });
    }
  }
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.block}|${row.sheet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 1200);
}

function estFirstNumericByHeaders(row, matchers) {
  const entries = Object.entries(row || {}).filter(([key]) => !String(key).startsWith("_"));
  for (const [key, value] of entries) {
    const lower = String(key).toLowerCase();
    if (!matchers.some((matcher) => lower.includes(matcher))) continue;
    const amount = n(value);
    if (amount) return { key, value: amount };
  }
  return { key: "", value: 0 };
}

function estBudgetRateEditsMap() {
  return new Map((state.estBudgetRateEdits || []).map((row) => [row.id, row]));
}

function estBudgetUniqueOptions(values) {
  const seen = new Set();
  return values.map((value) => String(value ?? "").trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  }).sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
}

function estBudgetOptionHtml(options, selected, allLabel = "ทั้งหมด") {
  return `<option value="all"${String(selected) === "all" ? " selected" : ""}>${esc(allLabel)}</option>${options.map((item) => {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;
    return `<option value="${esc(value)}"${String(selected) === String(value) ? " selected" : ""}>${esc(label)}</option>`;
  }).join("")}`;
}

function estBudgetPlainOptionHtml(options, selected, placeholder = "เลือก") {
  return `<option value="">${esc(placeholder)}</option>${options.map((item) => {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;
    const attrs = typeof item === "string" ? "" : Object.entries(item)
      .filter(([key]) => !["value", "label", "row", "table"].includes(key))
      .map(([key, value]) => ` data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${esc(value ?? "")}"`).join("");
    return `<option value="${esc(value)}"${String(selected) === String(value) ? " selected" : ""}${attrs}>${esc(label)}</option>`;
  }).join("")}`;
}

function estBudgetMasterOptions(groupId, fallbackValues = []) {
  const seen = new Set();
  const options = [];
  for (const table of masterFolderTables().filter((item) => masterFolderGroupForTable(item) === groupId)) {
    for (const row of masterFolderRows(table)) {
      const value = String(masterFolderPkValue(row, table) || masterFolderLabel(row, table) || "").trim();
      const label = String(masterFolderLabel(row, table) || value).trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label, name: label, table: table.id, row });
      if (options.length >= 500) return options;
    }
  }
  for (const value of fallbackValues) {
    const clean = String(value ?? "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    options.push({ value: clean, label: clean, name: clean, table: "fallback", row: {} });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
}

function estBudgetAreaOptions() {
  const fromMaster = estBudgetMasterOptions("area");
  const fromBudget = estBudgetUniqueOptions(estBudgetOptions().flatMap((row) => [row.block, row.area])).map((value) => ({ value, label: value, name: value, table: "budget", row: {} }));
  const seen = new Set();
  return [...fromMaster, ...fromBudget].filter((item) => {
    const key = String(item.value || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);
}

function estBudgetActivityOptions() {
  const fromMaster = estMasterRows("activities").map((row) => {
    const value = String(row.code || row.name || row.group || "").trim();
    const label = [row.code, row.name || row.group].filter(Boolean).join(" · ") || value;
    return value ? { value, label, name: row.name || row.group || value, group: row.group || row.name || "" } : null;
  }).filter(Boolean);
  const fromBudget = Object.keys(state.estData?.activityTotals || {}).map((activity) => ({ value: activity, label: activity, name: activity, group: activity }));
  const seen = new Set();
  return [...fromMaster, ...fromBudget].filter((item) => {
    if (!item.value || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  }).sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
}

function estBudgetMaterialOptions() {
  const fallback = ["น้ำมัน", "ปุ๋ย", "สารกำจัดวัชพืช", "สารป้องกันศัตรูพืช", "อุปกรณ์สิ้นเปลือง"];
  return estBudgetMasterOptions("supply", fallback);
}

function estBudgetWorkerGroupOptions() {
  const peopleRows = estMasterRows("people");
  const fallback = ["คนงาน (Worker)", "คนขับ (Driver)", "ผู้รับเหมา (Contractor)", "ทีมตอนบน", "ทีมตอนล่าง"];
  const fromPeople = estBudgetUniqueOptions(peopleRows.flatMap((row) => [row.team, row.role, row.zone])).map((value) => ({ value, label: value }));
  const seen = new Set();
  return [...fromPeople, ...fallback.map((value) => ({ value, label: value }))].filter((item) => {
    if (!item.value || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
}

function estBudgetRateGroupOptions() {
  const defaults = ["คนงาน", "คนขับ", "ผู้รับเหมา", "Role Based", "Role Based Compounded", "เหมารวม"];
  return estBudgetUniqueOptions([...(state.estBudgetRateEdits || []).map((row) => row.rateGroup), ...defaults]).map((value) => ({ value, label: value }));
}

function estBudgetRateLines() {
  const edits = estBudgetRateEditsMap();
  const lines = [];
  for (const dataset of estDatasets()) {
    for (const row of dataset.rows || []) {
      if (row._isTotal) continue;
      const block = String(estField(row, ["บล็อก", "รหัสบล็อก", "แปลง", "แปลงปฏิบัติการ"]) || "").trim();
      if (!block || block.includes("รวม")) continue;
      const rate = estFirstNumericByHeaders(row, ["อัตรา", "ค่าแรง", "บาท/"]);
      const budget = estFirstNumericByHeaders(row, ["รวม", "ค่าใช้จ่าย", "ค่าตัด", "ค่าแรง"]);
      const rai = n(estField(row, ["ไร่", "จำนวน(ไร่)", "จำนวนไร่", "พื้นที่"]));
      const trees = n(estField(row, ["ต้น", "จำนวน(ต้น)", "จำนวนต้น"]));
      const quantity = n(estField(row, ["ผลผลิต", "จำนวน", "ปริมาณ"])) || trees || rai;
      if (!rate.value && !budget.value) continue;
      const unit = rate.key.includes("ตัน") ? "บาท/ตัน" : rate.key.includes("ต้น") ? "บาท/ต้น" : rate.key.includes("ไร่") ? "บาท/ไร่" : "บาท/งาน";
      const budgetValue = budget.key && budget.key !== rate.key ? budget.value : (rate.value && quantity ? rate.value * quantity : budget.value);
      const id = `${dataset.id || dataset.sheet}::${row._rowNumber || lines.length}`;
      const base = {
        id,
        fiscalYear: "2569",
        activityGroup: dataset.activity || dataset.sheet,
        activityKey: dataset.activity || dataset.sheet,
        activity: dataset.activity || dataset.sheet,
        contractName: dataset.sheet,
        blockKey: block,
        block,
        area: String(estField(row, ["แปลง", "แปลงปฏิบัติการ"]) || "").trim(),
        rai,
        trees,
        quantity,
        rate: rate.value,
        rateField: rate.key,
        unit,
        materialKey: "",
        material: "",
        materialUnit: "",
        materialQty: 0,
        materialRate: 0,
        workerGroup: "คนงาน (Worker)",
        rateGroup: "คนงาน",
        roleName: "คนงาน (Worker)",
        disableMaterial: false,
        budget: budgetValue,
        sourceSheet: dataset.sheet,
        sourceRow: row._rowNumber || "",
      };
      const edit = edits.get(id);
      if (edit?._deleted) continue;
      lines.push({ ...base, ...(edit || {}) });
    }
  }
  for (const edit of state.estBudgetRateEdits || []) {
    if (!edit.customRate || edit._deleted) continue;
    lines.push({
      id: edit.id,
      fiscalYear: edit.fiscalYear || "2569",
      activityGroup: edit.activityGroup || edit.activity || "ไม่ระบุกลุ่มกิจกรรม",
      activityKey: edit.activityKey || edit.activity || "",
      activity: edit.activity || "ไม่ระบุกิจกรรม",
      contractName: edit.contractName || "อัตราเพิ่มเอง",
      blockKey: edit.blockKey || edit.block || "",
      block: edit.block || "",
      area: edit.area || "",
      rai: n(edit.rai),
      trees: n(edit.trees),
      quantity: n(edit.quantity),
      rate: n(edit.rate),
      rateField: "manual",
      unit: edit.unit || "บาท/งาน",
      materialKey: edit.materialKey || "",
      material: edit.material || "",
      materialUnit: edit.materialUnit || "",
      materialQty: n(edit.materialQty),
      materialRate: n(edit.materialRate),
      workerGroup: edit.workerGroup || "คนงาน (Worker)",
      rateGroup: edit.rateGroup || "คนงาน",
      roleName: edit.roleName || edit.workerGroup || "",
      disableMaterial: !!edit.disableMaterial,
      budget: n(edit.budget) || n(edit.rate) * n(edit.quantity),
      nextRate: edit.nextRate ?? "",
      nextFiscalYear: edit.nextFiscalYear || "",
      sourceSheet: "เพิ่มเอง",
      sourceRow: "",
      customRate: true,
    });
  }
  return lines;
}

function filteredEstBudgetRateLines() {
  const query = state.estFilters.query.trim().toLowerCase();
  return estBudgetRateLines().filter((line) => {
    const fiscalOk = state.estFilters.fiscalYear === "all" || String(line.fiscalYear || "") === String(state.estFilters.fiscalYear);
    const areaOk = state.estFilters.area === "all" || [line.blockKey, line.block, line.area].map(String).includes(String(state.estFilters.area));
    const groupOk = state.estFilters.activityGroup === "all" || String(line.activityGroup || "") === String(state.estFilters.activityGroup);
    const activityOk = state.estFilters.activity === "all" || [line.activityKey, line.activity].map(String).includes(String(state.estFilters.activity));
    const materialOk = state.estFilters.material === "all" || [line.materialKey, line.material].map(String).includes(String(state.estFilters.material));
    const workerOk = state.estFilters.workerGroup === "all" || String(line.workerGroup || "") === String(state.estFilters.workerGroup);
    const rateGroupOk = state.estFilters.rateGroup === "all" || String(line.rateGroup || "") === String(state.estFilters.rateGroup);
    const queryOk = !query || [line.activityGroup, line.activity, line.contractName, line.blockKey, line.block, line.area, line.material, line.workerGroup, line.rateGroup, line.roleName, line.unit, line.sourceSheet].join(" ").toLowerCase().includes(query);
    return fiscalOk && areaOk && groupOk && activityOk && materialOk && workerOk && rateGroupOk && queryOk;
  });
}

function updateEstBudgetRateLine(id, patch) {
  const current = state.estBudgetRateEdits.find((row) => row.id === id);
  if (current) Object.assign(current, patch, { updatedAt: new Date().toISOString() });
  else state.estBudgetRateEdits.push({ id, ...patch, updatedAt: new Date().toISOString() });
  saveEstBudgetRateEdits();
}

function addEstBudgetRateLine() {
  const activitySelect = document.querySelector("#estRateActivity");
  const activityOption = activitySelect?.selectedOptions?.[0];
  const activity = activityOption?.dataset.name || activitySelect?.value || "ไม่ระบุกิจกรรม";
  const areaSelect = document.querySelector("#estRateBlock");
  const areaOption = areaSelect?.selectedOptions?.[0];
  const materialSelect = document.querySelector("#estRateMaterial");
  const materialOption = materialSelect?.selectedOptions?.[0];
  const row = {
    id: `manual-rate-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    customRate: true,
    fiscalYear: document.querySelector("#estRateYear")?.value || state.estFilters.fiscalYear || "2569",
    activityGroup: document.querySelector("#estRateActivityGroup")?.value || activityOption?.dataset.group || activity,
    activityKey: activitySelect?.value || activity,
    activity,
    contractName: document.querySelector("#estRateContract")?.value.trim() || activity,
    blockKey: areaSelect?.value || "",
    block: areaOption?.dataset.name || areaSelect?.value || "",
    area: document.querySelector("#estRateArea")?.value.trim() || areaOption?.dataset.name || "",
    quantity: n(document.querySelector("#estRateQuantity")?.value),
    rate: n(document.querySelector("#estRateValue")?.value),
    unit: document.querySelector("#estRateUnit")?.value || "บาท/งาน",
    materialKey: materialSelect?.value || "",
    material: materialOption?.dataset.name || materialSelect?.value || "",
    materialUnit: document.querySelector("#estRateMaterialUnit")?.value || "",
    materialQty: n(document.querySelector("#estRateMaterialQty")?.value),
    materialRate: n(document.querySelector("#estRateMaterialRate")?.value),
    workerGroup: document.querySelector("#estRateWorkerGroup")?.value || "",
    rateGroup: document.querySelector("#estRateGroup")?.value || "",
    roleName: document.querySelector("#estRateRoleName")?.value.trim() || document.querySelector("#estRateWorkerGroup")?.value || "",
    disableMaterial: !!document.querySelector("#estRateDisableMaterial")?.checked,
    budget: n(document.querySelector("#estRateBudget")?.value),
    sourceSheet: "เพิ่มเอง",
    createdAt: new Date().toISOString(),
  };
  const materialCost = row.disableMaterial ? 0 : row.materialQty * row.materialRate;
  row.budget = row.budget || (row.rate * row.quantity) + materialCost;
  state.estBudgetRateEdits.push(row);
  saveEstBudgetRateEdits();
  render();
}

function deleteEstBudgetRateLine(id) {
  const current = state.estBudgetRateEdits.find((row) => row.id === id);
  if (current) current._deleted = true;
  else state.estBudgetRateEdits.push({ id, _deleted: true, updatedAt: new Date().toISOString() });
  saveEstBudgetRateEdits();
  render();
}

function createEstPlanFromRateLine(id) {
  const line = estBudgetRateLines().find((item) => item.id === id);
  if (!line) return;
  const plan = {
    id: `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    planNo: `PLAN-${line.fiscalYear || "2569"}-${String(state.estWorkPlans.length + 1).padStart(3, "0")}`,
    startDate: "",
    endDate: "",
    activity: line.activity,
    block: line.block,
    workers: 0,
    quantity: n(line.quantity),
    budget: n(line.budget) || n(line.rate) * n(line.quantity),
    note: `จากอัตรา ${line.contractName}`,
    rate: n(line.rate),
    sourceSheet: line.sourceSheet,
    sourceRow: line.sourceRow,
    status: "Planned",
    createdAt: new Date().toISOString(),
    targetTable: "est_work_plans",
  };
  state.estWorkPlans.push(plan);
  saveEstWorkPlans();
  render();
  return plan;
}

function rollEstBudgetRatesToNextYear() {
  const nextYear = "2570";
  for (const line of filteredEstBudgetRateLines()) {
    updateEstBudgetRateLine(line.id, { nextFiscalYear: nextYear, nextRate: n(line.rate), nextBudget: n(line.budget) });
  }
  render();
}

function estSelectedBudgetMeta(selectId = "estPlanBlock") {
  const selected = document.querySelector(`#${selectId}`)?.selectedOptions?.[0];
  return {
    block: selected?.value || "",
    sheet: selected?.dataset.sheet || "",
    activity: selected?.dataset.activity || "",
    rate: n(selected?.dataset.rate),
    sourceRow: selected?.dataset.row || "",
  };
}

function renderEstFlowHeader() {
  const planCount = state.estWorkPlans.length;
  const orderCount = state.estWorkOrders.length;
  const doneCount = state.estDailyEntries.length;
  return `
    <section class="est-flow-status">
      <article><b>1</b><span>วางแผนงาน</span><strong>${fmt(planCount)}</strong></article>
      <article><b>2</b><span>สั่งงานจากแผน</span><strong>${fmt(orderCount)}</strong></article>
      <article><b>3</b><span>บันทึกงานจากใบสั่งงาน</span><strong>${fmt(doneCount)}</strong></article>
    </section>`;
}

function renderEstPlanPage() {
  const options = estBudgetOptions();
  const activities = Object.keys(state.estData?.activityTotals || {}).sort();
  const plans = [...state.estWorkPlans].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return `
    <div class="est-page">
      <div class="report-title">
        <div>
          <h2>วางแผนงาน</h2>
          <p>สร้างแผนจากงบประมาณ 2569 แล้วส่งต่อเป็นใบสั่งงานเพื่อให้หัวหน้าเลือกไปบันทึกงานจริง</p>
        </div>
      </div>
      ${renderEstFlowHeader()}
      <section class="est-entry-grid">
        <form class="est-entry-form">
          <label>เลขที่แผน<input id="estPlanNo" type="text" placeholder="PLAN-2569-001"></label>
          <label>วันที่เริ่ม<input id="estPlanStart" type="date"></label>
          <label>วันที่สิ้นสุด<input id="estPlanEnd" type="date"></label>
          <label>กิจกรรม
            <select id="estPlanActivity">${activities.map((activity) => `<option value="${esc(activity)}">${esc(activity)}</option>`).join("")}</select>
          </label>
          <label class="est-form-wide">บล็อก / ข้อมูลงบประมาณ
            <select id="estPlanBlock">
              ${options.map((item) => `<option value="${esc(item.block)}" data-sheet="${esc(item.sheet)}" data-rate="${esc(item.rate)}" data-activity="${esc(item.activity)}" data-row="${esc(item.sourceRow)}">${esc(item.block)} · ${esc(item.activity)} · ${esc(item.sheet)}</option>`).join("")}
            </select>
          </label>
          <label>คนงานแผน<input id="estPlanWorkers" type="number" step="1" min="0"></label>
          <label>ปริมาณแผน<input id="estPlanQty" type="number" step="0.01" min="0"></label>
          <label>งบประมาณ<input id="estPlanBudget" type="number" step="0.01" min="0"></label>
          <label class="est-form-wide">หมายเหตุ<input id="estPlanNote" type="text"></label>
          <div class="est-form-actions"><button type="button" data-est-save-plan>บันทึกแผน</button></div>
        </form>
        <section class="est-panel est-source-card">
          <div class="section-head"><h3>หลักการดึงข้อมูล</h3><span>Plan source</span></div>
          <div class="est-source-list">
            <p><strong>บล็อก/กิจกรรม/อัตรา:</strong> ดึงจากไฟล์ ${esc(state.estData?.source?.budgetFile || "")}</p>
            <p><strong>ปลายทาง Supabase:</strong> <code>est_work_plans</code></p>
            <p><strong>ขั้นถัดไป:</strong> ไปที่เมนูสั่งงานเพื่อดึงแผนนี้ไปออกใบสั่งงาน</p>
          </div>
        </section>
      </section>
      <section class="est-panel">
        <div class="section-head"><h3>แผนงานที่สร้างแล้ว</h3><span>${fmt(plans.length)} plans</span></div>
        <div class="table-wrap est-table-wrap">
          <table class="mini-table est-table">
            <thead><tr><th></th><th>แผน</th><th>ช่วงวันที่</th><th>กิจกรรม</th><th>บล็อก</th><th>คนงาน</th><th>ปริมาณ</th><th>งบ</th><th>สถานะ</th><th>ที่มา</th></tr></thead>
            <tbody>${plans.map((plan) => `<tr>
              <td><button type="button" data-est-plan-to-order="${esc(plan.id)}">ออกใบสั่งงาน</button></td>
              <td>${esc(plan.planNo)}</td>
              <td>${esc(plan.startDate)} - ${esc(plan.endDate)}</td>
              <td>${esc(plan.activity)}</td>
              <td>${esc(plan.block)}</td>
              <td>${fmt(plan.workers)}</td>
              <td>${fmt(plan.quantity)}</td>
              <td>${moneyNf.format(n(plan.budget))}</td>
              <td>${esc(plan.status)}</td>
              <td>${esc(plan.sourceSheet)} #${esc(plan.sourceRow)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
      ${renderEstBudgetTable()}
    </div>`;
}

function renderEstWorkOrderPage() {
  const plans = state.estWorkPlans;
  const orders = [...state.estWorkOrders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return `
    <div class="est-page">
      <div class="report-title"><h2>สั่งงาน</h2><p>ดึงแผนงานที่สร้างไว้มาออกใบสั่งงาน แล้วส่งต่อให้เมนูบันทึกทำงานเลือกใช้งาน</p></div>
      ${renderEstFlowHeader()}
      <section class="est-entry-grid">
        <form class="est-entry-form">
          <label class="est-form-wide">เลือกแผนงาน
            <select id="estOrderPlan">
              ${plans.map((plan) => `<option value="${esc(plan.id)}">${esc(plan.planNo)} · ${esc(plan.activity)} · ${esc(plan.block)}</option>`).join("")}
            </select>
          </label>
          <label>เลขที่ใบสั่งงาน<input id="estOrderNo" type="text" placeholder="WO-2569-001"></label>
          <label>วันที่สั่งงาน<input id="estOrderDate" type="date"></label>
          <label>หัวหน้า/ทีม<input id="estOrderSupervisor" type="text"></label>
          <label>สถานะ
            <select id="estOrderStatus">
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </label>
          <label class="est-form-wide">หมายเหตุ<input id="estOrderNote" type="text"></label>
          <div class="est-form-actions"><button type="button" data-est-save-order>บันทึกใบสั่งงาน</button></div>
        </form>
        <section class="est-panel est-source-card">
          <div class="section-head"><h3>การเชื่อม flow</h3><span>Work Order source</span></div>
          <div class="est-source-list">
            <p><strong>ใบสั่งงานต้องเลือกจากแผน:</strong> ไม่มีแผนจะไม่มีข้อมูลให้สั่งงาน</p>
            <p><strong>ปลายทาง Supabase:</strong> <code>est_work_orders</code></p>
            <p><strong>ขั้นถัดไป:</strong> เมนูบันทึกทำงานจะดึงเลขใบสั่งงานจากรายการนี้</p>
          </div>
        </section>
      </section>
      <section class="est-panel">
        <div class="section-head"><h3>ใบสั่งงาน</h3><span>${fmt(orders.length)} work orders</span></div>
        <div class="table-wrap est-table-wrap">
          <table class="mini-table est-table">
            <thead><tr><th></th><th>WO</th><th>วันที่</th><th>แผน</th><th>กิจกรรม</th><th>บล็อก</th><th>หัวหน้า</th><th>สถานะ</th></tr></thead>
            <tbody>${orders.map((order) => `<tr>
              <td><button type="button" data-est-del-order="${esc(order.id)}">ลบ</button></td>
              <td>${esc(order.orderNo)}</td>
              <td>${esc(order.orderDate)}</td>
              <td>${esc(order.planNo)}</td>
              <td>${esc(order.activity)}</td>
              <td>${esc(order.block)}</td>
              <td>${esc(order.supervisor)}</td>
              <td>${esc(order.status)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
    </div>`;
}

function renderEstDailyEntryPage() {
  const options = estBudgetOptions();
  const activities = Object.keys(state.estData?.activityTotals || {}).sort();
  const orders = state.estWorkOrders;
  const recent = [...state.estDailyEntries].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 80);
  const datasetRows = estDatasets().map((dataset) => `
    <tr>
      <td>${esc(dataset.sheet)}</td>
      <td>${esc(dataset.activity)}</td>
      <td>${fmt(dataset.rowCount)}</td>
      <td>${esc((dataset.headers || []).slice(0, 6).join(", "))}</td>
      <td>${esc(state.estData?.source?.budgetFile || "")}</td>
    </tr>`).join("");
  return `
    <div class="est-page">
      <div class="report-title">
        <div>
          <h2>บันทึกข้อมูลการทำงาน</h2>
          <p>บันทึกงานจริงรายวัน โดยดึงใบสั่งงานจาก flow วางแผนงาน → สั่งงาน และยังอ้างอิงงบประมาณ 2569 ได้</p>
        </div>
      </div>
      ${renderEstFlowHeader()}
      <section class="est-entry-grid">
        <form id="estDailyForm" class="est-entry-form">
          <label>วันที่ทำงาน<input id="estWorkDate" type="date" required></label>
          <label class="est-form-wide">ใบสั่งงานจากแผน
            <select id="estWorkOrderSelect">
              <option value="">เลือกใบสั่งงาน หรือบันทึกเอง</option>
              ${orders.map((order) => `<option value="${esc(order.id)}" data-order="${esc(order.orderNo)}" data-activity="${esc(order.activity)}" data-block="${esc(order.block)}" data-sheet="${esc(order.sourceSheet)}" data-row="${esc(order.sourceRow)}" data-rate="${esc(order.rate)}">${esc(order.orderNo)} · ${esc(order.activity)} · ${esc(order.block)}</option>`).join("")}
            </select>
          </label>
          <label>กิจกรรม
            <select id="estWorkActivity">
              ${activities.map((activity) => `<option value="${esc(activity)}">${esc(activity)}</option>`).join("")}
            </select>
          </label>
          <label>บล็อก / แหล่งข้อมูล
            <select id="estWorkBlock">
              ${options.map((item) => `<option value="${esc(item.block)}" data-sheet="${esc(item.sheet)}" data-rate="${esc(item.rate)}" data-activity="${esc(item.activity)}" data-row="${esc(item.sourceRow)}">${esc(item.block)} · ${esc(item.sheet)}</option>`).join("")}
            </select>
          </label>
          <label>เลขที่ใบสั่งงาน<input id="estWorkOrder" type="text" placeholder="ดึงจากใบสั่งงาน หรือกรอกเอง"></label>
          <label>จำนวนคนงาน<input id="estWorkerCount" type="number" step="1" min="0"></label>
          <label>ปริมาณงาน<input id="estQuantity" type="number" step="0.01" min="0"></label>
          <label>น้ำหนักตัน<input id="estWeightTon" type="number" step="0.001" min="0"></label>
          <label>จำนวนทะลาย<input id="estBunchCount" type="number" step="1" min="0"></label>
          <label>อัตราค่าแรง<input id="estRate" type="number" step="0.01" min="0"></label>
          <label>เงินหัก<input id="estDeduction" type="number" step="0.01" min="0"></label>
          <label class="est-form-wide">หมายเหตุ<input id="estWorkNote" type="text"></label>
          <div class="est-form-actions">
            <button type="button" data-est-save-work>บันทึกข้อมูล</button>
          </div>
        </form>
        <section class="est-panel est-source-card">
          <div class="section-head">
            <h3>รายละเอียดดึงข้อมูล</h3>
            <span>แสดงที่มาของ dropdown และงบประมาณ</span>
          </div>
          <div class="est-source-list">
            <p><strong>ไฟล์หลัก:</strong> ${esc(state.estData?.source?.budgetFile || "")}</p>
            <p><strong>Requirement:</strong> ${esc(state.estData?.source?.estFile || "est.docx")}</p>
            <p><strong>ใบสั่งงานจากแผน:</strong> ${fmt(orders.length)} รายการ จาก <code>est_work_orders</code></p>
            <p><strong>Dataset งบประมาณ:</strong> ${fmt(state.estData?.source?.datasetCount || 0)} ชีต / ${fmt(state.estData?.source?.rowCount || 0)} แถว</p>
            <p><strong>ตัวเลือกบล็อก:</strong> ${fmt(options.length)} รายการ</p>
            <p><strong>ปลายทางฐานข้อมูล:</strong> Supabase table <code>est_daily_entries</code>, <code>est_payroll_lines</code></p>
          </div>
        </section>
      </section>
      <section class="est-panel">
        <div class="section-head"><h3>รายการบันทึกล่าสุด</h3><span>${fmt(state.estDailyEntries.length)} draft records</span></div>
        <div class="table-wrap est-table-wrap">
          <table class="mini-table est-table">
            <thead><tr><th></th><th>วันที่</th><th>กิจกรรม</th><th>บล็อก</th><th>ใบสั่งงาน</th><th>คนงาน</th><th>ปริมาณ</th><th>ตัน</th><th>อัตรา</th><th>เงินหัก</th><th>ที่มา</th></tr></thead>
            <tbody>
              ${recent.map((row) => `<tr>
                <td><button type="button" data-est-del-work="${esc(row.id)}">ลบ</button></td>
                <td>${esc(row.date)}</td>
                <td>${esc(row.activity)}</td>
                <td>${esc(row.block)}</td>
                <td>${esc(row.workOrder)}</td>
                <td>${fmt(row.workerCount)}</td>
                <td>${fmt(row.quantity)}</td>
                <td>${tonNf.format(n(row.weightTon))}</td>
                <td>${moneyNf.format(n(row.rate))}</td>
                <td>${moneyNf.format(n(row.deduction))}</td>
                <td>${esc(row.sourceSheet)} #${esc(row.sourceRow)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>
      <section class="est-panel">
        <div class="section-head"><h3>รายละเอียดข้อมูลที่ดึงมา</h3><span>ทุกชีตจากประมาณการค่าใช้จ่าย 2569</span></div>
        <div class="table-wrap est-table-wrap">
          <table class="mini-table">
            <thead><tr><th>ชีต</th><th>กลุ่มกิจกรรม</th><th>Rows</th><th>คอลัมน์ที่อ่านได้</th><th>ไฟล์</th></tr></thead>
            <tbody>${datasetRows}</tbody>
          </table>
        </div>
      </section>
      ${renderEstToolbar()}
      ${renderEstBudgetTable()}
    </div>`;
}

function saveEstDailyWorkEntry() {
  const blockSelect = document.querySelector("#estWorkBlock");
  const orderSelect = document.querySelector("#estWorkOrderSelect");
  const selected = blockSelect?.selectedOptions?.[0];
  const selectedOrder = orderSelect?.selectedOptions?.[0];
  const row = {
    id: `work-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: document.querySelector("#estWorkDate")?.value || isoDateFromUtc(new Date()),
    workOrderId: orderSelect?.value || "",
    activity: selectedOrder?.dataset.activity || document.querySelector("#estWorkActivity")?.value || selected?.dataset.activity || "",
    block: selectedOrder?.dataset.block || blockSelect?.value || "",
    workOrder: selectedOrder?.dataset.order || document.querySelector("#estWorkOrder")?.value.trim() || "",
    workerCount: n(document.querySelector("#estWorkerCount")?.value),
    quantity: n(document.querySelector("#estQuantity")?.value),
    weightTon: n(document.querySelector("#estWeightTon")?.value),
    bunchCount: n(document.querySelector("#estBunchCount")?.value),
    rate: n(document.querySelector("#estRate")?.value || selectedOrder?.dataset.rate || selected?.dataset.rate),
    deduction: n(document.querySelector("#estDeduction")?.value),
    note: document.querySelector("#estWorkNote")?.value.trim() || "",
    sourceSheet: selectedOrder?.dataset.sheet || selected?.dataset.sheet || "",
    sourceRow: selectedOrder?.dataset.row || selected?.dataset.row || "",
    createdAt: new Date().toISOString(),
    targetTables: ["est_daily_entries", "est_payroll_lines"],
  };
  state.estDailyEntries.push(row);
  saveEstDailyEntries();
  render();
}

function saveEstWorkPlan() {
  const meta = estSelectedBudgetMeta("estPlanBlock");
  const planNo = document.querySelector("#estPlanNo")?.value.trim() || `PLAN-${Date.now()}`;
  const plan = {
    id: `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    planNo,
    startDate: document.querySelector("#estPlanStart")?.value || "",
    endDate: document.querySelector("#estPlanEnd")?.value || "",
    activity: document.querySelector("#estPlanActivity")?.value || meta.activity,
    block: meta.block,
    workers: n(document.querySelector("#estPlanWorkers")?.value),
    quantity: n(document.querySelector("#estPlanQty")?.value),
    budget: n(document.querySelector("#estPlanBudget")?.value),
    note: document.querySelector("#estPlanNote")?.value.trim() || "",
    rate: meta.rate,
    sourceSheet: meta.sheet,
    sourceRow: meta.sourceRow,
    status: "Planned",
    createdAt: new Date().toISOString(),
    targetTable: "est_work_plans",
  };
  state.estWorkPlans.push(plan);
  saveEstWorkPlans();
  render();
}

function saveEstMasterRecord() {
  const category = state.estMasterCategory;
  const config = EST_MASTER_CATEGORIES[category] || EST_MASTER_CATEGORIES.areas;
  const current = state.estMasterEditId
    ? state.estMasterRecords.find((row) => row.id === state.estMasterEditId)
    : null;
  const row = current || {
    id: `master-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    category,
    createdAt: new Date().toISOString(),
  };
  for (const input of els.reportPage.querySelectorAll("[data-est-master-field]")) {
    row[input.dataset.estMasterField] = input.value.trim();
  }
  row.category = category;
  row.targetTable = config.table;
  row.updatedAt = new Date().toISOString();
  if (!current) state.estMasterRecords.push(row);
  state.estMasterEditId = "";
  saveEstMasterRecords();
  render();
}

function setEstMasterSyncMessage(message) {
  state.estMasterSyncMessage = message;
}

function activeEstMasterDraftRows() {
  return state.estMasterRecords.filter((row) => row.category === state.estMasterCategory);
}

function normalizeEstMasterDbRows(rows, categoryKey, table) {
  return (rows || []).map((row, index) => ({
    ...row,
    id: row.id || `db-${categoryKey}-${Date.now()}-${index}`,
    category: row.category || categoryKey,
    targetTable: row.targetTable || row.target_table || table,
    _source: row._source || "database",
    readonly: false,
  }));
}

async function syncEstMasterToDatabase() {
  const categoryKey = state.estMasterCategory;
  const category = EST_MASTER_CATEGORIES[categoryKey] || EST_MASTER_CATEGORIES.areas;
  const rows = activeEstMasterDraftRows();
  if (!rows.length) {
    setEstMasterSyncMessage("ยังไม่มีข้อมูล draft ในหมวดนี้สำหรับบันทึกลงฐานข้อมูล");
    render();
    return;
  }
  state.estMasterSyncBusy = true;
  setEstMasterSyncMessage(`กำลังบันทึก ${fmt(rows.length)} รายการ ไปที่ ${category.table}...`);
  render();
  try {
    const res = await fetch(EST_MASTER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", category: categoryKey, table: category.table, rows }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${res.status}`);
    const savedRows = normalizeEstMasterDbRows(payload.rows || rows, categoryKey, category.table);
    const savedIds = new Set(savedRows.map((row) => row.id));
    state.estMasterRecords = state.estMasterRecords
      .filter((row) => row.category !== categoryKey || !savedIds.has(row.id))
      .concat(savedRows);
    saveEstMasterRecords();
    setEstMasterSyncMessage(`บันทึกลงฐานข้อมูลแล้ว ${fmt(savedRows.length)} รายการ (${category.table})`);
  } catch (err) {
    setEstMasterSyncMessage(`ยังเชื่อมฐานข้อมูลไม่ได้: ${err.message}. ระบบเก็บ draft ไว้ในเครื่องก่อน`);
  } finally {
    state.estMasterSyncBusy = false;
    render();
  }
}

async function loadEstMasterFromDatabase() {
  const categoryKey = state.estMasterCategory;
  const category = EST_MASTER_CATEGORIES[categoryKey] || EST_MASTER_CATEGORIES.areas;
  state.estMasterSyncBusy = true;
  setEstMasterSyncMessage(`กำลังเรียกดูข้อมูลจาก ${category.table}...`);
  render();
  try {
    const url = `${EST_MASTER_API}?category=${encodeURIComponent(categoryKey)}&table=${encodeURIComponent(category.table)}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${res.status}`);
    const dbRows = normalizeEstMasterDbRows(payload.rows || payload.data || [], categoryKey, category.table);
    state.estMasterRecords = state.estMasterRecords.filter((row) => row.category !== categoryKey).concat(dbRows);
    state.estMasterEditId = "";
    saveEstMasterRecords();
    setEstMasterSyncMessage(`เรียกดูข้อมูลจากฐานข้อมูลแล้ว ${fmt(dbRows.length)} รายการ พร้อมแก้ไขในตาราง`);
  } catch (err) {
    setEstMasterSyncMessage(`ยังเรียกดูฐานข้อมูลไม่ได้: ${err.message}. แสดงข้อมูล draft และข้อมูลอ้างอิงเดิมก่อน`);
  } finally {
    state.estMasterSyncBusy = false;
    render();
  }
}

function saveMasterFolderRow() {
  const table = activeMasterFolderTable();
  if (!table) return;
  const form = els.reportPage.querySelector(".folder-master-form");
  if (form && !form.reportValidity()) {
    setEstMasterSyncMessage("กรุณากรอกช่องที่มีเครื่องหมาย * ให้ครบก่อนบันทึก");
    return;
  }
  const editingId = state.masterFolderEditId;
  const sourceRow = editingId ? masterFolderRows(table).find((item) => item.id === editingId) : null;
  const current = editingId
    ? state.masterFolderRecords.find((row) => row.tableId === table.id && (row.id === editingId || row._overrideOf === editingId))
    : null;
  const row = current || {
    id: sourceRow?.readonly ? sourceRow.id : `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tableId: table.id,
    category: table.id,
    targetTable: `master:${table.id}`,
    _overrideOf: sourceRow?.readonly ? sourceRow.id : "",
    createdAt: new Date().toISOString(),
  };
  for (const input of els.reportPage.querySelectorAll("[data-folder-master-field]")) {
    row[input.dataset.folderMasterField] = input.value.trim();
  }
  row.updatedAt = new Date().toISOString();
  row._source = "draft";
  if (!current) state.masterFolderRecords.push(row);
  state.masterFolderEditId = "";
  state.masterFolderDetailId = row.id;
  saveMasterFolderRecords();
  render();
}

function startEditMasterFolderRow(rowId) {
  const table = activeMasterFolderTable();
  if (!table) return;
  const row = masterFolderRows(table).find((item) => item.id === rowId);
  if (!row) return;
  if (row.readonly) {
    state.masterFolderEditId = row.id;
    state.masterFolderDetailId = row.id;
    render();
    return;
  }
  if (row.readonly) {
    const current = state.masterFolderRecords.find((item) => item.tableId === table.id && item._overrideOf === row.id);
    if (!current) {
      state.masterFolderRecords.push({
        ...row,
        id: row.id,
        tableId: table.id,
        category: table.id,
        targetTable: `master:${table.id}`,
        _overrideOf: row.id,
        readonly: false,
        _source: "editing",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      saveMasterFolderRecords();
    }
    state.masterFolderEditId = row.id;
    state.masterFolderDetailId = row.id;
    render();
    return;
  }
  if (row.readonly) {
    const draft = {
      ...row,
      id: `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tableId: table.id,
      category: table.id,
      targetTable: `master:${table.id}`,
      readonly: false,
      _source: "กำลังแก้ไข",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.masterFolderRecords.push(draft);
    state.masterFolderEditId = draft.id;
    saveMasterFolderRecords();
  } else {
    state.masterFolderEditId = row.id;
  }
  render();
}

async function syncMasterFolderTableToDatabase() {
  const table = activeMasterFolderTable();
  if (!table) return;
  const rows = masterFolderRows(table).map(({ readonly, _deleted, _overrideOf, ...row }) => row);
  if (!rows.length) {
    setEstMasterSyncMessage("table นี้ไม่มีข้อมูลสำหรับบันทึก");
    render();
    return;
  }
  state.estMasterSyncBusy = true;
  setEstMasterSyncMessage(`กำลังบันทึก ${fmt(rows.length)} rows จาก ${table.title}...`);
  render();
  try {
    const res = await fetch(EST_MASTER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace", category: table.id, table: `master:${table.id}`, rows }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${res.status}`);
    setEstMasterSyncMessage(`บันทึก table ${table.title} ลงฐานข้อมูลแล้ว ${fmt(payload.rows?.length || rows.length)} rows`);
  } catch (err) {
    setEstMasterSyncMessage(`บันทึกฐานข้อมูลไม่สำเร็จ: ${err.message}`);
  } finally {
    state.estMasterSyncBusy = false;
    render();
  }
}

async function loadMasterFolderTableFromDatabase() {
  const table = activeMasterFolderTable();
  if (!table) return;
  state.estMasterSyncBusy = true;
  setEstMasterSyncMessage(`กำลังเรียกดู table ${table.title} จากฐานข้อมูล...`);
  render();
  try {
    const url = `${EST_MASTER_API}?category=${encodeURIComponent(table.id)}&table=${encodeURIComponent(`master:${table.id}`)}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${res.status}`);
    const dbRows = (payload.rows || payload.data || []).map((row, index) => ({
      ...row,
      id: row.id || `db-${table.id}-${index}`,
      tableId: table.id,
      _source: "database",
    }));
    state.masterFolderRecords = state.masterFolderRecords.filter((row) => row.tableId !== table.id).concat(dbRows);
    state.masterFolderEditId = "";
    saveMasterFolderRecords();
    setEstMasterSyncMessage(`เรียกดู ${fmt(dbRows.length)} rows จากฐานข้อมูลแล้ว สามารถกดแก้ไขในตารางได้`);
  } catch (err) {
    setEstMasterSyncMessage(`เรียกดูฐานข้อมูลไม่สำเร็จ: ${err.message}`);
  } finally {
    state.estMasterSyncBusy = false;
    render();
  }
}

async function importAllMasterFolderTablesToDatabase() {
  const tables = masterFolderTables();
  if (!tables.length) return;
  state.estMasterSyncBusy = true;
  let imported = 0;
  let importedTables = 0;
  try {
    for (const table of tables) {
      const rows = masterFolderRows(table).map(({ readonly, _deleted, _overrideOf, ...row }) => row);
      if (!rows.length) continue;
      setEstMasterSyncMessage(`กำลังนำเข้า ${table.title}: ${fmt(rows.length)} rows (${fmt(imported)} rows แล้ว)`);
      render();
      const res = await fetch(EST_MASTER_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replace", category: table.id, table: `master:${table.id}`, rows }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(`${table.title}: ${payload.error || `HTTP ${res.status}`}`);
      imported += rows.length;
      importedTables += 1;
    }
    setEstMasterSyncMessage(`บันทึกข้อมูลหลักลงฐานข้อมูลแล้ว ${fmt(imported)} rows จาก ${fmt(importedTables)} tables`);
  } catch (err) {
    setEstMasterSyncMessage(`นำเข้าทั้งหมดหยุดที่ ${fmt(imported)} rows: ${err.message}`);
  } finally {
    state.estMasterSyncBusy = false;
    render();
  }
}

function createEstWorkOrderFromPlan(plan, overrides = {}) {
  if (!plan) return null;
  const order = {
    id: `wo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    planId: plan.id,
    planNo: plan.planNo,
    orderNo: overrides.orderNo || `WO-${Date.now()}`,
    orderDate: overrides.orderDate || plan.startDate || isoDateFromUtc(new Date()),
    supervisor: overrides.supervisor || "",
    status: overrides.status || "Scheduled",
    note: overrides.note || "",
    activity: plan.activity,
    block: plan.block,
    workers: plan.workers,
    quantity: plan.quantity,
    budget: plan.budget,
    rate: plan.rate,
    sourceSheet: plan.sourceSheet,
    sourceRow: plan.sourceRow,
    createdAt: new Date().toISOString(),
    targetTable: "est_work_orders",
  };
  state.estWorkOrders.push(order);
  plan.status = "Ordered";
  saveEstWorkOrders();
  saveEstWorkPlans();
  return order;
}

function saveEstWorkOrder() {
  const planId = document.querySelector("#estOrderPlan")?.value || "";
  const plan = state.estWorkPlans.find((item) => item.id === planId);
  createEstWorkOrderFromPlan(plan, {
    orderNo: document.querySelector("#estOrderNo")?.value.trim() || "",
    orderDate: document.querySelector("#estOrderDate")?.value || "",
    supervisor: document.querySelector("#estOrderSupervisor")?.value.trim() || "",
    status: document.querySelector("#estOrderStatus")?.value || "Scheduled",
    note: document.querySelector("#estOrderNote")?.value.trim() || "",
  });
  render();
}

function renderEstDashboard() {
  const source = state.estData?.source || {};
  const totals = state.estData?.activityTotals || {};
  const rows = Object.entries(totals).sort((a, b) => n(b[1].laborCost) - n(a[1].laborCost));
  const totalCost = rows.reduce((sum, [, item]) => sum + n(item.laborCost), 0);
  const totalArea = rows.reduce((sum, [, item]) => sum + n(item.areaRai), 0);
  const totalTrees = rows.reduce((sum, [, item]) => sum + n(item.trees), 0);
  return `
    <div class="est-page">
      <div class="report-title">
        <div>
          <h2>ระบบบริหารงานสวนปาล์ม</h2>
          <p>ใช้ ${esc(source.budgetFile || "ประมาณการค่าใช้จ่าย 2569.xlsx")} เป็นหลัก และรวมข้อมูลอ้างอิงจากโฟลเดอร์ Master Data</p>
        </div>
      </div>
      <section class="est-kpis">
        <article><span>ชีตงบประมาณ</span><strong>${fmt(source.datasetCount || 0)}</strong></article>
        <article><span>แถวข้อมูล</span><strong>${fmt(source.rowCount || 0)}</strong></article>
        <article><span>พื้นที่อ้างอิง</span><strong>${fmt(totalArea)}</strong></article>
        <article><span>จำนวนต้น</span><strong>${fmt(totalTrees)}</strong></article>
        <article><span>งบ/ค่าแรงรวม</span><strong>${moneyNf.format(totalCost)}</strong></article>
      </section>
      <section class="est-grid">
        <article class="est-panel">
          <div class="section-head"><h3>งบประมาณตามกลุ่มกิจกรรม</h3><span>เรียงตามมูลค่า</span></div>
          <div class="est-bars">
            ${rows.map(([activity, item]) => {
              const pct = totalCost ? Math.max(3, (n(item.laborCost) / totalCost) * 100) : 0;
              return `<div><span>${esc(activity)}</span><b style="width:${pct}%"></b><strong>${moneyNf.format(n(item.laborCost))}</strong></div>`;
            }).join("")}
          </div>
        </article>
        <article class="est-panel">
          <div class="section-head"><h3>เมนูจาก est.docx</h3><span>${fmt(state.estData?.estDoc?.paragraphs?.length || 0)} รายการ requirement</span></div>
          <ol class="est-flow">
            ${(state.estData?.estDoc?.paragraphs || []).slice(0, 10).map((line) => `<li>${esc(line)}</li>`).join("")}
          </ol>
        </article>
      </section>
    </div>`;
}

const EST_MASTER_CATEGORIES = {
  areas: {
    title: "ข้อมูลพื้นที่",
    detail: "แบ่งทุกระดับ เก็บถึงจำนวนต้น และปีปลูก",
    table: "est_blocks",
    primaryKey: "block",
    primaryLabel: "block_code",
    fields: [["zone", "ตอนบน/ตอนล่าง"], ["area", "แปลง"], ["block", "คีย์บล็อก / block_code"], ["palmYear", "ปีปลูก/รุ่นปี"], ["rai", "จำนวนไร่"], ["trees", "จำนวนต้น"], ["manager", "ผู้จัดการพื้นที่"]],
  },
  people: {
    title: "ข้อมูลพนักงาน/ผู้รับเหมา",
    detail: "แบ่งกลุ่มตอนบน/ล่าง ค่าแรง ผู้จัดการ ทีมหัวหน้า และผู้รับเหมา เพิ่มแก้ ระยะเวลาทำงาน",
    table: "est_workers, est_contractors",
    primaryKey: "code",
    primaryLabel: "worker_code / contractor_code",
    fields: [["code", "คีย์พนักงาน/ผู้รับเหมา"], ["name", "ชื่อ"], ["role", "ตำแหน่ง/ประเภท"], ["zone", "ตอนบน/ตอนล่าง"], ["team", "ทีม"], ["rate", "ค่าแรง"], ["startDate", "เริ่มงาน"], ["endDate", "สิ้นสุด"]],
  },
  payrollTypes: {
    title: "ประเภทเงินเพิ่ม/เงินหัก",
    detail: "เพิ่ม แก้ไข การลาแปรผันตามพนักงาน ตามบันทึกค่าแรง",
    table: "est_payroll_types",
    primaryKey: "code",
    primaryLabel: "payroll_type_code",
    references: { workerKey: { category: "people", label: "คีย์พนักงาน" } },
    fields: [["code", "คีย์ประเภทเงิน"], ["name", "ชื่อรายการ"], ["type", "เพิ่ม/หัก/ลา/ล่วงเวลา"], ["method", "วิธีคำนวณ"], ["rate", "อัตรา"], ["variableByWorker", "แปรผันตามพนักงาน"], ["workerKey", "คีย์พนักงานที่ผูก"]],
  },
  system: {
    title: "ข้อมูลระบบงาน",
    detail: "สถานะงาน ลำดับ flow และค่าตั้งต้นของระบบงานสวน",
    table: "est_system_settings",
    primaryKey: "key",
    primaryLabel: "setting_key",
    fields: [["key", "รหัสตั้งค่า"], ["name", "ชื่อรายการ"], ["group", "กลุ่มระบบ"], ["value", "ค่า"], ["description", "รายละเอียด"]],
  },
  budget: {
    title: "ข้อมูลงบประมาณ",
    detail: "บันทึกงบประมาณตามกิจกรรมรายบล็อก อัตราตามกิจกรรม และตามคนงาน/ผู้รับเหมา",
    table: "est_budget_lines",
    primaryKey: "budgetKey",
    primaryLabel: "budget_line_key",
    references: {
      blockKey: { category: "areas", label: "คีย์บล็อก" },
      activityKey: { category: "activities", label: "คีย์กิจกรรม" },
    },
    fields: [["budgetKey", "คีย์งบประมาณ"], ["fiscalYear", "ปีงบประมาณ"], ["activityKey", "คีย์กิจกรรม"], ["activity", "กิจกรรม"], ["blockKey", "คีย์บล็อก"], ["block", "บล็อก"], ["rate", "อัตรา"], ["workerRate", "อัตราคนงาน"], ["contractorRate", "อัตราผู้รับเหมา"], ["budget", "งบประมาณ"]],
  },
  activities: {
    title: "ข้อมูลงานกิจกรรม",
    detail: "จัดเป็นกลุ่มกิจกรรมใหญ่และย่อยลงมา พร้อมบันทึกแก้ไข",
    table: "est_activities",
    primaryKey: "code",
    primaryLabel: "activity_code",
    fields: [["group", "กลุ่มกิจกรรมใหญ่"], ["code", "คีย์กิจกรรม / activity_code"], ["name", "กิจกรรมย่อย"], ["unit", "หน่วย"], ["defaultRate", "อัตราตั้งต้น"], ["description", "รายละเอียด"]],
  },
};

function estMasterSourceRows(category) {
  const options = estBudgetOptions();
  if (category === "areas") {
    return options.slice(0, 80).map((row) => ({
      zone: row.block.includes("-T") ? "ตอนบน" : row.block.includes("-B") || row.block.includes("-P") ? "ตอนล่าง" : "",
      area: row.area,
      block: row.block,
      primaryKey: row.block,
      palmYear: String(row.block).slice(0, 2),
      rai: row.rai,
      trees: row.trees,
      manager: "",
      _source: `${row.sheet} #${row.sourceRow}`,
    }));
  }
  if (category === "budget") {
    return options.slice(0, 80).map((row) => ({
      budgetKey: `BUD-2569-${row.block || "BLOCK"}-${row.sourceRow || ""}`,
      fiscalYear: "2569",
      activityKey: row.activity,
      activity: row.activity,
      blockKey: row.block,
      block: row.block,
      rate: row.rate,
      workerRate: row.rate,
      contractorRate: "",
      budget: "",
      _source: `${row.sheet} #${row.sourceRow}`,
    }));
  }
  if (category === "activities") {
    return Object.keys(state.estData?.activityTotals || {}).map((activity, index) => ({
      group: activity,
      code: `ACT-${String(index + 1).padStart(3, "0")}`,
      name: activity,
      unit: "",
      defaultRate: "",
      description: "จากกลุ่มกิจกรรมในงบประมาณ 2569",
      _source: state.estData?.source?.budgetFile || "",
    }));
  }
  return [];
}

function estMasterRows(category) {
  return [
    ...estMasterSourceRows(category).map((row, index) => ({ ...row, id: `source-${category}-${index}`, readonly: true })),
    ...state.estMasterRecords.filter((row) => row.category === category),
  ];
}

function estMasterFieldKey(field) {
  return Array.isArray(field) ? field[0] : field.key;
}

function estMasterFieldLabel(field) {
  return Array.isArray(field) ? field[1] : field.label;
}

function estMasterPkValue(row, category) {
  const config = EST_MASTER_CATEGORIES[category] || {};
  const key = config.primaryKey || "id";
  return row.databaseId || row[key] || row.primaryKey || row.id || "";
}

function estMasterLabelValue(row, category) {
  if (category === "areas") return [row.block, row.area, row.zone].filter(Boolean).join(" / ");
  if (category === "people") return [row.code, row.name, row.role].filter(Boolean).join(" / ");
  if (category === "activities") return [row.code, row.name || row.group].filter(Boolean).join(" / ");
  if (category === "budget") return [row.budgetKey, row.block, row.activity].filter(Boolean).join(" / ");
  return [row.code || row.key || row.id, row.name || row.description].filter(Boolean).join(" / ");
}

function estMasterReferenceOptions(category) {
  const seen = new Set();
  return estMasterRows(category).map((row) => {
    const value = String(estMasterPkValue(row, category) || "").trim();
    if (!value || seen.has(value)) return null;
    seen.add(value);
    return { value, label: estMasterLabelValue(row, category) || value };
  }).filter(Boolean).slice(0, 250);
}

function renderEstMasterField(field, edit, category) {
  const key = estMasterFieldKey(field);
  const label = estMasterFieldLabel(field);
  const ref = category.references?.[key];
  const value = edit[key] ?? "";
  if (ref) {
    const options = estMasterReferenceOptions(ref.category);
    return `
      <label>${esc(label)}
        <select data-est-master-field="${esc(key)}">
          <option value="">เลือก${esc(ref.label || label)}</option>
          ${options.map((item) => `<option value="${esc(item.value)}" ${String(value) === String(item.value) ? "selected" : ""}>${esc(masterFolderOptionDisplayLabel(item))}</option>`).join("")}
        </select>
      </label>`;
  }
  return `
    <label>${esc(label)}
      <input data-est-master-field="${esc(key)}" value="${esc(value)}">
    </label>`;
}

function renderEstMasterSchema(categoryKey) {
  const tableRows = Object.entries(EST_MASTER_CATEGORIES).map(([key, config]) => {
    const refs = Object.entries(config.references || {}).map(([field, ref]) => `${field} -> ${EST_MASTER_CATEGORIES[ref.category]?.table || ref.category}.${EST_MASTER_CATEGORIES[ref.category]?.primaryLabel || "id"}`);
    return `
      <tr class="${key === categoryKey ? "is-added" : ""}">
        <td><strong>${esc(config.table)}</strong><small>${esc(config.title)}</small></td>
        <td><code>${esc(config.primaryLabel || config.primaryKey || "id")}</code></td>
        <td>${refs.length ? refs.map((item) => `<code>${esc(item)}</code>`).join("<br>") : "<span class=\"muted\">-</span>"}</td>
        <td>${fmt(estMasterRows(key).length)}</td>
      </tr>`;
  }).join("");
  const active = EST_MASTER_CATEGORIES[categoryKey] || EST_MASTER_CATEGORIES.areas;
  const relationRows = Object.entries(active.references || {}).map(([field, ref]) => `
    <article>
      <b>${esc(field)}</b>
      <span>${esc(active.table)} ดึงคีย์จาก ${esc(EST_MASTER_CATEGORIES[ref.category]?.table || ref.category)}</span>
      <strong>${fmt(estMasterReferenceOptions(ref.category).length)} keys</strong>
    </article>`).join("") || `<article><b>${esc(active.primaryLabel || active.primaryKey || "id")}</b><span>หมวดนี้เป็นตารางหลัก ใช้คีย์นี้ให้ตารางอื่นอ้างอิง</span><strong>${fmt(estMasterReferenceOptions(categoryKey).length)} keys</strong></article>`;
  return `
    <section class="est-panel est-schema-panel">
      <div class="section-head"><h3>โครงสร้าง Table และ Key</h3><span>Primary key / Foreign key</span></div>
      <div class="est-key-flow">${relationRows}</div>
      <div class="table-wrap est-table-wrap">
        <table class="mini-table est-table">
          <thead><tr><th>Table</th><th>คีย์หลัก</th><th>คีย์ที่ดึงมาใช้ร่วมกัน</th><th>Records</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </section>`;
}

function buildMasterAreaGroupTable(tables) {
  const terrainTable = (tables || []).find((table) => table.id === "cultivate_terrains");
  if (!terrainTable) return null;
  const rowsByCode = new Map();
  for (const row of terrainTable.rows || []) {
    const code = String(row.superior_code || "").trim();
    if (!code || rowsByCode.has(code)) continue;
    rowsByCode.set(code, {
      area_parent_code: code,
      area_parent_name: String(row.superior_name || code).trim(),
      source_table: terrainTable.id,
    });
  }
  return {
    id: "master_area_groups",
    title: "แปลง",
    domain: "area",
    source: "cultivate_terrains.superior_code",
    primaryKey: "area_parent_code",
    primaryLabel: "รหัสพื้นที่แม่",
    columns: [
      { key: "area_parent_code", label: "รหัสพื้นที่แม่" },
      { key: "area_parent_name", label: "ชื่อ" },
    ],
    references: [],
    rows: Array.from(rowsByCode.values()).sort((a, b) => String(a.area_parent_code).localeCompare(String(b.area_parent_code), "th")),
    rowCount: rowsByCode.size,
    virtual: true,
  };
}

function normalizeMasterFolderTable(table) {
  if (table?.id !== "cultivate_terrains") return table;
  return {
    ...table,
    title: "ข้อมูลพื้นที่",
    columns: (table.columns || []).map((column) => {
      if (column.key === "superior_code") return { ...column, label: "รหัสพื้นที่แม่" };
      if (column.key === "superior_name") return { ...column, label: "แปลง" };
      return column;
    }),
    references: [
      ...(table.references || []).filter((ref) => ref.field !== "superior_code"),
      { field: "superior_code", refTable: "master_area_groups", refKey: "area_parent_code" },
    ],
  };
}

function masterFolderTables() {
  const baseTables = (state.masterFolderData?.tables || []).map(normalizeMasterFolderTable);
  const areaGroupTable = buildMasterAreaGroupTable(baseTables);
  if (!areaGroupTable) return baseTables;
  return [areaGroupTable, ...baseTables.filter((table) => table.id !== areaGroupTable.id)];
}

function activeMasterFolderTable() {
  return masterFolderTables().find((table) => table.id === state.masterFolderTableId) || masterFolderTables()[0] || null;
}

function masterFolderDraftRows(tableId) {
  return state.masterFolderRecords.filter((row) => row.tableId === tableId);
}

function masterFolderRows(table) {
  if (!table) return [];
  const draftRows = masterFolderDraftRows(table.id);
  const deletedIds = new Set(draftRows.filter((row) => row._deleted).map((row) => row.id));
  const overrides = new Map(draftRows.filter((row) => row._overrideOf && !row._deleted).map((row) => [row._overrideOf, row]));
  const baseRows = (table.rows || []).map((row, index) => {
    const id = `master-${table.id}-${index}`;
    const override = overrides.get(id);
    if (override) {
      return { ...row, ...override, id, tableId: table.id, readonly: false, _source: "แก้ไข" };
    }
    return { ...row, id, tableId: table.id, readonly: true, _source: "ข้อมูลหลัก" };
  }).filter((row) => !deletedIds.has(row.id));
  const baseIds = new Set(baseRows.map((row) => row.id));
  const newRows = draftRows.filter((row) => !row._deleted && !row._overrideOf && !baseIds.has(row.id));
  return [...baseRows, ...newRows];
  return [
    ...(table.rows || []).map((row, index) => ({ ...row, id: `master-${table.id}-${index}`, tableId: table.id, readonly: true, _source: "ข้อมูลหลัก" })),
    ...masterFolderDraftRows(table.id),
  ];
}

function masterFolderRowId(table, index, prefix = "row") {
  return `${table.id}-${prefix}-${index + 1}`;
}

function masterFolderPkValue(row, table) {
  return row.databaseId || row[table?.primaryKey] || row.id || "";
}

function masterFolderLabel(row, table) {
  if (table?.id === "master_area_groups") return String(row.area_parent_name || row.area_parent_code || "").trim();
  if (table?.id === "cultivate_terrains") return String(row.description || row.terrain || "").trim();
  if (table?.id === "master_work_systems") return String(row.work_name || row.work_code || "").trim();
  if (table?.id === "master_ap") return String(row.ap_name || row.ap_code || "").trim();
  if (table?.id === "cultivate_estates") return String(row.description || row.estate_name || row.estate || "").trim();
  const keys = [table?.primaryKey, "name", "Name", "description", "Description", "ชื่อ", "แปลง", "บล็อก", "Activity", "Material Name", "partner"].filter(Boolean);
  const values = keys.map((key) => row[key]).filter((value) => value !== undefined && value !== "");
  return values.slice(0, 3).join(" / ") || String(masterFolderPkValue(row, table));
}

function masterFolderGroupForTable(table) {
  const id = `${table?.id || ""} ${table?.domain || ""}`.toLowerCase();
  const title = String(table?.title || "").toLowerCase();
  if (table?.id === "cultivate_estates") return "general";
  if (id.includes("terrain") || id.includes("area")) return "area";
  if (id.includes("partner") || id.includes("gang") || id.includes("designation") || id.includes("nationalit") || id.includes("race") || id.includes("religion") || id.includes("payroll") || id.includes("leave") || id.includes("chequeroll") || id.includes("settlement")) return "people";
  if (id.includes("activity") || id.includes("activities") || id.includes("work_system") || title.includes("กิจกรรม")) return "activity";
  if (id.includes("material") || id.includes("warehouse") || id.includes("weighbridge") || id.includes("equipment") || id.includes("unit")) return "supply";
  if (id.includes("budget") || id.includes("ap")) return "budget";
  return "general";
}

function masterFolderGroups() {
  const groups = [
    { id: "area", title: "ข้อมูลพื้นที่", hint: "Estate, โซน, แปลง, พื้นที่และโครงสร้างสวน" },
    { id: "people", title: "ข้อมูลพนักงาน/ผู้รับเหมา", hint: "คู่ค้า กลุ่มทำงาน ค่าแรง การลา และข้อมูลบุคคล" },
    { id: "activity", title: "ข้อมูลกิจกรรม", hint: "กลุ่มกิจกรรม กิจกรรม และระบบงาน" },
    { id: "supply", title: "ข้อมูลพัสดุ/อุปกรณ์", hint: "วัสดุ คลัง หน่วยนับ เครื่องชั่ง และอุปกรณ์" },
    { id: "budget", title: "ข้อมูลงบประมาณ/บัญชี", hint: "งบประมาณ AP และข้อมูลการคิดต้นทุน" },
    { id: "general", title: "ข้อมูลทั่วไป", hint: "บริษัท ปฏิทิน สิทธิ์ และรายการกลางของระบบ" },
  ];
  const tables = masterFolderTables();
  return groups.map((group) => {
    const groupTables = tables.filter((table) => masterFolderGroupForTable(table) === group.id);
    return {
      ...group,
      tables: groupTables,
      rowCount: groupTables.reduce((sum, table) => sum + n(table.rowCount || masterFolderRows(table).length), 0),
    };
  }).filter((group) => group.tables.length);
}

function masterFolderMatchesSearch(table, row, query) {
  if (!query) return true;
  const haystack = [
    table?.id,
    table?.title,
    table?.domain,
    ...Object.values(row || {}).slice(0, 60),
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function masterFolderFilteredRows(table) {
  const query = state.masterFolderSearch.trim();
  return masterFolderRows(table).filter((row) => masterFolderMatchesSearch(table, row, query));
}

function masterFolderComparableValue(value) {
  const raw = String(value ?? "").trim();
  const numeric = Number(raw.replace(/,/g, ""));
  if (raw && Number.isFinite(numeric) && /^-?[\d,]+(\.\d+)?$/.test(raw)) return numeric;
  return raw.toLocaleLowerCase("th");
}

function masterFolderSortedRows(table, rows) {
  const sort = state.masterFolderSort || {};
  if (!sort.key || sort.tableId !== table?.id) return rows;
  const dir = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = masterFolderComparableValue(a?.[sort.key]);
    const bv = masterFolderComparableValue(b?.[sort.key]);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv), "th", { numeric: true, sensitivity: "base" }) * dir;
  });
}

function isMasterFolderTechnicalColumn(column) {
  const key = String(column?.key || "").toLowerCase();
  const label = String(column?.label || "").toLowerCase();
  if (label.includes("master key")) return true;
  if (label.startsWith("fk ") || label.startsWith("fk_")) return true;
  if (key === "id" || key.endsWith("_id") || key.includes("_uuid") || key.includes("guid")) return true;
  return [
    "created_by", "modified_by", "creation_stamp", "modification_stamp", "updatedat", "createdat",
    "geom", "tag_id", "characteristic_class_id",
  ].some((part) => key.includes(part));
}

function isHiddenCultivateTerrainColumn(key) {
  return ["ap_code", "ap_name", "company", "company_name", "company_code"].includes(String(key || ""));
}

function masterFolderReadableColumns(table, limit = 8) {
  const columns = table?.columns || [];
  if (table?.id === "cultivate_terrains") {
    const terrainPriority = ["superior_name", "terrain", "description", "estate_code", "area", "tree_count", "rspo", "status"];
    const priorityColumns = terrainPriority.map((key) => columns.find((column) => column.key === key)).filter(Boolean);
    const hiddenInTable = new Set(["ap_code", "ap_name", "company", "company_name", "company_code"]);
    const regularColumns = columns.filter((column) => !terrainPriority.includes(column.key) && !hiddenInTable.has(column.key) && !isMasterFolderTechnicalColumn(column));
    const selected = [...priorityColumns, ...regularColumns].slice(0, limit);
    return selected.length ? selected : regularColumns.slice(0, limit);
  }
  const basePriority = [table?.primaryKey, "description", "name", "Name", "estate", "zone", "area_group", "rspo", "status", "activity", "material", "partner_code", "gang"];
  const priorityKeys = new Set(basePriority.filter(Boolean));
  const prioritized = columns.filter((column) => priorityKeys.has(column.key) && (!isMasterFolderTechnicalColumn(column) || column.key === table?.primaryKey));
  const regular = columns.filter((column) => !priorityKeys.has(column.key) && !isMasterFolderTechnicalColumn(column));
  const selected = [...prioritized, ...regular].slice(0, limit);
  return selected.length ? selected : columns.filter((column) => !isMasterFolderTechnicalColumn(column)).slice(0, limit);
}

function masterFolderRequiredColumns(table) {
  const required = new Set([table?.primaryKey].filter(Boolean));
  for (const ref of table?.references || []) required.add(ref.field);
  return required;
}

function isMasterFolderRequired(table, column) {
  return masterFolderRequiredColumns(table).has(column.key);
}

function masterFolderFieldLabel(column, required = false) {
  return `${esc(column.label)}${required ? ' <span class="required-mark">*</span>' : ""}`;
}

function masterFolderReferenceOptions(refOrDomain) {
  const ref = typeof refOrDomain === "string" ? { refDomain: refOrDomain } : (refOrDomain || {});
  const seen = new Set();
  const options = [];
  for (const table of masterFolderTables().filter((item) => ref.refTable ? item.id === ref.refTable : item.domain === ref.refDomain)) {
    for (const row of masterFolderRows(table)) {
      const value = String((ref.refKey ? row[ref.refKey] : "") || masterFolderPkValue(row, table) || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label: masterFolderLabel(row, table) || value });
      if (options.length >= 300) return options;
    }
  }
  return options;
}

function masterFolderUniqueOptions(table, field) {
  const seen = new Set();
  return masterFolderRows(table).map((row) => String(row[field] ?? "").trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  }).sort((a, b) => a.localeCompare(b, "th"));
}

function masterFolderCodeNameOptions(tableId, codeField, nameField) {
  const table = masterFolderTables().find((item) => item.id === tableId);
  if (!table) return [];
  const seen = new Set();
  return masterFolderRows(table).map((row) => {
    const code = String(row[codeField] ?? "").trim();
    const name = String(row[nameField] ?? "").trim();
    if (!code || seen.has(code)) return null;
    seen.add(code);
    return { code, name, label: name ? `${code} · ${name}` : code };
  }).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label, "th"));
}

function masterFolderOptionDisplayLabel(option) {
  const preferred = option?.data?.payrollDescription || option?.data?.workName || option?.data?.apName || option?.label || option?.value || "";
  let label = String(preferred).trim();
  if (!label) return "";
  if (label.includes(" / ")) label = label.split(" / ").pop().trim();
  const codeName = label.match(/^[A-Za-z]{1,6}\d{0,4}\s-\s(.+)$/);
  if (codeName?.[1]) label = codeName[1].trim();
  return label;
}

function renderMasterSelectField(column, value, options, attrs = "", required = false) {
  return `
    <label>${masterFolderFieldLabel(column, required)}
      <select data-folder-master-field="${esc(column.key)}" ${attrs} ${required ? "required" : ""}>
        <option value="">เลือก${esc(column.label)}</option>
        ${options.map((item) => {
          const option = typeof item === "string" ? { value: item, label: item } : { value: item.value ?? item.code, label: item.label, data: item };
          const displayLabel = masterFolderOptionDisplayLabel(option);
          const dataAttrs = option.data ? Object.entries(option.data)
            .filter(([key]) => !["label", "value"].includes(key))
            .map(([key, dataValue]) => ` data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${esc(dataValue ?? "")}"`).join("") : "";
          return `<option value="${esc(option.value)}"${String(value) === String(option.value) ? " selected" : ""}${dataAttrs}>${esc(displayLabel)}</option>`;
        }).join("")}
      </select>
    </label>`;
}

function datasetKeyFromSnake(key) {
  return String(key).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function renderMasterFolderInput(column, table, edit) {
  const ref = (table.references || []).find((item) => item.field === column.key);
  const value = edit[column.key] ?? "";
  const required = isMasterFolderRequired(table, column);
  if (table.id === "master_terrains" || table.id === "cultivate_terrains") {
    if (["estate", "zone", "area_group"].includes(column.key)) {
      return renderMasterSelectField(column, value, masterFolderUniqueOptions(table, column.key), "", required);
    }
    if (column.key === "rspo") {
      return renderMasterSelectField(column, value, ["RSPO", "NON-RSPO"], "", required);
    }
    if (column.key === "payroll_department_code") {
      const options = masterFolderRows(table).map((row) => ({
        value: row.payroll_department_code,
        label: row.payroll_description ? `${row.payroll_department_code} · ${row.payroll_description}` : row.payroll_department_code,
        payrollDescription: row.payroll_description,
      })).filter((item, index, arr) => item.value && arr.findIndex((x) => x.value === item.value) === index);
      return renderMasterSelectField(column, value, options, 'data-folder-autofill="payroll_description"', required);
    }
    if (column.key === "work_code") {
      return renderMasterSelectField(column, value, masterFolderCodeNameOptions("master_work_systems", "work_code", "work_name").map((item) => ({ value: item.code, label: item.label, workName: item.name })), 'data-folder-autofill="work_name"', required);
    }
    if (column.key === "ap_code") {
      return renderMasterSelectField(column, value, masterFolderCodeNameOptions("master_ap", "ap_code", "ap_name").map((item) => ({ value: item.code, label: item.label, apName: item.name })), 'data-folder-autofill="ap_name"', required);
    }
    if (["payroll_description", "work_name", "ap_name"].includes(column.key)) {
      return `<label>${masterFolderFieldLabel(column, required)}<input data-folder-master-field="${esc(column.key)}" value="${esc(value)}" ${required ? "required" : ""} readonly></label>`;
    }
  }
  if (ref) {
    const options = masterFolderReferenceOptions(ref);
    return `
      <label>${masterFolderFieldLabel(column, required)}
        <select data-folder-master-field="${esc(column.key)}" ${required ? "required" : ""}>
          <option value="">เลือกจาก ${esc(ref.refDomain)}</option>
          ${options.map((item) => `<option value="${esc(item.value)}" ${String(value) === String(item.value) ? "selected" : ""}>${esc(masterFolderOptionDisplayLabel(item))}</option>`).join("")}
        </select>
      </label>`;
  }
  return `<label>${masterFolderFieldLabel(column, required)}<input data-folder-master-field="${esc(column.key)}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
}

function renderMasterFolderPanel() {
  const data = state.masterFolderData || { domains: [], tables: [], skipped: [] };
  const table = activeMasterFolderTable();
  if (!table) return `<section class="est-panel"><div class="empty-state">ยังไม่มีข้อมูลจาก folder Master Data</div></section>`;
  {
    const query = state.masterFolderSearch.trim();
    const allRows = masterFolderRows(table);
    const displayRows = masterFolderSortedRows(table, masterFolderFilteredRows(table));
    const edit = state.masterFolderRecords.find((row) => row.tableId === table.id && (row.id === state.masterFolderEditId || row._overrideOf === state.masterFolderEditId))
      || allRows.find((row) => row.id === state.masterFolderEditId)
      || {};
    const visibleColumns = masterFolderReadableColumns(table, table.id === "cultivate_terrains" ? 8 : 6);
    const requiredKeys = masterFolderRequiredColumns(table);
    const formColumns = [
      ...(table.columns || []).filter((column) => requiredKeys.has(column.key)),
      ...masterFolderReadableColumns(table, table.id === "cultivate_terrains" ? 24 : 16),
      ...(table.columns || []).filter((column) => !isMasterFolderTechnicalColumn(column)),
    ].filter((column, index, columns) => column
      && !(table.id === "cultivate_terrains" && isHiddenCultivateTerrainColumn(column.key))
      && columns.findIndex((item) => item.key === column.key) === index).slice(0, table.id === "cultivate_terrains" ? 28 : 18);
    const detailRow = displayRows.find((row) => row.id === state.masterFolderDetailId)
      || allRows.find((row) => row.id === state.masterFolderDetailId)
      || allRows.find((row) => row.id === state.masterFolderEditId)
      || displayRows[0]
      || null;
    const detailColumns = masterFolderReadableColumns(table, table.id === "cultivate_terrains" ? 28 : 16).filter((column) => detailRow && detailRow[column.key] !== undefined && detailRow[column.key] !== "");
    const selectedGroups = state.masterFolderGroupFilters || [];
    const groupOptions = masterFolderGroups().map((group) => `
      <option value="${esc(group.id)}" ${selectedGroups.includes(group.id) ? "selected" : ""}>
        ${esc(group.title)}
      </option>`).join("");
    const groups = masterFolderGroups().filter((group) => !selectedGroups.length || selectedGroups.includes(group.id)).map((group) => ({
      ...group,
      tables: group.tables.filter((item) => {
        if (!query) return true;
        const tableText = `${item.id} ${item.title} ${item.domain}`.toLowerCase();
        return tableText.includes(query.toLowerCase()) || masterFolderRows(item).some((row) => masterFolderMatchesSearch(item, row, query));
      }),
    })).filter((group) => group.tables.length);
    const navItems = groups.map((group) => `
      <section class="master-nav-group">
        <div class="master-nav-group-head">
          <strong>${esc(group.title)}</strong>
          <span>${fmt(group.tables.length)} table · ${fmt(group.rowCount)} row</span>
        </div>
        <small>${esc(group.hint)}</small>
        ${group.tables.map((item) => `
          <button type="button" class="${item.id === table.id ? "active" : ""}" data-folder-master-nav="${esc(item.id)}">
            <span>${esc(item.title)}</span>
            <b>${fmt(item.rowCount || masterFolderRows(item).length)}</b>
          </button>`).join("")}
      </section>`).join("");
    const refBadges = (table.references || []).map((ref) => `<span>${esc(ref.field)} -> ${esc(ref.refTable || ref.refDomain)}.${esc(ref.refKey || "")}</span>`).join("") || "<span>ไม่มี foreign key ที่ตรวจพบ</span>";
    const dbButtons = `
      <div class="folder-command-bar">
        <button type="button" data-folder-db-load ${state.estMasterSyncBusy ? "disabled" : ""}>ดึงข้อมูล</button>
        <button type="button" data-folder-db-save ${state.estMasterSyncBusy ? "disabled" : ""}>บันทึก table นี้</button>
        <button type="button" data-folder-db-import-all ${state.estMasterSyncBusy ? "disabled" : ""}>บันทึกทุก table</button>
      </div>`;
    const totalRows = masterFolderTables().reduce((sum, item) => sum + n(item.rowCount || masterFolderRows(item).length), 0);
    const editedCount = masterFolderDraftRows(table.id).filter((row) => !row._deleted).length;
    const deletedCount = masterFolderDraftRows(table.id).filter((row) => row._deleted).length;
    return `
      <section class="master-console master-console-v2">
        <aside class="master-nav master-nav-v2">
          <div class="master-nav-title">
            <strong>ข้อมูลหลัก</strong>
            <span>${fmt(masterFolderTables().length)} tables · ${fmt(totalRows)} rows</span>
          </div>
          <label class="master-search">
            <span>ค้นหา</span>
            <input id="masterFolderSearch" value="${esc(state.masterFolderSearch)}" placeholder="ค้นหา table, รหัส, ชื่อ, รายละเอียด">
          </label>
          <div class="master-group-filter">
            <label>
              <span>เลือกกลุ่ม</span>
              <select data-folder-group-select>
                <option value="all" ${selectedGroups.length ? "" : "selected"}>ทั้งหมด</option>
                ${groupOptions}
              </select>
            </label>
          </div>
          <div class="master-nav-scroll">${navItems || `<div class="empty-state compact">ไม่พบข้อมูลตามคำค้นหา</div>`}</div>
        </aside>
        <div class="master-workspace">
          <section class="master-toolbar master-toolbar-v2">
            <div>
              <h3>${esc(table.title)}</h3>
              <span>${esc(table.id)} · ${esc(table.domain)}</span>
            </div>
            ${dbButtons}
          </section>
          <section class="master-meta-grid">
            <article><span>คีย์หลัก</span><strong>${esc(table.primaryLabel || table.primaryKey)}</strong></article>
            <article><span>ข้อมูลที่แสดง</span><strong>${fmt(displayRows.length)} / ${fmt(allRows.length)}</strong></article>
            <article><span>แก้ไขในเครื่อง</span><strong>${fmt(editedCount)}</strong></article>
            <article><span>ลบ/ซ่อน</span><strong>${fmt(deletedCount)}</strong></article>
          </section>
          <section class="master-relations">${refBadges}</section>
          <section class="master-detail-grid">
            <article class="master-detail-card">
              <div class="master-section-head">
                <div>
                  <strong>รายละเอียดที่เลือก</strong>
                  <span>${detailRow ? esc(masterFolderLabel(detailRow, table)) : "เลือกแถวเพื่อดูรายละเอียด"}</span>
                </div>
              </div>
              <dl>
                ${detailColumns.map((column) => `<div><dt>${esc(column.label)}</dt><dd>${esc(detailRow?.[column.key] ?? "")}</dd></div>`).join("") || `<div><dt>รายละเอียด</dt><dd>ยังไม่มีข้อมูลที่เลือก</dd></div>`}
              </dl>
            </article>
            <details class="master-editor" ${state.masterFolderEditId ? "open" : ""}>
              <summary>${state.masterFolderEditId ? "แก้ไขข้อมูล" : "เพิ่มข้อมูลใหม่"} <span>ช่องที่มี * จำเป็นต้องใส่</span></summary>
              <div class="master-editor-top-actions">
                <button type="button" data-folder-save-row>${state.masterFolderEditId ? "บันทึก" : "บันทึกข้อมูลใหม่"}</button>
                <button type="button" data-folder-cancel-edit>ล้างฟอร์ม</button>
              </div>
              <form class="est-entry-form folder-master-form">
                ${formColumns.map((column) => renderMasterFolderInput(column, table, edit)).join("")}
                <div class="est-form-actions est-form-wide">
                  <button type="button" data-folder-save-row>${state.masterFolderEditId ? "บันทึก" : "บันทึกข้อมูลใหม่"}</button>
                  <button type="button" data-folder-cancel-edit>ล้างฟอร์ม</button>
                </div>
              </form>
            </details>
          </section>
          <section class="master-table-panel">
            <div class="master-section-head">
              <div>
                <strong>รายการข้อมูล</strong>
                <span>คลิกแถวเพื่อดูรายละเอียด แสดงเฉพาะคอลัมน์สำคัญ</span>
              </div>
              <button type="button" data-folder-new-row>เพิ่มข้อมูลใหม่</button>
            </div>
            <div class="table-wrap est-table-wrap master-data-table-wrap">
              <table class="mini-table est-table master-table">
                <thead><tr>${visibleColumns.map((col) => {
                  const active = state.masterFolderSort?.tableId === table.id && state.masterFolderSort?.key === col.key;
                  const arrow = active ? (state.masterFolderSort.dir === "desc" ? "↓" : "↑") : "";
                  return `<th><button type="button" class="master-sort-btn ${active ? "active" : ""}" data-folder-sort="${esc(col.key)}"><span>${esc(col.label)}</span><b>${arrow}</b></button></th>`;
                }).join("")}<th>จัดการ</th></tr></thead>
                <tbody>${displayRows.slice(0, 500).map((row) => `<tr data-folder-detail-row="${esc(row.id)}" class="${row.readonly ? "" : "is-added"} ${row.id === detailRow?.id ? "is-selected" : ""}">
                  ${visibleColumns.map((col) => `<td>${esc(row[col.key] ?? "")}</td>`).join("")}
                  <td class="master-row-actions">
                    <button type="button" data-folder-edit-row="${esc(row.id)}">แก้ไข</button>
                    <button type="button" data-folder-del-row="${esc(row.id)}">ลบ</button>
                  </td>
                </tr>`).join("") || `<tr><td colspan="${visibleColumns.length + 1}">ไม่พบข้อมูลตามคำค้นหา</td></tr>`}</tbody>
              </table>
            </div>
          </section>
        </div>
      </section>`;
  }
  const rows = masterFolderRows(table);
  const edit = state.masterFolderRecords.find((row) => row.id === state.masterFolderEditId && row.tableId === table.id) || {};
  const visibleColumns = (table.columns || []).slice(0, 10);
  const formColumns = (table.columns || []).slice(0, 18);
  const navItems = masterFolderTables().map((item) => `
    <button type="button" class="${item.id === table.id ? "active" : ""}" data-folder-master-nav="${esc(item.id)}">
      <span>${esc(item.title)}</span>
      <b>${fmt(item.rowCount)}</b>
    </button>`).join("");
  const refBadges = (table.references || []).map((ref) => `<span>${esc(ref.field)} -> ${esc(ref.refTable || ref.refDomain)}.${esc(ref.refKey || "")}</span>`).join("") || "<span>ไม่มี foreign key ที่ตรวจพบ</span>";
  const dbButtons = `
    <div class="folder-command-bar">
      <button type="button" data-folder-db-load ${state.estMasterSyncBusy ? "disabled" : ""}>ดึงข้อมูลจากฐานข้อมูล</button>
      <button type="button" data-folder-db-save ${state.estMasterSyncBusy ? "disabled" : ""}>บันทึก table นี้</button>
      <button type="button" data-folder-db-import-all ${state.estMasterSyncBusy ? "disabled" : ""}>บันทึกทุก table ลงฐานข้อมูล</button>
    </div>`;
  const totalRows = data.rowCount || masterFolderTables().reduce((sum, item) => sum + n(item.rowCount), 0);
  return `
    <section class="master-console">
      <aside class="master-nav">
        <div>
          <strong>กลุ่มข้อมูลหลัก</strong>
          <span>${fmt(masterFolderTables().length)} tables · ${fmt(totalRows)} rows</span>
        </div>
        ${navItems}
      </aside>
      <div class="master-workspace">
        <section class="master-toolbar">
          <div>
            <h3>${esc(table.title)}</h3>
            <span>${esc(table.id)} · ${esc(table.domain)}</span>
          </div>
          ${dbButtons}
        </section>
        <section class="master-meta-grid">
          <article><span>คีย์หลัก</span><strong>${esc(table.primaryLabel || table.primaryKey)}</strong></article>
          <article><span>ความสัมพันธ์</span><strong>${fmt((table.references || []).length)}</strong></article>
          <article><span>ข้อมูลทั้งหมด</span><strong>${fmt(rows.length)}</strong></article>
          <article><span>แก้ไขในเครื่อง</span><strong>${fmt(masterFolderDraftRows(table.id).length)}</strong></article>
        </section>
        <section class="master-relations">${refBadges}</section>
        <details class="master-editor" ${state.masterFolderEditId ? "open" : ""}>
          <summary>${state.masterFolderEditId ? "แก้ไขข้อมูล" : "เพิ่มข้อมูลใหม่"}</summary>
          <form class="est-entry-form folder-master-form">
            ${formColumns.map((column) => renderMasterFolderInput(column, table, edit)).join("")}
            <div class="est-form-actions est-form-wide">
              <button type="button" data-folder-save-row>${state.masterFolderEditId ? "บันทึกแก้ไข row" : "เพิ่ม row"}</button>
              <button type="button" data-folder-db-save ${state.estMasterSyncBusy ? "disabled" : ""}>บันทึกข้อมูลลงฐานข้อมูล</button>
            </div>
          </form>
        </details>
        <div class="table-wrap est-table-wrap">
          <table class="mini-table est-table master-table">
            <thead><tr><th></th>${visibleColumns.map((col) => `<th>${esc(col.label)}</th>`).join("")}<th>สถานะ</th></tr></thead>
            <tbody>${rows.slice(0, 300).map((row) => `<tr class="${row.readonly ? "" : "is-added"}">
              <td>
                <button type="button" data-folder-edit-row="${esc(row.id)}">แก้ไข</button>
                ${row.readonly ? "" : `<button type="button" data-folder-del-row="${esc(row.id)}">ลบ</button>`}
              </td>
              ${visibleColumns.map((col) => `<td>${esc(row[col.key] ?? "")}</td>`).join("")}
              <td>${esc(row._source || (row.readonly ? "ข้อมูลหลัก" : "แก้ไข"))}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    </section>`;
}

function renderEstMaster() {
  const syncMessage = state.estMasterSyncMessage
    ? `<div class="est-sync-message">${esc(state.estMasterSyncMessage)}</div>`
    : "";
  return `
    <div class="est-page">
      <div class="report-title">
        <div>
          <h2>ข้อมูลหลัก</h2>
          <p>ข้อมูลหลักของระบบสวนปาล์ม สร้างเป็น table ของตัวเองและเชื่อมโยงกันด้วย primary key / foreign key</p>
        </div>
      </div>
      ${renderMasterFolderPanel()}
      ${syncMessage}
    </div>`;
}

function renderEstWorkflow(kind) {
  const workflow = {
    "est-plan": ["สร้างแผนรายเดือน/รายปี", "เลือกแปลงและบล็อกจากข้อมูลหลัก", "เลือกกิจกรรมและอัตราค่าแรง", "ประเมินคนงาน วัสดุ และเครื่องจักร", "ส่งต่อเป็นใบสั่งงาน"],
    "est-workorder": ["รับงานจากแผน", "กำหนดหัวหน้า/กลุ่มคนงาน/ผู้รับเหมา", "แนบรายการเบิกพัสดุ", "ออกใบสั่งงาน", "ติดตามสถานะ Scheduled / In Progress / Done"],
    "est-daily": ["เลือกใบสั่งงาน", "บันทึกงานจริงสิ้นวัน", "บันทึกคนงาน รายคน/รายทีม", "บันทึกเงินหักรวมและรายคน", "ปิดงานและส่งต่อค่าแรง"],
    "est-payroll": ["ตั้งอัตราค่าแรงตามกิจกรรม", "บันทึกเงินเพิ่ม/หัก/ล่วงเวลา/ลา", "คำนวณค่าแรงรายคน", "ตรวจเทียบผลงานและประสิทธิภาพ", "ส่งออกสรุปค่าแรง"],
    "est-report": ["สรุปตามช่วงวันที่", "แยกตามแปลง/บล็อก/กิจกรรม", "เปรียบเทียบแผนกับงานจริง", "วิเคราะห์ค่าแรงรายคน", "ส่งออกรายงานผู้บริหาร"],
  };
  const labels = { "est-plan": "วางแผนงาน", "est-workorder": "สั่งงาน", "est-daily": "บันทึกทำงาน", "est-payroll": "อัตราค่าแรง", "est-report": "รายงาน" };
  const steps = workflow[kind] || [];
  return `
    <div class="est-page">
      <div class="report-title"><h2>${esc(labels[kind] || "ระบบงาน")}</h2><p>ออกแบบตาม flow จากไฟล์ est.docx และเชื่อมกับงบประมาณ 2569</p></div>
      <section class="est-panel">
        <div class="est-process">${steps.map((step, index) => `<article><b>${index + 1}</b><span>${esc(step)}</span></article>`).join("")}</div>
      </section>
      ${renderEstToolbar()}
      ${renderEstBudgetTable()}
    </div>`;
}

function renderEstStack() {
  return `
    <div class="est-page">
      <div class="report-title"><h2>Vercel + Supabase + GitHub</h2><p>ออกแบบระบบใหม่ให้ใช้ 3 ส่วนนี้เท่านั้น</p></div>
      <section class="est-stack-grid">
        <article><strong>GitHub</strong><span>เก็บ source code, schema, migration และ trigger deploy</span></article>
        <article><strong>Vercel</strong><span>host webapp, preview/production deploy, environment variables</span></article>
        <article><strong>Supabase</strong><span>Postgres, Auth, Row Level Security, Storage, Realtime</span></article>
      </section>
      <section class="est-panel">
        <div class="section-head"><h3>ตารางหลักใน Supabase</h3><span>ดูไฟล์ supabase/schema.sql</span></div>
        <div class="palm-chip-list database">
          ${["est_areas", "est_blocks", "est_workers", "est_contractors", "est_activities", "est_budget_lines", "est_work_plans", "est_work_orders", "est_daily_entries", "est_payroll_lines"].map((name) => `<span>${name}</span>`).join("")}
        </div>
      </section>
    </div>`;
}

function renderEstBudget() {
  return `<div class="est-page"><div class="report-title"><h2>งบประมาณ 2569</h2><p>ข้อมูลหลักจากไฟล์ประมาณการค่าใช้จ่าย 2569</p></div>${renderEstToolbar()}${renderEstBudgetTable()}</div>`;
}

function renderEstBudgetContract() {
  const lines = filteredEstBudgetRateLines();
  const allLines = estBudgetRateLines();
  const areaOptions = estBudgetAreaOptions();
  const activityOptions = estBudgetActivityOptions();
  const activityGroups = estBudgetUniqueOptions(activityOptions.map((item) => item.group || item.label));
  const materialOptions = estBudgetMaterialOptions();
  const workerGroupOptions = estBudgetWorkerGroupOptions();
  const rateGroupOptions = estBudgetRateGroupOptions();
  const fiscalYears = estBudgetUniqueOptions(["2569", "2570", ...allLines.map((line) => line.fiscalYear), ...allLines.map((line) => line.nextFiscalYear)]);
  const totalBudget = lines.reduce((sum, line) => sum + n(line.budget), 0);
  const avgRate = lines.length ? lines.reduce((sum, line) => sum + n(line.rate), 0) / lines.length : 0;
  const materialCost = lines.reduce((sum, line) => sum + (line.disableMaterial ? 0 : n(line.materialQty) * n(line.materialRate)), 0);
  const nextYearCount = lines.filter((line) => line.nextFiscalYear).length;
  const grouped = Object.entries(lines.reduce((acc, line) => {
    const key = line.activityGroup || line.activity || "ไม่ระบุกลุ่มกิจกรรม";
    acc[key] ||= { count: 0, budget: 0, rate: 0 };
    acc[key].count += 1;
    acc[key].budget += n(line.budget);
    acc[key].rate += n(line.rate);
    return acc;
  }, {})).sort((a, b) => b[1].budget - a[1].budget).slice(0, 6);
  return `
    <div class="est-page est-budget-designer">
      <div class="report-title">
        <div>
          <h2>อัตรางบประมาณ</h2>
          <p>กำหนดอัตรางานรายปีตามพื้นที่ กลุ่มกิจกรรม กิจกรรม วัสดุ และกลุ่มคนงาน โดยเชื่อมกับข้อมูลหลักและแก้ไขได้ในหน้าเดียว</p>
        </div>
        <div class="est-budget-title-actions">
          <button type="button" data-est-roll-budget>ยกอัตราไปปีถัดไป</button>
        </div>
      </div>
      <section class="est-contract-summary">
        <article><span>รายการอัตรา</span><strong>${fmt(lines.length)}</strong><small>จากทั้งหมด ${fmt(allLines.length)} รายการ</small></article>
        <article><span>งบตามตัวกรอง</span><strong>${moneyNf.format(totalBudget)}</strong><small>รวมจากอัตราและปริมาณฐาน</small></article>
        <article><span>ค่าวัสดุ</span><strong>${moneyNf.format(materialCost)}</strong><small>อัตราใช้วัสดุ x ราคาวัสดุ</small></article>
        <article><span>กลุ่มเรท</span><strong>${fmt(new Set(lines.map((line) => line.rateGroup).filter(Boolean)).size)}</strong><small>ตั้งค่าอัตราไม่เหมือนกันได้</small></article>
      </section>
      <section class="est-contract-card">
        <div class="est-contract-head">
          <div>
            <h3>ข้อมูลสัญญาอัตรา</h3>
            <p>ใช้เป็นทะเบียนเรทประจำปี ไม่ใช่หน้าวางแผนหรือสั่งงาน</p>
          </div>
          <span class="status-pill">อนุมัติ</span>
        </div>
        <div class="est-contract-fields">
          <label>ปีอัตรางบประมาณ
            <select id="estFiscalYear">${estBudgetOptionHtml(fiscalYears, state.estFilters.fiscalYear, "ทุกปี")}</select>
          </label>
          <label>สถานะ
            <select disabled><option>อนุมัติ</option></select>
          </label>
          <label>ประเภท
            <select disabled><option>Role Based Compounded</option></select>
          </label>
          <label>ค้นหา
            <input id="estSearch" type="search" value="${esc(state.estFilters.query)}" placeholder="ค้นหาพื้นที่ กิจกรรม วัสดุ กลุ่มคนงาน">
          </label>
        </div>
      </section>
      <section class="est-budget-filters">
        <label>พื้นที่
          <select id="estBudgetArea">${estBudgetOptionHtml(areaOptions, state.estFilters.area, "ทุกพื้นที่")}</select>
        </label>
        <label>กลุ่มกิจกรรม
          <select id="estActivityGroup">${estBudgetOptionHtml(activityGroups, state.estFilters.activityGroup, "ทุกกลุ่มกิจกรรม")}</select>
        </label>
        <label>กิจกรรม
          <select id="estActivity">${estBudgetOptionHtml(activityOptions, state.estFilters.activity, "ทุกกิจกรรม")}</select>
        </label>
        <label>วัสดุ
          <select id="estBudgetMaterial">${estBudgetOptionHtml(materialOptions, state.estFilters.material, "ทุกวัสดุ")}</select>
        </label>
        <label>กลุ่มคนงาน
          <select id="estBudgetWorkerGroup">${estBudgetOptionHtml(workerGroupOptions, state.estFilters.workerGroup, "ทุกกลุ่มคนงาน")}</select>
        </label>
        <label>กลุ่มเรท
          <select id="estBudgetRateGroup">${estBudgetOptionHtml(rateGroupOptions, state.estFilters.rateGroup, "ทุกกลุ่มเรท")}</select>
        </label>
      </section>
      <section class="est-budget-groups">
        ${grouped.map(([activity, item]) => `
          <article>
            <span>${esc(activity)}</span>
            <strong>${moneyNf.format(item.budget)}</strong>
            <small>${fmt(item.count)} รายการ · เฉลี่ย ${moneyNf.format(item.count ? item.rate / item.count : 0)}</small>
          </article>`).join("")}
      </section>
      <section class="est-panel est-rate-form-panel">
        <div class="section-head">
          <h3>เพิ่มอัตรางาน</h3>
          <span>เลือก key จากข้อมูลหลักเพื่อเก็บทั้งรหัสและชื่อ แล้วกำหนดอัตราค่าแรงและอัตราการใช้วัสดุ</span>
        </div>
        <div class="est-rate-form est-rate-form-wide">
          <label>ปี
            <select id="estRateYear">${estBudgetPlainOptionHtml(fiscalYears, state.estFilters.fiscalYear === "all" ? "2569" : state.estFilters.fiscalYear, "เลือกปี")}</select>
          </label>
          <label>พื้นที่
            <select id="estRateBlock">${estBudgetPlainOptionHtml(areaOptions, "", "เลือกพื้นที่")}</select>
          </label>
          <label>กลุ่มกิจกรรม
            <select id="estRateActivityGroup">${estBudgetPlainOptionHtml(activityGroups, "", "เลือกกลุ่มกิจกรรม")}</select>
          </label>
          <label>กิจกรรม
            <select id="estRateActivity">${estBudgetPlainOptionHtml(activityOptions, "", "เลือกกิจกรรม")}</select>
          </label>
          <label>ชื่ออัตรา/สัญญา
            <input id="estRateContract" type="text" placeholder="เช่น ถางป่า ปี 2 Kg 6 ปี หรือ น้อยกว่า">
          </label>
          <label>รายละเอียดพื้นที่
            <input id="estRateArea" type="text" placeholder="แปลง/โซน/หมายเหตุ">
          </label>
          <label>กลุ่มคนงาน
            <select id="estRateWorkerGroup">${estBudgetPlainOptionHtml(workerGroupOptions, "", "เลือกกลุ่มคนงาน")}</select>
          </label>
          <label>Role Name
            <input id="estRateRoleName" type="text" placeholder="เช่น คนงาน (Worker)">
          </label>
          <label>กลุ่มเรท
            <select id="estRateGroup">${estBudgetPlainOptionHtml(rateGroupOptions, "Role Based", "เลือกกลุ่มเรท")}</select>
          </label>
          <label>ฐานงาน
            <input id="estRateQuantity" type="number" step="0.01" placeholder="จำนวน">
          </label>
          <label>หน่วยงาน
            <select id="estRateUnit">
              <option value="บาท/งาน">บาท/งาน</option>
              <option value="บาท/ไร่">บาท/ไร่</option>
              <option value="บาท/ต้น">บาท/ต้น</option>
              <option value="บาท/ตัน">บาท/ตัน</option>
              <option value="บาท/ชั่วโมง">บาท/ชั่วโมง</option>
            </select>
          </label>
          <label>อัตราค่าแรง
            <input id="estRateValue" type="number" step="0.01" placeholder="0.00">
          </label>
          <label>วัสดุ
            <select id="estRateMaterial">${estBudgetPlainOptionHtml(materialOptions, "", "เลือกวัสดุ")}</select>
          </label>
          <label>หน่วยวัสดุ
            <input id="estRateMaterialUnit" type="text" placeholder="เช่น ลิตร / กก. / ถุง">
          </label>
          <label>อัตราการใช้
            <input id="estRateMaterialQty" type="number" step="0.0001" placeholder="ปริมาณต่อหน่วยงาน">
          </label>
          <label>ราคาวัสดุ
            <input id="estRateMaterialRate" type="number" step="0.01" placeholder="บาทต่อหน่วยวัสดุ">
          </label>
          <label class="est-check-field">
            <input id="estRateDisableMaterial" type="checkbox">
            <span>ไม่คิดวัสดุในอัตรานี้</span>
          </label>
          <label>งบประมาณ
            <input id="estRateBudget" type="number" step="0.01" placeholder="คำนวณอัตโนมัติถ้าเว้นว่าง">
          </label>
          <button type="button" data-est-add-rate>เพิ่มอัตรา</button>
        </div>
      </section>
      <section class="est-panel">
        <div class="section-head">
          <h3>รายการอัตราตามปีและความสัมพันธ์ข้อมูลหลัก</h3>
          <span>แก้ไขกลุ่มเรท กลุ่มคนงาน วัสดุ อัตราการใช้ และงบประมาณได้จากตารางนี้</span>
        </div>
        <div class="table-wrap est-rate-table-wrap">
          <table class="mini-table est-table est-rate-table">
            <thead><tr><th>ปี / สัญญา</th><th>พื้นที่</th><th>กลุ่มกิจกรรม / กิจกรรม</th><th>กลุ่มคนงาน / เรท</th><th>วัสดุ / อัตราใช้</th><th>ฐานงาน</th><th>อัตราค่าแรง</th><th>งบประมาณ</th><th>ปีถัดไป</th><th>สถานะ</th></tr></thead>
            <tbody>${lines.slice(0, 260).map((line) => `
              <tr>
                <td class="left"><strong>${esc(line.fiscalYear || "2569")}</strong><small>${esc(line.contractName)} · ${esc(line.sourceSheet)} #${esc(line.sourceRow)}</small></td>
                <td class="left"><strong>${esc(line.block)}</strong><small>${esc(line.area || "-")}</small></td>
                <td class="left"><strong>${esc(line.activityGroup || "-")}</strong><small>${esc(line.activity)}</small></td>
                <td>
                  <select data-est-rate-select="${esc(line.id)}" data-field="workerGroup">${estBudgetPlainOptionHtml(workerGroupOptions, line.workerGroup, "เลือกกลุ่ม")}</select>
                  <select data-est-rate-select="${esc(line.id)}" data-field="rateGroup">${estBudgetPlainOptionHtml(rateGroupOptions, line.rateGroup, "เลือกเรท")}</select>
                </td>
                <td>
                  <select data-est-rate-select="${esc(line.id)}" data-field="materialKey">${estBudgetPlainOptionHtml(materialOptions, line.materialKey || line.material, "เลือกวัสดุ")}</select>
                  <input data-est-rate-edit="${esc(line.id)}" data-field="materialQty" type="number" step="0.0001" value="${esc(n(line.materialQty))}" placeholder="อัตราใช้">
                  <input data-est-rate-edit="${esc(line.id)}" data-field="materialRate" type="number" step="0.01" value="${esc(n(line.materialRate))}" placeholder="ราคาวัสดุ">
                </td>
                <td><strong>${fmt(n(line.quantity))}</strong><small>${fmt(n(line.rai))} ไร่ · ${fmt(n(line.trees))} ต้น</small></td>
                <td><input data-est-rate-edit="${esc(line.id)}" data-field="rate" type="number" step="0.01" value="${esc(n(line.rate))}"><small>${esc(line.unit)}</small></td>
                <td><input data-est-rate-edit="${esc(line.id)}" data-field="budget" type="number" step="0.01" value="${esc(n(line.budget))}"></td>
                <td><input data-est-rate-edit="${esc(line.id)}" data-field="nextRate" type="number" step="0.01" value="${esc(line.nextRate ?? "")}" placeholder="อัตรา 2570"><small>${esc(line.nextFiscalYear || "")}</small></td>
                <td class="est-rate-actions">
                  ${line.customRate ? `<button type="button" class="danger" data-est-rate-delete="${esc(line.id)}">ลบ</button>` : `<span class="status-pill">รายการหลัก</span>`}
                </td>
              </tr>`).join("") || `<tr><td colspan="10">ไม่พบรายการตามตัวกรอง</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </div>`;
}

function mountEstBudgetRateControls() {
  const page = document.querySelector(".est-budget-designer");
  if (!page) return;
  page.querySelector(".est-budget-flow")?.remove();
  page.querySelectorAll("[data-est-rate-plan], [data-est-rate-order]").forEach((button) => button.remove());

  const tableHint = page.querySelector(".est-panel .section-head span");
  if (tableHint) tableHint.textContent = "แก้ไขอัตราและงบประมาณได้จากตารางนี้ โดยไม่มีขั้นตอนวางแผนหรือสั่งงานในหน้านี้";

  const actionHead = Array.from(page.querySelectorAll(".est-rate-table thead th")).at(-1);
  if (actionHead) actionHead.textContent = "สถานะ";

  page.querySelectorAll("td.est-rate-actions").forEach((cell) => {
    const input = cell.closest("tr")?.querySelector("[data-est-rate-edit]");
    const id = input?.dataset.estRateEdit || "";
    const line = estBudgetRateLines().find((item) => item.id === id);
    cell.innerHTML = line?.customRate
      ? `<button type="button" class="danger" data-est-rate-delete="${esc(id)}">ลบ</button>`
      : `<span class="status-pill">รายการหลัก</span>`;
  });

  const filters = page.querySelector(".est-budget-filters");
  if (!filters || page.querySelector(".est-rate-form-panel")) return;

  const activities = Object.keys(state.estData?.activityTotals || {}).sort();
  const activityOptions = [`<option value="ไม่ระบุกิจกรรม">ไม่ระบุกิจกรรม</option>`]
    .concat(activities.map((activity) => `<option value="${esc(activity)}">${esc(activity)}</option>`))
    .join("");
  filters.insertAdjacentHTML("afterend", `
    <section class="est-panel est-rate-form-panel">
      <div class="section-head">
        <h3>เพิ่มอัตรางาน</h3>
        <span>บันทึกเรทกิจกรรมตามหมวดกิจกรรม พื้นที่ และหน่วยงาน</span>
      </div>
      <div class="est-rate-form">
        <label>หมวดกิจกรรม
          <select id="estRateActivity">${activityOptions}</select>
        </label>
        <label>ชื่ออัตรา/สัญญา
          <input id="estRateContract" type="text" placeholder="เช่น ถางป่า ตามไร่">
        </label>
        <label>พื้นที่/บล็อก
          <input id="estRateBlock" type="text" placeholder="รหัสพื้นที่หรือบล็อก">
        </label>
        <label>รายละเอียดพื้นที่
          <input id="estRateArea" type="text" placeholder="แปลง/โซน/หมายเหตุ">
        </label>
        <label>ฐานงาน
          <input id="estRateQuantity" type="number" step="0.01" placeholder="จำนวน">
        </label>
        <label>หน่วย
          <select id="estRateUnit">
            <option value="บาท/งาน">บาท/งาน</option>
            <option value="บาท/ไร่">บาท/ไร่</option>
            <option value="บาท/ต้น">บาท/ต้น</option>
            <option value="บาท/ตัน">บาท/ตัน</option>
          </select>
        </label>
        <label>อัตรา
          <input id="estRateValue" type="number" step="0.01" placeholder="0.00">
        </label>
        <label>งบประมาณ
          <input id="estRateBudget" type="number" step="0.01" placeholder="คำนวณจากอัตรา x ฐานงานถ้าเว้นว่าง">
        </label>
        <button type="button" data-est-add-rate>เพิ่มอัตรา</button>
      </div>
    </section>`);
}

function renderEstView() {
  if (!state.estData) {
    els.reportPage.innerHTML = `<p class="analytics-empty">กำลังโหลดข้อมูล EST...</p>`;
    return;
  }
  if (state.view === "est-dashboard") els.reportPage.innerHTML = renderEstDashboard();
  else if (state.view === "est-master") els.reportPage.innerHTML = renderEstMaster();
  else if (state.view === "est-budget") {
    els.reportPage.innerHTML = renderEstBudgetContract();
  }
  else if (state.view === "est-plan") els.reportPage.innerHTML = renderEstPlanPage();
  else if (state.view === "est-workorder") els.reportPage.innerHTML = renderEstWorkOrderPage();
  else if (state.view === "est-daily") els.reportPage.innerHTML = renderEstDailyEntryPage();
  else if (state.view === "est-stack") els.reportPage.innerHTML = renderEstStack();
  else els.reportPage.innerHTML = renderEstWorkflow(state.view);
}

function masterDatasets() {
  return state.masterData?.datasets || [];
}

function selectedMasterDataset() {
  const datasets = masterDatasets();
  let dataset = datasets.find((item) => item.id === state.masterFilters.datasetId);
  if (!dataset && state.masterFilters.group !== "all") {
    dataset = datasets.find((item) => item.group === state.masterFilters.group);
  }
  return dataset || datasets[0] || null;
}

function isFarmView(view) {
  return FARM_MODULES.some((module) => module.id === view);
}

function selectedFarmModule() {
  return farmModuleMap()[state.view] || FARM_MODULES[0];
}

function farmTablesForModule(module = selectedFarmModule()) {
  return Object.entries(FARM_TABLE_SCHEMAS)
    .filter(([, table]) => table.moduleId === module.id)
    .map(([key, table]) => ({ key, ...table }));
}

function selectedFarmTable(module = selectedFarmModule()) {
  const tables = farmTablesForModule(module);
  const selected = tables.find((table) => table.key === state.farmTableId);
  return selected || tables[0] || {
    key: module.id,
    title: module.title,
    primaryKey: "id",
    codeField: "code",
    labelField: "name",
    moduleId: module.id,
    fields: module.fields.map(([key, label, placeholder]) => F(key, label, { placeholder })),
    seed: module.seed || [],
  };
}

function farmTableDisplayName(table) {
  return `${table.title} (${table.key})`;
}

function farmSeedRows(table = selectedFarmTable()) {
  return (table.seed || []).map((row, index) => ({
    ...row,
    id: row.id || `seed-${table.key}-${index}`,
    tableId: table.key,
    moduleId: table.moduleId,
    readonly: true,
    createdAt: "seed",
    updatedAt: "seed",
  }));
}

function farmRows(table = selectedFarmTable()) {
  const tableId = table.key;
  const overrides = new Map(state.farmRecords.filter((row) => row.tableId === tableId && row._overrideOf && !row._deleted).map((row) => [row._overrideOf, row]));
  const deleted = new Set(state.farmRecords.filter((row) => row.tableId === tableId && row._deleted).map((row) => row._overrideOf || row.id));
  const seedRows = farmSeedRows(table).map((row) => overrides.has(row.id) ? { ...row, ...overrides.get(row.id), id: row.id, readonly: false } : row).filter((row) => !deleted.has(row.id));
  const customRows = state.farmRecords.filter((row) => row.tableId === tableId && !row._overrideOf && !row._deleted);
  return [...seedRows, ...customRows];
}

function filteredFarmRows(table = selectedFarmTable()) {
  const query = state.farmFilters.query.trim().toLowerCase();
  return farmRows(table).filter((row) => {
    const statusOk = state.farmFilters.status === "all" || String(row.status || "").toLowerCase() === state.farmFilters.status;
    const queryOk = !query || Object.values(row).join(" ").toLowerCase().includes(query);
    return statusOk && queryOk;
  });
}

function farmCan(action) {
  return (FARM_ROLE_PERMISSIONS[state.farmFilters.role] || FARM_ROLE_PERMISSIONS.viewer).includes(action);
}

function farmFieldKey(field) {
  return Array.isArray(field) ? field[0] : field.key;
}

function farmFieldLabel(field) {
  return Array.isArray(field) ? field[1] : field.label;
}

function farmFieldPlaceholder(field) {
  return Array.isArray(field) ? field[2] || "" : field.placeholder || "";
}

function farmFieldReferences(field) {
  return Array.isArray(field) ? "" : field.references || "";
}

function farmSelectedRow(table = selectedFarmTable()) {
  return farmRows(table).find((row) => row.id === state.farmDetailId || row.id === state.farmEditId) || {};
}

function farmRecordLabel(table, row) {
  if (!row) return "";
  const code = row[table.codeField] || row.code || row.id;
  const name = row[table.labelField] || row.name || row.full_name || row.title || "";
  return [code, name].filter(Boolean).join(" - ");
}

function farmReferenceOptions(tableKey) {
  const schema = FARM_TABLE_SCHEMAS[tableKey];
  if (!schema) return [];
  const table = { key: tableKey, ...schema };
  return farmRows(table).map((row) => ({ value: row.id, label: farmRecordLabel(table, row) }));
}

function renderFarmOptionList(options, value, placeholder = "เลือก") {
  return `<option value="">${esc(placeholder)}</option>${options.map((option) => {
    const optionValue = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return `<option value="${esc(optionValue)}"${String(value ?? "") === String(optionValue) ? " selected" : ""}>${esc(label)}</option>`;
  }).join("")}`;
}

function renderFarmInput(field, value = "") {
  const key = farmFieldKey(field);
  const label = farmFieldLabel(field);
  const placeholder = farmFieldPlaceholder(field);
  const required = !Array.isArray(field) && field.required;
  const labelText = `${label}${required ? " *" : ""}`;
  const references = farmFieldReferences(field);
  if (references) {
    return `
      <label>${esc(labelText)}
        <select data-farm-field="${esc(key)}" ${required ? "required" : ""}>
          ${renderFarmOptionList(farmReferenceOptions(references), value, `เลือก${label}`)}
        </select>
      </label>`;
  }
  if (!Array.isArray(field) && Array.isArray(field.options)) {
    return `
      <label>${esc(labelText)}
        <select data-farm-field="${esc(key)}" ${required ? "required" : ""}>
          ${renderFarmOptionList(field.options, value, `เลือก${label}`)}
        </select>
      </label>`;
  }
  if (key === "status") {
    return `
      <label>${esc(labelText)}
        <select data-farm-field="${esc(key)}">
          ${["active", "draft", "planned", "submitted", "approved", "sent_to_mobile", "open", "ready", "inactive"].map((status) => `<option value="${esc(status)}"${String(value || "active") === status ? " selected" : ""}>${esc(status)}</option>`).join("")}
        </select>
      </label>`;
  }
  if (!Array.isArray(field) && field.type === "boolean") {
    return `
      <label>${esc(labelText)}
        <select data-farm-field="${esc(key)}">
          ${renderFarmOptionList([{ value: "true", label: "ใช่" }, { value: "false", label: "ไม่ใช่" }], String(value || "false"), `เลือก${label}`)}
        </select>
      </label>`;
  }
  const type = !Array.isArray(field) && ["date", "number"].includes(field.type) ? field.type : "text";
  return `
    <label>${esc(labelText)}
      <input data-farm-field="${esc(key)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? "required" : ""}>
    </label>`;
}

function saveFarmRow() {
  const module = selectedFarmModule();
  const table = selectedFarmTable(module);
  const editId = state.farmEditId;
  const original = editId ? farmRows(table).find((row) => row.id === editId) : null;
  const row = {
    id: original?.readonly ? `override-${editId}` : (editId || `farm-${table.key}-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    moduleId: module.id,
    tableId: table.key,
    updatedAt: new Date().toISOString(),
  };
  if (original?.readonly) row._overrideOf = original.id;
  for (const input of els.reportPage.querySelectorAll("[data-farm-field]")) {
    row[input.dataset.farmField] = input.value.trim();
  }
  if (!row.status) row.status = "active";
  state.farmRecords = state.farmRecords.filter((item) => !(item.tableId === table.key && (item.id === row.id || item._overrideOf === row._overrideOf || item.id === editId)));
  state.farmRecords.push(row);
  state.farmEditId = "";
  state.farmDetailId = original?.id || row.id;
  saveFarmRecords();
  render();
}

function editFarmRow(id) {
  state.farmEditId = id;
  state.farmDetailId = id;
  render();
}

function setFarmInactive(id) {
  const module = selectedFarmModule();
  const table = selectedFarmTable(module);
  const row = farmRows(table).find((item) => item.id === id);
  if (!row) return;
  if (row.readonly) {
    state.farmRecords.push({ id: `delete-${id}`, moduleId: module.id, tableId: table.key, _overrideOf: id, _deleted: true, updatedAt: new Date().toISOString() });
  } else {
    const current = state.farmRecords.find((item) => item.id === id);
    if (current) current._deleted = true;
  }
  state.farmDetailId = "";
  state.farmEditId = "";
  saveFarmRecords();
  render();
}

function exportFarmCsv() {
  const module = selectedFarmModule();
  const table = selectedFarmTable(module);
  const rows = filteredFarmRows(table);
  const headers = table.fields.map(farmFieldKey);
  const csv = [headers.join(",")].concat(rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${table.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderFarmKeyBindings(table) {
  const refs = (table.fields || []).filter((field) => farmFieldReferences(field));
  return `
    <section class="farm-key-panel farm-panel">
      <div class="section-head">
        <h3>Key Relationship</h3>
        <span>ผูกข้อมูลด้วย Primary Key / Foreign Key ตาม schema</span>
      </div>
      <div class="farm-key-flow">
        <article><b>PK</b><strong>${esc(table.key)}.${esc(table.primaryKey || "id")}</strong><span>รหัสหลักของตาราง</span></article>
        ${refs.map((field) => `
          <article>
            <b>FK</b>
            <strong>${esc(table.key)}.${esc(farmFieldKey(field))}</strong>
            <span>→ ${esc(farmFieldReferences(field))}.id</span>
          </article>`).join("") || `<article><b>FK</b><strong>ไม่มี foreign key</strong><span>ตารางนี้เป็น master ตั้งต้น</span></article>`}
      </div>
    </section>`;
}

function renderFarmPage() {
  const module = selectedFarmModule();
  const tables = farmTablesForModule(module);
  const table = selectedFarmTable(module);
  const rows = filteredFarmRows(table);
  const allRows = farmRows(table);
  const selected = farmSelectedRow(table);
  const editing = state.farmEditId ? selected : {};
  const inactiveCount = allRows.filter((row) => String(row.status).toLowerCase() === "inactive").length;
  const refCount = (table.fields || []).filter((field) => farmFieldReferences(field)).length;
  return `
    <div class="farm-page">
      <div class="report-title">
        <div>
          <h2>${esc(module.title)}</h2>
          <p>${esc(module.description)}</p>
        </div>
      </div>
      <section class="farm-hero">
        <article><span>กลุ่ม</span><strong>${esc(module.group)}</strong><small>${esc(module.accent)}</small></article>
        <article><span>ตาราง Supabase</span><strong>${fmt(tables.length)}</strong><small>${tables.slice(0, 3).map((item) => `<code>${esc(item.key)}</code>`).join(" ")}</small></article>
        <article><span>รายการ</span><strong>${fmt(rows.length)}</strong><small>ทั้งหมด ${fmt(allRows.length)} รายการ</small></article>
        <article><span>Foreign Key</span><strong>${fmt(refCount)}</strong><small>Inactive ${fmt(inactiveCount)} รายการ</small></article>
      </section>
      <section class="farm-toolbar">
        <label>ตารางข้อมูล
          <select id="farmTableSelect">
            ${tables.map((item) => `<option value="${esc(item.key)}"${item.key === table.key ? " selected" : ""}>${esc(farmTableDisplayName(item))}</option>`).join("")}
          </select>
        </label>
        <label>ค้นหา<input id="farmSearch" type="search" value="${esc(state.farmFilters.query)}" placeholder="ค้นหารหัส ชื่อ สถานะ ตาราง"></label>
        <label>สถานะ
          <select id="farmStatusFilter">
            ${["all", "active", "draft", "planned", "submitted", "approved", "sent_to_mobile", "open", "ready", "inactive"].map((status) => `<option value="${esc(status)}"${state.farmFilters.status === status ? " selected" : ""}>${status === "all" ? "ทั้งหมด" : esc(status)}</option>`).join("")}
          </select>
        </label>
        <label>Role
          <select id="farmRoleFilter">
            ${FARM_ROLES.map((role) => `<option value="${esc(role)}"${state.farmFilters.role === role ? " selected" : ""}>${esc(role)}</option>`).join("")}
          </select>
        </label>
        <button type="button" data-farm-new ${farmCan("create") ? "" : "disabled"}>Add</button>
        <button type="button" data-farm-export ${farmCan("export") ? "" : "disabled"}>Export Excel</button>
      </section>
      ${renderFarmKeyBindings(table)}
      <section class="farm-layout">
        <article class="farm-panel">
          <div class="section-head"><h3>${state.farmEditId ? "แก้ไขข้อมูล" : "เพิ่มข้อมูล"}</h3><span>${esc(table.key)} / * คือข้อมูลจำเป็น</span></div>
          <form class="farm-form">
            ${table.fields.map((field) => renderFarmInput(field, editing[farmFieldKey(field)] ?? "")).join("")}
            <div class="farm-form-actions">
              <button type="button" data-farm-save ${farmCan(state.farmEditId ? "update" : "create") ? "" : "disabled"}>${state.farmEditId ? "บันทึกแก้ไข" : "บันทึกเพิ่ม"}</button>
              <button type="button" data-farm-clear>ล้างฟอร์ม</button>
            </div>
          </form>
        </article>
        <article class="farm-panel">
          <div class="section-head"><h3>รายละเอียดที่เลือก</h3><span>${selected.id ? esc(selected.code || selected.name || selected.id) : "เลือกแถวในตารางเพื่อดูรายละเอียด"}</span></div>
          <dl class="farm-detail">
            ${selected.id ? table.fields.map((field) => {
              const key = farmFieldKey(field);
              return `<dt>${esc(farmFieldLabel(field))}</dt><dd>${esc(selected[key] ?? "-")}</dd>`;
            }).join("") : `<dt>ยังไม่ได้เลือก</dt><dd>กดแถวหรือปุ่มดูในตาราง</dd>`}
          </dl>
          <div class="farm-table-list">${tables.map((item) => `<span>${esc(item.key)}</span>`).join("")}</div>
        </article>
      </section>
      <section class="farm-panel">
        <div class="section-head"><h3>ตารางรายการ</h3><span>Search / Filter / Add / Edit / Set Inactive / Detail / Export</span></div>
        <div class="table-wrap farm-table-wrap">
          <table class="mini-table farm-table">
            <thead>
              <tr>${table.fields.map((field) => `<th>${esc(farmFieldLabel(field))}</th>`).join("")}<th>จัดการ</th></tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr data-farm-row="${esc(row.id)}">
                  ${table.fields.map((field) => `<td>${esc(row[farmFieldKey(field)] ?? "")}</td>`).join("")}
                  <td class="farm-actions">
                    <button type="button" data-farm-view="${esc(row.id)}">ดู</button>
                    <button type="button" data-farm-edit="${esc(row.id)}" ${farmCan("update") ? "" : "disabled"}>แก้ไข</button>
                    <button type="button" data-farm-inactive="${esc(row.id)}" ${farmCan("delete") ? "" : "disabled"}>ปิดใช้งาน</button>
                  </td>
                </tr>`).join("") || `<tr><td colspan="${table.fields.length + 1}">ไม่พบรายการ</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      ${module.id === "farm-reports" ? renderFarmReportMatrix() : ""}
    </div>`;
}

function renderFarmReportMatrix() {
  const reports = ["รายงานพื้นที่", "รายงานพนักงาน / ผู้รับเหมา", "รายงานกิจกรรม", "รายงานแผนงาน", "รายงานใบสั่งงาน", "รายงานบันทึกประจำวัน", "รายงาน Attendance", "รายงานพัสดุ", "รายงาน Stock Card", "รายงานค่าแรงรายงวด", "รายงานงบประมาณ", "รายงาน Survey", "รายงาน Audit Log"];
  const filters = ["วันที่", "Estate", "Zone", "Plot", "Activity Group", "Activity", "Team", "Contractor", "Status"];
  return `
    <section class="farm-panel">
      <div class="section-head"><h3>รายงานที่ต้องมีตาม Prompt EST</h3><span>ทุก Report ต้องมี Filter + Export Excel/PDF/Print</span></div>
      <div class="farm-report-grid">
        ${reports.map((report) => `<article><strong>${esc(report)}</strong><span>${filters.map((filter) => `<em>${esc(filter)}</em>`).join("")}</span><b>Excel / PDF / Print</b></article>`).join("")}
      </div>
    </section>`;
}

function masterRows(dataset) {
  if (!dataset) return [];
  const query = state.masterFilters.query.trim().toLowerCase();
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  if (!query) return rows;
  return rows.filter((row) => dataset.headers.some((header) => String(row[header] ?? "").toLowerCase().includes(query)));
}

function renderMasterData() {
  const data = state.masterData || { source: {}, groups: [], datasets: [] };
  const groups = data.groups || [];
  const datasets = masterDatasets();
  const groupDatasets = state.masterFilters.group === "all"
    ? datasets
    : datasets.filter((item) => item.group === state.masterFilters.group);
  const current = selectedMasterDataset();
  if (current && !groupDatasets.some((item) => item.id === current.id)) {
    state.masterFilters.datasetId = groupDatasets[0]?.id || datasets[0]?.id || "";
  }
  const dataset = selectedMasterDataset();
  const headers = (dataset?.headers || []).filter((header) => !String(header).startsWith("_"));
  const displayHeaders = headers.slice(0, 10);
  const rows = masterRows(dataset);
  const editRow = state.masterFilters.editRowId === "__new__"
    ? {}
    : (dataset?.rows || []).find((row) => row._id === state.masterFilters.editRowId);
  const editedAt = data.source?.editsUpdatedAt ? ` · แก้ไขล่าสุด ${esc(data.source.editsUpdatedAt)}` : "";
  const groupOptions = [
    `<option value="all"${state.masterFilters.group === "all" ? " selected" : ""}>ทุกกลุ่ม</option>`,
    ...groups.map((group) => `<option value="${esc(group.name)}"${state.masterFilters.group === group.name ? " selected" : ""}>${esc(group.name)} (${fmt(group.rowCount)})</option>`),
  ].join("");
  const datasetOptions = groupDatasets.map((item) => `<option value="${esc(item.id)}"${dataset?.id === item.id ? " selected" : ""}>${esc(item.sheet)} · ${esc(item.file)} (${fmt(item.rowCount)})</option>`).join("");
  const form = editRow ? `
    <section class="master-edit-card">
      <div class="master-edit-head">
        <strong>${state.masterFilters.editRowId === "__new__" ? "เพิ่มข้อมูลใหม่" : "แก้ไขข้อมูล"}</strong>
        <button type="button" data-master-cancel>ปิด</button>
      </div>
      <div class="master-form-grid">
        ${headers.map((header) => `
          <label>${esc(header)}
            <input data-master-field="${esc(header)}" value="${esc(editRow[header] ?? "")}">
          </label>
        `).join("")}
      </div>
      <div class="master-edit-actions">
        <button type="button" data-master-save="${state.masterFilters.editRowId === "__new__" ? "add" : "save"}">บันทึก</button>
      </div>
    </section>` : "";

  els.reportPage.innerHTML = `
    <div class="master-page">
      <div class="report-title">
        <div>
          <h2>Master Data</h2>
          <p>อ่านจากทุกไฟล์และทุกชีตในโฟลเดอร์ Master Data${editedAt}</p>
        </div>
        <button type="button" data-master-refresh>Refresh Master</button>
      </div>
      <section class="master-kpis">
        <article><span>ไฟล์</span><strong>${fmt(data.source?.fileCount || 0)}</strong></article>
        <article><span>ชุดข้อมูล</span><strong>${fmt(data.source?.datasetCount || datasets.length)}</strong></article>
        <article><span>แถวข้อมูล</span><strong>${fmt(data.source?.rowCount || 0)}</strong></article>
        <article><span>กลุ่ม</span><strong>${fmt(groups.length)}</strong></article>
      </section>
      <section class="master-toolbar">
        <label>กลุ่มข้อมูล<select id="masterGroup">${groupOptions}</select></label>
        <label>ชีต / Dataset<select id="masterDataset">${datasetOptions}</select></label>
        <label>ค้นหา<input id="masterSearch" type="search" value="${esc(state.masterFilters.query)}" placeholder="ค้นหาในชุดข้อมูล"></label>
        <button type="button" data-master-add>เพิ่มข้อมูล</button>
      </section>
      ${form}
      <section class="master-detail">
        <div class="master-detail-head">
          <div>
            <strong>${esc(dataset?.sheet || "ไม่มีข้อมูล")}</strong>
            <span>${esc(dataset?.group || "")} · ${esc(dataset?.file || "")}</span>
          </div>
          <span>${fmt(rows.length)} / ${fmt(dataset?.rowCount || 0)} rows</span>
        </div>
        <div class="table-wrap master-table-wrap">
          <table class="master-table">
            <thead><tr><th></th>${displayHeaders.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.slice(0, 250).map((row) => `
                <tr class="${row._edited ? "is-edited" : row._added ? "is-added" : ""}">
                  <td><button type="button" data-master-edit="${esc(row._id)}">แก้ไข</button></td>
                  ${displayHeaders.map((header) => `<td>${esc(row[header] ?? "")}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ${rows.length > 250 ? `<p class="master-note">แสดง 250 แถวแรกจากผลค้นหา ${fmt(rows.length)} แถว</p>` : ""}
      </section>
    </div>`;
}

async function saveMasterDataRow(action) {
  const dataset = selectedMasterDataset();
  if (!dataset) return;
  const editRow = state.masterFilters.editRowId === "__new__"
    ? {}
    : (dataset.rows || []).find((row) => row._id === state.masterFilters.editRowId) || {};
  const row = { ...editRow };
  for (const input of els.reportPage.querySelectorAll("[data-master-field]")) {
    row[input.dataset.masterField] = input.value.trim();
  }
  const res = await fetch(MASTER_DATA_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: action === "add" ? "add" : "save", datasetId: dataset.id, row }),
  });
  const payload = await res.json();
  if (!res.ok || payload.ok === false) throw new Error(payload.error || "Save Master Data failed");
  state.masterData = payload;
  state.masterDataSignature = masterDataSignature(payload);
  state.masterFilters.editRowId = "";
  render();
}

function palmRecordDate(record) {
  return isoDay(record.date || record.scheduledStart || record.plannedStart || record.executedStart);
}

function palmRecordTime(record) {
  return record.startTime || "";
}

function palmRecordJob(record) {
  return record.job || record.activity || "ไม่ระบุงาน";
}

function palmRecordArea(record) {
  return record.area || record.terrain || "ไม่ระบุพื้นที่";
}

function palmRecordGroup(record) {
  return record.group || record.activityGroup || "ไม่ระบุกลุ่ม";
}

function palmActualWeight(record) {
  return Math.abs(n(record.actualValue));
}

function uniquePalmOptions(rows, getter) {
  return [...new Set(rows.map(getter).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "th"));
}

function optionHtml(value, selected) {
  return `<option value="${esc(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(value)}</option>`;
}

function initializePalmFilters() {
  const dates = (state.cultivateWork?.workRows || []).map((row) => palmRecordDate(row)).filter(Boolean).sort();
  if (!state.palmFilters.from) state.palmFilters.from = dates[0] || "";
  if (!state.palmFilters.to) state.palmFilters.to = dates[dates.length - 1] || "";
}

function palmWorkScopeForView(view) {
  const id = String(view || "");
  if (id.includes("plan-and-schedule") || id === "palm-plan") {
    return { title: "Plan & Schedule", match: (record) => /scheduled|planned/i.test(record.status || "") || n(record.scheduleValue) > 0 };
  }
  if (id.includes("daily-operations") || id === "palm-daily") {
    return { title: "Daily Operations", match: () => true };
  }
  if (id === "palm-harvest" || id.includes("reports")) {
    return { title: "Harvest / Reports", match: (record) => /AG08|เก็บเกี่ยว|Harvest/i.test([record.activityGroup, record.job, record.activity, record.group].join(" ")) };
  }
  if (id === "palm-inventory" || id.includes("maintenance")) {
    return { title: "Inventory / Maintenance", match: (record) => /AG10|ขนส่ง|stock|warehouse|material|nursery/i.test([record.activityGroup, record.job, record.activity, record.group].join(" ")) };
  }
  if (id === "palm-payroll" || id.includes("cheque-roll")) {
    return { title: "Cheque-roll", match: (record) => /Harvest|ฝ่ายสวน|Nursery|ขนส่ง/i.test([record.group, record.activityGroup, record.job].join(" ")) };
  }
  if (id === "palm-master" || id.includes("master-data") || id.includes("settings") || id.includes("security")) {
    return { title: "Master Data Link", match: () => true };
  }
  return { title: "Work Orders", match: () => true };
}

function palmScopedSourceRows(view) {
  const scope = palmWorkScopeForView(view);
  const scoped = (state.cultivateWork?.workRows || []).filter((record) => palmRecordDate(record) && scope.match(record));
  return scoped.length ? scoped : (state.cultivateWork?.workRows || []).filter((record) => palmRecordDate(record));
}

function buildPalmWorkRows(view = state.view) {
  initializePalmFilters();
  const filters = state.palmFilters;
  const scope = palmWorkScopeForView(view);
  const scopedRows = palmScopedSourceRows(view);
  const rows = [];

  for (const record of scopedRows) {
    const date = palmRecordDate(record);
    const job = palmRecordJob(record);
    const area = palmRecordArea(record);
    const group = palmRecordGroup(record);
    const workOrder = record.workOrder || "-";
    const activity = record.activity || "";
    const haystack = [
      job,
      date,
      area,
      group,
      workOrder,
      record.activityGroup,
      activity,
      record.status,
      record.terrain,
    ].join(" ").toLowerCase();

    if (filters.from && date < filters.from) continue;
    if (filters.to && date > filters.to) continue;
    if (filters.job !== "all" && job !== filters.job) continue;
    if (filters.area !== "all" && area !== filters.area) continue;
    if (filters.group !== "all" && group !== filters.group) continue;
    if (filters.query && !haystack.includes(filters.query.toLowerCase())) continue;

    const planKg = Math.abs(n(record.planValue));
    const scheduledKg = Math.abs(n(record.scheduleValue));
    const actualKg = palmActualWeight(record);
    const progress = scheduledKg ? (actualKg / scheduledKg) * 100 : 0;
    rows.push({
      date,
      job,
      area,
      group,
      firstTime: record.startTime || "",
      lastTime: record.endTime || "",
      tickets: record.workOrder ? 1 : 0,
      workOrder,
      planKg,
      scheduledKg,
      actualKg,
      progress,
      status: record.status || (actualKg > 0 ? "Executed" : "Scheduled"),
      standardsText: record.activityGroup || "",
      driverText: record.group || "",
      docText: workOrder,
      activity,
      unit: record.unit || "",
      moduleScope: scope.title,
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.job.localeCompare(b.job, "th"));
}

function renderPalmFilters(rows) {
  const filters = state.palmFilters;
  const jobs = uniquePalmOptions(rows, palmRecordJob);
  const areas = uniquePalmOptions(rows, palmRecordArea);
  const groups = uniquePalmOptions(rows, palmRecordGroup);
  return `
    <section class="palm-work-filters">
      <label>งาน
        <select id="palmJobFilter">
          ${optionHtml("all", filters.job).replace(">all<", ">ทั้งหมด<")}
          ${jobs.map((job) => optionHtml(job, filters.job)).join("")}
        </select>
      </label>
      <label>ตั้งแต่วันที่
        <input id="palmFromDate" type="date" value="${esc(filters.from)}">
      </label>
      <label>ถึงวันที่
        <input id="palmToDate" type="date" value="${esc(filters.to)}">
      </label>
      <label>พื้นที่
        <select id="palmAreaFilter">
          ${optionHtml("all", filters.area).replace(">all<", ">ทั้งหมด<")}
          ${areas.map((area) => optionHtml(area, filters.area)).join("")}
        </select>
      </label>
      <label>กลุ่มทำงาน
        <select id="palmGroupFilter">
          ${optionHtml("all", filters.group).replace(">all<", ">ทั้งหมด<")}
          ${groups.map((group) => optionHtml(group, filters.group)).join("")}
        </select>
      </label>
      <label class="palm-search">ค้นหา
        <input id="palmSearch" type="search" value="${esc(filters.query)}" placeholder="งาน / เวลา / พื้นที่ / กลุ่ม / ใบชั่ง">
      </label>
    </section>`;
}

function renderCultivateImportPanel() {
  const source = state.cultivateWork?.source || {};
  const masterSource = state.cultivateMaster?.source || {};
  const credentials = state.cultivateCredentials || {};
  const files = Array.isArray(source.files) ? source.files : [];
  const defaultMode = String(state.view).includes("master-data") ? "master" : "work";
  return `
    <section class="cultivate-credential-panel">
      <div>
        <strong>เชื่อมต่อ Cultivate อัตโนมัติ</strong>
        <span>${credentials.hasCredentials ? "บันทึก user/password แล้ว" : "ยังไม่ได้บันทึก user/password"}</span>
        <small>${credentials.savedAt ? `updated ${esc(credentials.savedAt)}` : "รหัสผ่านเก็บใน private/cultivate_credentials.json บนเครื่องนี้เท่านั้น"}</small>
      </div>
      <input id="cultivateBaseUrl" type="url" value="${esc(credentials.baseUrl || "https://spc.cultivate-agri.com")}" placeholder="Cultivate URL">
      <input id="cultivateUsername" type="text" placeholder="user">
      <input id="cultivatePassword" type="password" placeholder="password">
      <button id="cultivateSaveCredentialBtn" type="button">บันทึก</button>
      <span id="cultivateCredentialStatus" class="import-status"></span>
    </section>
    <section class="cultivate-import-panel">
      <div>
        <strong>นำเข้า Export จาก Cultivate</strong>
        <span>Work: ${esc(source.mode || "cache")} ${source.capturedAt ? `· ${esc(source.capturedAt)}` : ""}</span>
        <span>Master: ${esc(masterSource.mode || "cache")} ${masterSource.capturedAt ? `· ${esc(masterSource.capturedAt)}` : ""}</span>
        <small>${files.length ? esc(files.join(", ")) : "รองรับ CSV / Excel จาก Planner, Scheduler, Daily Entries, Work Order"}</small>
      </div>
      <select id="cultivateImportMode" aria-label="ชนิดข้อมูลนำเข้า">
        <option value="work"${defaultMode === "work" ? " selected" : ""}>Work Order</option>
        <option value="master"${defaultMode === "master" ? " selected" : ""}>Master Data</option>
      </select>
      <label class="import-file-button">
        เลือกไฟล์ CSV/Excel
        <input id="cultivateImportFiles" type="file" accept=".csv,.xlsx,.xls" multiple>
      </label>
      <button id="cultivateImportBtn" type="button">นำเข้า</button>
      <button id="cultivateAutoMasterBtn" type="button">ดึง Master Data อัตโนมัติ</button>
      <span id="cultivateImportStatus" class="import-status"></span>
    </section>`;
}

function masterRecordLabel(row) {
  if (!row || typeof row !== "object") return "";
  const keys = Object.keys(row);
  const preferred = keys.find((key) => /name|description|title|ชื่อ/i.test(key))
    || keys.find((key) => /code|id|รหัส/i.test(key))
    || "_id";
  return row[preferred] || row._id || "";
}

function renderCultivateMasterDataPanel() {
  const master = state.cultivateMaster || {};
  const groups = [
    ["Terrains", master.terrains || []],
    ["Activities", master.activities || []],
    ["Activity Groups", master.activityGroups || []],
    ["Gangs", master.gangs || []],
    ["Partners", master.partners || []],
    ["Materials", master.materials || []],
    ["Warehouses", master.warehouses || []],
    ["Weighbridges", master.weighbridges || []],
  ];
  const cards = groups.map(([label, rows]) => `
    <article>
      <span>${esc(label)}</span>
      <strong>${fmt(rows.length)}</strong>
      <small>${esc(rows.slice(0, 3).map(masterRecordLabel).filter(Boolean).join(" · ") || "รอนำเข้า export")}</small>
    </article>`).join("");
  const rawCount = (master.rawTables || []).reduce((sum, table) => sum + ((table.rows || []).length), 0);
  return `
    <section class="palm-work-board cultivate-master-panel">
      <div class="section-head">
        <h3>Master Data จาก Cultivate</h3>
        <span>${esc(master.source?.mode || "cache")} ${master.source?.capturedAt ? `· ${esc(master.source.capturedAt)}` : ""}</span>
      </div>
      <div class="palm-stage-grid">${cards}</div>
      <div class="palm-pipeline">
        <div><b>ข้อมูลหลัก</b><span>ใช้เป็นฐานอ้างอิงของแปลง กิจกรรม กลุ่มคนงาน คู่ค้า วัสดุ คลัง และเครื่องชั่งในงานจัดการสวนปาล์ม</span></div>
        <div><b>ไฟล์ไม่รู้ประเภท</b><span>${fmt(rawCount)} แถวใน raw tables จะเก็บไว้ไม่ทิ้งข้อมูล เพื่อให้ตรวจ mapping เพิ่มได้</span></div>
      </div>
    </section>`;
}

function renderPalmWorkBoard(workRows, menu) {
  const totals = workRows.reduce((acc, row) => {
    acc.plan += row.planKg;
    acc.schedule += row.scheduledKg;
    acc.actual += row.actualKg;
    acc.tickets += row.tickets;
    acc.groups.add(row.group);
    acc.areas.add(row.area);
    return acc;
  }, { plan: 0, schedule: 0, actual: 0, tickets: 0, groups: new Set(), areas: new Set() });
  const progress = totals.plan ? (totals.actual / totals.plan) * 100 : 0;
  const topRows = workRows.slice(0, 80);
  const scope = palmWorkScopeForView(state.view);
  const shownWorkOrders = new Set(workRows.map((row) => row.workOrder).filter((value) => value && value !== "-")).size;

  return `
    <section class="palm-work-board">
      <div class="section-head">
        <h3>${esc(menu?.title || "การทำงานสวน")}: ระดับ Work Order</h3>
        <span>${esc(scope.title)} · ดึงจากโปรแกรม SPC Cultivate ไม่ใช้ข้อมูลงานขนส่งออก</span>
        <h3>การทำงาน: แผน → กำหนดการทำงาน → ทำงานจริง</h3>
        <span>ดึงจากโปรแกรม SPC Cultivate ไม่ใช้ข้อมูลจากงานขนส่งออก</span>
      </div>
      <div class="palm-stage-grid">
        <article><span>แผนจาก Cultivate</span><strong>${fmt(totals.plan)}</strong><small>planned value</small></article>
        <article><span>กำหนดการ</span><strong>${fmt(totals.schedule)}</strong><small>${fmt(totals.tickets)} work orders</small></article>
        <article><span>ทำงานจริง</span><strong>${fmt(totals.actual)}</strong><small>${progress.toFixed(1)}%</small></article>
        <article><span>พื้นที่ / กลุ่ม</span><strong>${fmt(totals.areas.size)} / ${fmt(totals.groups.size)}</strong><small>รายการ</small></article>
      </div>
      <div class="palm-pipeline">
        <div><b>แผน</b><span>ข้อมูลจาก Planner Workbench และ Work Order ใน Cultivate</span></div>
        <div><b>กำหนดการทำงาน</b><span>ข้อมูลจาก Scheduler Workbench แยกวันที่ เวลา พื้นที่ และกลุ่มทำงาน</span></div>
        <div><b>ทำงาน</b><span>ข้อมูลจาก Daily Entries / Operations Dashboard ของ Cultivate</span></div>
      </div>
      <div class="table-wrap">
        <table class="mini-table palm-work-table">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เวลา</th>
              <th>งาน</th>
              <th>พื้นที่</th>
              <th>กลุ่มทำงาน</th>
              <th>WO</th>
              <th>Activity</th>
              <th>แผน</th>
              <th>กำหนด</th>
              <th>ทำจริง</th>
              <th>%</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${topRows.map((row) => `
              <tr>
                <td>${displayDate(row.date)}</td>
                <td>${esc(row.firstTime || "-")}${row.lastTime && row.lastTime !== row.firstTime ? `-${esc(row.lastTime)}` : ""}</td>
                <td class="left"><strong>${esc(row.job)}</strong><small>${esc(row.standardsText)}</small></td>
                <td class="left">${esc(row.area)}</td>
                <td class="left">${esc(row.group)}</td>
                <td class="left"><strong>${esc(row.workOrder)}</strong></td>
                <td class="left">${esc(row.activity || "-")}</td>
                <td class="num">${fmt(row.planKg)}</td>
                <td class="num">${fmt(row.scheduledKg)}</td>
                <td class="num">${fmt(row.actualKg)}</td>
                <td class="num">${row.progress.toFixed(1)}%</td>
                <td><span class="status-pill">${esc(row.status)}</span></td>
              </tr>`).join("") || `<tr><td colspan="11">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderPalmManagement() {
  const menuMap = palmMenuMap();
  const menu = menuMap[state.view] || menuMap["palm-overview"] || palmMenuModules()[0] || fallbackCultivateMenu().modules[0];
  const allMenus = palmMenuModules().map((module) => [module.id, module]);
  const sourceRowsForFilters = palmScopedSourceRows(state.view);
  const workRows = buildPalmWorkRows(state.view);
  state.currentRows = [
    { section: "palm-menu", title: menu.title, accent: menu.accent, sources: menu.sources.join(" | ") },
    ...workRows.map((row) => ({
      section: "palm-work",
      date: row.date,
      time: `${row.firstTime || ""}-${row.lastTime || ""}`,
      job: row.job,
      area: row.area,
      group: row.group,
      workOrder: row.workOrder,
      activity: row.activity,
      tickets: row.tickets,
      planKg: Math.round(row.planKg),
      scheduledKg: Math.round(row.scheduledKg),
      actualKg: Math.round(row.actualKg),
      progress: row.progress.toFixed(1),
      status: row.status,
    })),
    ...menu.steps.map((step, index) => ({ section: "workflow", order: index + 1, step })),
    ...menu.tables.map((table) => ({ section: "database", table })),
  ];

  const flowRows = menu.steps.map((step, index) => `
    <li>
      <span>${index + 1}</span>
      <strong>${step}</strong>
    </li>`).join("");

  const sourceRows = menu.sources.map((source) => `<span>${source}</span>`).join("");
  const tableRows = menu.tables.map((table) => `<span>${table}</span>`).join("");
  const cultivateGroupRows = cultivateGroups().map((group) => `
    <article class="cultivate-menu-card">
      <h3>${esc(group.title)}</h3>
      <div>
        ${(group.items || []).map((item) => `
          <span>
            <strong>${esc(item.title)}</strong>
            <small>${esc(item.path || item.url || "")}</small>
          </span>`).join("")}
      </div>
    </article>`).join("");
  const dbRows = palmDatabaseGroups().map(([group, tables]) => `
    <tr>
      <td class="left">${group}</td>
      <td>${tables}</td>
    </tr>`).join("");

  if (String(state.view).includes("master-data") && !state.autoMasterImportAttempted) {
    const masterCount = ["terrains", "activities", "activityGroups", "gangs", "partners", "materials", "warehouses", "weighbridges"]
      .reduce((sum, key) => sum + ((state.cultivateMaster?.[key] || []).length), 0);
    if (!masterCount) {
      state.autoMasterImportAttempted = true;
      window.setTimeout(() => importCultivateFromServer("master"), 250);
    }
  }

  const moduleCards = allMenus.map(([view, item]) => `
    <button class="palm-module-card${view === state.view ? " active" : ""}" type="button" data-view="${view}">
      <span>${item.accent}</span>
      <strong>${item.title}</strong>
      <small>${item.sources[0]}</small>
    </button>`).join("");

  els.reportPage.innerHTML = `
    <div class="palm-page">
      <section class="palm-hero">
        <div>
          <span>${menu.accent}</span>
          <h2>${menu.pageTitle || menu.title}</h2>
          <p>${menu.subtitle}</p>
        </div>
        <div class="palm-hero-panel">
          <strong>งานจัดการสวนปาล์ม</strong>
          <small>จัดจากระบบ SPC Cultivate + Superset</small>
          <em>พร้อมออกแบบฐานข้อมูล PHP/MySQL</em>
        </div>
      </section>

      ${renderCultivateImportPanel()}
      ${renderCultivateMasterDataPanel()}
      ${renderPalmFilters(sourceRowsForFilters)}
      ${renderPalmWorkBoard(workRows, menu)}

      <section class="palm-module-grid">
        ${moduleCards}
      </section>

      <section class="palm-card palm-wide">
        <div class="section-head">
          <h3>เมนูทั้งหมดจาก Cultivate</h3>
          <span>${cultivateGroups().reduce((sum, group) => sum + ((group.items || []).length), 0)} เมนูจาก ${cultivateGroups().length} กลุ่ม</span>
        </div>
        <div class="cultivate-menu-grid">
          ${cultivateGroupRows || '<p class="analytics-empty">ยังไม่มีข้อมูลเมนูจาก Cultivate</p>'}
        </div>
      </section>

      <section class="palm-layout">
        <article class="palm-card palm-wide">
          <div class="section-head">
            <h3>ขั้นตอนงาน</h3>
            <span>${menu.steps.length} ขั้นตอนหลัก</span>
          </div>
          <ol class="palm-flow">${flowRows}</ol>
        </article>

        <article class="palm-card">
          <div class="section-head">
            <h3>แหล่งข้อมูลระบบ</h3>
            <span>เมนู/รายงานที่ตรวจพบ</span>
          </div>
          <div class="palm-chip-list">${sourceRows}</div>
        </article>

        <article class="palm-card">
          <div class="section-head">
            <h3>ตารางฐานข้อมูลที่เกี่ยวข้อง</h3>
            <span>จาก php_backend/schema.sql</span>
          </div>
          <div class="palm-chip-list database">${tableRows}</div>
        </article>

        <article class="palm-card palm-wide">
          <div class="section-head">
            <h3>กลุ่มฐานข้อมูล PHP/MySQL</h3>
            <span>โครงสร้างรวมของงานจัดการสวนปาล์ม</span>
          </div>
          <div class="table-wrap">
            <table class="mini-table">
              <thead><tr><th>กลุ่มข้อมูล</th><th>ตารางหลัก</th></tr></thead>
              <tbody>${dbRows}</tbody>
            </table>
          </div>
        </article>
      </section>
    </div>`;
}

function renderClear() {
  const rows = clearRows().filter((r) => inRange(r.date));
  els.clearTable.innerHTML = `
    <thead><tr><th>วันที่</th><th>เคลียร์ปลายราง</th><th>เคลียร์ตะกุก</th><th>Loss แรมป์</th><th>Loss ขนส่ง</th><th>รวมปรับยอด</th><th class="left">หมายเหตุ</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${displayDate(r.date)}</td>
      <td class="num">${fmt(r.clearPr)}</td>
      <td class="num">${fmt(r.clearTk)}</td>
      <td class="num loss">${fmt(r.lossRamp)}</td>
      <td class="num loss">${fmt(r.lossTransport)}</td>
      <td class="num">${fmt(n(r.clearPr) + n(r.clearTk) + n(r.lossRamp) + n(r.lossTransport))}</td>
      <td class="left">${r.note || ""}</td>
      <td>${r.source === "manual" ? `<button data-del="${r.date}" type="button">ลบ</button>` : ""}</td>
    </tr>`).join("")}</tbody>`;
}

function render() {
  syncGlobalFilterBar();
  for (const btn of els.tabs.querySelectorAll("button[data-view]")) {
    btn.classList.toggle("active", btn.dataset.view === state.view);
  }
  const isClear = state.view === "clear";
  const isEst = isEstView(state.view);
  const isFarm = isFarmView(state.view);
  els.reportPage.className = "report-page";
  els.reportPage.classList.toggle("hidden", isClear);
  els.clearPage.classList.toggle("hidden", !isClear);
  els.dashboard.classList.toggle("hidden", isEst || isFarm);
  els.datePanel?.classList.toggle("hidden", isEst || isFarm);
  els.globalFilterPanel?.classList.toggle("hidden", isEst || isFarm);

  if (isEst) renderEstView();
  if (isFarm) els.reportPage.innerHTML = renderFarmPage();
  if (state.view === "dashboard") renderAdvancedDashboard();
  if (state.view === "stock") renderStock(yardScope());
  if (state.view === "rspo") renderRspo();
  if (state.view === "daily") renderDailyReport();
  if (state.view === "summary") renderSummary();
  if (state.view === "clear") {
    renderDashboard(buildStockFromData(yardScope()));
    renderClear();
  }
}

function setView(view) {
  state.view = view;
  if (isFarmView(view)) {
    const module = farmModuleMap()[view] || FARM_MODULES[0];
    const tables = farmTablesForModule(module);
    if (!tables.some((table) => table.key === state.farmTableId)) {
      state.farmTableId = tables[0]?.key || "";
    }
    state.farmEditId = "";
    state.farmDetailId = "";
  }
  for (const btn of els.tabs.querySelectorAll("button")) btn.classList.toggle("active", btn.dataset.view === view);
  render();
}

function addClear() {
  if (!els.clearDate.value) return;
  const row = {
    date: els.clearDate.value,
    note: els.clearNote.value.trim(),
    updatedAt: new Date().toISOString(),
  };
  if (els.clearPr.value !== "") {
    row.clearPrSet = true;
    row.clearPr = n(els.clearPr.value);
  }
  if (els.clearTk.value !== "") {
    row.clearTkSet = true;
    row.clearTk = n(els.clearTk.value);
  }
  state.clearOverrides = state.clearOverrides.filter((x) => x.date !== row.date);
  state.clearOverrides.push(row);
  state.clearOverrides.sort((a, b) => a.date.localeCompare(b.date));
  saveClearOverrides();
  for (const el of [els.clearPr, els.clearTk, els.clearNote]) el.value = "";
  render();
}

function downloadCsv() {
  const rows = state.currentRows;
  const headers = rows[0] ? Object.keys(rows[0]).filter((h) => typeof rows[0][h] !== "object") : [];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","));
  }
  const blob = new Blob(["\ufeff", lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const name = state.view === "stock" ? `stock-${yardScope()}` : state.view;
  link.download = `${name}-${dateValue(els.startDate)}-${dateValue(els.endDate)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function init() {
  ensurePrintPreviewElements();
  applySidebarState();
  loadClearOverrides();
  loadEstDailyEntries();
  await Promise.all([loadPayload(), loadEstData(), loadMasterFolderData()]);
  state.view = initialViewFromUrl();
  setDateValue(els.startDate, state.payload.source.dateMin);
  setDateValue(els.endDate, state.payload.source.dateMax);
  els.clearDate.value = state.payload.source.dateMax;

  els.startDate.addEventListener("input", () => {
    syncDatePickerFromText(els.startDate);
    render();
  });
  els.endDate.addEventListener("input", () => {
    syncDatePickerFromText(els.endDate);
    render();
  });
  els.startDate.addEventListener("blur", () => {
    normalizeDateInput(els.startDate);
    render();
  });
  els.endDate.addEventListener("blur", () => {
    normalizeDateInput(els.endDate);
    render();
  });
  for (const btn of document.querySelectorAll(".calendar-btn")) {
    btn.addEventListener("click", () => {
      const picker = document.querySelector(`#${btn.dataset.picker}`);
      if (!picker) return;
      if (picker.id === "startDatePicker") picker.value = dateValue(els.startDate);
      if (picker.id === "endDatePicker") picker.value = dateValue(els.endDate);
      if (picker.showPicker) picker.showPicker();
      else picker.focus();
    });
  }
  els.startDatePicker.addEventListener("change", () => {
    setDateValue(els.startDate, els.startDatePicker.value);
    render();
  });
  els.endDatePicker.addEventListener("change", () => {
    setDateValue(els.endDate, els.endDatePicker.value);
    render();
  });
  els.yardFilter.addEventListener("change", () => {
    render();
  });
  wireGlobalFilterBar();
  els.applyBtn.addEventListener("click", () => {
    normalizeDateInput(els.startDate);
    normalizeDateInput(els.endDate);
    render();
  });
  els.tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) setView(btn.dataset.view);
  });
  els.sidebarToggle?.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem("sidebarCollapsed", state.sidebarCollapsed ? "1" : "0");
    applySidebarState();
  });
  document.querySelector(".brand-lockup")?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("dashboard");
  });
  els.reportPage.addEventListener("change", (e) => {
    if (e.target.id === "farmTableSelect") {
      state.farmTableId = e.target.value;
      state.farmEditId = "";
      state.farmDetailId = "";
      render();
      return;
    }
    if (e.target.id === "farmStatusFilter") {
      state.farmFilters.status = e.target.value;
      render();
      return;
    }
    if (e.target.id === "farmRoleFilter") {
      state.farmFilters.role = e.target.value;
      render();
      return;
    }
    if (e.target.id === "estFiscalYear") {
      state.estFilters.fiscalYear = e.target.value;
      render();
      return;
    }
    if (e.target.id === "estBudgetArea") {
      state.estFilters.area = e.target.value;
      render();
      return;
    }
    if (e.target.id === "estActivityGroup") {
      state.estFilters.activityGroup = e.target.value;
      render();
      return;
    }
    if (e.target.id === "estActivity") {
      state.estFilters.activity = e.target.value;
      render();
      return;
    }
    if (e.target.id === "estBudgetMaterial") {
      state.estFilters.material = e.target.value;
      render();
      return;
    }
    if (e.target.id === "estBudgetWorkerGroup") {
      state.estFilters.workerGroup = e.target.value;
      render();
      return;
    }
    if (e.target.id === "estBudgetRateGroup") {
      state.estFilters.rateGroup = e.target.value;
      render();
      return;
    }
    if (e.target.matches("[data-est-rate-select]")) {
      const id = e.target.dataset.estRateSelect;
      const field = e.target.dataset.field;
      const selected = e.target.selectedOptions?.[0];
      const patch = { [field]: e.target.value };
      if (field === "materialKey") patch.material = selected?.dataset.name || selected?.textContent?.trim() || e.target.value;
      updateEstBudgetRateLine(id, patch);
      render();
      return;
    }
    if (e.target.matches("[data-est-rate-check]")) {
      updateEstBudgetRateLine(e.target.dataset.estRateCheck, { [e.target.dataset.field]: e.target.checked });
      render();
      return;
    }
    if (e.target.id === "estDataset") {
      state.estFilters.datasetId = e.target.value;
      render();
      return;
    }
    if (e.target.matches("[data-folder-master-table]")) {
      state.masterFolderTableId = e.target.value;
      state.masterFolderEditId = "";
      state.masterFolderDetailId = "";
      render();
      return;
    }
    if (e.target.matches("[data-folder-autofill]")) {
      const targetField = e.target.dataset.folderAutofill;
      const selected = e.target.selectedOptions?.[0];
      const target = els.reportPage.querySelector(`[data-folder-master-field="${CSS.escape(targetField)}"]`);
      if (target && selected) target.value = selected.dataset[datasetKeyFromSnake(targetField)] || "";
      return;
    }
    if (e.target.matches("[data-folder-group-select]")) {
      const value = e.target.value;
      state.masterFolderGroupFilters = value === "all" ? [] : [value];
      const allowedTables = masterFolderGroups()
        .filter((group) => !state.masterFolderGroupFilters.length || state.masterFolderGroupFilters.includes(group.id))
        .flatMap((group) => group.tables);
      if (allowedTables.length && !allowedTables.some((table) => table.id === state.masterFolderTableId)) {
        state.masterFolderTableId = allowedTables[0].id;
        state.masterFolderEditId = "";
        state.masterFolderDetailId = "";
      }
      render();
      return;
    }
    if (e.target.id === "estWorkBlock") {
      const selected = e.target.selectedOptions?.[0];
      const activity = document.querySelector("#estWorkActivity");
      const rate = document.querySelector("#estRate");
      if (activity && selected?.dataset.activity) activity.value = selected.dataset.activity;
      if (rate && selected?.dataset.rate) rate.value = selected.dataset.rate;
      return;
    }
    if (e.target.id === "estWorkOrderSelect") {
      const selected = e.target.selectedOptions?.[0];
      const activity = document.querySelector("#estWorkActivity");
      const block = document.querySelector("#estWorkBlock");
      const order = document.querySelector("#estWorkOrder");
      const rate = document.querySelector("#estRate");
      if (activity && selected?.dataset.activity) activity.value = selected.dataset.activity;
      if (order && selected?.dataset.order) order.value = selected.dataset.order;
      if (rate && selected?.dataset.rate) rate.value = selected.dataset.rate;
      if (block && selected?.dataset.block) {
        const option = Array.from(block.options).find((item) => item.value === selected.dataset.block);
        if (option) block.value = option.value;
      }
      return;
    }
    if (e.target.id === "yieldCompareMode") {
      state.dashboardCompareMode = e.target.value;
      render();
    }
  });
  els.reportPage.addEventListener("input", (e) => {
    if (e.target.id === "farmSearch") {
      state.farmFilters.query = e.target.value.trim();
      state.farmDetailId = "";
      render();
      return;
    }
    if (e.target.matches("[data-est-rate-edit]")) {
      const id = e.target.dataset.estRateEdit;
      const field = e.target.dataset.field;
      const value = e.target.value === "" ? "" : n(e.target.value);
      const line = estBudgetRateLines().find((item) => item.id === id);
      const patch = { [field]: value };
      if (field === "nextRate") patch.nextFiscalYear = value === "" ? "" : "2570";
      if (field === "rate" && line?.quantity && !line?.budget) patch.budget = n(value) * n(line.quantity);
      updateEstBudgetRateLine(id, patch);
      return;
    }
    if (e.target.id === "masterFolderSearch") {
      state.masterFolderSearch = e.target.value.trim();
      state.masterFolderDetailId = "";
      if (state.masterFolderSearch) {
        const matchedTables = masterFolderTables().filter((table) => {
          const tableText = `${table.id} ${table.title} ${table.domain}`.toLowerCase();
          return tableText.includes(state.masterFolderSearch.toLowerCase())
            || masterFolderRows(table).some((row) => masterFolderMatchesSearch(table, row, state.masterFolderSearch));
        });
        if (matchedTables.length && !matchedTables.some((table) => table.id === state.masterFolderTableId)) {
          state.masterFolderTableId = matchedTables[0].id;
          state.masterFolderEditId = "";
        }
      }
      clearTimeout(state.estSearchTimer);
      state.estSearchTimer = setTimeout(render, 200);
      return;
    }
    if (e.target.id !== "estSearch") return;
    state.estFilters.query = e.target.value.trim();
    clearTimeout(state.estSearchTimer);
    state.estSearchTimer = setTimeout(render, 250);
  });
  els.reportPage.addEventListener("click", (e) => {
    if (e.target.closest("[data-farm-new]")) {
      state.farmEditId = "";
      state.farmDetailId = "";
      render();
      return;
    }
    if (e.target.closest("[data-farm-save]")) {
      saveFarmRow();
      return;
    }
    if (e.target.closest("[data-farm-clear]")) {
      state.farmEditId = "";
      state.farmDetailId = "";
      render();
      return;
    }
    if (e.target.closest("[data-farm-export]")) {
      exportFarmCsv();
      return;
    }
    const farmView = e.target.closest("[data-farm-view]");
    if (farmView) {
      state.farmDetailId = farmView.dataset.farmView;
      state.farmEditId = "";
      render();
      return;
    }
    const farmEdit = e.target.closest("[data-farm-edit]");
    if (farmEdit) {
      editFarmRow(farmEdit.dataset.farmEdit);
      return;
    }
    const farmInactive = e.target.closest("[data-farm-inactive]");
    if (farmInactive) {
      setFarmInactive(farmInactive.dataset.farmInactive);
      return;
    }
    const farmRow = e.target.closest("[data-farm-row]");
    if (farmRow && !e.target.closest("button")) {
      state.farmDetailId = farmRow.dataset.farmRow;
      state.farmEditId = "";
      render();
      return;
    }
    const masterCategory = e.target.closest("[data-est-master-category]");
    if (masterCategory) {
      state.estMasterCategory = masterCategory.dataset.estMasterCategory;
      state.estMasterEditId = "";
      render();
      return;
    }
    if (e.target.closest("[data-est-save-master]")) {
      saveEstMasterRecord();
      return;
    }
    if (e.target.closest("[data-est-db-save]")) {
      syncEstMasterToDatabase();
      return;
    }
    if (e.target.closest("[data-est-db-load]")) {
      loadEstMasterFromDatabase();
      return;
    }
    if (e.target.closest("[data-folder-save-row]")) {
      saveMasterFolderRow();
      return;
    }
    if (e.target.closest("[data-folder-db-save]")) {
      syncMasterFolderTableToDatabase();
      return;
    }
    if (e.target.closest("[data-folder-db-load]")) {
      loadMasterFolderTableFromDatabase();
      return;
    }
    if (e.target.closest("[data-folder-db-import-all]")) {
      importAllMasterFolderTablesToDatabase();
      return;
    }
    if (e.target.closest("[data-est-roll-budget]")) {
      rollEstBudgetRatesToNextYear();
      return;
    }
    if (e.target.closest("[data-est-add-rate]")) {
      addEstBudgetRateLine();
      return;
    }
    const rateDelete = e.target.closest("[data-est-rate-delete]");
    if (rateDelete) {
      deleteEstBudgetRateLine(rateDelete.dataset.estRateDelete);
      return;
    }
    const folderSort = e.target.closest("[data-folder-sort]");
    if (folderSort) {
      const table = activeMasterFolderTable();
      const key = folderSort.dataset.folderSort;
      const current = state.masterFolderSort || {};
      state.masterFolderSort = {
        tableId: table?.id || "",
        key,
        dir: current.tableId === table?.id && current.key === key && current.dir === "asc" ? "desc" : "asc",
      };
      render();
      return;
    }
    const folderNav = e.target.closest("[data-folder-master-nav]");
    if (folderNav) {
      state.masterFolderTableId = folderNav.dataset.folderMasterNav;
      state.masterFolderEditId = "";
      state.masterFolderDetailId = "";
      state.masterFolderSort = { tableId: "", key: "", dir: "asc" };
      render();
      return;
    }
    if (e.target.closest("[data-folder-new-row]")) {
      state.masterFolderEditId = "";
      state.masterFolderDetailId = "";
      render();
      return;
    }
    if (e.target.closest("[data-folder-cancel-edit]")) {
      state.masterFolderEditId = "";
      render();
      return;
    }
    const folderEdit = e.target.closest("[data-folder-edit-row]");
    if (folderEdit) {
      startEditMasterFolderRow(folderEdit.dataset.folderEditRow);
      return;
    }
    const folderDel = e.target.closest("[data-folder-del-row]");
    if (folderDel) {
      const table = activeMasterFolderTable();
      const rowId = folderDel.dataset.folderDelRow;
      const isBaseRow = table && rowId.startsWith(`master-${table.id}-`);
      state.masterFolderRecords = state.masterFolderRecords.filter((row) => row.tableId !== table?.id || (row.id !== rowId && row._overrideOf !== rowId));
      if (isBaseRow && table) {
        state.masterFolderRecords.push({
          id: rowId,
          tableId: table.id,
          category: table.id,
          targetTable: `master:${table.id}`,
          _deleted: true,
          _source: "deleted",
          updatedAt: new Date().toISOString(),
        });
      }
      if (state.masterFolderEditId === rowId) state.masterFolderEditId = "";
      if (state.masterFolderDetailId === rowId) state.masterFolderDetailId = "";
      saveMasterFolderRecords();
      render();
      return;
    }
    const folderDetail = e.target.closest("[data-folder-detail-row]");
    if (folderDetail) {
      state.masterFolderDetailId = folderDetail.dataset.folderDetailRow;
      render();
      return;
    }
    const editMaster = e.target.closest("[data-est-edit-master]");
    if (editMaster) {
      state.estMasterEditId = editMaster.dataset.estEditMaster;
      render();
      return;
    }
    const delMaster = e.target.closest("[data-est-del-master]");
    if (delMaster) {
      state.estMasterRecords = state.estMasterRecords.filter((row) => row.id !== delMaster.dataset.estDelMaster);
      if (state.estMasterEditId === delMaster.dataset.estDelMaster) state.estMasterEditId = "";
      saveEstMasterRecords();
      render();
      return;
    }
    if (e.target.closest("[data-est-save-plan]")) {
      saveEstWorkPlan();
      return;
    }
    if (e.target.closest("[data-est-save-order]")) {
      saveEstWorkOrder();
      return;
    }
    const planToOrder = e.target.closest("[data-est-plan-to-order]");
    if (planToOrder) {
      const plan = state.estWorkPlans.find((item) => item.id === planToOrder.dataset.estPlanToOrder);
      createEstWorkOrderFromPlan(plan);
      render();
      return;
    }
    const delOrder = e.target.closest("[data-est-del-order]");
    if (delOrder) {
      state.estWorkOrders = state.estWorkOrders.filter((row) => row.id !== delOrder.dataset.estDelOrder);
      saveEstWorkOrders();
      render();
      return;
    }
    if (e.target.closest("[data-est-save-work]")) {
      saveEstDailyWorkEntry();
      return;
    }
    const delWork = e.target.closest("[data-est-del-work]");
    if (delWork) {
      state.estDailyEntries = state.estDailyEntries.filter((row) => row.id !== delWork.dataset.estDelWork);
      saveEstDailyEntries();
      render();
      return;
    }
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    setView(btn.dataset.view);
  });
  els.printBtn.addEventListener("click", openPrintPreview);
  els.refreshTransportBtn?.addEventListener("click", refreshTransportFromQuery);
  els.previewCloseBtn.addEventListener("click", closePrintPreview);
  els.previewPrintBtn.addEventListener("click", () => {
    if (state.view === "stock") renderStock(yardScope());
    window.print();
  });
  els.printPreviewModal.addEventListener("click", (e) => {
    if (e.target === els.printPreviewModal) closePrintPreview();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.printPreviewModal.classList.contains("hidden")) closePrintPreview();
  });
  els.csvBtn.addEventListener("click", downloadCsv);
  els.addClearRow.addEventListener("click", addClear);
  els.clearTable.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;
    state.clearOverrides = state.clearOverrides.filter((x) => x.date !== btn.dataset.del);
    saveClearOverrides();
    render();
  });

  render();
  startLiveRefresh();
  autoRefreshTransportFromQuery();
}

init().catch((error) => {
  els.sourceInfo.textContent = "โหลดข้อมูลไม่สำเร็จ";
  els.reportPage.innerHTML = `<div class="report-title"><h2>${error.message}</h2></div>`;
});
