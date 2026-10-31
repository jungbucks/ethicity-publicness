const fs=require('fs'),runs=require('../tests/_play-review.json'),cfg=require('../js/config.js'),S=require('../js/session.js');
const out=[];
for(const seed of [42,7,17]){
 const d=runs.find(r=>r.seed===seed).days[7],s=S.create(cfg,{mode:'fixed',seed});s.phase=8;s.owned=9;
 let best=null;
 for(const hub of S.visibleNodeIds(s).filter(n=>n!=='N'))for(let mask=0;mask<16;mask++)for(const allocation of [0,1,2,3]){
  s.stage='plan';s.draft={routes:structuredClone(d.routes),buses:structuredClone(d.buses)};
  const uniq=xs=>[...new Set(xs)];s.draft.routes.find(r=>r.num===1).nodes=uniq(['F','D',hub]);s.draft.routes.find(r=>r.num===2).nodes=uniq(['B','C',hub]);s.draft.routes.find(r=>r.num===3).nodes=uniq(['I','A','G',hub]);s.draft.routes.find(r=>r.num===6).nodes=[hub,'N'];s.draft.routes.forEach(r=>r.stops=r.nodes.map(()=>true));
  [1,2,3,6].forEach((num,i)=>{if(mask&(1<<i)){let r=s.draft.routes.find(r=>r.num===num);r.nodes.reverse();r.stops.reverse();}});
  if(allocation)S.assign(s,8,allocation);
  const res=S.startRun(s),h=S.finishRun(s);s.history=[];
  const metro=res.passengers.filter(p=>p.o==='N'||p.d==='N');let cand={seed,hub,mask,allocation,metro:metro.filter(p=>p.status==='arrived').length,out:metro.filter(p=>p.d==='N'&&p.status==='arrived').length,back:metro.filter(p=>p.o==='N'&&p.status==='arrived').length,people:Object.entries(h.residents).filter(([id,r])=>r?.dayStatus==='complete').map(([id])=>id),routes:structuredClone(s.draft.routes),buses:structuredClone(s.draft.buses)};
  if(!best||cand.metro>best.metro||cand.metro===best.metro&&cand.people.length>best.people.length)best=cand;
 }out.push(best);
}
fs.writeFileSync('publicness/tests/_gateway-review.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
