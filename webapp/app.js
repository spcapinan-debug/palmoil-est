const state = {
  payload: null,
  records: [],
  millPayload: null,
  millRows: [],
  view: "dashboard",
  clearOverrides: [],
  currentRows: [],
  dailyFilters: { standard: "all", flow: "all" },
  millCategories: ["กรูด-RSPO", "คีรีรัฐ-RSPO", "NON-RSPO"],
  palmFilters: { job: "all", from: "", to: "", area: "all", group: "all", query: "" },
  dashboardCompareMode: "area",
  payloadSignature: "",
  millStandardByDocKey: null,
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
  farmDbRows: {},
  farmDbSource: null,
  farmDbErrors: {},
  summaryPalmoilAreas: [],
  summaryPalmoilSource: null,
  farmSyncMessage: "",
  farmSyncStatus: "",
  farmSyncBusy: false,
  farmRecords: [],
  farmFilters: { query: "", status: "all", role: "super_admin" },
  farmWorkFilters: { activityGroup: "all", team: "all", zone: "all", plotGroup: "all", status: "all", query: "" },
  farmPlannerTab: "dates",
  farmWorkDetailId: "",
  farmTableId: "",
  farmDetailId: "",
  farmEditId: "",
  estSearchTimer: null,
  sidebarCollapsed: localStorage.getItem("sidebarIconRailExpandedV2") !== "1",
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
  clearDatePicker: document.querySelector("#clearDatePicker"),
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
  clearSyncStatus: document.querySelector("#clearSyncStatus"),
  clearTable: document.querySelector("#clearTable"),
};

