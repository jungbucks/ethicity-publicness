import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const M=require('../js/bus-motion.js');
const nodes=[{id:'A',x:0,y:0},{id:'B',x:4,y:0},{id:'C',x:4,y:4}];
const seg=(from,to,t0,t1)=>({from,to,t0,t1});
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

test('arrival, dwell and departure share one curbside pose; seeking is deterministic',()=>{
  const tl={segments:[seg('A','B',1,5),seg('B','C',6,10)]}, original=JSON.stringify(tl);
  const c=M.compile(tl,nodes), arrival=M.sample(c,5);
  assert.ok(gap(M.sample(c,5-1e-5),arrival)<1e-4);
  assert.deepEqual(M.sample(c,5.5),arrival);
  assert.ok(gap(M.sample(c,6+1e-5),arrival)<1e-4);
  assert.ok(angle(M.sample(c,6+1e-5).heading,arrival.heading)<1e-3);
  const at=M.sample(c,7); M.sample(c,100); assert.deepEqual(M.sample(c,7),at);
  assert.equal(JSON.stringify(tl),original,'render paths do not mutate timetable');
});
test('stopping segments accelerate and brake but pass-through stops maintain speed',()=>{
  const c=M.compile({segments:[seg('A','B',1,5),seg('B','C',5,9)]},nodes);
  const distance=(t)=>gap(M.sample(c,t),M.sample(c,t+.01));
  assert.ok(distance(1.01)<distance(2)*.2);
  assert.ok(distance(4.98)>distance(2)*.6,'passing B does not brake');
  assert.ok(distance(8.98)<distance(8)*.2);
  assert.ok(angle(M.sample(c,4.9999).heading,M.sample(c,5.0001).heading)<.01);
});
test('terminal turnaround moves along a curve instead of rotating in place',()=>{
  const c=M.compile({segments:[seg('A','B',1,5),seg('B','A',6,10)]},nodes);
  const poses=Array.from({length:161},(_,i)=>M.sample(c,6+i*.025));
  const corner=poses.find(p=>Math.abs(Math.sin(p.heading))>.8);
  assert.ok(corner,'turn passes through a sideways heading');
  assert.ok(gap(corner,poses[0])>M.road.lane*.5,'body moves relative to lane width while changing direction');
  for(let i=1;i<poses.length;i++) assert.ok(angle(poses[i].heading,poses[i-1].heading)<.55,'no instant 180 flip');
  assert.ok(M.sample(c,3).y>0 && M.sample(c,9).y<0,'opposite directions use opposite lanes');
});
test('short edges, repeated nodes, empty timelines and reverse seeks stay finite',()=>{
  assert.equal(M.sample(M.compile({segments:[]},nodes),0),null);
  const c=M.compile({segments:[seg('A','A',0,0),seg('A','B',0,1),seg('B','C',1,2)]},
    [{id:'A',x:0,y:0},{id:'B',x:.15,y:0},{id:'C',x:.01,y:.001}]);
  for(let t=-1;t<4;t+=.013){const p=M.sample(c,t);assert.ok(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.heading));}
});
test('heading follows actual travel even when adjacent streets have very different lengths',()=>{
  const c=M.compile({segments:[seg('A','B',0,4),seg('B','C',5,6)]},
    [{id:'A',x:0,y:0},{id:'B',x:4,y:0},{id:'C',x:4,y:.2}]);
  for(let t=.5;t<3.8;t+=.1){
    const p=M.sample(c,t),q=M.sample(c,t+.00001),travel=Math.atan2(q.y-p.y,q.x-p.x);
    assert.ok(angle(p.heading,travel)<.01,'bus nose follows its velocity');
  }
});
test('roadside shelters avoid other routes crossing near their own stop',()=>{
  const ns=[{id:'C',x:-2,y:2.6},{id:'D',x:3,y:-2.34},{id:'F',x:-4.8,y:3.64}];
  const p=M.shelterPosition('C',ns,[['C','D'],['D','F']],[]);
  const a=ns[1],b=ns[2],dx=b.x-a.x,dy=b.y-a.y;
  const f=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
  assert.ok(Math.hypot(p.x-a.x-f*dx,p.y-a.y-f*dy)>M.road.halfWidth+.35,'whole shelter clears unrelated D–F road');
});
test('physical roads include emergency deadhead links without inventing service routes',()=>{
  const ns=nodes.concat([{id:'D',x:0,y:4}]);
  const routes=[{route:{nodes:['A','B']}},{route:{nodes:['C','D']}}];
  const segments=[{from:'B',to:'C',deadhead:true},{from:'C',to:'B',deadhead:true}];
  assert.deepEqual(M.roadEdges(routes,segments,ns),[['A','B'],['C','D'],['B','C']]);
  assert.deepEqual(routes.map(r=>r.route.nodes),[['A','B'],['C','D']]);
});
