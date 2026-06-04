import argparse
import json
from datetime import datetime
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--work-output", required=True)
    parser.add_argument("--master-output", required=True)
    args = parser.parse_args()

    credentials_path = Path(args.credentials)
    if not credentials_path.exists():
        raise SystemExit("No saved Cultivate credentials found")
    credentials = json.loads(credentials_path.read_text(encoding="utf-8"))
    if not credentials.get("username") or not credentials.get("password"):
        raise SystemExit("Saved Cultivate credentials are incomplete")

    # This intentionally does not guess hidden Cultivate API endpoints. Once the
    # official export/API URL is known, implement the authenticated request here
    # and write normalized payloads to the two output paths below.
    status = {
        "ok": False,
        "mode": "credentials-ready",
        "baseUrl": credentials.get("base_url", ""),
        "checkedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "error": "Credentials are saved. Official Cultivate API/export endpoints are still required for live auto-fetch.",
    }
    print(json.dumps(status, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == "__main__":
    main()
