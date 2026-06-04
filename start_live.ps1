$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = "C:\Users\com_e\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$Python = "C:\Users\com_e\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (-not (Test-Path -LiteralPath $Node)) { $Node = "node" }
if (-not (Test-Path -LiteralPath $Python)) { $Python = "python" }

Write-Host "Starting live data watcher..."
$oldPython = $env:PYTHON
$env:PYTHON = $Python
$watcher = Start-Process -FilePath $Node -ArgumentList @("webapp\scripts\watch_workbook.mjs") -WorkingDirectory $Root -WindowStyle Hidden -PassThru
$env:PYTHON = $oldPython

Write-Host "Starting web server at http://127.0.0.1:8765/"
$server = Start-Process -FilePath $Python -ArgumentList @("-m", "http.server", "8765", "--bind", "127.0.0.1", "--directory", "webapp") -WorkingDirectory $Root -WindowStyle Hidden -PassThru

Write-Host "Live webapp: http://127.0.0.1:8765/"
Write-Host "Watcher PID: $($watcher.Id)"
Write-Host "Server PID: $($server.Id)"
Write-Host "Close these processes from Task Manager or run: Stop-Process -Id $($watcher.Id),$($server.Id)"
