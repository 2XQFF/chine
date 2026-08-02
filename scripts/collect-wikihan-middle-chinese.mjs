import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(repoRoot, "data", "cache", "wikihan");
const outFile = path.join(repoRoot, "wikihan-middle-chinese.js");

const sources = [
  {
    path: path.join(cacheDir, "mc-pron-baxter_heteronyms.csv"),
    heteronym: true,
  },
  {
    path: path.join(cacheDir, "mc-pron-baxter.csv"),
    heteronym: false,
  },
];

function parseLine(line) {
  const fields = line.split(",");
  if (fields.length < 5) return null;
  const [key, id, raw, baxter, ipa] = fields;
  const char = [...key.split("_")[0]][0];
  if (!char || !/\p{Script=Han}/u.test(char)) return null;
  return {
    char,
    id,
    raw,
    baxter,
    ipa,
  };
}

function pushUnique(map, item) {
  const readings = map.get(item.char) || [];
  const sig = `${item.raw}\t${item.baxter}\t${item.ipa}`;
  if (!readings.some((reading) => `${reading.raw}\t${reading.baxter}\t${reading.ipa}` === sig)) {
    readings.push({
      raw: item.raw,
      baxter: item.baxter,
      ipa: item.ipa,
      initial: "",
      initialIpa: "",
      final: "",
      finalReconstruction: item.ipa || item.baxter,
      sourceSystem: "Baxter-Sagart 2014",
      sourceId: item.id,
      source: "WikiHan",
    });
  }
  map.set(item.char, readings);
}

const byChar = new Map();
const charsWithHeteronyms = new Set();

for (const source of sources) {
  if (!fs.existsSync(source.path)) {
    throw new Error(`Missing WikiHan cache file: ${source.path}`);
  }
  const lines = fs.readFileSync(source.path, "utf8").trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const item = parseLine(line);
    if (!item) continue;
    if (source.heteronym) {
      charsWithHeteronyms.add(item.char);
      pushUnique(byChar, item);
    } else if (!charsWithHeteronyms.has(item.char)) {
      pushUnique(byChar, item);
    }
  }
}

const data = Object.fromEntries([...byChar.entries()].sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(outFile, `const WIKIHAN_MIDDLE_CHINESE_READINGS = ${JSON.stringify(data)};\n`, "utf8");

const readingCount = Object.values(data).reduce((sum, readings) => sum + readings.length, 0);
console.log(`Done. chars=${Object.keys(data).length}, readings=${readingCount}`);
