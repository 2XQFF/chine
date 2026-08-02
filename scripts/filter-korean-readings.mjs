import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(repoRoot, "data.js");
const libhangulFile = path.join(repoRoot, "data", "cache", "libhangul", "hanja.txt");
const unihanReadingsFile = path.join(repoRoot, "data", "cache", "unihan", "Unihan_Readings.txt");
const curatedKeepHangul = new Map();
const curatedKeepRoman = new Map();

function loadData() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(dataFile, "utf8")}\nthis.rows = COMPACT_DICTIONARY; this.sources = SOURCES || [];`, ctx);
  return { rows: ctx.rows, sources: ctx.sources };
}

function loadLibhangulReadings() {
  const byChar = new Map();
  const text = fs.readFileSync(libhangulFile, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [hangul, hanja] = line.split(":");
    if ([...String(hangul || "")].length !== 1 || !/^[\uAC00-\uD7A3]$/.test(hangul)) continue;
    if ([...String(hanja || "")].length !== 1) continue;
    if (!byChar.has(hanja)) byChar.set(hanja, new Set());
    byChar.get(hanja).add(hangul);
  }
  for (const [char, readings] of curatedKeepHangul.entries()) {
    if (!byChar.has(char)) byChar.set(char, new Set());
    for (const reading of readings) byChar.get(char).add(reading);
  }
  return byChar;
}

function loadUnihanKoreanReadings() {
  const out = new Map();
  if (!fs.existsSync(unihanReadingsFile)) return out;
  const text = fs.readFileSync(unihanReadingsFile, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(U\+[0-9A-F]+)\s+kKorean\s+(.+)$/);
    if (!match) continue;
    out.set(codepointToChar(match[1]), match[2].trim());
  }
  return out;
}

function codepointToChar(codepoint) {
  return String.fromCodePoint(Number.parseInt(codepoint.slice(2), 16));
}

function splitReading(value) {
  return String(value || "").split(/\s+/).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function koreanTokenToHangul(token) {
  const raw = String(token || "").toUpperCase();
  if (/[\uAC00-\uD7A3]/.test(raw)) return token;

  const choseong = {
    "": 11, K: 0, G: 0, KK: 1, N: 2, T: 3, D: 3, TT: 4, L: 5, R: 5, M: 6, P: 7, B: 7,
    PP: 8, S: 9, SS: 10, C: 12, J: 12, CC: 13, JJ: 13, CH: 14, KH: 15, TH: 16, PH: 17, H: 18,
  };
  const jungseong = {
    YAY: 3, YAE: 3, YA: 2, YEY: 7, YE: 6, YEO: 6, YO: 12, YU: 17,
    WAY: 10, WAE: 10, WEY: 15, WE: 14, WI: 16, WA: 9, WO: 14, WU: 13,
    OY: 11, UY: 19,
    AY: 1, AE: 1, EY: 5, EI: 5, EO: 4,
    A: 0, E: 4, O: 8, U: 18, I: 20,
  };
  const jongseong = { "": 0, K: 1, N: 4, T: 7, L: 8, M: 16, P: 17, S: 19, SS: 20, NG: 21, C: 22 };
  const initials = ["CH", "KH", "TH", "PH", "KK", "TT", "PP", "SS", "CC", "JJ", "K", "G", "N", "T", "D", "L", "R", "M", "P", "B", "S", "C", "J", "H", ""];
  const finals = ["NG", "SS", "K", "N", "T", "L", "M", "P", "S", "C", ""];
  const vowels = Object.keys(jungseong).sort((a, b) => b.length - a.length);

  for (const initial of initials) {
    if (!raw.startsWith(initial)) continue;
    const afterInitial = raw.slice(initial.length);
    for (const final of finals) {
      if (final && !afterInitial.endsWith(final)) continue;
      const vowel = final ? afterInitial.slice(0, -final.length) : afterInitial;
      if (!vowels.includes(vowel)) continue;
      const code = 0xac00 + (choseong[initial] * 21 + jungseong[vowel]) * 28 + jongseong[final];
      return String.fromCharCode(code);
    }
  }
  return token;
}

function addLibhangulSource(sources) {
  if (!Array.isArray(sources)) return sources;
  if (sources.some((source) => source?.name === "libhangul Hanja dictionary")) return sources;
  return [
    ...sources,
    {
      name: "libhangul Hanja dictionary",
      url: "https://github.com/libhangul/libhangul/blob/master/data/hanja/hanja.txt",
      fields: ["Hangul syllable to Hanja candidate mapping"],
    },
  ];
}

const { rows, sources } = loadData();
const attestedByChar = loadLibhangulReadings();
const unihanKoreanByChar = loadUnihanKoreanReadings();
let changedRows = 0;
let removedTokens = 0;
let protectedRows = 0;
const samples = [];

for (const row of rows) {
  const char = row[0];
  const raw = unihanKoreanByChar.get(char) || row[5] || "";
  const tokens = splitReading(raw);
  if (!tokens.length) continue;
  const attested = attestedByChar.get(char);
  if (!attested?.size) continue;

  const keepRoman = curatedKeepRoman.get(char) || new Set();
  const kept = unique(tokens.filter((token) => keepRoman.has(token) || attested.has(koreanTokenToHangul(token))));
  const next = kept.length ? kept : [tokens[0]];
  if (!kept.length && tokens.length > 1) protectedRows += 1;
  if (next.join(" ") === tokens.join(" ")) continue;
  removedTokens += tokens.length - next.length;
  changedRows += 1;
  if (samples.length < 40) {
    samples.push({
      char,
      before: tokens.map((token) => `${token}/${koreanTokenToHangul(token)}`).join(" "),
      after: next.map((token) => `${token}/${koreanTokenToHangul(token)}`).join(" "),
    });
  }
  row[5] = next.join(" ");
}

const nextSources = addLibhangulSource(sources);
fs.writeFileSync(
  dataFile,
  `const COMPACT_DICTIONARY = ${JSON.stringify(rows)};\n\nconst SOURCES = ${JSON.stringify(nextSources, null, 2)};\n`,
  "utf8",
);

console.log(`Filtered Korean readings with libhangul: changed rows=${changedRows}; removed tokens=${removedTokens}; protected rows=${protectedRows}`);
for (const sample of samples) {
  console.log(`${sample.char} ${sample.before} -> ${sample.after}`);
}
