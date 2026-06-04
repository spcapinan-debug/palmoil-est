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
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        json_response(cultivate_credentials_status());
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $data = request_json();
        $result = cultivate_save_credentials($data);
        json_response($result, !empty($result['ok']) ? 200 : 422);
        exit;
    }

    json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
