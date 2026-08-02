param(
  [int]$Limit = 0
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cacheDir = Join-Path $repoRoot "data\cache"
$unihanDir = Join-Path $cacheDir "unihan"
$wiktDir = Join-Path $cacheDir "wiktionary-ltc"
$outFile = Join-Path $repoRoot "data.js"
$sourcesFile = Join-Path $repoRoot "data\sources.json"

New-Item -ItemType Directory -Force $cacheDir, $unihanDir, $wiktDir | Out-Null

function Invoke-JsonGet([string]$Url) {
  $headers = @{ "User-Agent" = "middle-chinese-study-dictionary/0.1 (personal study)" }
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      return Invoke-RestMethod -Uri $Url -Headers $headers -TimeoutSec 120
    } catch {
      if ($attempt -eq 5) { throw }
      Start-Sleep -Seconds (10 * $attempt)
    }
  }
}

function Invoke-TextGet([string]$Url) {
  $headers = @{ "User-Agent" = "middle-chinese-study-dictionary/0.1 (personal study)" }
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      $res = Invoke-WebRequest -Uri $Url -Headers $headers -TimeoutSec 120 -UseBasicParsing
      return $res.Content
    } catch {
      if ($attempt -eq 5) { throw }
      Start-Sleep -Seconds (10 * $attempt)
    }
  }
}

function Get-CodepointChar([string]$Code) {
  $hex = $Code -replace "^U\+", ""
  return [char]::ConvertFromUtf32([Convert]::ToInt32($hex, 16))
}

function Split-McReading([string]$Reading) {
  $text = $Reading.Trim()
  $parts = $text -split "\s+"
  if ($parts.Count -lt 1) { return $null }

  $cat = $parts[0]
  $tone = if ($parts.Count -gt 1) { $parts[1].Substring(0, 1) } else { "" }
  $fanqie = if ($parts.Count -gt 1 -and $parts[1].Length -gt 1) { $parts[1].Substring(1) } else { "" }

  $initial = ""
  $rest = $cat
  $initials = @("幫","滂","並","明","端","透","定","泥","知","徹","澄","孃","娘","精","清","從","从","心","邪","莊","庄","初","崇","生","俟","章","昌","常","禪","船","書","見","溪","羣","群","疑","曉","匣","影","云","雲","以","來","日")
  foreach ($ini in $initials) {
    if ($cat.StartsWith($ini)) {
      $initial = $ini
      $rest = $cat.Substring($ini.Length)
      break
    }
  }

  $openness = ""
  if ($rest.Contains("開")) { $openness = "開口" }
  elseif ($rest.Contains("合")) { $openness = "合口" }

  $division = ""
  if ($rest.Contains("重鈕三")) { $division = "重鈕三等" }
  elseif ($rest.Contains("重鈕四")) { $division = "重鈕四等" }
  elseif ($rest.Contains("一")) { $division = "一等" }
  elseif ($rest.Contains("二")) { $division = "二等" }
  elseif ($rest.Contains("三")) { $division = "三等" }
  elseif ($rest.Contains("四")) { $division = "四等" }

  $final = $rest -replace "重鈕三|重鈕四|一|二|三|四|開|合", ""
  if ($final) { $final = "$final`韻" }

  $sheMap = @{
    "東"="通攝"; "屋"="通攝"; "冬"="通攝"; "沃"="通攝"; "鍾"="通攝"; "燭"="通攝";
    "江"="江攝"; "覺"="江攝";
    "支"="止攝"; "脂"="止攝"; "之"="止攝"; "微"="止攝";
    "魚"="遇攝"; "虞"="遇攝"; "模"="遇攝";
    "齊"="蟹攝"; "祭"="蟹攝"; "泰"="蟹攝"; "佳"="蟹攝"; "皆"="蟹攝"; "夬"="蟹攝"; "灰"="蟹攝"; "咍"="蟹攝"; "廢"="蟹攝";
    "眞"="臻攝"; "真"="臻攝"; "諄"="臻攝"; "臻"="臻攝"; "文"="臻攝"; "欣"="臻攝"; "元"="臻攝"; "魂"="臻攝"; "痕"="臻攝";
    "質"="臻攝"; "術"="臻攝"; "櫛"="臻攝"; "物"="臻攝"; "迄"="臻攝"; "月"="臻攝"; "沒"="臻攝"; "麧"="臻攝";
    "寒"="山攝"; "桓"="山攝"; "刪"="山攝"; "山"="山攝"; "先"="山攝"; "仙"="山攝";
    "曷"="山攝"; "末"="山攝"; "鎋"="山攝"; "黠"="山攝"; "屑"="山攝"; "薛"="山攝";
    "蕭"="效攝"; "宵"="效攝"; "肴"="效攝"; "豪"="效攝";
    "歌"="果攝"; "戈"="果攝";
    "麻"="假攝";
    "陽"="宕攝"; "唐"="宕攝"; "藥"="宕攝"; "鐸"="宕攝";
    "庚"="梗攝"; "耕"="梗攝"; "清"="梗攝"; "青"="梗攝"; "陌"="梗攝"; "麥"="梗攝"; "昔"="梗攝"; "錫"="梗攝";
    "蒸"="曾攝"; "登"="曾攝"; "職"="曾攝"; "德"="曾攝";
    "尤"="流攝"; "侯"="流攝"; "幽"="流攝";
    "侵"="深攝"; "緝"="深攝";
    "覃"="咸攝"; "談"="咸攝"; "鹽"="咸攝"; "添"="咸攝"; "咸"="咸攝"; "銜"="咸攝"; "嚴"="咸攝"; "凡"="咸攝";
    "合"="咸攝"; "盍"="咸攝"; "葉"="咸攝"; "怗"="咸攝"; "洽"="咸攝"; "狎"="咸攝"; "業"="咸攝"; "乏"="咸攝"
  }
  $bareFinal = $final -replace "韻$", ""
  $rhymeGroup = if ($sheMap.ContainsKey($bareFinal)) { $sheMap[$bareFinal] } else { "" }

  $toneName = switch ($tone) {
    "平" { "平聲" }
    "上" { "上聲" }
    "去" { "去聲" }
    "入" { "入聲" }
    default { $tone }
  }

  return [ordered]@{
    raw = $Reading
    initial = if ($initial) { "$initial`母" } else { "" }
    initialIpa = ""
    final = $final
    finalReconstruction = ""
    division = $division
    rhymeGroup = $rhymeGroup
    openness = $openness
    tone = $toneName
    fanqie = $fanqie
  }
}

