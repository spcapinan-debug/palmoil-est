$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PALM_DATA_DIR = $root
$apiUrl = "http://127.0.0.1:8080/api/health"

function Test-Api {
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 3
        return [bool]$response.ok
    } catch {
        return $false
    }
}

if (Test-Api) {
    Write-Host "Transport backend is already running: $apiUrl"
    exit 0
}

$pythonCandidates = @(
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"),
    (Join-Path $root ".venv\Scripts\python.exe"),
    "py",
    "python"
)

$python = $null
foreach ($candidate in $pythonCandidates) {
    try {
        if ($candidate -eq "py") {
            $version = & py -3 --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                $python = "py"
                break
            }
        } else {
            $version = & $candidate --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                $python = $candidate
                break
            }
        }
    } catch {
        continue
    }
}

if (-not $python) {
    throw "Python not found. Install Python or create .venv before starting Transport backend."
}

$script = Join-Path $root "webapp\scripts\local_api_server.py"
$logDir = Join-Path $root "webapp\data"
$stdoutLog = Join-Path $logDir "transport_backend.out.log"
$stderrLog = Join-Path $logDir "transport_backend.err.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if ($python -eq "py") {
    Start-Process -FilePath "py" -ArgumentList @("-3", "`"$script`"") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
} else {
    Start-Process -FilePath $python -ArgumentList @("`"$script`"") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
}

$started = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Api) {
        $started = $true
        break
    }
}

if (-not $started) {
    if (Test-Path $stderrLog) {
        Get-Content $stderrLog -Tail 20 | ForEach-Object { Write-Host $_ }
    }
    throw "Transport backend did not start. Check Python dependencies and webapp/scripts/local_api_server.py."
}

Write-Host "Transport backend started: $apiUrl"
Write-Host "Refresh Data can now read: $root\Data.xlsx"
