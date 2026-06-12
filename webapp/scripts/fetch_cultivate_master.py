import json
import re
import urllib.parse
import urllib.request
import http.cookiejar
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS = ROOT / "private" / "cultivate_credentials.json"
OUT = ROOT / "webapp" / "data" / "cultivate_master_live.json"


API_TABLES = [
    ("cultivate_terrains", "พื้นที่จาก Cultivate", "cultivate_area", "terrain", "/terrainsMaster/search/v1", {}),
    ("cultivate_activity_groups", "กลุ่มกิจกรรมจาก Cultivate", "cultivate_activity", "activityGroup", "/activitiesMaster/activityGroups/v1", {"search_term": None}),
    ("cultivate_activities", "กิจกรรมจาก Cultivate", "cultivate_activity", "activity", "/activitiesMaster/search/v1", {}),
    ("cultivate_partners", "พนักงาน/ผู้รับเหมาจาก Cultivate", "cultivate_people", "partner_code", "/partnersMaster/searchPartners/v1", {}),
    ("cultivate_gangs", "กลุ่มทำงานจาก Cultivate", "cultivate_people", "gang", "/gangsMaster/search/v1", {}),
    ("cultivate_material_groups", "กลุ่มวัสดุจาก Cultivate", "cultivate_material", "materialGroup", "/materialsMaster/materialGroups/v1", {"search_term": None}),
    ("cultivate_materials", "วัสดุจาก Cultivate", "cultivate_material", "material", "/materialsMaster/search/v1", {}),
    ("cultivate_warehouses", "คลังจาก Cultivate", "cultivate_stock", "warehouse", "/warehouseMaster/search/v1", {}),
    ("cultivate_weighbridges", "เครื่องชั่งจาก Cultivate", "cultivate_stock", "weighbridge", "/weighbridgeMaster/search/v1", {}),
    ("cultivate_companies", "บริษัทจาก Cultivate", "cultivate_org", "company", "/companyMaster/search/v1", {}),
    ("cultivate_designations", "ตำแหน่งจาก Cultivate", "cultivate_people", "designation", "/designationMaster/search/v1", {}),
    ("cultivate_nationalities", "สัญชาติจาก Cultivate", "cultivate_people", "nationality", "/nationalitiesMaster/search/v1", {}),
    ("cultivate_equipment_types", "ประเภทอุปกรณ์จาก Cultivate", "cultivate_equipment", "equipment_type", "/equipmentTypeMaster/search/v1", {}),
    ("cultivate_equipments", "อุปกรณ์จาก Cultivate", "cultivate_equipment", "equipment", "/equipmentsMaster/search/v1", {}),
    ("cultivate_crops", "พืชจาก Cultivate", "cultivate_crop", "crop", "/cropsMaster/search/v1", {}),
    ("cultivate_partner_doc_types", "ประเภทเอกสารคู่ค้าจาก Cultivate", "cultivate_people", "doc_type", "/partnerDocTypeMaster/search/v1", {}),
    ("cultivate_partner_races", "เชื้อชาติจาก Cultivate", "cultivate_people", "race", "/partnerRacesMaster/search/v1", {}),
    ("cultivate_partner_religions", "ศาสนาจาก Cultivate", "cultivate_people", "religion", "/partnerReligionMaster/search/v1", {}),
    ("cultivate_partner_statutory_types", "ประเภทเลข statutory จาก Cultivate", "cultivate_people", "statutory_type", "/partnerStatutoryTypeMaster/search/v1", {}),
    ("cultivate_units", "หน่วยนับจาก Cultivate", "cultivate_common", "unit", "/unitMaster/search/v1", {}),
    ("cultivate_calendars", "ปฏิทินจาก Cultivate", "cultivate_common", "calendar", "/calendarsMaster/search/v1", {}),
    ("cultivate_allowances_deductions", "เงินเพิ่ม/เงินหักจาก Cultivate", "cultivate_payroll", "a_d", "/allowancesAndDeductionsMaster/search/v1", {}),
    ("cultivate_budget_calendars", "งบประมาณปฏิทินจาก Cultivate", "cultivate_budget", "budget", "/budgetCalendarsMaster/search/v1", {}),
    ("cultivate_leave_types", "ประเภทการลาจาก Cultivate", "cultivate_payroll", "leave_type", "/leaveMaster/search/v1", {}),
    ("cultivate_chequeroll_groups", "กลุ่มค่าแรงจาก Cultivate", "cultivate_payroll", "chequeroll_group", "/chequeRollGroupMaster/search/v1", {}),
    ("cultivate_settlement_classes", "Settlement Class จาก Cultivate", "cultivate_payroll", "partner_settlement_class", "/master-settlement-class/search/v1", {}),
    ("cultivate_estates", "Estate จาก Cultivate", "cultivate_area", "estate", "/partnersMaster/estates/v1", {}),
    ("cultivate_datagroups", "Data Group จาก Cultivate", "cultivate_security", "id", "/common/datagroups/v1", {}),
]


