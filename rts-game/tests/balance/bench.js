// One AI-vs-AI game with economy instrumentation. Prints one JSON line.
// node bench.js <codeDir> <seed> <difficulty> <limitSeconds> [overrideJS]
const fs=require('fs'),vm=require('vm');
const [dir,seed,diff,limit,over]=[process.argv[2],+process.argv[3],process.argv[4]||'normal',+(process.argv[5]||3600),process.argv[6]||''];
let sim=fs.readFileSync(dir+'/sim.js','utf8');
const tag=(needle,src)=>{ if(!sim.includes(needle)) throw new Error('missing '+needle); sim=sim.replace(needle,`(globalThis.__src='${src}',0)||`+needle); };
tag("bankScrap(game, b.team, b.def.income * game.teams[b.team].incomeMult * dt, true)",'recycler');
tag("bankScrap(game, b.team, amt * tm.incomeMult, true)",'extractor');
tag("bankScrap(game, u.team, u.carry * tm.incomeMult);\n    u.carry -= added",'transport');
tag("bankScrap(game, u.team, u.carry * tm.incomeMult) / tm.incomeMult",'scavenger');
const code=['config','map'].map(f=>fs.readFileSync(dir+'/'+f+'.js','utf8')).join('\n')+'\n'+sim+'\n'+fs.readFileSync(dir+'/ai.js','utf8');
const ctx={console,Math,performance:{now:()=>Date.now()}};vm.createContext(ctx);
vm.runInContext(code+`\n;${over};\n
var inc={1:{},2:{}}, win=[600,1200,1800,2700,99999], incW={1:win.map(()=>({})),2:win.map(()=>({}))};
var _b=bankScrap; bankScrap=function(game,team,amount,quiet){const a=_b(game,team,amount,quiet); const s=globalThis.__src||'other'; globalThis.__src='other';
  inc[team][s]=(inc[team][s]||0)+a; const w=win.findIndex(x=>game.time<x); incW[team][w][s]=(incW[team][w][s]||0)+a; return a;};
var g=createGame({seed:${seed},difficulty:'${diff}',aiTeams:[1,2]});
var R={1:{ext:{},firstExt:null,peakScav:0,peakTrans:0,fullTicks:0,extTicks:0,armyBuilt:0},2:{ext:{},firstExt:null,peakScav:0,peakTrans:0,fullTicks:0,extTicks:0,armyBuilt:0}};
var marks=[300,600,900,1200,1800,2400,3000,3600], looseAt={};
while(!g.winner && g.time<${limit}){ for(const t of (g.rng()<0.5?[1,2]:[2,1])) aiUpdate(g,t); stepGame(g); g.events.length=0;
  if(g.tick%30===0){ for(const t of [1,2]){ const r=R[t]; const ex=g.entities.filter(e=>e.team===t&&e.type==='extractor'&&e.built>=1);
     if(ex.length&&r.firstExt===null) r.firstExt=Math.round(g.time);
     for(const e of ex){ r.extTicks++; if(e.stored>=e.def.store-0.01) r.fullTicks++; }
     r.peakScav=Math.max(r.peakScav,g.entities.filter(e=>e.team===t&&e.def.role==='harvester').length);
     r.peakTrans=Math.max(r.peakTrans,g.entities.filter(e=>e.team===t&&e.type==='transport').length);
     const m=marks.find(x=>Math.abs(g.time-x)<0.5); if(m) { r.ext[m]=ex.length; r['silo'+m]=g.entities.filter(e=>e.team===t&&e.type==='outsilo'&&e.built>=1).length; r['scrap'+m]=Math.round(g.teams[t].scrap); r['army'+m]=g.entities.filter(e=>e.team===t&&e.def.role==='combat').length; }
  }
  const m=marks.find(x=>Math.abs(g.time-x)<0.5); if(m) looseAt[m]=Math.round(g.scrap.filter(s=>!s.wreck).reduce((a,s)=>a+s.amount,0)); }
}
var out={seed:${seed},diff:'${diff}',winner:g.winner,time:Math.round(g.time),looseAt,teams:{}};
for(const t of [1,2]){ const r=R[t]; out.teams[t]={inc:Object.fromEntries(Object.entries(inc[t]).map(([k,v])=>[k,Math.round(v)])),incW:incW[t].map(o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Math.round(v)]))),
  ext:r.ext,firstExt:r.firstExt,peakScav:r.peakScav,peakTrans:r.peakTrans,fullFrac:r.extTicks?+(r.fullTicks/r.extTicks).toFixed(2):null,
  silo:{600:r.silo600,1200:r.silo1200,1800:r.silo1800}, army:{600:r.army600,1200:r.army1200,1800:r.army1800}, built:g.teams[t].stats.built, lost:g.teams[t].stats.lost}; }
console.log(JSON.stringify(out));`,ctx);