Write-Host "Downloading Unihan..."
$unihanZip = Join-Path $cacheDir "Unihan.zip"
if (-not (Test-Path $unihanZip)) {
  Invoke-WebRequest -Uri "https://unicode.org/Public/UNIDATA/Unihan.zip" -OutFile $unihanZip -TimeoutSec 300
}
if (-not (Test-Path (Join-Path $unihanDir "Unihan_Readings.txt"))) {
  Expand-Archive -LiteralPath $unihanZip -DestinationPath $unihanDir -Force
}

Write-Host "Parsing Unihan readings..."
$unihan = @{}
Get-ChildItem -Path $unihanDir -Filter "Unihan*.txt" | ForEach-Object {
  Get-Content -LiteralPath $_.FullName -Encoding UTF8 | ForEach-Object {
    if ($_ -match "^(U\+[0-9A-F]+)\s+(kMandarin|kCantonese|kJapaneseOn|kKorean|kVietnamese|kDefinition)\s+(.+)$") {
      $ch = Get-CodepointChar $Matches[1]
      if (-not $unihan.ContainsKey($ch)) { $unihan[$ch] = @{} }
      $unihan[$ch][$Matches[2]] = $Matches[3].Trim()
    }
  }
}

Write-Host "Listing Wiktionary Middle Chinese data modules..."
$categoryCache = Join-Path $wiktDir "categorymembers.json"
if (-not (Test-Path $categoryCache)) {
  $members = New-Object System.Collections.Generic.List[string]
  $docUrl = "https://en.wiktionary.org/wiki/Module:zh/data/ltc-pron/documentation"
  $docHtml = Invoke-TextGet $docUrl
  $decoded = [System.Net.WebUtility]::HtmlDecode($docHtml)
  $seen = @{}
  foreach ($m in [regex]::Matches($decoded, "<li>\s*([^<\s][^<]{0,3})\s*</li>")) {
    $leaf = $m.Groups[1].Value.Trim()
    if ($leaf.Length -eq 1 -and -not $seen.ContainsKey($leaf)) {
      $seen[$leaf] = $true
      $members.Add("Module:zh/data/ltc-pron/$leaf")
    }
  }
  if ($members.Count -lt 100) {
    Write-Host "Documentation scrape was too small; falling back to API list."
    $cmcontinue = $null
    do {
      $url = "https://en.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Middle%20Chinese%20pronunciation%20data%20modules&cmlimit=100&format=json"
      if ($cmcontinue) { $url += "&cmcontinue=$([uri]::EscapeDataString($cmcontinue))" }
      $json = Invoke-JsonGet $url
      foreach ($m in $json.query.categorymembers) {
        if ($m.title -match "^Module:zh/data/ltc-pron/.+$") { $members.Add($m.title) }
      }
      $cmcontinue = $json.continue.cmcontinue
      Start-Sleep -Seconds 2
    } while ($cmcontinue)
  }
  $members | ConvertTo-Json -Depth 2 | Set-Content -LiteralPath $categoryCache -Encoding UTF8
}
$titles = Get-Content -LiteralPath $categoryCache -Encoding UTF8 | ConvertFrom-Json
if ($Limit -gt 0) { $titles = $titles | Select-Object -First $Limit }

