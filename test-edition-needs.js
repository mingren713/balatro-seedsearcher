const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const engineMatch = html.match(/<script type="text\/plain" id="engine-src">([\s\S]*?)<\/script>/);
if (!engineMatch) throw new Error("engine-src script not found");

const executableScripts = [...html.matchAll(/<script(?![^>]*text\/plain)[^>]*>([\s\S]*?)<\/script>/g)];
for (const [, source] of executableScripts) new Function(source);
new Function(engineMatch[1]);

const executableEngine = executableScripts[0][1];
const engineStart = executableEngine.indexOf("const POOLS =");
const engineEnd = executableEngine.indexOf("const CN=");
if (engineStart < 0 || engineEnd < 0 ||
    executableEngine.slice(engineStart, engineEnd).trim() !== engineMatch[1].trim())
  throw new Error("worker and main-thread engine copies should stay identical");

if (!html.includes('✦ 灵魂牌 → '))
  throw new Error("seed analysis should label Soul cards explicitly");
if (!html.includes("前 4 底注的已分析卡包中没有发现灵魂牌"))
  throw new Error("seed analysis should report when no Soul card is found");
if (!html.includes('class="seed" data-seed="'))
  throw new Error("seed results should preserve the original seed while showing copy feedback");
if ((html.match(/const sd=e\.target\.closest\("\.seed"\)/g) || []).length !== 1)
  throw new Error("seed results should have exactly one click-to-copy handler");
if (!html.includes('id="sticker-mode"') || !html.includes('class="sticker"'))
  throw new Error("sticker rule and per-Joker sticker controls should be present");

const tests = `
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
`;

new Function(engineMatch[1] + tests)();
console.log("OK: page scripts compile; Soul, sticker, and aggregate edition matching pass");
