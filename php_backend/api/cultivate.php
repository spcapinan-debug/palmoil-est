<?php

declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../cultivate_client.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
    exit;
}

$resource = strtolower((string) ($_GET['resource'] ?? 'status'));

try {
    if ($resource === 'menu') {
        json_response(cultivate_menu_payload());
        exit;
    }

    if ($resource === 'work') {
        json_response(cultivate_work_payload());
        exit;
    }

    if ($resource === 'master') {
        json_response(cultivate_master_payload());
        exit;
    }

    if ($resource === 'status') {
        json_response(cultivate_status_payload());
        exit;
    }

    if ($resource === 'refresh') {
        json_response(cultivate_auto_fetch());
        exit;
    }

    json_response(['ok' => false, 'error' => 'Unsupported Cultivate resource'], 404);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
