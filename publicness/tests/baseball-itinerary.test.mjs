import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),D=require('../js/demand.js'),S=require('../js/session.js'),Sim=require('../js/sim.js');
test('terminal stadium adds four generic trips each way from phase four, afternoon out and night back',()=>{
 for(const phase of [4,5]){const qs=D.base(cfg,phase,42).filter(p=>!p.residentId),out=qs.filter(p=>p.o==='J'&&p.d==='H'),back=qs.filter(p=>p.o==='H'&&p.d==='J');assert.equal(out.length,4);assert.equal(back.length,4);assert.ok(out.every(p=>p.t>=60&&p.t<80));assert.ok(back.every(p=>p.t>=100&&p.t<113));}
});
test('two guests appear only in phase four and change origin and final destination in phase five',()=>{
 assert.equal(D.base(cfg,3,42).filter(p=>['yuna','daeun'].includes(p.residentId)).length,0);
 for(const phase of [4,5]){
  const s=S.create(cfg);s.phase=phase;
  const requests=D.base(cfg,phase,42).filter(p=>['yuna','daeun'].includes(p.residentId));assert.equal(requests.length,2);
  const origin=phase===4?'J':'B',last=phase===4?'B':'J';assert.ok(requests.every(p=>p.o===origin&&p.d==='H'&&p.returnTrip.destination===last));
  const nodes=[origin,'H',last],plan={buses:[{id:1,offset:0,route:{nodes,stops:nodes.map(()=>true)}}]};
  const res=Sim.run({g:S.graph(s),config:cfg,phase,plan,requests});assert.equal(res.passengers.length,4);
  for(const id of ['yuna','daeun']){const first=res.passengers.find(p=>p.residentId===id&&p.leg==='outbound'),next=res.passengers.find(p=>p.residentId===id&&p.leg==='return');assert.equal(first.status,'arrived');assert.equal(next.o,'H');assert.equal(next.d,last);assert.equal(next.status,'arrived');assert.ok(next.t>=100&&next.t>=first.arriveT+first.returnTrip.stay);}
  assert.equal(new Set(res.passengers.map(p=>p.id)).size,4);
  const blocked=Sim.run({g:S.graph(s),config:cfg,phase,plan:{buses:[]},requests});assert.equal(blocked.passengers.length,2);
 }
});
