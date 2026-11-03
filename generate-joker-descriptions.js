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

const jokerMarker = localization.indexOf("\n        Joker={");
if (jokerMarker < 0) throw new Error("Joker localization block not found");
const jokerBlock = braceBlock(localization, jokerMarker);

const centers = new Map();
for (const line of game.split(/\r?\n/)) {
  const match = line.match(/^\s*(j_[a-z0-9_]+)\s*=.*?\bname\s*=\s*["']([^"']+)["']/i);
  if (!match) continue;
  const configAt = line.indexOf("config", match.index);
  let numbers = [];
  if (configAt >= 0) {
    try {
      const config = braceBlock(line, configAt);
      numbers = [...config.matchAll(/=\s*(-?\d+(?:\.\d+)?)/g)].map(x => x[1]);
    } catch (_) {}
  }
  centers.set(match[1], {name:match[2], numbers});
}

const aliases = {
  j_8_ball: " 8 Ball",
  j_riff_raff: "Riff raff",
  j_caino: "Canio",
  j_mail: "Mail In Rebate",
  j_mr_bones: "Mr Bones",
  j_oops: "Oops All 6s",
  j_drivers_license: "Drivers License"
};

// A few Jokers expose their localization variables in a different order from
// their config table. Keep those orders explicit so values such as Stuntman's
// chips/hand-size cannot be accidentally swapped.
const valueOverrides = {
  j_ancient: ["1.5", "指定花色"],
  j_blackboard: ["3", "黑桃", "梅花"],
  j_bootstraps: ["2", "5"],
  j_castle: ["3", "指定花色", "0"],
  j_cavendish: ["3", "1", "1000"],
  j_diet_cola: ["双倍标签"],
  j_drivers_license: ["3"],
  j_erosion: ["4", "0", "52"],
  j_gros_michel: ["15", "1", "6"],
  j_idol: ["2", "指定点数", "指定花色"],
  j_loyalty_card: ["4", "6", "计数随出牌变化"],
  j_madness: ["0.5", "1"],
  j_reserved_parking: ["1", "1", "2"],
  j_stuntman: ["250", "2"],
  j_troubadour: ["2", "1"],
  j_yorick: ["1", "23", "0", "1"]
};

function unresolvedLabel(text) {
  if (text.includes("花色")) return "指定花色";
  if (text.includes("牌型") || text.includes("包含")) return "指定牌型";
  if (text.includes("点数")) return "指定点数";
  return "可变";
}

const descriptions = {};
const entryRe = /(?:^|\n)\s*(j_[a-z0-9_]+)\s*=\s*\{/gi;
let match;
while ((match = entryRe.exec(jokerBlock))) {
  const key = match[1];
  const center = centers.get(key);
  if (!center) continue;
  const entry = braceBlock(jokerBlock, match.index + match[0].lastIndexOf("{"));
  const textAt = entry.search(/\btext\s*=\s*\{/);
  if (textAt < 0) continue;
  const textBlock = braceBlock(entry, textAt);
  const placeholderIds = [...new Set([...textBlock.matchAll(/#(\d+)#/g)].map(x => Number(x[1])))];
  const values = {};
  if (textBlock.includes("#1#/#2#")) ["1", ...center.numbers].forEach((v, i) => values[i + 1] = v);
  else center.numbers.slice(0, placeholderIds.length).forEach((v, i) => values[[...placeholderIds].sort((a, b) => a - b)[i]] = v);
  if (valueOverrides[key]) valueOverrides[key].forEach((v, i) => values[i + 1] = v);
  const lines = [...textBlock.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(x => {
    let text = JSON.parse('"' + x[1].replace(/\r?\n/g, "\\n") + '"');
    text = text.replace(/\{[^}]*\}/g, "");
    if (/当前/.test(text) && [...text.matchAll(/#(\d+)#/g)].some(m => values[Number(m[1])] === undefined))
      return "（当前值随对局变化）";
    text = text.replace(/#(\d+)#/g, (_, n) => values[Number(n)] ?? unresolvedLabel(textBlock));
    return text.trim();
  }).filter(Boolean);
  descriptions[aliases[key] || center.name] = lines;
}

if (Object.keys(descriptions).length !== 150)
  throw new Error(`expected 150 Joker descriptions, got ${Object.keys(descriptions).length}`);

const output = "/* Generated from Balatro 1.0.1o zh_CN localization. */\n" +
  "window.JOKER_DESCRIPTIONS=Object.freeze(" + JSON.stringify(descriptions, null, 2) + ");\n";
fs.writeFileSync(path.join(__dirname, "joker-descriptions.js"), output, "utf8");
console.log(`generated ${Object.keys(descriptions).length} Joker descriptions`);
