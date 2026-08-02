import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const readingsFile = path.join(repoRoot, "data", "cache", "unihan", "Unihan_Readings.txt");
const outFile = path.join(repoRoot, "data.js");
const sourcesFile = path.join(repoRoot, "data", "sources.json");

if (!fs.existsSync(readingsFile)) {
  throw new Error("Unihan_Readings.txt가 없습니다. scripts/collect-data.ps1로 Unihan을 먼저 내려받아야 합니다.");
}

function codepointToChar(code) {
  return String.fromCodePoint(Number.parseInt(code.replace(/^U\+/, ""), 16));
}

const fieldMap = {
  kMandarin: "mandarin",
  kCantonese: "cantonese",
  kJapaneseOn: "japaneseOnRaw",
  kKorean: "korean",
  kVietnamese: "vietnamese",
  kDefinition: "definition",
};

const rows = new Map();
const text = fs.readFileSync(readingsFile, "utf8");
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^(U\+[0-9A-F]+)\s+(kMandarin|kCantonese|kJapaneseOn|kKorean|kVietnamese|kDefinition)\s+(.+)$/);
  if (!match) continue;
  const [, code, field, value] = match;
  const char = codepointToChar(code);
  if (!rows.has(char)) rows.set(char, {});
  rows.get(char)[fieldMap[field]] = value.trim();
}

const compact = [];
for (const char of [...rows.keys()].sort()) {
  const row = rows.get(char);
  const hasReading = row.mandarin || row.cantonese || row.japaneseOnRaw || row.korean || row.vietnamese;
  if (!hasReading) continue;
  compact.push([
    char,
    row.definition || "Unihan 독음 데이터 기반 자동 수집 항목입니다.",
    row.mandarin || "",
    row.cantonese || "",
    row.japaneseOnRaw || "",
    row.korean || "",
    row.vietnamese || "",
  ]);
}

const sources = {
  generatedAt: new Date().toISOString(),
  entryCount: compact.length,
  readingCount: compact.length,
  sources: [
    {
      name: "Unicode Unihan",
      url: "https://unicode.org/Public/UNIDATA/Unihan.zip",
      fields: ["kMandarin", "kCantonese", "kJapaneseOn", "kKorean", "kVietnamese", "kDefinition"],
    },
  ],
};

const dataJs = `const COMPACT_DICTIONARY = ${JSON.stringify(compact)};\n\nconst SOURCES = ${JSON.stringify(sources.sources, null, 2)};\n`;

fs.writeFileSync(outFile, dataJs, "utf8");
fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2), "utf8");

console.log(`Done.`);
console.log(`Entries: ${compact.length}`);
console.log(`Wrote: ${outFile}`);
