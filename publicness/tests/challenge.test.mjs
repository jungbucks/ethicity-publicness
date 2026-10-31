import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),D=require('../js/demand.js'),Sim=require('../js/sim.js'),M=require('../js/metrics.js'),N=require('../js/narrative.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
test('default stays five phases; random and its seed replay get eight, six routes and nine buses',()=>{
 const before=JSON.stringify(cfg),s=S.create(cfg,{mode:'random',rand:()=>.123}),replay=S.create(cfg,{mode:'fixed',seed:s.seed});
 assert.equal(S.create(cfg).config.phases.length,5);assert.equal(s.config.phases.length,8);assert.deepEqual(s.config,replay.config);
 for(let phase=1;phase<=8;phase++){
  assert.equal(s.owned,phase+1);assert.equal(S.routeLimit(s),phase<3?phase+1:phase<6?4:phase<8?5:6);
  assert.equal(S.visibleNodeIds(s).includes('L'),phase>=6);assert.equal(S.visibleNodeIds(s).includes('M'),phase>=7);
  for(const r of s.draft.routes)if(!r.nodes.length)S.updateRoute(s,r.num,route(r.num===6?['A','N']:['A','B']));s.draft.buses.forEach(b=>{if(b.routeNum==null)S.assign(s,b.id,1);});
  // 이 설계(버스 전부 짧은 A–B)는 3단계부터 적자라 5단계에서 계약 종료된다 — 재정 종료는 finance-failure.test에서 보고, 여기서는 단계 진행만
  S.beginPlan(s);assert.ok(S.startRun(s));s.current.metrics.costs.total=Math.max(0,s.current.metrics.costs.total);S.finishRun(s);S.nextPhase(s);
  assert.equal(s.stage,phase===8?'ending':'reveal');
 }
 assert.equal(s.draft.routes.length,6);assert.equal(S.addRoute(s,route(['A','B'])),null);assert.equal(JSON.stringify(cfg),before);
});
test('family success requires every member to visit and return; mall is a concentrated burst',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});s.phase=6;const qs=D.base(s.config,6,42).filter(p=>p.familyId);assert.equal(qs.length,12);
 const direct=Sim.run({g:S.graph(s),config:s.config,phase:6,plan:{buses:[{id:1,route:route(['B','L']),offset:0}]},requests:qs.filter(p=>p.o==='B')});
 assert.deepEqual(M.familyReport(direct),{total:1,complete:1});
 const partial=structuredClone(direct);partial.passengers.find(p=>p.leg==='return').status='waiting';assert.deepEqual(M.familyReport(partial),{total:1,complete:0});
 const none=Sim.run({g:S.graph(s),config:s.config,phase:6,plan:{buses:[]},requests:qs});assert.deepEqual(M.familyReport(none),{total:3,complete:0});
 // 진호(7단계 인물)의 몰→신도시 귀가는 실제 도착 뒤에 생기므로 기본 목록은 119건(+귀가 1)
 const mall=D.base(s.config,7,42).filter(p=>p.o==='M'||p.d==='M');assert.equal(mall.length,119);
 const jinho=mall.filter(p=>p.residentId==='jinho');assert.equal(jinho.length,1);assert.deepEqual([jinho[0].o,jinho[0].d,jinho[0].t,jinho[0].returnTrip.earliest],['I','M',47,91]);assert.ok(mall.filter(p=>p.d==='M').every(p=>p.t>=46&&p.t<54));assert.ok(mall.filter(p=>p.o==='M').every(p=>p.t>=90&&p.t<98));
});

test('phase seven AI recommendation respects five routes and eight buses',()=>{
 const A=require('../js/advisor.js'),s=S.create(cfg,{mode:'fixed',seed:42});s.phase=7;s.owned=8;
 s.draft={routes:[{num:1,...route(['A','B'])}],buses:Array.from({length:8},(_,i)=>({id:i+1,routeNum:1,offset:0}))};
 const rec=A.recommendSync(S.revealed(s),'reach');assert.equal(rec.plan.buses.length,8);
 S.applyRecommendation(s,rec);assert.ok(s.draft.routes.length<=5);assert.ok(s.draft.routes.every(r=>r.num<=5&&(r.num!==5||new Set(r.nodes).size<=3)));assert.equal(s.draft.buses.length,8);assert.ok(s.draft.buses.every(b=>b.routeNum!=null));
});
test('random ending counts all seven phases with stricter inclusive thresholds',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});const targets={haneul:6,narae:6,jun:6,sol:4,yuna:3,daeun:3,jinho:1};
 const hs=Array.from({length:7},(_,i)=>({phase:i+1,residents:Object.fromEntries(s.config.residents.filter(r=>r.fromPhase<=i+1).map(r=>[r.id,{dayStatus:i-r.fromPhase+1<targets[r.id]?'complete':'returnIncomplete'}]))}));
 assert.ok(N.endingReactions(s.config,hs).every(r=>r.satisfied));hs[5].residents.haneul.dayStatus='returnIncomplete';assert.equal(N.endingReactions(s.config,hs)[0].satisfied,false);
});
