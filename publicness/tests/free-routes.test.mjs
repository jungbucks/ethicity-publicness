import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('./planned-fixture.cjs'), G = require('../js/graph.js'), S = require('../js/session.js');
const Schedule = require('../js/schedule.js'), Sim = require('../js/sim.js');
const Advisor = require('../js/advisor.js');
const route = nodes => ({nodes, stops:nodes.map(()=>true)});

test('route numbers reuse slots 1..4 and reject a fifth without mutation',()=>{
  const s=S.create(cfg);S.deleteRoute(s,2);
  assert.equal(S.addRoute(s,route(['F','H'])).num,2);
  assert.equal(S.addRoute(s,route(['F','E'])).num,4);
  const before=JSON.stringify(s.draft);
  assert.equal(S.addRoute(s,route(['A','C'])),null);
  assert.equal(JSON.stringify(s.draft),before);
  S.applyRecommendation(s,{plan:{buses:[{id:1,route:route(['D','G']),offset:0},{id:2,route:route(['F','H']),offset:0},{id:3,route:route(['C','E']),offset:0}]}});
  assert.ok(s.draft.routes.every(r=>r.num>=1&&r.num<=4));
  assert.deepEqual(S.toPlan(s).buses[0].route.nodes,['D','G']);
});

test('AI replaces four duplicate drafts without exceeding four slots',()=>{
  const s=S.create(cfg);s.draft.routes.forEach(r=>S.updateRoute(s,r.num,route(['A','B'])));S.addRoute(s,route(['A','B']));
  S.applyRecommendation(s,{plan:{buses:[['A','B'],['C','D'],['E','F']].map((nodes,i)=>({id:i+1,route:route(nodes),offset:0}))}});
  assert.equal(s.draft.routes.length,3);
  assert.deepEqual(S.toPlan(s).buses.map(b=>b.route.nodes),[['A','B'],['C','D'],['E','F']]);
});

test('rush creates real denied boardings and never exceeds capacity',()=>{
  const s=S.create(cfg);S.beginPlan(s);const result=S.startRun(s);
  assert.ok(result.log.some(e=>e.type==='full'&&e.data.left>0));
  for(let t=0;t<=cfg.bus.window;t++)assert.ok(Object.values(Sim.occupancyAt(result,t)).every(n=>n>=0&&n<=12));
});

test('free links use rounded fixed design pixels, not original road graph',()=>{
  const g=G.build(cfg,1), a=cfg.nodes.find(n=>n.id==='F'), b=cfg.nodes.find(n=>n.id==='H');
  assert.deepEqual(G.validateRoute(g,route(['F','H','E'])),[]);
  assert.equal(g.time('F','H'),Math.max(1,Math.round(Math.hypot(a.x-b.x,a.y-b.y)*cfg.map.pixelsPerUnit/cfg.map.pixelsPerSecond)));
  assert.equal(g.time('F','H'),g.time('H','F'));
  assert.equal(g.time('F','I'),null);
});
test('circular route closes with three distinct stops and preserves direction',()=>{
  const g=G.build(cfg,1), r=route(['F','C','E','F']);
  assert.deepEqual(G.validateRoute(g,r),[]);
  assert.ok(G.validateRoute(g,route(['F','C','F'])).length);
  assert.ok(G.validateRoute(g,route(['F','C','F','E'])).length);
  assert.notEqual(G.routeId(r),G.routeId(route(['F','E','C','F'])));
  assert.equal(G.routeId(r),G.routeId(route(['C','E','F','C'])));
  assert.equal(G.cycleMinutes(g,r),g.time('F','C')+g.time('C','E')+g.time('E','F')+3);
});
test('all buses start at their first stop at zero, with no station deadhead',()=>{
  const s=S.create(cfg); S.setOffset(s,1,12);
  assert.ok(S.toPlan(s).buses.every(b=>b.offset===0));
  const tl=Schedule.timeline(S.graph(s),cfg,1,route(['F','H']),12);
  assert.equal(tl.offset,0); assert.equal(tl.visits[0].t,0); assert.equal(tl.visits[0].node,'F');
  assert.ok(tl.segments.every(seg=>!seg.deadhead));
  assert.deepEqual(Schedule.positionAt(tl,cfg,0),{node:'F',parked:false});
});
test('loop riders cross route origin and occupancy decrements at destination',()=>{
  const g=G.build(cfg,1), r=route(['F','C','E','F']);
  const res=Sim.run({g,config:cfg,plan:{buses:[{id:1,route:r,offset:0}]},requests:[{id:1,key:'test',o:'E',d:'C',t:0,kind:'base'}]});
  assert.equal(res.passengers[0].status,'arrived');
  const board=res.log.find(e=>e.type==='board'), arrive=res.log.find(e=>e.type==='arrive');
  assert.ok(arrive.t>board.t);
  assert.equal(Sim.occupancyAt(res,board.t)[1],1);
  assert.equal(Sim.occupancyAt(res,arrive.t)[1],0);
  assert.equal(Sim.occupancyAt(res,0)[1],0);
});
test('applying AI preview preserves exact starting stop and direction',()=>{
  const s=S.create(cfg);S.beginPlan(s);
  s.draft.buses.forEach(b=>S.assign(s,b.id,null));
  s.draft.routes.forEach(r=>{r.nodes.reverse();r.stops.reverse();});
  const rec=Advisor.recommendSync(S.revealed(s),'time');S.applyRecommendation(s,rec);
  assert.deepEqual(S.toPlan(s),rec.plan);
  assert.equal(S.expected(s).arrived,rec.expected.arrived);
  assert.equal(S.expected(s).maxWait,rec.expected.maxWait);
});
