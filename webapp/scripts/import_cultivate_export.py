import argparse
import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


def norm_key(value):
    return re.sub(r"[^a-z0-9ก-๙]+", "", str(value or "").strip().lower())


FIELD_CANDIDATES = {
    "workOrder": ["workorder", "workorderno", "wo", "wonumber", "เลขใบงาน", "ใบงาน"],
    "job": ["job", "work", "worktype", "งาน", "ประเภทงาน"],
    "activityGroup": ["activitygroup", "activitygrp", "กลุ่มกิจกรรม", "กลุ่มงาน"],
    "activity": ["activity", "task", "กิจกรรม", "รายการ"],
    "status": ["status", "สถานะ"],
    "date": ["date", "workdate", "scheduleddate", "plandate", "วันที่", "วันที่ทำงาน"],
    "startTime": ["starttime", "เวลาเริ่ม", "เริ่ม"],
    "endTime": ["endtime", "เวลาสิ้นสุด", "สิ้นสุด"],
    "area": ["area", "terrain", "block", "field", "plot", "พื้นที่", "แปลง", "บล็อก"],
    "group": ["group", "gang", "team", "crew", "กลุ่ม", "ทีม", "คนงาน"],
    "planValue": ["plan", "planned", "plannedvalue", "planqty", "แผน"],
    "scheduleValue": ["schedule", "scheduled", "scheduledvalue", "scheduleqty", "กำหนด", "ตาราง"],
    "actualValue": ["actual", "actualvalue", "actualqty", "qty", "quantity", "ทำจริง", "จำนวน"],
    "unit": ["unit", "uom", "หน่วย"],
}


def find_col(columns, candidates):
    normalized = {norm_key(col): col for col in columns}
    for candidate in candidates:
        key = norm_key(candidate)
        if key in normalized:
            return normalized[key]
    for key, col in normalized.items():
        if any(norm_key(candidate) in key for candidate in candidates):
            return col
    return None


