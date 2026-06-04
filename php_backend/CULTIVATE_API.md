# Cultivate API

Backend endpoint สำหรับให้หน้า web RSPO Ramp รับข้อมูลกลุ่มเมนูงานจัดการสวนปาล์มจาก Cultivate ผ่าน PHP API

## Start server

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8080 -t php_backend
```

## Endpoints

```text
GET http://127.0.0.1:8080/api/cultivate.php?resource=status
GET http://127.0.0.1:8080/api/cultivate.php?resource=menu
GET http://127.0.0.1:8080/api/cultivate.php?resource=work
```

## Config

Copy config file:

```powershell
Copy-Item php_backend\config.example.php php_backend\config.php
```

Set real Cultivate credentials with environment variables only. Do not put passwords in `webapp`, JSON, Git, or public hosting files.

```powershell
$env:CULTIVATE_BASE_URL='https://spc.cultivate-agri.com'
$env:CULTIVATE_USERNAME='your_user'
$env:CULTIVATE_PASSWORD='your_password'
$env:CULTIVATE_CACHE_TTL='300'
```

## Current mode

The endpoint currently serves normalized Cultivate cache from:

- `webapp/data/cultivate_menu.json`
- `webapp/data/cultivate_work.json`

The webapp now calls this PHP API first. If the API is offline, it falls back to the existing JSON files, so the page remains usable.

## Next live step

For true realtime data, add official Cultivate API paths or a server-side refresh implementation inside `php_backend/cultivate_client.php`. Keep login/session handling on the backend only.

## Recommended import workflow

Best practical source when backend/API from Cultivate is not available:

1. Export CSV or Excel from Cultivate pages such as Planner Workbench, Scheduler Workbench, Daily Entries, Work Order Print Outs, or Superset Operations.
2. Upload the files from the webapp panel `นำเข้า Export จาก Cultivate`, or place files in `cultivate_exports`.
3. Run import manually when needed:

```powershell
C:\Users\com_e\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe webapp\scripts\import_cultivate_export.py --input-dir cultivate_exports --output webapp\data\cultivate_work.json
```

The importer maps common Cultivate export columns to the webapp work-order model:

- Work Order / WO -> `workOrder`
- Job / Work Type -> `job`
- Activity Group -> `activityGroup`
- Activity -> `activity`
- Date / Work Date / Scheduled Date -> `date`
- Terrain / Block / Area -> `area`
- Gang / Group / Team -> `group`
- Plan / Schedule / Actual -> `planValue`, `scheduleValue`, `actualValue`
