import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(repoRoot, "data", "cache", "ja-wiktionary-api");
const gakkenFile = path.join(repoRoot, "data", "cache", "onyomi-gakken-kanwa", "onyomi.json");
const kanjidicFile = path.join(repoRoot, "data", "cache", "kanjidic2", "kanjidic2.xml.gz");
const variantsFile = path.join(repoRoot, "han-variants.js");
const outFile = path.join(repoRoot, "japanese-readings.js");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const noFetch = process.argv.includes("--no-fetch");

fs.mkdirSync(cacheDir, { recursive: true });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, cachePath) {
  if (cachePath && fs.existsSync(cachePath)) return { json: JSON.parse(fs.readFileSync(cachePath, "utf8")), cached: true };
  if (noFetch) return { json: null, cached: false };
  for (let attempt = 1; attempt <= 7; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "middle-chinese-study-dictionary/0.1 personal-study" },
    });
    if (res.ok) {
      const json = await res.json();
      if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(json), "utf8");
      return { json, cached: false };
    }
    const wait = Math.min(90000, attempt * 10000);
    console.log(`HTTP ${res.status}; waiting ${wait}ms`);
    await sleep(wait);
  }
  throw new Error(`Failed: ${url}`);
}

function loadRows() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(path.join(repoRoot, "data.js"), "utf8")}\nthis.rows = COMPACT_DICTIONARY;`, ctx);
  return ctx.rows;
}

function loadHanVariants() {
  if (!fs.existsSync(variantsFile)) return {};
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(variantsFile, "utf8")}\nthis.variants = HAN_VARIANTS;`, ctx);
  return ctx.variants || {};
}

