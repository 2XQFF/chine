import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataJs = path.join(repoRoot, "data.js");
const outFile = path.join(repoRoot, "enrichment.js");
const cacheDir = path.join(repoRoot, "data", "cache", "wiktionary-enrich");
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 1000);

fs.mkdirSync(cacheDir, { recursive: true });

function loadCompactRows() {
  const code = fs.readFileSync(dataJs, "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${code}\nthis.rows = COMPACT_DICTIONARY;`, ctx);
  return ctx.rows;
}

function charFileName(char, suffix) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase()}-${suffix}.txt`;
}

async function fetchText(url, cachePath) {
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, "utf8");
  const res = await fetch(url, {
    headers: {
      "User-Agent": "middle-chinese-study-dictionary/0.1 personal-study",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const text = await res.text();
  fs.writeFileSync(cachePath, text, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 350));
  return text;
}

function stripWiki(text) {
  return text
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseKanaReading(text) {
  const cleaned = stripWiki(text)
    .replace(/表内/g, "")
    .replace(/歴史的仮名遣い/g, "")
    .trim();
  const historical = cleaned.match(/[<［\[]([ァ-ヴー・]+)(?:[>\]］;]|$)/)?.[1] || "";
  const modern = cleaned.replace(/[<［\[][^\]］>;]+[>\]］;]?/g, "").match(/[ァ-ヴー・]+/)?.[0] || "";
  return { modernKana: modern, historicalKana: historical };
}

function parseJapaneseReadings(raw) {
  const goLine = raw.match(/(?:呉音|吳音)\s*(?:=|[:：])\s*([^|\n}]+)/);
  const kanLine = raw.match(/漢音\s*(?:=|[:：])\s*([^|\n}]+)/);
  const kanyoLine = raw.match(/慣用音\s*(?:=|[:：])\s*([^|\n}]+)/);
  const out = {};
  if (goLine) out.go = parseKanaReading(goLine[1]);
  if (kanLine) out.kan = parseKanaReading(kanLine[1]);
  if (kanyoLine) out.kanyo = parseKanaReading(kanyoLine[1]);
  return out;
}

const initials = ["幫","滂","並","明","端","透","定","泥","知","徹","澄","孃","娘","精","清","從","从","心","邪","莊","庄","初","崇","生","俟","章","昌","常","禪","船","書","見","溪","羣","群","疑","曉","匣","影","云","雲","以","來","日"];
const sheMap = {
  東:"通攝", 屋:"通攝", 冬:"通攝", 沃:"通攝", 鍾:"通攝", 燭:"通攝",
  江:"江攝", 覺:"江攝",
  支:"止攝", 脂:"止攝", 之:"止攝", 微:"止攝",
  魚:"遇攝", 虞:"遇攝", 模:"遇攝",
  齊:"蟹攝", 祭:"蟹攝", 泰:"蟹攝", 佳:"蟹攝", 皆:"蟹攝", 夬:"蟹攝", 灰:"蟹攝", 咍:"蟹攝", 廢:"蟹攝",
  眞:"臻攝", 真:"臻攝", 諄:"臻攝", 臻:"臻攝", 文:"臻攝", 欣:"臻攝", 元:"臻攝", 魂:"臻攝", 痕:"臻攝",
  質:"臻攝", 術:"臻攝", 櫛:"臻攝", 物:"臻攝", 迄:"臻攝", 月:"臻攝", 沒:"臻攝", 麧:"臻攝",
  寒:"山攝", 桓:"山攝", 刪:"山攝", 山:"山攝", 先:"山攝", 仙:"山攝",
  曷:"山攝", 末:"山攝", 鎋:"山攝", 黠:"山攝", 屑:"山攝", 薛:"山攝",
  蕭:"效攝", 宵:"效攝", 肴:"效攝", 豪:"效攝",
  歌:"果攝", 戈:"果攝", 麻:"假攝",
  陽:"宕攝", 唐:"宕攝", 藥:"宕攝", 鐸:"宕攝",
  庚:"梗攝", 耕:"梗攝", 清:"梗攝", 青:"梗攝", 陌:"梗攝", 麥:"梗攝", 昔:"梗攝", 錫:"梗攝",
  蒸:"曾攝", 登:"曾攝", 職:"曾攝", 德:"曾攝",
  尤:"流攝", 侯:"流攝", 幽:"流攝",
  侵:"深攝", 緝:"深攝",
  覃:"咸攝", 談:"咸攝", 鹽:"咸攝", 添:"咸攝", 咸:"咸攝", 銜:"咸攝", 嚴:"咸攝", 凡:"咸攝",
  合:"咸攝", 盍:"咸攝", 葉:"咸攝", 怗:"咸攝", 洽:"咸攝", 狎:"咸攝", 業:"咸攝", 乏:"咸攝",
};
const enteringFinalMap = {
  東: "屋", 冬: "沃", 鍾: "燭",
  江: "覺",
  眞: "質", 真: "質", 諄: "術", 臻: "櫛", 文: "物", 欣: "迄", 元: "月", 魂: "沒", 痕: "麧",
  寒: "曷", 桓: "末", 刪: "鎋", 山: "黠", 先: "屑", 仙: "薛",
  陽: "藥", 唐: "鐸",
  庚: "陌", 耕: "麥", 清: "昔", 青: "錫",
  蒸: "職", 登: "德",
  侵: "緝",
  覃: "合", 談: "盍", 鹽: "葉", 添: "怗", 咸: "洽", 銜: "狎", 嚴: "業", 凡: "乏",
};

function parseMiddleChinese(rawReading) {
  const parts = rawReading.trim().split(/\s+/);
  const category = parts[0] || "";
  const toneFanqie = parts[1] || "";
  let initial = "";
  let rest = category;
  for (const candidate of initials) {
    if (category.startsWith(candidate)) {
      initial = candidate;
      rest = category.slice(candidate.length);
      break;
    }
  }
  const openness = rest.includes("開") ? "開口" : rest.includes("合") ? "合口" : "";
  let division = "";
  if (rest.includes("重鈕三")) division = "重鈕三等";
  else if (rest.includes("重鈕四")) division = "重鈕四等";
  else if (rest.includes("一")) division = "一等";
  else if (rest.includes("二")) division = "二等";
  else if (rest.includes("三")) division = "三等";
  else if (rest.includes("四")) division = "四等";
  const toneMark = toneFanqie[0] || "";
  const tone = { 平: "平聲", 上: "上聲", 去: "去聲", 入: "入聲" }[toneMark] || toneMark;
  const rawFinalBase = rest.replace(/重鈕三|重鈕四|一|二|三|四|開|合/g, "");
  const finalBase = tone === "入聲" && enteringFinalMap[rawFinalBase] ? enteringFinalMap[rawFinalBase] : rawFinalBase;
  return {
    raw: rawReading,
    initial: initial ? `${initial}母` : "",
    initialIpa: "",
    final: finalBase ? `${finalBase}韻` : "",
    finalReconstruction: "",
    division,
    rhymeGroup: sheMap[finalBase] || "",
    openness,
    tone,
    fanqie: toneFanqie.length > 1 ? toneFanqie.slice(1) : "",
  };
}

function parseLtcPron(raw) {
  const matches = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((x) => /[平上去入]/.test(x));
  return [...new Set(matches)].map(parseMiddleChinese);
}

const rows = loadCompactRows();
const priorityChars = [...new Set([...("入樂學中漢國語日人山水天心佛法行生長大王文一二三四五六七八九十百千萬上下左右東西南北金木火土月年時")])];
const rowTargets = rows
  .filter((row) => row[4] || row[2] || row[5])
  .slice(0, limit)
  .map((row) => row[0]);
const targets = [...new Set([...priorityChars, ...rowTargets])].slice(0, limit);

const middleChinese = {};
const japanese = {};
let mcCount = 0;
let jpCount = 0;

for (let i = 0; i < targets.length; i++) {
  const char = targets[i];
  try {
    const mcRaw = await fetchText(
      `https://en.wiktionary.org/wiki/Module:zh/data/ltc-pron/${encodeURIComponent(char)}?action=raw`,
      path.join(cacheDir, charFileName(char, "ltc"))
    );
    const readings = parseLtcPron(mcRaw);
    if (readings.length) {
      middleChinese[char] = readings;
      mcCount += readings.length;
    }
  } catch {}

  try {
    const jaRaw = await fetchText(
      `https://ja.wiktionary.org/wiki/${encodeURIComponent(char)}?action=raw`,
      path.join(cacheDir, charFileName(char, "ja"))
    );
    const ja = parseJapaneseReadings(jaRaw);
    if (ja.go || ja.kan || ja.kanyo) {
      japanese[char] = ja;
      jpCount += 1;
    }
  } catch {}

  if ((i + 1) % 100 === 0) console.log(`Processed ${i + 1}/${targets.length}; MC readings=${mcCount}; JP chars=${jpCount}`);
}

const js = `const MIDDLE_CHINESE_READINGS = ${JSON.stringify(middleChinese)};\n\nconst JAPANESE_GO_KAN_READINGS = ${JSON.stringify(japanese)};\n`;
fs.writeFileSync(outFile, js, "utf8");
console.log(`Done. targets=${targets.length}, mcReadings=${mcCount}, japaneseChars=${jpCount}`);
