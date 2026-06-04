param(
  [Parameter(Mandatory=$true)][string]$Workbook,
  [Parameter(Mandatory=$true)][string]$Output,
  [string]$ConnectionName = "Query from weightest111111111",
  [datetime]$StartDate = [datetime]"2026-01-01",
  [datetime]$EndDate = (Get-Date).Date
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.IO.Compression.FileSystem

$workbookSource = (Resolve-Path -LiteralPath $Workbook).Path
$tempWorkbook = Join-Path ([System.IO.Path]::GetTempPath()) ("rspo-query-" + [System.Guid]::NewGuid().ToString("N") + ".xlsx")
Copy-Item -LiteralPath $workbookSource -Destination $tempWorkbook -Force
$zip = [System.IO.Compression.ZipFile]::OpenRead($tempWorkbook)
try {
  $entry = $zip.GetEntry("xl/connections.xml")
  if ($null -eq $entry) { throw "xl/connections.xml not found in workbook" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try {
    [xml]$xml = $reader.ReadToEnd()
  } finally {
    $reader.Close()
  }
} finally {
  $zip.Dispose()
  Remove-Item -LiteralPath $tempWorkbook -Force -ErrorAction SilentlyContinue
}

$ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace("m", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
$connection = $xml.SelectSingleNode("//m:connection[@name='$ConnectionName']", $ns)
if ($null -eq $connection) {
  throw "Connection '$ConnectionName' not found"
}

$dbPr = $connection.SelectSingleNode("m:dbPr", $ns)
if ($null -eq $dbPr) {
  throw "Connection '$ConnectionName' has no dbPr"
}

$connectionString = [string]$dbPr.connection
$commandText = [string]$dbPr.command
$commandText = $commandText -replace "_x000d__x000a_", " "
$commandText = $commandText -replace "_x000D__x000A_", " "
$startLiteral = $StartDate.ToString("yyyy-MM-dd 00:00:00")
$endLiteral = $EndDate.ToString("yyyy-MM-dd 23:59:59")
$commandText = [regex]::Replace(
  $commandText,
  "weightPalm\.wpDocDate\s*>=\s*\{ts\s*'[^']+'\}",
  "weightPalm.wpDocDate>={ts '$startLiteral'}",
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)
$commandText = [regex]::Replace(
  $commandText,
  "weightPalm\.wpDocDate\s*<=\s*\{ts\s*'[^']+'\}",
  "weightPalm.wpDocDate<={ts '$endLiteral'}",
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)
if ([string]::IsNullOrWhiteSpace($connectionString) -or [string]::IsNullOrWhiteSpace($commandText)) {
  throw "Connection '$ConnectionName' is missing connection string or SQL command"
}

$conn = New-Object System.Data.Odbc.OdbcConnection($connectionString)
$cmd = $conn.CreateCommand()
$cmd.CommandText = $commandText
$cmd.CommandTimeout = 180
$adapter = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
$table = New-Object System.Data.DataTable
[void]$adapter.Fill($table)

$rows = New-Object System.Collections.Generic.List[object]
foreach ($row in $table.Rows) {
  $obj = [ordered]@{}
  foreach ($col in $table.Columns) {
    $value = $row[$col.ColumnName]
    if ($value -is [DBNull]) { $value = $null }
    elseif ($value -is [datetime]) { $value = $value.ToString("s") }
    $obj[$col.ColumnName] = $value
  }
  $rows.Add([pscustomobject]$obj)
}

$result = [ordered]@{
  source = [ordered]@{
    connectionName = $ConnectionName
    dsn = (($connectionString -split ";") | Where-Object { $_ -like "DSN=*" } | Select-Object -First 1)
    rowCount = $rows.Count
    startDate = $StartDate.ToString("yyyy-MM-dd")
    endDate = $EndDate.ToString("yyyy-MM-dd")
    generatedAt = (Get-Date).ToString("s")
  }
  rows = $rows
}

$outDir = Split-Path -Parent $Output
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Output -Encoding UTF8
Write-Output ("Wrote {0} query rows to {1}" -f $rows.Count, $Output)
