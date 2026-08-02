import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TshetUinh from "../data/cache/npm/node_modules/tshet-uinh/index.js";
import * as TshetUinhExamples from "../data/cache/npm/node_modules/tshet-uinh-examples/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "tshet-uinh-middle-chinese.js");

const K = {
  data: "\u8cc7\u6599",
  expressions: "\u8868\u9054\u5f0f",
  guangyun: "\u5ee3\u97fb",
  iterEntries: "iter\u689d\u76ee",
  char: "\u5b57\u982d",
  position: "\u97f3\u97fb\u5730\u4f4d",
  fanqie: "\u53cd\u5207",
  gloss: "\u91cb\u7fa9",
  source: "\u4f86\u6e90",
  initial: "\u6bcd",
  openness: "\u547c",
  division: "\u7b49",
  class: "\u985e",
  final: "\u97fb",
  tone: "\u8072",
  rhymeGroup: "\u651d",
  sourceText: "\u6587\u737b",
  sourceNumber: "\u5c0f\u97fb\u865f",
  sourceRhyme: "\u97fb\u76ee",
  system: "\u7cfb\u7d71",
  belongsTo: "\u5c6c\u65bc",
  thirdDivisionRhymes: "\u4e09\u7b49\u97fb",
  firstThirdDivisionRhymes: "\u4e00\u4e09\u7b49\u97fb",
  secondThirdDivisionRhymes: "\u4e8c\u4e09\u7b49\u97fb",
};

const result = {};
let readings = 0;
const baxter = TshetUinhExamples.baxter({ [K.system]: "2014" });
const entries = TshetUinh[K.data][K.guangyun][K.iterEntries]();
const expressions = TshetUinh[K.expressions];

for (const entry of entries) {
  if (!entry[K.position]) continue;
  const char = entry[K.char];
  const reading = convertEntry(entry);
  if (!result[char]) result[char] = [];
  result[char].push(reading);
  readings += 1;
}

function convertEntry(entry) {
  const position = entry[K.position];
  const source = entry[K.source] || {};
  const reconstruction = baxter(position, entry[K.char]);

  return {
    raw: String(position),
    initial: label(position[K.initial], K.initial),
    initialIpa: "",
    final: label(position[K.final], K.final),
    finalReconstruction: reconstruction,
    division: label(position[K.division], K.division),
    divisionClass: classifyThirdDivision(position),
    rhymeGroup: label(position[K.rhymeGroup], K.rhymeGroup),
    openness: label(position[K.openness], "\u53e3") || "\u958b\u53e3",
    tone: label(position[K.tone], K.tone),
    fanqie: entry[K.fanqie] || "",
    baxter: reconstruction,
    sourceSystem: "TshetUinh.js / Baxter 2014",
    sourceId: source[K.sourceNumber] ? `${source[K.sourceText] || K.guangyun}:${source[K.sourceNumber]}` : "",
    sourceRhyme: source[K.sourceRhyme] || "",
    source: source[K.sourceText] ? `TshetUinh ${source[K.sourceText]}` : "TshetUinh",
    gloss: entry[K.gloss] || "",
  };
}

function label(value, suffix) {
  return value ? `${value}${suffix}` : "";
}

function classifyThirdDivision(position) {
  if (position[K.division] !== "\u4e09") return "";
  if (position[K.class] === "A") return "\u91cd\u7d10A";
  if (position[K.class] === "B") return "\u91cd\u7d10B";
  if (
    position[K.belongsTo](expressions[K.firstThirdDivisionRhymes]) ||
    position[K.belongsTo](expressions[K.secondThirdDivisionRhymes])
  ) {
    return "\u5047\u4e09\u7b49";
  }
  if (position[K.belongsTo](expressions[K.thirdDivisionRhymes])) return "\u7d14\u4e09\u7b49";
  return position[K.class] === "C" ? "\u7d14\u4e09\u7b49" : "\u4e09\u7b49";
}

const body = `const TSHET_UINH_MIDDLE_CHINESE_READINGS = ${JSON.stringify(result)};\n`;
fs.writeFileSync(outputPath, body, "utf8");

console.log(`Done. chars=${Object.keys(result).length}, readings=${readings}`);
