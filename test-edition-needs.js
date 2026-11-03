const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const descriptionSource = fs.readFileSync("joker-descriptions.js", "utf8");
const descriptionWindow = {};
new Function("window", descriptionSource)(descriptionWindow);
const jokerDescriptions = descriptionWindow.JOKER_DESCRIPTIONS;
if (!jokerDescriptions || Object.keys(jokerDescriptions).length !== 150)
  throw new Error("all 150 Joker descriptions should be embedded");
if (!jokerDescriptions.Blueprint.join("").includes("复制") ||
    !jokerDescriptions["Hanging Chad"].join("").includes("2"))
  throw new Error("embedded Joker descriptions should contain localized effects and values");
const engineMatch = html.match(/<script type="text\/plain" id="engine-src">([\s\S]*?)<\/script>/);
if (!engineMatch) throw new Error("engine-src script not found");
const descriptionPools = new Function(engineMatch[1] + ";return POOLS;")();
const missingDescriptions = Object.values(descriptionPools).flat().filter(name => !jokerDescriptions[name]);
if (missingDescriptions.length)
  throw new Error("missing Joker descriptions: " + missingDescriptions.join(", "));
if (/\{[A-Z]:|#\d+#/.test(JSON.stringify(jokerDescriptions)))
  throw new Error("Joker descriptions should not expose localization markup or placeholders");
if (JSON.stringify(jokerDescriptions).includes("…"))
  throw new Error("Joker descriptions should explain variable values instead of showing ellipses");
if (!html.includes("background:#fffdf5") || !html.includes("#jhover .jd{margin-top:6px;color:#17201f}"))
  throw new Error("Joker hover cards should use a light background with dark description text");

const executableScripts = [...html.matchAll(/<script(?![^>]*text\/plain)[^>]*>([\s\S]*?)<\/script>/g)];
for (const [, source] of executableScripts) new Function(source);
new Function(engineMatch[1]);

const executableEngine = executableScripts.map(match => match[1]).find(source => source.includes("const POOLS ="));
if (!executableEngine) throw new Error("main-thread engine script not found");
const engineStart = executableEngine.indexOf("const POOLS =");
const engineEnd = executableEngine.indexOf("const CN=");
if (engineStart < 0 || engineEnd < 0 ||
    executableEngine.slice(engineStart, engineEnd).trim() !== engineMatch[1].trim())
  throw new Error("worker and main-thread engine copies should stay identical");

if (!html.includes('✦ 灵魂牌 → '))
  throw new Error("seed analysis should label Soul cards explicitly");
if (!html.includes("底注的已分析卡包中没有发现灵魂牌"))
  throw new Error("seed analysis should report when no Soul card is found");
if (!html.includes('class="seed" data-seed="'))
  throw new Error("seed results should preserve the original seed while showing copy feedback");
if ((html.match(/const sd=e\.target\.closest\("\.seed"\)/g) || []).length !== 1)
  throw new Error("seed results should have exactly one click-to-copy handler");
if (!html.includes('id="sticker-mode"') || !html.includes('class="sticker"'))
  throw new Error("sticker rule and per-Joker sticker controls should be present");
if (!html.includes('const STICKERS=["","永恒","易腐","非易腐"]') ||
    !html.includes('w.sticker==="非易腐"'))
  throw new Error("non-Perishable sticker option and probability estimate should be present");
if (!html.includes('id="separate-packs"'))
  throw new Error("different-Buffoon-pack control should be present");
if (!html.includes('id="peek-antes"') || !html.includes("小盲跳过"))
  throw new Error("seed analysis should expose per-ante skip tags");
if (!html.includes('id="jhover"') || !html.includes("showJokerTip") ||
    !html.includes("再次轻触这张牌即可选择"))
  throw new Error("Joker picker should expose mouse and touch effect previews");

const tests = `
  const tagCalls = [];
  const tagMock = {choice(key,pool,locked){tagCalls.push({key,pool,locked});return pool[0];}};
  const firstTags = anteTags(tagMock,1);
  if (firstTags.small !== "tag_uncommon" || firstTags.big !== "tag_uncommon")
    throw new Error("ante tags should generate Small and Big blind rewards");
  if (tagCalls.length !== 2 || tagCalls.some(call=>call.key!=="Tag1"))
    throw new Error("both blind tags should advance the Tag+ante RNG stream");
  if (!tagCalls[0].locked.has("tag_negative"))
    throw new Error("ante-one-only tag restrictions should be preserved");
  const liveTags = anteTags(new Run("AAAAAAAA"),1);
  if (!TAG_KEYS.includes(liveTags.small) || !TAG_KEYS.includes(liveTags.big) ||
      TAG_MIN_ANTE_2.has(liveTags.small) || TAG_MIN_ANTE_2.has(liveTags.big))
    throw new Error("ante one should only return eligible tags");

  const stickerKeys = [];
  const stickerRun = {rand(key){ stickerKeys.push(key); return 0.8; }};
  if (jokerSticker(stickerRun,"sho",1,"eternal","Blueprint") !== "永恒")
    throw new Error("shop eternal sticker roll should match");
  if (stickerKeys[0] !== "etperpoll1")
    throw new Error("shop stickers should use the etperpoll RNG stream");
  if (jokerSticker({rand(){return 0.8;}},"buf",2,"both","Gros Michel") !== null)
    throw new Error("eternal-incompatible Jokers should not receive Eternal");
  if (jokerSticker({rand(){return 0.5;}},"buf",2,"both","Blueprint") !== "易腐")
    throw new Error("Orange/Gold stake should expose Perishable rolls");
  if (jokerSticker({rand(){return 0.5;}},"buf",2,"eternal","Blueprint") !== null)
    throw new Error("Black/Blue/Purple stake should not expose Perishable rolls");
  if (jokerSticker({rand(){return 0.5;}},"buf",2,"both","Ceremonial Dagger") !== null)
    throw new Error("perishable-incompatible Jokers should not receive Perishable");

  const soulRun = {
    rand(key){ return key === "soul_Tarot1" ? 0.999 : 0.5; },
    choice(key,pool){ return pool[0]; }
  };
  const soulPack = openPack(soulRun,"Arcana Pack",1,"both");
  if (soulPack.filter(card=>card.soul).length !== 1)
    throw new Error("Arcana pack should expose exactly one Soul card when the Soul roll succeeds");
  if (soulPack.find(card=>card.soul).sticker)
    throw new Error("Soul-created Legendary Jokers should not receive shop/pack stickers");

  let sawEternal = false, sawPerishable = false;
  for (let i=0;i<20;i++) {
    const cards = scanSeed(seedFromIndex(i),2,8,true,"both");
    sawEternal ||= cards.some(card=>card.sticker==="永恒");
    sawPerishable ||= cards.some(card=>card.sticker==="易腐");
  }
  if (!sawEternal || !sawPerishable)
    throw new Error("full scans should expose both Eternal and Perishable stickers");
  if (scanSeed("AAAAAAAA",2,8,true,"eternal").some(card=>card.sticker==="易腐"))
    throw new Error("Black/Blue/Purple scans should never expose Perishable stickers");

  const sample = [
    {name:"Blueprint",ante:1,edition:"",from:"shop"},
    {name:"Blueprint",ante:2,edition:"负片",from:"shop"},
    {name:"Brainstorm",ante:2,edition:"多彩",from:"shop"},
    {name:"Baron",ante:3,edition:"",from:"shop"}
  ];
  scanSeed = () => sample;
  const groups = [
    [{name:"Blueprint",ante:3,ed:""}],
    [{name:"Brainstorm",ante:3,ed:""}],
    [{name:"Baron",ante:3,ed:""}]
  ];
  const flexible = matchSeed("TEST",groups,6,3,true,{"负片":1,"多彩":1});
  if (!flexible) throw new Error("flexible aggregate editions should match");
  if (!flexible.some(x=>x.edition==="负片") || !flexible.some(x=>x.edition==="多彩"))
    throw new Error("aggregate match returned the wrong editions");

  scanSeed = () => sample.filter(x=>x.edition!=="多彩");
  if (matchSeed("TEST",groups,6,3,true,{"负片":1,"多彩":1}) !== null)
    throw new Error("missing aggregate edition should fail");

  scanSeed = () => sample;
  const exact = [[{name:"Blueprint",ante:3,ed:"负片"}],[{name:"Baron",ante:3,ed:""}]];
  if (!matchSeed("TEST",exact,6,3,true,{}))
    throw new Error("existing per-card edition constraint should still work");

  scanSeed = () => [{name:"Blueprint",ante:1,edition:"",sticker:"永恒",from:"shop"}];
  if (!matchSeed("TEST",[[{name:"Blueprint",ante:2,ed:"",sticker:"永恒"}]],6,2,true,{},"both"))
    throw new Error("matching Eternal sticker should pass");
  if (matchSeed("TEST",[[{name:"Blueprint",ante:2,ed:"",sticker:"易腐"}]],6,2,true,{},"both") !== null)
    throw new Error("wrong sticker should fail");
  if (!matchSeed("TEST",[[{name:"Blueprint",ante:2,ed:"",sticker:"非易腐"}]],6,2,true,{},"both"))
    throw new Error("Eternal should satisfy non-Perishable");
  scanSeed = () => [{name:"Blueprint",ante:1,edition:"",sticker:null,from:"shop"}];
  if (!matchSeed("TEST",[[{name:"Blueprint",ante:2,ed:"",sticker:"非易腐"}]],6,2,true,{},"both"))
    throw new Error("no sticker should satisfy non-Perishable");
  scanSeed = () => [{name:"Blueprint",ante:1,edition:"",sticker:"易腐",from:"shop"}];
  if (matchSeed("TEST",[[{name:"Blueprint",ante:2,ed:"",sticker:"非易腐"}]],6,2,true,{},"both") !== null)
    throw new Error("Perishable should not satisfy non-Perishable");

  const packGroups = [
    [{name:"Blueprint",ante:3,ed:""}],
    [{name:"Brainstorm",ante:3,ed:""}]
  ];
  scanSeed = () => [
    {name:"Blueprint",ante:1,edition:"",from:"小丑包",packId:"1:0"},
    {name:"Brainstorm",ante:1,edition:"",from:"小丑包",packId:"1:0"},
    {name:"Brainstorm",ante:2,edition:"",from:"小丑包",packId:"2:0"}
  ];
  const splitPacks = matchSeed("TEST",packGroups,6,3,true,{},"both",true);
  if (!splitPacks || splitPacks[1].packId !== "2:0")
    throw new Error("different-pack matching should backtrack to another Buffoon pack");
  scanSeed = () => [
    {name:"Blueprint",ante:1,edition:"",from:"小丑包",packId:"1:0"},
    {name:"Brainstorm",ante:1,edition:"",from:"小丑包",packId:"1:0"}
  ];
  if (!matchSeed("TEST",packGroups,6,3,true,{},"both",false))
    throw new Error("same-pack matching should remain available when the option is off");
  if (matchSeed("TEST",packGroups,6,3,true,{},"both",true) !== null)
    throw new Error("same Buffoon pack should fail when different packs are required");

  const hardGroups = [
    [{name:"Madness",ante:8,ed:"多彩",sticker:""}],
    [{name:"Riff raff",ante:8,ed:"多彩",sticker:"永恒"}]
  ];
  const hardPlan = makePlan(hardGroups,6,8,true,{},"both",true);
  if (fastScan("AAAAAAAX",hardPlan))
    throw new Error("exact fast scan should reject a name-only false positive");
  let fullScanCalls = 0;
  matchSeed = () => { fullScanCalls++; return null; };
  matchFast("AAAAAAAX",hardPlan);
  if (fullScanCalls !== 0)
    throw new Error("rejected exact candidates should not enter the full scan");
`;

new Function(engineMatch[1] + tests)();
console.log("OK: page scripts compile; 150 hover descriptions, touch previews, non-Perishable, exact fast filtering, skip tags, Soul, stickers, aggregate editions, and pack separation pass");
