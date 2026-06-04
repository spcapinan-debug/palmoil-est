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

try {
    $root = dirname(__DIR__, 2);
    $config = app_config();
    $python = (string) ($config['cultivate']['python'] ?? 'python');
    $script = $root . DIRECTORY_SEPARATOR . 'webapp' . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'extract_data.py';
    $output = $root . DIRECTORY_SEPARATOR . 'webapp' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'data.json';
    $cmd = implode(' ', [
        escapeshellarg($python),
        escapeshellarg($script),
        '--source',
        'query',
    ]);
    $lines = [];
    $code = 0;
    exec($cmd . ' 2>&1', $lines, $code);
    $raw = implode("\n", $lines);
    if ($code !== 0) {
        json_response(['ok' => false, 'error' => $raw ?: 'Transport query refresh failed'], 500);
        exit;
    }

    $payload = is_file($output) ? json_decode((string) file_get_contents($output), true) : null;
    $source = is_array($payload) ? ($payload['source'] ?? []) : [];
    json_response([
        'ok' => true,
        'output' => $raw,
        'source' => [
            'recordSource' => $source['recordSource'] ?? null,
            'rowCount' => $source['rowCount'] ?? null,
            'dateMin' => $source['dateMin'] ?? null,
            'dateMax' => $source['dateMax'] ?? null,
            'queryRows' => $source['query']['rowCount'] ?? null,
        ],
    ]);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
