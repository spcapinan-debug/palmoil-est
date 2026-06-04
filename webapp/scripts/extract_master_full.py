import hashlib
import json
import re
from datetime import date, datetime
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[2]
MASTER_DIR = ROOT / "Master Data"
OUT = ROOT / "webapp" / "data" / "master_data_full.json"
MAX_SCAN_ROWS = 3000
MAX_SCAN_COLS = 140


def clean(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip()
    return value


def ascii_slug(text, fallback):
    raw = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()
    return raw[:42] if raw else fallback


def unique_headers(values):
    headers = []
    seen = {}
    for index, value in enumerate(values, start=1):
        text = str(clean(value) or f"col_{index}")
        text = text[:80]
        count = seen.get(text, 0)
        seen[text] = count + 1
        headers.append(text if count == 0 else f"{text}_{count + 1}")
    return headers


def score_header(row):
    values = [clean(v) for v in row]
    non_blank = sum(1 for v in values if v != "")
    text_count = sum(1 for v in values if isinstance(v, str) and v.strip())
    code_words = sum(1 for v in values if isinstance(v, str) and re.search(r"code|รหัส|บล็อก|block|activity|partner|terrain|material", v, re.I))
    return non_blank + text_count * 2 + code_words * 3


def detect_header(rows):
    best_index = 0
    best_score = -1
    for i, row in enumerate(rows[:25]):
        score = score_header(row)
        if score > best_score:
            best_score = score
            best_index = i
    return best_index


def last_nonblank_col(rows):
    last = 0
    for row in rows:
        for idx, value in enumerate(row, start=1):
            if clean(value) != "":
                last = max(last, idx)
    return last


def infer_domain(file_name, sheet_name, columns):
    text = f"{file_name} {sheet_name} {' '.join(columns)}".lower()
    checks = [
        ("terrains", ["terrain", "บล็อก", "บล๊อก", "พื้นที่", "แปลง"]),
        ("activities", ["activity", "กิจกรรม", "workcode"]),
        ("partners", ["partner", "contractor", "employee", "first_name"]),
        ("materials", ["material", "fertilizer", "ปุ๋ย", "สารเคมี"]),
        ("equipment", ["equipment"]),
        ("warehouse", ["warehouse"]),
        ("budget", ["งบ", "ค่าใช้จ่าย", "ค่าแรง", "อัตราจ้าง", "ประมาณการ"]),
        ("crops", ["crop"]),
        ("companies", ["company"]),
        ("systems", ["system", "work system"]),
    ]
    for domain, needles in checks:
        if any(needle.lower() in text for needle in needles):
            return domain
    return "reference"


def infer_primary_key(columns, domain):
    priorities = [
        "block_code", "รหัสบล๊อกใหม่", "รหัสบล็อก", "รหัสบล๊อก", "Terrain given code", "terrain",
        "partner", "Material Given Code", "material_group", "Activity Code", "Activity given Code",
        "activity", "Company Code", "Crop given code", "WorkCode", "APcode", "code", "รหัส",
    ]
    lower_map = {str(col).lower(): col for col in columns}
    for name in priorities:
        for col in columns:
            if name.lower() == str(col).lower() or name.lower() in str(col).lower():
                return col
    if domain == "budget":
        for col in columns:
            if "บล็อก" in str(col) or "block" in str(col).lower():
                return col
    return columns[0] if columns else "id"


def infer_refs(columns):
    refs = []
    for col in columns:
        c = str(col).lower()
        if "block" in c or "บล็อก" in str(col) or "บล๊อก" in str(col) or "terrain" in c:
            refs.append({"field": col, "refDomain": "terrains", "refKey": "block_code/terrain"})
        elif "activity" in c or "กิจกรรม" in str(col) or "workcode" in c:
            refs.append({"field": col, "refDomain": "activities", "refKey": "activity_code"})
        elif "partner" in c or "contractor" in c or "employee" in c:
            refs.append({"field": col, "refDomain": "partners", "refKey": "partner"})
        elif "material" in c or "ปุ๋ย" in str(col) or "สาร" in str(col):
            refs.append({"field": col, "refDomain": "materials", "refKey": "material_code"})
        elif "company" in c:
            refs.append({"field": col, "refDomain": "companies", "refKey": "company_code"})
        elif "crop" in c:
            refs.append({"field": col, "refDomain": "crops", "refKey": "crop_code"})
    seen = set()
    out = []
    for ref in refs:
        key = (ref["field"], ref["refDomain"])
        if key not in seen:
            out.append(ref)
            seen.add(key)
    return out


def sheet_table(path, ws):
    raw_rows = []
    max_col = min(ws.max_column or 0, MAX_SCAN_COLS)
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row or 0, MAX_SCAN_ROWS), max_col=max_col, values_only=True):
        values = [clean(v) for v in row]
        if any(v != "" for v in values):
            raw_rows.append(values)
    if not raw_rows:
        return None
    header_index = detect_header(raw_rows)
    width = max(last_nonblank_col(raw_rows[: min(len(raw_rows), header_index + 30)]), 1)
    headers = unique_headers(raw_rows[header_index][:width])
    rows = []
    for idx, raw in enumerate(raw_rows[header_index + 1 :], start=header_index + 2):
        item = {}
        for i, header in enumerate(headers):
            item[header] = clean(raw[i]) if i < len(raw) else ""
        if any(v != "" for v in item.values()):
            item["_sourceRow"] = idx
            rows.append(item)
    seed = f"{path.name}|{ws.title}".encode("utf-8")
    digest = hashlib.sha1(seed).hexdigest()[:8]
    domain = infer_domain(path.name, ws.title, headers)
    table_id = f"md_{ascii_slug(path.stem, 'file')}_{ascii_slug(ws.title, 'sheet')}_{digest}"
    primary_key = infer_primary_key(headers, domain)
    return {
        "id": table_id,
        "title": ws.title,
        "domain": domain,
        "sourceFile": path.name,
        "sourcePath": str(path),
        "headerRow": header_index + 1,
        "rowCount": len(rows),
        "columnCount": len(headers),
        "primaryKey": primary_key,
        "primaryLabel": str(primary_key),
        "references": infer_refs(headers),
        "columns": [{"key": h, "label": h, "type": "text"} for h in headers],
        "rows": rows,
    }


def main():
    tables = []
    skipped = []
    for path in sorted(MASTER_DIR.rglob("*")):
        if not path.is_file() or path.name.startswith("~$"):
            continue
        if path.suffix.lower() == ".xlsx":
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            for sheet in wb.sheetnames:
                table = sheet_table(path, wb[sheet])
                if table:
                    tables.append(table)
        elif path.suffix.lower() == ".xls":
            skipped.append({"file": path.name, "reason": "legacy .xls; convert to .xlsx to import rows"})
    domains = {}
    for table in tables:
        domains.setdefault(table["domain"], {"id": table["domain"], "tableCount": 0, "rowCount": 0})
        domains[table["domain"]]["tableCount"] += 1
        domains[table["domain"]]["rowCount"] += table["rowCount"]
    OUT.write_text(json.dumps({
        "ok": True,
        "sourceFolder": str(MASTER_DIR),
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "tableCount": len(tables),
        "rowCount": sum(t["rowCount"] for t in tables),
        "domains": list(domains.values()),
        "tables": tables,
        "skipped": skipped,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} tables={len(tables)} rows={sum(t['rowCount'] for t in tables)} skipped={len(skipped)}")


if __name__ == "__main__":
    main()
