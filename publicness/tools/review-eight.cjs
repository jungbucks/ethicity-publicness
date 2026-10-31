const fs=require('fs'),cfg=require('../js/config.js'),S=require('../js/session.js'),N=require('../js/narrative.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
function play(seed,options={}){const s=S.create(cfg,{mode:'fixed',seed});const days=[];
 for(let phase=1;phase<=8;phase++){
 let paths=phase===1?[['F','D','A','G'],['B','C','A']]:phase===2?[['F','D'],['B','C','A'],['A','G']]:phase===3?[['F','D'],['B','C'],['A','G'],['I','A']]:phase<6?[['F','D','A'],['B','C','A'],['I','A','G'],['J','H','B']]:[['F','D','A'],['B','C','A'],['I','A','G'],['B','L','F','M'],['J','H','B']];
 if(options.shortBC)paths[1]=['B','C'];
 if(phase===6)paths[3]=['B','L','F'];if(phase===8)paths.push(['A','N']);
 for(const r of s.draft.routes)S.updateRoute(s,r.num,route(paths[r.num-1]));
 s.draft.buses.forEach(b=>S.assign(s,b.id,b.id===7?5:b.id===9?6:b.id<=4?b.id:b.id===5?4:b.id===6?3:4));
 S.beginPlan(s);const result=S.startRun(s);if(!result)throw S.validate(s);const h=S.finishRun(s);
 const metro=result.passengers.filter(p=>p.o==='N'||p.d==='N');
 days.push({phase,routes:structuredClone(S.routesInOrder(s)),buses:s.draft.buses.map(b=>({...b})),residents:h.residents,arrived:h.metrics.arrived,total:result.passengers.length,metro:metro.map(p=>({o:p.o,d:p.d,t:p.t,status:p.status,arriveT:p.arriveT,boardings:p.boardings,denied:p.deniedBoardings||0,fail:p.fail,journey:p.journey})),event:h.event});S.nextPhase(s);
 }return{seed,reactions:N.endingReactions(s.config,s.history).map(r=>({id:r.id,completed:r.completed,target:r.threshold,satisfied:r.satisfied})),days};}
module.exports={play};
if(require.main===module){
const runs=Array.from({length:50},(_,i)=>play(i));
fs.writeFileSync('publicness/tests/_play-review.json',JSON.stringify(runs,null,2));
console.log(JSON.stringify({allSatisfied:runs.filter(r=>r.reactions.every(p=>p.satisfied)).length,total:runs.length,seed42:runs[0].reactions,failed:runs.filter(r=>r.reactions.some(p=>!p.satisfied)).map(r=>({seed:r.seed,people:r.reactions.filter(p=>!p.satisfied)})),metro:runs.map(r=>({seed:r.seed,arrived:r.days[7].metro.filter(p=>p.status==='arrived').length,total:r.days[7].metro.length,transfers:r.days[7].metro.filter(p=>p.boardings===2&&p.status==='arrived').length}))},null,2));

}
