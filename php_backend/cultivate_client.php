<?php

declare(strict_types=1);

function app_config(): array
{
    $configFile = __DIR__ . '/config.php';
    if (!is_file($configFile)) {
        $configFile = __DIR__ . '/config.example.php';
    }

    return require $configFile;
}

function cultivate_config(): array
{
    $config = app_config();
    $cultivate = $config['cultivate'] ?? [];
    $credentialFile = dirname(__DIR__) . '/private/cultivate_credentials.json';
    if (is_file($credentialFile)) {
        $saved = json_decode((string) file_get_contents($credentialFile), true);
        if (is_array($saved)) {
            foreach (['base_url', 'username', 'password'] as $key) {
                if (!empty($saved[$key])) {
                    $cultivate[$key] = $saved[$key];
                }
            }
        }
    }
    return $cultivate;
}

function read_json_file(string $path): array
{
    if (!is_file($path)) {
        return [];
    }

    $raw = file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function cultivate_cache_meta(string $path): array
{
    if (!is_file($path)) {
        return [
            'exists' => false,
            'updatedAt' => null,
            'ageSeconds' => null,
        ];
    }

    $mtime = filemtime($path) ?: time();
    return [
        'exists' => true,
        'updatedAt' => date(DATE_ATOM, $mtime),
        'ageSeconds' => max(0, time() - $mtime),
    ];
}

function cultivate_menu_payload(): array
{
    $config = cultivate_config();
    $path = (string) ($config['menu_cache_file'] ?? '');
    $data = $path !== '' ? read_json_file($path) : [];

    return [
        'ok' => true,
        'resource' => 'menu',
        'mode' => 'cache',
        'cache' => cultivate_cache_meta($path),
        'data' => $data,
    ];
}

function cultivate_work_payload(): array
{
    $config = cultivate_config();
    $path = (string) ($config['work_cache_file'] ?? '');
    $data = $path !== '' ? read_json_file($path) : [];

    return [
        'ok' => true,
        'resource' => 'work',
        'mode' => 'cache',
        'cache' => cultivate_cache_meta($path),
        'data' => $data,
    ];
}

function cultivate_master_payload(): array
{
    $config = cultivate_config();
    $path = (string) ($config['master_cache_file'] ?? '');
    $data = $path !== '' ? read_json_file($path) : [];

    return [
        'ok' => true,
        'resource' => 'master',
        'mode' => 'cache',
        'cache' => cultivate_cache_meta($path),
        'data' => $data,
    ];
}

function cultivate_status_payload(): array
{
    $config = cultivate_config();
    $menuPath = (string) ($config['menu_cache_file'] ?? '');
    $workPath = (string) ($config['work_cache_file'] ?? '');
    $masterPath = (string) ($config['master_cache_file'] ?? '');

    return [
        'ok' => true,
        'resource' => 'status',
        'mode' => 'cache-ready',
        'baseUrl' => $config['base_url'] ?? '',
        'hasCredentials' => !empty($config['username']) && !empty($config['password']),
        'cacheTtlSeconds' => (int) ($config['cache_ttl_seconds'] ?? 300),
        'menuCache' => cultivate_cache_meta($menuPath),
        'workCache' => cultivate_cache_meta($workPath),
        'masterCache' => cultivate_cache_meta($masterPath),
        'note' => 'This endpoint serves normalized Cultivate cache now. Add official Cultivate API paths or a server-side scraper in cultivate_client.php for live refresh.',
    ];
}

function cultivate_save_credentials(array $data): array
{
    $baseUrl = trim((string) ($data['base_url'] ?? $data['baseUrl'] ?? 'https://spc.cultivate-agri.com'));
    $username = trim((string) ($data['username'] ?? ''));
    $password = (string) ($data['password'] ?? '');
    if ($username === '' || $password === '') {
        return ['ok' => false, 'error' => 'Missing username or password'];
    }
    if (!preg_match('/^https?:\/\//i', $baseUrl)) {
        return ['ok' => false, 'error' => 'Invalid Cultivate base URL'];
    }
    $dir = dirname(__DIR__) . '/private';
    if (!is_dir($dir)) {
        mkdir($dir, 0770, true);
    }
    $payload = [
        'base_url' => rtrim($baseUrl, '/'),
        'username' => $username,
        'password' => $password,
        'saved_at' => date(DATE_ATOM),
    ];
    $path = $dir . '/cultivate_credentials.json';
    file_put_contents($path, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    return [
        'ok' => true,
        'hasCredentials' => true,
        'savedAt' => $payload['saved_at'],
        'path' => $path,
    ];
}

function cultivate_credentials_status(): array
{
    $config = cultivate_config();
    $path = dirname(__DIR__) . '/private/cultivate_credentials.json';
    return [
        'ok' => true,
        'baseUrl' => $config['base_url'] ?? '',
        'hasCredentials' => !empty($config['username']) && !empty($config['password']),
        'savedAt' => is_file($path) ? date(DATE_ATOM, filemtime($path) ?: time()) : null,
    ];
}

function cultivate_auto_fetch(): array
{
    $config = cultivate_config();
    $credentialPath = dirname(__DIR__) . '/private/cultivate_credentials.json';
    if (!is_file($credentialPath)) {
        return ['ok' => false, 'error' => 'No saved Cultivate credentials'];
    }
    $script = (string) ($config['auto_fetch_script'] ?? '');
    $python = (string) ($config['python'] ?? 'python');
    $workOutput = (string) ($config['work_cache_file'] ?? '');
    $masterOutput = (string) ($config['master_cache_file'] ?? '');
    if ($script === '' || $workOutput === '' || $masterOutput === '') {
        return ['ok' => false, 'error' => 'Cultivate auto fetch config is incomplete'];
    }
    $cmd = implode(' ', [
        escapeshellarg($python),
        escapeshellarg($script),
        '--credentials',
        escapeshellarg($credentialPath),
        '--work-output',
        escapeshellarg($workOutput),
        '--master-output',
        escapeshellarg($masterOutput),
    ]);
    $lines = [];
    $code = 0;
    exec($cmd . ' 2>&1', $lines, $code);
    $raw = implode("\n", $lines);
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $decoded['exitCode'] = $code;
        return $decoded;
    }
    return ['ok' => $code === 0, 'exitCode' => $code, 'output' => $raw];
}
