import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(repoRoot, "data", "cache", "kanjidictvn");
const outFile = path.join(repoRoot, "hanviet.js");

fs.mkdirSync(cacheDir, { recursive: true });

async function fetchJson(url, cachePath) {
  if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const res = await fetch(url, {
    headers: { "User-Agent": "middle-chinese-study-dictionary/0.1 personal-study" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  const json = await res.json();
  fs.writeFileSync(cachePath, JSON.stringify(json), "utf8");
  return json;
}

const files = ["kanji_bank_1.json", "kanji_bank_2.json"];
const readings = {};
let totalRows = 0;
let withReading = 0;

for (const file of files) {
  const url = `https://raw.githubusercontent.com/trungnt2910/KanjiDictVN/master/out_vn/${file}`;
  const bank = await fetchJson(url, path.join(cacheDir, file));
  totalRows += bank.length;
  for (const row of bank) {
    const [char, hanViet] = row;
    if (!char || !hanViet || !hanViet.trim()) continue;
    readings[char] = hanViet.trim().replace(/\s+/g, " ");
    withReading += 1;
  }
}

const js = `const HAN_VIET_READINGS = ${JSON.stringify(readings)};\n`;
fs.writeFileSync(outFile, js, "utf8");

console.log("Done.");
console.log(`Rows: ${totalRows}`);
console.log(`Hán-Việt readings: ${Object.keys(readings).length}`);
console.log(`Wrote: ${outFile}`);
