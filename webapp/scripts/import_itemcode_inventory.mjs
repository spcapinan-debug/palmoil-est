import fs from "node:fs";
import crypto from "node:crypto";

const API = process.env.FARM_TABLES_API || "https://palmoil-est.vercel.app/api/farm-tables";
const dumpPath = process.argv.find((arg) => arg.startsWith("--dump="))?.slice("--dump=".length) || "tmp_itemcode_dump.json";
const dryRun = process.argv.includes("--dry-run");

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortHash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8).toUpperCase();
}

function codeParts(code) {
  const parts = clean(code).split("-").map(clean).filter(Boolean);
  return { group: parts[0] || "", subtype: parts[1] || "", product: parts[2] || "", categoryCode: `${parts[0] || "X"}-${parts[1] || "X"}` };
}

function stableId(prefix, value) {
  return `${prefix}-${clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || shortHash(value).toLowerCase()}`;
}

function stableUuid(value) {
  const hex = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const GROUP_NAMES = {
  B: "หมวดวัสดุก่อสร้าง/ทั่วไป",
  C: "หมวดสารเคมี",
  E: "หมวดอุปกรณ์เครื่องมือเครื่องใช้",
  F: "หมวดปุ๋ย",
  G: "หมวดอุปกรณ์ความปลอดภัยและสวัสดิการ",
  H: "หมวดเครื่องมือช่าง",
  M: "หมวดอะไหล่โรงงาน/เครื่องจักร",
  N: "สินค้า/แปลงเพาะ",
  O: "หมวดน้ำมันและสารหล่อลื่น",
  P: "หมวดอะไหล่และชิ้นส่วน",
  S: "หมวดวัสดุสิ้นเปลืองทั่วไป",
  T: "หมวดบริการ",
  V: "หมวดยานพาหนะ-เครื่องจักร",
};

const SUBTYPE_NAMES = {
  "B-BU": "วัสดุก่อสร้าง/ทั่วไป",
  "B-GG": "อะไหล่เครื่องยนต์/กรอง",
  "G-GE": "อุปกรณ์ความปลอดภัยและสวัสดิการ",
  "H-TL": "เครื่องมือช่าง",
  "M-AA": "สายพาน",
  "M-BA": "ลูกปืน",
  "M-BL": "แปรง/เครื่องมือทำความสะอาด",
  "M-BS": "สกรูดำ",
  "M-BV": "วาล์ว",
  "M-BW": "สกรู/น๊อต",
  "M-DM": "อะไหล่เครื่องจักร",
  "M-EL": "ไฟฟ้า/ฟิวส์",
  "M-FA": "ลูกยาง/ใบกวาด",
  "M-GR": "แหวน/ฝาปิด",
  "M-HB": "เสื้อลูกปืน",
  "M-HY": "สายไฮดรอลิค",
  "M-IM": "ใบพัด/ปั๊ม",
  "M-ON": "น๊อต",
  "M-PK": "ปะเก็น",
  "M-PU": "กรอง/ปั๊ม",
  "M-RI": "แหวนล็อค",
  "M-SA": "โอริง",
  "M-SB": "ซีลกันฝุ่น",
  "M-VR": "V-Ring",
  "N-NP": "เมล็ดพันธุ์ปาล์ม",
  "N-NS": "หน้าดิน",
  "N-NY": "ถุงเพาะ/วัสดุเพาะ",
  "O-OG": "น้ำมัน/จารบีอื่นๆ",
  "O-OL": "น้ำมันหล่อลื่น/ไฮดรอลิค",
  "S-OP": "อุปกรณ์ประปา",
  "S-OS": "วัสดุตัดตามแบบ",
  "S-PC": "เหล็กรางน้ำ",
  "S-PI": "ท่อ",
  "S-PL": "เหล็กแผ่น",
  "S-RW": "เหล็กรางรถไฟ",
  "S-SH": "เพลา",
  "S-SR": "เหล็กเส้นแบน",
  "T-TC": "บริการซ่อม/จัดทำ",
  "V-BC": "อะไหล่เครื่องกลหนัก",
  "V-OC": "อะไหล่รถ",
  "V-TE": "ยางรถ",
};

function itemTypeFromCode(code, { vehicleMaster = false } = {}) {
  const { group, subtype } = codeParts(code);
  if (vehicleMaster) return "vehicle";
  if (group === "O" && ["FU", "LB", "GR", "OG", "OL"].includes(subtype)) return "fuel";
  if (["E", "H"].includes(group)) return "equipment";
  return "material";
}

function bagKgFromName(name) {
  const text = clean(name).toUpperCase();
  const match = text.match(/(?:\(|\s)(25|50)\s*(?:KG|กก\.?|กิโล)/i);
  return match ? Number(match[1]) : null;
}

function categoryLabel(category) {
  return `${category.groupName} / ${category.subtypeName}`;
}

function buildImportPlan(dump) {
  const categories = new Map();
  let currentGroup = "";
  let currentGroupName = "";

  for (const row of dump.ItemCode || []) {
    const group = clean(row[0]);
    const groupName = clean(row[1]);
    const subtype = clean(row[2]);
    const subtypeName = clean(row[3]);
    if (group) currentGroup = group;
    if (groupName) currentGroupName = groupName;
    if (!currentGroup || !subtype || subtype === "รหัสประเภท") continue;
    const code = `${currentGroup}-${subtype}`;
    categories.set(code, {
      category_code: code,
      category_name: `${currentGroupName || GROUP_NAMES[currentGroup] || currentGroup} / ${subtypeName || SUBTYPE_NAMES[code] || subtype}`,
      status: "active",
      groupCode: currentGroup,
      subtypeCode: subtype,
      groupName: currentGroupName || GROUP_NAMES[currentGroup] || currentGroup,
      subtypeName: subtypeName || SUBTYPE_NAMES[code] || subtype,
    });
  }

  const summaryKey = Object.keys(dump).find((key) => key.includes("Item") && key !== "ItemCode");
  if (!summaryKey) throw new Error("Missing summary item sheet");
  const itemRows = dump[summaryKey].slice(1).filter((row) => clean(row[0]));
  const units = new Map();
  const codeSeen = new Map();
  const materials = [];
  const inventory = [];

  for (const row of itemRows) {
    const originalCode = clean(row[0]);
    const itemName = clean(row[1]);
    const unitName = clean(row[2]);
    if (!originalCode || !itemName) continue;
    const parts = codeParts(originalCode);
    if (!categories.has(parts.categoryCode)) {
      categories.set(parts.categoryCode, {
        category_code: parts.categoryCode,
        category_name: `${GROUP_NAMES[parts.group] || `หมวด ${parts.group}`} / ${SUBTYPE_NAMES[parts.categoryCode] || `ประเภท ${parts.subtype}`}`,
        status: "active",
        groupCode: parts.group,
        subtypeCode: parts.subtype,
        groupName: GROUP_NAMES[parts.group] || `หมวด ${parts.group}`,
        subtypeName: SUBTYPE_NAMES[parts.categoryCode] || `ประเภท ${parts.subtype}`,
      });
    }
    if (unitName) units.set(unitName, { unit_code: `U-${shortHash(unitName)}`, unit_name: unitName, base_unit: unitName, conversion_rate: 1, status: "active" });
    const duplicateNo = (codeSeen.get(originalCode) || 0) + 1;
    codeSeen.set(originalCode, duplicateNo);
    const itemCode = duplicateNo === 1 ? originalCode : `${originalCode}-D${duplicateNo}`;
    const category = categories.get(parts.categoryCode);
    const note = [
      `นำเข้าจาก ItemCode.xls`,
      duplicateNo > 1 ? `รหัสเดิมซ้ำ: ${originalCode}` : "",
      `หมวด: ${categoryLabel(category)}`,
    ].filter(Boolean).join(" | ");
    materials.push({
      material_code: itemCode,
      material_name: itemName,
      category_code_ref: parts.categoryCode,
      unit_code_ref: unitName ? `U-${shortHash(unitName)}` : "",
      status: "active",
      note,
    });
    inventory.push({
      item_code: itemCode,
      item_name: itemName,
      item_type: itemTypeFromCode(itemCode),
      category_name: categoryLabel(category),
      unit_name: unitName,
      status: "active",
      note,
    });
  }

  const vehicles = [];
  const vehicleInventory = [];
  const vehicleKey = Object.keys(dump).find((key) => key.startsWith("08-"));
  const vehicleSeen = new Map();
  for (const row of (dump[vehicleKey] || [])) {
    const group = clean(row[0]);
    const subtype = clean(row[1]);
    const product = clean(row[2]);
    const label = clean(row[3]);
    const code = clean(row[5]) || (group && subtype && product ? `${group}-${subtype}-${product}` : "");
    if (!/^V-[A-Z]+-[0-9A-Z]+$/.test(code) || !label || label === "0") continue;
    const categoryCode = `${group}-${subtype}`;
    if (!categories.has(categoryCode)) {
      categories.set(categoryCode, {
        category_code: categoryCode,
        category_name: `${GROUP_NAMES[group] || `หมวด ${group}`} / ${SUBTYPE_NAMES[categoryCode] || label}`,
        status: "active",
        groupCode: group,
        subtypeCode: subtype,
        groupName: GROUP_NAMES[group] || `หมวด ${group}`,
        subtypeName: SUBTYPE_NAMES[categoryCode] || label,
      });
    }
    const duplicateNo = (vehicleSeen.get(code) || 0) + 1;
    vehicleSeen.set(code, duplicateNo);
    const vehicleCode = duplicateNo === 1 ? code : `${code}-D${duplicateNo}`;
    const category = categories.get(categoryCode);
    const vehicleType = category.subtypeName || subtype;
    vehicles.push({
      vehicle_code: vehicleCode,
      vehicle_name: `${vehicleType} ${label}`,
      vehicle_type: vehicleType,
      plate_no: label,
      status: "active",
      note: duplicateNo > 1 ? `รหัสเดิมซ้ำ: ${code} | นำเข้าจาก ItemCode.xls` : "นำเข้าจาก ItemCode.xls",
    });
    vehicleInventory.push({
      item_code: vehicleCode,
      item_name: `${vehicleType} ${label}`,
      item_type: "vehicle",
      category_name: categoryLabel(category),
      unit_name: "คัน",
      plate_no: label,
      status: "active",
      note: "รายการรถ/เครื่องจักรจากชีต 08-V",
    });
  }

  return {
    source: { workbook: "ItemCode.xls", summarySheet: summaryKey, vehicleSheet: vehicleKey },
    categories: [...categories.values()].map(({ groupCode, subtypeCode, groupName, subtypeName, ...row }) => row).sort((a, b) => a.category_code.localeCompare(b.category_code)),
    units: [...units.values()].sort((a, b) => a.unit_name.localeCompare(b.unit_name, "th")),
    materials,
    inventory: [...inventory, ...vehicleInventory],
    vehicles,
  };
}

async function apiGet(tables) {
  const res = await fetch(`${API}?tables=${encodeURIComponent(tables.join(","))}&limit=50000`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || JSON.stringify(data.errors || data));
  return data.tables || {};
}

async function apiPost(table, rows, reason) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
  let count = 0;
  const warnings = [];
  for (const part of chunks) {
    const res = await fetch(`${API}?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, rows: part, reason }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(`${table}: ${data.error || JSON.stringify(data)}`);
    count += data.count || part.length;
    warnings.push(...(data.warnings || []));
  }
  return { count, warnings: [...new Set(warnings)] };
}

function byField(rows, field) {
  const map = new Map();
  for (const row of rows || []) if (row[field]) map.set(String(row[field]), row);
  return map;
}

async function main() {
  const plan = buildImportPlan(readJson(dumpPath));
  const bagConversions = plan.materials
    .map((row) => ({ row, kg: bagKgFromName(row.material_name) }))
    .filter((item) => item.kg);
  console.log(JSON.stringify({
    source: plan.source,
    counts: {
      categories: plan.categories.length,
      units: plan.units.length,
      materials: plan.materials.length,
      inventory: plan.inventory.length,
      vehicles: plan.vehicles.length,
      bagConversions: bagConversions.length,
    },
  }, null, 2));
  if (dryRun) return;

  console.log("Importing categories...");
  console.log(await apiPost("material_categories", plan.categories, "import ItemCode categories"));
  console.log("Importing units...");
  console.log(await apiPost("units", plan.units, "import ItemCode units"));

  const phase1 = await apiGet(["material_categories", "units"]);
  const categoryByCode = byField(phase1.material_categories, "category_code");
  const unitByCode = byField(phase1.units, "unit_code");
  const materials = plan.materials.map(({ category_code_ref, unit_code_ref, ...row }) => ({
    material_code: row.material_code,
    material_name: row.material_name,
    status: row.status,
    category_id: categoryByCode.get(category_code_ref)?.id || "",
    base_unit_id: unitByCode.get(unit_code_ref)?.id || "",
  }));

  console.log("Importing materials...");
  console.log(await apiPost("materials", materials, "import ItemCode materials"));
  console.log("Importing inventory master...");
  console.log(await apiPost("inventory_master", plan.inventory, "import ItemCode inventory master"));
  console.log("Importing vehicles...");
  console.log(await apiPost("vehicles", plan.vehicles, "import ItemCode vehicles"));

  const phase2 = await apiGet(["inventory_master", "units"]);
  const itemByCode = byField(phase2.inventory_master, "item_code");
  const unitByName = byField(phase2.units, "unit_name");
  const kgUnit = unitByName.get("กก.") || unitByName.get("กิโลกรัม");
  const conversionMap = new Map();
  for (const { row, kg } of bagConversions) {
    const payload = {
      id: stableUuid(`sku:${row.material_code}:bag:${kg}`),
      material_id: itemByCode.get(row.material_code)?.id || "",
      from_unit_id: unitByName.get("กระสอบ")?.id || "",
      to_unit_id: kgUnit?.id || "",
      conversion_rate: kg,
      status: "active",
    };
    if (payload.material_id && payload.from_unit_id && payload.to_unit_id) {
      conversionMap.set(payload.id, payload);
    }
  }
  const conversionRows = [...conversionMap.values()];
  console.log("Importing SKU conversions...");
  console.log(await apiPost("sku_conversions", conversionRows, "import ItemCode bag to kg conversions"));

  const verify = await apiGet(["material_categories", "units", "materials", "vehicles", "inventory_master", "sku_conversions"]);
  console.log("Verified counts:", Object.fromEntries(Object.entries(verify).map(([key, rows]) => [key, rows.length])));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
