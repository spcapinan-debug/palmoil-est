<?php

declare(strict_types=1);

require __DIR__ . '/../db.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function clear_ramp_log_path(): string
{
    return dirname(__DIR__, 2)
        . DIRECTORY_SEPARATOR . 'webapp'
        . DIRECTORY_SEPARATOR . 'data'
        . DIRECTORY_SEPARATOR . 'clear_ramp_log.json';
}

function normalize_clear_ramp_row(array $row): ?array
{
    $date = (string) ($row['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return null;
    }

    return [
        'date' => $date,
        'clearPrSet' => (bool) ($row['clearPrSet'] ?? false),
        'clearTkSet' => (bool) ($row['clearTkSet'] ?? false),
        'clearPr' => (float) ($row['clearPr'] ?? 0),
        'clearTk' => (float) ($row['clearTk'] ?? 0),
        'note' => function_exists('mb_substr')
            ? mb_substr((string) ($row['note'] ?? ''), 0, 500)
            : substr((string) ($row['note'] ?? ''), 0, 500),
        'source' => 'manual',
        'updatedAt' => (string) ($row['updatedAt'] ?? gmdate('c')),
    ];
}

function read_clear_ramp_rows(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $payload = json_decode((string) file_get_contents($path), true);
    if (!is_array($payload)) {
        return [];
    }
    $rows = $payload['rows'] ?? $payload;
    if (!is_array($rows)) {
        return [];
    }
    $normalized = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $clean = normalize_clear_ramp_row($row);
        if ($clean !== null) {
            $normalized[$clean['date']] = $clean;
        }
    }
    ksort($normalized);
    return array_values($normalized);
}

function write_clear_ramp_rows(string $path, array $rows): void
{
    $normalized = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $clean = normalize_clear_ramp_row($row);
        if ($clean !== null) {
            $normalized[$clean['date']] = $clean;
        }
    }
    ksort($normalized);
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    $payload = [
        'ok' => true,
        'source' => [
            'type' => 'clear_ramp_log',
            'updatedAt' => gmdate('c'),
            'rowCount' => count($normalized),
        ],
        'rows' => array_values($normalized),
    ];
    file_put_contents($path, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE));
}

try {
    $path = clear_ramp_log_path();

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($input) || !is_array($input['rows'] ?? null)) {
            json_response(['ok' => false, 'error' => 'Invalid clear ramp payload'], 400);
            exit;
        }
        write_clear_ramp_rows($path, $input['rows']);
    }

    $rows = read_clear_ramp_rows($path);
    json_response([
        'ok' => true,
        'source' => [
            'type' => 'clear_ramp_log',
            'rowCount' => count($rows),
            'path' => basename($path),
        ],
        'rows' => $rows,
    ]);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
