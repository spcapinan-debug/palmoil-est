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

function master_data_base_file(): string
{
    return dirname(__DIR__, 2) . '/webapp/data/master_data.json';
}

function master_data_edits_file(): string
{
    return dirname(__DIR__, 2) . '/webapp/data/master_data_edits.json';
}

function master_data_script(): string
{
    return dirname(__DIR__, 2) . '/webapp/scripts/extract_master_data.py';
}

function master_data_load_json(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($decoded) ? $decoded : [];
}

function master_data_save_edits(array $edits): void
{
    $path = master_data_edits_file();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    file_put_contents($path, json_encode($edits, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE));
}

function master_data_refresh(): array
{
    $config = cultivate_config();
    $python = (string) ($config['python'] ?? 'python');
    $cmd = escapeshellarg($python) . ' ' . escapeshellarg(master_data_script());
    $lines = [];
    $code = 0;
    exec($cmd . ' 2>&1', $lines, $code);
    $raw = implode("\n", $lines);
    $decoded = json_decode($raw, true);
    if ($code !== 0) {
        return ['ok' => false, 'error' => $raw ?: 'Master Data refresh failed'];
    }
    return is_array($decoded) ? $decoded : ['ok' => true, 'output' => $raw];
}

function master_data_payload(): array
{
    $baseFile = master_data_base_file();
    if (!is_file($baseFile)) {
        master_data_refresh();
    }
    $payload = master_data_load_json($baseFile);
    if (!$payload) {
        return ['ok' => false, 'error' => 'Master Data cache not found'];
    }
    $edits = master_data_load_json(master_data_edits_file());
    $datasetEdits = is_array($edits['datasets'] ?? null) ? $edits['datasets'] : [];

    foreach ($payload['datasets'] as &$dataset) {
        $datasetId = (string) ($dataset['id'] ?? '');
        $editSet = is_array($datasetEdits[$datasetId] ?? null) ? $datasetEdits[$datasetId] : [];
        $updatedRows = is_array($editSet['updated'] ?? null) ? $editSet['updated'] : [];
        $addedRows = is_array($editSet['added'] ?? null) ? $editSet['added'] : [];

        foreach ($dataset['rows'] as &$row) {
            $rowId = (string) ($row['_id'] ?? '');
            if ($rowId !== '' && is_array($updatedRows[$rowId] ?? null)) {
                $row = array_replace($row, $updatedRows[$rowId]);
                $row['_edited'] = true;
            }
        }
        unset($row);

        foreach ($addedRows as $added) {
            if (is_array($added)) {
                $added['_added'] = true;
                $dataset['rows'][] = $added;
            }
        }
        $dataset['rowCount'] = count($dataset['rows']);
    }
    unset($dataset);

    $payload['source']['editsUpdatedAt'] = $edits['updatedAt'] ?? null;
    $payload['source']['editable'] = true;
    return $payload;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        json_response(master_data_payload());
        exit;
    }

    if ($method !== 'POST') {
        json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
        exit;
    }

    $body = request_json();
    $action = strtolower((string) ($body['action'] ?? 'save'));
    if ($action === 'refresh') {
        $result = master_data_refresh();
        if (($result['ok'] ?? false) !== true) {
            json_response($result, 500);
            exit;
        }
        json_response(master_data_payload());
        exit;
    }

    $datasetId = (string) ($body['datasetId'] ?? '');
    $row = is_array($body['row'] ?? null) ? $body['row'] : [];
    if ($datasetId === '' || !$row) {
        json_response(['ok' => false, 'error' => 'Missing datasetId or row'], 400);
        exit;
    }

    $edits = master_data_load_json(master_data_edits_file());
    if (!isset($edits['datasets']) || !is_array($edits['datasets'])) {
        $edits['datasets'] = [];
    }
    if (!isset($edits['datasets'][$datasetId]) || !is_array($edits['datasets'][$datasetId])) {
        $edits['datasets'][$datasetId] = ['updated' => [], 'added' => []];
    }

    $rowId = (string) ($row['_id'] ?? '');
    $row['updatedAt'] = date(DATE_ATOM);
    if ($action === 'add' || $rowId === '') {
        $row['_id'] = 'manual::' . str_replace('.', '', uniqid('', true));
        $row['_manual'] = true;
        $edits['datasets'][$datasetId]['added'][] = $row;
    } else {
        $edits['datasets'][$datasetId]['updated'][$rowId] = $row;
    }

    $edits['updatedAt'] = date(DATE_ATOM);
    master_data_save_edits($edits);
    json_response(master_data_payload());
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