TABLE_META = {
    "cultivate_terrains": {
        "columns": [
            ("terrain", "รหัสพื้นที่"), ("description", "ชื่อ/รายละเอียด"), ("superior_code", "รหัสพื้นที่แม่"),
            ("superior_name", "ชื่อพื้นที่แม่"), ("estate_code", "Estate"), ("area", "พื้นที่"),
            ("status", "สถานะ"), ("terrain_type", "ประเภทพื้นที่"), ("structure_level", "ระดับโครงสร้าง"),
            ("datagroup", "Data Group"), ("datagroup_id", "FK Data Group"), ("company_code", "บริษัท"),
            ("characteristic_class", "Characteristic Class"), ("terrain_id", "Master Key"),
        ],
        "references": [
            {"field": "superior_code", "refTable": "cultivate_terrains", "refDomain": "cultivate_area", "refKey": "terrain"},
            {"field": "estate_code", "refTable": "cultivate_estates", "refDomain": "cultivate_area", "refKey": "estate"},
            {"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"},
            {"field": "company_code", "refTable": "cultivate_companies", "refDomain": "cultivate_org", "refKey": "company"},
        ],
    },
    "cultivate_activity_groups": {
        "columns": [("activityGroup", "รหัสกลุ่มกิจกรรม"), ("description", "ชื่อกลุ่มกิจกรรม"), ("datagroup", "Data Group"), ("datagroup_id", "FK Data Group"), ("activityGroupId", "Master Key")],
        "references": [{"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"}],
    },
    "cultivate_activities": {
        "columns": [
            ("activity", "รหัสกิจกรรม"), ("description", "ชื่อกิจกรรม"), ("activityGroup", "FK กลุ่มกิจกรรม"),
            ("status", "สถานะ"), ("quantityType", "ประเภทปริมาณ"), ("costSetting", "รูปแบบต้นทุน"),
            ("materialInputType", "รูปแบบวัสดุ"), ("datagroup", "Data Group"), ("datagroup_id", "FK Data Group"),
            ("activityPair", "กิจกรรมคู่"), ("activityId", "Master Key"),
        ],
        "references": [
            {"field": "activityGroup", "refTable": "cultivate_activity_groups", "refDomain": "cultivate_activity", "refKey": "activityGroup"},
            {"field": "activityPair", "refTable": "cultivate_activities", "refDomain": "cultivate_activity", "refKey": "activity"},
            {"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"},
        ],
    },
    "cultivate_partners": {
        "columns": [
            ("partner_code", "รหัสพนักงาน/ผู้รับเหมา"), ("fullName", "ชื่อ"), ("type", "ประเภท"),
            ("designation_code", "FK ตำแหน่ง"), ("designation_name", "ชื่อตำแหน่ง"), ("gang", "FK กลุ่มทำงาน"),
            ("location", "Estate"), ("nationality_code", "FK สัญชาติ"), ("nationality_name", "ชื่อสัญชาติ"),
            ("gender", "เพศ"), ("startDate", "วันที่เริ่ม"), ("leftDate", "วันที่ออก"), ("datagroup_id", "FK Data Group"),
            ("partnerId", "Master Key"),
        ],
        "references": [
            {"field": "designation_code", "refTable": "cultivate_designations", "refDomain": "cultivate_people", "refKey": "designation"},
            {"field": "gang", "refTable": "cultivate_gangs", "refDomain": "cultivate_people", "refKey": "gang"},
            {"field": "nationality_code", "refTable": "cultivate_nationalities", "refDomain": "cultivate_people", "refKey": "nationality"},
            {"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"},
        ],
    },
    "cultivate_gangs": {
        "columns": [("gang", "รหัสกลุ่มทำงาน"), ("name", "ชื่อกลุ่ม"), ("description", "รายละเอียด"), ("estate_code", "FK Estate"), ("status", "สถานะ"), ("gang_leader", "หัวหน้ากลุ่ม"), ("datagroup_id", "FK Data Group"), ("gang_id", "Master Key")],
        "references": [
            {"field": "estate_code", "refTable": "cultivate_estates", "refDomain": "cultivate_area", "refKey": "estate"},
            {"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"},
        ],
    },
    "cultivate_material_groups": {
        "columns": [("materialGroup", "รหัสกลุ่มวัสดุ"), ("name", "ชื่อกลุ่มวัสดุ"), ("materialGroupId", "Master Key")],
        "references": [],
    },
    "cultivate_materials": {
        "columns": [
            ("material", "รหัสวัสดุ"), ("description", "ชื่อวัสดุ"), ("material_group_code", "FK กลุ่มวัสดุ"),
            ("material_group_name", "ชื่อกลุ่มวัสดุ"),
            ("unit_code", "FK หน่วยนับ"), ("unit_name", "ชื่อหน่วย"), ("company_code", "บริษัท"),
            ("status", "สถานะ"), ("rate", "อัตรา"), ("avg_price", "ราคาเฉลี่ย"), ("applicationRate", "อัตราใช้"),
            ("materialId", "Master Key"),
        ],
        "references": [
            {"field": "material_group_code", "refTable": "cultivate_material_groups", "refDomain": "cultivate_material", "refKey": "materialGroup"},
            {"field": "unit_code", "refTable": "cultivate_units", "refDomain": "cultivate_common", "refKey": "unit"},
            {"field": "company_code", "refTable": "cultivate_companies", "refDomain": "cultivate_org", "refKey": "company"},
        ],
    },
    "cultivate_warehouses": {
        "columns": [("warehouse", "รหัสคลัง"), ("description", "ชื่อคลัง"), ("estate_code", "FK Estate"), ("company_code", "บริษัท"), ("datagroup_id", "FK Data Group"), ("warehouse_id", "Master Key")],
        "references": [
            {"field": "estate_code", "refTable": "cultivate_estates", "refDomain": "cultivate_area", "refKey": "estate"},
            {"field": "company_code", "refTable": "cultivate_companies", "refDomain": "cultivate_org", "refKey": "company"},
            {"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"},
        ],
    },
    "cultivate_weighbridges": {
        "columns": [("weighbridge", "รหัสเครื่องชั่ง"), ("description", "ชื่อเครื่องชั่ง"), ("datagroup_id", "FK Data Group"), ("weighbridges_id", "Master Key")],
        "references": [{"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"}],
    },
    "cultivate_companies": {"columns": [("company", "รหัสบริษัท"), ("description", "ชื่อบริษัท"), ("company_id", "Master Key")], "references": []},
    "cultivate_designations": {"columns": [("designation", "รหัสตำแหน่ง"), ("name", "ชื่อตำแหน่ง"), ("designation_id", "Master Key")], "references": []},
    "cultivate_nationalities": {"columns": [("nationality", "รหัสสัญชาติ"), ("name", "ชื่อสัญชาติ"), ("nationality_id", "Master Key")], "references": []},
    "cultivate_equipment_types": {"columns": [("equipment_type", "รหัสประเภทอุปกรณ์"), ("name", "ชื่อประเภทอุปกรณ์"), ("equipment_type_id", "Master Key")], "references": []},
    "cultivate_equipments": {
        "columns": [("equipment", "รหัสอุปกรณ์"), ("description", "ชื่ออุปกรณ์"), ("equipment_type_code", "FK ประเภทอุปกรณ์"), ("equipment_type_name", "ชื่อประเภท"), ("estate_code", "FK Estate"), ("company_code", "บริษัท"), ("status", "สถานะ"), ("datagroup_id", "FK Data Group"), ("equipment_id", "Master Key")],
        "references": [
            {"field": "equipment_type_code", "refTable": "cultivate_equipment_types", "refDomain": "cultivate_equipment", "refKey": "equipment_type"},
            {"field": "estate_code", "refTable": "cultivate_estates", "refDomain": "cultivate_area", "refKey": "estate"},
            {"field": "company_code", "refTable": "cultivate_companies", "refDomain": "cultivate_org", "refKey": "company"},
            {"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"},
        ],
    },
    "cultivate_crops": {"columns": [("crop", "รหัสพืช"), ("description", "ชื่อพืช"), ("system_crop", "System Crop"), ("datagroup_id", "FK Data Group"), ("crop_id", "Master Key")], "references": [{"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"}]},
    "cultivate_units": {"columns": [("unit", "รหัสหน่วย"), ("unit_text", "ชื่อหน่วย"), ("dimension", "Dimension"), ("disable", "ปิดใช้งาน"), ("unit_id", "Master Key")], "references": []},
    "cultivate_allowances_deductions": {"columns": [("a_d", "รหัสเงินเพิ่ม/หัก"), ("description", "ชื่อรายการ"), ("a_d_type", "ประเภท"), ("rate", "อัตรา"), ("rate_type", "ประเภทอัตรา"), ("taxable", "คิดภาษี"), ("requires_approval", "ต้องอนุมัติ"), ("datagroup_id", "FK Data Group"), ("a_d_id", "Master Key")], "references": [{"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"}]},
    "cultivate_chequeroll_groups": {"columns": [("chequeroll_group", "รหัสกลุ่มค่าแรง"), ("description", "ชื่อกลุ่มค่าแรง"), ("estate_code", "FK Estate"), ("owner", "ผู้ดูแล"), ("approval_scheme", "Approval Scheme"), ("datagroup_id", "FK Data Group"), ("chequeroll_group_id", "Master Key")], "references": [{"field": "estate_code", "refTable": "cultivate_estates", "refDomain": "cultivate_area", "refKey": "estate"}, {"field": "datagroup_id", "refTable": "cultivate_datagroups", "refDomain": "cultivate_security", "refKey": "id"}]},
    "cultivate_datagroups": {"columns": [("id", "Master Key"), ("datagroup_code", "รหัส Data Group"), ("datagroup_name", "ชื่อ Data Group"), ("description", "รายละเอียด")], "references": []},
    "cultivate_estates": {"columns": [("estate", "Estate"), ("estate_id", "Master Key")], "references": []},
    "cultivate_mdm_lists": {"columns": [("list_key", "รหัสรายการ"), ("list_name", "ชื่อรายการ Master Data")], "references": []},
}


