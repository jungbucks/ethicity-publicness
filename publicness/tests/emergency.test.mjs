import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),Sim=require('../js/sim.js'),D=require('../js/demand.js');
const Metrics=require('../js/metrics.js');
const Schedule=require('../js/schedule.js');
function setup(){const s=S.create(cfg);s.phase=3;s.owned=4;s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:id===1?1:null,offset:0}));S.beginPlan(s);S.updateRoute(s,1,{nodes:['A','B'],stops:[true,true]});S.updateRoute(s,2,{nodes:['F','D'],stops:[true,true]});return s;}
test('emergency change preserves prior events and takes effect without teleporting',()=>{
 const s=setup(),input={g:S.graph(s),config:s.config,phase:3,plan:S.toPlan(s),requests:D.base(s.config,3,s.seed)};
 const baseline=Sim.run(input),changed=Sim.run({...input,adjustments:[{at:34,busId:1,route:s.draft.routes[1]}]});
 assert.deepEqual(changed.log.filter(e=>e.t<34),baseline.log.filter(e=>e.t<34));
 const switched=changed.log.find(e=>e.type==='reassign');assert.ok(switched,'change eventually takes effect');assert.ok(switched.t>=34);
 const tl=changed.timelines.find(t=>t.busId===1);assert.ok(tl.segments.some(s=>s.deadhead&&s.t0>=34),'physical repositioning is recorded');
 assert.equal(Sim.hash(changed),Sim.hash(Sim.run({...input,adjustments:[{at:34,busId:1,route:s.draft.routes[1]}]})));
});
test('activating a resting bus twice charges only its actual operating interval',()=>{
 const s=setup(),input={g:S.graph(s),config:s.config,phase:3,plan:S.toPlan(s),requests:D.base(s.config,3,s.seed)};
 const result=Sim.run({...input,adjustments:[{at:34,busId:2,route:s.draft.routes[1]},{at:67,busId:2,route:s.draft.routes[0]}]});
 assert.equal(result.timelines.find(t=>t.busId===2).opMinutes,86);
 assert.deepEqual(Schedule.positionAt(result.timelines.find(t=>t.busId===2),s.config,20),{node:s.config.bus.depot,parked:true},'past resting state is preserved');
 const rows=Metrics.routeReport(result,s.draft.routes,s.draft.buses);
 assert.equal(rows.reduce((n,r)=>n+r.boardings,0),result.log.filter(e=>e.type==='board').length);
 assert.ok(rows.find(r=>r.num===2).buses>0);
});
test('session limits each checkpoint to one decision and persists the departure plan',()=>{
 const s=setup();S.startRun(s);const original=JSON.stringify(s.current.plan),expected=JSON.stringify(s.current.expected);
 assert.equal(typeof S.emergencyDecision,'function');assert.ok(S.emergencyDecision(s,34,1,2));assert.equal(S.emergencyDecision(s,34,2,2),false);
 assert.ok(S.emergencyDecision(s,67,null,null));assert.equal(S.emergencyDecision(s,68,1,1),false);
 assert.equal(JSON.stringify(s.current.plan),original);assert.equal(JSON.stringify(s.current.expected),expected);
 S.finishRun(s);const restored=S.restore(S.serialize(s),cfg);assert.equal(Sim.hash(restored.current.result),Sim.hash(s.current.result));assert.equal(restored.history.length,1);
});
test('an unrelated emergency does not remove passengers already waiting for a transfer',()=>{
 const c=structuredClone(cfg);c.bus.capacity=1;const s=S.create(c),g=S.graph(s);
 const route=nodes=>({nodes,stops:nodes.map(()=>true)}),input={g,config:s.config,phase:1,plan:{buses:[{id:1,route:route(['A','B']),offset:0},{id:2,route:route(['B','C']),offset:0},{id:3,route:null,offset:0}]},requests:[...Array.from({length:6},(_,i)=>({id:i+1,key:'q'+i,o:'B',d:'C',t:0,kind:'base'})),{id:100,key:'transfer',o:'A',d:'C',t:0,kind:'base'}]};
 const baseline=Sim.run(input),changed=Sim.run({...input,adjustments:[{at:34,busId:3,route:route(['F','D'])}]});
 assert.equal(baseline.passengers.find(p=>p.id===100).status,'arrived');
 assert.equal(changed.passengers.find(p=>p.id===100).status,'arrived');
});
test('emergency assignment cannot bypass express and regional vehicle restrictions',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});s.phase=8;s.owned=9;s.draft.routes=[];s.draft.buses=Array.from({length:9},(_,i)=>({id:i+1,routeNum:null,offset:0}));
 const r=nodes=>({nodes,stops:nodes.map(()=>true)});S.addRoute(s,r(['F','D']),1);S.addRoute(s,r(['A','B','C']),5);S.addRoute(s,r(['A','N']),6);S.beginPlan(s);S.assign(s,7,5);S.assign(s,9,6);S.startRun(s);
 assert.equal(S.emergencyDecision(s,34,9,1),false);assert.equal(S.emergencyDecision(s,34,7,6),false);assert.equal(S.emergencyDecision(s,34,1,6),false);assert.equal((s.emergencyLog||[]).length,0);
});
