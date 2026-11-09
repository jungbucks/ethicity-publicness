// 운행 중 노선 고치기(하루 한 번, 2026-11-09) — 엔진 규칙(docs/plans/2026-11-09-midday-route-change.md)
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),Sim=require('../js/sim.js'),D=require('../js/demand.js'),M=require('../js/midday.js'),Schedule=require('../js/schedule.js'),Graph=require('../js/graph.js');
const R=nodes=>({nodes,stops:nodes.map(()=>true)});
function setup(){const s=S.create(cfg);s.phase=3;s.owned=4;s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:id<=2?1:id===3?2:null,offset:0}));S.beginPlan(s);
 S.updateRoute(s,1,R(['A','B','C']));S.updateRoute(s,2,R(['F','D']));return s;}
function input(s){return {g:S.graph(s),config:s.config,phase:s.phase,plan:S.toPlan(s),requests:D.base(s.config,s.phase,s.seed)};}
const busIds=(s,num)=>s.draft.buses.filter(b=>b.routeNum===num).map(b=>b.id);

test('규칙 1: 고칠 수 있는 때 = 11:00~15:00(엔진 40~66), 고친 시각은 멈춘 위치를 올림',()=>{
 const w=M.span(cfg);assert.deepEqual(w,{open:40,close:66});
 assert.equal(D.clock(cfg,40),'11:00');assert.equal(D.clock(cfg,66),'14:54');assert.ok(D.clock(cfg,67)>'15:00');
 assert.equal(M.atFor(cfg,39.5),null);assert.equal(M.atFor(cfg,40),40);assert.equal(M.atFor(cfg,52.2),53);assert.equal(M.atFor(cfg,66),66);assert.equal(M.atFor(cfg,66.1),null);
});
test('규칙 2: 정류장 더하기(사이·양 끝·순환)와 빼기(2곳+·순환 3곳+)',()=>{
 const r=R(['A','B','C']);
 assert.deepEqual(M.positions(r),[-1,0,1,2]);
 assert.deepEqual(M.addStop(r,'E',-1).nodes,['E','A','B','C']);assert.deepEqual(M.addStop(r,'E',0).nodes,['A','E','B','C']);
 assert.deepEqual(M.addStop(r,'E',2).nodes,['A','B','C','E']);assert.equal(M.addStop(r,'B',0),null,'이미 있는 정류장');
 const loop=R(['A','B','C','A']);assert.deepEqual(M.positions(loop),[0,1,2]);assert.deepEqual(M.addStop(loop,'E',2).nodes,['A','B','C','E','A']);
 assert.deepEqual(M.removeStop(r,'B').nodes,['A','C']);assert.deepEqual(M.removeStop(r,'A').nodes,['B','C']);
 assert.equal(M.removeStop(R(['A','B']),'A'),null,'두 곳 노선은 못 뺌');assert.equal(M.removeStop(loop,'B'),null,'세 곳 순환은 못 뺌');
 const loop4=R(['A','B','C','D','A']);assert.deepEqual(M.removeStop(loop4,'A').nodes,['B','C','D','B']);assert.deepEqual(M.removeStop(loop4,'C').nodes,['A','B','D','A']);
 const pass={nodes:['A','B','C'],stops:[true,false,true]};assert.deepEqual(M.removeStop(pass,'C').stops,[true,true],'새 끝은 정차');
});
test('규칙 3·5: 고치기 전 기록은 같고, 버스는 가던 정류장까지 그대로 간 뒤 새 목록을 따른다(더한 정류장에 섬)',()=>{
 const s=setup(),inp=input(s),base=Sim.run(inp),at=50,route=M.addStop(s.draft.routes[0],'E',0);
 const ch=Sim.run({...inp,routeChanges:[{at,busIds:busIds(s,1),route}]});
 assert.deepEqual(ch.log.filter(e=>e.t<at),base.log.filter(e=>e.t<at),'고친 시각 전 기록 같음');
 busIds(s,1).forEach(id=>{
  const b=base.timelines.find(t=>t.busId===id),c=ch.timelines.find(t=>t.busId===id);
  const nb=b.visits.find(v=>v.t>=at),nc=c.visits.find(v=>v.t>=at);
  assert.deepEqual([nc.t,nc.node],[nb.t,nb.node],'가던 정류장까지는 그대로(순간 이동 없음)');
  assert.ok(c.visits.some(v=>v.t>at&&v.node==='E'&&v.kind==='stop'),'새 정류장 E에 섬');
  assert.ok(!b.visits.some(v=>v.node==='E'));
  // 구간이 이어짐(앞 구간의 도착 = 다음 구간의 출발 정류장)
  for(let i=1;i<c.segments.length;i++)assert.equal(c.segments[i].from,c.segments[i-1].to,'끊김 없는 경로 '+i);
 });
 assert.equal(Sim.hash(ch),Sim.hash(Sim.run({...inp,routeChanges:[{at,busIds:busIds(s,1),route}]})),'같은 입력 같은 결과');
});
test('규칙 4: 빠진 정류장에는 고친 뒤로 서지 않는다(가던 곳이면 지나감, 끝이면 돌아 나옴)',()=>{
 for(const gone of ['B','C']){
  const s=setup(),inp=input(s),route=M.removeStop(s.draft.routes[0],gone);
  for(let at=40;at<=66;at+=3){
   const ch=Sim.run({...inp,routeChanges:[{at,busIds:busIds(s,1),route}]});
   busIds(s,1).forEach(id=>{const c=ch.timelines.find(t=>t.busId===id);
    assert.ok(!c.visits.some(v=>v.t>=at&&v.node===gone&&v.kind==='stop'),gone+' at '+at+' 빠진 정류장 정차 없음');
    for(let i=1;i<c.segments.length;i++)assert.equal(c.segments[i].from,c.segments[i-1].to);
    assert.ok(!ch.log.some(e=>e.t>=at&&e.bus===id&&e.node===gone&&(e.type==='board'||e.type==='arrive'||e.type==='alight')),'빠진 정류장에서 승하차 없음');
   });
  }
 }
});
test('규칙 6: 빠진 정류장에서 내리려던 사람은 다음 정류장에서 내려 다른 길을 찾는다',()=>{
 const c=structuredClone(cfg),s=S.create(c),g=S.graph(s);
 const plan={buses:[{id:1,route:R(['A','B','C']),offset:0},{id:2,route:R(['B','C']),offset:0}]};
 const req=[{id:1,key:'x',o:'A',d:'C',t:0,kind:'base'}],inp={g,config:s.config,phase:1,plan,requests:req};
 const base=Sim.run(inp),p0=base.passengers[0];assert.equal(p0.status,'arrived');
 assert.equal(base.log.find(e=>e.pid===1&&e.type==='board').bus,1,'처음엔 빨강 노선 직행');
 const board=base.log.find(e=>e.pid===1&&e.type==='board').t,at=board+1; // 탄 뒤 B에 닿기 전
 const tl=base.timelines.find(t=>t.busId===1),nextB=tl.visits.find(v=>v.t>=at);assert.equal(nextB.node,'B');
 const ch=Sim.run({...inp,routeChanges:[{at,busIds:[1],route:R(['A','B'])}]}),p=ch.passengers[0];
 const off=ch.log.find(e=>e.pid===1&&e.type==='alight');assert.ok(off,'내림');assert.equal(off.node,'B');assert.equal(off.t,nextB.t);
 assert.equal(p.status,'arrived','B–C 노선으로 갈아타 도착');assert.ok(ch.log.some(e=>e.pid===1&&e.type==='board'&&e.bus===2));
 // 다른 길이 없으면 목적지까지 못 간 이동
 const alone=Sim.run({g,config:s.config,phase:1,plan:{buses:[plan.buses[0]]},requests:req,routeChanges:[{at,busIds:[1],route:R(['A','B'])}]});
 assert.notEqual(alone.passengers[0].status,'arrived');assert.equal(alone.log.find(e=>e.pid===1&&e.type==='alight').node,'B');
});
test('규칙 3: 아직 출발 전인 버스는 새 노선 처음부터 같은 출발 시각에',()=>{
 const s=setup(),inp=input(s),plan=Schedule.spacePlan(inp.g,s.config,inp.plan),late=plan.buses.filter(b=>b.route).sort((a,b)=>b.offset-a.offset)[0];
 const at=Math.max(1,late.offset-1),route=M.addStop(s.draft.routes[0],'E',-1);
 const ch=Sim.run({...inp,plan:{buses:inp.plan.buses.map(b=>b.id===late.id?{...b}:b)},routeChanges:[{at,busIds:[late.id],route}]});
 const c=ch.timelines.find(t=>t.busId===late.id);if(late.offset<=at)return; // 간격 0이면 해당 없음
 assert.equal(c.visits[0].node,'E');assert.equal(c.visits[0].t,late.offset);
});
test('규칙 8: 돈 식은 그대로 — 연료비 = 실제 달린 km, 지원·운영·보유는 같음',()=>{
 const s=setup(),inp=input(s),base=Sim.run(inp),route=M.addStop(s.draft.routes[0],'E',2);
 const ch=Sim.run({...inp,routeChanges:[{at:45,busIds:busIds(s,1),route}]});
 const km=ch.timelines.reduce((a,t)=>a+t.km,0);assert.equal(ch.costs.fuel,Math.round(s.config.finance.fuelPerKm*km));
 assert.notEqual(ch.costs.km,base.costs.km,'경로가 바뀌어 km가 달라짐');
 ['subsidyBase','holding','op','lease'].forEach(k=>assert.equal(ch.costs[k],base.costs[k],k));
 const total=ch.costs.subsidy+ch.costs.fare-ch.costs.holding-ch.costs.lease-ch.costs.op-ch.costs.fuel;assert.equal(ch.costs.total,total);
});
test('세션: 3단계부터·창 안·하루 한 번, 기록은 s.midChanges, 저장→이어하기·결과 다시 계산이 같다',()=>{
 const s=setup();S.startRun(s);
 assert.equal(S.midStatus(s,30).why,'early');assert.equal(S.midStatus(s,70).why,'late');assert.equal(S.midStatus(s,45).ok,true);
 const s2=S.create(cfg);S.beginPlan(s2);S.updateRoute(s2,1,R(['A','B']));S.startRun(s2);assert.equal(S.midStatus(s2,45).why,'phase');
 assert.equal(S.midApply(s,{at:45,kind:'add',routeNum:1,node:'B',pos:0}),false,'이미 있는 정류장');
 assert.equal(S.midApply(s,{at:30,kind:'add',routeNum:1,node:'E',pos:0}),false,'창 밖');
 assert.equal(S.midApply(s,{at:45,kind:'add',routeNum:4,node:'E',pos:0}),false,'없는 노선');
 const plan=JSON.stringify(s.current.plan),draft=JSON.stringify(s.draft);
 assert.ok(S.midApply(s,{at:45,kind:'add',routeNum:1,node:'E',pos:0}));
 assert.equal(S.midStatus(s,50).why,'used');assert.equal(S.midApply(s,{at:50,kind:'remove',routeNum:2,node:'D'}),false,'두 번째는 안 됨');
 assert.equal(JSON.stringify(s.current.plan),plan,'출발 계획 그대로');assert.equal(JSON.stringify(s.draft),draft,'계획 초안도 그대로(그날만)');
 const m=s.midChanges[0];assert.deepEqual([m.phase,m.at,m.kind,m.routeNum,m.node],[3,45,'add',1,'E']);assert.deepEqual(m.route.nodes,['A','E','B','C']);assert.deepEqual(m.busIds,[1,2]);
 assert.ok(s.current.baseline,'고치지 않았을 때 비교 숫자');
 const hash=Sim.hash(s.current.result);s.runCursor=45;
 const mid=S.restore(S.serialize(s),cfg);assert.equal(Sim.hash(mid.current.result),hash,'운행 중 이어하기');
 S.finishRun(s);const done=S.restore(S.serialize(s),cfg);assert.equal(Sim.hash(done.current.result),hash,'결과 화면 다시 계산');
 const old=S.serialize(s);delete old.history[0].scores;const re=S.restore(old,cfg);assert.equal(re.history[0].scores.recomputed,true,'점수 다시 계산이 기록과 같음');
 assert.deepEqual(re.history[0].scores.mobility,s.history[0].scores.mobility);
 S.startRun(Object.assign(s,{stage:'plan'}));assert.equal(s.midChanges.filter(c=>c.phase===3).length,0,'다시 출발하면 그 단계 기록은 지움');
});
test('세션: 버스 한 대 옮기기도 아무 때나(창 안), 전용 버스·같은 노선 규칙 그대로',()=>{
 const s=setup();S.startRun(s);
 assert.equal(S.midApply(s,{at:50,kind:'move',busId:1,routeNum:1}),false,'같은 노선');
 assert.ok(S.midApply(s,{at:50,kind:'move',busId:4,routeNum:2}));
 const res=s.current.result,re=res.log.find(e=>e.type==='reassign'&&e.bus===4);assert.ok(re&&re.t>=50);
 const c=S.create(cfg,{mode:'fixed',seed:42});c.phase=8;c.owned=9;c.draft.routes=[];c.draft.buses=Array.from({length:9},(_,i)=>({id:i+1,routeNum:null,offset:0}));
 S.addRoute(c,R(['F','D']),1);S.addRoute(c,R(['A','B','C']),5);S.addRoute(c,R(['A','N']),6);S.beginPlan(c);S.assign(c,7,5);S.assign(c,9,6);S.assign(c,1,1);S.startRun(c);
 assert.equal(S.midApply(c,{at:50,kind:'move',busId:9,routeNum:1}),false);assert.equal(S.midApply(c,{at:50,kind:'move',busId:1,routeNum:6}),false);
 assert.equal(S.midApply(c,{at:50,kind:'add',routeNum:5,node:'D',pos:2}),false,'직행은 세 곳까지');
 assert.equal(S.midApply(c,{at:50,kind:'add',routeNum:6,node:'B',pos:-1}),false,'광역은 마을 한 곳과 대도시만');
 assert.equal(S.midApply(c,{at:50,kind:'add',routeNum:1,node:'N',pos:1}),false,'대도시는 광역만');
 assert.equal((c.midChanges||[]).length,0);
});
test('예전 저장본: emergencyLog(10:06·15:03)는 예전 길로 그대로 다시 계산',()=>{
 const s=setup();S.startRun(s);const route=s.draft.routes[1];
 const expect=Sim.run({...input(s),plan:s.current.plan,requests:D.sortReqs(D.base(s.config,3,s.seed).concat(D.extra(s.config,3,s.current.event))),event:s.current.event,adjustments:[{at:34,busId:4,route}]});
 const saved=S.serialize(s);saved.emergencyLog=[{phase:3,at:34,busId:4,routeNum:2,route},{phase:3,at:67,busId:null,routeNum:null,route:null}];saved.runCursor=40;
 const r=S.restore(saved,cfg);assert.equal(Sim.hash(r.current.result),Sim.hash(expect));
 assert.equal(S.midStatus(r,45).why,'used','예전 기록에 버스 이동이 있으면 오늘은 쓴 것');
});
