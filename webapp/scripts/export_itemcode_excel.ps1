param(
  [string]$Workbook = "H:\My Drive\Work\ขนส่งออก\Master Data\ItemCode.xls",
  [string]$Output = "tmp_itemcode_dump.json"
)

$resolvedWorkbook = (Resolve-Path -LiteralPath $Workbook).Path
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($Output)) {
  $Output
} else {
  Join-Path (Get-Location) $Output
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $wb = $excel.Workbooks.Open($resolvedWorkbook)
  $book = @{}
  foreach ($ws in $wb.Worksheets) {
    $used = $ws.UsedRange
    $rows = @()
    for ($r = 1; $r -le $used.Rows.Count; $r++) {
      $values = @()
      for ($c = 1; $c -le $used.Columns.Count; $c++) {
        $values += [string]$used.Cells.Item($r, $c).Text
      }
      $rows += ,$values
    }
    $book[$ws.Name] = $rows
  }
  $wb.Close($false)
  $book | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resolvedOutput -Encoding UTF8
  Write-Host "Exported ItemCode workbook to $resolvedOutput"
} finally {
  if ($wb) { try { $wb.Close($false) } catch {} }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