Write-Host "Fetching Wiktionary module contents: $($titles.Count) pages..."
$pageData = @{}
$rawDir = Join-Path $wiktDir "raw"
New-Item -ItemType Directory -Force $rawDir | Out-Null
for ($i = 0; $i -lt $titles.Count; $i++) {
  $title = [string]$titles[$i]
  $leaf = $title.Substring("Module:zh/data/ltc-pron/".Length)
  $safeName = "U+{0:X}.lua" -f [int][char]$leaf
  $rawPath = Join-Path $rawDir $safeName
  if (-not (Test-Path $rawPath)) {
    $url = "https://en.wiktionary.org/wiki/Module:zh/data/ltc-pron/$([uri]::EscapeDataString($leaf))?action=raw"
    $raw = Invoke-TextGet $url
    $raw | Set-Content -LiteralPath $rawPath -Encoding UTF8
    Start-Sleep -Milliseconds 350
  }
  $pageData[$title] = Get-Content -LiteralPath $rawPath -Encoding UTF8 -Raw
  if (($i + 1) % 250 -eq 0) {
    Write-Host "Fetched $($i + 1) / $($titles.Count)"
  }
}

Write-Host "Building dictionary..."
$dictionary = New-Object System.Collections.Generic.List[object]
foreach ($title in $titles) {
  if (-not $pageData.ContainsKey($title)) { continue }
  $leaf = $title.Substring("Module:zh/data/ltc-pron/".Length)
  if ($leaf.Length -ne 1) { continue }
  $char = $leaf
  $content = $pageData[$title]
  $matches = [regex]::Matches($content, '"([^"]+)"')
  if ($matches.Count -eq 0) { continue }

  $u = if ($unihan.ContainsKey($char)) { $unihan[$char] } else { @{} }
  $meaning = if ($u.ContainsKey("kDefinition")) { $u["kDefinition"] } else { "" }
  $readings = New-Object System.Collections.Generic.List[object]
  $n = 0
  foreach ($m in $matches) {
    $mc = Split-McReading $m.Groups[1].Value
    if (-not $mc) { continue }
    $n += 1
    $jpOn = if ($u.ContainsKey("kJapaneseOn")) { $u["kJapaneseOn"] } else { "" }
    $reading = [ordered]@{
      label = if ($meaning) { "$char 독음 $n" } else { "$char 독음 $n" }
      meaning = if ($meaning) { "$meaning (자동 수집: 독음별 의미 분화는 검토 필요)" } else { "자동 수집 항목입니다. 독음별 의미 분화는 검토 필요합니다." }
      emc = $mc
      lmc = [ordered]@{
        raw = $mc.raw
        initial = $mc.initial
        initialIpa = ""
        final = $mc.final
        finalReconstruction = ""
        division = $mc.division
        rhymeGroup = $mc.rhymeGroup
        openness = $mc.openness
        tone = $mc.tone
        fanqie = $mc.fanqie
        note = "만기중고한어 전용 재구는 아직 자동 수집되지 않았습니다."
      }
      sino = [ordered]@{
        mandarin = if ($u.ContainsKey("kMandarin")) { $u["kMandarin"] } else { "" }
        cantonese = if ($u.ContainsKey("kCantonese")) { $u["kCantonese"] } else { "" }
        japaneseGo = [ordered]@{
          modernKana = ""
          historicalKana = ""
          note = "오음/한음 구분 원자료 필요"
        }
        japaneseKan = [ordered]@{
          modernKana = ""
          historicalKana = ""
          unihanOn = $jpOn
          note = if ($jpOn) { "Unihan kJapaneseOn 원문입니다. 오음/한음 및 현대/역사적 가나 분리 검토 필요" } else { "자료 없음" }
        }
        korean = if ($u.ContainsKey("kKorean")) { $u["kKorean"] } else { "" }
        vietnamese = if ($u.ContainsKey("kVietnamese")) { $u["kVietnamese"] } else { "" }
      }
      needsReview = $true
      sources = @("Wiktionary ltc-pron", "Unicode Unihan")
    }
    $readings.Add($reading)
  }
  if ($readings.Count -gt 0) {
    $dictionary.Add([ordered]@{
      char = $char
      meaning = $meaning
      readings = @($readings)
      needsReview = $true
    })
  }
}

$sources = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  entryCount = $dictionary.Count
  readingCount = (($dictionary | ForEach-Object { $_.readings.Count }) | Measure-Object -Sum).Sum
  sources = @(
    [ordered]@{ name = "Unicode Unihan"; url = "https://unicode.org/Public/UNIDATA/Unihan.zip"; fields = @("kMandarin", "kCantonese", "kJapaneseOn", "kKorean", "kVietnamese", "kDefinition") },
    [ordered]@{ name = "Wiktionary Middle Chinese pronunciation data modules"; url = "https://en.wiktionary.org/wiki/Category:Middle_Chinese_pronunciation_data_modules"; fields = @("ltc-pron raw reading categories") }
  )
}

$jsonOptions = @{ Depth = 20 }
$dictJson = $dictionary | ConvertTo-Json @jsonOptions
$sourceJson = $sources | ConvertTo-Json @jsonOptions
$dataJs = @"
const DICTIONARY = $dictJson;

const SOURCES = $sourceJson.sources;
"@
$dataJs | Set-Content -LiteralPath $outFile -Encoding UTF8
$sourceJson | Set-Content -LiteralPath $sourcesFile -Encoding UTF8

Write-Host "Done."
Write-Host "Entries: $($sources.entryCount)"
Write-Host "Readings: $($sources.readingCount)"
Write-Host "Wrote: $outFile"
