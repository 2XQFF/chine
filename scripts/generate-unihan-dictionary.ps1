param(
  [int]$Limit = 0
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$readingsFile = Join-Path $repoRoot "data\cache\unihan\Unihan_Readings.txt"
$outFile = Join-Path $repoRoot "data.js"
$sourcesFile = Join-Path $repoRoot "data\sources.json"

if (-not (Test-Path $readingsFile)) {
  throw "Unihan_Readings.txt가 없습니다. 먼저 scripts\collect-data.ps1을 실행해 Unihan을 내려받아야 합니다."
}

function Get-CodepointChar([string]$Code) {
  $hex = $Code -replace "^U\+", ""
  return [char]::ConvertFromUtf32([Convert]::ToInt32($hex, 16))
}

function New-BlankMc([string]$Note) {
  return [ordered]@{
    initial = ""
    initialIpa = ""
    final = ""
    finalReconstruction = ""
    division = ""
    rhymeGroup = ""
    openness = ""
    tone = ""
    note = $Note
  }
}

$wanted = @{
  kMandarin = "mandarin"
  kCantonese = "cantonese"
  kJapaneseOn = "japaneseOnRaw"
  kKorean = "korean"
  kVietnamese = "vietnamese"
  kDefinition = "definition"
}

$rows = @{}
Get-Content -LiteralPath $readingsFile -Encoding UTF8 | ForEach-Object {
  if ($_ -match "^(U\+[0-9A-F]+)\s+(kMandarin|kCantonese|kJapaneseOn|kKorean|kVietnamese|kDefinition)\s+(.+)$") {
    $ch = Get-CodepointChar $Matches[1]
    if (-not $rows.ContainsKey($ch)) { $rows[$ch] = @{} }
    $rows[$ch][$wanted[$Matches[2]]] = $Matches[3].Trim()
  }
}

$chars = $rows.Keys | Sort-Object
if ($Limit -gt 0) { $chars = $chars | Select-Object -First $Limit }

$dictionary = New-Object 'System.Collections.Generic.List[object[]]'
foreach ($ch in $chars) {
  $r = $rows[$ch]
  $hasReading = $r.ContainsKey("mandarin") -or $r.ContainsKey("cantonese") -or $r.ContainsKey("japaneseOnRaw") -or $r.ContainsKey("korean") -or $r.ContainsKey("vietnamese")
  if (-not $hasReading) { continue }

  $definition = if ($r.ContainsKey("definition")) { $r["definition"] } else { "" }
  $labelMeaning = if ($definition) { $definition } else { "Unihan 독음 데이터 기반 자동 수집 항목입니다." }
  $japaneseOnRaw = if ($r.ContainsKey("japaneseOnRaw")) { $r["japaneseOnRaw"] } else { "" }

  $dictionary.Add([object[]]@(
    $ch,
    $labelMeaning,
    $(if ($r.ContainsKey("mandarin")) { $r["mandarin"] } else { "" }),
    $(if ($r.ContainsKey("cantonese")) { $r["cantonese"] } else { "" }),
    $japaneseOnRaw,
    $(if ($r.ContainsKey("korean")) { $r["korean"] } else { "" }),
    $(if ($r.ContainsKey("vietnamese")) { $r["vietnamese"] } else { "" })
  ))
}

$sources = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  entryCount = $dictionary.Count
  readingCount = $dictionary.Count
  sources = @(
    [ordered]@{
      name = "Unicode Unihan"
      url = "https://unicode.org/Public/UNIDATA/Unihan.zip"
      fields = @("kMandarin", "kCantonese", "kJapaneseOn", "kKorean", "kVietnamese", "kDefinition")
    }
  )
}

$dictJson = $dictionary | ConvertTo-Json -Depth 5 -Compress
$sourceJson = $sources | ConvertTo-Json -Depth 20
$dataJs = @"
const COMPACT_DICTIONARY = $dictJson;

const SOURCES = $sourceJson.sources;
"@

$dataJs | Set-Content -LiteralPath $outFile -Encoding UTF8
$sourceJson | Set-Content -LiteralPath $sourcesFile -Encoding UTF8

Write-Host "Done."
Write-Host "Entries: $($dictionary.Count)"
Write-Host "Wrote: $outFile"
