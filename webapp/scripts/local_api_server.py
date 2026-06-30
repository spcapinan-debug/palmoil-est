from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
DATA_JSON = ROOT / "webapp" / "data" / "data.json"
MILL_JSON = ROOT / "webapp" / "data" / "mill_weight.json"
CLEAR_RAMP_JSON = ROOT / "webapp" / "data" / "clear_ramp_log.json"
EXTRACT_DATA = ROOT / "webapp" / "scripts" / "extract_data.py"
EXTRACT_MILL = ROOT / "webapp" / "scripts" / "extract_mill_weight.py"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def to_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"true", "1", "yes", "y"}:
        return True
    if text in {"false", "0", "no", "n", ""}:
        return False
    return bool(value)


def normalize_clear_row(row):
    if not isinstance(row, dict):
        return None
    date = str(row.get("date") or "").strip()
    if len(date) != 10:
        return None
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return None
    return {
        "date": date,
        "clearPrSet": to_bool(row.get("clearPrSet")),
        "clearTkSet": to_bool(row.get("clearTkSet")),
        "clearPr": float(row.get("clearPr") or 0),
        "clearTk": float(row.get("clearTk") or 0),
        "note": str(row.get("note") or "")[:500],
        "source": "manual",
        "updatedAt": str(row.get("updatedAt") or now_iso()),
    }


def clear_rows_payload():
    payload = read_json(CLEAR_RAMP_JSON, {"rows": []})
    rows = payload.get("rows") if isinstance(payload, dict) else payload
    by_date = {}
    if isinstance(rows, list):
        for row in rows:
            clean = normalize_clear_row(row)
            if clean:
                by_date[clean["date"]] = clean
    return {
        "ok": True,
        "source": {
            "type": "clear_ramp_log",
            "rowCount": len(by_date),
            "path": CLEAR_RAMP_JSON.name,
        },
        "rows": [by_date[key] for key in sorted(by_date)],
    }


def save_clear_rows(rows):
    by_date = {}
    for row in rows:
        clean = normalize_clear_row(row)
        if clean:
            by_date[clean["date"]] = clean
    payload = {
        "ok": True,
        "source": {
            "type": "clear_ramp_log",
            "updatedAt": now_iso(),
            "rowCount": len(by_date),
        },
        "rows": [by_date[key] for key in sorted(by_date)],
    }
    write_json(CLEAR_RAMP_JSON, payload)
    return payload


def run_extract():
    commands = [
        [sys.executable, str(EXTRACT_DATA), "--source", "sheet"],
        [sys.executable, str(EXTRACT_MILL)],
    ]
    output = []
    for command in commands:
        completed = subprocess.run(
            command,
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        output.extend([completed.stdout.strip(), completed.stderr.strip()])
        if completed.returncode != 0:
            raise RuntimeError("\n".join(part for part in output if part) or "extract failed")
    data = read_json(DATA_JSON, {})
    mill = read_json(MILL_JSON, {})
    source = data.get("source", {}) if isinstance(data, dict) else {}
    mill_source = mill.get("source", {}) if isinstance(mill, dict) else {}
    return {
        "ok": True,
        "output": "\n".join(part for part in output if part),
        "source": {
            "recordSource": source.get("recordSource"),
            "rowCount": source.get("rowCount"),
            "dateMin": source.get("dateMin"),
            "dateMax": source.get("dateMax"),
            "queryRows": (source.get("query") or {}).get("rowCount"),
            "millRows": mill_source.get("rowCount"),
            "generatedAt": source.get("generatedAt"),
        },
        "data": data,
        "mill": mill,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "PalmLocalApi/1.0"

    def _send(self, status: int, payload) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        self._route()

    def do_POST(self):
        self._route()

    def _route(self):
        path = urlparse(self.path).path.replace("\\", "/")
        try:
            if path.endswith("/api/transport_refresh.php"):
                self._send(200, run_extract())
                return
            if path.endswith("/api/clear_ramp_log.php"):
                if self.command == "POST":
                    body = self._body_json()
                    if not isinstance(body.get("rows"), list):
                        self._send(400, {"ok": False, "error": "Invalid clear ramp payload"})
                        return
                    save_clear_rows(body["rows"])
                self._send(200, clear_rows_payload())
                return
            if path.endswith("/health") or path.endswith("/api/health"):
                self._send(200, {"ok": True, "service": "palm-local-api", "time": now_iso()})
                return
            self._send(404, {"ok": False, "error": f"Unknown route: {path}"})
        except Exception as error:
            self._send(500, {"ok": False, "error": str(error)})

    def log_message(self, format, *args):
        return


def main() -> None:
    host = "127.0.0.1"
    port = 8080
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Palm local API listening on http://{host}:{port}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