function loadHanDisplayForms() {
  const file = path.join(repoRoot, "han-display-forms.js");
  if (!fs.existsSync(file)) return {};
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(file, "utf8")}\nthis.forms = HAN_DISPLAY_FORMS;`, ctx);
  return ctx.forms || {};
}

function stripWiki(text) {
  return String(text || "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractTemplate(content, templateName) {
  const start = content.indexOf(`{{${templateName}`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < content.length - 1; i++) {
    const pair = content.slice(i, i + 2);
    if (pair === "{{") {
      depth += 1;
      i += 1;
    } else if (pair === "}}") {
      depth -= 1;
      i += 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return "";
}

function splitTemplateParams(template) {
  const body = template.replace(/^\{\{/, "").replace(/\}\}$/, "");
  const parts = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const pair = body.slice(i, i + 2);
    if (pair === "{{" || pair === "[[") {
      depth += 1;
      current += pair;
      i += 1;
      continue;
    }
    if ((pair === "}}" || pair === "]]") && depth > 0) {
      depth -= 1;
      current += pair;
      i += 1;
      continue;
    }
    if (body[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += body[i];
  }
  parts.push(current);
  return parts;
}

function parseNamedParams(template) {
  const params = {};
  for (const part of splitTemplateParams(template).slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    params[key] = value;
  }
  return params;
}

function parseKanaReading(text) {
  const cleaned = stripWiki(text)
    .replace(/[;；、,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const historicalKana = unique(
    [...cleaned.matchAll(/[<［\[]([^<>\[\]［］]+)[>\]］]/g)]
      .flatMap((match) => kanaRuns(match[1]))
      .map(normalizeHistoricalKana),
  ).join(" ");
  const primary = cleaned
    .replace(/[<［\[][^\]＞>］]+[>\]］]/g, " ")
    .split(/\s+/)[0] || "";
  const modernKana = unique(kanaRuns(primary)).join(" ");
  return { modernKana, historicalKana };
}

function parseGakkenReading(text) {
  const value = stripWiki(text);
  const modern = [];
  const historical = [];
  for (const part of value.split(/[,\s、;；]+/).filter(Boolean)) {
    const explicitHistorical = [...part.matchAll(/\(([^()]+)\)/g)]
      .map((match) => firstKanaRun(match[1]))
      .filter(Boolean);
    const modernKana = firstKanaRun(part.replace(/\([^()]+\)/g, " "));
    if (modernKana) modern.push(modernKana);
    if (explicitHistorical.length) {
      historical.push(...explicitHistorical);
    } else if (modernKana) {
      historical.push(modernKana);
    }
  }
  return {
    modernKana: unique(modern).join(" "),
    historicalKana: unique(historical.map(normalizeHistoricalKana)).join(" "),
  };
}

function firstKanaRun(text) {
  return (String(text || "").match(/[ァ-ヺー]+/) || [""])[0];
}

function kanaRuns(text) {
  return [...String(text || "").matchAll(/[ァ-ヺー]+/g)].map((match) => match[0]);
}

function normalizeHistoricalKana(value) {
  return String(value || "").replace(/[ァィゥェォッャュョヮ]/g, (kana) => ({
    ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ",
    ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ",
  })[kana] || kana);
}

function readingFromParams(params, names) {
  for (const name of names) {
    if (params[name]) return parseKanaReading(params[name]);
  }
  return null;
}

function parseJaKanji(content) {
  const template = extractTemplate(content, "ja-kanji");
  if (!template) return {};
  const params = parseNamedParams(template);
  const out = {};
  const go = readingFromParams(params, ["呉音", "吳音"]);
  const kan = readingFromParams(params, ["漢音"]);
  const kanyo = readingFromParams(params, ["慣用音", "惯用音"]);
  if (go?.modernKana || go?.historicalKana) out.go = go;
  if (kan?.modernKana || kan?.historicalKana) out.kan = kan;
  if (kanyo?.modernKana || kanyo?.historicalKana) out.kanyo = kanyo;
  return out;
}

function mergeReading(target, key, reading) {
  if (!reading?.modernKana && !reading?.historicalKana) return;
  const current = target[key] || { modernKana: "", historicalKana: "" };
  target[key] = {
    modernKana: unique([...splitReading(current.modernKana), ...splitReading(reading.modernKana)]).join(" "),
    historicalKana: unique([...splitReading(current.historicalKana), ...splitReading(reading.historicalKana)]).join(" "),
  };
}

function splitReading(value) {
  return String(value || "").split(/\s+/).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function mergeGakkenReadings(readings) {
  if (!fs.existsSync(gakkenFile)) return;
  const gakken = JSON.parse(fs.readFileSync(gakkenFile, "utf8"));
  let added = 0;
  for (const [char, groups] of Object.entries(gakken)) {
    if (!Array.isArray(groups)) continue;
    const target = readings[char] || {};
    const before = JSON.stringify(target);
    for (const group of groups) {
      for (const value of group["呉"] || []) mergeReading(target, "go", parseGakkenReading(value));
      for (const value of group["漢"] || []) mergeReading(target, "kan", parseGakkenReading(value));
      for (const value of group["呉漢"] || []) {
        const reading = parseGakkenReading(value);
        mergeReading(target, "go", reading);
        mergeReading(target, "kan", reading);
      }
      for (const value of group["慣"] || []) mergeReading(target, "kanyo", parseGakkenReading(value));
    }
    if (target.go || target.kan || target.kanyo) readings[char] = target;
    if (JSON.stringify(target) !== before) added += 1;
  }
  console.log(`Merged Gakken onyomi chars=${added}; total=${Object.keys(readings).length}`);
}

function mergeVariantReadings(readings, rows) {
  const variants = loadHanVariants();
  const displayForms = loadHanDisplayForms();
  const targets = rows.filter((row) => row[4]).map((row) => row[0]);
  let added = 0;
  let changedCount = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const char of targets) {
      const candidates = japaneseVariantCandidates(char, variants, displayForms);
      const target = readings[char] || {};
      const before = JSON.stringify(target);
      for (const source of candidates) {
        const sourceReading = readings[source];
        if (!sourceReading) continue;
        for (const key of ["go", "kan", "kanyo"]) mergeReading(target, key, sourceReading[key]);
      }
      if (target.go || target.kan || target.kanyo) readings[char] = target;
      if (!before && readings[char]) added += 1;
      if (JSON.stringify(target) !== before) {
        changedCount += 1;
        changed = true;
      }
    }
  }
  console.log(`Merged variant onyomi chars=${added}; changed=${changedCount}; total=${Object.keys(readings).length}`);
}

function backfillVariantHistoricalKana(readings, rows) {
  const variants = loadHanVariants();
  const displayForms = loadHanDisplayForms();
  const targets = rows.filter((row) => row[4]).map((row) => row[0]);
  let changed = 0;
  for (const char of targets) {
    const target = readings[char];
    if (!target) continue;
    const before = JSON.stringify(target);
    for (const source of japaneseVariantCandidates(char, variants, displayForms)) {
      const sourceReading = readings[source];
      if (!sourceReading) continue;
      for (const key of ["go", "kan", "kanyo"]) {
        backfillHistoricalForReading(target[key], sourceReading[key]);
      }
    }
    if (JSON.stringify(target) !== before) changed += 1;
  }
  console.log(`Backfilled variant historical kana chars=${changed}`);
}

function backfillHistoricalForReading(target, source) {
  if (!target?.modernKana || !source?.modernKana || !source.historicalKana) return;
  const targetModern = splitReading(target.modernKana);
  const sourceModern = new Set(splitReading(source.modernKana));
  if (!targetModern.some((token) => sourceModern.has(token))) return;
  target.historicalKana = unique([
    ...splitReading(target.historicalKana),
    ...splitReading(source.historicalKana),
  ]).join(" ");
}

function filterReadingsToAttestedJapaneseOn(readings, rows) {
  const kanjidicOnByChar = loadKanjidicOnReadings();
  const allowedByChar = buildAllowedJapaneseOnMap(rows, kanjidicOnByChar);
  let changed = 0;
  let removed = 0;
  for (const [char, reading] of Object.entries(readings)) {
    const allowed = allowedByChar.get(char);
    if (!allowed?.size) continue;
    const before = JSON.stringify(reading);
    for (const key of ["go", "kan", "kanyo"]) {
      if (!reading[key]) continue;
      const originalModern = splitReading(reading[key].modernKana);
      const modern = originalModern.filter((token) => allowed.has(token));
      const removedCount = originalModern.length - modern.length;
      removed += removedCount;
      if (modern.length) {
        reading[key] = {
          modernKana: unique(modern).join(" "),
          historicalKana: filterHistoricalKanaWithModern(reading[key].historicalKana, originalModern, allowed),
        };
      } else {
        delete reading[key];
      }
    }
    if (!reading.go && !reading.kan && !reading.kanyo) delete readings[char];
    if (JSON.stringify(reading) !== before) changed += 1;
  }
  console.log(`Filtered readings to attested Japanese on chars=${changed}; removed tokens=${removed}; kanjidic chars=${kanjidicOnByChar.size}; total=${Object.keys(readings).length}`);
}

function filterHistoricalKanaWithModern(historicalKana, originalModern, allowed) {
  const historical = splitReading(historicalKana);
  if (!historical.length) return "";
  if (historical.length === originalModern.length) {
    return unique(historical.filter((_, index) => allowed.has(originalModern[index]))).join(" ");
  }
  return historicalKana;
}

function promoteKanyoModernVariants(readings) {
  let changed = 0;
  for (const reading of Object.values(readings)) {
    if (!reading.kanyo?.modernKana) continue;
    const kanyoTokens = splitReading(reading.kanyo.modernKana);
    for (const key of ["go", "kan"]) {
      const regularTokens = splitReading(reading[key]?.modernKana);
      if (!regularTokens.length) continue;
      const promoted = kanyoTokens.filter((token) => regularTokens.some((regular) => isModernVariantOfRegularOn(token, regular)));
      if (!promoted.length) continue;
      mergeReading(reading, key, {
        modernKana: unique(promoted).join(" "),
        historicalKana: reading.kanyo.historicalKana || "",
      });
      changed += 1;
    }
  }
  console.log(`Promoted kanyo modern variants chars=${changed}`);
}

function isModernVariantOfRegularOn(modern, regular) {
  if (modern === regular) return true;
  if (modern.endsWith("ツ") && regular.endsWith("チ")) return modern.slice(0, -1) === regular.slice(0, -1);
  return false;
}

function loadKanjidicOnReadings() {
  const out = new Map();
  if (!fs.existsSync(kanjidicFile)) {
    console.log("KANJIDIC2 cache not found; falling back to Unihan-only Japanese on filter");
    return out;
  }
  const xml = zlib.gunzipSync(fs.readFileSync(kanjidicFile)).toString("utf8");
  for (const match of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
    const block = match[1];
    const literal = (block.match(/<literal>([\s\S]*?)<\/literal>/) || [])[1];
    if (!literal) continue;
    const readings = [...block.matchAll(/<reading r_type="ja_on">([^<]+)<\/reading>/g)]
      .map((readingMatch) => readingMatch[1].normalize("NFKC"))
      .filter(Boolean);
    if (readings.length) out.set(literal, new Set(readings));
  }
  return out;
}

function buildAllowedJapaneseOnMap(rows, kanjidicOnByChar = new Map()) {
  const variants = loadHanVariants();
  const displayForms = loadHanDisplayForms();
  const rawByChar = new Map(rows.map((row) => [row[0], row[4] || ""]));
  const allowedByChar = new Map();
  for (const [char, raw] of rawByChar.entries()) {
    const kanjidicAllowed = new Set(kanjidicOnByChar.get(char) || []);
    const unihanAllowed = raw ? allowedJapaneseOnSet(japaneseOnToKatakana(raw)) : new Set();
    for (const candidate of japaneseVariantCandidates(char, variants, displayForms)) {
      for (const token of kanjidicOnByChar.get(candidate) || []) kanjidicAllowed.add(token);
      for (const token of allowedJapaneseOnSet(japaneseOnToKatakana(rawByChar.get(candidate) || ""))) unihanAllowed.add(token);
    }
    if (!kanjidicAllowed.size && !unihanAllowed.size) continue;
    const allowed = kanjidicAllowed.size ? kanjidicAllowed : unihanAllowed;
    allowedByChar.set(char, allowed);
  }
  return allowedByChar;
}

function removeRedundantKanyo(readings) {
  let changed = 0;
  let removed = 0;
  for (const [char, reading] of Object.entries(readings)) {
    if (!reading.kanyo?.modernKana) continue;
    const regular = new Set([
      ...splitReading(reading.go?.modernKana),
      ...splitReading(reading.kan?.modernKana),
    ]);
    if (!regular.size) continue;
    const original = splitReading(reading.kanyo.modernKana);
    const modern = original.filter((token) => !regular.has(token));
    removed += original.length - modern.length;
    if (modern.length) {
      reading.kanyo = {
        modernKana: unique(modern).join(" "),
        historicalKana: reading.kanyo.historicalKana || "",
      };
    } else {
      delete reading.kanyo;
    }
    if (!reading.go && !reading.kan && !reading.kanyo) delete readings[char];
    changed += 1;
  }
  console.log(`Removed redundant kanyo chars=${changed}; removed tokens=${removed}; total=${Object.keys(readings).length}`);
}

function allowedJapaneseOnSet(kana) {
  const allowed = new Set(splitReading(kana));
  for (const token of [...allowed]) {
    if (token.endsWith("ツ") && token.length > 1) allowed.add(`${token.slice(0, -1)}ッ`);
  }
  return allowed;
}

function hanVariantCandidates(char, variants) {
  const candidates = new Set();
  const normalized = char.normalize("NFKC");
  if (normalized && normalized !== char) candidates.add(normalized);
  for (const variant of variants[char] || []) candidates.add(variant);
  for (const variant of variants[normalized] || []) candidates.add(variant);
  return [...candidates].filter((candidate) => candidate && candidate !== char);
}

function japaneseVariantCandidates(char, variants, displayForms) {
  const candidates = new Set(hanVariantCandidates(char, variants));
  const japanese = displayForms?.japanese || {};
  if (japanese[char]) candidates.add(japanese[char]);
  for (const [oldForm, newForm] of Object.entries(japanese)) {
    if (newForm === char) candidates.add(oldForm);
  }
  return [...candidates].filter((candidate) => candidate && candidate !== char);
}

function japaneseOnToKatakana(value) {
  if (!value) return "";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(romanToKatakana)
    .join(" ");
}

function romanToKatakana(token) {
  let text = token
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ō/g, "OU")
    .replace(/Ū/g, "UU")
    .replace(/Ā/g, "AA")
    .replace(/Ī/g, "II")
    .replace(/Ē/g, "EE");

  const syllables = {
    KYA: "キャ", KYU: "キュ", KYO: "キョ",
    GYA: "ギャ", GYU: "ギュ", GYO: "ギョ",
    SHA: "シャ", SHU: "シュ", SHO: "ショ",
    SHYA: "シャ", SHYU: "シュ", SHYO: "ショ",
    SYA: "シャ", SYU: "シュ", SYO: "ショ",
    JA: "ジャ", JU: "ジュ", JO: "ジョ",
    JYA: "ジャ", JYU: "ジュ", JYO: "ジョ",
    CHA: "チャ", CHU: "チュ", CHO: "チョ",
    CHYA: "チャ", CHYU: "チュ", CHYO: "チョ",
    TYA: "チャ", TYU: "チュ", TYO: "チョ",
    NYA: "ニャ", NYU: "ニュ", NYO: "ニョ",
    HYA: "ヒャ", HYU: "ヒュ", HYO: "ヒョ",
    BYA: "ビャ", BYU: "ビュ", BYO: "ビョ",
    PYA: "ピャ", PYU: "ピュ", PYO: "ピョ",
    MYA: "ミャ", MYU: "ミュ", MYO: "ミョ",
    RYA: "リャ", RYU: "リュ", RYO: "リョ",
    KA: "カ", KI: "キ", KU: "ク", KE: "ケ", KO: "コ",
    GA: "ガ", GI: "ギ", GU: "グ", GE: "ゲ", GO: "ゴ",
    SA: "サ", SI: "シ", SHI: "シ", SU: "ス", SE: "セ", SO: "ソ",
    ZA: "ザ", ZI: "ジ", JI: "ジ", ZU: "ズ", ZE: "ゼ", ZO: "ゾ",
    TA: "タ", TI: "チ", CHI: "チ", TU: "ツ", TSU: "ツ", TE: "テ", TO: "ト",
    DA: "ダ", DI: "ジ", DU: "ズ", DE: "デ", DO: "ド",
    NA: "ナ", NI: "ニ", NU: "ヌ", NE: "ネ", NO: "ノ",
    HA: "ハ", HI: "ヒ", HU: "フ", FU: "フ", HE: "ヘ", HO: "ホ",
    BA: "バ", BI: "ビ", BU: "ブ", BE: "ベ", BO: "ボ",
    PA: "パ", PI: "ピ", PU: "プ", PE: "ペ", PO: "ポ",
    MA: "マ", MI: "ミ", MU: "ム", ME: "メ", MO: "モ",
    YA: "ヤ", YU: "ユ", YO: "ヨ",
    RA: "ラ", RI: "リ", RU: "ル", RE: "レ", RO: "ロ",
    WA: "ワ", WI: "ヰ", WE: "ヱ", WO: "ヲ",
    A: "ア", I: "イ", U: "ウ", E: "エ", O: "オ", N: "ン",
  };

  let out = "";
  while (text.length) {
    let matched = false;
    for (const size of [4, 3, 2, 1]) {
      const chunk = text.slice(0, size);
      if (syllables[chunk]) {
        out += syllables[chunk];
        text = text.slice(size);
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[0];
      text = text.slice(1);
    }
  }
  return out;
}

const rows = loadRows();
const priorityChars = [
  ..."日火水西一千二百十万上人仏右左天東北南山入木三語国四金文王五六七八生土下九学大心中行法長漢學國佛萬樂月年分物",
];
const japaneseTargets = rows
  .filter((row) => row[4])
  .map((row) => row[0]);
const targets = [...new Set([...priorityChars, ...japaneseTargets])].slice(0, limit || undefined);

console.log(`Fetching Japanese readings for ${targets.length} chars${noFetch ? " (cache only)" : ""}`);

const readings = {};
const batchSize = 50;
for (let i = 0; i < targets.length; i += batchSize) {
  const batch = targets.slice(i, i + batchSize);
  const cachePath = path.join(cacheDir, `batch-${String(i).padStart(6, "0")}.json`);
  const url = new URL("https://ja.wiktionary.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", batch.join("|"));
  const { json, cached } = await fetchJson(url.toString(), cachePath);
  if (!json) continue;
  for (const page of Object.values(json.query?.pages || {})) {
    const title = page.title;
    if (!title || [...title].length !== 1) continue;
    const content = page.revisions?.[0]?.slots?.main?.["*"] || page.revisions?.[0]?.["*"] || "";
    const parsed = parseJaKanji(content);
    if (parsed.go || parsed.kan || parsed.kanyo) readings[title] = parsed;
  }
  console.log(`Fetched ${Math.min(i + batchSize, targets.length)} / ${targets.length}; chars=${Object.keys(readings).length}`);
  fs.writeFileSync(outFile, `const ALL_JAPANESE_READINGS = ${JSON.stringify(readings)};\n`, "utf8");
  await sleep(noFetch || cached ? 0 : 1200);
}

mergeGakkenReadings(readings);
mergeVariantReadings(readings, rows);
backfillVariantHistoricalKana(readings, rows);
promoteKanyoModernVariants(readings);
applyCuratedJapaneseReadingCorrections(readings);
filterReadingsToAttestedJapaneseOn(readings, rows);
removeRedundantKanyo(readings);
pruneHistoricalKanaToModernSlots(readings);
backfillSafeHistoricalKana(readings);
fs.writeFileSync(outFile, `const ALL_JAPANESE_READINGS = ${JSON.stringify(readings)};\n`, "utf8");
console.log(`Done. Japanese chars=${Object.keys(readings).length}`);

function applyCuratedJapaneseReadingCorrections(readings) {
  readings["欠"] = {
    kan: { modernKana: "ケン", historicalKana: "ケム" },
  };
}

function backfillSafeHistoricalKana(readings) {
  let changed = 0;
  for (const reading of Object.values(readings)) {
    for (const key of ["go", "kan", "kanyo"]) {
      const value = reading[key];
      if (!value?.modernKana || value.historicalKana) continue;
      const inferred = splitReading(value.modernKana)
        .map(safeHistoricalKanaFromModern)
        .filter(Boolean);
      if (!inferred.length) continue;
      value.historicalKana = unique(inferred).join(" ");
      changed++;
    }
  }
  console.log(`Backfilled safe historical kana slots=${changed}`);
}

function pruneHistoricalKanaToModernSlots(readings) {
  let changed = 0;
  for (const reading of Object.values(readings)) {
    for (const key of ["go", "kan", "kanyo"]) {
      const value = reading[key];
      if (!value?.modernKana || !value.historicalKana) continue;
      const modern = splitReading(value.modernKana);
      const historical = splitReading(value.historicalKana);
      if (!modern.length || historical.length <= modern.length) continue;
      value.historicalKana = historical.slice(-modern.length).join(" ");
      changed++;
    }
  }
  console.log(`Pruned historical kana overhang slots=${changed}`);
}

function safeHistoricalKanaFromModern(token) {
  const normalized = normalizeHistoricalKana(token);
  if (!normalized) return "";
  if (/[ー]/.test(normalized)) return "";
  if (/[ン]/.test(normalized)) return "";
  if (/[ッァィゥェォャュョヮ]/.test(token)) return normalized;
  if (/[チツクキ]$/.test(normalized)) return normalized;
  if ([...normalized].length === 1) return normalized;
  return "";
}
