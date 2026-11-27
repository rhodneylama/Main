const fs=require('fs');
for(const f of process.argv.slice(2)){
 const G=fs.readFileSync(require('path').join(__dirname,'out',f+'.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const T=G.flatMap(g=>[1,2].map(t=>g.teams[t]));
 const avg=a=>{a=a.filter(x=>x!=null&&!isNaN(x)); return a.length? a.reduce((x,y)=>x+y,0)/a.length : NaN;};
 const med=a=>{a=a.slice().sort((x,y)=>x-y); return a[Math.floor(a.length/2)];};
 const share=(win)=>{const s={}; for(const t of T){const o=win==null?t.inc:t.incW[win]; for(const k in o) s[k]=(s[k]||0)+o[k];} const tot=Object.values(s).reduce((a,b)=>a+b,0)||1;
   return ['scavenger','extractor','transport','recycler'].map(k=>k.slice(0,5)+' '+Math.round((s[k]||0)/tot*100)+'%').join(' ')+`  (avg ${Math.round(tot/T.length)} per side)`;};
 const ended=G.filter(g=>g.winner);
 console.log(`\n### ${f}: ${G.length} games, ${ended.length} ended (median ${ended.length?Math.round(med(ended.map(g=>g.time))/60):'-'} min, ${ended.map(g=>Math.round(g.time/60)).sort((a,b)=>a-b).join(',')}), unfinished ${G.length-ended.length}; wins 1:${G.filter(g=>g.winner===1).length} 2:${G.filter(g=>g.winner===2).length}`);
 console.log(' income share 0-10m :', share(0)); console.log(' income share 10-20m:', share(1)); console.log(' income share 20-30m:', share(2)); console.log(' income share whole :', share(null));
 console.log(` extractors at 5/10/20/30 min: ${[300,600,1200,1800].map(m=>avg(T.map(t=>t.ext[m])).toFixed(1)).join(' / ')}  first at ${Math.round(avg(T.map(t=>t.firstExt)))}s  tank-full ${Math.round(avg(T.map(t=>t.fullFrac))*100)}% of the time`);
 console.log(` peak scavengers ${avg(T.map(t=>t.peakScav)).toFixed(1)}, peak transports ${avg(T.map(t=>t.peakTrans)).toFixed(1)}, ext silos at 20m ${avg(T.map(t=>t.silo[1200])).toFixed(1)}, army at 10/20m ${avg(T.map(t=>t.army[600])).toFixed(1)}/${avg(T.map(t=>t.army[1200])).toFixed(1)}, built ${Math.round(avg(T.map(t=>t.built)))}`);
 console.log(` loose scrap left (whole map) at 10/20/30/40 min: ${[600,1200,1800,2400].map(m=>{const v=avg(G.map(g=>g.looseAt[m])); return isNaN(v)?'-':Math.round(v/1000)+'k';}).join(' / ')}`);
}