def parse_date(value):
    if pd.isna(value) or value == "":
        return ""
    parsed = pd.to_datetime(value, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return ""
    return parsed.strftime("%Y-%m-%d")


def parse_time(value):
    if pd.isna(value) or value == "":
        return ""
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    text = str(value).strip()
    match = re.search(r"(\d{1,2})[:.](\d{2})", text)
    if match:
        return f"{int(match.group(1)):02d}:{match.group(2)}"
    parsed = pd.to_datetime(text, errors="coerce")
    if not pd.isna(parsed):
        return parsed.strftime("%H:%M")
    return text


def number(value):
    if pd.isna(value) or value == "":
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    text = re.sub(r"[^0-9.\-]", "", str(value))
    try:
        return float(text) if text else 0
    except ValueError:
        return 0


def text(value):
    if pd.isna(value):
        return ""
    return str(value).strip()


def read_export(path):
    if path.suffix.lower() == ".csv":
        for encoding in ("utf-8-sig", "utf-8", "cp874"):
            try:
                return pd.read_csv(path, encoding=encoding)
            except UnicodeDecodeError:
                continue
        return pd.read_csv(path)
    return pd.read_excel(path)


def normalize_file(path):
    df = read_export(path)
    df = df.dropna(how="all")
    if df.empty:
        return []
    cols = list(df.columns)
    mapping = {field: find_col(cols, candidates) for field, candidates in FIELD_CANDIDATES.items()}
    rows = []
    for _, row in df.iterrows():
        work_order = text(row.get(mapping["workOrder"], "")) if mapping["workOrder"] else ""
        date = parse_date(row.get(mapping["date"], "")) if mapping["date"] else ""
        activity = text(row.get(mapping["activity"], "")) if mapping["activity"] else ""
        job = text(row.get(mapping["job"], "")) if mapping["job"] else activity
        if not any([work_order, date, job, activity]):
            continue
        plan_value = number(row.get(mapping["planValue"], 0)) if mapping["planValue"] else 0
        schedule_value = number(row.get(mapping["scheduleValue"], plan_value)) if mapping["scheduleValue"] else plan_value
        actual_value = number(row.get(mapping["actualValue"], 0)) if mapping["actualValue"] else 0
        rows.append({
            "workOrder": work_order or f"{path.stem}-{len(rows) + 1}",
            "job": job or activity or "ไม่ระบุงาน",
            "activityGroup": text(row.get(mapping["activityGroup"], "")) if mapping["activityGroup"] else "",
            "activity": activity,
            "status": text(row.get(mapping["status"], "")) if mapping["status"] else "",
            "date": date,
            "startTime": parse_time(row.get(mapping["startTime"], "")) if mapping["startTime"] else "",
            "endTime": parse_time(row.get(mapping["endTime"], "")) if mapping["endTime"] else "",
            "area": text(row.get(mapping["area"], "")) if mapping["area"] else "",
            "group": text(row.get(mapping["group"], "")) if mapping["group"] else "",
            "planValue": plan_value,
            "scheduleValue": schedule_value,
            "actualValue": actual_value,
            "unit": text(row.get(mapping["unit"], "")) if mapping["unit"] else "",
            "sourceFile": path.name,
        })
    return rows


MASTER_KEYWORDS = {
    "terrains": ["terrain", "terrains", "block", "plot", "field", "แปลง", "พื้นที่", "บล็อก"],
    "activities": ["activities", "activity", "กิจกรรม"],
    "activityGroups": ["activitygroup", "activitygroups", "กลุ่มกิจกรรม"],
    "gangs": ["gang", "gangs", "team", "crew", "กลุ่มคนงาน", "ทีม"],
    "partners": ["partner", "partners", "contractor", "supplier", "คู่ค้า", "ผู้รับเหมา"],
    "materials": ["material", "materials", "วัสดุ"],
    "warehouses": ["warehouse", "warehouses", "คลัง"],
    "weighbridges": ["weighbridge", "weighbridges", "เครื่องชั่ง"],
}


def classify_master_file(path, columns):
    haystack = " ".join([path.stem, *[str(col) for col in columns]])
    key = norm_key(haystack)
    for group, words in MASTER_KEYWORDS.items():
        if any(norm_key(word) in key for word in words):
            return group
    return "rawTables"


def row_identity(row, columns):
    for name in ("code", "Code", "รหัส", "id", "ID", "name", "Name", "ชื่อ"):
        if name in columns and not pd.isna(row.get(name)):
            return text(row.get(name))
    values = [text(row.get(col)) for col in columns[:3] if text(row.get(col))]
    return " | ".join(values)


def normalize_master_file(path):
    df = read_export(path).dropna(how="all")
    if df.empty:
        return None
    columns = list(df.columns)
    group = classify_master_file(path, columns)
    records = []
    for _, row in df.iterrows():
        data = {}
        for col in columns:
            value = row.get(col)
            if pd.isna(value):
                data[str(col)] = ""
            elif isinstance(value, (int, float)):
                data[str(col)] = float(value)
            else:
                data[str(col)] = str(value).strip()
        if not any(str(v).strip() for v in data.values()):
            continue
        data["_id"] = row_identity(row, columns) or f"{path.stem}-{len(records) + 1}"
        data["_sourceFile"] = path.name
        records.append(data)
    return group, records


def import_master(input_dir, output):
    files = sorted([p for p in input_dir.iterdir() if p.suffix.lower() in {".csv", ".xlsx", ".xls"}])
    payload = {
        "source": {
            "system": "SPC Cultivate",
            "capturedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "mode": "cultivate-master-export-import",
            "files": [p.name for p in files],
            "errors": [],
            "note": "Generated from Master Data CSV/Excel exports from Cultivate.",
        },
        "terrains": [],
        "activities": [],
        "activityGroups": [],
        "gangs": [],
        "partners": [],
        "materials": [],
        "warehouses": [],
        "weighbridges": [],
        "rawTables": [],
    }
    for path in files:
        try:
            result = normalize_master_file(path)
            if not result:
                continue
            group, records = result
            if group == "rawTables":
                payload["rawTables"].append({"name": path.stem, "sourceFile": path.name, "rows": records})
            else:
                payload[group].extend(records)
        except Exception as exc:
            payload["source"]["errors"].append({"file": path.name, "error": str(exc)})
    if not files:
        raise SystemExit(f"No CSV/Excel files found in {input_dir}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    counts = {key: len(value) for key, value in payload.items() if isinstance(value, list)}
    print(json.dumps({"ok": True, "files": len(files), "counts": counts, "errors": payload["source"]["errors"]}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=["work", "master"], default="work")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output = Path(args.output)
    input_dir.mkdir(parents=True, exist_ok=True)
    if args.mode == "master":
        import_master(input_dir, output)
        return

    files = sorted([p for p in input_dir.iterdir() if p.suffix.lower() in {".csv", ".xlsx", ".xls"}])
    rows = []
    errors = []
    for path in files:
        try:
            rows.extend(normalize_file(path))
        except Exception as exc:
            errors.append({"file": path.name, "error": str(exc)})
    if not files:
        raise SystemExit(f"No CSV/Excel files found in {input_dir}")

    payload = {
        "source": {
            "system": "SPC Cultivate",
            "capturedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "mode": "cultivate-export-import",
            "sourcePages": ["Cultivate CSV/Excel Export"],
            "files": [p.name for p in files],
            "errors": errors,
            "note": "Generated from CSV/Excel files exported from Cultivate. No transport/export workbook rows are used.",
        },
        "workRows": rows,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "files": len(files), "rows": len(rows), "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    main()
