import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('./planned-fixture.cjs'),G=require('../js/graph.js'),S=require('../js/schedule.js');
const g=G.build(cfg,1),r={nodes:['A','B','C'],stops:[true,true,true]};
test('distance-based schedule starts at zero and reverses at each endpoint',()=>{
  const tl=S.timeline(g,cfg,1,r,0);
  assert.deepEqual(tl.visits.slice(0,5).map(v=>[v.t,v.node,v.runIn,v.runOut]),[[0,'A',-1,0],[6,'B',0,0],[12,'C',0,1],[18,'B',1,1],[24,'A',1,2]]);
  assert.equal(tl.opMinutes,120);assert.ok(tl.segments.every(s=>!s.deadhead));
});
test('outlying first stop starts immediately without travelling via train station',()=>{
  const tl=S.timeline(g,cfg,2,{nodes:['F','C'],stops:[true,true]},0);
  assert.equal(tl.visits[0].node,'F');assert.equal(tl.visits[0].t,0);assert.equal(tl.offset,0);
  assert.ok(tl.segments.every(s=>!s.deadhead));
});
test('pass node skips dwell in engine fixtures',()=>{
  const tl=S.timeline(g,cfg,1,{nodes:r.nodes,stops:[true,false,true]},0);
  assert.deepEqual(tl.visits.slice(0,3).map(v=>[v.t,v.kind]),[[0,'stop'],[6,'pass'],[11,'stop']]);
});
test('movement costs clip at simulation window',()=>{
  const tl=S.timeline(g,cfg,1,r,12);
  assert.ok(tl.visits.every(v=>v.t<=120));
  assert.equal(tl.moveMinutes,tl.segments.reduce((sum,s)=>sum+Math.max(0,Math.min(s.t1,120)-s.t0),0));
  assert.ok(tl.moveMinutes<=120);
});
test('unassigned bus stays parked',()=>{
  const tl=S.timeline(g,cfg,3,null,0);assert.equal(tl.opMinutes,0);assert.equal(tl.visits.length,0);
  assert.deepEqual(S.positionAt(tl,cfg,50),{node:'A',parked:true});
});
test('position interpolates distance segments and holds at stops',()=>{
  const tl=S.timeline(g,cfg,1,r,0);
  assert.deepEqual(S.positionAt(tl,cfg,0),{node:'A',parked:false});
  assert.deepEqual(S.positionAt(tl,cfg,3.5),{from:'A',to:'B',f:0.5,parked:false});
  assert.deepEqual(S.positionAt(tl,cfg,6.5),{node:'B',parked:false});
});
