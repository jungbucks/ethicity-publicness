import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),Q=require('../js/schedule.js'),D=require('../js/demand.js'),Sim=require('../js/sim.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
function eight(){const s=S.create(cfg,{mode:'fixed',seed:42});for(let i=1;i<8;i++){s.stage='result';S.nextPhase(s);}return s;}
test('random eighth phase awards one dedicated regional bus and route; default remains five',()=>{
 const s=eight();assert.equal(s.config.phases.length,8);assert.equal(s.owned,9);assert.equal(S.routeLimit(s),6);
 assert.equal(s.draft.buses.find(b=>b.id===9).routeNum,null);assert.ok(S.routeByNum(s,6));assert.ok(S.visibleNodeIds(s).includes('N'));
 assert.equal(S.create(cfg).config.phases.length,5);assert.equal(cfg.nodes.some(n=>n.id==='N'),false);
 assert.equal(Q.vehicle(s.config,9).capacity,24);assert.equal(Q.vehicle(s.config,9).speed,1);
});
test('regional route is one village stop to city, with exclusive vehicle assignment',()=>{
 const s=eight();assert.ok(S.updateRoute(s,6,route(['A','N'])));
 for(const ns of [['A','B'],['A','N','B'],['N','A','N']])assert.equal(S.updateRoute(s,6,route(ns)),null);
 assert.equal(S.updateRoute(s,1,route(['A','N'])),null);
 S.assign(s,9,6);S.assign(s,9,1);assert.equal(s.draft.buses.find(b=>b.id===9).routeNum,6);
 S.assign(s,1,6);assert.equal(s.draft.buses[0].routeNum,null); // 6번 광역에는 9호차만
 S.applyRecommendation(s,{plan:{buses:[{id:9,route:route(['B','N']),offset:0}]}});
 assert.deepEqual(S.routeByNum(s,6).nodes,['B','N']);assert.equal(s.draft.buses.find(b=>b.id===9).routeNum,6);
});
test('city commute demand appears only in eighth phase and regional capacity causes overflow',()=>{
 const s=eight(),qs=D.base(s.config,8,s.seed).filter(q=>q.o==='N'||q.d==='N');assert.equal(qs.length,72);
 assert.ok(qs.filter(q=>q.d==='N').every(q=>q.t>=8&&q.t<25));assert.ok(qs.filter(q=>q.o==='N').every(q=>q.t>=80&&q.t<96));
 assert.equal(D.base(s.config,7,s.seed).some(q=>q.o==='N'||q.d==='N'),false);
 const requests=Array.from({length:26},(_,i)=>({id:i,key:'r'+i,o:'A',d:'N',t:0,kind:'base'}));
 const result=Sim.run({g:S.graph(s),config:s.config,phase:8,plan:{buses:[{id:9,route:route(['A','N']),offset:0}]},requests});
 assert.equal(result.log.filter(e=>e.type==='board'&&e.t===0).length,24);
 assert.ok(result.passengers.some(p=>p.deniedBoardings>0));
});
test('city journey can transfer from a village bus and return through the same gateway',()=>{
 const s=eight();const requests=[{id:1,key:'out',o:'B',d:'N',t:2,kind:'base'},{id:2,key:'back',o:'N',d:'B',t:80,kind:'base'}];
 const result=Sim.run({g:S.graph(s),config:s.config,phase:8,plan:{buses:[{id:1,route:route(['B','A']),offset:0},{id:9,route:route(['A','N']),offset:0}]},requests});
 assert.ok(result.passengers.every(p=>p.status==='arrived'&&p.boardings===2));
});
test('eighth-phase AI respects exclusive regional service before and after applying',()=>{
 const A=require('../js/advisor.js'),s=eight();
 for(const r of s.draft.routes)S.updateRoute(s,r.num,route(r.num===6?['A','N']:['A','B']));
 const rec=A.recommendSync(S.revealed(s),'time');
 for(const b of rec.plan.buses)if(b.route){assert.equal(b.route.nodes.includes('N'),b.id===9);if(b.id===9)assert.equal(b.route.nodes.length,2);}
 S.applyRecommendation(s,rec);assert.deepEqual(S.validate(s),[]);
 const actual=S.toPlan(s);for(const b of rec.plan.buses)assert.deepEqual(actual.buses.find(a=>a.id===b.id),b);
});