const nf = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const tonNf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const moneyNf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CULTIVATE_API_BASE = window.__CULTIVATE_API_BASE__ || "http://127.0.0.1:8080/api/cultivate.php";
const TRANSPORT_REFRESH_API = window.__TRANSPORT_REFRESH_API__ || CULTIVATE_API_BASE.replace(/cultivate\.php.*$/, "transport_refresh.php");
const CLEAR_RAMP_API = window.__CLEAR_RAMP_API__ || CULTIVATE_API_BASE.replace(/cultivate\.php.*$/, "clear_ramp_log.php");
const TRANSPORT_SYNC_API = window.__TRANSPORT_SYNC_API__ || "https://palmoil-est.vercel.app/api/transport-sync";
const CLEAR_RAMP_STORAGE_KEY = "palm-clear-ramp-log";
const CLEAR_RAMP_DATA_URL = window.__CLEAR_RAMP_DATA_URL__ || "./data/clear_ramp_log.json";
const EST_DATA_URL = window.__EST_DATA_URL__ || "./data/est_data.json";
const MILL_WEIGHT_DATA_URL = window.__MILL_WEIGHT_DATA_URL__ || "./data/mill_weight.json";
const EST_MASTER_API = window.__EST_MASTER_API__ || "/api/est-master";
const FARM_TABLES_API = window.__FARM_TABLES_API__ || "/api/farm-tables";
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
    accent: "Estate → Zone → Plot → Block",
    description: "จัดการ Estate, Zone, Plot และ Block โดยเก็บพื้นที่จริง จำนวนต้น ปีปลูก RSPO และ AP Code ที่ระดับ Block",
    tables: ["areas", "plot_groups"],
    fields: [
      ["code", "รหัสพื้นที่", "BLK-001"],
      ["name", "ชื่อพื้นที่ / Block", "Block ตัวอย่าง 01"],
      ["estate", "Estate", "SPC Estate"],
      ["zone", "Zone", "Zone A"],
      ["plot", "Plot", "Plot 01"],
      ["apCode", "AP Code", "AP-001"],
      ["areaRai", "พื้นที่ไร่", "120"],
      ["plantingYear", "ปีปลูก", "2562"],
      ["treeCount", "จำนวนต้น", "2640"],
      ["rspoStatus", "RSPO", "RSPO"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "BLK-001", name: "Block ตัวอย่าง 01", estate: "SPC Estate", zone: "Zone A", plot: "Plot 01", apCode: "AP-001", areaRai: "120", plantingYear: "2562", treeCount: "2640", rspoStatus: "RSPO", status: "active" },
      { code: "BLK-002", name: "Block ตัวอย่าง 02", estate: "SPC Estate", zone: "Zone B", plot: "Plot 02", apCode: "AP-002", areaRai: "95", plantingYear: "2564", treeCount: "2090", rspoStatus: "Non-RSPO", status: "active" },
    ],
  },
  {
    id: "farm-people",
    title: "ข้อมูลพนักงาน / ผู้รับเหมา",
    group: "Master Data",
    accent: "Employees / Contractors / Teams",
    description: "จัดการพนักงาน ผู้รับเหมา ทีม สมาชิกทีม และทักษะตามกิจกรรม โดยเก็บประวัติการย้ายทีม",
    tables: ["people", "departments", "housing_units", "person_housing_assignments", "housing_utility_charges", "teams", "team_members", "team_activity_skills"],
    fields: [
      ["code", "รหัส", "EMP-001"],
      ["name", "ชื่อ", "หัวหน้าทีมตัวอย่าง"],
      ["type", "ประเภท", "supervisor"],
      ["nationality", "สัญชาติ", "ไทย"],
      ["team", "ทีม", "ทีมตัดปาล์ม A"],
      ["role", "บทบาท", "supervisor"],
      ["paymentType", "ประเภทการจ่าย", "รายวัน"],
      ["dailyWage", "ค่าแรง", "450"],
      ["phone", "เบอร์โทร", ""],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "EMP-001", name: "หัวหน้าทีมตัวอย่าง", type: "supervisor", nationality: "ไทย", team: "ทีมตัดปาล์ม A", role: "supervisor", paymentType: "รายวัน", dailyWage: "650", phone: "", status: "active" },
      { code: "CON-001", name: "ผู้รับเหมางานเก็บเกี่ยว", type: "harvest_contractor", nationality: "ไทย", team: "ผู้รับเหมา", role: "contractor", paymentType: "รายเหมา", dailyWage: "0", phone: "", status: "active" },
    ],
  },
  {
    id: "farm-activities",
    title: "ข้อมูลกิจกรรม",
    group: "Master Data",
    accent: "Activity + Material Usage + Survey",
    description: "จัดการกลุ่มกิจกรรม กิจกรรม อัตราใช้วัสดุตามกิจกรรม และแบบประเมินประสิทธิภาพ",
    tables: ["activity_groups", "wage_codes", "activities", "activity_wage_codes", "activity_material_rates", "survey_templates"],
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
    tables: ["work_plans", "plan_materials", "work_orders", "work_order_resources", "work_order_qr_codes", "work_order_locations", "work_attendance", "work_results"],
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
    tables: ["inventory_master", "warehouses", "inventory_documents", "inventory_document_lines", "stock_transactions", "stock_balances", "unit_conversions", "material_lots"],
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
    tables: ["payroll_periods", "payroll_lines", "payroll_rates", "payroll_rules"],
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
    id: "farm-governance",
    title: "สิทธิ์ / อนุมัติ",
    group: "Control",
    accent: "Role → Scope → Approval → Audit",
    description: "จัดการผู้ใช้ บทบาท สิทธิ์ ขอบเขตพื้นที่ ลำดับอนุมัติใบสั่งงาน และ audit trail ให้ชัดเจนตามขั้นตอนงาน",
    tables: ["profiles", "permissions", "access_scopes", "approval_logs", "master_versions", "audit_logs"],
    fields: [
      ["code", "รหัส", "GOV-001"],
      ["name", "ชื่อรายการ", "อนุมัติใบสั่งงาน"],
      ["role", "Role", "director"],
      ["module", "Module", "work_orders"],
      ["action", "Action", "approve"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "GOV-001", name: "อนุมัติใบสั่งงาน", role: "director", module: "work_orders", action: "approve", status: "active" },
      { code: "GOV-002", name: "ขอบเขตพื้นที่หัวหน้าโซน", role: "supervisor", module: "plots", action: "write", status: "active" },
    ],
  },
  {
    id: "farm-general",
    title: "ตั้งค่าระบบ",
    group: "System",
    accent: "Settings / Attachments",
    description: "ตั้งค่าระบบกลาง ค่าเริ่มต้นมือถือ ไฟล์แนบ และข้อมูลประกอบที่ไม่ใช่ขั้นตอนอนุมัติ",
    tables: ["system_settings", "attachments"],
    fields: [
      ["code", "รหัส", "SET-001"],
      ["name", "ชื่อรายการ", "ค่าเริ่มต้น GPS radius"],
      ["module", "กลุ่มตั้งค่า", "mobile"],
      ["action", "ค่า", "100"],
      ["status", "สถานะ", "active"],
    ],
    seed: [
      { code: "SET-001", name: "ค่าเริ่มต้น GPS radius", module: "mobile", action: "100", status: "active" },
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

const FARM_WORKFLOW_STAGES = [
  { no: "01", title: "ข้อมูลหลัก", views: ["farm-area", "farm-people", "farm-activities", "farm-inventory", "farm-budget"], note: "เตรียมพื้นที่ คน กิจกรรม พัสดุ และอัตรางบประมาณ", role: "Admin / Manager" },
  { no: "02", title: "วางแผน", views: ["farm-work"], table: "work_plans", note: "กำหนดแผนรายปี แผนรายกิจกรรม และพื้นที่ทำงาน", role: "Estate Manager" },
  { no: "03", title: "สั่งงาน", views: ["farm-work"], table: "work_orders", note: "สร้างใบสั่งงาน ทีม วัสดุ QR และกำหนดวันทำงาน", role: "Supervisor" },
  { no: "04", title: "อนุมัติ", views: ["farm-governance"], table: "approval_logs", note: "ตรวจสิทธิ์ ขอบเขตพื้นที่ และลำดับอนุมัติ", role: "Director / Manager" },
  { no: "05", title: "บันทึกงาน", views: ["farm-work"], table: "work_results", note: "เช็คชื่อ GPS ผลงาน วัสดุใช้จริง และสถานะงาน", role: "Supervisor / Mobile" },
  { no: "06", title: "ค่าแรง / ต้นทุน", views: ["farm-payroll", "farm-budget"], note: "คำนวณค่าแรง รายชั่วโมง OT เงินเพิ่ม เงินหัก และต้นทุน", role: "Accounting" },
  { no: "07", title: "รายงาน", views: ["farm-reports"], note: "สรุปรายงาน ตรวจย้อนหลัง และส่งออก Excel/PDF", role: "Viewer / Auditor" },
];

const VERSIONED_FARM_TABLES = new Set(["people", "employees", "contractors", "payroll_rates"]);

const FARM_STATUS_OPTIONS = ["all", "active", "draft", "planned", "scheduled", "submitted", "pending_approval", "approved", "sent_to_mobile", "rescheduled", "in_progress", "completed", "closed", "rejected", "open", "ready", "inactive"];

const F = (key, label, options = {}) => ({ key, label, ...options });

const FARM_TABLE_SCHEMAS = {
  areas: {
    moduleId: "farm-area",
    title: "พื้นที่รวม / Block จาก Summary Palmoil",
    primaryKey: "id",
    codeField: "area_code",
    labelField: "area_name",
    fields: [
      F("area_code", "รหัส Block / Terrain", { required: true, placeholder: "เช่น 30-B14" }),
      F("area_name", "ชื่อ Block / Terrain", { placeholder: "ถ้าไม่กรอกจะใช้รหัส Terrain" }),
      F("area_level", "ระดับพื้นที่", { options: ["block"], required: true, defaultValue: "block", hidden: true }),
      F("estate_name", "Estate", { required: true, placeholder: "เช่น Kirirat" }),
      F("zone_name", "Zone", { required: true, placeholder: "Upper / Lower" }),
      F("plot_group_code", "แปลง / กลุ่มพื้นที่", { required: true, placeholder: "เช่น B, C, T, PU" }),
      F("ap_code", "AP Code"),
      F("payroll_department_code", "รหัสฝ่ายค่าแรง"),
      F("payroll_code_description", "ชื่อฝ่ายค่าแรง"),
      F("area_rai", "พื้นที่ไร่", { type: "number" }),
      F("planting_year", "ปีปลูก", { type: "number" }),
      F("tree_count", "จำนวนต้น", { type: "number" }),
      F("rspo_status", "RSPO", { options: ["RSPO", "Non-RSPO"] }),
      F("parent_area_id", "พื้นที่แม่", { references: "areas", hidden: true }),
      F("estate_id", "Estate อ้างอิงเดิม", { references: "estates", hidden: true }),
      F("zone_id", "Zone อ้างอิงเดิม", { references: "zones", hidden: true }),
      F("plot_id", "Plot อ้างอิงเดิม", { references: "plots", hidden: true }),
      F("plot_group_id", "กลุ่มแปลงอ้างอิงเดิม", { references: "plot_groups", hidden: true }),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [
      { id: "area-block-001", area_code: "30-B14", area_name: "30-B14", area_level: "block", estate_name: "Kirirat", zone_name: "Upper", plot_group_code: "B", ap_code: "EST002", area_rai: "6", tree_count: "126", rspo_status: "Non-RSPO", payroll_department_code: "651", payroll_code_description: "บางกัน", status: "active" },
    ],
  },
  people: {
    moduleId: "farm-people",
    title: "บุคลากร / ผู้รับเหมา",
    primaryKey: "id",
    codeField: "person_code",
    labelField: "full_name",
    fields: [
      F("person_code", "รหัส", { required: true }),
      F("full_name", "ชื่อ-สกุล / ชื่อผู้รับเหมา", { required: true }),
      F("person_type", "ประเภทบุคคล", { options: ["employee", "worker", "supervisor", "driver", "admin", "contractor"], required: true }),
      F("nationality", "สัญชาติ", { options: ["ไทย", "เมียนมา", "กัมพูชา", "ลาว", "มาเลเซีย", "อื่นๆ"] }),
      F("payment_type", "ประเภทการจ่าย", { options: ["รายวัน", "รายเดือน", "รายเหมา"] }),
      F("department_id", "แผนกงาน", { references: "departments" }),
      F("default_housing_unit_id", "บ้านพักปัจจุบัน", { references: "housing_units" }),
      F("default_activity_group_id", "กลุ่มกิจกรรมหลัก", { references: "activity_groups" }),
      F("position", "ตำแหน่ง"),
      F("default_role", "Role", { options: FARM_ROLES }),
      F("daily_wage", "ค่าแรงรายวัน", { type: "number" }),
      F("monthly_salary", "เงินเดือน", { type: "number" }),
      F("contract_rate", "อัตราเหมา", { type: "number" }),
      F("normal_hours_per_day", "ชั่วโมงทำงาน/วัน", { type: "number" }),
      F("hourly_wage_rate", "ค่าแรงรายชั่วโมง", { type: "number", calculated: "daily_wage / normal_hours_per_day" }),
      F("phone", "เบอร์โทร"),
      F("start_date", "เริ่มงาน", { type: "date" }),
      F("effective_from", "เริ่มใช้ Version", { type: "date" }),
      F("effective_to", "สิ้นสุด Version", { type: "date" }),
      F("version_no", "Version", { type: "number" }),
      F("is_current", "Version ปัจจุบัน", { type: "boolean" }),
      F("previous_version_id", "Version ก่อนหน้า", { references: "people" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "person-emp-001", person_code: "EMP-001", full_name: "หัวหน้าทีมตัวอย่าง", person_type: "supervisor", nationality: "ไทย", payment_type: "รายวัน", daily_wage: "650", normal_hours_per_day: "8", hourly_wage_rate: "81.25", version_no: "1", is_current: "true", status: "active" },
      { id: "person-con-001", person_code: "CON-001", full_name: "ผู้รับเหมางานเก็บเกี่ยว", person_type: "contractor", nationality: "ไทย", payment_type: "รายเหมา", contract_rate: "0", version_no: "1", is_current: "true", status: "active" },
    ],
  },
  person_housing_assignments: {
    moduleId: "farm-people",
    title: "ประวัติเข้าพัก",
    primaryKey: "id",
    codeField: "start_date",
    labelField: "person_id",
    fields: [
      F("person_id", "บุคลากร/ผู้รับเหมา", { references: "people", required: true }),
      F("housing_unit_id", "บ้านพัก", { references: "housing_units", required: true }),
      F("start_date", "วันที่เข้าพัก", { type: "date", required: true }),
      F("end_date", "วันที่ออก", { type: "date" }),
      F("occupant_count", "จำนวนผู้พักอาศัย", { type: "number" }),
      F("share_utility_percent", "สัดส่วนค่าน้ำไฟ (%)", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  activity_wage_codes: {
    moduleId: "farm-activities",
    title: "ผูกกิจกรรมกับรหัสค่าแรง",
    primaryKey: "id",
    codeField: "activity_id",
    labelField: "wage_code_id",
    fields: [
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("wage_code_id", "รหัสค่าแรง", { references: "wage_codes", required: true }),
      F("is_primary", "รหัสหลัก", { type: "boolean" }),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [],
  },
  activity_material_rates: {
    moduleId: "farm-activities",
    title: "อัตราใช้วัสดุตามกิจกรรม",
    primaryKey: "id",
    codeField: "activity_id",
    labelField: "material_id",
    fields: [
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("item_id", "วัสดุ", { references: "inventory_master", required: true }),
      F("usage_rate", "อัตราใช้", { type: "number" }),
      F("usage_unit", "หน่วยใช้"),
      F("usage_basis", "ฐานคำนวณ", { options: ["per_tree", "per_rai", "per_work_order", "per_ton"] }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  inventory_master: {
    moduleId: "farm-inventory",
    title: "วัสดุ / รถ / เครื่องจักร",
    primaryKey: "id",
    codeField: "item_code",
    labelField: "item_name",
    fields: [
      F("item_code", "รหัสรายการ", { required: true }),
      F("item_name", "ชื่อรายการ", { required: true }),
      F("item_type", "ประเภทรายการ", { options: ["material", "equipment", "vehicle", "fuel", "tank"], required: true }),
      F("category_name", "หมวด"),
      F("unit_name", "หน่วยหลัก"),
      F("warehouse_id", "คลังเริ่มต้น", { references: "warehouses" }),
      F("fuel_type", "ชนิดน้ำมัน"),
      F("plate_no", "ทะเบียน/เลขเครื่อง"),
      F("capacity", "ความจุ", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [
      { id: "item-mat-001", item_code: "MAT-001", item_name: "ปุ๋ย 25kg", item_type: "material", category_name: "ปุ๋ย", unit_name: "กระสอบ", status: "active" },
      { id: "item-fuel-001", item_code: "FUEL-001", item_name: "น้ำมันดีเซล", item_type: "fuel", category_name: "น้ำมัน", unit_name: "ลิตร", status: "active" },
    ],
  },
  inventory_documents: {
    moduleId: "farm-inventory",
    title: "เอกสารพัสดุ",
    primaryKey: "id",
    codeField: "document_no",
    labelField: "doc_type",
    fields: [
      F("document_no", "เลขที่เอกสาร", { required: true }),
      F("doc_type", "ประเภทเอกสาร", { options: ["receipt", "issue", "return", "transfer", "adjustment", "count", "fuel_requisition"], required: true }),
      F("doc_date", "วันที่เอกสาร", { type: "date", required: true }),
      F("warehouse_id", "คลัง", { references: "warehouses" }),
      F("work_order_id", "Work Order", { references: "work_orders" }),
      F("requested_by", "ผู้ขอ", { references: "people" }),
      F("approved_by", "ผู้อนุมัติ", { references: "profiles" }),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [],
  },
  inventory_document_lines: {
    moduleId: "farm-inventory",
    title: "รายการเอกสารพัสดุ",
    primaryKey: "id",
    codeField: "line_no",
    labelField: "document_id",
    fields: [
      F("document_id", "เอกสาร", { references: "inventory_documents", required: true }),
      F("line_no", "ลำดับ", { type: "number" }),
      F("item_id", "รายการ", { references: "inventory_master", required: true }),
      F("quantity", "จำนวน", { type: "number" }),
      F("unit_name", "หน่วย"),
      F("lot_id", "Lot", { references: "material_lots" }),
      F("work_order_id", "Work Order", { references: "work_orders" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  work_plans: {
    moduleId: "farm-work",
    title: "แผนงาน",
    primaryKey: "id",
    codeField: "plan_code",
    labelField: "plan_name",
    fields: [
      F("plan_code", "รหัสแผน", { required: true }),
      F("plan_name", "ชื่อแผน", { required: true }),
      F("plan_level", "ระดับแผน", { options: ["annual", "activity", "area", "task"] }),
      F("parent_plan_id", "แผนแม่", { references: "work_plans" }),
      F("fiscal_year", "ปีงบประมาณ", { type: "number" }),
      F("estate_id", "Estate", { references: "areas" }),
      F("block_id", "Block", { references: "areas" }),
      F("activity_id", "กิจกรรม", { references: "activities" }),
      F("planned_start_date", "วันที่เริ่มแผน", { type: "date" }),
      F("planned_end_date", "วันที่สิ้นสุดแผน", { type: "date" }),
      F("planned_quantity", "ปริมาณแผน", { type: "number" }),
      F("planned_unit", "หน่วย"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  plan_materials: {
    moduleId: "farm-work",
    title: "วัสดุตามแผน",
    primaryKey: "id",
    codeField: "plan_id",
    labelField: "item_id",
    fields: [
      F("plan_id", "แผนงาน", { references: "work_plans", required: true }),
      F("item_id", "วัสดุ", { references: "inventory_master", required: true }),
      F("planned_quantity", "ปริมาณแผน", { type: "number" }),
      F("unit_name", "หน่วย"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  work_order_resources: {
    moduleId: "farm-work",
    title: "ทรัพยากร Work Order",
    primaryKey: "id",
    codeField: "resource_type",
    labelField: "work_order_id",
    fields: [
      F("work_order_id", "Work Order", { references: "work_orders", required: true }),
      F("resource_type", "ประเภททรัพยากร", { options: ["person", "contractor", "material", "equipment", "vehicle", "fuel"], required: true }),
      F("person_id", "บุคลากร/ผู้รับเหมา", { references: "people" }),
      F("item_id", "วัสดุ/อุปกรณ์", { references: "inventory_master" }),
      F("planned_quantity", "ปริมาณแผน", { type: "number" }),
      F("actual_quantity", "ปริมาณจริง", { type: "number" }),
      F("unit_name", "หน่วย"),
      F("rate_snapshot", "อัตรา Snapshot", { type: "number" }),
      F("amount_snapshot", "ยอดเงิน Snapshot", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  payroll_lines: {
    moduleId: "farm-payroll",
    title: "รายการค่าแรง",
    primaryKey: "id",
    codeField: "line_type",
    labelField: "person_id",
    fields: [
      F("payroll_period_id", "งวดค่าแรง", { references: "payroll_periods", required: true }),
      F("person_id", "บุคลากร/ผู้รับเหมา", { references: "people", required: true }),
      F("work_result_id", "ผลงานจริง", { references: "work_results" }),
      F("line_type", "ประเภทรายการ", { options: ["wage", "ot", "deduction", "allowance"], required: true }),
      F("rule_id", "กฎ/ประเภท", { references: "payroll_rules" }),
      F("quantity", "จำนวน", { type: "number" }),
      F("rate_snapshot", "อัตรา Snapshot", { type: "number" }),
      F("amount", "จำนวนเงิน", { type: "number" }),
      F("note", "หมายเหตุ"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  payroll_rules: {
    moduleId: "farm-payroll",
    title: "กฎค่าแรง / เงินเพิ่ม / เงินหัก",
    primaryKey: "id",
    codeField: "rule_code",
    labelField: "rule_name",
    fields: [
      F("rule_code", "รหัสกฎ", { required: true }),
      F("rule_name", "ชื่อกฎ", { required: true }),
      F("rule_type", "ประเภทกฎ", { options: ["rate", "overtime", "deduction", "allowance"], required: true }),
      F("calculation_method", "วิธีคำนวณ", { options: ["fixed", "percent", "hourly", "daily", "piece", "contract"] }),
      F("default_amount", "ค่าเริ่มต้น", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [],
  },
  access_scopes: {
    moduleId: "farm-governance",
    title: "ขอบเขตการเข้าถึง",
    primaryKey: "id",
    codeField: "scope_type",
    labelField: "profile_id",
    fields: [
      F("profile_id", "ผู้ใช้", { references: "profiles", required: true }),
      F("area_id", "พื้นที่", { references: "areas" }),
      F("scope_type", "ชนิดสิทธิ์", { options: ["read", "write", "approve"] }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  approval_logs: {
    moduleId: "farm-governance",
    title: "อนุมัติ / ประวัติสถานะ",
    primaryKey: "id",
    codeField: "event_type",
    labelField: "entity_id",
    fields: [
      F("entity_table", "ตารางอ้างอิง", { required: true }),
      F("entity_id", "รหัสรายการ", { required: true }),
      F("event_type", "ประเภทเหตุการณ์", { options: ["approval", "status_change"], required: true }),
      F("from_status", "จากสถานะ"),
      F("to_status", "เป็นสถานะ"),
      F("decision", "ผลอนุมัติ", { options: ["pending", "approved", "rejected"] }),
      F("approval_level", "ระดับอนุมัติ", { type: "number" }),
      F("actor_profile_id", "ผู้ทำรายการ", { references: "profiles" }),
      F("event_date", "วันที่", { type: "date" }),
      F("note", "หมายเหตุ"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  master_versions: {
    moduleId: "farm-governance",
    title: "ประวัติ Version ข้อมูลหลัก",
    primaryKey: "id",
    codeField: "version_no",
    labelField: "entity_table",
    fields: [
      F("entity_table", "ตารางข้อมูล", { required: true }),
      F("entity_id", "รหัส Version ใหม่", { required: true }),
      F("business_key", "รหัสธุรกิจ"),
      F("previous_entity_id", "Version ก่อนหน้า"),
      F("version_no", "Version", { type: "number" }),
      F("effective_from", "เริ่มใช้", { type: "date" }),
      F("effective_to", "สิ้นสุด", { type: "date" }),
      F("locked_target", "ข้อมูลที่ต้องไม่เปลี่ยนย้อนหลัง"),
      F("change_note", "หมายเหตุการเปลี่ยนแปลง"),
      F("changed_at", "วันที่เปลี่ยน", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
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
    title: "Plot / แปลง",
    primaryKey: "id",
    codeField: "plot_code",
    labelField: "plot_name",
    fields: [
      F("estate_id", "Estate", { references: "estates", required: true }),
      F("zone_id", "โซน", { references: "zones", required: true }),
      F("plot_code", "รหัสแปลง", { required: true }),
      F("plot_name", "ชื่อแปลง"),
      F("plot_group_id", "กลุ่มแปลง", { references: "plot_groups" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "plot-plt001", estate_id: "estate-spc", zone_id: "zone-north", plot_code: "PLT-001", plot_name: "แปลงตัวอย่าง 01", plot_group_id: "plot-group-rspo", status: "active" },
      { id: "plot-plt002", estate_id: "estate-spc", zone_id: "zone-south", plot_code: "PLT-002", plot_name: "แปลงตัวอย่าง 02", plot_group_id: "plot-group-harvest", status: "active" },
    ],
  },
  blocks: {
    moduleId: "farm-area",
    title: "Block / บล็อกพื้นที่",
    primaryKey: "id",
    codeField: "block_code",
    labelField: "block_name",
    fields: [
      F("estate_id", "Estate", { references: "estates", required: true }),
      F("zone_id", "โซน", { references: "zones", required: true }),
      F("plot_id", "Plot / แปลง", { references: "plots", required: true }),
      F("block_code", "รหัส Block", { required: true }),
      F("block_name", "ชื่อ Block"),
      F("ap_code", "AP Code", { required: true }),
      F("area_rai", "พื้นที่ไร่", { type: "number" }),
      F("planting_year", "ปีปลูก", { type: "number" }),
      F("tree_count", "จำนวนต้น", { type: "number" }),
      F("rspo_status", "RSPO", { options: ["RSPO", "Non-RSPO"] }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "block-plt001-a", estate_id: "estate-spc", zone_id: "zone-north", plot_id: "plot-plt001", block_code: "BLK-001", block_name: "Block ตัวอย่าง 01", ap_code: "AP-001", area_rai: "120", planting_year: "2562", tree_count: "2640", rspo_status: "RSPO", status: "active" },
      { id: "block-plt002-a", estate_id: "estate-spc", zone_id: "zone-south", plot_id: "plot-plt002", block_code: "BLK-002", block_name: "Block ตัวอย่าง 02", ap_code: "AP-002", area_rai: "95", planting_year: "2564", tree_count: "2090", rspo_status: "Non-RSPO", status: "active" },
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
      { id: "plot-group-harvest", group_code: "GRP-HARVEST", group_name: "กลุ่มแปลงเก็บเกี่ยว", group_type: "Harvest", status: "active" },
    ],
  },
  departments: {
    moduleId: "farm-people",
    title: "แผนกงาน",
    primaryKey: "id",
    codeField: "department_code",
    labelField: "department_name",
    fields: [
      F("department_code", "รหัสแผนก", { required: true }),
      F("department_name", "ชื่อแผนก", { required: true }),
      F("parent_department_id", "แผนกแม่", { references: "departments" }),
      F("manager_employee_id", "ผู้จัดการ/หัวหน้า", { references: "employees" }),
      F("cost_center_code", "รหัสศูนย์ต้นทุน"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "dept-field", department_code: "DEPT-FIELD", department_name: "ฝ่ายสวน", cost_center_code: "FIELD", status: "active" },
      { id: "dept-harvest", department_code: "DEPT-HARVEST", department_name: "ฝ่ายเก็บเกี่ยว", parent_department_id: "dept-field", cost_center_code: "HARVEST", status: "active" },
    ],
  },
  housing_units: {
    moduleId: "farm-people",
    title: "ข้อมูลบ้านพัก",
    primaryKey: "id",
    codeField: "house_code",
    labelField: "house_name",
    fields: [
      F("house_code", "รหัสบ้านพัก", { required: true }),
      F("house_name", "ชื่อ/เลขที่บ้านพัก", { required: true }),
      F("estate_id", "Estate", { references: "estates" }),
      F("zone_id", "โซน", { references: "zones" }),
      F("house_type", "ประเภทบ้านพัก", { options: ["staff_house", "worker_room", "contractor_room", "dormitory"] }),
      F("capacity_person", "จำนวนคนที่พักได้", { type: "number" }),
      F("water_meter_no", "เลขมิเตอร์น้ำ"),
      F("electric_meter_no", "เลขมิเตอร์ไฟ"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "house-a01", house_code: "H-A01", house_name: "บ้านพัก A01", estate_id: "estate-spc", zone_id: "zone-north", house_type: "worker_room", capacity_person: "4", water_meter_no: "W-A01", electric_meter_no: "E-A01", status: "active" },
    ],
  },
  employees: {
    moduleId: "farm-people",
    title: "พนักงาน / คนงาน",
    primaryKey: "id",
    codeField: "employee_code",
    labelField: "full_name",
    fields: [
      F("employee_code", "รหัสพนักงาน", { required: true }),
      F("full_name", "ชื่อ-สกุล", { required: true }),
      F("nationality", "สัญชาติ", { options: ["ไทย", "เมียนมา", "กัมพูชา", "ลาว", "มาเลเซีย", "อื่นๆ"] }),
      F("worker_type", "ประเภทบุคลากร", { options: ["คนงาน", "พนักงาน", "หัวหน้างาน", "คนขับ", "ธุรการ"] }),
      F("payment_type", "ประเภทการจ่าย", { options: ["รายวัน", "รายเดือน", "รายเหมา"] }),
      F("department_id", "แผนกงาน", { references: "departments", required: true }),
      F("default_housing_unit_id", "บ้านพักปัจจุบัน", { references: "housing_units" }),
      F("position", "ตำแหน่ง"),
      F("default_role", "Role", { options: FARM_ROLES }),
      F("daily_wage", "ค่าแรงรายวัน", { type: "number" }),
      F("monthly_salary", "เงินเดือน", { type: "number" }),
      F("contract_rate", "อัตราเหมา", { type: "number" }),
      F("normal_hours_per_day", "ชั่วโมงทำงาน/วัน", { type: "number" }),
      F("hourly_wage_rate", "ค่าแรงรายชั่วโมง", { type: "number", calculated: "daily_wage / normal_hours_per_day" }),
      F("phone", "เบอร์โทร"),
      F("start_date", "เริ่มงาน", { type: "date" }),
      F("effective_from", "เริ่มใช้ Version", { type: "date" }),
      F("effective_to", "สิ้นสุด Version", { type: "date" }),
      F("version_no", "Version", { type: "number" }),
      F("is_current", "Version ปัจจุบัน", { type: "boolean" }),
      F("previous_version_id", "Version ก่อนหน้า", { references: "employees" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "emp-001", employee_code: "EMP-001", full_name: "หัวหน้าทีมตัวอย่าง", nationality: "ไทย", worker_type: "หัวหน้างาน", payment_type: "รายวัน", department_id: "dept-field", default_housing_unit_id: "house-a01", position: "Supervisor", default_role: "supervisor", daily_wage: "650", normal_hours_per_day: "8", hourly_wage_rate: "81.25", effective_from: "2026-01-01", version_no: "1", is_current: "true", status: "active" },
      { id: "emp-002", employee_code: "EMP-002", full_name: "คนงานตัวอย่าง", nationality: "ไทย", worker_type: "คนงาน", payment_type: "รายวัน", department_id: "dept-harvest", default_housing_unit_id: "house-a01", position: "Worker", default_role: "viewer", daily_wage: "450", normal_hours_per_day: "8", hourly_wage_rate: "56.25", effective_from: "2026-01-01", version_no: "1", is_current: "true", status: "active" },
    ],
  },
  employee_housing_assignments: {
    moduleId: "farm-people",
    title: "ประวัติพนักงานเข้าพัก",
    primaryKey: "id",
    codeField: "start_date",
    labelField: "employee_id",
    fields: [
      F("employee_id", "พนักงาน", { references: "employees", required: true }),
      F("housing_unit_id", "บ้านพัก", { references: "housing_units", required: true }),
      F("start_date", "วันที่เข้าพัก", { type: "date", required: true }),
      F("end_date", "วันที่ออก", { type: "date" }),
      F("occupant_count", "จำนวนผู้พักอาศัย", { type: "number" }),
      F("share_utility_percent", "สัดส่วนค่าน้ำไฟ (%)", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "housing-assign-001", employee_id: "emp-001", housing_unit_id: "house-a01", start_date: "2026-01-01", occupant_count: "1", share_utility_percent: "50", status: "active" },
      { id: "housing-assign-002", employee_id: "emp-002", housing_unit_id: "house-a01", start_date: "2026-01-01", occupant_count: "1", share_utility_percent: "50", status: "active" },
    ],
  },
  housing_utility_charges: {
    moduleId: "farm-people",
    title: "ค่าน้ำ/ค่าไฟบ้านพัก",
    primaryKey: "id",
    codeField: "billing_month",
    labelField: "housing_unit_id",
    fields: [
      F("housing_unit_id", "บ้านพัก", { references: "housing_units", required: true }),
      F("billing_month", "เดือนบิล", { required: true, placeholder: "2026-01" }),
      F("water_meter_start", "มิเตอร์น้ำต้นงวด", { type: "number" }),
      F("water_meter_end", "มิเตอร์น้ำปลายงวด", { type: "number" }),
      F("water_amount", "ค่าน้ำ", { type: "number" }),
      F("electric_meter_start", "มิเตอร์ไฟต้นงวด", { type: "number" }),
      F("electric_meter_end", "มิเตอร์ไฟปลายงวด", { type: "number" }),
      F("electric_amount", "ค่าไฟ", { type: "number" }),
      F("total_utility_amount", "รวมค่าน้ำค่าไฟ", { type: "number", calculated: "water_amount + electric_amount" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "utility-a01-202601", housing_unit_id: "house-a01", billing_month: "2026-01", water_amount: "120", electric_amount: "480", total_utility_amount: "600", status: "active" },
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
      F("nationality", "สัญชาติ", { options: ["ไทย", "เมียนมา", "กัมพูชา", "ลาว", "มาเลเซีย", "อื่นๆ"] }),
      F("contractor_type", "ประเภท"),
      F("payment_type", "ประเภทการจ่าย", { options: ["รายวัน", "รายเดือน", "รายเหมา"] }),
      F("default_contract_rate", "อัตราเหมาหลัก", { type: "number" }),
      F("default_activity_group_id", "กลุ่มกิจกรรมหลัก", { references: "activity_groups" }),
      F("contact_person", "ผู้ติดต่อ"),
      F("phone", "เบอร์โทร"),
      F("effective_from", "เริ่มใช้ Version", { type: "date" }),
      F("effective_to", "สิ้นสุด Version", { type: "date" }),
      F("version_no", "Version", { type: "number" }),
      F("is_current", "Version ปัจจุบัน", { type: "boolean" }),
      F("previous_version_id", "Version ก่อนหน้า", { references: "contractors" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "con-001", contractor_code: "CON-001", contractor_name: "ผู้รับเหมางานเก็บเกี่ยว", nationality: "ไทย", contractor_type: "harvest", payment_type: "รายเหมา", default_contract_rate: "0", effective_from: "2026-01-01", version_no: "1", is_current: "true", status: "active" },
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
      { id: "team-harvest", team_code: "TEAM-H", team_name: "ทีมเก็บเกี่ยว", team_type: "worker", supervisor_employee_id: "emp-001", status: "active" },
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
  wage_codes: {
    moduleId: "farm-activities",
    title: "รหัสค่าแรง",
    primaryKey: "id",
    codeField: "wage_code",
    labelField: "wage_name",
    fields: [
      F("wage_code", "รหัสค่าแรง", { required: true }),
      F("wage_name", "ชื่อรหัสค่าแรง", { required: true }),
      F("activity_group_id", "กลุ่มกิจกรรม", { references: "activity_groups" }),
      F("payroll_rate_type", "ประเภทค่าแรง", { options: ["daily", "hourly", "piece", "contract", "pool"] }),
      F("default_unit", "หน่วยคิดค่าแรง"),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [
      { id: "wage-fertilizer", wage_code: "W-FERT", wage_name: "ค่าแรงใส่ปุ๋ย", activity_group_id: "act-group-fertilizer", payroll_rate_type: "piece", default_unit: "ไร่", status: "active", note: "ใช้ร่วมกับใส่ปุ๋ยหลายสูตร" },
      { id: "wage-harvest", wage_code: "W-HARVEST", wage_name: "ค่าแรงเก็บเกี่ยว", activity_group_id: "act-group-harvest", payroll_rate_type: "piece", default_unit: "ตัน", status: "active" },
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
      F("wage_code_id", "รหัสค่าแรง", { references: "wage_codes", required: true }),
      F("activity_code", "รหัสกิจกรรม", { required: true }),
      F("activity_name", "ชื่อกิจกรรม", { required: true }),
      F("default_unit", "หน่วยงาน"),
      F("work_type", "ประเภทงาน"),
      F("require_material", "ใช้วัสดุ", { type: "boolean" }),
      F("allow_mobile_record", "บันทึกผ่านมือถือ", { type: "boolean" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "activity-fertilizer-0030", activity_group_id: "act-group-fertilizer", wage_code_id: "wage-fertilizer", activity_code: "AG01-0030", activity_name: "ใส่ปุ๋ย 0-0-30", default_unit: "ต้น", work_type: "maintenance", require_material: "true", allow_mobile_record: "true", status: "active" },
      { id: "activity-fertilizer-dolomite", activity_group_id: "act-group-fertilizer", wage_code_id: "wage-fertilizer", activity_code: "AG01-DOLO", activity_name: "ใส่ปุ๋ยโดโลไมท์", default_unit: "ต้น", work_type: "maintenance", require_material: "true", allow_mobile_record: "true", status: "active" },
      { id: "activity-harvest", activity_group_id: "act-group-harvest", wage_code_id: "wage-harvest", activity_code: "AG08-01", activity_name: "ตัดปาล์ม", default_unit: "ตัน", work_type: "harvest", require_material: "false", allow_mobile_record: "true", status: "active" },
    ],
  },
  activity_wage_code_mappings: {
    moduleId: "farm-activities",
    title: "ผูกกิจกรรมเข้ารหัสค่าแรง",
    primaryKey: "id",
    codeField: "effective_start_date",
    labelField: "activity_id",
    fields: [
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("wage_code_id", "รหัสค่าแรง", { references: "wage_codes", required: true }),
      F("effective_start_date", "เริ่มใช้", { type: "date", required: true }),
      F("effective_end_date", "สิ้นสุด", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
      F("note", "หมายเหตุ"),
    ],
    seed: [
      { id: "map-fert-0030", activity_id: "activity-fertilizer-0030", wage_code_id: "wage-fertilizer", effective_start_date: "2026-01-01", status: "active", note: "0-0-30 ใช้รหัสค่าแรงใส่ปุ๋ย" },
      { id: "map-fert-dolomite", activity_id: "activity-fertilizer-dolomite", wage_code_id: "wage-fertilizer", effective_start_date: "2026-01-01", status: "active", note: "โดโลไมท์ใช้รหัสค่าแรงใส่ปุ๋ยเดียวกัน" },
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
      { id: "usage-fert-tree", activity_id: "activity-fertilizer-0030", material_id: "material-fert-25", usage_basis: "per_tree", usage_rate: "2", usage_unit: "kg", status: "active" },
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
      F("plot_id", "Plot / แปลง", { references: "plots" }),
      F("block_id", "Block", { references: "blocks", required: true }),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("planned_month", "เดือนแผน", { type: "number" }),
      F("planned_quantity", "ปริมาณแผน", { type: "number" }),
      F("unit", "หน่วย"),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "plan-item-001", annual_plan_id: "plan-2569", plot_id: "plot-plt001", block_id: "block-plt001-a", activity_id: "activity-fertilizer-0030", planned_month: "1", planned_quantity: "2640", unit: "ต้น", status: "planned" },
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
      F("plot_id", "Plot / แปลง", { references: "plots" }),
      F("block_id", "Block", { references: "blocks", required: true }),
      F("plot_group_id", "กลุ่มแปลง", { references: "plot_groups" }),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("team_id", "ทีม", { references: "teams" }),
      F("planned_start_date", "วันที่เริ่มแผน", { type: "date" }),
      F("planned_end_date", "วันที่สิ้นสุดแผน", { type: "date" }),
      F("original_scheduled_date", "วันที่เดิมก่อนเลื่อน", { type: "date" }),
      F("scheduled_date", "วันที่ทำงาน", { type: "date" }),
      F("rescheduled_date", "วันที่เลื่อนใหม่", { type: "date" }),
      F("rescheduled_by_manager_id", "ผู้จัดการที่เลื่อน", { references: "profiles" }),
      F("reschedule_reason", "เหตุผลเลื่อนงาน"),
      F("approval_status", "สถานะอนุมัติ", { options: ["not_required", "pending", "approved", "rejected"] }),
      F("approved_by", "ผู้อนุมัติ", { references: "profiles" }),
      F("approved_at", "วันที่อนุมัติ", { type: "date" }),
      F("closed_at", "วันที่ปิดงาน", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "wo-001", planned_work_item_id: "plan-item-001", work_order_no: "WO-2569-001", work_order_title: "ใส่ปุ๋ย Block BLK-001", plot_id: "plot-plt001", block_id: "block-plt001-a", plot_group_id: "plot-group-rspo", activity_id: "activity-fertilizer-0030", team_id: "team-a", planned_start_date: "2026-01-15", planned_end_date: "2026-01-16", scheduled_date: "2026-01-15", approval_status: "approved", approved_by: "profile-admin", approved_at: "2026-01-14", status: "sent_to_mobile" },
      { id: "wo-002", work_order_no: "WO-2569-002", work_order_title: "ตัดปาล์ม Block BLK-002", plot_id: "plot-plt002", block_id: "block-plt002-a", plot_group_id: "plot-group-harvest", activity_id: "activity-harvest", team_id: "team-harvest", planned_start_date: "2026-01-18", planned_end_date: "2026-01-18", scheduled_date: "2026-01-18", approval_status: "pending", status: "pending_approval" },
      { id: "wo-003", work_order_no: "WO-2569-003", work_order_title: "ใส่ปุ๋ยโดโลไมท์ Block BLK-001", plot_id: "plot-plt001", block_id: "block-plt001-a", plot_group_id: "plot-group-rspo", activity_id: "activity-fertilizer-dolomite", team_id: "team-a", planned_start_date: "2026-01-20", planned_end_date: "2026-01-21", original_scheduled_date: "2026-01-20", scheduled_date: "2026-01-23", rescheduled_date: "2026-01-23", rescheduled_by_manager_id: "profile-admin", reschedule_reason: "ฝนตกและพื้นที่ยังไม่พร้อม", approval_status: "approved", status: "rescheduled" },
      { id: "wo-004", work_order_no: "WO-2569-004", work_order_title: "ตัดปาล์มรอบสอง Block BLK-001", plot_id: "plot-plt001", block_id: "block-plt001-a", plot_group_id: "plot-group-harvest", activity_id: "activity-harvest", team_id: "team-harvest", planned_start_date: "2026-01-25", planned_end_date: "2026-01-26", scheduled_date: "2026-01-25", approval_status: "approved", status: "in_progress" },
      { id: "wo-005", work_order_no: "WO-2569-005", work_order_title: "ใส่ปุ๋ย 0-0-30 Block BLK-002", plot_id: "plot-plt002", block_id: "block-plt002-a", plot_group_id: "plot-group-rspo", activity_id: "activity-fertilizer-0030", team_id: "team-a", planned_start_date: "2026-01-28", planned_end_date: "2026-01-29", scheduled_date: "2026-01-28", approval_status: "approved", status: "completed" },
      { id: "wo-006", work_order_no: "WO-2569-006", work_order_title: "ปิดงานเก็บเกี่ยว Block BLK-002", plot_id: "plot-plt002", block_id: "block-plt002-a", plot_group_id: "plot-group-harvest", activity_id: "activity-harvest", team_id: "team-harvest", planned_start_date: "2026-02-02", planned_end_date: "2026-02-02", scheduled_date: "2026-02-02", approval_status: "approved", closed_at: "2026-02-02", status: "closed" },
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
    moduleId: "farm-governance",
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
    moduleId: "farm-governance",
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
      F("master_version_id", "Master Version ที่ใช้"),
      F("payee_snapshot_name", "ชื่อ ณ วันคำนวณ"),
      F("nationality_snapshot", "สัญชาติ ณ วันคำนวณ"),
      F("payment_type_snapshot", "ประเภทการจ่าย ณ วันคำนวณ", { options: ["รายวัน", "รายเดือน", "รายเหมา"] }),
      F("rate_snapshot", "อัตราที่ล็อกไว้", { type: "number" }),
      F("normal_hours_snapshot", "ชั่วโมง/วัน ที่ล็อกไว้", { type: "number" }),
      F("calculated_at", "วันที่คำนวณ", { type: "date" }),
      F("is_locked", "ล็อกผลคำนวณ", { type: "boolean" }),
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
      F("effective_from", "เริ่มใช้เรท", { type: "date" }),
      F("effective_to", "สิ้นสุดเรท", { type: "date" }),
      F("version_no", "Version", { type: "number" }),
      F("is_current", "Version ปัจจุบัน", { type: "boolean" }),
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
      F("plot_id", "Plot / แปลง", { references: "plots" }),
      F("block_id", "Block", { references: "blocks" }),
      F("ap_code", "AP Code"),
      F("activity_id", "กิจกรรม", { references: "activities", required: true }),
      F("material_id", "วัสดุ", { references: "materials" }),
      F("team_id", "กลุ่มคนงาน", { references: "teams" }),
      F("rate_type", "ประเภทเรท", { options: ["labor", "material", "contractor", "fuel", "machine"] }),
      F("unit_id", "หน่วย", { references: "units" }),
      F("rate_amount", "อัตรา", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "budget-rate-001", budget_rate_code: "BUD-2569-001", fiscal_year: "2569", estate_id: "estate-spc", plot_group_id: "plot-group-rspo", plot_id: "plot-plt001", block_id: "block-plt001-a", ap_code: "AP-001", activity_id: "activity-fertilizer-0030", material_id: "material-fert-25", team_id: "team-a", rate_type: "labor", unit_id: "unit-kg", rate_amount: "250", status: "active" },
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
      F("plot_id", "Plot / แปลง", { references: "plots" }),
      F("block_id", "Block", { references: "blocks" }),
      F("ap_code", "AP Code"),
      F("activity_id", "กิจกรรม", { references: "activities" }),
      F("work_order_id", "ใบสั่งงาน", { references: "work_orders" }),
      F("cost_type", "ประเภทต้นทุน", { options: ["labor", "material", "fuel", "machine", "other"] }),
      F("amount", "มูลค่า", { type: "number" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [],
  },
  profiles: {
    moduleId: "farm-governance",
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
    moduleId: "farm-governance",
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
    moduleId: "farm-governance",
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
    moduleId: "farm-governance",
    title: "ขอบเขตการเข้าถึง",
    primaryKey: "id",
    codeField: "scope_type",
    labelField: "profile_id",
    fields: [
      F("profile_id", "ผู้ใช้", { references: "profiles", required: true }),
      F("estate_id", "Estate", { references: "estates" }),
      F("zone_id", "โซน", { references: "zones" }),
      F("plot_id", "Plot / แปลง", { references: "plots" }),
      F("block_id", "Block", { references: "blocks" }),
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
  master_record_versions: {
    moduleId: "farm-governance",
    title: "ประวัติ Version ข้อมูลหลัก",
    primaryKey: "id",
    codeField: "version_no",
    labelField: "entity_table",
    fields: [
      F("entity_table", "ตารางข้อมูล", { required: true }),
      F("entity_id", "รหัส Version ใหม่", { required: true }),
      F("business_key", "รหัสธุรกิจ"),
      F("previous_entity_id", "Version ก่อนหน้า"),
      F("version_no", "Version", { type: "number" }),
      F("effective_from", "เริ่มใช้", { type: "date" }),
      F("effective_to", "สิ้นสุด", { type: "date" }),
      F("locked_target", "ข้อมูลที่ต้องไม่เปลี่ยนย้อนหลัง"),
      F("change_note", "หมายเหตุการเปลี่ยนแปลง"),
      F("changed_at", "วันที่เปลี่ยน", { type: "date" }),
      F("status", "สถานะ", { type: "status" }),
    ],
    seed: [
      { id: "version-rule-payroll", entity_table: "people / payroll_rules", entity_id: "system-rule", business_key: "payroll-lock", version_no: "1", effective_from: "2026-01-01", locked_target: "payroll_lines snapshot", change_note: "รายการค่าแรงที่คำนวณแล้วต้องอ้าง snapshot/version เดิม", changed_at: "2026-01-01", status: "active" },
    ],
  },
  audit_logs: {
    moduleId: "farm-governance",
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
  const transportViews = new Set(["dashboard", "stock", "mill", "rspo", "daily", "summary", "clear", "master-data"]);
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
  syncSidebarDropdowns();
}

function sidebarDropdownState() {
  try {
    return JSON.parse(localStorage.getItem("sidebarDropdownsV3") || "{}") || {};
  } catch {
    return {};
  }
}

function syncSidebarDropdowns() {
  if (!els.tabs) return;
  const saved = sidebarDropdownState();
  for (const detail of els.tabs.querySelectorAll(".menu-dropdown[data-menu-group]")) {
    if (state.sidebarCollapsed) {
      detail.open = false;
      continue;
    }
    const key = detail.dataset.menuGroup;
    detail.open = Object.hasOwn(saved, key) ? Boolean(saved[key]) : false;
  }
  const active = els.tabs.querySelector("button.active[data-view]");
  if (!state.sidebarCollapsed) active?.closest(".menu-dropdown")?.setAttribute("open", "");
}

function saveSidebarDropdownState(detail) {
  if (!detail?.matches?.(".menu-dropdown[data-menu-group]")) return;
  if (state.sidebarCollapsed) return;
  const saved = sidebarDropdownState();
  saved[detail.dataset.menuGroup] = detail.open;
  localStorage.setItem("sidebarDropdownsV3", JSON.stringify(saved));
}

let sidebarFlyoutTimer = null;

function closeSidebarFlyouts(except = null) {
  if (!els.tabs) return;
  for (const detail of els.tabs.querySelectorAll(".menu-dropdown[data-menu-group]")) {
    if (detail !== except) detail.open = false;
  }
  if (!except && els.tabs.contains(document.activeElement)) document.activeElement.blur();
}

function openSidebarFlyout(detail) {
  if (!state.sidebarCollapsed || !detail?.matches?.(".menu-dropdown[data-menu-group]")) return;
  window.clearTimeout(sidebarFlyoutTimer);
  closeSidebarFlyouts(detail);
  detail.open = true;
}

function scheduleSidebarFlyoutClose(detail) {
  if (!state.sidebarCollapsed || !detail?.matches?.(".menu-dropdown[data-menu-group]")) return;
  window.clearTimeout(sidebarFlyoutTimer);
  sidebarFlyoutTimer = window.setTimeout(() => {
    detail.open = false;
    if (detail.contains(document.activeElement)) document.activeElement.blur();
  }, 140);
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

function normalizeFarmDbRows(tableKey, rows = []) {
  const schema = FARM_TABLE_SCHEMAS[tableKey] || {};
  const codeField = schema.codeField || "code";
  return rows.map((raw, index) => {
    const row = Object.fromEntries(Object.entries(raw || {}).map(([key, value]) => [key, value ?? ""]));
    if (!row.id) row.id = row[codeField] || `${tableKey}-${index + 1}`;
    if (tableKey === "blocks") {
      row.block_name = row.block_name || row.block_code || row.id;
      row.ap_code = row.ap_code || row.AP_code || "";
    }
    if (tableKey === "plots") {
      row.plot_name = row.plot_name || row.plot_code || row.id;
    }
    if (tableKey === "work_orders") {
      row.work_order_title = row.work_order_title || row.note || row.work_order_no || row.id;
      row.planned_start_date = row.planned_start_date || row.scheduled_date || "";
      row.planned_end_date = row.planned_end_date || row.scheduled_date || row.planned_start_date || "";
    }
    return {
      ...row,
      tableId: tableKey,
      moduleId: schema.moduleId || "",
      _source: "database",
      updatedAt: row.updated_at || row.created_at || "database",
    };
  });
}

async function loadFarmTablesFromDatabase({ silent = false } = {}) {
  const tableKeys = Object.keys(FARM_TABLE_SCHEMAS);
  try {
    const url = `${FARM_TABLES_API}?tables=${encodeURIComponent(tableKeys.join(","))}&t=${Date.now()}`;
    const payload = await fetch(url, { cache: "no-store" }).then((res) => res.json());
    if (!payload || !payload.tables) throw new Error(payload?.error || "No farm table payload");
    state.farmDbRows = Object.fromEntries(
      Object.entries(payload.tables).map(([tableKey, rows]) => [tableKey, normalizeFarmDbRows(tableKey, Array.isArray(rows) ? rows : [])])
    );
    state.farmDbSource = payload.source || null;
    state.farmDbErrors = payload.errors || {};
    if (silent) render();
    return true;
  } catch (error) {
    state.farmDbRows = {};
    state.farmDbSource = { mode: "fallback-seed", error: error.message };
    state.farmDbErrors = { api: error.message };
    return false;
  }
}

function mergeFarmDbRow(tableKey, row) {
  const normalized = normalizeFarmDbRows(tableKey, [row])[0];
  if (!normalized?.id) return null;
  const rows = Array.isArray(state.farmDbRows?.[tableKey]) ? [...state.farmDbRows[tableKey]] : [];
  const index = rows.findIndex((item) => item.id === normalized.id || item.databaseId === normalized.databaseId);
  if (index >= 0) rows[index] = { ...rows[index], ...normalized };
  else rows.push(normalized);
  state.farmDbRows = { ...state.farmDbRows, [tableKey]: rows };
  return normalized;
}

async function persistFarmRowToDatabase(table, row) {
  const res = await fetch(FARM_TABLES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table: table.key, row }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) throw new Error(payload?.error || `Farm API ${res.status}`);
  const saved = payload.row ? mergeFarmDbRow(table.key, payload.row) : null;
  return { ...payload, row: saved || payload.row || row };
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
    writeClearOverridesLocal();
    await persistClearOverridesToServer();
    const res = await fetchWithTimeout(`${TRANSPORT_REFRESH_API}?t=${Date.now()}`, { method: "POST", cache: "no-store" }, 120000);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || "Refresh failed");
    await loadPayload({ silent: true });
    await Promise.all([loadMillWeightData(), loadClearOverridesFromServer()]);
    render();
    const synced = await syncTransportDatabase("refresh_data");
    if (!synced) {
      setClearSyncStatus(`อัปเดต local แล้ว แต่ sync online ไม่สำเร็จ: ${state.transportSyncResult?.error || ""}`, "error");
    }
    els.refreshTransportBtn.textContent = `Data ${fmt(payload.source?.rowCount || 0)} rows${synced ? "" : " local"}`;
    window.setTimeout(() => {
      els.refreshTransportBtn.textContent = original;
    }, 2500);
  } catch (error) {
    setSourceRefreshError(error);
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
  return isEnteredValue(value) ? n(value) : null;
}

function isEnteredValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim() !== "-";
}

function normalizedHeaderName(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function rowCell(row, ...names) {
  if (!row) return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const target = normalizedHeaderName(name);
    const key = Object.keys(row).find((candidate) => normalizedHeaderName(candidate) === target);
    if (key) return row[key];
  }
  return undefined;
}

function clearLogCell(row, key) {
  const keys = Object.keys(row || {});
  const lossKeys = keys.filter((candidate) => String(candidate).trim().toLowerCase().startsWith("loss"));
  const fallback = {
    clearPr: keys[1],
    clearTk: keys[2],
    note: keys[3],
    sourceNote: keys[9],
    lossRamp: lossKeys[0],
    lossTransport: lossKeys[1],
    lossPrRamp: lossKeys[3],
    lossPrTransport: lossKeys[4],
    lossTkRamp: lossKeys[6],
    lossTkTransport: lossKeys[7],
  }[key];
  return fallback ? row[fallback] : undefined;
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

function millDocKey(value) {
  const text = String(value || "")
    .trim()
    .replace(/^N/i, "")
    .replace(/[^0-9A-Za-z]/g, "");
  return text ? text.padStart(5, "0") : "";
}

function displayDate(value) {
  const d = isoDay(value);
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function dateInputValue(value) {
  return displayDate(value);
}

function dateInputAttrs(value = "", extra = "") {
  return `type="text" inputmode="numeric" placeholder="dd/mm/yyyy" value="${esc(dateInputValue(value))}" ${extra}`.trim();
}

function dateValue(el) {
  return isoDay(el?.value);
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthStartIso(reference = todayIso()) {
  const day = isoDay(reference);
  return day ? `${day.slice(0, 7)}-01` : "";
}

function setDefaultTransportDateRange() {
  const end = todayIso();
  setDateValue(els.startDate, currentMonthStartIso(end));
  setDateValue(els.endDate, end);
}

function setDateValue(el, value) {
  if (!el) return;
  const iso = isoDay(value);
  el.value = displayDate(iso);
  if (el === els.startDate && els.startDatePicker) els.startDatePicker.value = iso;
  if (el === els.endDate && els.endDatePicker) els.endDatePicker.value = iso;
  if (el === els.clearDate && els.clearDatePicker) els.clearDatePicker.value = iso;
}

function normalizeDateInput(el) {
  const iso = dateValue(el);
  if (iso) setDateValue(el, iso);
}

function syncDatePickerFromText(el) {
  const iso = dateValue(el);
  if (el === els.startDate && els.startDatePicker) els.startDatePicker.value = iso;
  if (el === els.endDate && els.endDatePicker) els.endDatePicker.value = iso;
  if (el === els.clearDate && els.clearDatePicker) els.clearDatePicker.value = iso;
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

function yardFilterLabel() {
  const value = els.yardFilter?.value || "all";
  if (value === "garden") return "ปลายราง";
  if (value === "takuk") return "ตะกุก";
  return "ทั้งหมด";
}

function globalFilterLabel(type, value) {
  if (type === "standard") return value === "all" ? "รวมทั้งหมด" : value;
  if (type === "flow") return value === "all" ? "รวมทั้งหมด" : value;
  return value || "";
}

function filterContextLine(extra = []) {
  const parts = [
    `วันที่ ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}`,
    `ลานเท ${yardFilterLabel()}`,
    `มาตรฐาน ${globalFilterLabel("standard", state.dailyFilters.standard)}`,
    `รายการ ${globalFilterLabel("flow", state.dailyFilters.flow)}`,
    ...extra.filter(Boolean),
  ];
  return `ตัวกรองที่ใช้: ${parts.join(" | ")}`;
}

function booleanFlag(value) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n", ""].includes(text)) return false;
  return Boolean(value);
}

function normalizeClearOverride(row) {
  if (!row || !row.date) return null;
  const hasPrFlag = Object.prototype.hasOwnProperty.call(row, "clearPrSet");
  const hasTkFlag = Object.prototype.hasOwnProperty.call(row, "clearTkSet");
  const normalized = {
    date: isoDay(row.date),
    clearPrSet: hasPrFlag ? booleanFlag(row.clearPrSet) : isEnteredValue(row.clearPr),
    clearTkSet: hasTkFlag ? booleanFlag(row.clearTkSet) : isEnteredValue(row.clearTk),
    clearPr: n(row.clearPr),
    clearTk: n(row.clearTk),
    note: String(row.note || ""),
    source: row.source || "manual",
    updatedAt: row.updatedAt || "",
  };
  if (!normalized.date) return null;
  for (const key of ["lossRamp", "lossTransport", "lossPrRamp", "lossPrTransport", "lossTkRamp", "lossTkTransport"]) {
    if (Object.prototype.hasOwnProperty.call(row, key) && isEnteredValue(row[key])) normalized[key] = n(row[key]);
  }
  return normalized;
}

function mergeClearOverrides(...groups) {
  const map = new Map();
  for (const group of groups) {
    for (const sourceRow of group || []) {
      const row = normalizeClearOverride(sourceRow);
      if (!row) continue;
      const existing = map.get(row.date);
      const existingTime = Date.parse(existing?.updatedAt || "") || 0;
      const rowTime = Date.parse(row.updatedAt || "") || 0;
      if (!existing || rowTime >= existingTime) map.set(row.date, row);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function writeClearOverridesLocal() {
  localStorage.setItem(CLEAR_RAMP_STORAGE_KEY, JSON.stringify(state.clearOverrides));
}

function endpointIsLocalOnly(url) {
  try {
    const endpoint = new URL(url, window.location.href);
    return ["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname)
      && !["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function setClearSyncStatus(message, type = "") {
  if (!els.clearSyncStatus) return;
  els.clearSyncStatus.textContent = message || "";
  els.clearSyncStatus.classList.toggle("success", type === "success");
  els.clearSyncStatus.classList.toggle("error", type === "error");
}

function loadClearOverrides() {
  try {
    state.clearOverrides = mergeClearOverrides(JSON.parse(localStorage.getItem(CLEAR_RAMP_STORAGE_KEY) || "[]"));
  } catch {
    state.clearOverrides = [];
  }
}

async function loadClearOverridesFromServer() {
  if (endpointIsLocalOnly(CLEAR_RAMP_API)) return loadClearOverridesFromTransportDb();
  try {
    const payload = await fetch(`${CLEAR_RAMP_API}?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json());
    if (payload?.ok === false) return false;
    state.clearOverrides = mergeClearOverrides(state.clearOverrides, payload.rows || []);
    if (!payload.rows?.length) await loadClearOverridesFromSnapshot();
    writeClearOverridesLocal();
    return true;
  } catch {
    const dbOk = await loadClearOverridesFromTransportDb();
    if (!dbOk || !state.clearOverrides.length) await loadClearOverridesFromSnapshot();
    return dbOk;
  }
}

async function loadClearOverridesFromSnapshot() {
  try {
    const payload = await fetch(`${CLEAR_RAMP_DATA_URL}?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json());
    state.clearOverrides = mergeClearOverrides(state.clearOverrides, payload.rows || []);
    writeClearOverridesLocal();
    return Boolean(payload.rows?.length);
  } catch {
    return false;
  }
}

async function loadClearOverridesFromTransportDb() {
  try {
    const payload = await fetch(`${TRANSPORT_SYNC_API}?t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json());
    if (payload?.ok === false) return false;
    const rows = (payload.clearRows || [])
      .filter((row) => row?.raw_payload?.source === "manual")
      .map((row) => ({
      date: row.clear_date,
      clearPr: row.clear_pr,
      clearTk: row.clear_tk,
      clearPrSet: row.clear_pr_set,
      clearTkSet: row.clear_tk_set,
      lossRamp: row.loss_ramp,
      lossTransport: row.loss_transport,
      lossPrRamp: row.loss_pr_ramp,
      lossPrTransport: row.loss_pr_transport,
      lossTkRamp: row.loss_tk_ramp,
      lossTkTransport: row.loss_tk_transport,
      note: row.note || "",
      source: "database",
      updatedAt: row.updated_at || "",
    }));
    state.clearOverrides = mergeClearOverrides(state.clearOverrides, rows);
    if (!rows.length) await loadClearOverridesFromSnapshot();
    writeClearOverridesLocal();
    return true;
  } catch {
    return false;
  }
}

async function persistClearOverridesToServer() {
  if (endpointIsLocalOnly(CLEAR_RAMP_API)) return false;
  try {
    const res = await fetch(`${CLEAR_RAMP_API}?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: state.clearOverrides }),
      cache: "no-store",
    });
    const payload = await res.json();
    return res.ok && payload?.ok !== false;
  } catch {
    return false;
  }
}

async function saveClearOverrides(reason = "manual") {
  state.clearOverrides = mergeClearOverrides(state.clearOverrides);
  writeClearOverridesLocal();
  setClearSyncStatus("กำลังบันทึกฐานข้อมูลออนไลน์...");
  await persistClearOverridesToServer();
  const ok = await syncTransportDatabase(reason);
  if (!ok) {
    const error = state.transportSyncResult?.error || "ไม่สามารถบันทึกฐานข้อมูลออนไลน์ได้";
    setClearSyncStatus(`บันทึกไม่สำเร็จ: ${error}`, "error");
    return false;
  }
  await loadClearOverridesFromTransportDb();
  writeClearOverridesLocal();
  setClearSyncStatus("บันทึกฐานข้อมูลออนไลน์แล้ว", "success");
  return true;
}

function withFullTransportScope(callback) {
  const previous = {
    start: dateValue(els.startDate),
    end: dateValue(els.endDate),
    yard: els.yardFilter?.value || "combined",
    standard: state.dailyFilters.standard,
    flow: state.dailyFilters.flow,
    millCategories: [...state.millCategories],
  };
  try {
    if (state.payload?.source?.dateMin) setDateValue(els.startDate, state.payload.source.dateMin);
    if (state.payload?.source?.dateMax) setDateValue(els.endDate, state.payload.source.dateMax);
    if (els.yardFilter) els.yardFilter.value = "combined";
    state.dailyFilters.standard = "all";
    state.dailyFilters.flow = "all";
    state.millCategories = ["กรูด-RSPO", "คีรีรัฐ-RSPO", "NON-RSPO"];
    return callback();
  } finally {
    if (previous.start) setDateValue(els.startDate, previous.start);
    if (previous.end) setDateValue(els.endDate, previous.end);
    if (els.yardFilter) els.yardFilter.value = previous.yard;
    state.dailyFilters.standard = previous.standard;
    state.dailyFilters.flow = previous.flow;
    state.millCategories = previous.millCategories;
  }
}

function clearRowsForDatabase() {
  return withFullTransportScope(() => {
    const gardenStock = new Map(buildStockFromData("garden").map((row) => [row.date, row]));
    const takukStock = new Map(buildStockFromData("takuk").map((row) => [row.date, row]));
    return clearRows().map((row) => {
      const report = stockReportClearMetrics(row.date);
      const garden = gardenStock.get(row.date);
      const takuk = takukStock.get(row.date);
      const clearPr = n(row.clearPr);
      const clearTk = n(row.clearTk);
      const clearPrSet = Boolean(row.clearPrSet);
      const clearTkSet = Boolean(row.clearTkSet);
      const gardenBalance = report?.gardenBalance ?? n(garden?.balance);
      const takukBalance = report?.takukBalance ?? n(takuk?.balance);
      const fallbackLossPrRamp = clearPrSet ? clearPr - gardenBalance : (report?.lossPrRamp ?? n(garden?.lossRamp));
      const fallbackLossTkRamp = clearTkSet ? clearTk - takukBalance : (report?.lossTkRamp ?? n(takuk?.lossRamp));
      const lossPrRamp = isEnteredValue(row.lossPrRamp) ? n(row.lossPrRamp) : fallbackLossPrRamp;
      const lossTkRamp = isEnteredValue(row.lossTkRamp) ? n(row.lossTkRamp) : fallbackLossTkRamp;
      const lossPrTransport = report?.lossPrTransport ?? n(garden?.lossTransport);
      const lossTkTransport = report?.lossTkTransport ?? n(takuk?.lossTransport);
      const lossRamp = isEnteredValue(row.lossRamp) ? n(row.lossRamp) : lossPrRamp + lossTkRamp;
      const lossTransport = isEnteredValue(row.lossTransport)
        ? n(row.lossTransport)
        : (report?.lossTransport ?? (lossPrTransport + lossTkTransport));
      return {
        ...row,
        clearPr,
        clearTk,
        clearPrSet,
        clearTkSet,
        gardenBalance,
        takukBalance,
        lossPrRamp,
        lossTkRamp,
        lossRamp,
        lossPrTransport,
        lossTkTransport,
        lossTransport,
      };
    });
  });
}

function sourceRecordsForDatabase() {
  const movementMap = movementBySourceRow();
  return (state.records || []).map((record) => {
    const movement = movementMap.get(Number(record._srcRow));
    const rowScope = dataRecordScope(record);
    return {
      _srcRow: record._srcRow,
      wpDocNo: record.wpDocNo,
      wpInOutType: record.wpInOutType,
      weightDate: record.weightDate,
      date: record.date,
      wpFacDocNo: record.wpFacDocNo,
      wpCarLicense: record.wpCarLicense,
      areaGroup: record.areaGroup,
      name: record.name,
      wpctCode: record.wpctCode,
      wpNetWeight: record.wpNetWeight,
      wpFacNetWeight: record.wpFacNetWeight,
      wpFacGrade: record.wpFacGrade,
      wpGrade: record.wpGrade,
      yard: rowScope === "takuk" ? "ตะกุก" : "ปลายราง",
      standard: recordStandardBucket(record, movement) || record.standard || "",
    };
  });
}

function millRowsForDatabase() {
  return (state.millRows || []).map((row) => ({
    sourceRow: row.sourceRow,
    wpDocNo: row.wpDocNo,
    docKey: row.docKey,
    wpDocDateText: row.wpDocDateText,
    date: row.date,
    wpctCode: row.wpctCode,
    ctinit: row.ctinit,
    ctfname: row.ctfname,
    ctlname: row.ctlname,
    customerName: row.customerName,
    wpCarLicense: row.wpCarLicense,
    wpNetWeight: row.wpNetWeight,
    wpGradeNew: row.wpGradeNew,
    wpproduct: row.wpproduct,
    wppriceperunit: row.wppriceperunit,
    wptotalpay: row.wptotalpay,
    wpRspo: row.wpRspo,
    category: millCategoryFromMill(row),
    date: isoDay(row.date || row.wpDocDateText),
  }));
}

async function syncTransportDatabase(reason = "manual") {
  if (!state.payload) return false;
  try {
    const payload = withFullTransportScope(() => ({
      syncKey: `transport-${state.payload?.source?.generatedAt || Date.now()}`,
      reason,
      source: state.payload?.source || {},
      sourceRecords: sourceRecordsForDatabase(),
      clearRows: clearRowsForDatabase(),
      millRows: millRowsForDatabase(),
      reconciliations: millCompareRows(),
    }));
    const res = await fetchWithTimeout(`${TRANSPORT_SYNC_API}?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    }, 45000);
    const result = await res.json();
    if (!res.ok || result?.ok === false) throw new Error(result?.error || "transport sync failed");
    state.transportSyncResult = result;
    return true;
  } catch (error) {
    state.transportSyncResult = { ok: false, error: error.message };
    return false;
  }
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

function setSourceRefreshError(error) {
  const message = String(error?.message || error || "refresh failed").slice(0, 140);
  const base = String(els.sourceInfo.textContent || "")
    .replace(/(?:\s+refresh failed(?::\s*[^]*)?)+$/i, "")
    .trimEnd();
  els.sourceInfo.textContent = `${base}\nrefresh failed: ${message}`;
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
  if (!previousStart && !previousEnd) setDefaultTransportDateRange();
  else {
    if (!previousStart) setDateValue(els.startDate, currentMonthStartIso());
    if (!previousEnd) setDateValue(els.endDate, todayIso());
  }
  if (els.clearDate && state.payload.source?.dateMax) setDateValue(els.clearDate, state.payload.source.dateMax);
  if (!silent) return true;
  render();
  return true;
}

async function loadMillWeightData() {
  const payload = window.__MILL_WEIGHT_DATA__ || await fetch(`${MILL_WEIGHT_DATA_URL}?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => ({ source: { rowCount: 0 }, records: [] }));
  state.millPayload = payload;
  state.millRows = (payload.records || []).map((row, index) => ({
    ...row,
    sourceRow: row.sourceRow || index + 2,
    date: isoDay(row.date || row.wpDocDateText),
    docKey: millDocKey(row.docKey || row.wpDocNo),
  }));
  state.millStandardByDocKey = null;
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

async function loadSummaryPalmoilAreas() {
  const payload = window.__SUMMARY_PALMOIL_TERRAIN__ || await fetch(`./data/summary_palmoil_terrain.json?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => ({ source: null, records: [] }));
  state.summaryPalmoilSource = payload.source || null;
  state.summaryPalmoilAreas = Array.isArray(payload.records) ? payload.records : [];
}

function startLiveRefresh() {
  if (!state.liveMode) return;
  window.setInterval(async () => {
    try {
      await loadPayload({ silent: true });
    } catch (error) {
      setSourceRefreshError(error);
    }
  }, 15000);
}

function workbookClearRows() {
  const sheet = state.payload?.sheets?.Clear_Ramp_Log;
  return (sheet?.rows || []).map((row) => ({
    date: row._date,
    clearPrSet: isEnteredValue(rowCell(row, "เคลียร์แรมป์ ปลายราง") ?? clearLogCell(row, "clearPr")),
    clearTkSet: isEnteredValue(rowCell(row, "เคลียร์แรมป์ ตะกุก") ?? clearLogCell(row, "clearTk")),
    clearPr: n(rowCell(row, "เคลียร์แรมป์ ปลายราง") ?? clearLogCell(row, "clearPr")),
    clearTk: n(rowCell(row, "เคลียร์แรมป์ ตะกุก") ?? clearLogCell(row, "clearTk")),
    lossRamp: lossOnly(rowCell(row, "Loss รวม - แรมป์") ?? clearLogCell(row, "lossRamp")),
    lossTransport: lossOnly(rowCell(row, "Loss รวม - ขนส่ง") ?? clearLogCell(row, "lossTransport")),
    lossPrRamp: lossOnly(rowCell(row, "Loss ปลายราง - แรมป์") ?? clearLogCell(row, "lossPrRamp")),
    lossPrTransport: lossOnly(rowCell(row, "Loss ปลายราง - ขนส่ง") ?? clearLogCell(row, "lossPrTransport")),
    lossTkRamp: lossOnly(rowCell(row, "Loss ตะกุก - แรมป์") ?? clearLogCell(row, "lossTkRamp")),
    lossTkTransport: lossOnly(rowCell(row, "Loss ตะกุก - ขนส่ง") ?? clearLogCell(row, "lossTkTransport")),
    note: rowCell(row, "หมายเหตุ") || clearLogCell(row, "note") || rowCell(row, "Source / Note") || clearLogCell(row, "sourceNote") || "",
    source: "workbook",
  })).filter((row) => row.date);
}

function monthlyReportClearRows() {
  const gardenRows = state.payload?.monthlyReports?.garden?.rows || [];
  const takukRows = state.payload?.monthlyReports?.takuk?.rows || [];
  const byDate = new Map();
  for (const row of gardenRows) {
    const clearValue = row.cells?.[21];
    byDate.set(row.date, {
      date: row.date,
      clearPrSet: isEnteredValue(clearValue),
      clearTkSet: false,
      clearPr: n(clearValue),
      clearTk: 0,
      lossRamp: 0,
      lossTransport: 0,
      lossPrRamp: 0,
      lossPrTransport: 0,
      lossTkRamp: 0,
      lossTkTransport: 0,
      note: `Source: ${row.monthFile || "monthly stock report"}`,
      source: "report",
    });
  }
  for (const row of takukRows) {
    const clearValue = row.cells?.[19];
    const current = byDate.get(row.date) || {
      date: row.date,
      clearPrSet: false,
      clearPr: 0,
      lossRamp: 0,
      lossTransport: 0,
      lossPrRamp: 0,
      lossPrTransport: 0,
      lossTkRamp: 0,
      lossTkTransport: 0,
      note: `Source: ${row.monthFile || "monthly stock report"}`,
      source: "report",
    };
    current.clearTkSet = isEnteredValue(clearValue);
    current.clearTk = n(clearValue);
    byDate.set(row.date, current);
  }
  return [...byDate.values()];
}

function clearRows() {
  const map = new Map();
  for (const row of workbookClearRows()) map.set(row.date, row);
  for (const row of monthlyReportClearRows()) {
    const base = map.get(row.date);
    map.set(row.date, {
      ...row,
      ...base,
      clearPrSet: base?.clearPrSet || row.clearPrSet,
      clearTkSet: base?.clearTkSet || row.clearTkSet,
      clearPr: base?.clearPrSet ? base.clearPr : row.clearPr,
      clearTk: base?.clearTkSet ? base.clearTk : row.clearTk,
      note: base?.note || row.note,
      source: base?.source || row.source,
    });
  }
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
    loss[scope] += diff;
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
    lossRamp: isEnteredValue(row.lossRamp) ? n(row.lossRamp) : auto.lossRamp,
    lossTransport: isEnteredValue(row.lossTransport) ? n(row.lossTransport) : auto.lossTransport,
    lossPrRamp: isEnteredValue(row.lossPrRamp) ? n(row.lossPrRamp) : auto.lossPrRamp,
    lossPrTransport: isEnteredValue(row.lossPrTransport) ? n(row.lossPrTransport) : auto.lossPrTransport,
    lossTkRamp: isEnteredValue(row.lossTkRamp) ? n(row.lossTkRamp) : auto.lossTkRamp,
    lossTkTransport: isEnteredValue(row.lossTkTransport) ? n(row.lossTkTransport) : auto.lossTkTransport,
  };
}

function dataRecordScope(record) {
  const location = String(record.location || "").trim().toUpperCase();
  if (location.startsWith("T")) return "takuk";
  if (location.startsWith("E")) return "garden";
  const movement = movementBySourceRow().get(Number(record._srcRow));
  if (movement) return movementScope(movement);
  if (record.areaGroup === "Takuk" || String(record.name || "").includes("ตะกุก")) return "takuk";
  return "garden";
}

function isEstateAreaName(record) {
  return /บางกัน|กะเปา|ปลายราง|พันไร่|หมอนไม้|ตะกุก/.test(String(record.name || ""));
}

function dataInboundBucket(record) {
  if (record.standard === "Contract Farmer") return "customer";
  const isKnownEstateCode = String(record.wpctCode || "").trim().startsWith("9");
  if (record.wpInOutType === "I" && !record.estate && !record.areaGroup && !isEstateAreaName(record) && !isKnownEstateCode) return "customer";
  const location = String(record.location || "").trim().toUpperCase();
  if (location.startsWith("T")) return "takuk";
  if (location.startsWith("E")) return "estate";
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

function millStandardLookup() {
  if (state.millStandardByDocKey) return state.millStandardByDocKey;
  const map = new Map();
  for (const row of state.millRows || []) {
    const key = millDocKey(row.docKey || row.wpDocNo);
    if (!key) continue;
    const category = millCategoryFromMill(row);
    const standard = category === "NON-RSPO" ? "NON-RSPO" : category ? "RSPO" : "";
    if (standard) map.set(key, standard);
  }
  state.millStandardByDocKey = map;
  return map;
}

function millStandardForFactoryDoc(docNo) {
  const key = millDocKey(docNo);
  return key ? millStandardLookup().get(key) || "" : "";
}

function recordStandardBucket(record, movement) {
  const fromMovement = standardBucketFromText(movement?.["กอง"]);
  if (fromMovement) return fromMovement;
  if (record?.wpInOutType === "O") {
    const fromMill = millStandardForFactoryDoc(record.wpFacDocNo);
    if (fromMill) return fromMill;
  }
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
      item.lossTransport += diff;
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
      const clearValue = scope === "garden"
        ? n(clear?.clearPr)
        : scope === "takuk"
          ? n(clear?.clearTk)
          : (clear?.clearPrSet ? n(clear?.clearPr) : 0) + (clear?.clearTkSet ? n(clear?.clearTk) : 0);
      const explicitTransportLoss = item.lossTransport;
      item.totalAll = carry + item.totalRamp;
      item.opening = carry;
      item.balance = item.totalAll - item.outboundTotal;
      item.lossRamp = hasClearOpening ? clearValue - item.balance : 0;
      if (scope === "garden") {
        item.lossTransport = clear?.lossPrTransport === undefined || clear?.lossPrTransport === null ? explicitTransportLoss : n(clear.lossPrTransport);
      }
      if (scope === "takuk") {
        item.lossTransport = clear?.lossTkTransport === undefined || clear?.lossTkTransport === null ? explicitTransportLoss : n(clear.lossTkTransport);
      }
      if (scope === "combined") {
        item.lossTransport = clear?.lossTransport === undefined || clear?.lossTransport === null ? explicitTransportLoss : n(clear.lossTransport);
      }
      item.loss = item.lossRamp + item.lossTransport;
      carry = hasClearOpening ? clearValue : item.balance;
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
  return n(rows.at(-1)?.balance);
}

function exactRows(scope) {
  const report = state.payload.monthlyReports?.[scope];
  if (report?.rows?.length) return report.rows.filter((row) => inRange(row.date));
  const workbookReport = state.payload.workbookReports?.[scope];
  if (workbookReport?.rows?.length) return workbookReport.rows.filter((row) => inRange(row.date));
  return [];
}

function stockReportRows(scope) {
  const report = state.payload?.monthlyReports?.[scope];
  if (report?.rows?.length) return report.rows;
  const workbookReport = state.payload?.workbookReports?.[scope];
  if (workbookReport?.rows?.length) return workbookReport.rows;
  return [];
}

function stockReportRow(scope, date) {
  return stockReportRows(scope).find((row) => row.date === date);
}

function stockReportClearMetrics(date) {
  if (!globalFiltersAreAll()) return null;
  const garden = stockReportRow("garden", date);
  const takuk = stockReportRow("takuk", date);
  const combined = stockReportRow("combined", date);
  if (!garden && !takuk && !combined) return null;
  const g = garden?.cells || [];
  const t = takuk?.cells || [];
  const c = combined?.cells || [];
  return {
    gardenBalance: n(g[20]),
    takukBalance: n(t[18]),
    balance: combined ? n(c[19]) : n(g[20]) + n(t[18]),
    clearPr: combined ? n(c[20]) : n(g[21]),
    clearTk: combined ? n(c[21]) : n(t[19]),
    clearPrSet: combined ? isEnteredValue(c[20]) : isEnteredValue(g[21]),
    clearTkSet: combined ? isEnteredValue(c[21]) : isEnteredValue(t[19]),
    lossPrRamp: n(g[23]),
    lossTkRamp: n(t[21]),
    lossRamp: combined ? n(c[23]) : n(g[23]) + n(t[21]),
    lossPrTransport: n(g[24]),
    lossTkTransport: n(t[22]),
    lossTransport: combined ? n(c[24]) : n(g[24]) + n(t[22]),
    outbound: combined ? n(c[18]) : n(g[19]) + n(t[17]),
    opening: combined ? n(c[1]) : n(g[1]) + n(t[1]),
  };
}

function outboundDocsForClear(date, scope, targetWeight, isClearSet) {
  if (!isClearSet || n(targetWeight) <= 0) return "-";
  const nextDate = addIsoDays(date, 1);
  const target = n(targetWeight);
  const rows = (state.records || [])
    .filter((record) => {
      const recordDate = isoDay(record.weightDate || record.date);
      return recordDate === nextDate && record.wpInOutType === "O" && dataRecordScope(record) === scope;
    })
    .sort((a, b) => String(a.wpCarWeightDate || a.wpTotalWeightDate || "").localeCompare(String(b.wpCarWeightDate || b.wpTotalWeightDate || ""))
      || n(a._srcRow) - n(b._srcRow));
  const exact = rows.find((record) => n(record.wpNetWeight) === target);
  const selected = exact ? [exact] : [];
  let total = n(exact?.wpNetWeight);
  if (!exact) {
    for (const record of rows) {
      selected.push(record);
      total += n(record.wpNetWeight);
      if (total >= target) break;
    }
  }
  if (!selected.length) return "-";
  const docs = selected.map((record) => `${record.wpDocNo || "-"} (${fmt(record.wpNetWeight)})`).join(", ");
  const diff = total - target;
  return diff ? `${docs} / ต่าง ${fmt(diff)}` : docs;
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
  const report = state.payload.monthlyReports?.[scope] || state.payload.workbookReports?.[scope];
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
      <p>${filterContextLine()}</p>
    </div>`;
  const headerRows = report.headers.map((header) => `<tr>${header.map((cell) => `<th>${cell ?? ""}</th>`).join("")}</tr>`).join("");
  const bodyRows = rows.map((row) => `<tr>${row.cells.map((cell, index) => {
    const value = index === 0 ? dayNumber(row.date) : cell;
    return typeof value === "number" ? `<td class="num">${fmt(value)}</td>` : `<td>${value ?? ""}</td>`;
  }).join("")}</tr>`).join("");
  els.reportPage.innerHTML = `${title}<div class="table-wrap"><table><thead>${headerRows}</thead><tbody>${bodyRows}</tbody>${exactFooter(scope, rows)}</table></div>`;
}

function renderExactDashboard(scope) {
  if (!globalFiltersAreAll()) return false;
  const rows = exactRows(scope);
  if (!rows.length) return false;
  const inbound = rows.reduce((sum, row) => sum + exactMetric(scope, row.cells, "inbound"), 0);
  const outbound = rows.reduce((sum, row) => sum + exactMetric(scope, row.cells, "outbound"), 0);
  const loss = rows.reduce((sum, row) => sum + Math.abs(exactMetric(scope, row.cells, "loss")), 0);
  els.kpiOpening.textContent = fmt(exactMetric(scope, rows[0].cells, "opening"));
  els.kpiInbound.textContent = fmt(inbound);
  els.kpiOutbound.textContent = fmt(outbound);
  els.kpiLoss.textContent = fmt(loss);
  els.kpiBalance.textContent = fmt(exactMetric(scope, rows.at(-1).cells, "balance"));
  return true;
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
        { key: "lossRamp", label: "แรมป์", value: (r) => n(r.lossRamp), loss: true },
        { key: "lossTransport", label: "ขนส่ง", value: (r) => n(r.lossTransport), loss: true },
        { key: "loss", label: "รวม", value: (r) => n(r.loss), loss: true },
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
        { key: "lossRamp", label: "แรมป์", value: (r) => n(r.lossRamp), loss: true },
        { key: "lossTransport", label: "ขนส่ง", value: (r) => n(r.lossTransport), loss: true },
        { key: "loss", label: "รวม", value: (r) => n(r.loss), loss: true },
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
      { key: "lossRamp", label: "แรมป์", value: (r) => n(r.lossRamp), loss: true },
      { key: "lossTransport", label: "ขนส่ง", value: (r) => n(r.lossTransport), loss: true },
      { key: "loss", label: "รวม", value: (r) => n(r.loss), loss: true },
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
    const rowScope = dataRecordScope(record);
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
    const rowScope = dataRecordScope(record);
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
      item.lossTransport += diff;
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
    carryGarden = nextCarryBalance(garden, "garden", clear);
    carryTakuk = nextCarryBalance(takuk, "takuk", clear);

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
  const clearSet = scope === "garden" ? clear?.clearPrSet : clear?.clearTkSet;
  const clearValue = scope === "garden" ? n(clear?.clearPr) : n(clear?.clearTk);
  const clearTransportLoss = scope === "garden" ? clear?.lossPrTransport : clear?.lossTkTransport;
  item.opening = previousBalance;
  item.clearPr = scope === "garden" ? clearValue : 0;
  item.clearTk = scope === "takuk" ? clearValue : 0;
  item.clear = item.clearPr + item.clearTk;
  item.totalAll = item.opening + item.totalRamp;
  item.balance = item.totalAll - item.outboundTotal;
  item.lossRamp = clearSet ? clearValue - item.balance : 0;
  item.lossTransport = clearTransportLoss === undefined || clearTransportLoss === null ? item.lossTransport : n(clearTransportLoss);
  item.loss = item.lossRamp + item.lossTransport;
}

function nextCarryBalance(item, scope, clear) {
  if (scope === "garden" && clear?.clearPrSet) return n(clear.clearPr);
  if (scope === "takuk" && clear?.clearTkSet) return n(clear.clearTk);
  return item.balance;
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
      <p>${filterContextLine()}</p>
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
      <p>${filterContextLine()}</p>
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
      const scope = dataRecordScope(record);
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
    const scope = dataRecordScope(r);
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
      <p>${filterContextLine()}</p>
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

function millRecordDate(record) {
  return isoDay(record.date || record.weightDate || record.wpDocDate || record.wpFacDocDate);
}

function millCategoryFromMill(row) {
  const rspo = String(row?.wpRspo || "").trim().toUpperCase();
  const text = `${row?.customerName || ""} ${row?.ctlname || ""} ${row?.wpctCode || ""}`;
  if (rspo === "Y" && (text.includes("กรูด") || String(row?.wpctCode || "") === "10103")) return "กรูด-RSPO";
  if (rspo === "Y" && (text.includes("คีรีรัฐ") || String(row?.wpctCode || "") === "10102")) return "คีรีรัฐ-RSPO";
  return "NON-RSPO";
}

function millCategoryFromSource(source) {
  const text = (source?.sourceRows || []).map((record) => `${record.name || ""} ${record.estate || ""} ${record.areaGroup || ""}`).join(" ");
  if (text.includes("กรูด")) return "กรูด-RSPO";
  if (text.includes("คีรีรัฐ") && !text.includes("NON-RSPO")) return "คีรีรัฐ-RSPO";
  return "NON-RSPO";
}

function millCategoryOrder(category) {
  return { "กรูด-RSPO": 1, "คีรีรัฐ-RSPO": 2, "NON-RSPO": 3 }[category] || 9;
}

function millCategorySelected(category) {
  return state.millCategories.includes(category);
}

function millSourceGroups() {
  const movementMap = movementBySourceRow();
  const scope = yardScope();
  const groups = new Map();

  for (const record of state.records || []) {
    if (record.wpInOutType !== "O" || !record.wpFacDocNo) continue;
    const rowDate = millRecordDate(record);
    if (rowDate && !inRange(rowDate)) continue;
    const movement = movementMap.get(Number(record._srcRow));
    const rowScope = dataRecordScope(record);
    if (scope !== "combined" && rowScope !== scope) continue;
    if (!recordMatchesGlobalFilters(record, movement)) continue;

    const key = millDocKey(record.wpFacDocNo);
    if (!key) continue;
    const group = groups.get(key) || {
      docKey: key,
      factoryDocNo: record.wpFacDocNo,
      sourceDocs: [],
      dates: [],
      carLicenses: new Set(),
      sourceNetWeight: 0,
      sourceFactoryNetWeight: 0,
      sourceRows: [],
      standards: new Set(),
      yards: new Set(),
      grades: new Set(),
    };

    group.sourceDocs.push(record.wpDocNo || "");
    if (rowDate) group.dates.push(rowDate);
    if (record.wpCarLicense) group.carLicenses.add(record.wpCarLicense);
    if (rowScope) group.yards.add(rowScope === "takuk" ? "ตะกุก" : "ปลายราง");
    const standard = recordStandardBucket(record, movement) || record.standard || "";
    if (standard) group.standards.add(standard);
    if (record.wpFacGrade) group.grades.add(record.wpFacGrade);
    else if (record.wpGrade) group.grades.add(record.wpGrade);
    group.sourceNetWeight += n(record.wpNetWeight);
    group.sourceFactoryNetWeight += n(record.wpFacNetWeight);
    group.sourceRows.push(record);
    groups.set(key, group);
  }

  return groups;
}

function millRowsByKey() {
  const map = new Map();
  for (const row of state.millRows || []) {
    const key = millDocKey(row.docKey || row.wpDocNo);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, wpNetWeight: n(row.wpNetWeight), rows: [row], category: millCategoryFromMill(row) });
      continue;
    }
    existing.wpNetWeight += n(row.wpNetWeight);
    existing.rows.push(row);
  }
  return map;
}

function millCompareRows() {
  const sourceGroups = millSourceGroups();
  const millMap = millRowsByKey();
  const includeMillOnlyRows = yardScope() === "combined" && globalFiltersAreAll();
  const keys = new Set(includeMillOnlyRows ? [...sourceGroups.keys(), ...millMap.keys()] : [...sourceGroups.keys()]);
  const rows = [];

  for (const key of keys) {
    const source = sourceGroups.get(key);
    const mill = millMap.get(key);
    const dates = [...(source?.dates || []), mill?.date].filter(Boolean).sort();
    const date = dates[0] || "";
    if (date && !inRange(date)) continue;
    const sourceWeight = n(source?.sourceNetWeight);
    const sourceFactoryWeight = n(source?.sourceFactoryNetWeight);
    const millWeight = n(mill?.wpNetWeight);
    const hasQueryFactoryWeight = !!source && sourceFactoryWeight > 0;
    const destinationWeight = mill ? millWeight : hasQueryFactoryWeight ? sourceFactoryWeight : 0;
    const diffSource = destinationWeight - sourceWeight;
    const diffFactory = destinationWeight - sourceFactoryWeight;
    const status = source && mill
      ? "matched"
      : source && hasQueryFactoryWeight
        ? "query_factory"
        : source
          ? "missing_mill"
          : "missing_source";

    rows.push({
      docKey: key,
      date,
      sourceDocNo: source?.sourceDocs.filter(Boolean).join(", ") || "",
      factoryDocNo: mill?.wpDocNo || source?.factoryDocNo || key,
      customerName: mill?.customerName || [mill?.ctinit, mill?.ctfname, mill?.ctlname].filter(Boolean).join(" "),
      carLicense: mill?.wpCarLicense || [...(source?.carLicenses || [])].join(", "),
      sourceWeight,
      sourceFactoryWeight,
      millWeight,
      destinationWeight,
      destinationSource: mill ? "SPC Data" : hasQueryFactoryWeight ? "Query ขาออก" : "-",
      diffSource,
      diffFactory,
      lossRate: sourceWeight ? (diffSource / sourceWeight) * 100 : 0,
      sourceRows: source?.sourceRows?.length || 0,
      status,
      grade: mill?.wpGradeNew || [...(source?.grades || [])].filter(Boolean).join(", "),
      rspo: mill ? millCategoryFromMill(mill) : millCategoryFromSource(source),
      category: mill ? millCategoryFromMill(mill) : millCategoryFromSource(source),
      yard: [...(source?.yards || [])].join(", "),
    });
  }

  return rows.sort((a, b) => (
    millCategoryOrder(a.category) - millCategoryOrder(b.category)
    || (a.date || "").localeCompare(b.date || "")
    || a.docKey.localeCompare(b.docKey)
  ));
}

function millTotals(rows) {
  const totals = rows.reduce((acc, row) => {
    const comparable = row.status === "matched" || row.status === "query_factory";
    acc.docs += 1;
    acc.matched += row.status === "matched" ? 1 : 0;
    acc.queryFactory += row.status === "query_factory" ? 1 : 0;
    acc.missingMill += row.status === "missing_mill" ? 1 : 0;
    acc.missingSource += row.status === "missing_source" ? 1 : 0;
    acc.missingMillSourceWeight += row.status === "missing_mill" ? n(row.sourceWeight) : 0;
    acc.missingSourceDestinationWeight += row.status === "missing_source" ? n(row.destinationWeight) : 0;
    if (comparable) {
      acc.compareDocs += 1;
      acc.sourceWeight += n(row.sourceWeight);
      acc.sourceFactoryWeight += n(row.sourceFactoryWeight);
      acc.millWeight += n(row.millWeight);
      acc.destinationWeight += n(row.destinationWeight);
      acc.queryFactoryWeight += row.status === "query_factory" ? n(row.destinationWeight) : 0;
      acc.diffSource += n(row.diffSource);
      acc.diffFactory += n(row.diffFactory);
    }
    return acc;
  }, {
    docs: 0,
    compareDocs: 0,
    matched: 0,
    queryFactory: 0,
    missingMill: 0,
    missingSource: 0,
    missingMillSourceWeight: 0,
    missingSourceDestinationWeight: 0,
    sourceWeight: 0,
    sourceFactoryWeight: 0,
    millWeight: 0,
    destinationWeight: 0,
    queryFactoryWeight: 0,
    diffSource: 0,
    diffFactory: 0,
  });
  totals.lossRate = totals.sourceWeight ? (totals.diffSource / totals.sourceWeight) * 100 : 0;
  return totals;
}

function millStatusLabel(status) {
  if (status === "matched") return "เทียบได้";
  if (status === "query_factory") return "เทียบจาก Query";
  if (status === "missing_mill") return "ไม่พบปลายทาง";
  return "ไม่พบต้นทาง";
}

function millDiffClass(value) {
  if (n(value) < 0) return "loss";
  if (n(value) > 0) return "delta up";
  return "delta flat";
}

function millSegmentSummaries(rows) {
  const categories = ["กรูด-RSPO", "คีรีรัฐ-RSPO", "NON-RSPO"];
  return categories.map((category) => {
    const segmentRows = rows.filter((row) => row.category === category);
    const totals = millTotals(segmentRows);
    return { category, rows: segmentRows, ...totals };
  });
}

function millGradeSummaries(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.status !== "matched" && row.status !== "query_factory") continue;
    const grade = row.grade || "-";
    const key = `${row.category}|${grade}`;
    const item = map.get(key) || {
      category: row.category,
      grade,
      docs: 0,
      sourceWeight: 0,
      destinationWeight: 0,
      diffSource: 0,
    };
    item.docs += 1;
    item.sourceWeight += n(row.sourceWeight);
    item.destinationWeight += n(row.destinationWeight);
    item.diffSource += n(row.diffSource);
    map.set(key, item);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      lossRate: row.sourceWeight ? (row.diffSource / row.sourceWeight) * 100 : 0,
    }))
    .sort((a, b) => millCategoryOrder(a.category) - millCategoryOrder(b.category) || String(a.grade).localeCompare(String(b.grade)));
}

function millPieSegments(rows) {
  const total = rows.reduce((sum, row) => sum + n(row.destinationWeight), 0);
  if (!total) return { total: 0, gradient: "#e5e7eb 0 100%", rows: [] };
  const colors = ["#28466f", "#0f766e", "#d99a2b", "#7c3aed", "#dc2626", "#64748b"];
  let cursor = 0;
  const parts = rows.map((row, index) => {
    const percent = (n(row.destinationWeight) / total) * 100;
    const start = cursor;
    const end = cursor + percent;
    cursor = end;
    return { ...row, color: colors[index % colors.length], percent, start, end };
  });
  const gradient = parts.map((row) => `${row.color} ${row.start}% ${row.end}%`).join(", ");
  return { total, gradient, rows: parts };
}

function filteredMillRows(compareRows = null) {
  const allowedKeys = compareRows
    ? new Set(compareRows
      .filter((row) => row.status === "matched" || row.status === "missing_source" || row.destinationSource === "SPC Data")
      .map((row) => millDocKey(row.factoryDocNo || row.docKey))
      .filter(Boolean))
    : null;
  return (state.millRows || [])
    .map((row) => ({
      ...row,
      category: millCategoryFromMill(row),
      date: isoDay(row.date || row.wpDocDateText),
    }))
    .filter((row) => (
      (!row.date || inRange(row.date)) &&
      millCategorySelected(row.category) &&
      (!allowedKeys || allowedKeys.has(millDocKey(row.wpDocNo)))
    ))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || millDocKey(a.wpDocNo).localeCompare(millDocKey(b.wpDocNo)));
}

function millSpcTotals(rows) {
  return rows.reduce((acc, row) => {
    acc.wpNetWeight += n(row.wpNetWeight);
    acc.wptotalpay += n(row.wptotalpay);
    acc.count += 1;
    return acc;
  }, { count: 0, wpNetWeight: 0, wptotalpay: 0 });
}

function renderMillWeight() {
  const rows = millCompareRows().filter((row) => millCategorySelected(row.category));
  const totals = millTotals(rows);
  const segmentRows = millSegmentSummaries(rows);
  const gradeRows = millGradeSummaries(rows);
  const gradePie = millPieSegments(gradeRows);
  const spcRows = filteredMillRows(rows);
  const spcTotals = millSpcTotals(spcRows);
  const source = state.millPayload?.source || {};
  const shownRows = rows.slice(0, 500);
  const shownSpcRows = spcRows.slice(0, 500);
  const categoryOptions = ["กรูด-RSPO", "คีรีรัฐ-RSPO", "NON-RSPO"];

  state.currentRows = rows;
  els.reportPage.innerHTML = `
    <section class="mill-page">
      <div class="report-title mill-hero">
        <div>
          <h2>Mill-Weight</h2>
          <p>เปรียบเทียบน้ำหนักส่งออกต้นทางกับน้ำหนักปลายทางโรงงาน SPC ตามเลขเอกสารโรงงาน</p>
          <p>แหล่งข้อมูลปลายทาง: ${source.workbook || "Data.xlsx"} · ชีต ${source.sheet || "SPC"} · ${fmt(source.rowCount || state.millRows.length)} rows · ล่าสุด ${displayDate(source.dateMax || "")}</p>
          <p>${filterContextLine([`กลุ่ม Mill ${state.millCategories.join(", ")}`])}</p>
        </div>
        <div class="mill-hero-badge">
          <span>ช่วงวันที่</span>
          <strong>${monthTitle(dateValue(els.startDate), dateValue(els.endDate))}</strong>
        </div>
      </div>

      <div class="mill-kpis">
        <article>
          <span>เอกสารที่เทียบได้</span>
          <strong>${fmt(totals.matched + totals.queryFactory)} / ${fmt(totals.docs)}</strong>
          <small>${fmt(totals.missingMill + totals.missingSource)} รายการต้องตรวจ</small>
        </article>
        <article>
          <span>น้ำหนักต้นทาง</span>
          <strong>${fmt(totals.sourceWeight)}</strong>
          <small>kg จากใบชั่งส่งออก</small>
        </article>
        <article>
          <span>น้ำหนักปลายทาง</span>
          <strong>${fmt(totals.destinationWeight)}</strong>
          <small>SPC ${fmt(totals.millWeight)} · Query ${fmt(totals.queryFactoryWeight)}</small>
        </article>
        <article>
          <span>ส่วนต่างปลายทาง - ต้นทาง</span>
          <strong class="${millDiffClass(totals.diffSource)}">${fmt(totals.diffSource)}</strong>
          <small>${moneyNf.format(totals.lossRate)}%</small>
        </article>
      </div>

      <div class="mill-analysis-grid">
        <section class="mill-card">
          <div class="table-headline">
            <h3>เปรียบเทียบตามกลุ่ม</h3>
            <span>น้ำหนักต้นทางเทียบเฉพาะรายการที่จับคู่ได้ ส่วน SPC ที่ยังไม่มีต้นทางแยกไว้ให้ตรวจ</span>
          </div>
          <div class="table-wrap compact">
            <table class="mini-table mill-segment-table">
              <thead>
                <tr>
                  <th class="left">กลุ่ม</th>
                  <th>เอกสารเทียบ</th>
                  <th>ต้นทาง kg</th>
                  <th>ปลายทาง kg</th>
                  <th>Diff kg</th>
                  <th>Diff %</th>
                  <th>SPC</th>
                  <th>Query</th>
                  <th>ต้องตรวจ</th>
                  <th>SPC รอต้นทาง kg</th>
                </tr>
              </thead>
              <tbody>
                ${segmentRows.map((row) => `
                  <tr>
                    <td class="left"><span class="mill-segment-dot ${row.category.replace(/[^A-Za-z0-9ก-ฮ]/g, "-")}"></span>${row.category}</td>
                    <td class="num">${fmt(row.compareDocs)}</td>
                    <td class="num">${fmt(row.sourceWeight)}</td>
                    <td class="num">${fmt(row.destinationWeight)}</td>
                    <td class="num ${millDiffClass(row.diffSource)}">${fmt(row.diffSource)}</td>
                    <td class="num ${millDiffClass(row.diffSource)}">${moneyNf.format(row.lossRate)}%</td>
                    <td class="num">${fmt(row.matched)}</td>
                    <td class="num">${fmt(row.queryFactory)}</td>
                    <td class="num">${fmt(row.missingMill + row.missingSource)}</td>
                    <td class="num">${fmt(row.missingSourceDestinationWeight)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>
        <section class="mill-card">
          <div class="table-headline">
            <h3>วิเคราะห์เกรดประเมิน</h3>
            <span>สัดส่วนน้ำหนักปลายทางตาม Grade</span>
          </div>
          <div class="mill-grade-chart">
            <div class="mill-pie" style="--pie:${gradePie.gradient}"><span>${fmt(gradePie.total)}</span><small>kg</small></div>
            <div class="mill-pie-legend">
              ${gradePie.rows.map((row) => `
                <div>
                  <i style="background:${row.color}"></i>
                  <span>${row.category} / Grade ${row.grade}</span>
                  <strong>${moneyNf.format(row.percent)}%</strong>
                </div>`).join("") || `<p class="muted">ไม่มีข้อมูลเกรดในช่วงที่เลือก</p>`}
            </div>
          </div>
          <div class="table-wrap compact mill-grade-detail">
            <table class="mini-table mill-grade-table">
              <thead>
                <tr>
                  <th class="left">กลุ่ม</th>
                  <th>Grade</th>
                  <th>เอกสาร</th>
                  <th>ปลายทาง kg</th>
                  <th>Diff kg</th>
                  <th>Diff %</th>
                </tr>
              </thead>
              <tbody>
                ${gradeRows.map((row) => `
                  <tr>
                    <td class="left">${row.category}</td>
                    <td><span class="mill-grade-chip">${row.grade}</span></td>
                    <td class="num">${fmt(row.docs)}</td>
                    <td class="num">${fmt(row.destinationWeight)}</td>
                    <td class="num ${millDiffClass(row.diffSource)}">${fmt(row.diffSource)}</td>
                    <td class="num ${millDiffClass(row.diffSource)}">${moneyNf.format(row.lossRate)}%</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="mill-card">
        <div class="table-headline">
          <h3>รายละเอียดเทียบน้ำหนัก</h3>
          <span>แสดง ${fmt(shownRows.length)} จาก ${fmt(rows.length)} รายการ</span>
        </div>
        <div class="mill-category-filter" aria-label="กรองกลุ่ม Mill-Weight">
          ${categoryOptions.map((category) => `
            <label>
              <input type="checkbox" data-mill-category="${category}" ${millCategorySelected(category) ? "checked" : ""}>
              <span>${category}</span>
            </label>`).join("")}
        </div>
        <div class="table-wrap">
          <table class="mini-table mill-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>เอกสารโรงงาน</th>
                <th class="left">ใบชั่งต้นทาง</th>
                <th>ลาน</th>
                <th>กลุ่ม</th>
                <th>ทะเบียน</th>
                <th class="left">ผู้ขาย / โรงงาน</th>
                <th>ต้นทาง kg</th>
                <th>ปลายทาง kg</th>
                <th>Diff kg</th>
                <th>Diff %</th>
                <th>สถานะ</th>
                <th>แหล่ง</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              ${shownRows.map((row) => `
                <tr>
                  <td>${displayDate(row.date)}</td>
                  <td>${row.factoryDocNo}</td>
                  <td class="left">${row.sourceDocNo || "-"}</td>
                  <td>${row.yard || "-"}</td>
                  <td>${row.category || "-"}</td>
                  <td>${row.carLicense || "-"}</td>
                  <td class="left">${row.customerName || "-"}</td>
                  <td class="num">${fmt(row.sourceWeight)}</td>
                  <td class="num">${fmt(row.destinationWeight)}</td>
                  <td class="num ${millDiffClass(row.diffSource)}">${fmt(row.diffSource)}</td>
                  <td class="num ${millDiffClass(row.diffSource)}">${moneyNf.format(row.lossRate)}%</td>
                  <td><span class="mill-chip ${row.status}">${millStatusLabel(row.status)}</span></td>
                  <td>${row.destinationSource}</td>
                  <td>${row.grade || "-"}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td class="left">รวม</td>
                <td></td><td></td><td></td><td></td><td></td><td></td>
                <td class="num">${fmt(totals.sourceWeight)}</td>
                <td class="num">${fmt(totals.destinationWeight)}</td>
                <td class="num ${millDiffClass(totals.diffSource)}">${fmt(totals.diffSource)}</td>
                <td class="num ${millDiffClass(totals.diffSource)}">${moneyNf.format(totals.lossRate)}%</td>
                <td>${fmt(totals.matched + totals.queryFactory)} เทียบได้</td>
                <td></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="mill-card">
        <div class="table-headline">
          <h3>ข้อมูลจากไฟล์ Data.xlsx</h3>
          <span>คอลัมน์ตามชีต SPC · แสดง ${fmt(shownSpcRows.length)} จาก ${fmt(spcRows.length)} รายการ</span>
        </div>
        <div class="table-wrap">
          <table class="mini-table mill-spc-table">
            <thead>
              <tr>
                <th>wpDocNo</th>
                <th>wpDocDate</th>
                <th>wpctCode</th>
                <th>ctinit</th>
                <th class="left">ctfname</th>
                <th class="left">ctlname</th>
                <th>wpCarLicense</th>
                <th>wpNetWeight</th>
                <th>wpGradeNew</th>
                <th>wpproduct</th>
                <th>wppriceperunit</th>
                <th>wptotalpay</th>
                <th>wpRspo</th>
              </tr>
            </thead>
            <tbody>
              ${shownSpcRows.map((row) => `
                <tr>
                  <td>${row.wpDocNo || "-"}</td>
                  <td>${displayDate(row.date || row.wpDocDateText)}</td>
                  <td>${row.wpctCode || "-"}</td>
                  <td>${row.ctinit || "-"}</td>
                  <td class="left">${row.ctfname || "-"}</td>
                  <td class="left">${row.ctlname || "-"}</td>
                  <td>${row.wpCarLicense || "-"}</td>
                  <td class="num">${fmt(row.wpNetWeight)}</td>
                  <td>${row.wpGradeNew || "-"}</td>
                  <td>${row.wpproduct || "-"}</td>
                  <td class="num">${moneyNf.format(n(row.wppriceperunit))}</td>
                  <td class="num">${moneyNf.format(n(row.wptotalpay))}</td>
                  <td>${row.wpRspo || "-"}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td class="left">รวม</td>
                <td></td><td></td><td></td><td></td><td></td><td></td>
                <td class="num">${fmt(spcTotals.wpNetWeight)}</td>
                <td></td><td></td><td></td>
                <td class="num">${moneyNf.format(spcTotals.wptotalpay)}</td>
                <td>${fmt(spcTotals.count)} รายการ</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </section>`;
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
      <p>${filterContextLine()}</p>
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
    const scope = dataRecordScope(record);
    return date &&
      inRange(date) &&
      (yardScope() === "combined" || yardScope() === scope) &&
      recordMatchesGlobalFilters(record, movement);
  }).map((record) => ({
    record,
    movement: movementMap.get(Number(record._srcRow)),
    scope: dataRecordScope(record),
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
    const scope = dataRecordScope(row);
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

function dashboardAreaChart(rows) {
  const ordered = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const sample = ordered.length > 18
    ? ordered.filter((_, index) => index % Math.ceil(ordered.length / 18) === 0).slice(0, 18)
    : ordered;
  const points = sample.length ? sample : [{ date: "", totalRamp: 0, outboundTotal: 0, balance: 0, loss: 0 }];
  const width = 760;
  const height = 230;
  const pad = { left: 44, right: 18, top: 18, bottom: 34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const series = [
    { key: "totalRamp", label: "รับเข้า", className: "inbound", area: true },
    { key: "outboundTotal", label: "ส่งออก", className: "outbound", area: true },
    { key: "balance", label: "คงเหลือ", className: "balance" },
    { key: "loss", label: "สูญหาย", className: "loss-line" },
  ];
  const maxValue = Math.max(...points.flatMap((row) => series.map((item) => n(row[item.key]))), 1);
  const x = (index) => pad.left + (points.length === 1 ? chartW / 2 : (index / (points.length - 1)) * chartW);
  const y = (value) => pad.top + chartH - (n(value) / maxValue) * chartH;

  const smoothPath = (key) => {
    const coords = points.map((row, index) => [x(index), y(row[key])]);
    if (coords.length === 1) return `M${coords[0][0].toFixed(1)},${coords[0][1].toFixed(1)}`;
    return coords.reduce((path, point, index) => {
      if (!index) return `M${point[0].toFixed(1)},${point[1].toFixed(1)}`;
      const prev = coords[index - 1];
      const midX = (prev[0] + point[0]) / 2;
      const midY = (prev[1] + point[1]) / 2;
      return `${path} Q${prev[0].toFixed(1)},${prev[1].toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)}`;
    }, "") + ` T${coords.at(-1)[0].toFixed(1)},${coords.at(-1)[1].toFixed(1)}`;
  };

  const areaPath = (key) => {
    const top = smoothPath(key);
    return `${top} L${x(points.length - 1).toFixed(1)},${(pad.top + chartH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`;
  };
  const xLabels = points.map((row, index) => {
    if (points.length > 8 && index % Math.ceil(points.length / 6) !== 0 && index !== points.length - 1) return "";
    return `<text x="${x(index).toFixed(1)}" y="${height - 10}" text-anchor="middle">${displayDate(row.date).slice(0, 5)}</text>`;
  }).join("");
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const gy = pad.top + chartH - ratio * chartH;
    return `<line x1="${pad.left}" y1="${gy.toFixed(1)}" x2="${width - pad.right}" y2="${gy.toFixed(1)}"></line>
      <text x="8" y="${(gy + 4).toFixed(1)}">${fmt(maxValue * ratio)}</text>`;
  }).join("");
  return `
    <div class="gentelella-chart">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="กราฟเปรียบเทียบน้ำหนักรับเข้าและส่งออกตามวันที่">
        <g class="chart-grid">${grid}</g>
        ${series.filter((item) => item.area).map((item) => `<path class="area ${item.className}" d="${areaPath(item.key)}"></path>`).join("")}
        ${series.map((item) => `<path class="line ${item.className}" d="${smoothPath(item.key)}"></path>`).join("")}
        <g class="chart-axis">${xLabels}</g>
      </svg>
      <div class="chart-legend">
        ${series.map((item) => `<span><i class="${item.className}"></i>${item.label}</span>`).join("")}
      </div>
    </div>`;
}

function dashboardPerformanceBars(items, totalKey = "inbound") {
  const maxValue = Math.max(...items.map((item) => n(item[totalKey])), 1);
  if (!items.length) return '<p class="analytics-empty">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</p>';
  return items.map((item) => {
    const value = n(item[totalKey]);
    const width = Math.max(2, (value / maxValue) * 100);
    return `
      <div class="performance-row">
        <div><strong>${item.label}</strong><span>${fmt(value)} kg</span></div>
        <em><b style="width:${width}%"></b></em>
      </div>`;
  }).join("");
}

function dashboardStandardPie(rows, totalValue) {
  const cleanRows = rows.filter((row) => n(row.inbound) > 0);
  const total = n(totalValue) || cleanRows.reduce((sum, row) => sum + n(row.inbound), 0);
  if (!cleanRows.length || !total) return '<p class="analytics-empty">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</p>';
  const colors = ["#1abb9c", "#3498db", "#9b59b6", "#f39c12", "#e74c3c"];
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = cleanRows.map((row, index) => {
    const value = n(row.inbound);
    const dash = (value / total) * circumference;
    const segment = `<circle class="pie-segment" cx="60" cy="60" r="${radius}" stroke="${colors[index % colors.length]}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"></circle>`;
    offset += dash;
    return segment;
  }).join("");
  const legend = cleanRows.map((row, index) => {
    const share = total ? (n(row.inbound) / total) * 100 : 0;
    return `
      <div class="pie-legend-row">
        <span><i style="background:${colors[index % colors.length]}"></i>${row.label}</span>
        <strong>${share.toFixed(1)}%</strong>
      </div>`;
  }).join("");
  return `
    <div class="standard-pie">
      <svg viewBox="0 0 120 120" role="img" aria-label="กราฟวงกลมสัดส่วนมาตรฐานตามน้ำหนักรับเข้า">
        <circle class="pie-bg" cx="60" cy="60" r="${radius}"></circle>
        <g transform="rotate(-90 60 60)">${segments}</g>
        <text x="60" y="57" text-anchor="middle">${fmt(total)}</text>
        <text x="60" y="72" text-anchor="middle">kg</text>
      </svg>
      <div class="pie-legend">${legend}</div>
    </div>`;
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
  const comparisonTotals = [
    { label: "รับเข้ารวม", value: stats.inbound },
    { label: "ส่งออกรวม", value: stats.outbound },
    { label: "น้ำหนักโรงงาน", value: stats.factory },
    { label: "คงเหลือ", value: Math.max(0, stats.balance) },
    { label: "สูญหาย", value: Math.abs(stats.loss) },
  ];

  els.reportPage.innerHTML = `
    <div class="report-title">
      <h2>Dashboard วิเคราะห์เชิงลึก</h2>
      <p>ช่วง ${monthTitle(dateValue(els.startDate), dateValue(els.endDate))} | วิเคราะห์จากชีต data และการปรับยอด Clear Ramp ตามตัวกรองด้านบน</p>
      <p>${filterContextLine([`เปรียบเทียบ ${compareModeLabel(state.dashboardCompareMode)}`])}</p>
    </div>
    <div class="analytics-layout">
      <section class="analytics-card wide dashboard-network">
        <div class="section-head">
          <div>
            <h3>Network Activities</h3>
            <span>กราฟเปรียบเทียบ รับเข้า / ส่งออก ตามวันที่ที่เลือก</span>
          </div>
          <small>${displayDate(rows[0]?.date)} - ${displayDate(rows.at(-1)?.date)}</small>
        </div>
        <div class="network-grid">
          ${dashboardAreaChart(rows)}
          <aside class="performance-panel">
            <h4>เปรียบเทียบยอดรวม</h4>
            ${dashboardPerformanceBars(comparisonTotals, "value")}
          </aside>
        </div>
      </section>

      <section class="analytics-card compact">
        <div class="section-head">
          <h3>App Versions</h3>
          <span>เทียบตามลานเท</span>
        </div>
        <div class="bar-list slim">${barRows(yardRows.map((row) => ({
          label: row.label,
          sub: `ส่งออก ${fmt(row.stats.outbound)} | สูญหาย ${fmt(row.stats.loss)}`,
          value: row.stats.inbound,
        })), "value")}</div>
      </section>

      <section class="analytics-card compact">
        <div class="section-head">
          <h3>Device Usage</h3>
          <span>สัดส่วนมาตรฐาน</span>
        </div>
        ${simpleTable(["มาตรฐาน", "รับเข้า", "%"], standardRows.map((row) => `<tr><td class="left">${row.label}</td><td class="num">${fmt(row.inbound)}</td><td class="num">${pct(row.inbound, stats.inbound)}</td></tr>`))}
      </section>

      <section class="analytics-card compact">
        <div class="section-head">
          <h3>Quick Settings</h3>
          <span>ตัวชี้วัดควบคุม</span>
        </div>
        <div class="quick-metrics">
          ${metricTile("Loss Rate", `${stats.lossRate.toFixed(2)}%`, "สูญหาย / ส่งออก", stats.lossRate > 2 ? "danger" : "")}
          ${metricTile("Factory Diff", `${signed(stats.factoryDiff)} kg`, "โรงงาน - ส่งออก", stats.factoryDiff < 0 ? "danger" : "good")}
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

      <section class="analytics-card standard-pie-card">
        <div class="section-head">
          <h3>สัดส่วนตามมาตรฐาน</h3>
          <span>อ้างอิงตารางเทียบตามมาตรฐาน</span>
        </div>
        ${dashboardStandardPie(standardRows, stats.inbound)}
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

function tableText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tableTitle(table) {
  const section = table.closest("section, article");
  const sectionTitle = section?.querySelector(":scope > .table-headline h3, :scope > .section-head h3, :scope > .report-title h2, :scope > h3, :scope > h2");
  if (sectionTitle) return tableText(sectionTitle.textContent);
  const wrap = table.closest(".table-wrap") || table.parentElement;
  const previousToolbar = wrap?.previousElementSibling?.matches?.(".table-export-bar") ? wrap.previousElementSibling.previousElementSibling : wrap?.previousElementSibling;
  const nearTitle = previousToolbar?.querySelector?.(".table-headline h3, .section-head h3, h3, h2")
    || (previousToolbar?.matches?.(".table-headline, .section-head") ? previousToolbar.querySelector("h3, h2") : null);
  if (nearTitle) return tableText(nearTitle.textContent);
  const container = table.closest("section, article") || table.closest(".report-page, #clearPage") || table.parentElement;
  const localTitle = container?.querySelector(":scope > .table-headline h3, :scope > .section-head h3, :scope > .report-title h2, :scope > h3, :scope > h2");
  return tableText(localTitle?.textContent) || "ตารางข้อมูล";
}

function tablePeriodText() {
  const start = dateValue(els.startDate);
  const end = dateValue(els.endDate);
  const viewLabel = tableText(els.tabs?.querySelector(`button[data-view="${CSS.escape(state.view)}"] span`)?.textContent) || tableText(state.view);
  const yardLabel = els.yardFilter?.selectedOptions?.[0]?.textContent?.trim() || "ทั้งหมด";
  const dates = start || end ? `ช่วงวันที่ ${displayDate(start)} - ${displayDate(end)}` : "ไม่กำหนดช่วงวันที่";
  const filters = [`ลานเท ${yardLabel}`];
  if (state.dailyFilters?.standard && state.dailyFilters.standard !== "all") filters.push(`มาตรฐาน ${state.dailyFilters.standard}`);
  if (state.dailyFilters?.flow && state.dailyFilters.flow !== "all") filters.push(`รายการ ${state.dailyFilters.flow}`);
  if (state.view === "mill") filters.push(`กลุ่ม ${state.millCategories.join(", ")}`);
  if (state.view === "dashboard") filters.push(`เปรียบเทียบ ${compareModeLabel(state.dashboardCompareMode)}`);
  return `${viewLabel} · ${dates} · ${filters.join(" · ")}`;
}

function tableColumnSummary(table) {
  const headerRow = table.tHead?.rows?.[table.tHead.rows.length - 1];
  if (!headerRow) return "";
  const headers = [...headerRow.cells].map((cell) => tableText(cell.textContent)).filter(Boolean);
  return headers.length ? `หัวตาราง: ${headers.join(" | ")}` : "";
}

function tableSummary(table) {
  const foot = table.tFoot ? tableText(table.tFoot.textContent) : "";
  if (foot) return foot;
  const bodyRows = table.tBodies?.[0]?.rows?.length || 0;
  return `จำนวน ${fmt(bodyRows)} รายการ`;
}

function slugFileName(value) {
  return String(value || "table")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 90) || "table";
}

function tableExportHtml(table) {
  const clone = table.cloneNode(true);
  clone.querySelectorAll("[data-sort-index]").forEach((th) => {
    th.removeAttribute("data-sort-index");
    th.removeAttribute("aria-sort");
    th.classList.remove("sortable-th", "sorted-asc", "sorted-desc");
  });
  const title = tableTitle(table);
  const period = tablePeriodText();
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;color:#111827;margin:24px}
  h1{font-size:18px;margin:0 0 6px}
  .meta{font-size:12px;color:#4b5563;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #cbd5e1;padding:6px 7px;text-align:center;white-space:nowrap}
  th{background:#e8edf4;font-weight:800}
  td.left,th.left{text-align:left}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{background:#f8fafc;font-weight:800}
  @media print{body{margin:10mm} table{font-size:9px} th,td{padding:4px}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">${esc(period)}</div>
${clone.outerHTML}
</body></html>`;
}

function downloadTableExcel(table) {
  const title = tableTitle(table);
  const html = tableExportHtml(table);
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugFileName(title)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printTablePdf(table) {
  const title = tableTitle(table);
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return;
  win.document.open();
  win.document.write(tableExportHtml(table));
  win.document.close();
  win.document.title = title;
  win.focus();
  window.setTimeout(() => win.print(), 250);
}

function sortableValue(text) {
  const value = tableText(text);
  const date = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (date) return Number(`${date[3]}${date[2].padStart(2, "0")}${date[1].padStart(2, "0")}`);
  const numeric = value.replace(/,/g, "").replace(/%/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return Number(numeric);
  return value.toLocaleLowerCase("th-TH");
}

function sortTable(table, index, th) {
  const tbody = table.tBodies?.[0];
  if (!tbody) return;
  const current = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
  for (const header of table.querySelectorAll("th[aria-sort]")) {
    header.removeAttribute("aria-sort");
    header.classList.remove("sorted-asc", "sorted-desc");
  }
  th.setAttribute("aria-sort", current);
  th.classList.add(current === "ascending" ? "sorted-asc" : "sorted-desc");
  const factor = current === "ascending" ? 1 : -1;
  const rows = [...tbody.rows].map((row, position) => ({ row, position }));
  rows.sort((a, b) => {
    const av = sortableValue(a.row.cells[index]?.textContent || "");
    const bv = sortableValue(b.row.cells[index]?.textContent || "");
    if (typeof av === "number" && typeof bv === "number") return (av - bv || a.position - b.position) * factor;
    return (String(av).localeCompare(String(bv), "th-TH", { numeric: true }) || a.position - b.position) * factor;
  });
  for (const item of rows) tbody.appendChild(item.row);
}

function enhanceTables(root = document) {
  const tables = [...root.querySelectorAll("table")]
    .filter((table) => !table.closest(".stock-print, .print-preview-modal") && !table.dataset.noEnhance);
  tables.forEach((table, index) => {
    if (!table.dataset.enhancedTableId) {
      table.dataset.enhancedTableId = `tbl-${Date.now()}-${index}-${Math.round(Math.random() * 10000)}`;
    }
    const id = table.dataset.enhancedTableId;
    const wrap = table.closest(".table-wrap");
    const parent = wrap || table.parentElement;
    const anchor = wrap ? table : table;
    let toolbar = parent?.querySelector?.(`:scope > [data-table-toolbar="${CSS.escape(id)}"]`);
    if (!toolbar && parent) {
      toolbar = document.createElement("div");
      toolbar.className = "table-export-bar";
      toolbar.dataset.tableToolbar = id;
      parent.insertBefore(toolbar, anchor);
    }
    if (toolbar) {
      toolbar.className = "table-export-bar";
      toolbar.innerHTML = `
        <div>
          <strong>${esc(tableTitle(table))}</strong>
          <span>${esc(tableSummary(table))}</span>
        </div>
        <div class="table-export-actions">
          <button type="button" data-table-export="excel" data-table-id="${id}">Excel</button>
          <button type="button" data-table-export="pdf" data-table-id="${id}">PDF</button>
        </div>`;
    }
    const headerRow = table.tHead?.rows?.[table.tHead.rows.length - 1];
    if (!headerRow) return;
    [...headerRow.cells].forEach((th) => {
      if (th.colSpan > 1 || th.dataset.sortIndex) return;
      th.dataset.sortIndex = String(th.cellIndex);
      th.classList.add("sortable-th");
      th.title = "คลิกเพื่อเรียงข้อมูล";
    });
  });
}

function handleEnhancedTableClick(event) {
  const exportBtn = event.target.closest("[data-table-export]");
  if (exportBtn) {
    const table = document.querySelector(`[data-enhanced-table-id="${CSS.escape(exportBtn.dataset.tableId)}"]`);
    if (!table) return;
    if (exportBtn.dataset.tableExport === "excel") downloadTableExcel(table);
    if (exportBtn.dataset.tableExport === "pdf") printTablePdf(table);
    return;
  }
  const header = event.target.closest("th[data-sort-index]");
  if (!header || !header.closest("table")) return;
  sortTable(header.closest("table"), Number(header.dataset.sortIndex), header);
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
          <label>วันที่เริ่ม<input id="estPlanStart" ${dateInputAttrs()}></label>
          <label>วันที่สิ้นสุด<input id="estPlanEnd" ${dateInputAttrs()}></label>
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
              <td>${displayDate(plan.startDate)} - ${displayDate(plan.endDate)}</td>
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
          <label>วันที่สั่งงาน<input id="estOrderDate" ${dateInputAttrs()}></label>
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
              <td>${displayDate(order.orderDate)}</td>
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
          <label>วันที่ทำงาน<input id="estWorkDate" ${dateInputAttrs("", "required")}></label>
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
    date: dateValue(document.querySelector("#estWorkDate")) || isoDateFromUtc(new Date()),
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
    startDate: dateValue(document.querySelector("#estPlanStart")) || "",
    endDate: dateValue(document.querySelector("#estPlanEnd")) || "",
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
    const key = input.dataset.estMasterField;
    const field = (config.fields || []).find((item) => estMasterFieldKey(item) === key);
    row[key] = !Array.isArray(field) && field?.type === "date" ? dateValue(input) : input.value.trim();
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
    if (isAutoGeneratedIdField(input.dataset.folderMasterField)) continue;
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
    orderDate: dateValue(document.querySelector("#estOrderDate")) || "",
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
          <h2>ระบบบริหารงานสวนปาล์มคีรีรัฐ</h2>
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
  if (!Array.isArray(field) && field.type === "date") {
    return `
    <label>${esc(label)}
      <input data-est-master-field="${esc(key)}" ${dateInputAttrs(value)}>
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

function isAutoGeneratedIdField(key) {
  return ["id", "databaseId", "createdAt", "updatedAt", "created_at", "updated_at"].includes(String(key || ""));
}

function datasetKeyFromSnake(key) {
  return String(key).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function renderMasterFolderInput(column, table, edit) {
  const ref = (table.references || []).find((item) => item.field === column.key);
  const value = edit[column.key] ?? "";
  const required = isMasterFolderRequired(table, column);
  if (isAutoGeneratedIdField(column.key)) {
    const displayValue = value || "สร้างอัตโนมัติ";
    return `
      <label class="auto-id-field">${masterFolderFieldLabel(column, false)}
        <input data-folder-master-field="${esc(column.key)}" value="${esc(displayValue)}" disabled aria-disabled="true">
      </label>`;
  }
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
                <label class="auto-id-field">id อัตโนมัติ
                  <input value="${esc(edit.id || "สร้างอัตโนมัติ")}" disabled aria-disabled="true">
                </label>
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
            <label class="auto-id-field">id อัตโนมัติ
              <input value="${esc(edit.id || "สร้างอัตโนมัติ")}" disabled aria-disabled="true">
            </label>
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
  if (Array.isArray(module?.tables) && module.tables.length) {
    return module.tables
      .map((key) => FARM_TABLE_SCHEMAS[key] ? { key, ...FARM_TABLE_SCHEMAS[key] } : null)
      .filter(Boolean);
  }
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
  const databaseRows = Array.isArray(state.farmDbRows?.[tableId]) ? state.farmDbRows[tableId] : [];
  const baseRows = (databaseRows.length ? databaseRows : farmSeedRows(table))
    .map((row) => overrides.has(row.id) ? { ...row, ...overrides.get(row.id), id: row.id, readonly: false } : row)
    .filter((row) => !deleted.has(row.id));
  const baseIds = new Set(baseRows.map((row) => row.id));
  const customRows = state.farmRecords
    .filter((row) => row.tableId === tableId && !row._overrideOf && !row._deleted && !baseIds.has(row.id));
  const rows = [...baseRows, ...customRows];
  const cleanRows = farmCleanRows(tableId, rows);
  if (cleanRows) return cleanRows;
  if (tableId !== "blocks") return rows;
  const existingPlotIds = new Set(rows.map((row) => row.plot_id).filter(Boolean));
  const legacyPlots = farmRows(farmTableByKey("plots"))
    .filter((plot) => !existingPlotIds.has(plot.id) && [plot.area_rai, plot.planting_year, plot.tree_count, plot.rspo_status, plot.ap_code, plot.AP_code].some((value) => value !== undefined && value !== ""))
    .map((plot) => ({
      id: `legacy-block-${plot.id}`,
      tableId: "blocks",
      moduleId: "farm-area",
      readonly: true,
      createdAt: "legacy",
      updatedAt: "legacy",
      estate_id: plot.estate_id,
      zone_id: plot.zone_id,
      plot_id: plot.id,
      block_code: plot.block_code || plot.plot_code || plot.id,
      block_name: plot.block_name || plot.plot_name || "",
      ap_code: plot.ap_code || plot.AP_code || "",
      area_rai: plot.area_rai || "",
      planting_year: plot.planting_year || "",
      tree_count: plot.tree_count || "",
      rspo_status: plot.rspo_status || "",
      status: plot.status || "active",
    }));
  return [...rows, ...legacyPlots];
}

function farmRowsByKey(tableKey) {
  const schema = FARM_TABLE_SCHEMAS[tableKey];
  return schema ? farmRows({ key: tableKey, ...schema }) : [];
}

function mergeCleanRows(currentRows, derivedRows) {
  const map = new Map();
  for (const row of [...derivedRows, ...currentRows]) {
    const key = row.id || `${row.tableId}:${JSON.stringify(row)}`;
    map.set(key, { ...map.get(key), ...row });
  }
  return [...map.values()];
}

function mergeAreaRows(currentRows, derivedRows) {
  const map = new Map();
  for (const row of [...derivedRows, ...currentRows]) {
    const key = String(row.area_code || row.id || "").trim().toLowerCase();
    if (!key) continue;
    const previous = map.get(key) || {};
    map.set(key, {
      ...previous,
      ...row,
      id: previous.id || row.id,
      area_level: "block",
      area_name: row.area_name || row.area_code || previous.area_name || "",
      status: row.status || previous.status || "active",
    });
  }
  return [...map.values()].sort((a, b) => String(a.area_code || "").localeCompare(String(b.area_code || ""), "th", { numeric: true }));
}

function farmCleanRows(tableId, rows) {
  if (tableId === "areas") {
    const summaryBlocks = (state.summaryPalmoilAreas || []).map((row) => ({
      ...row,
      tableId: "areas",
      moduleId: "farm-area",
      readonly: true,
      area_level: "block",
      area_name: row.area_name || row.area_code || "",
      status: row.status || "active",
      _source: row._source || "Summary Palmoil.xlsx:Terrain",
    }));
    const blocks = summaryBlocks.length ? [] : farmRowsByKey("blocks").map((row) => ({
      id: `area-${row.id}`,
      tableId: "areas",
      moduleId: "farm-area",
      readonly: true,
      _source: row._source || "legacy-blocks",
      area_code: row.block_code || row.id,
      area_name: row.block_name || row.block_code || row.id,
      area_level: "block",
      estate_name: row.estate_name || "",
      zone_name: row.zone_name || "",
      plot_group_code: row.plot_group_code || "",
      parent_area_id: "",
      estate_id: row.estate_id || "",
      zone_id: row.zone_id || "",
      plot_id: row.plot_id || "",
      plot_group_id: row.plot_group_id || "",
      ap_code: row.ap_code || row.AP_code || "",
      area_rai: row.area_rai || "",
      planting_year: row.planting_year || "",
      tree_count: row.tree_count || "",
      rspo_status: row.rspo_status || "",
      status: row.status || "active",
    }));
    const summaryCodes = new Set(summaryBlocks.map((row) => String(row.area_code || "").trim().toLowerCase()).filter(Boolean));
    const blockRows = rows.filter((row) => {
      if (row.area_level && row.area_level !== "block") return false;
      if (!summaryCodes.size) return true;
      const code = String(row.area_code || "").trim().toLowerCase();
      return summaryCodes.has(code);
    });
    return mergeAreaRows(blockRows, [...summaryBlocks, ...blocks]);
  }
  if (tableId === "people") {
    const employees = farmRowsByKey("employees").map((row) => ({
      ...row,
      id: `person-${row.id}`,
      tableId: "people",
      moduleId: "farm-people",
      readonly: true,
      _source: row._source || "legacy-employees",
      person_code: row.employee_code || row.id,
      person_type: row.worker_type === "หัวหน้างาน" ? "supervisor" : row.worker_type === "คนขับ" ? "driver" : "employee",
      full_name: row.full_name || row.employee_code || row.id,
    }));
    const contractors = farmRowsByKey("contractors").map((row) => ({
      id: `person-${row.id}`,
      tableId: "people",
      moduleId: "farm-people",
      readonly: true,
      _source: row._source || "legacy-contractors",
      person_code: row.contractor_code || row.id,
      full_name: row.contractor_name || row.contractor_code || row.id,
      person_type: "contractor",
      nationality: row.nationality || "",
      payment_type: row.payment_type || "รายเหมา",
      default_activity_group_id: row.default_activity_group_id || "",
      contract_rate: row.default_contract_rate || "",
      phone: row.phone || "",
      effective_from: row.effective_from || "",
      effective_to: row.effective_to || "",
      version_no: row.version_no || "",
      is_current: row.is_current || "",
      previous_version_id: row.previous_version_id ? `person-${row.previous_version_id}` : "",
      status: row.status || "active",
    }));
    return mergeCleanRows(rows, [...employees, ...contractors]);
  }
  if (tableId === "person_housing_assignments") {
    return mergeCleanRows(rows, farmRowsByKey("employee_housing_assignments").map((row) => ({
      ...row,
      id: `person-house-${row.id}`,
      tableId,
      moduleId: "farm-people",
      readonly: true,
      person_id: row.employee_id ? `person-${row.employee_id}` : "",
    })));
  }
  if (tableId === "activity_wage_codes") {
    return mergeCleanRows(rows, farmRowsByKey("activity_wage_code_mappings").map((row) => ({
      ...row,
      id: `activity-wage-${row.id}`,
      tableId,
      moduleId: "farm-activities",
      readonly: true,
    })));
  }
  if (tableId === "activity_material_rates") {
    return mergeCleanRows(rows, farmRowsByKey("activity_material_usage_rates").map((row) => ({
      ...row,
      id: `activity-material-${row.id}`,
      tableId,
      moduleId: "farm-activities",
      readonly: true,
      item_id: row.material_id ? `item-${row.material_id}` : "",
    })));
  }
  if (tableId === "inventory_master") {
    const materials = farmRowsByKey("materials").map((row) => ({
      id: `item-${row.id}`,
      tableId,
      moduleId: "farm-inventory",
      readonly: true,
      _source: row._source || "legacy-materials",
      item_code: row.material_code || row.id,
      item_name: row.material_name || row.material_code || row.id,
      item_type: "material",
      category_name: row.category_id || row.category_name || "",
      unit_name: row.unit_id || row.unit_name || "",
      warehouse_id: row.default_warehouse_id || "",
      status: row.status || "active",
      note: row.note || "",
    }));
    const vehicles = farmRowsByKey("vehicles").map((row) => ({
      id: `item-${row.id}`,
      tableId,
      moduleId: "farm-inventory",
      readonly: true,
      _source: row._source || "legacy-vehicles",
      item_code: row.vehicle_code || row.id,
      item_name: row.vehicle_name || row.vehicle_code || row.id,
      item_type: row.vehicle_type || "vehicle",
      plate_no: row.plate_no || "",
      capacity: row.capacity || "",
      status: row.status || "active",
      note: row.note || "",
    }));
    return mergeCleanRows(rows, [...materials, ...vehicles]);
  }
  if (tableId === "work_plans") {
    const annual = farmRowsByKey("annual_work_plans").map((row) => ({
      id: `plan-${row.id}`,
      tableId,
      moduleId: "farm-work",
      readonly: true,
      plan_code: row.plan_code || row.work_plan_code || row.id,
      plan_name: row.plan_name || row.work_plan_name || row.id,
      plan_level: "annual",
      fiscal_year: row.fiscal_year || "",
      estate_id: row.estate_id ? `area-${row.estate_id}` : "",
      planned_start_date: row.start_date || row.planned_start_date || "",
      planned_end_date: row.end_date || row.planned_end_date || "",
      status: row.status || "planned",
    }));
    const items = farmRowsByKey("planned_work_items").map((row) => ({
      id: `plan-${row.id}`,
      tableId,
      moduleId: "farm-work",
      readonly: true,
      plan_code: row.item_code || row.plan_item_code || row.id,
      plan_name: row.item_name || row.work_item_name || row.note || row.id,
      plan_level: "task",
      parent_plan_id: row.annual_work_plan_id ? `plan-${row.annual_work_plan_id}` : "",
      block_id: row.block_id ? `area-${row.block_id}` : "",
      activity_id: row.activity_id || "",
      planned_start_date: row.planned_start_date || "",
      planned_end_date: row.planned_end_date || "",
      planned_quantity: row.planned_quantity || "",
      planned_unit: row.planned_unit || "",
      status: row.status || "planned",
    }));
    return mergeCleanRows(rows, [...annual, ...items]);
  }
  if (tableId === "plan_materials") {
    return mergeCleanRows(rows, farmRowsByKey("planned_work_materials").map((row) => ({
      ...row,
      id: `plan-material-${row.id}`,
      tableId,
      moduleId: "farm-work",
      readonly: true,
      plan_id: row.planned_work_item_id ? `plan-${row.planned_work_item_id}` : row.plan_id || "",
      item_id: row.material_id ? `item-${row.material_id}` : "",
      unit_name: row.unit_id || row.unit_name || "",
    })));
  }
  if (tableId === "work_order_resources") {
    const workers = farmRowsByKey("work_order_workers").map((row) => ({
      id: `wo-resource-${row.id}`,
      tableId,
      moduleId: "farm-work",
      readonly: true,
      work_order_id: row.work_order_id || "",
      resource_type: row.contractor_id ? "contractor" : "person",
      person_id: row.employee_id ? `person-${row.employee_id}` : row.contractor_id ? `person-${row.contractor_id}` : "",
      planned_quantity: row.planned_hours || row.planned_quantity || "",
      actual_quantity: row.actual_hours || row.actual_quantity || "",
      unit_name: row.unit_name || "ชม.",
      rate_snapshot: row.rate_snapshot || "",
      amount_snapshot: row.amount_snapshot || "",
      status: row.status || "active",
    }));
    const materials = farmRowsByKey("work_order_materials").map((row) => ({
      id: `wo-resource-${row.id}`,
      tableId,
      moduleId: "farm-work",
      readonly: true,
      work_order_id: row.work_order_id || "",
      resource_type: "material",
      item_id: row.material_id ? `item-${row.material_id}` : "",
      planned_quantity: row.planned_quantity || "",
      actual_quantity: row.actual_quantity || "",
      unit_name: row.unit_id || row.unit_name || "",
      status: row.status || "active",
    }));
    const machines = farmRowsByKey("work_order_machines").map((row) => ({
      id: `wo-resource-${row.id}`,
      tableId,
      moduleId: "farm-work",
      readonly: true,
      work_order_id: row.work_order_id || "",
      resource_type: row.resource_type || "equipment",
      item_id: row.vehicle_id ? `item-${row.vehicle_id}` : row.item_id || "",
      planned_quantity: row.planned_hours || row.planned_quantity || "",
      actual_quantity: row.actual_hours || row.actual_quantity || "",
      unit_name: row.unit_name || "ชม.",
      status: row.status || "active",
    }));
    return mergeCleanRows(rows, [...workers, ...materials, ...machines]);
  }
  if (tableId === "payroll_lines") {
    const base = farmRowsByKey("payroll_period_lines").map((row) => ({ ...row, id: `payline-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, person_id: row.employee_id ? `person-${row.employee_id}` : row.contractor_id ? `person-${row.contractor_id}` : row.person_id || "", line_type: row.line_type || "wage" }));
    const ot = farmRowsByKey("payroll_overtime_records").map((row) => ({ ...row, id: `payline-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, person_id: row.employee_id ? `person-${row.employee_id}` : row.person_id || "", line_type: "ot" }));
    const deductions = farmRowsByKey("payroll_deductions").map((row) => ({ ...row, id: `payline-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, person_id: row.employee_id ? `person-${row.employee_id}` : row.person_id || "", line_type: "deduction", rule_id: row.deduction_type_id ? `payrule-${row.deduction_type_id}` : "" }));
    const allowances = farmRowsByKey("payroll_allowances").map((row) => ({ ...row, id: `payline-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, person_id: row.employee_id ? `person-${row.employee_id}` : row.person_id || "", line_type: "allowance", rule_id: row.allowance_type_id ? `payrule-${row.allowance_type_id}` : "" }));
    return mergeCleanRows(rows, [...base, ...ot, ...deductions, ...allowances]);
  }
  if (tableId === "payroll_rules") {
    const rates = farmRowsByKey("payroll_rates").map((row) => ({ ...row, id: `payrule-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, rule_code: row.rate_code || row.id, rule_name: row.rate_name || row.id, rule_type: "rate" }));
    const ot = farmRowsByKey("overtime_rules").map((row) => ({ ...row, id: `payrule-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, rule_code: row.rule_code || row.id, rule_name: row.rule_name || row.id, rule_type: "overtime" }));
    const deductions = farmRowsByKey("deduction_types").map((row) => ({ ...row, id: `payrule-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, rule_code: row.deduction_code || row.id, rule_name: row.deduction_name || row.id, rule_type: "deduction" }));
    const allowances = farmRowsByKey("allowance_types").map((row) => ({ ...row, id: `payrule-${row.id}`, tableId, moduleId: "farm-payroll", readonly: true, rule_code: row.allowance_code || row.id, rule_name: row.allowance_name || row.id, rule_type: "allowance" }));
    return mergeCleanRows(rows, [...rates, ...ot, ...deductions, ...allowances]);
  }
  if (tableId === "access_scopes") {
    return mergeCleanRows(rows, farmRowsByKey("user_access_scopes").map((row) => ({
      ...row,
      id: `access-${row.id}`,
      tableId,
      moduleId: "farm-governance",
      readonly: true,
      area_id: row.block_id ? `area-${row.block_id}` : row.plot_id ? `area-${row.plot_id}` : row.zone_id ? `area-${row.zone_id}` : row.estate_id ? `area-${row.estate_id}` : "",
    })));
  }
  if (tableId === "approval_logs") {
    const approvals = farmRowsByKey("work_order_approvals").map((row) => ({
      id: `approval-${row.id}`,
      tableId,
      moduleId: "farm-governance",
      readonly: true,
      entity_table: "work_orders",
      entity_id: row.work_order_id || "",
      event_type: "approval",
      decision: row.decision || "",
      approval_level: row.approval_level || "",
      actor_profile_id: row.approver_profile_id || "",
      event_date: row.decided_at || "",
      status: row.status || "active",
    }));
    const statuses = farmRowsByKey("work_order_status_logs").map((row) => ({
      id: `approval-${row.id}`,
      tableId,
      moduleId: "farm-governance",
      readonly: true,
      entity_table: "work_orders",
      entity_id: row.work_order_id || "",
      event_type: "status_change",
      from_status: row.from_status || "",
      to_status: row.to_status || "",
      actor_profile_id: row.changed_by || "",
      event_date: row.changed_at || "",
      note: row.note || "",
      status: row.status || "active",
    }));
    return mergeCleanRows(rows, [...approvals, ...statuses]);
  }
  if (tableId === "master_versions") {
    return mergeCleanRows(rows, farmRowsByKey("master_record_versions").map((row) => ({ ...row, id: `master-version-${row.id}`, tableId, moduleId: "farm-governance", readonly: true })));
  }
  return null;
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

function farmVisibleFields(table, scope = "form") {
  return (table.fields || []).filter((field) => {
    if (Array.isArray(field)) return true;
    if (field.hidden === true) return false;
    if (Array.isArray(field.hiddenIn) && field.hiddenIn.includes(scope)) return false;
    return true;
  });
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
  if (isAutoGeneratedIdField(key)) {
    const displayValue = value || "สร้างอัตโนมัติ";
    return `
      <label class="auto-id-field">${esc(label)}
        <input data-farm-field="${esc(key)}" type="text" value="${esc(displayValue)}" disabled aria-disabled="true">
      </label>`;
  }
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
          ${FARM_STATUS_OPTIONS.filter((status) => status !== "all").map((status) => `<option value="${esc(status)}"${String(value || "active") === status ? " selected" : ""}>${esc(status)}</option>`).join("")}
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
  if (!Array.isArray(field) && field.type === "date") {
    return `
    <label>${esc(labelText)}
      <input data-farm-field="${esc(key)}" ${dateInputAttrs(value, required ? "required" : "")}>
    </label>`;
  }
  const type = !Array.isArray(field) && field.type === "number" ? "number" : "text";
  return `
    <label>${esc(labelText)}
      <input data-farm-field="${esc(key)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? "required" : ""}>
    </label>`;
}

function farmToday() {
  return new Date().toISOString().slice(0, 10);
}

function farmTableFieldByKey(table, key) {
  return (table?.fields || []).find((field) => farmFieldKey(field) === key);
}

function isFarmVersionedTable(tableKey) {
  return VERSIONED_FARM_TABLES.has(tableKey);
}

function farmBusinessKey(table, row) {
  return row?.[table.codeField] || row?.employee_code || row?.contractor_code || row?.rate_code || row?.id || "";
}

function applyFarmCalculatedFields(table, row) {
  for (const field of table.fields || []) {
    if (Array.isArray(field)) continue;
    const key = farmFieldKey(field);
    if ((row[key] === undefined || row[key] === "") && field.defaultValue !== undefined) row[key] = field.defaultValue;
  }
  if (table.key === "areas") {
    row.area_level = "block";
    if (!row.area_name) row.area_name = row.area_code || "";
    if (String(row.rspo_status || "").toUpperCase() === "YES") row.rspo_status = "RSPO";
    if (String(row.rspo_status || "").toUpperCase() === "NO") row.rspo_status = "Non-RSPO";
  }
  if (table.key === "people") {
    const daily = n(row.daily_wage);
    const hours = n(row.normal_hours_per_day);
    if (daily && hours) row.hourly_wage_rate = String(Math.round((daily / hours) * 100) / 100);
    if (!row.payment_type) row.payment_type = row.person_type === "contractor" ? "รายเหมา" : row.person_type === "admin" ? "รายเดือน" : "รายวัน";
    if (!row.nationality) row.nationality = "ไทย";
  }
  if (table.key === "employees") {
    const daily = n(row.daily_wage);
    const hours = n(row.normal_hours_per_day);
    if (daily && hours) row.hourly_wage_rate = String(Math.round((daily / hours) * 100) / 100);
    if (!row.payment_type) row.payment_type = row.worker_type === "พนักงาน" ? "รายเดือน" : "รายวัน";
    if (!row.nationality) row.nationality = "ไทย";
  }
  if (table.key === "contractors") {
    if (!row.payment_type) row.payment_type = "รายเหมา";
    if (!row.nationality) row.nationality = "ไทย";
  }
  if (isFarmVersionedTable(table.key)) {
    if (!row.effective_from) row.effective_from = farmToday();
    if (!row.version_no) row.version_no = "1";
    if (!row.is_current) row.is_current = "true";
  }
  if (table.key === "payroll_lines") {
    if (!row.calculated_at) row.calculated_at = farmToday();
    if (!row.is_locked) row.is_locked = "true";
    if (row.person_id && (!row.payee_snapshot_name || !row.master_version_id)) {
      const person = farmRows(farmTableByKey("people")).find((item) => item.id === row.person_id);
      if (person) {
        row.master_version_id = person.id;
        row.payee_snapshot_name = person.full_name || "";
        row.nationality_snapshot = person.nationality || "";
        row.payment_type_snapshot = person.payment_type || "";
        row.rate_snapshot = person.payment_type === "รายเดือน" ? (person.monthly_salary || "") : person.payment_type === "รายเหมา" ? (person.contract_rate || "") : (person.daily_wage || "");
        row.normal_hours_snapshot = person.normal_hours_per_day || "";
      }
    }
  }
  if (table.key === "payroll_period_lines") {
    if (!row.calculated_at) row.calculated_at = farmToday();
    if (!row.is_locked) row.is_locked = "true";
    if (row.employee_id && (!row.payee_snapshot_name || !row.master_version_id)) {
      const employee = farmRows({ key: "employees", ...FARM_TABLE_SCHEMAS.employees }).find((item) => item.id === row.employee_id);
      if (employee) {
        row.master_version_id = employee.id;
        row.payee_snapshot_name = employee.full_name || "";
        row.nationality_snapshot = employee.nationality || "";
        row.payment_type_snapshot = employee.payment_type || "";
        row.rate_snapshot = employee.payment_type === "รายเดือน" ? (employee.monthly_salary || "") : (employee.daily_wage || "");
        row.normal_hours_snapshot = employee.normal_hours_per_day || "";
      }
    }
    if (row.contractor_id && (!row.payee_snapshot_name || !row.master_version_id)) {
      const contractor = farmRows({ key: "contractors", ...FARM_TABLE_SCHEMAS.contractors }).find((item) => item.id === row.contractor_id);
      if (contractor) {
        row.master_version_id = contractor.id;
        row.payee_snapshot_name = contractor.contractor_name || "";
        row.nationality_snapshot = contractor.nationality || "";
        row.payment_type_snapshot = contractor.payment_type || "รายเหมา";
        row.rate_snapshot = contractor.default_contract_rate || "";
      }
    }
  }
}

function appendFarmVersionLog(table, original, nextRow) {
  if (!original || !isFarmVersionedTable(table.key)) return;
  const now = new Date().toISOString();
  state.farmRecords.push({
    id: `farm-master-version-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    moduleId: "farm-governance",
    tableId: "master_versions",
    entity_table: table.key,
    entity_id: nextRow.id,
    business_key: farmBusinessKey(table, nextRow),
    previous_entity_id: original.id,
    version_no: nextRow.version_no,
    effective_from: nextRow.effective_from,
    effective_to: nextRow.effective_to || "",
    locked_target: table.key === "payroll_rates" || table.key === "payroll_rules" ? "payroll_lines.rate_snapshot" : "payroll_lines.master_version_id",
    change_note: "สร้าง version ใหม่เพื่อไม่ให้ค่าแรงที่คำนวณแล้วเปลี่ยนย้อนหลัง",
    changed_at: now.slice(0, 10),
    status: "active",
    updatedAt: now,
  });
}

async function saveFarmRow() {
  const module = selectedFarmModule();
  const table = selectedFarmTable(module);
  const editId = state.farmEditId;
  const original = editId ? farmRows(table).find((row) => row.id === editId) : null;
  const shouldVersion = original && isFarmVersionedTable(table.key);
  const row = {
    id: shouldVersion
      ? `farm-${table.key}-v${Date.now()}-${Math.random().toString(16).slice(2)}`
      : (original?.readonly ? `override-${editId}` : (editId || `farm-${table.key}-${Date.now()}-${Math.random().toString(16).slice(2)}`)),
    moduleId: module.id,
    tableId: table.key,
    updatedAt: new Date().toISOString(),
  };
  if (original?.readonly && !shouldVersion) row._overrideOf = original.id;
  for (const input of els.reportPage.querySelectorAll("[data-farm-field]")) {
    const key = input.dataset.farmField;
    if (isAutoGeneratedIdField(key)) continue;
    const field = farmTableFieldByKey(table, key);
    row[key] = !Array.isArray(field) && field?.type === "date" ? dateValue(input) : input.value.trim();
  }
  if (shouldVersion) {
    row.previous_version_id = original.id;
    row.version_no = String(n(original.version_no || 1) + 1);
    row.is_current = "true";
    row.effective_to = "";
  }
  applyFarmCalculatedFields(table, row);
  if (!row.status) row.status = "active";
  state.farmRecords = state.farmRecords.filter((item) => !(item.tableId === table.key && (item.id === row.id || item._overrideOf === row._overrideOf || item.id === editId || (shouldVersion && item._overrideOf === editId))));
  if (shouldVersion) {
    const priorRow = {
      ...original,
      id: original.readonly ? `override-${original.id}` : original.id,
      moduleId: module.id,
      tableId: table.key,
      _overrideOf: original.readonly ? original.id : original._overrideOf,
      effective_to: row.effective_from || farmToday(),
      is_current: "false",
      status: "inactive",
      updatedAt: new Date().toISOString(),
    };
    if (!priorRow._overrideOf) delete priorRow._overrideOf;
    state.farmRecords.push(priorRow);
  }
  state.farmRecords.push(row);
  appendFarmVersionLog(table, original, row);
  state.farmEditId = "";
  state.farmDetailId = row.id;
  saveFarmRecords();
  state.farmSyncBusy = true;
  state.farmSyncStatus = "";
  state.farmSyncMessage = "กำลังบันทึกฐานข้อมูล...";
  render();
  try {
    const saved = await persistFarmRowToDatabase(table, row);
    state.farmRecords = state.farmRecords.filter((item) => !(item.tableId === table.key && (item.id === row.id || item._overrideOf === row._overrideOf || item.id === editId)));
    const savedId = saved.row?.id || row.id;
    state.farmDetailId = savedId;
    saveFarmRecords();
    state.farmSyncStatus = saved.mode === "farm-master-fallback" ? "warning" : "success";
    state.farmSyncMessage = saved.warning
      ? `บันทึกแล้วใน fallback: ${saved.warning}`
      : "บันทึกฐานข้อมูลแล้ว";
    await loadFarmTablesFromDatabase({ silent: false });
  } catch (error) {
    state.farmSyncStatus = "error";
    state.farmSyncMessage = `บันทึกไม่สำเร็จ: ${error.message}`;
  } finally {
    state.farmSyncBusy = false;
    render();
  }
}

function editFarmRow(id) {
  state.farmEditId = id;
  state.farmDetailId = id;
  render();
}

async function setFarmInactive(id) {
  const module = selectedFarmModule();
  const table = selectedFarmTable(module);
  const row = farmRows(table).find((item) => item.id === id);
  if (!row) return;
  const nextRow = { ...row, status: "inactive", updatedAt: new Date().toISOString() };
  if (row.readonly) {
    state.farmRecords.push({ ...nextRow, id: `override-${id}`, moduleId: module.id, tableId: table.key, _overrideOf: id });
  } else {
    const current = state.farmRecords.find((item) => item.id === id);
    if (current) current.status = "inactive";
  }
  state.farmDetailId = "";
  state.farmEditId = "";
  saveFarmRecords();
  state.farmSyncBusy = true;
  state.farmSyncStatus = "";
  state.farmSyncMessage = "กำลังบันทึกสถานะ inactive...";
  render();
  try {
    const saved = await persistFarmRowToDatabase(table, nextRow);
    state.farmSyncStatus = saved.mode === "farm-master-fallback" ? "warning" : "success";
    state.farmSyncMessage = saved.warning
      ? `บันทึกแล้วใน fallback: ${saved.warning}`
      : "บันทึกสถานะแล้ว";
    await loadFarmTablesFromDatabase({ silent: false });
  } catch (error) {
    state.farmSyncStatus = "error";
    state.farmSyncMessage = `บันทึกไม่สำเร็จ: ${error.message}`;
  } finally {
    state.farmSyncBusy = false;
    render();
  }
}

function exportFarmCsv() {
  const module = selectedFarmModule();
  const table = selectedFarmTable(module);
  const rows = filteredFarmRows(table);
  const headers = ["id", ...farmVisibleFields(table, "export").map(farmFieldKey)];
  const csv = [headers.join(",")].concat(rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${table.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseFarmCsv(text) {
  const clean = String(text || "").replace(/^\ufeff/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim() !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((value) => String(value || "").trim());
  return rows.slice(1)
    .filter((values) => values.some((value) => String(value).trim() !== ""))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function farmImportFieldMap(table) {
  const map = new Map([["id", "id"]]);
  for (const field of table.fields || []) {
    const key = farmFieldKey(field);
    map.set(key, key);
    map.set(key.toLowerCase(), key);
    if (!Array.isArray(field) && field.label) {
      map.set(field.label, key);
      map.set(String(field.label).toLowerCase(), key);
    }
  }
  return map;
}

function farmExistingRowForImport(table, raw) {
  const rows = farmRows(table);
  const id = String(raw.id || "").trim();
  if (id) {
    const matched = rows.find((row) => String(row.id || "") === id || String(row._overrideOf || "") === id);
    if (matched) return matched;
  }
  const keys = [table.codeField, table.labelField, table.primaryKey].filter(Boolean);
  for (const key of keys) {
    const value = String(raw[key] || "").trim();
    if (!value) continue;
    const matched = rows.find((row) => String(row[key] || "").trim() === value);
    if (matched) return matched;
  }
  return null;
}

function normalizeFarmImportRow(table, raw, index) {
  const fieldMap = farmImportFieldMap(table);
  const mapped = {};
  for (const [header, value] of Object.entries(raw || {})) {
    const headerText = String(header || "").trim();
    const key = fieldMap.get(headerText) || fieldMap.get(headerText.toLowerCase());
    if (!key || isAutoGeneratedIdField(key)) continue;
    mapped[key] = String(value ?? "").trim();
  }
  if (String(raw.id || "").trim()) mapped.id = String(raw.id).trim();
  const existing = farmExistingRowForImport(table, mapped);
  const row = {
    ...(existing || {}),
    ...mapped,
    id: existing?.id || mapped.id || `farm-${table.key}-import-${Date.now()}-${index}`,
    moduleId: table.moduleId || selectedFarmModule().id,
    tableId: table.key,
    updatedAt: new Date().toISOString(),
  };
  applyFarmCalculatedFields(table, row);
  if (!row.status) row.status = "active";
  return row;
}

async function importFarmCsvToDatabase(file) {
  const module = selectedFarmModule();
  const table = selectedFarmTable(module);
  if (!file) return;
  if (!/\.csv$/i.test(file.name || "")) {
    state.farmSyncStatus = "error";
    state.farmSyncMessage = "Update รองรับไฟล์ CSV ที่ export จากระบบแล้วเปิดแก้ใน Excel จากนั้น Save As CSV";
    render();
    return;
  }
  state.farmSyncBusy = true;
  state.farmSyncStatus = "";
  state.farmSyncMessage = `กำลังอ่านไฟล์ ${file.name}...`;
  render();
  try {
    const imported = parseFarmCsv(await file.text());
    if (!imported.length) throw new Error("ไม่พบข้อมูลในไฟล์");
    const rows = imported.map((raw, index) => normalizeFarmImportRow(table, raw, index + 1));
    let savedCount = 0;
    let warningCount = 0;
    for (const row of rows) {
      const saved = await persistFarmRowToDatabase(table, row);
      if (saved.warning) warningCount += 1;
      const savedRow = saved.row || row;
      state.farmRecords = state.farmRecords.filter((item) => !(item.tableId === table.key && (item.id === row.id || item.id === savedRow.id)));
      state.farmRecords.push({ ...savedRow, moduleId: table.moduleId || module.id, tableId: table.key, updatedAt: new Date().toISOString() });
      savedCount += 1;
      if (savedCount % 25 === 0) {
        state.farmSyncMessage = `กำลัง update ${table.key} ${fmt(savedCount)}/${fmt(rows.length)} rows...`;
        render();
      }
    }
    saveFarmRecords();
    state.farmEditId = "";
    state.farmDetailId = rows[0]?.id || "";
    state.farmSyncStatus = warningCount ? "warning" : "success";
    state.farmSyncMessage = warningCount
      ? `Update แล้ว ${fmt(savedCount)} rows แต่มี fallback ${fmt(warningCount)} rows`
      : `Update ฐานข้อมูลแล้ว ${fmt(savedCount)} rows`;
    await loadFarmTablesFromDatabase({ silent: false });
  } catch (error) {
    state.farmSyncStatus = "error";
    state.farmSyncMessage = `Update ไม่สำเร็จ: ${error.message}`;
  } finally {
    state.farmSyncBusy = false;
    render();
  }
}

function renderFarmWorkflowNav(module) {
  return `
    <section class="farm-flow-nav">
      ${FARM_WORKFLOW_STAGES.map((stage) => {
        const active = stage.views.includes(module.id);
        const targetView = stage.views[0] || module.id;
        return `
          <button class="farm-flow-step${active ? " active" : ""}" type="button" data-view="${esc(targetView)}">
            <b>${esc(stage.no)}</b>
            <strong>${esc(stage.title)}</strong>
            <span>${esc(stage.note)}</span>
            <small>${esc(stage.role)}</small>
          </button>`;
      }).join("")}
    </section>`;
}

function renderFarmGovernanceBoard(table) {
  const cards = [
    { table: "profiles", no: "1", title: "ผู้ใช้และบทบาท", detail: "ผูกผู้ใช้กับพนักงานและ Role ก่อนเปิดสิทธิ์" },
    { table: "permissions", no: "2", title: "สิทธิ์ตามงาน", detail: "กำหนด module/action เช่น read, create, update, approve" },
    { table: "role_permissions", no: "3", title: "Role Permission", detail: "ระบุว่าแต่ละ Role ทำอะไรได้บ้าง" },
    { table: "access_scopes", no: "4", title: "ขอบเขตพื้นที่", detail: "จำกัด Estate, Zone, Plot ตามหน้าที่รับผิดชอบ" },
    { table: "approval_logs", no: "5", title: "อนุมัติ / ประวัติสถานะ", detail: "รวมลำดับอนุมัติและประวัติสถานะของใบสั่งงาน" },
    { table: "master_versions", no: "6", title: "Version Lock", detail: "ตรวจ version ของข้อมูลหลักที่ใช้ล็อกผลค่าแรง" },
  ];
  return `
    <section class="farm-approval-board">
      <div class="section-head">
        <h3>เส้นทางควบคุมสิทธิ์และอนุมัติ</h3>
        <span>เลือกขั้นตอนเพื่อเปิดตารางที่ต้องดูหรือแก้ไข</span>
      </div>
      <div class="farm-approval-grid">
        ${cards.map((card) => `
          <button class="farm-approval-card${table.key === card.table ? " active" : ""}" type="button" data-farm-open-table="${esc(card.table)}">
            <b>${esc(card.no)}</b>
            <strong>${esc(card.title)}</strong>
            <span>${esc(card.detail)}</span>
            <small>${esc(card.table)}</small>
          </button>`).join("")}
      </div>
    </section>`;
}

function renderFarmVersionNotice(module, table) {
  if (!["farm-people", "farm-payroll", "farm-governance"].includes(module.id)) return "";
  const active = isFarmVersionedTable(table.key) || table.key === "payroll_lines" || table.key === "master_versions";
  return `
    <section class="farm-version-notice${active ? " active" : ""}">
      <div>
        <strong>Version Control สำหรับข้อมูลที่มีผลต่อค่าแรง</strong>
        <span>เมื่อแก้พนักงาน ผู้รับเหมา หรือเรทค่าแรง ระบบจะสร้าง version ใหม่และปิด version เก่า ไม่เขียนทับข้อมูลเดิม</span>
      </div>
      <div>
        <strong>Payroll Snapshot Lock</strong>
        <span>รายการค่าแรงเก็บชื่อ สัญชาติ ประเภทการจ่าย อัตรา ชั่วโมง และ master_version_id ณ วันคำนวณ เพื่อไม่เปลี่ยนย้อนหลัง</span>
      </div>
    </section>`;
}

function farmTableByKey(tableKey) {
  const schema = FARM_TABLE_SCHEMAS[tableKey];
  return schema ? { key: tableKey, ...schema } : null;
}

function farmLookup(tableKey, id) {
  const table = farmTableByKey(tableKey);
  if (!table || !id) return null;
  return farmRows(table).find((row) => row.id === id) || null;
}

function farmLookupLabel(tableKey, id) {
  const table = farmTableByKey(tableKey);
  const row = table ? farmLookup(tableKey, id) : null;
  return row ? farmRecordLabel(table, row) : (id || "-");
}

function farmDisplayValue(field, row) {
  const key = farmFieldKey(field);
  const value = row?.[key];
  const references = farmFieldReferences(field);
  if (references) return farmLookupLabel(references, value);
  if (value === undefined || value === null || value === "") return "";
  return value;
}

function farmWorkStatusMeta(order) {
  const status = String(order.status || "planned");
  const approval = String(order.approval_status || "");
  const isRescheduled = !!order.rescheduled_date || (!!order.original_scheduled_date && order.original_scheduled_date !== order.scheduled_date);
  if (approval === "pending" || status === "pending_approval") return { key: "pending_approval", label: "รออนุมัติ", color: "#f59e0b", tone: "warning" };
  if (approval === "rejected" || status === "rejected") return { key: "rejected", label: "ไม่อนุมัติ", color: "#ef4444", tone: "danger" };
  if (status === "closed") return { key: "closed", label: "ปิดงาน", color: "#0f172a", tone: "done" };
  if (status === "completed") return { key: "completed", label: "ทำเสร็จ", color: "#16a34a", tone: "done" };
  if (status === "in_progress") return { key: "in_progress", label: "กำลังทำ", color: "#2563eb", tone: "active" };
  if (isRescheduled || status === "rescheduled") return { key: "rescheduled", label: "เลื่อนวัน", color: "#a855f7", tone: "shift" };
  if (status === "sent_to_mobile") return { key: "sent_to_mobile", label: "ส่งเข้ามือถือ", color: "#06b6d4", tone: "active" };
  if (approval === "approved" || status === "approved") return { key: "approved", label: "อนุมัติแล้ว", color: "#22c55e", tone: "done" };
  if (status === "scheduled" || status === "planned") return { key: status, label: status === "scheduled" ? "กำหนดการ" : "แผนงาน", color: "#64748b", tone: "neutral" };
  return { key: status, label: status || "ไม่ระบุ", color: "#64748b", tone: "neutral" };
}

function farmDateMs(value) {
  const iso = isoDay(value);
  return iso ? new Date(`${iso}T00:00:00`).getTime() : 0;
}

function farmAddDays(iso, days) {
  const base = farmDateMs(iso);
  if (!base) return "";
  return isoDateFromUtc(new Date(base + days * 86400000));
}

function farmDaysBetween(startIso, endIso) {
  const start = farmDateMs(startIso);
  const end = farmDateMs(endIso);
  if (!start || !end) return 0;
  return Math.round((end - start) / 86400000);
}

function farmWorkOrders() {
  const orders = farmRows(farmTableByKey("work_orders"));
  const blocks = farmRows(farmTableByKey("blocks"));
  const results = farmRows(farmTableByKey("work_results"));
  return orders.map((order) => {
    const block = farmLookup("blocks", order.block_id) || blocks.find((item) => item.plot_id === order.plot_id) || null;
    const plot = farmLookup("plots", order.plot_id || block?.plot_id);
    const zone = farmLookup("zones", block?.zone_id || plot?.zone_id);
    const activity = farmLookup("activities", order.activity_id);
    const group = farmLookup("activity_groups", activity?.activity_group_id);
    const team = farmLookup("teams", order.team_id);
    const plotGroup = farmLookup("plot_groups", order.plot_group_id || plot?.plot_group_id);
    const startDate = isoDay(order.planned_start_date || order.scheduled_date || order.original_scheduled_date);
    const endDate = isoDay(order.planned_end_date || order.rescheduled_date || order.scheduled_date || startDate);
    const orderResults = results.filter((row) => row.work_order_id === order.id);
    const resultDates = orderResults.map((row) => isoDay(row.result_date)).filter(Boolean).sort();
    const closedDate = isoDay(order.closed_at);
    const actualFallback = (["completed", "closed"].includes(String(order.status || "")) && (closedDate || isoDay(order.rescheduled_date || order.scheduled_date || order.planned_end_date || startDate))) || "";
    const actualStartDate = resultDates[0] || actualFallback;
    const actualEndDate = resultDates.at(-1) || closedDate || actualStartDate;
    return {
      ...order,
      startDate,
      endDate,
      actualStartDate,
      actualEndDate,
      actualResultCount: orderResults.length,
      actualQuantity: orderResults.reduce((sum, row) => sum + n(row.actual_quantity), 0),
      plot,
      block,
      zone,
      activity,
      activityGroup: group,
      team,
      plotGroup,
      statusMeta: farmWorkStatusMeta(order),
    };
  }).sort((a, b) => farmDateMs(a.startDate) - farmDateMs(b.startDate));
}

function farmWorkFilterOptions(rows, key, labelFallback = "ไม่ระบุ") {
  const map = new Map();
  rows.forEach((row) => {
    const item = row[key];
    if (item?.id) map.set(item.id, farmRecordLabel(farmTableByKey(key === "activityGroup" ? "activity_groups" : key === "plotGroup" ? "plot_groups" : `${key}s`) || { codeField: "id", labelField: "name" }, item));
    else if (row[`${key}_id`]) map.set(row[`${key}_id`], row[`${key}_id`]);
  });
  return Array.from(map, ([value, label]) => ({ value, label: label || labelFallback }));
}

function filteredFarmWorkOrders() {
  const f = state.farmWorkFilters;
  const query = f.query.trim().toLowerCase();
  return farmWorkOrders().filter((row) => {
    const statusKey = row.statusMeta.key;
    const text = [row.work_order_no, row.work_order_title, row.plot?.plot_code, row.plot?.plot_name, row.block?.block_code, row.block?.block_name, row.block?.ap_code || row.block?.AP_code, row.activity?.activity_name, row.team?.team_name, row.zone?.zone_name, row.plotGroup?.group_name, row.reschedule_reason].join(" ").toLowerCase();
    return (f.activityGroup === "all" || row.activityGroup?.id === f.activityGroup)
      && (f.team === "all" || row.team?.id === f.team)
      && (f.zone === "all" || row.zone?.id === f.zone)
      && (f.plotGroup === "all" || row.plotGroup?.id === f.plotGroup)
      && (f.status === "all" || statusKey === f.status || row.status === f.status)
      && (!query || text.includes(query));
  });
}

function renderFarmWorkSelect(id, label, options, value) {
  return `
    <label>${esc(label)}
      <select id="${esc(id)}">
        <option value="all">ทั้งหมด</option>
        ${options.map((option) => `<option value="${esc(option.value)}"${value === option.value ? " selected" : ""}>${esc(option.label)}</option>`).join("")}
      </select>
    </label>`;
}

function farmWorkProgress(order) {
  const status = order?.statusMeta?.key || order?.status || "planned";
  const map = {
    planned: 10,
    scheduled: 18,
    pending_approval: 32,
    approved: 45,
    sent_to_mobile: 58,
    rescheduled: 52,
    in_progress: 72,
    completed: 92,
    closed: 100,
    rejected: 0,
  };
  return map[status] ?? 20;
}

function farmWorkMonthBands(days) {
  const bands = [];
  for (const day of days) {
    const key = day.slice(0, 7);
    const current = bands.at(-1);
    if (current?.key === key) current.days += 1;
    else bands.push({ key, label: `${thaiMonthName(day.slice(5, 7))} ${Number(day.slice(0, 4)) + 543}`, days: 1 });
  }
  return bands;
}

function farmWorkGroupKey(row) {
  return [
    row.activityGroup?.group_name || row.activityGroup?.group_code || "ไม่ระบุกลุ่มกิจกรรม",
    row.plotGroup?.group_name || row.plotGroup?.group_code || "ไม่ระบุกลุ่มแปลง",
  ].join(" / ");
}

function renderFarmPlannerOptionRows(tableKey, rows, titleField, subFields = []) {
  const table = farmTableByKey(tableKey);
  return rows.map((row, index) => {
    const title = row[titleField] || farmRecordLabel(table, row);
    const sub = subFields.map((key) => row[key]).filter(Boolean).join(" · ");
    return `
      <label class="farm-planner-tree-row">
        <input type="checkbox" ${index < 2 ? "checked" : ""}>
        <span>
          <strong>${esc(title)}</strong>
          <small>${esc(sub || row.id)}</small>
        </span>
      </label>`;
  }).join("");
}

function renderFarmPlannerQuickList(tableKey, rows, titleField, subFields = [], max = 5) {
  const table = farmTableByKey(tableKey);
  return rows.slice(0, max).map((row, index) => {
    const title = row[titleField] || farmRecordLabel(table, row);
    const sub = subFields.map((key) => row[key]).filter(Boolean).join(" · ");
    return `
      <label class="farm-plan-line">
        <input type="checkbox" ${index < 2 ? "checked" : ""}>
        <span><strong>${esc(title)}</strong><small>${esc(sub || row.id)}</small></span>
      </label>`;
  }).join("");
}

function renderFarmWorkPlanner() {
  const plots = farmRows(farmTableByKey("plots"));
  const blocks = farmRows(farmTableByKey("blocks"));
  const plotGroups = farmRows(farmTableByKey("plot_groups"));
  const zones = farmRows(farmTableByKey("zones"));
  const activityGroups = farmRows(farmTableByKey("activity_groups"));
  const activities = farmRows(farmTableByKey("activities"));
  const teams = farmRows(farmTableByKey("teams"));
  const teamMembers = farmRows(farmTableByKey("team_members"));
  const employees = farmRows(farmTableByKey("employees"));
  const materials = farmRows(farmTableByKey("materials"));
  const vehicles = farmRows(farmTableByKey("vehicles"));
  const usageRates = farmRows(farmTableByKey("activity_material_usage_rates"));
  const budgetRates = farmRows(farmTableByKey("budget_rates"));
  const workOrders = farmWorkOrders().slice().sort((a, b) => farmDateMs(b.startDate) - farmDateMs(a.startDate));
  const previewActivity = activities[0];
  const previewGroup = activityGroups.find((item) => item.id === previewActivity?.activity_group_id) || activityGroups[0];
  const previewTeam = teams[0];
  const previewMembers = teamMembers.filter((item) => item.team_id === previewTeam?.id).slice(0, 8);
  const selectedBlocks = blocks.slice(0, Math.min(2, blocks.length));
  const totalRai = selectedBlocks.reduce((sum, row) => sum + n(row.area_rai), 0);
  const totalTrees = selectedBlocks.reduce((sum, row) => sum + n(row.tree_count), 0);
  const selectedBudgetRate = budgetRates.find((row) => row.activity_id === previewActivity?.id) || budgetRates[0] || {};
  const laborBudgetRate = budgetRates.find((row) => row.activity_id === previewActivity?.id && row.rate_type === "labor")
    || budgetRates.find((row) => row.rate_type === "labor")
    || selectedBudgetRate;
  const materialBudgetRate = budgetRates.find((row) => row.activity_id === previewActivity?.id && row.rate_type === "material")
    || budgetRates.find((row) => row.rate_type === "material")
    || {};
  const selectedMaterials = materials.slice(0, Math.min(3, materials.length));
  const selectedVehicles = vehicles.slice(0, Math.min(3, vehicles.length));
  const selectedUsageRate = usageRates.find((row) => row.activity_id === previewActivity?.id) || usageRates[0] || {};
  const selectedMaterial = materials.find((row) => row.id === (selectedUsageRate.material_id || materialBudgetRate.material_id || selectedBudgetRate.material_id)) || materials[0] || {};
  const calculationBase = selectedUsageRate.usage_basis === "per_tree" ? totalTrees : selectedUsageRate.usage_basis === "per_rai" ? totalRai : selectedBlocks.length;
  const materialQuantity = calculationBase * n(selectedUsageRate.usage_rate || 0);
  const laborRate = n(laborBudgetRate.rate_amount || 0);
  const materialRate = n(materialBudgetRate.rate_amount || 0);
  const laborCost = totalRai * laborRate;
  const materialCost = materialQuantity * materialRate;
  const totalCost = laborCost + materialCost;
  const materialOptions = (selectedId = "") => materials.map((row) => `<option value="${esc(row.id || "")}"${row.id === selectedId ? " selected" : ""}>${esc(row.material_name || row.material_code || "")}</option>`).join("");
  const vehicleOptions = (selectedId = "") => vehicles.map((row) => `<option value="${esc(row.id || "")}"${row.id === selectedId ? " selected" : ""}>${esc(row.vehicle_name || row.vehicle_code || "")}</option>`).join("");
  const materialResourceRows = (selectedMaterials.length ? selectedMaterials : [{}]).map((row, index) => `
    <div class="farm-plan-resource-row">
      <label>วัสดุ ${fmt(index + 1)}
        <select>${materialOptions(row.id) || `<option>ยังไม่มีวัสดุ</option>`}</select>
      </label>
      <label>ปริมาณแผน
        <input type="number" min="0" value="${index === 0 ? moneyNf.format(materialQuantity).replace(/,/g, "") : ""}" placeholder="0">
      </label>
    </div>`).join("");
  const vehicleResourceRows = (selectedVehicles.length ? selectedVehicles : [{}]).map((row, index) => `
    <div class="farm-plan-resource-row">
      <label>รถ/เครื่องจักร ${fmt(index + 1)}
        <select>${vehicleOptions(row.id) || `<option>ยังไม่มีรถ/เครื่องจักร</option>`}</select>
      </label>
      <label>ชั่วโมงแผน
        <input type="number" min="0" value="${index === 0 ? "8" : ""}" placeholder="0">
      </label>
    </div>`).join("");
  const plotCountText = `${fmt(selectedBlocks.length)} จาก ${fmt(blocks.length)} Block`;
  const zoneOptions = zones.map((row) => `<option>${esc(row.zone_name || row.zone_code || "")}</option>`).join("");
  const plotGroupOptions = plotGroups.map((row) => `<option>${esc(row.group_name || row.group_code || "")}</option>`).join("");
  const areaGroups = zones.map((zone) => {
    const zoneBlocks = blocks.filter((block) => block.zone_id === zone.id).slice(0, 8);
    return `
      <div class="farm-plan-area-group">
        <strong>${esc(zone.zone_name || zone.zone_code || "ไม่ระบุโซน")} <em>${fmt(zoneBlocks.length)}</em></strong>
        ${zoneBlocks.map((block, index) => {
          const plot = plots.find((row) => row.id === block.plot_id) || {};
          return `
          <label class="farm-plan-area-row">
            <input type="checkbox" ${index < 2 ? "checked" : ""}>
            <span>${esc(block.block_code || "-")}</span>
            <small>${esc(plot.plot_code || "-")} · ${esc(block.ap_code || block.AP_code || "ไม่มี AP")} · ${fmt(n(block.area_rai))} ไร่ · ${fmt(n(block.tree_count))} ต้น</small>
          </label>`;
        }).join("") || `<p>ยังไม่มี Block ในโซนนี้</p>`}
      </div>`;
  }).join("");
  const workerRows = previewMembers.map((member) => {
    const employee = employees.find((row) => row.id === member.employee_id) || {};
    return `
      <label class="farm-plan-worker-row">
        <input type="checkbox" checked>
        <span>
          <strong>${esc(employee.full_name || farmLookupLabel("employees", member.employee_id))}</strong>
          <small>${esc(member.member_role || employee.worker_type || "-")} · ${esc(employee.payment_type || "-")} · ${employee.daily_wage ? `${moneyNf.format(n(employee.daily_wage))}/วัน` : "-"}</small>
        </span>
      </label>`;
  }).join("");
  const latestWorkOptions = workOrders.slice(0, 6).map((row) => `<option>${esc(row.work_order_no || row.id)} · ${esc(row.work_order_title || row.activity?.activity_name || "")}</option>`).join("");
  return `
    <section class="farm-planner-console">
      <div class="section-head">
        <h3>วางแผนสร้าง Work Order</h3>
        <span>เลือกงาน กำหนดรอบซ้ำ เลือกพื้นที่จำนวนมาก แยกรายคน และเห็นต้นทุนก่อนสร้างแผน</span>
      </div>
      <div class="farm-plan-flow">
        ${["เลือกงาน", "เลือกพื้นที่และทีม", "กำหนดทรัพยากร", "ตรวจแล้วสร้าง WO"].map((step, index) => `<article class="${index === 0 ? "active" : ""}"><b>${index + 1}</b><span>${esc(step)}</span></article>`).join("")}
      </div>
      <div class="farm-plan-simple">
        <article class="farm-plan-card">
          <h4>1. งานที่จะทำ</h4>
          <label>รูปแบบกำหนดการ
            <select>
              <option>ทำครั้งเดียว</option>
              <option>ทำซ้ำตามรอบ</option>
              <option>อ้างอิงจากงานล่าสุด</option>
            </select>
          </label>
          <label>กลุ่มกิจกรรม
            <select>${activityGroups.map((row) => `<option>${esc(row.group_name || row.group_code || "")}</option>`).join("")}</select>
          </label>
          <label>กิจกรรม
            <select>${activities.map((row) => `<option>${esc(row.activity_name || row.activity_code || "")}</option>`).join("")}</select>
          </label>
          <div class="farm-plan-inline">
            <label>วันที่เริ่มงาน<input ${dateInputAttrs("2026-01-15")}></label>
            <label>วันที่สิ้นสุด<input ${dateInputAttrs("2026-01-16")}></label>
          </div>
          <div class="farm-plan-inline">
            <label>รอบซ้ำ
              <select>
                <option>ไม่ทำซ้ำ</option>
                <option>ทุก 7 วัน</option>
                <option>ทุก 15 วัน</option>
                <option>ทุก 30 วัน</option>
              </select>
            </label>
          </div>
          <label>อ้างอิงงานล่าสุด
            <select>
              <option>ไม่อ้างอิง</option>
              ${latestWorkOptions}
            </select>
          </label>
        </article>
        <article class="farm-plan-card">
          <h4>2. พื้นที่และทีม</h4>
          <div class="farm-plan-area-tools">
            <label>โซน
              <select><option>ทุกโซน</option>${zoneOptions}</select>
            </label>
            <label>กลุ่มแปลง
              <select><option>ทุกกลุ่มแปลง</option>${plotGroupOptions}</select>
            </label>
          </div>
          <div class="farm-plan-area-list">
            ${areaGroups || `<div class="farm-plan-area-group"><p>ยังไม่มีข้อมูลแปลง</p></div>`}
          </div>
          <label>ทีมรับงาน
            <select>${teams.map((row) => `<option>${esc(row.team_name || row.team_code || "")}</option>`).join("")}</select>
          </label>
          <div class="farm-plan-worker-list">
            <strong>เลือกรายคนในทีม</strong>
            ${workerRows || `<p>ยังไม่มีสมาชิกทีม</p>`}
          </div>
        </article>
        <article class="farm-plan-card">
          <h4>3. วิธีคำนวณและทรัพยากร</h4>
          <div class="farm-plan-methods farm-plan-method-grid">
            <label><input type="radio" name="planCalcMode" checked> ตามจำนวนต้นจากข้อมูลแปลง</label>
            <label><input type="radio" name="planCalcMode"> ตามพื้นที่ไร่จากข้อมูลแปลง</label>
            <label><input type="radio" name="planCalcMode"> ตามผลงานจริงหลังบันทึกงาน</label>
            <label><input type="radio" name="planCalcMode"> ตามอัตราผู้รับเหมา</label>
          </div>
          <div class="farm-plan-resource-block">
            <div class="farm-plan-resource-head">
              <strong>วัสดุหลัก</strong>
              <button type="button" data-farm-open-work-table="work_order_resources">เพิ่ม/แก้วัสดุ</button>
            </div>
            ${materialResourceRows}
          </div>
          <div class="farm-plan-resource-block">
            <div class="farm-plan-resource-head">
              <strong>รถ/เครื่องจักร</strong>
              <button type="button" data-farm-open-work-table="work_order_resources">เพิ่ม/แก้รถ/เครื่องจักร</button>
            </div>
            ${vehicleResourceRows}
          </div>
          <label>อัตรางบประมาณ
            <select>${budgetRates.map((row) => `<option>${esc(row.budget_rate_code || row.id)} · ${esc(farmLookupLabel("activities", row.activity_id))} · ${moneyNf.format(n(row.rate_amount))}</option>`).join("")}</select>
          </label>
          <div class="farm-plan-resource-note">
            <span>เลือกวิธีคำนวณได้ครั้งละ 1 แบบ</span>
            <span>วัสดุและรถ/เครื่องจักรเพิ่มได้หลายรายการต่อ Work Order</span>
          </div>
        </article>
        <article class="farm-plan-card farm-plan-summary">
          <h4>4. ตรวจแล้วสร้าง</h4>
          <dl>
            <dt>งาน</dt><dd>${esc(previewGroup?.group_name || "-")} / ${esc(previewActivity?.activity_name || "-")}</dd>
            <dt>พื้นที่</dt><dd>${esc(plotCountText)} · ${moneyNf.format(totalRai)} ไร่ · ${fmt(totalTrees)} ต้น</dd>
            <dt>ทีม</dt><dd>${esc(previewTeam?.team_name || "-")} · ${fmt(previewMembers.length)} คน</dd>
            <dt>ช่วงวัน</dt><dd>2026-01-15 ถึง 2026-01-16</dd>
            <dt>ทรัพยากร</dt><dd>วัสดุ ${fmt(selectedMaterials.length || 1)} รายการ · รถ/เครื่องจักร ${fmt(selectedVehicles.length || 1)} รายการ</dd>
            <dt>สถานะเริ่มต้น</dt><dd>Draft → รออนุมัติ</dd>
          </dl>
          <div class="farm-plan-cost-preview">
            <strong>ต้นทุนประมาณการก่อนสร้างแผน</strong>
            <table>
              <tbody>
                <tr><th>ฐานคำนวณ</th><td>${moneyNf.format(totalRai)} ไร่ / ${fmt(totalTrees)} ต้น</td></tr>
                <tr><th>ค่าแรง</th><td>${moneyNf.format(totalRai)} ไร่ × ${moneyNf.format(laborRate)} = ${moneyNf.format(laborCost)}</td></tr>
                <tr><th>วัสดุ</th><td>${esc(selectedMaterial.material_name || "-")} · ${moneyNf.format(materialQuantity)} ${esc(selectedUsageRate.usage_unit || "")}</td></tr>
                <tr><th>ต้นทุนวัสดุ</th><td>${moneyNf.format(materialQuantity)} × ${moneyNf.format(materialRate)} = ${moneyNf.format(materialCost)}</td></tr>
                <tr class="total"><th>รวมประมาณการ</th><td>${moneyNf.format(totalCost)}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="farm-plan-actions">
            <button type="button" data-farm-open-work-table="work_orders">สร้างแผน Draft</button>
            <button type="button" data-farm-open-work-table="approval_logs">ส่งอนุมัติ</button>
          </div>
        </article>
      </div>
    </section>`;
}

function renderFarmWorkBoard() {
  const allRows = farmWorkOrders();
  const rows = filteredFarmWorkOrders();
  const selected = rows.find((row) => row.id === state.farmWorkDetailId) || rows[0] || allRows[0] || null;
  if (selected && state.farmWorkDetailId !== selected.id) state.farmWorkDetailId = selected.id;
  const minStart = rows.reduce((min, row) => !min || farmDateMs(row.startDate) < farmDateMs(min) ? row.startDate : min, rows[0]?.startDate || farmToday());
  const maxEnd = rows.reduce((max, row) => farmDateMs(row.endDate) > farmDateMs(max) ? row.endDate : max, rows[0]?.endDate || minStart);
  const timelineStart = farmAddDays(minStart, -2) || farmToday();
  const maxDays = Math.min(60, Math.max(14, farmDaysBetween(timelineStart, farmAddDays(maxEnd, 3)) + 1));
  const days = Array.from({ length: maxDays }, (_, index) => farmAddDays(timelineStart, index));
  const dayWidth = 30;
  const timelineWidth = days.length * dayWidth;
  const monthBands = farmWorkMonthBands(days);
  const today = farmToday();
  const todayIndex = days.includes(today) ? days.indexOf(today) : -1;
  const statusCounts = rows.reduce((acc, row) => {
    acc[row.statusMeta.key] = (acc[row.statusMeta.key] || 0) + 1;
    return acc;
  }, {});
  const approvalCount = rows.filter((row) => row.statusMeta.key === "pending_approval").length;
  const shiftedCount = rows.filter((row) => row.statusMeta.key === "rescheduled").length;
  const closedCount = rows.filter((row) => row.statusMeta.key === "closed").length;
  const timelineRows = rows.slice().sort((a, b) => farmWorkGroupKey(a).localeCompare(farmWorkGroupKey(b), "th")
    || farmDateMs(a.startDate) - farmDateMs(b.startDate)
    || String(a.work_order_no || a.id).localeCompare(String(b.work_order_no || b.id), "th"));
  const groupedRows = [];
  let lastGroup = "";
  for (const row of timelineRows) {
    const group = farmWorkGroupKey(row);
    if (group !== lastGroup) {
      groupedRows.push({ type: "group", id: `group-${group}`, group, count: timelineRows.filter((item) => farmWorkGroupKey(item) === group).length });
      lastGroup = group;
    }
    groupedRows.push({ type: "order", row });
  }
  const activityOptions = farmWorkFilterOptions(allRows, "activityGroup");
  const teamOptions = farmWorkFilterOptions(allRows, "team");
  const zoneOptions = farmWorkFilterOptions(allRows, "zone");
  const plotGroupOptions = farmWorkFilterOptions(allRows, "plotGroup");
  const statusOptions = [
    { value: "planned", label: "แผนงาน" },
    { value: "pending_approval", label: "รออนุมัติ" },
    { value: "approved", label: "อนุมัติแล้ว" },
    { value: "sent_to_mobile", label: "ส่งเข้ามือถือ" },
    { value: "rescheduled", label: "เลื่อนวัน" },
    { value: "in_progress", label: "กำลังทำ" },
    { value: "completed", label: "ทำเสร็จ" },
    { value: "closed", label: "ปิดงาน" },
  ];
  return `
    <section class="farm-work-console">
      <div class="section-head">
        <h3>ตารางการทำงาน / Work Order Timeline</h3>
        <span>สีแสดงขั้นตอน เลื่อนวัน และรายการที่ต้องอนุมัติ</span>
      </div>
      <div class="farm-work-kpis">
        <article><span>Work Order</span><strong>${fmt(rows.length)}</strong><small>จากทั้งหมด ${fmt(allRows.length)}</small></article>
        <article><span>รออนุมัติ</span><strong>${fmt(approvalCount)}</strong><small>กดรายการสีส้มเพื่ออนุมัติ</small></article>
        <article><span>เลื่อนวัน</span><strong>${fmt(shiftedCount)}</strong><small>แสดงเส้นวันเดิมและวันใหม่</small></article>
        <article><span>ปิดงาน</span><strong>${fmt(closedCount)}</strong><small>งานจบครบกระบวนการ</small></article>
      </div>
      <div class="farm-work-filters">
        ${renderFarmWorkSelect("farmWorkActivityGroup", "กลุ่มกิจกรรม", activityOptions, state.farmWorkFilters.activityGroup)}
        ${renderFarmWorkSelect("farmWorkTeam", "ทีมหัวหน้า", teamOptions, state.farmWorkFilters.team)}
        ${renderFarmWorkSelect("farmWorkZone", "โซน", zoneOptions, state.farmWorkFilters.zone)}
        ${renderFarmWorkSelect("farmWorkPlotGroup", "กลุ่มแปลง", plotGroupOptions, state.farmWorkFilters.plotGroup)}
        ${renderFarmWorkSelect("farmWorkStatus", "ขั้นตอน", statusOptions, state.farmWorkFilters.status)}
        <label>ค้นหา<input id="farmWorkSearch" type="search" value="${esc(state.farmWorkFilters.query)}" placeholder="WO, งาน, แปลง, ทีม"></label>
      </div>
      <div class="farm-work-legend">
        <span><i class="plan-draft"></i>แผนก่อนอนุมัติ / วันเดิม</span>
        <span><i class="plan-approved"></i>แผนอนุมัติแล้ว</span>
        <span><i class="actual-done"></i>บันทึกงานจริง / ปิดงาน</span>
        <span><i class="milestone"></i>Milestone / อนุมัติ / ปิดงาน</span>
        <span><i class="today"></i>วันนี้</span>
      </div>
      <div class="farm-work-layout">
        <div class="farm-work-gantt" role="region" aria-label="Work Order Gantt Timeline">
          <div class="farm-work-grid-head">
            <div class="farm-work-left-head">
              <span>WO</span>
              <span>งาน / Activity</span>
              <span>พื้นที่</span>
              <span>ทีม</span>
              <span>%</span>
              <span>ขั้นตอน</span>
            </div>
            <div class="farm-work-scale" style="width:${timelineWidth}px">
              <div class="farm-work-months" style="grid-template-columns:${monthBands.map((band) => `${band.days * dayWidth}px`).join(" ")}">
                ${monthBands.map((band) => `<span>${esc(band.label)}</span>`).join("")}
              </div>
              <div class="farm-work-days" style="grid-template-columns:repeat(${days.length}, ${dayWidth}px)">
                ${days.map((day) => `<span class="${day === today ? "is-today" : ""}">${esc(day.slice(8, 10))}<small>${esc(["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][new Date(`${day}T00:00:00`).getDay()])}</small></span>`).join("")}
              </div>
            </div>
          </div>
          <div class="farm-work-rows">
            ${todayIndex >= 0 ? `<i class="farm-work-today-line" style="left:${520 + todayIndex * dayWidth + Math.floor(dayWidth / 2)}px"></i>` : ""}
            ${groupedRows.map((item) => {
              if (item.type === "group") {
                return `
                  <div class="farm-work-row farm-work-group-row">
                    <div class="farm-work-group-left"><strong>${esc(item.group)}</strong><span>${fmt(item.count)} work orders</span></div>
                    <div class="farm-work-group-lane" style="width:${timelineWidth}px"></div>
                  </div>`;
              }
              const row = item.row;
              const startIndex = Math.max(0, farmDaysBetween(timelineStart, row.startDate || timelineStart));
              const span = Math.max(1, farmDaysBetween(row.startDate || timelineStart, row.endDate || row.startDate || timelineStart) + 1);
              const originalIndex = row.original_scheduled_date ? Math.max(0, farmDaysBetween(timelineStart, row.original_scheduled_date)) : -1;
              const originalSpan = Math.max(1, farmDaysBetween(row.original_scheduled_date || row.startDate || timelineStart, row.planned_end_date || row.original_scheduled_date || row.startDate || timelineStart) + 1);
              const approvedIndex = row.approved_at ? Math.max(0, farmDaysBetween(timelineStart, row.approved_at)) : -1;
              const closedIndex = row.closed_at ? Math.max(0, farmDaysBetween(timelineStart, row.closed_at)) : -1;
              const actualIndex = row.actualStartDate ? Math.max(0, farmDaysBetween(timelineStart, row.actualStartDate)) : -1;
              const actualSpan = row.actualStartDate ? Math.max(1, farmDaysBetween(row.actualStartDate, row.actualEndDate || row.actualStartDate) + 1) : 0;
              const progress = farmWorkProgress(row);
              const needsApproval = row.statusMeta.key === "pending_approval";
              const hasApprovedPlan = row.approval_status === "approved" || ["approved", "sent_to_mobile", "rescheduled", "in_progress", "completed", "closed"].includes(row.statusMeta.key);
              const showDraftPlan = !hasApprovedPlan || (originalIndex >= 0 && originalIndex !== startIndex);
              const areaText = `${row.plot?.plot_code || "-"} / ${row.block?.block_code || "-"} · ${row.block?.ap_code || row.block?.AP_code || "ไม่มี AP"}`;
              return `
                <div class="farm-work-row${selected?.id === row.id ? " active" : ""}" data-farm-work-detail="${esc(row.id)}">
                  <button type="button" class="farm-work-left">
                    <b>${esc(row.work_order_no || row.id)}</b>
                    <strong>${esc(row.work_order_title || row.activity?.activity_name || "-")}<small>${esc(row.activity?.activity_name || "-")}</small></strong>
                    <span>${esc(areaText)}</span>
                    <span>${esc(row.team?.team_name || "-")}</span>
                    <em>${fmt(progress)}%</em>
                    <i style="--status:${esc(row.statusMeta.color)}">${esc(row.statusMeta.label)}</i>
                  </button>
                  <div class="farm-work-lane" style="width:${timelineWidth}px">
                    ${showDraftPlan ? `<button class="farm-work-plan-bar draft ${needsApproval ? "needs-approval" : ""}" type="button" data-farm-work-detail="${esc(row.id)}" title="แผนก่อนอนุมัติ ${esc(row.original_scheduled_date || row.startDate || "-")} - ${esc(row.planned_end_date || row.endDate || "-")}" style="left:${(originalIndex >= 0 ? originalIndex : startIndex) * dayWidth + 3}px;width:${Math.max(18, (originalIndex >= 0 ? originalSpan : span) * dayWidth - 6)}px"><span>${needsApproval ? "รออนุมัติ" : "แผน"}</span></button>` : ""}
                    ${hasApprovedPlan ? `<button class="farm-work-plan-bar approved" type="button" data-farm-work-detail="${esc(row.id)}" title="แผนอนุมัติแล้ว ${esc(row.startDate || "-")} - ${esc(row.endDate || "-")}" style="left:${startIndex * dayWidth + 3}px;width:${Math.max(18, span * dayWidth - 6)}px"><span>อนุมัติ</span></button>` : ""}
                    ${actualIndex >= 0 ? `<button class="farm-work-actual-bar" type="button" data-farm-work-detail="${esc(row.id)}" title="บันทึกงานจริง ${esc(row.actualStartDate || "-")} - ${esc(row.actualEndDate || "-")} (${fmt(row.actualResultCount)} รายการ)" style="left:${actualIndex * dayWidth + 3}px;width:${Math.max(18, actualSpan * dayWidth - 6)}px"><span>${row.statusMeta.key === "closed" ? "ปิดงาน" : "ทำจริง"}</span></button>` : ""}
                    ${needsApproval ? `<button class="farm-work-milestone approval" type="button" data-farm-work-detail="${esc(row.id)}" title="ต้องอนุมัติ" style="left:${startIndex * dayWidth + Math.max(10, span * dayWidth - 12)}px"></button>` : ""}
                    ${approvedIndex >= 0 ? `<i class="farm-work-milestone approved" title="อนุมัติ ${esc(row.approved_at)}" style="left:${approvedIndex * dayWidth + 10}px"></i>` : ""}
                    ${closedIndex >= 0 ? `<i class="farm-work-milestone closed" title="ปิดงาน ${esc(row.closed_at)}" style="left:${closedIndex * dayWidth + 10}px"></i>` : ""}
                  </div>
                </div>`;
            }).join("") || `<div class="farm-work-empty">ไม่พบ Work Order ตามตัวกรอง</div>`}
          </div>
        </div>
        ${renderFarmWorkDetail(selected)}
      </div>
    </section>`;
}

function renderFarmWorkDetail(order) {
  if (!order) return `<aside class="farm-work-detail-panel"><strong>ยังไม่มี Work Order</strong><span>เพิ่มใบสั่งงานในตาราง work_orders ก่อน</span></aside>`;
  const needsApproval = order.statusMeta.key === "pending_approval";
  const canApprove = needsApproval && farmCan("approve");
  const details = [
    ["เลขที่ WO", order.work_order_no],
    ["ชื่องาน", order.work_order_title],
    ["ขั้นตอน", order.statusMeta.label],
    ["สถานะอนุมัติ", order.approval_status || "-"],
    ["Plot / แปลง", farmLookupLabel("plots", order.plot_id || order.block?.plot_id)],
    ["Block", farmLookupLabel("blocks", order.block_id || order.block?.id)],
    ["AP Code", order.block?.ap_code || order.block?.AP_code || order.ap_code || order.AP_code || "-"],
    ["โซน", order.zone?.zone_name || "-"],
    ["กลุ่มแปลง", farmLookupLabel("plot_groups", order.plot_group_id)],
    ["กิจกรรม", farmLookupLabel("activities", order.activity_id)],
    ["กลุ่มกิจกรรม", order.activityGroup?.group_name || "-"],
    ["ทีม/หัวหน้า", farmLookupLabel("teams", order.team_id)],
    ["วันแผน", `${order.startDate || "-"} ถึง ${order.endDate || "-"}`],
    ["วันที่ทำงาน", order.scheduled_date || "-"],
    ["วันที่เดิม", order.original_scheduled_date || "-"],
    ["ผู้จัดการที่เลื่อน", farmLookupLabel("profiles", order.rescheduled_by_manager_id)],
    ["เหตุผลเลื่อน", order.reschedule_reason || "-"],
    ["ผู้อนุมัติ", farmLookupLabel("profiles", order.approved_by)],
    ["วันที่อนุมัติ", order.approved_at || "-"],
    ["วันที่ปิดงาน", order.closed_at || "-"],
  ];
  return `
    <aside class="farm-work-detail-panel">
      <div class="farm-work-detail-head">
        <div>
          <strong>${esc(order.work_order_no || order.id)}</strong>
          <span>${esc(order.work_order_title || "-")}</span>
        </div>
        <em style="--status:${esc(order.statusMeta.color)}">${esc(order.statusMeta.label)}</em>
      </div>
      ${order.rescheduled_date ? `<div class="farm-work-shift-note">เลื่อนจาก ${esc(order.original_scheduled_date || "-")} เป็น ${esc(order.rescheduled_date)} โดย ${esc(farmLookupLabel("profiles", order.rescheduled_by_manager_id))}</div>` : ""}
      <dl class="farm-work-detail-list">
        ${details.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value ?? "-")}</dd>`).join("")}
      </dl>
      <div class="farm-work-approval-actions">
        ${needsApproval ? `<button type="button" data-farm-work-approve="${esc(order.id)}" ${canApprove ? "" : "disabled"}>อนุมัติ</button><button type="button" data-farm-work-reject="${esc(order.id)}" ${canApprove ? "" : "disabled"}>ไม่อนุมัติ</button>` : `<button type="button" data-farm-work-detail="${esc(order.id)}">ดูรายละเอียด</button>`}
        <button type="button" data-farm-open-work-table="work_orders">เปิดตาราง WO</button>
      </div>
    </aside>`;
}

function updateFarmWorkOrderDecision(id, decision) {
  const table = farmTableByKey("work_orders");
  const current = farmRows(table).find((row) => row.id === id);
  if (!current) return;
  const now = new Date().toISOString();
  const approved = decision === "approved";
  const next = {
    ...current,
    id: current.readonly ? `override-${id}` : current.id,
    moduleId: "farm-work",
    tableId: "work_orders",
    _overrideOf: current.readonly ? id : current._overrideOf,
    approval_status: decision,
    status: approved ? "approved" : "rejected",
    approved_by: approved ? "profile-admin" : "",
    approved_at: now.slice(0, 10),
    updatedAt: now,
  };
  if (!next._overrideOf) delete next._overrideOf;
  state.farmRecords = state.farmRecords.filter((item) => !(item.tableId === "work_orders" && (item.id === next.id || item._overrideOf === id || item.id === id)));
  state.farmRecords.push(next);
  state.farmRecords.push({
    id: `farm-approval-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    moduleId: "farm-governance",
    tableId: "approval_logs",
    entity_table: "work_orders",
    entity_id: id,
    event_type: "approval",
    approval_level: "1",
    actor_profile_id: "profile-admin",
    decision,
    event_date: now.slice(0, 10),
    status: "active",
    updatedAt: now,
  });
  state.farmRecords.push({
    id: `farm-status-log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    moduleId: "farm-governance",
    tableId: "approval_logs",
    entity_table: "work_orders",
    entity_id: id,
    event_type: "status_change",
    from_status: current.status || "",
    to_status: approved ? "approved" : "rejected",
    actor_profile_id: "profile-admin",
    event_date: now.slice(0, 10),
    note: approved ? "อนุมัติจากหน้า Work Order Timeline" : "ไม่อนุมัติจากหน้า Work Order Timeline",
    status: "active",
    updatedAt: now,
  });
  state.farmWorkDetailId = id;
  saveFarmRecords();
  render();
}

function renderFarmKeyBindings(table) {
  const refs = farmVisibleFields(table).filter((field) => farmFieldReferences(field));
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

function renderFarmDataEntryGuide(table) {
  return `
    <section class="farm-entry-guide">
      <article><b>1</b><span>เลือกตารางข้อมูล</span><small>${esc(farmTableDisplayName(table))}</small></article>
      <article><b>2</b><span>เพิ่มหรือกดแถวเพื่อแก้ไข</span><small>* คือช่องจำเป็น</small></article>
      <article><b>3</b><span>บันทึกเข้าฐานข้อมูล</span><small>ระบบจะ update DB และ refresh กลับมา</small></article>
      <article><b>4</b><span>แก้เป็นชุดด้วยไฟล์</span><small>Export Excel → เปิดแก้ใน Excel → Save CSV → Update จากไฟล์</small></article>
    </section>`;
}

function renderFarmPage() {
  const module = selectedFarmModule();
  const tables = farmTablesForModule(module);
  const table = selectedFarmTable(module);
  const visibleFields = farmVisibleFields(table);
  const rows = filteredFarmRows(table);
  const allRows = farmRows(table);
  const selected = farmSelectedRow(table);
  const editing = state.farmEditId ? selected : {};
  const inactiveCount = allRows.filter((row) => String(row.status).toLowerCase() === "inactive").length;
  const refCount = farmVisibleFields(table).filter((field) => farmFieldReferences(field)).length;
  const dbRowCount = Object.values(state.farmDbRows || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  const dbErrorCount = Object.keys(state.farmDbErrors || {}).length;
  const isWorkPage = module.id === "farm-work";
  return `
    <div class="farm-page${isWorkPage ? " farm-work-page" : ""}">
      <div class="report-title${isWorkPage ? " farm-work-title" : ""}">
        <div>
          <h2>${isWorkPage ? "วางแผน / สั่งงาน / บันทึกงาน" : esc(module.title)}</h2>
          <p>${isWorkPage ? "Director วางแผน → Estate Manager สั่งงาน → Supervisor บันทึกงาน" : esc(module.description)}</p>
        </div>
        <button type="button" data-farm-db-refresh>Refresh DB</button>
      </div>
      ${renderFarmWorkflowNav(module)}
      ${isWorkPage ? "" : `<section class="farm-hero">
        <article><span>กลุ่ม</span><strong>${esc(module.group)}</strong><small>${esc(module.accent)}</small></article>
        <article><span>ตาราง Supabase</span><strong>${fmt(tables.length)}</strong><small>${tables.slice(0, 3).map((item) => `<code>${esc(item.key)}</code>`).join(" ")}</small></article>
        <article><span>รายการ</span><strong>${fmt(rows.length)}</strong><small>ทั้งหมด ${fmt(allRows.length)} รายการ</small></article>
        <article><span>ข้อมูลจริง DB</span><strong>${fmt(dbRowCount)}</strong><small>${esc(state.farmDbSource?.mode || "fallback-seed")} · error ${fmt(dbErrorCount)}</small></article>
        <article><span>Foreign Key</span><strong>${fmt(refCount)}</strong><small>Inactive ${fmt(inactiveCount)} รายการ</small></article>
      </section>`}
      ${state.farmSyncMessage ? `<div class="farm-sync-status ${esc(state.farmSyncStatus)}">${esc(state.farmSyncMessage)}</div>` : ""}
      ${isWorkPage ? `${renderFarmWorkBoard()}${renderFarmWorkPlanner()}` : ""}
      ${module.id === "farm-governance" ? renderFarmGovernanceBoard(table) : ""}
      ${renderFarmVersionNotice(module, table)}
      <section class="farm-toolbar">
        <label>ตารางข้อมูล
          <select id="farmTableSelect">
            ${tables.map((item) => `<option value="${esc(item.key)}"${item.key === table.key ? " selected" : ""}>${esc(farmTableDisplayName(item))}</option>`).join("")}
          </select>
        </label>
        <label>ค้นหา<input id="farmSearch" type="search" value="${esc(state.farmFilters.query)}" placeholder="ค้นหารหัส ชื่อ สถานะ ตาราง"></label>
        <label>สถานะ
          <select id="farmStatusFilter">
            ${FARM_STATUS_OPTIONS.map((status) => `<option value="${esc(status)}"${state.farmFilters.status === status ? " selected" : ""}>${status === "all" ? "ทั้งหมด" : esc(status)}</option>`).join("")}
          </select>
        </label>
        <label>Role
          <select id="farmRoleFilter">
            ${FARM_ROLES.map((role) => `<option value="${esc(role)}"${state.farmFilters.role === role ? " selected" : ""}>${esc(role)}</option>`).join("")}
          </select>
        </label>
        <button type="button" data-farm-new ${farmCan("create") ? "" : "disabled"}>Add</button>
        <button type="button" data-farm-export ${farmCan("export") ? "" : "disabled"}>Export Excel</button>
        <label class="farm-file-update ${state.farmSyncBusy ? "disabled" : ""}">
          Update จากไฟล์
          <input id="farmImportFile" type="file" accept=".csv,text/csv" ${state.farmSyncBusy ? "disabled" : ""}>
        </label>
      </section>
      ${isWorkPage ? "" : renderFarmDataEntryGuide(table)}
      ${isWorkPage ? "" : renderFarmKeyBindings(table)}
      <section class="farm-layout">
        <article class="farm-panel">
          <div class="section-head"><h3>${state.farmEditId ? "แก้ไขข้อมูล" : "เพิ่มข้อมูล"}</h3><span>${esc(table.key)} / * คือข้อมูลจำเป็น</span></div>
          <form class="farm-form">
            <label class="auto-id-field">id อัตโนมัติ
              <input type="text" value="${esc(editing.id || "สร้างอัตโนมัติ")}" disabled aria-disabled="true">
            </label>
            ${visibleFields.map((field) => renderFarmInput(field, editing[farmFieldKey(field)] ?? "")).join("")}
            <div class="farm-form-actions">
              <button type="button" data-farm-save ${farmCan(state.farmEditId ? "update" : "create") && !state.farmSyncBusy ? "" : "disabled"}>${state.farmSyncBusy ? "กำลังบันทึก..." : (state.farmEditId ? "บันทึกแก้ไข" : "บันทึกเพิ่ม")}</button>
              <button type="button" data-farm-clear>ล้างฟอร์ม</button>
            </div>
          </form>
        </article>
        <article class="farm-panel">
          <div class="section-head"><h3>รายละเอียดที่เลือก</h3><span>${selected.id ? esc(selected.code || selected.name || selected.id) : "เลือกแถวในตารางเพื่อดูรายละเอียด"}</span></div>
          <dl class="farm-detail">
            ${selected.id ? visibleFields.map((field) => {
              const key = farmFieldKey(field);
              return `<dt>${esc(farmFieldLabel(field))}</dt><dd>${esc(farmDisplayValue(field, selected) || "-")}</dd>`;
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
              <tr>${visibleFields.map((field) => `<th>${esc(farmFieldLabel(field))}</th>`).join("")}<th>จัดการ</th></tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr data-farm-row="${esc(row.id)}">
                  ${visibleFields.map((field) => `<td>${esc(farmDisplayValue(field, row))}</td>`).join("")}
                  <td class="farm-actions">
                    <button type="button" data-farm-view="${esc(row.id)}">ดู</button>
                    <button type="button" data-farm-edit="${esc(row.id)}" ${farmCan("update") ? "" : "disabled"}>แก้ไข</button>
                    <button type="button" data-farm-inactive="${esc(row.id)}" ${farmCan("delete") ? "" : "disabled"}>ปิดใช้งาน</button>
                  </td>
                </tr>`).join("") || `<tr><td colspan="${visibleFields.length + 1}">ไม่พบรายการ</td></tr>`}
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
        <input id="palmFromDate" ${dateInputAttrs(filters.from)}>
      </label>
      <label>ถึงวันที่
        <input id="palmToDate" ${dateInputAttrs(filters.to)}>
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
  const clearByDate = new Map(clearRows().map((row) => [row.date, row]));
  const rows = daysBetween(dateValue(els.startDate) || state.payload?.source?.dateMin || todayIso(), dateValue(els.endDate) || state.payload?.source?.dateMax || todayIso())
    .map((date) => fillAutoClearLoss(clearByDate.get(date) || autoClearLoss(date)));
  const gardenStock = new Map(buildStockFromData("garden").map((row) => [row.date, row]));
  const takukStock = new Map(buildStockFromData("takuk").map((row) => [row.date, row]));
  els.clearTable.innerHTML = `
    <thead><tr><th>วันที่</th><th>คงเหลือปลายราง</th><th>คงเหลือตะกุก</th><th>เคลียร์ปลายราง</th><th>เคลียร์ตะกุก</th><th>Loss แรมป์</th><th>Loss ขนส่ง</th><th>รวมปรับยอด</th><th>น้ำหนัก<br>ยกมา</th><th>เลขที่ใบชั่ง<br>ส่งออกวันถัดไป</th><th class="left">หมายเหตุ</th><th></th></tr></thead>
    <tbody>${rows.map((r) => {
      const garden = gardenStock.get(r.date);
      const takuk = takukStock.get(r.date);
      const report = stockReportClearMetrics(r.date);
      const nextDate = addIsoDays(r.date, 1);
      const nextGarden = gardenStock.get(nextDate);
      const nextTakuk = takukStock.get(nextDate);
      const nextReport = stockReportClearMetrics(nextDate);
      const hasNextDay = Boolean(nextReport || nextGarden || nextTakuk);
      const nextOpening = nextReport?.opening ?? (n(nextGarden?.opening) + n(nextTakuk?.opening));
      const gardenBalance = report?.gardenBalance ?? n(garden?.balance);
      const takukBalance = report?.takukBalance ?? n(takuk?.balance);
      const clearPr = n(r.clearPr);
      const clearTk = n(r.clearTk);
      const clearPrSet = Boolean(r.clearPrSet);
      const clearTkSet = Boolean(r.clearTkSet);
      const gardenDocs = outboundDocsForClear(r.date, "garden", clearPr, clearPrSet);
      const takukDocs = outboundDocsForClear(r.date, "takuk", clearTk, clearTkSet);
      const nextDocsText = gardenDocs === "-" && takukDocs === "-" ? "-" : `ปลายราง: ${gardenDocs}<br>ตะกุก: ${takukDocs}`;
      const lossRamp = n(r.lossRamp);
      const lossTransport = n(r.lossTransport);
      return `<tr>
        <td>${displayDate(r.date)}</td>
        <td class="num">${fmt(gardenBalance)}</td>
        <td class="num">${fmt(takukBalance)}</td>
        <td class="num">${fmt(clearPr)}</td>
        <td class="num">${fmt(clearTk)}</td>
        <td class="num loss">${fmt(lossRamp)}</td>
        <td class="num loss">${fmt(lossTransport)}</td>
        <td class="num">${fmt(clearPr + clearTk + lossRamp + lossTransport)}</td>
        <td class="num">${hasNextDay ? fmt(nextOpening) : "-"}</td>
        <td class="left">${nextDocsText}</td>
        <td class="left">${r.note || ""}</td>
        <td>${r.source === "manual" ? `<button data-del="${r.date}" type="button">ลบ</button>` : ""}</td>
      </tr>`;
    }).join("")}</tbody>`;
}

function render() {
  syncGlobalFilterBar();
  for (const btn of els.tabs.querySelectorAll("button[data-view]")) {
    btn.classList.toggle("active", btn.dataset.view === state.view);
  }
  syncSidebarDropdowns();
  const isClear = state.view === "clear";
  const isEst = isEstView(state.view);
  const isFarm = isFarmView(state.view);
  const isMill = state.view === "mill";
  els.reportPage.className = "report-page";
  els.reportPage.classList.toggle("hidden", isClear);
  els.clearPage.classList.toggle("hidden", !isClear);
  els.dashboard.classList.toggle("hidden", isEst || isFarm || isMill);
  els.datePanel?.classList.toggle("hidden", isEst || isFarm);
  els.globalFilterPanel?.classList.toggle("hidden", isEst || isFarm);

  if (isEst) renderEstView();
  if (isFarm) els.reportPage.innerHTML = renderFarmPage();
  if (state.view === "dashboard") renderAdvancedDashboard();
  if (state.view === "stock") renderStock(yardScope());
  if (state.view === "mill") renderMillWeight();
  if (state.view === "rspo") renderRspo();
  if (state.view === "daily") renderDailyReport();
  if (state.view === "summary") renderSummary();
  if (state.view === "clear") {
    if (!renderExactDashboard(yardScope())) renderDashboard(buildStockFromData(yardScope()));
    renderClear();
  }
  enhanceTables(els.reportPage);
  enhanceTables(els.clearPage);
}

function setView(view) {
  state.view = view;
  ensureFarmViewState(view);
  for (const btn of els.tabs.querySelectorAll("button")) btn.classList.toggle("active", btn.dataset.view === view);
  render();
}

function ensureFarmViewState(view = state.view) {
  if (!isFarmView(view)) return;
  const module = farmModuleMap()[view] || FARM_MODULES[0];
  const tables = farmTablesForModule(module);
  if (!tables.some((table) => table.key === state.farmTableId)) {
    state.farmTableId = tables[0]?.key || "";
  }
  state.farmEditId = "";
  state.farmDetailId = "";
}

async function addClear() {
  const clearDate = dateValue(els.clearDate);
  if (!clearDate) return;
  els.addClearRow.disabled = true;
  try {
    const row = {
      date: clearDate,
      note: els.clearNote.value.trim(),
      source: "manual",
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
    writeClearOverridesLocal();
    render();
    const ok = await saveClearOverrides("clear_ramp_save");
    if (ok) for (const el of [els.clearPr, els.clearTk, els.clearNote]) el.value = "";
  } finally {
    els.addClearRow.disabled = false;
    render();
  }
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
  state.view = initialViewFromUrl();
  ensureFarmViewState(state.view);
  loadClearOverrides();
  loadEstDailyEntries();
  await Promise.all([loadPayload(), loadMillWeightData(), loadEstData(), loadMasterFolderData(), loadSummaryPalmoilAreas(), loadClearOverridesFromServer()]);
  setDefaultTransportDateRange();
  setDateValue(els.clearDate, state.payload.source.dateMax);
  loadFarmTablesFromDatabase({ silent: true });

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
  els.clearDate?.addEventListener("blur", () => normalizeDateInput(els.clearDate));
  els.clearDate?.addEventListener("input", () => syncDatePickerFromText(els.clearDate));
  for (const btn of document.querySelectorAll(".calendar-btn")) {
    btn.addEventListener("click", () => {
      const picker = document.querySelector(`#${btn.dataset.picker}`);
      if (!picker) return;
      if (picker.id === "startDatePicker") picker.value = dateValue(els.startDate);
      if (picker.id === "endDatePicker") picker.value = dateValue(els.endDate);
      if (picker.id === "clearDatePicker") picker.value = dateValue(els.clearDate);
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
  els.clearDatePicker?.addEventListener("change", () => {
    setDateValue(els.clearDate, els.clearDatePicker.value);
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
    const summary = e.target.closest(".menu-dropdown > summary");
    if (summary && state.sidebarCollapsed) {
      e.preventDefault();
      openSidebarFlyout(summary.closest(".menu-dropdown"));
      return;
    }
    const btn = e.target.closest("button[data-view]");
    if (btn) {
      setView(btn.dataset.view);
      closeSidebarFlyouts();
    }
  });
  els.tabs.addEventListener("pointerenter", (e) => {
    const summary = e.target.closest?.(".menu-dropdown > summary");
    if (summary) openSidebarFlyout(summary.closest(".menu-dropdown"));
  }, true);
  els.tabs.addEventListener("pointerleave", (e) => {
    const detail = e.target.closest?.(".menu-dropdown");
    if (detail) scheduleSidebarFlyoutClose(detail);
  }, true);
  els.tabs.addEventListener("pointermove", (e) => {
    const detail = e.target.closest?.(".menu-dropdown[open]");
    if (detail && state.sidebarCollapsed) window.clearTimeout(sidebarFlyoutTimer);
  });
  document.addEventListener("pointerdown", (e) => {
    if (state.sidebarCollapsed && !e.target.closest?.("#tabs")) closeSidebarFlyouts();
  });
  document.addEventListener("toggle", (e) => saveSidebarDropdownState(e.target), true);
  document.addEventListener("click", handleEnhancedTableClick);
  els.sidebarToggle?.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem("sidebarIconRailExpandedV2", state.sidebarCollapsed ? "0" : "1");
    applySidebarState();
  });
  document.querySelector(".brand-lockup")?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("dashboard");
  });
  els.reportPage.addEventListener("change", (e) => {
    if (e.target.id === "palmFromDate") {
      const iso = dateValue(e.target);
      if (iso) state.palmFilters.from = iso;
      normalizeDateInput(e.target);
      render();
      return;
    }
    if (e.target.id === "palmToDate") {
      const iso = dateValue(e.target);
      if (iso) state.palmFilters.to = iso;
      normalizeDateInput(e.target);
      render();
      return;
    }
    if (e.target.matches("[data-mill-category]")) {
      const category = e.target.dataset.millCategory;
      const next = new Set(state.millCategories);
      if (e.target.checked) next.add(category);
      else next.delete(category);
      state.millCategories = next.size ? [...next] : ["กรูด-RSPO", "คีรีรัฐ-RSPO", "NON-RSPO"];
      render();
      return;
    }
    if (e.target.id === "farmWorkActivityGroup") {
      state.farmWorkFilters.activityGroup = e.target.value;
      state.farmWorkDetailId = "";
      render();
      return;
    }
    if (e.target.id === "farmWorkTeam") {
      state.farmWorkFilters.team = e.target.value;
      state.farmWorkDetailId = "";
      render();
      return;
    }
    if (e.target.id === "farmWorkZone") {
      state.farmWorkFilters.zone = e.target.value;
      state.farmWorkDetailId = "";
      render();
      return;
    }
    if (e.target.id === "farmWorkPlotGroup") {
      state.farmWorkFilters.plotGroup = e.target.value;
      state.farmWorkDetailId = "";
      render();
      return;
    }
    if (e.target.id === "farmWorkStatus") {
      state.farmWorkFilters.status = e.target.value;
      state.farmWorkDetailId = "";
      render();
      return;
    }
    if (e.target.id === "farmTableSelect") {
      state.farmTableId = e.target.value;
      state.farmEditId = "";
      state.farmDetailId = "";
      render();
      return;
    }
    if (e.target.id === "farmImportFile") {
      const file = e.target.files?.[0] || null;
      e.target.value = "";
      importFarmCsvToDatabase(file);
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
    if (["palmFromDate", "palmToDate"].includes(e.target.id)) {
      const key = e.target.id === "palmFromDate" ? "from" : "to";
      const iso = dateValue(e.target);
      if (iso) state.palmFilters[key] = iso;
      return;
    }
    if (e.target.id === "farmWorkSearch") {
      state.farmWorkFilters.query = e.target.value.trim();
      state.farmWorkDetailId = "";
      clearTimeout(state.estSearchTimer);
      state.estSearchTimer = setTimeout(render, 200);
      return;
    }
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
    if (e.target.closest("[data-farm-db-refresh]")) {
      loadFarmTablesFromDatabase({ silent: true });
      return;
    }
    const plannerTab = e.target.closest("[data-farm-planner-tab]");
    if (plannerTab) {
      state.farmPlannerTab = plannerTab.dataset.farmPlannerTab;
      render();
      return;
    }
    const workDetail = e.target.closest("[data-farm-work-detail]");
    if (workDetail) {
      state.farmWorkDetailId = workDetail.dataset.farmWorkDetail;
      render();
      return;
    }
    const workApprove = e.target.closest("[data-farm-work-approve]");
    if (workApprove) {
      updateFarmWorkOrderDecision(workApprove.dataset.farmWorkApprove, "approved");
      return;
    }
    const workReject = e.target.closest("[data-farm-work-reject]");
    if (workReject) {
      updateFarmWorkOrderDecision(workReject.dataset.farmWorkReject, "rejected");
      return;
    }
    const openWorkTable = e.target.closest("[data-farm-open-work-table]");
    if (openWorkTable) {
      const tableKey = openWorkTable.dataset.farmOpenWorkTable;
      const schema = FARM_TABLE_SCHEMAS[tableKey];
      if (schema?.moduleId && schema.moduleId !== state.view) state.view = schema.moduleId;
      state.farmTableId = tableKey;
      render();
      return;
    }
    const farmOpenTable = e.target.closest("[data-farm-open-table]");
    if (farmOpenTable) {
      const tableKey = farmOpenTable.dataset.farmOpenTable;
      const schema = FARM_TABLE_SCHEMAS[tableKey];
      if (schema?.moduleId && schema.moduleId !== state.view) state.view = schema.moduleId;
      state.farmTableId = tableKey;
      state.farmEditId = "";
      state.farmDetailId = "";
      render();
      return;
    }
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
  els.clearTable.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;
    btn.disabled = true;
    state.clearOverrides = state.clearOverrides.filter((x) => x.date !== btn.dataset.del);
    writeClearOverridesLocal();
    render();
    await saveClearOverrides("clear_ramp_delete");
    render();
  });

  render();
  startLiveRefresh();
  if (new URLSearchParams(window.location.search).has("autoRefresh")) autoRefreshTransportFromQuery();
}

init().catch((error) => {
  els.sourceInfo.textContent = "โหลดข้อมูลไม่สำเร็จ";
  els.reportPage.innerHTML = `<div class="report-title"><h2>${error.message}</h2></div>`;
});
