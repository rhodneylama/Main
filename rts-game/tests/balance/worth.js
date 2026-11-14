// Income per minute of each way of earning, measured in the real rules (no combat).
const fs=require('fs'),vm=require('vm'); const dir=process.argv[2], over=process.argv[3]||'';
function run(setup){ const ctx={console,Math};vm.createContext(ctx);
 vm.runInContext(['config','map','sim'].map(f=>fs.readFileSync(dir+'/'+f+'.js','utf8')).join('\n')+`;${over};
 BUILDING_TYPES.recycler.capacity=1e9; BUILDING_TYPES.recycler.income=0;
 var g=createGame({seed:42,aiTeams:[]}); const m=g.entities.find(e=>e.team===1&&e.type==='mobileRecycler'); const gy=g.geysers.slice().sort((a,b)=>dist(a,m)-dist(b,m))[0];
 issueCommand(g,1,{type:'deploy',ids:[m.id],geyserId:gy.id}); for(let i=0;i<30*15;i++) stepGame(g);
 for(const u of g.entities) if(u.team===1&&u.def.role==='harvester') u.hp=0; stepGame(g);
 const rec=g.entities.find(e=>e.team===1&&e.type==='recycler'); const free=g.geysers.filter(x=>!x.extractorId&&dist(x,rec)<dist(x,{x:g.map.W*32-rec.x,y:g.map.H*32-rec.y})).sort((a,b)=>dist(a,rec)-dist(b,rec));
 var R={setup:'${setup}'}; const S='${setup}';
 const ext=[]; const mk=(gx)=>{const s=addUnit(g,'scavenger2',1,gx.x+40,gx.y); issueCommand(g,1,{type:'deploy',ids:[s.id],geyserId:gx.id});};
 if(S.startsWith('scav')) for(let i=0;i<+S.slice(4);i++) { const u=addUnit(g,'scavenger',1,rec.x+50,rec.y+i*10); autoHarvest(g,u); }
 else { const idx=+S.split(':')[1]; mk(free[idx]); }
 for(let i=0;i<30*12;i++) stepGame(g);
 const ex=g.entities.find(e=>e.team===1&&e.type==='extractor');
 if(S.includes('trans')) for(let i=0;i<+S.split('trans')[1];i++){ const t=addUnit(g,'transport',1,rec.x+60,rec.y); t.autoHaul=true; t.order={type:'haul',phase:'pick',fixedId:0}; }
 if(S.includes('silo')&&ex){ g.teams[1].explored.fill(1); let done=false; for(let dy=-3;dy<=3&&!done;dy++)for(let dx=-3;dx<=3&&!done;dx++){ if(canPlaceBuilding(g,1,'outsilo',ex.tx+dx,ex.ty+dy).ok){ addBuilding(g,'outsilo',1,ex.tx+dx,ex.ty+dy,true); done=true; } } R.silo=done; }
 if(ex) R.extDist=Math.round(dist(ex,rec)/32);
 const s0=g.teams[1].stats.scrapGathered; for(let i=0;i<30*600;i++) stepGame(g); R.perMin=+((g.teams[1].stats.scrapGathered-s0)/10).toFixed(1);
 if(ex) R.tankFullAtEnd=Math.round(ex.stored);`,ctx); return ctx.R; }
const rows=[run('scav1'),run('scav3'),...[0,1,2].flatMap(i=>[run('ext:'+i+':trans1'),run('ext:'+i+':trans2'),run('ext:'+i+':silo')])];
console.log(rows.map(r=>`${r.setup.padEnd(14)} ${r.extDist!=null?('geyser '+r.extDist+' tiles out').padEnd(22):''.padEnd(22)} ${r.perMin}/min${r.tankFullAtEnd!=null?'  tank '+r.tankFullAtEnd:''}`).join('\n'));
