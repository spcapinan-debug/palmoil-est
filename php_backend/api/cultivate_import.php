<?php

declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../cultivate_client.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function cultivate_import_run(): array
{
    $config = cultivate_config();
    $inputDir = (string) ($config['export_import_dir'] ?? '');
    $mode = strtolower((string) ($_GET['mode'] ?? $_POST['mode'] ?? 'work'));
    $output = $mode === 'master'
        ? (string) ($config['master_cache_file'] ?? '')
        : (string) ($config['work_cache_file'] ?? '');
    $script = (string) ($config['import_script'] ?? '');
    $python = (string) ($config['python'] ?? 'python');

    if ($inputDir === '' || $output === '' || $script === '') {
        return ['ok' => false, 'error' => 'Cultivate import config is incomplete'];
    }

    if (!is_dir($inputDir)) {
        mkdir($inputDir, 0775, true);
    }

    $files = array_values(array_filter(scandir($inputDir) ?: [], static function ($name) use ($inputDir) {
        return is_file($inputDir . DIRECTORY_SEPARATOR . $name) && preg_match('/\.(csv|xlsx|xls)$/i', $name);
    }));
    if (!$files) {
        return [
            'ok' => true,
            'files' => 0,
            'rows' => 0,
            'counts' => [],
            'warning' => 'No CSV/Excel export files found in cultivate_exports',
        ];
    }

    $cmd = implode(' ', [
        escapeshellarg($python),
        escapeshellarg($script),
        '--input-dir',
        escapeshellarg($inputDir),
        '--output',
        escapeshellarg($output),
        '--mode',
        escapeshellarg($mode === 'master' ? 'master' : 'work'),
    ]);
    $lines = [];
    $code = 0;
    exec($cmd . ' 2>&1', $lines, $code);
    $raw = implode("\n", $lines);
    $decoded = json_decode($raw, true);
    if ($code !== 0) {
        return ['ok' => false, 'error' => $raw ?: 'Import failed'];
    }
    return is_array($decoded) ? $decoded : ['ok' => true, 'output' => $raw];
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $config = cultivate_config();
    $inputDir = (string) ($config['export_import_dir'] ?? '');

    if ($method === 'GET') {
        if (!is_dir($inputDir)) {
            mkdir($inputDir, 0775, true);
        }
        $files = array_values(array_filter(scandir($inputDir) ?: [], static function ($name) use ($inputDir) {
            return is_file($inputDir . DIRECTORY_SEPARATOR . $name) && preg_match('/\.(csv|xlsx|xls)$/i', $name);
        }));
        json_response([
            'ok' => true,
            'importDir' => $inputDir,
            'files' => $files,
        'workCache' => cultivate_cache_meta((string) ($config['work_cache_file'] ?? '')),
        'masterCache' => cultivate_cache_meta((string) ($config['master_cache_file'] ?? '')),
        ]);
        exit;
    }

    if ($method === 'POST') {
        if (!is_dir($inputDir)) {
            mkdir($inputDir, 0775, true);
        }
        $uploaded = [];
        foreach ($_FILES['files']['name'] ?? [] as $index => $name) {
            $tmp = $_FILES['files']['tmp_name'][$index] ?? '';
            if (!is_uploaded_file($tmp)) {
                continue;
            }
            if (!preg_match('/\.(csv|xlsx|xls)$/i', $name)) {
                continue;
            }
            $safe = preg_replace('/[^A-Za-z0-9ก-๙._ -]+/u', '_', basename($name));
            $target = $inputDir . DIRECTORY_SEPARATOR . $safe;
            move_uploaded_file($tmp, $target);
            $uploaded[] = $safe;
        }
        $result = cultivate_import_run();
        $result['uploaded'] = $uploaded;
        json_response($result, !empty($result['ok']) ? 200 : 500);
        exit;
    }

    json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