TIMESTAMP_FIELDS = {
    "creation_stamp", "modification_stamp", "creationStamp", "modificationStamp",
    "startDate", "leftDate", "valid_from", "valid_to", "status_stamp",
}


def clean(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return "; ".join(str(clean(item)) for item in value if clean(item) != "")
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return value


def split_code_name(value):
    text = str(value or "").strip()
    if not text:
        return "", ""
    if " - " in text:
        code, name = text.split(" - ", 1)
        return code.strip(), name.strip()
    return text, ""


def parse_millis(value):
    if value in ("", None):
        return ""
    if isinstance(value, (int, float)) and value > 10_000_000_000:
        try:
            return datetime.fromtimestamp(value / 1000).strftime("%Y-%m-%d")
        except Exception:
            return value
    return value


def add_code_name(row, source_key, code_key, name_key):
    code, name = split_code_name(row.get(source_key))
    row[code_key] = code
    row[name_key] = name


def enrich_row(table_id, row):
    item = {key: clean(value) for key, value in row.items()}
    for key in TIMESTAMP_FIELDS:
        if key in item:
            item[key] = parse_millis(item[key])
    if isinstance(item.get("status"), bool):
        item["status"] = "Active" if item["status"] else "Inactive"

    for source, code_key, name_key in [
        ("estate", "estate_code", "estate_name"),
        ("location", "estate_code", "estate_name"),
        ("company", "company_code", "company_name"),
        ("superior", "superior_code", "superior_name"),
        ("unit", "unit_code", "unit_name"),
    ]:
        if source in item:
            add_code_name(item, source, code_key, name_key)

    if table_id == "cultivate_partners":
        item["partner_code"] = item.get("partnerIdDocument") or item.get("partnerId") or ""
        add_code_name(item, "desgination", "designation_code", "designation_name")
        add_code_name(item, "nationality", "nationality_code", "nationality_name")
        item["startDate"] = parse_millis(item.get("startDate"))
        item["leftDate"] = parse_millis(item.get("leftDate"))

    if table_id == "cultivate_equipments":
        add_code_name(item, "equipment_type_id", "equipment_type_code", "equipment_type_name")

    if table_id == "cultivate_materials":
        add_code_name(item, "materialGroup", "material_group_code", "material_group_name")

    if table_id == "cultivate_datagroups":
        add_code_name(item, "description", "datagroup_code", "datagroup_name")

    return item


def post(opener, url, payload, base_url, content_type="application/json"):
    if content_type == "application/json":
        data = json.dumps(payload).encode("utf-8")
    else:
        data = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": content_type,
            "Origin": base_url,
            "Referer": f"{base_url}/",
        },
        method="POST",
    )
    with opener.open(request, timeout=90) as response:
        text = response.read().decode("utf-8", "replace")
    return json.loads(text) if content_type == "application/json" else text


