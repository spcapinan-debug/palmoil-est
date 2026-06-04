<?php
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'palm_management',
        'username' => 'palm_user',
        'password' => 'change_this_password',
        'charset' => 'utf8mb4',
    ],
    'cultivate' => [
        'base_url' => getenv('CULTIVATE_BASE_URL') ?: 'https://spc.cultivate-agri.com',
        'username' => getenv('CULTIVATE_USERNAME') ?: '',
        'password' => getenv('CULTIVATE_PASSWORD') ?: '',
        'cache_ttl_seconds' => (int) (getenv('CULTIVATE_CACHE_TTL') ?: 300),
        'menu_cache_file' => __DIR__ . '/../webapp/data/cultivate_menu.json',
        'work_cache_file' => __DIR__ . '/../webapp/data/cultivate_work.json',
        'master_cache_file' => __DIR__ . '/../webapp/data/cultivate_master.json',
        'export_import_dir' => __DIR__ . '/../cultivate_exports',
        'import_script' => __DIR__ . '/../webapp/scripts/import_cultivate_export.py',
        'auto_fetch_script' => __DIR__ . '/../webapp/scripts/cultivate_auto_fetch.py',
        'python' => getenv('PYTHON_EXE') ?: 'C:\\Users\\com_e\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe',
    ],
];
