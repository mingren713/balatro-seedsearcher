const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const engineMatch = html.match(/<script type="text\/plain" id="engine-src">([\s\S]*?)<\/script>/);
if (!engineMatch) throw new Error("engine-src script not found");

const executableScripts = [...html.matchAll(/<script(?![^>]*text\/plain)[^>]*>([\s\S]*?)<\/script>/g)];
for (const [, source] of executableScripts) new Function(source);
new Function(engineMatch[1]);

if (!html.includes('✦ 灵魂牌 → '))
  throw new Error("seed analysis should label Soul cards explicitly");
if (!html.includes("前 4 底注的已分析卡包中没有发现灵魂牌"))
  throw new Error("seed analysis should report when no Soul card is found");

const tests = `
  const soulRun = {
    rand(key){ return key === "soul_Tarot1" ? 0.999 : 0.5; },
    choice(key,pool){ return pool[0]; }
  };
  const soulPack = openPack(soulRun,"Arcana Pack",1);
  if (soulPack.filter(card=>card.soul).length !== 1)
    throw new Error("Arcana pack should expose exactly one Soul card when the Soul roll succeeds");

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
`;

new Function(engineMatch[1] + tests)();
console.log("OK: page scripts compile; Soul analysis and aggregate edition matching pass");