def get(opener, url, base_url):
    request = urllib.request.Request(url, headers={"Referer": f"{base_url}/"})
    with opener.open(request, timeout=90) as response:
        return response.read().decode("utf-8", "replace")


def rows_from_response(data):
    payload = data.get("data")
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return payload["data"]
    if isinstance(payload, list):
        return payload
    return []


def column_type(values):
    filtered = [value for value in values if value not in ("", None)]
    if not filtered:
        return "text"
    if all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in filtered):
        return "number"
    return "text"


def label_for_key(key):
    labels = {
        "_sourceRow": "ลำดับ",
        "created_by": "สร้างโดย",
        "createdBy": "สร้างโดย",
        "creation_stamp": "วันที่สร้าง",
        "creationStamp": "วันที่สร้าง",
        "modified_by": "แก้ไขโดย",
        "modifiedBy": "แก้ไขโดย",
        "modified_By": "แก้ไขโดย",
        "modification_stamp": "วันที่แก้ไข",
        "modificationStamp": "วันที่แก้ไข",
        "status": "สถานะ",
        "description": "ชื่อ/รายละเอียด",
        "datagroup": "Data Group",
        "datagroup_id": "FK Data Group",
    }
    return labels.get(key, key)


def table_config(table_id, title, domain, primary_key, rows):
    rows = [enrich_row(table_id, row) for row in rows]
    meta = TABLE_META.get(table_id, {})
    configured_columns = list(meta.get("columns", []))
    configured_keys = [key for key, _label in configured_columns]
    ordered_keys = []
    for key in configured_keys:
        if any(key in row for row in rows):
            ordered_keys.append(key)
    for row in rows:
        for key in row.keys():
            if key not in ordered_keys and key != "_sourceRow":
                ordered_keys.append(key)
    if primary_key not in ordered_keys and rows:
        primary_key = ordered_keys[0]
    column_labels = {key: label for key, label in configured_columns}
    columns = [
        {
            "key": key,
            "label": column_labels.get(key, label_for_key(key)),
            "type": column_type([row.get(key) for row in rows]),
        }
        for key in ordered_keys
    ]
    normalized = []
    seen = set()
    for index, row in enumerate(rows, start=1):
        item = {key: clean(row.get(key)) for key in ordered_keys}
        pk = str(item.get(primary_key) or item.get("id") or f"{table_id}-{index}").strip()
        if pk in seen:
            pk = f"{pk}__dup_{index}"
        seen.add(pk)
        item["_sourceRow"] = index
        normalized.append(item)
    return {
        "id": table_id,
        "title": title,
        "domain": domain,
        "primaryKey": primary_key,
        "primaryLabel": primary_key,
        "columns": columns,
        "references": meta.get("references", []),
        "rows": normalized,
        "rowCount": len(normalized),
        "columnCount": len(columns),
    }


