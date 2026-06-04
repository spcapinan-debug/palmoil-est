import json
from datetime import date, datetime
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "Master Data" / "data plant.xlsx"
OUT = ROOT / "webapp" / "data" / "master_data_full.json"


def clean(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value).strip() if isinstance(value, str) else value


def rows_from_sheet(wb, sheet_name):
    ws = wb[sheet_name]
    raw = []
    for row in ws.iter_rows(values_only=True):
        values = [clean(v) for v in row]
        if any(v != "" for v in values):
            raw.append(values)
    if not raw:
        return []
    headers = [str(clean(v) or f"col_{i + 1}") for i, v in enumerate(raw[0])]
    rows = []
    for index, values in enumerate(raw[1:], start=2):
        item = {header: clean(values[i]) if i < len(values) else "" for i, header in enumerate(headers)}
        if any(v != "" for v in item.values()):
            item["_sourceRow"] = index
            rows.append(item)
    return rows


def table_config(table_id, title, domain, primary_key, columns, references=None, rows=None):
    return {
        "id": table_id,
        "title": title,
        "domain": domain,
        "primaryKey": primary_key,
        "primaryLabel": primary_key,
        "columns": [{"key": key, "label": label, "type": kind} for key, label, kind in columns],
        "references": references or [],
        "rows": rows or [],
        "rowCount": len(rows or []),
        "columnCount": len(columns),
    }


def add_unique(rows, seen, row, key):
    value = str(row.get(key, "")).strip()
    if not value or value in seen:
        return
    seen.add(value)
    row["_sourceRow"] = len(rows) + 1
    rows.append(row)


def build_tables():
    wb = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    terrain_rows = rows_from_sheet(wb, "Terrain")
    ap_rows = rows_from_sheet(wb, "AP")
    activity_rows = rows_from_sheet(wb, "Activity")
    system_rows = rows_from_sheet(wb, "System")
    ap_names = {clean(row.get("APcode")): clean(row.get("APname")) for row in ap_rows}
    system_names = {clean(row.get("WorkCode")): clean(row.get("WorkName")) for row in system_rows}

    terrains = []
    seen_terrains = set()
    for row in terrain_rows:
        add_unique(terrains, seen_terrains, {
            "terrain_key": clean(row.get("terrain")),
            "estate": clean(row.get("estate")),
            "zone": clean(row.get("superior")),
            "area_group": clean(row.get("wparea")),
            "area_rai": clean(row.get("area")),
            "area_planted": clean(row.get("Area Planted")),
            "tree_count": clean(row.get("# of Trees")),
            "rspo": "RSPO" if str(clean(row.get("RSPO Certified"))).upper() == "YES" else "NON-RSPO",
            "payroll_department_code": clean(row.get("Payroll Department Code")),
            "payroll_description": clean(row.get("Payroll Code Description")),
            "work_code": clean(row.get("WorkCode")),
            "work_name": system_names.get(clean(row.get("WorkCode")), ""),
            "ap_code": clean(row.get("APCode")),
            "ap_name": ap_names.get(clean(row.get("APCode")), ""),
        }, "terrain_key")

    ap = []
    seen_ap = set()
    for row in ap_rows:
        add_unique(ap, seen_ap, {
            "ap_code": clean(row.get("APcode")),
            "ap_name": clean(row.get("APname")),
            "status": "active",
        }, "ap_code")

    activity_groups = []
    activities = []
    seen_groups = set()
    seen_activities = set()
    for row in activity_rows:
        group_key = clean(row.get("Activity Group Code"))
        add_unique(activity_groups, seen_groups, {
            "activity_group_key": group_key,
            "activity_group_name": clean(row.get("Activity Group")),
            "status": "active",
        }, "activity_group_key")
        add_unique(activities, seen_activities, {
            "activity_key": clean(row.get("Activity Code")),
            "activity_name": clean(row.get("Activity")),
            "activity_group_key": group_key,
            "status": "active",
        }, "activity_key")

    systems = []
    seen_systems = set()
    for row in system_rows:
        add_unique(systems, seen_systems, {
            "work_code": clean(row.get("WorkCode")),
            "work_name": clean(row.get("WorkName")),
            "palm_age_group": clean(row.get("Y-Piant")),
            "block_pattern": clean(row.get("Block")),
            "status": "active",
        }, "work_code")

    return [
        table_config(
            "master_terrains",
            "ข้อมูลพื้นที่",
            "operation",
            "terrain_key",
            [
                ("terrain_key", "คีย์พื้นที่", "text"),
                ("estate", "Estate", "text"),
                ("zone", "โซน", "text"),
                ("area_group", "แปลง/กลุ่มพื้นที่", "text"),
                ("area_rai", "จำนวนไร่", "number"),
                ("area_planted", "พื้นที่ปลูก", "number"),
                ("tree_count", "จำนวนต้น", "number"),
                ("rspo", "RSPO", "text"),
                ("payroll_department_code", "รหัสฝ่ายค่าแรง", "text"),
                ("payroll_description", "ฝ่ายค่าแรง", "text"),
                ("work_code", "คีย์ระบบงาน", "text"),
                ("work_name", "ชื่อระบบงาน", "text"),
                ("ap_code", "คีย์ AP", "text"),
                ("ap_name", "ชื่อ AP", "text"),
            ],
            [
                {"field": "work_code", "refDomain": "system", "refKey": "work_code"},
                {"field": "ap_code", "refDomain": "ap", "refKey": "ap_code"},
            ],
            terrains,
        ),
        table_config(
            "master_ap",
            "ข้อมูล AP",
            "ap",
            "ap_code",
            [("ap_code", "คีย์ AP", "text"), ("ap_name", "ชื่อ AP", "text"), ("status", "สถานะ", "text")],
            [],
            ap,
        ),
        table_config(
            "master_activity_groups",
            "กลุ่มกิจกรรม",
            "activities",
            "activity_group_key",
            [("activity_group_key", "คีย์กลุ่มกิจกรรม", "text"), ("activity_group_name", "ชื่อกลุ่มกิจกรรม", "text"), ("status", "สถานะ", "text")],
            [],
            activity_groups,
        ),
        table_config(
            "master_activities",
            "กิจกรรม",
            "activities",
            "activity_key",
            [("activity_key", "คีย์กิจกรรม", "text"), ("activity_name", "ชื่อกิจกรรม", "text"), ("activity_group_key", "คีย์กลุ่มกิจกรรม", "text"), ("status", "สถานะ", "text")],
            [{"field": "activity_group_key", "refDomain": "activities", "refKey": "activity_group_key"}],
            activities,
        ),
        table_config(
            "master_work_systems",
            "ระบบงาน",
            "system",
            "work_code",
            [("work_code", "คีย์ระบบงาน", "text"), ("work_name", "ชื่องาน", "text"), ("palm_age_group", "กลุ่มอายุปาล์ม", "text"), ("block_pattern", "กลุ่มบล็อก", "text"), ("status", "สถานะ", "text")],
            [],
            systems,
        ),
    ]


def main():
    tables = build_tables()
    domains = {}
    for table in tables:
        domains.setdefault(table["domain"], {"id": table["domain"], "tableCount": 0, "rowCount": 0})
        domains[table["domain"]]["tableCount"] += 1
        domains[table["domain"]]["rowCount"] += table["rowCount"]
    payload = {
        "ok": True,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "tableCount": len(tables),
        "rowCount": sum(table["rowCount"] for table in tables),
        "domains": list(domains.values()),
        "tables": tables,
        "skipped": [],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} tables={payload['tableCount']} rows={payload['rowCount']}")


if __name__ == "__main__":
    main()
