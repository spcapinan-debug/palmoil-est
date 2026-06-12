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
    ("cultivate_terrains", "พื้นที่จาก Cultivate", "cultivate_area", "terrain_id", "/terrainsMaster/search/v1", {}),
    ("cultivate_activity_groups", "กลุ่มกิจกรรมจาก Cultivate", "cultivate_activity", "activityGroupId", "/activitiesMaster/activityGroups/v1", {"search_term": None}),
    ("cultivate_activities", "กิจกรรมจาก Cultivate", "cultivate_activity", "activityId", "/activitiesMaster/search/v1", {}),
    ("cultivate_partners", "พนักงาน/ผู้รับเหมาจาก Cultivate", "cultivate_people", "partnerId", "/partnersMaster/searchPartners/v1", {}),
    ("cultivate_gangs", "กลุ่มทำงานจาก Cultivate", "cultivate_people", "gang_id", "/gangsMaster/search/v1", {}),
    ("cultivate_material_groups", "กลุ่มวัสดุจาก Cultivate", "cultivate_material", "materialGroupId", "/materialsMaster/materialGroups/v1", {"search_term": None}),
    ("cultivate_materials", "วัสดุจาก Cultivate", "cultivate_material", "materialId", "/materialsMaster/search/v1", {}),
    ("cultivate_warehouses", "คลังจาก Cultivate", "cultivate_stock", "warehouse_id", "/warehouseMaster/search/v1", {}),
    ("cultivate_weighbridges", "เครื่องชั่งจาก Cultivate", "cultivate_stock", "weighbridges_id", "/weighbridgeMaster/search/v1", {}),
    ("cultivate_companies", "บริษัทจาก Cultivate", "cultivate_org", "company_id", "/companyMaster/search/v1", {}),
    ("cultivate_designations", "ตำแหน่งจาก Cultivate", "cultivate_people", "designation_id", "/designationMaster/search/v1", {}),
    ("cultivate_nationalities", "สัญชาติจาก Cultivate", "cultivate_people", "nationality_id", "/nationalitiesMaster/search/v1", {}),
    ("cultivate_equipment_types", "ประเภทอุปกรณ์จาก Cultivate", "cultivate_equipment", "equipment_type_id", "/equipmentTypeMaster/search/v1", {}),
    ("cultivate_equipments", "อุปกรณ์จาก Cultivate", "cultivate_equipment", "equipment_id", "/equipmentsMaster/search/v1", {}),
    ("cultivate_crops", "พืชจาก Cultivate", "cultivate_crop", "crop_id", "/cropsMaster/search/v1", {}),
    ("cultivate_partner_doc_types", "ประเภทเอกสารคู่ค้าจาก Cultivate", "cultivate_people", "doc_type_id", "/partnerDocTypeMaster/search/v1", {}),
    ("cultivate_partner_races", "เชื้อชาติจาก Cultivate", "cultivate_people", "races_id", "/partnerRacesMaster/search/v1", {}),
    ("cultivate_partner_religions", "ศาสนาจาก Cultivate", "cultivate_people", "religion_id", "/partnerReligionMaster/search/v1", {}),
    ("cultivate_partner_statutory_types", "ประเภทเลข statutory จาก Cultivate", "cultivate_people", "statutory_type_id", "/partnerStatutoryTypeMaster/search/v1", {}),
    ("cultivate_units", "หน่วยนับจาก Cultivate", "cultivate_common", "unit_id", "/unitMaster/search/v1", {}),
    ("cultivate_calendars", "ปฏิทินจาก Cultivate", "cultivate_common", "calendar_id", "/calendarsMaster/search/v1", {}),
    ("cultivate_allowances_deductions", "เงินเพิ่ม/เงินหักจาก Cultivate", "cultivate_payroll", "a_d_id", "/allowancesAndDeductionsMaster/search/v1", {}),
    ("cultivate_budget_calendars", "งบประมาณปฏิทินจาก Cultivate", "cultivate_budget", "budget_id", "/budgetCalendarsMaster/search/v1", {}),
    ("cultivate_leave_types", "ประเภทการลาจาก Cultivate", "cultivate_payroll", "leave_type_id", "/leaveMaster/search/v1", {}),
    ("cultivate_chequeroll_groups", "กลุ่มค่าแรงจาก Cultivate", "cultivate_payroll", "chequeroll_group_id", "/chequeRollGroupMaster/search/v1", {}),
    ("cultivate_settlement_classes", "Settlement Class จาก Cultivate", "cultivate_payroll", "partner_settlement_class_id", "/master-settlement-class/search/v1", {}),
    ("cultivate_estates", "Estate จาก Cultivate", "cultivate_area", "estate_id", "/partnersMaster/estates/v1", {}),
    ("cultivate_datagroups", "Data Group จาก Cultivate", "cultivate_security", "id", "/common/datagroups/v1", {}),
]


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


def table_config(table_id, title, domain, primary_key, rows):
    ordered_keys = []
    for row in rows:
        for key in row.keys():
            if key not in ordered_keys:
                ordered_keys.append(key)
    if primary_key not in ordered_keys and rows:
        primary_key = ordered_keys[0]
    columns = [
        {
            "key": key,
            "label": key,
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
        "references": [],
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
