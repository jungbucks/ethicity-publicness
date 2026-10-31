import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),Sch=require('../js/schedule.js'),G=require('../js/graph.js'),A=require('../js/advisor.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
test('five phases automatically grant 2/3/4/5/6 buses and 2/3/4/4/4 route slots',()=>{
 const s=S.create(cfg);
 for(let phase=1;phase<=5;phase++){
  assert.equal(s.owned,phase+1);assert.equal(S.routeLimit(s),Math.min(phase+1,4));
  assert.equal(s.draft.routes.length,Math.min(phase+1,4));assert.equal(S.addRoute(s,route([])),null);
  assert.equal(s.draft.buses.at(-1).routeNum,null); // 새 버스는 모든 단계에서 쉬기
  for(const r of s.draft.routes)if(!r.nodes.length)S.updateRoute(s,r.num,route(['A','B']));
  S.assign(s,s.owned,1);S.beginPlan(s);assert.deepEqual(S.validate(s),[]);assert.ok(S.startRun(s));S.finishRun(s);S.nextPhase(s);
 }
 assert.equal(s.stage,'ending');
});
test('random layout is seeded, bounded, separated and does not mutate default',()=>{
 const before=JSON.stringify(cfg),s=S.create(cfg,{mode:'random',rand:()=>.123}),t=S.create(cfg,{mode:'fixed',seed:s.seed}),u=S.create(cfg,{mode:'random',rand:()=>.75});
 assert.notDeepEqual(s.config.nodes,cfg.nodes);assert.deepEqual(s.config.nodes,t.config.nodes);assert.notDeepEqual(s.config.nodes,u.config.nodes);
 // 2026-10-27 세로로 펼침(js/layout.js SPREAD_Y 1.45): 세로 한계 2.8 → 2.8×1.45
 for(const n of s.config.nodes){assert.ok(Math.abs(n.x)<=(n.id==='N'?8.7:4.8)&&Math.abs(n.y)<=2.8*1.45+1e-9);for(const m of s.config.nodes)if(m!==n)assert.ok(Math.hypot(m.x-n.x,m.y-n.y)>=1.5);}
 assert.equal(JSON.stringify(cfg),before);assert.deepEqual(S.create(cfg).config.nodes,cfg.nodes);
 for(let seed=0;seed<100;seed++){
  const nodes=S.create(cfg,{mode:'fixed',seed}).config.nodes,f=nodes.find(n=>n.id==='F');
  assert.equal(Math.abs(f.x),4.8);assert.equal(Math.abs(f.y),Math.round(2.8*1.45*100)/100);
  // The phase-five local welfare centre deliberately serves the outer village nearby.
  for(const n of nodes)if(n!==f)assert.ok(Math.hypot(n.x-f.x,n.y-f.y)>=(n.id==='K'?1.5:2.6));
 }
 const [a,b]=s.config.nodes;assert.equal(S.graph(s).time(a.id,b.id),Math.max(1,Math.round(Math.hypot(a.x-b.x,a.y-b.y)*cfg.map.pixelsPerUnit/cfg.map.pixelsPerSecond)));
});
test('same-route buses receive automatic even departures in engine and AI respects four routes',()=>{
 const s=S.create(cfg);s.phase=5;s.owned=6;s.draft.routes=[{...route(['A','B']),num:1}];s.draft.buses=Array.from({length:6},(_,i)=>({id:i+1,routeNum:1,offset:0}));
 const p=S.toPlan(s),cycle=G.cycleMinutes(S.graph(s),p.buses[0].route);
 assert.deepEqual(p.buses.map(b=>b.offset),p.buses.map((b,i)=>Math.round(cycle*i/6)));
 assert.equal(Sch.timeline(S.graph(s),s.config,2,p.buses[1].route,p.buses[1].offset).visits[0].t,p.buses[1].offset);
 const rec=A.recommendSync(S.revealed(s),'time');assert.ok(new Set(rec.plan.buses.filter(b=>b.route).map(b=>JSON.stringify(b.route))).size<=4);S.applyRecommendation(s,rec);assert.deepEqual(S.validate(s),[]);
});
test('long routes still dispatch every allocated bus during the run without negative costs',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:5});s.phase=5;
 const r=route(['A','G','B','D','F','I','H','C','E']);
 const p=Sch.spacePlan(S.graph(s),s.config,{buses:Array.from({length:6},(_,i)=>({id:i+1,route:r,offset:0}))});
 for(const b of p.buses){assert.ok(b.offset<120);assert.ok(Sch.timeline(S.graph(s),s.config,b.id,r,b.offset).opMinutes>=0);}
});
