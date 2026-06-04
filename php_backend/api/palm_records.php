<?php

declare(strict_types=1);

require __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$resource = $_GET['resource'] ?? 'dashboard';

try {
    if ($method === 'GET' && $resource === 'dashboard') {
        $from = $_GET['from'] ?? date('Y-m-01');
        $to = $_GET['to'] ?? date('Y-m-d');

        $pdo = db();
        $harvest = $pdo->prepare(
            'SELECT harvest_date, terrain_code, terrain_description, crop_year, bunch_count, weight_kg, abw_kg
             FROM vw_daily_harvest_by_block
             WHERE harvest_date BETWEEN :from_date AND :to_date
             ORDER BY harvest_date, terrain_code'
        );
        $harvest->execute(['from_date' => $from, 'to_date' => $to]);

        $stock = $pdo->query(
            'SELECT warehouse_code, material_code, material_description, qty_base_unit, total_cost
             FROM vw_stock_balance_by_material
             ORDER BY warehouse_code, material_code'
        );

        json_response([
            'ok' => true,
            'filters' => ['from' => $from, 'to' => $to],
            'harvest_by_block' => $harvest->fetchAll(),
            'stock_balance' => $stock->fetchAll(),
        ]);
        exit;
    }

    if ($method === 'POST' && $resource === 'daily-entry') {
        $data = request_json();
        $required = ['work_order_id', 'work_date'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                json_response(['ok' => false, 'error' => "Missing field: {$field}"], 422);
                exit;
            }
        }

        $stmt = db()->prepare(
            'INSERT INTO daily_entries
             (work_order_id, work_date, partner_id, gang_code, terrain_id, qty, unit, labour_cost, material_cost, equipment_cost, status, remark)
             VALUES
             (:work_order_id, :work_date, :partner_id, :gang_code, :terrain_id, :qty, :unit, :labour_cost, :material_cost, :equipment_cost, :status, :remark)'
        );
        $stmt->execute([
            'work_order_id' => $data['work_order_id'],
            'work_date' => $data['work_date'],
            'partner_id' => $data['partner_id'] ?? null,
            'gang_code' => $data['gang_code'] ?? null,
            'terrain_id' => $data['terrain_id'] ?? null,
            'qty' => $data['qty'] ?? 0,
            'unit' => $data['unit'] ?? null,
            'labour_cost' => $data['labour_cost'] ?? 0,
            'material_cost' => $data['material_cost'] ?? 0,
            'equipment_cost' => $data['equipment_cost'] ?? 0,
            'status' => $data['status'] ?? 'OPEN',
            'remark' => $data['remark'] ?? null,
        ]);

        json_response(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
        exit;
    }

    if ($method === 'POST' && $resource === 'weighbridge-ticket') {
        $data = request_json();
        foreach (['ticket_no', 'ticket_date'] as $field) {
            if (empty($data[$field])) {
                json_response(['ok' => false, 'error' => "Missing field: {$field}"], 422);
                exit;
            }
        }

        $stmt = db()->prepare(
            'INSERT INTO weighbridge_tickets
             (ticket_no, weighbridge_id, ticket_date, material_id, partner_id, terrain_id, gross_weight_kg, tare_weight_kg, assigned_weight_kg, settlement_status, source_file)
             VALUES
             (:ticket_no, :weighbridge_id, :ticket_date, :material_id, :partner_id, :terrain_id, :gross_weight_kg, :tare_weight_kg, :assigned_weight_kg, :settlement_status, :source_file)'
        );
        $stmt->execute([
            'ticket_no' => $data['ticket_no'],
            'weighbridge_id' => $data['weighbridge_id'] ?? null,
            'ticket_date' => $data['ticket_date'],
            'material_id' => $data['material_id'] ?? null,
            'partner_id' => $data['partner_id'] ?? null,
            'terrain_id' => $data['terrain_id'] ?? null,
            'gross_weight_kg' => $data['gross_weight_kg'] ?? 0,
            'tare_weight_kg' => $data['tare_weight_kg'] ?? 0,
            'assigned_weight_kg' => $data['assigned_weight_kg'] ?? 0,
            'settlement_status' => $data['settlement_status'] ?? 'PENDING',
            'source_file' => $data['source_file'] ?? null,
        ]);

        json_response(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
        exit;
    }

    json_response(['ok' => false, 'error' => 'Unsupported endpoint'], 404);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}

