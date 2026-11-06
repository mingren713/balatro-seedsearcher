const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");

const root = path.resolve(__dirname, "..");
const exe = path.join(root, "Balatro.exe.seeded-rewards-original");
const gamePath = path.join(root, "seeded-rewards-patch", "game.lua");
const localization = execFileSync("tar", ["-xOf", exe, "localization/zh_CN.lua"], {encoding:"utf8"});
const game = fs.readFileSync(gamePath, "utf8");

function braceBlock(source, markerIndex) {
  const open = source.indexOf("{", markerIndex);
  if (open < 0) throw new Error("opening brace not found");
  let depth = 0, quote = "", escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error("unterminated brace block");
}

const marker = localization.indexOf("\n        Spectral={");
if (marker < 0) throw new Error("Spectral localization block not found");
const block = braceBlock(localization, marker);
const centers = new Map();
for (const line of game.split(/\r?\n/)) {
  const match = line.match(/^\s*(c_[a-z0-9_]+)\s*=.*?\border\s*=\s*(\d+).*?\bname\s*=\s*["']([^"']+)["'].*?\bset\s*=\s*["']Spectral["']/i);
  if (!match) continue;
  const posMatch = line.match(/\bpos\s*=\s*\{\s*x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)/i);
  const configAt = line.indexOf("config", match.index);
  let numbers = [];
  if (configAt >= 0) {
    const config = braceBlock(line, configAt);
    numbers = [...config.matchAll(/=\s*(-?\d+(?:\.\d+)?)/g)].map(x => x[1]);
  }
  if (!posMatch) throw new Error(`sprite position missing for ${match[1]}`);
  centers.set(match[1], {order:Number(match[2]), name:match[3], numbers,
    pos:[Number(posMatch[1]), Number(posMatch[2])]});
}

const cards = [];
const entryRe = /(?:^|\n)\s*(c_[a-z0-9_]+)\s*=\s*\{/gi;
let match;
while ((match = entryRe.exec(block))) {
  const key = match[1], center = centers.get(key);
  if (!center) continue;
  const entry = braceBlock(block, match.index + match[0].lastIndexOf("{"));
  const nameMatch = entry.match(/\bname\s*=\s*"((?:\\.|[^"\\])*)"/);
  const textAt = entry.search(/\btext\s*=\s*\{/);
  if (!nameMatch || textAt < 0) continue;
  const textBlock = braceBlock(entry, textAt);
  const values = key === "c_ectoplasm" ? ["1"] : center.numbers;
  const lines = [...textBlock.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(x => {
    let text = JSON.parse('"' + x[1].replace(/\r?\n/g, "\\n") + '"');
    text = text.replace(/\{[^}]*\}/g, "");
    text = text.replace(/#(\d+)#/g, (_, n) => values[Number(n) - 1] ?? "随对局变化");
    return text.trim();
  }).filter(Boolean);
  cards.push({key, en:center.name, cn:JSON.parse('"' + nameMatch[1] + '"'), lines,
    pos:center.pos, order:center.order});
}
cards.sort((a, b) => a.order - b.order);
if (cards.length !== 18) throw new Error(`expected 18 Spectral cards, got ${cards.length}`);

const consumableNames = Object.fromEntries(cards.map(c => [c.en, c.cn]));
for (const kind of ["Tarot", "Planet"]) {
  const at = localization.indexOf("\n        " + kind + "={");
  if (at < 0) throw new Error(`${kind} localization block not found`);
  const localized = braceBlock(localization, at);
  const entries = new Map();
  const entryRe = /(?:^|\n)\s*(c_[a-z0-9_]+)\s*=\s*\{/gi;
  let entryMatch;
  while ((entryMatch = entryRe.exec(localized))) {
    const entry = braceBlock(localized, entryMatch.index + entryMatch[0].lastIndexOf("{"));
    const name = entry.match(/\bname\s*=\s*"((?:\\.|[^"\\])*)"/);
    if (name) entries.set(entryMatch[1], JSON.parse('"' + name[1] + '"'));
  }
  for (const line of game.split(/\r?\n/)) {
    const center = line.match(/^\s*(c_[a-z0-9_]+)\s*=.*?\bname\s*=\s*["']([^"']+)["'].*?\bset\s*=\s*["'](Tarot|Planet)["']/i);
    if (center && center[3] === kind) {
      const cn = entries.get(center[1]);
      if (!cn) throw new Error(`localization missing for ${center[2]}`);
      consumableNames[center[2]] = cn;
    }
  }
}

const output = "/* Generated from Balatro 1.0.1o zh_CN localization. */\n" +
  "window.SPECTRAL_CARDS=Object.freeze(" + JSON.stringify(cards, null, 2) + ");\n" +
  "window.CONSUMABLE_NAMES=Object.freeze(" + JSON.stringify(consumableNames, null, 2) + ");\n";
fs.writeFileSync(path.join(__dirname, "spectral-data.js"), output, "utf8");
console.log(`generated ${cards.length} Spectral cards`);
