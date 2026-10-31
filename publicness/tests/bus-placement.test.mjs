// 노선 완성 시 대기 버스 1대 자동 배치(Session.autoPlace)·운영비 미리 보기(busCost) 규칙
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),Sim=require('../js/sim.js'),Demand=require('../js/demand.js');
const resting=s=>s.draft.buses.filter(b=>b.routeNum==null).length,on=(s,n)=>s.draft.buses.filter(b=>b.routeNum===n).map(b=>b.id);
const total=s=>s.draft.buses.length;

test('a completed route takes exactly one resting bus, once, without creating buses',()=>{
 const s=S.create(cfg);S.beginPlan(s);const r=S.routeByNum(s,1);
 assert.equal(resting(s),2);
 r.nodes=['F'];r.stops=[true];assert.equal(S.autoPlace(s,1),null,'one stop is not a route yet');assert.equal(resting(s),2);
 r.nodes=['F','D'];r.stops=[true,true];assert.deepEqual(S.autoPlace(s,1),{busId:1});
 assert.deepEqual(on(s,1),[1]);assert.equal(resting(s),1);assert.equal(total(s),2);assert.equal(s.owned,2);
 // 고치다 다시 완성돼도(정류장 1곳 → 2곳) 두 번째 배치는 없다
 S.assign(s,1,null);r.nodes=['F'];r.stops=[true];r.nodes=['F','E'];r.stops=[true,true];
 assert.equal(S.autoPlace(s,1),null);assert.deepEqual(on(s,1),[]);assert.equal(resting(s),2);
});
test('no resting bus: the route stays idle and counts never go negative',()=>{
 const s=S.create(cfg);S.beginPlan(s);const r1=S.routeByNum(s,1),r2=S.routeByNum(s,2);
 r1.nodes=['F','D'];r1.stops=[true,true];S.autoPlace(s,1);S.assign(s,2,1);
 assert.equal(resting(s),0);
 r2.nodes=['A','B'];r2.stops=[true,true];assert.deepEqual(S.autoPlace(s,2),{busId:null});
 assert.deepEqual(on(s,2),[]);assert.equal(resting(s),0);assert.equal(total(s),2);
 assert.equal(S.validate(s).length,0,'an idle route does not block departure');
});
test('a route that already has a bus is not topped up',()=>{
 const s=S.create(cfg);S.beginPlan(s);const r=S.routeByNum(s,1);S.assign(s,2,1);
 r.nodes=['F','D'];r.stops=[true,true];assert.equal(S.autoPlace(s,1),null);assert.deepEqual(on(s,1),[2]);assert.equal(resting(s),1);
});
test('challenge dedicated buses go to their own routes first and never to others',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});S.beginPlan(s);s.phase=8;s.owned=9;
 s.draft.buses=[1,2,3,4,5,6,7,8,9].map(id=>({id,routeNum:id<=6?1:null,offset:0}));
 s.draft.routes=[{num:1,nodes:['A','B'],stops:[true,true]}];
 S.addRoute(s,{nodes:['A','C'],stops:[true,true]},5);assert.deepEqual(S.autoPlace(s,5),{busId:7});
 S.addRoute(s,{nodes:['B','N'],stops:[true,true]},6);assert.deepEqual(S.autoPlace(s,6),{busId:9});
 S.addRoute(s,{nodes:['C','D'],stops:[true,true]},2);assert.deepEqual(S.autoPlace(s,2),{busId:8});
 S.addRoute(s,{nodes:['D','E'],stops:[true,true]},3);assert.deepEqual(S.autoPlace(s,3),{busId:null},'7 and 9 are not borrowed for ordinary routes');
});
test('busCost equals the operating+moving cost the engine charges for that bus',()=>{
 const s=S.create(cfg);S.beginPlan(s);const r=S.routeByNum(s,1);r.nodes=['F','D','E'];r.stops=[true,true,true];S.autoPlace(s,1);
 const est=S.busCost(s,2,1);assert.ok(est>0);
 S.assign(s,2,1);const plan=S.toPlan(s),res=Sim.run({g:S.graph(s),config:s.config,phase:1,plan,requests:Demand.base(s.config,1,s.seed)});
 const tl=res.timelines.find(t=>t.busId===2),F=s.config.finance;
 assert.equal(est,Math.round((F.opPerMin*tl.opMinutes+F.fuelPerKm*tl.km)/100)*100);
 assert.ok(S.typicalBusCost(s)>=20000&&S.typicalBusCost(s)<=40000);
});
test('autoPlaced survives save/restore and old saves without the flag still load',()=>{
 const s=S.create(cfg);S.beginPlan(s);const r=S.routeByNum(s,1);r.nodes=['F','D'];r.stops=[true,true];S.autoPlace(s,1);
 const back=S.restore(S.serialize(s),cfg);assert.equal(S.routeByNum(back,1).autoPlaced,true);assert.deepEqual(on(back,1),[1]);
 const old=S.serialize(s);delete old.draft.routes[0].autoPlaced;const legacy=S.restore(old,cfg);
 assert.deepEqual(on(legacy,1),[1]);assert.equal(S.autoPlace(legacy,1),null,'legacy route already has its bus');
});
