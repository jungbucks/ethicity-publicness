// Exploratory scenarios; production demand is not changed by this script.
const cfg=require('../js/config.js'),G=require('../js/graph.js'),D=require('../js/demand.js'),Sim=require('../js/sim.js'),Sch=require('../js/schedule.js');
for(const allocation of ['newtown','spread'])for(const growth of [[1,1,1],[1,2,3],[1,2,4]])for(let phase=3;phase<=5;phase++){
 const c=structuredClone(cfg);c.demandRows.forEach(r=>{if(r.a==='I'||r.b==='I')r.n*=growth[phase-3];});
 const g=G.build(c,phase),paths=[['F','C','D'],['B','C','A','G'],phase>=4?['H','E','J','A']:['H','E','A'],['I','D','A']];
 const routes=paths.map(nodes=>({nodes,stops:nodes.map(()=>true)}));
 const plan=Sch.spacePlan(g,c,{buses:Array.from({length:phase+1},(_,i)=>({id:i+1,route:routes[i<4?i:allocation==='newtown'?3:i-3],offset:0}))});
 let total=0,arr=0,nt=0,ntarr=0,full=0;
 for(const seed of [7,42,101,2026]){
  const res=Sim.run({g,config:c,phase,plan,requests:D.base(c,phase,seed)});
  for(const p of res.passengers){total++;if(p.status==='arrived')arr++;if(p.o==='I'||p.d==='I'){nt++;if(p.status==='arrived')ntarr++;}}
  full+=res.log.filter(e=>e.type==='full').length;
 }
 console.log(JSON.stringify({allocation,growth:growth.join('/'),phase,buses:phase+1,nominalNewTown:D.directional(c,phase).filter(r=>r.o==='I'||r.d==='I').reduce((a,r)=>a+r.n,0),requests:total/4,arrivalPct:Math.round(arr/total*100),newTownArrivalPct:Math.round(ntarr/nt*100),fullEvents:full/4}));
}