def extract_mdm_lists(html):
    options = re.findall(r'<option\s+value="([^"]*)"\s*[^>]*>(.*?)</option>', html, flags=re.I | re.S)
    rows = []
    for value, label in options:
        label = re.sub(r"<[^>]+>", "", label).strip()
        if value and label:
            rows.append({"list_key": value, "list_name": label})
    return rows


def main():
    if not CREDENTIALS.exists():
        raise SystemExit(f"Missing credentials file: {CREDENTIALS}")
    credentials = json.loads(CREDENTIALS.read_text(encoding="utf-8"))
    base_url = str(credentials.get("base_url") or "https://spc.cultivate-agri.com").rstrip("/")
    username = credentials.get("username")
    password = credentials.get("password")
    if not username or not password:
        raise SystemExit("Cultivate credentials are incomplete")
    api_url = base_url.replace("://spc.", "://spc.api.")

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    require_totp = post(opener, f"{api_url}/security/requiresTOTP/v1", {"user_name": username}, base_url)
    if require_totp.get("data", {}).get("require"):
        raise SystemExit("Cultivate account requires TOTP; automatic fetch cannot continue")
    auth = post(
        opener,
        f"{api_url}/security/authenticate/v1",
        {"user": username, "password": password, "totp": None, "language": "eng"},
        base_url,
    )
    if not auth.get("session_id"):
        raise SystemExit("Cultivate authentication failed")

    # Opens the web session too, so page-derived metadata such as MDM list names is available.
    post(opener, f"{base_url}/authenticate", {"user": username, "password": password, "lang": "eng"}, base_url, "application/x-www-form-urlencoded")

    tables = []
    errors = []
    for table_id, title, domain, primary_key, endpoint, payload in API_TABLES:
        try:
            data = post(opener, f"{api_url}{endpoint}", payload, base_url)
            rows = rows_from_response(data)
            tables.append(table_config(table_id, title, domain, primary_key, rows))
        except Exception as exc:
            errors.append({"table": table_id, "endpoint": endpoint, "error": str(exc)})

    try:
        mdm_html = get(opener, f"{base_url}/web/mdm", base_url)
        tables.append(table_config(
            "cultivate_mdm_lists",
            "รายการ Master Data Lists จาก Cultivate",
            "cultivate_common",
            "list_key",
            extract_mdm_lists(mdm_html),
        ))
    except Exception as exc:
        errors.append({"table": "cultivate_mdm_lists", "endpoint": "/web/mdm", "error": str(exc)})

    domains = {}
    for table in tables:
        domains.setdefault(table["domain"], {"id": table["domain"], "tableCount": 0, "rowCount": 0})
        domains[table["domain"]]["tableCount"] += 1
        domains[table["domain"]]["rowCount"] += table["rowCount"]
    payload = {
        "ok": True,
        "source": {
            "system": "SPC Cultivate",
            "baseUrl": base_url,
            "capturedAt": datetime.now().isoformat(timespec="seconds"),
            "mode": "authenticated-api",
            "errors": errors,
        },
        "tableCount": len(tables),
        "rowCount": sum(table["rowCount"] for table in tables),
        "domains": list(domains.values()),
        "tables": tables,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "tables": payload["tableCount"],
        "rows": payload["rowCount"],
        "errors": len(errors),
        "output": str(OUT),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
