import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),Q=require('../js/schedule.js'),Sim=require('../js/sim.js');
const route={nodes:['A','B'],stops:[true,true]};
test('only random bus seven has 18 seats and faster travel; dwell stays unchanged',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});s.phase=6;const g=S.graph(s),a=Q.timeline(g,s.config,1,route,0),b=Q.timeline(g,s.config,7,route,0);
 assert.equal(b.segments[0].t0,a.segments[0].t0);assert.equal(b.segments[0].t1-b.segments[0].t0,Math.max(1,Math.round((a.segments[0].t1-a.segments[0].t0)/1.5)));
 const requests=Array.from({length:20},(_,i)=>({id:i,key:'q'+i,o:'A',d:'B',t:0,kind:'base'}));
 for(const [id,n] of [[1,12],[7,18],[8,12]]){const r=Sim.run({g,config:s.config,phase:6,plan:{buses:[{id,route,offset:0}]},requests});assert.equal(r.log.filter(e=>e.type==='board'&&e.t===0).length,n);}
 assert.equal(Q.vehicle(cfg,7).capacity,12);
});
test('seven can only be assigned to five or rest, including recommendation application',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});s.phase=6;s.owned=7;s.draft.buses.push({id:7,routeNum:null,offset:0});S.addRoute(s,route,5);
 S.assign(s,7,5);S.assign(s,7,1);assert.equal(s.draft.buses.find(b=>b.id===7).routeNum,5);
 S.applyRecommendation(s,{plan:{buses:[{id:7,route,offset:0}]}});assert.equal(s.draft.buses.find(b=>b.id===7).routeNum,5);
 S.assign(s,7,null);assert.equal(s.draft.buses.find(b=>b.id===7).routeNum,null);
});
