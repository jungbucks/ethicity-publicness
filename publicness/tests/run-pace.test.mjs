// 운행 속도 재설계(2-4): 배속 저장 호환(옛 4 → 2), ‘다음 결정까지’ 멈춤 조건, 긴급 조정 30분 전 1× 감속
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),P=require('../js/run-pace.js'),St=require('../js/storage.js');
const S=require('../js/session.js'),Sim=require('../js/sim.js'),D=require('../js/demand.js');

function fakeStore(init){const m=new Map(Object.entries(init||{}));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),map:m};}

test('speed choices are 1× and 2× only; a saved 4 migrates to 2 and is written back',()=>{
  assert.deepEqual(St.SPEEDS,[1,2]);
  const old=fakeStore({'ethicity.publicness.speed':'4'});
  assert.equal(St.readSpeed(old),2);
  assert.equal(old.map.get('ethicity.publicness.speed'),'2','기존 저장값 4는 2로 바꿔 둔다');
  assert.equal(St.readSpeed(fakeStore({'ethicity.publicness.speed':'2'})),2);
  assert.equal(St.readSpeed(fakeStore({'ethicity.publicness.speed':'1'})),1);
  assert.equal(St.readSpeed(fakeStore()),1,'없으면 1');
  assert.equal(St.readSpeed(fakeStore({'ethicity.publicness.speed':'next'})),1,'모르는 값은 1');
  const s=fakeStore();St.writeSpeed(4,s);assert.equal(s.map.has('ethicity.publicness.speed'),false,'4는 더 이상 저장하지 않음');
  St.writeSpeed(2,s);assert.equal(s.map.get('ethicity.publicness.speed'),'2');
});

test('30 game minutes before an emergency is about 3.3 engine units and playback slows to 1× there',()=>{
  const slow=P.slowSpan(cfg);
  assert.ok(Math.abs(slow-30*120/1080)<1e-9);
  assert.equal(P.inSlowZone(34-slow-0.01,34,slow),false);
  assert.equal(P.inSlowZone(34-slow,34,slow),true);
  assert.equal(P.inSlowZone(33.9,34,slow),true);
  assert.equal(P.inSlowZone(34,34,slow),false);
  assert.equal(P.inSlowZone(20,null,slow),false,'긴급 조정이 없는 단계는 감속 없음');
  // 8배속으로 달리다 감속 구간에 들어가면 1×: 큰 틱 하나로도 감속 구간을 건너뛰지 않는다
  const ms=167,start=30-1e-9;
  const after=P.advance(start,250,P.NEXT,ms,34,slow);
  const fastPart=(34-slow-start)*ms/P.NEXT;
  assert.ok(Math.abs(after-(34-slow+(250-fastPart)/ms))<1e-6,'경계 뒤 남은 시간은 1×로 '+after);
  assert.ok(after<34);
  // 감속 구간 안에서는 2×를 골라도 1×
  assert.ok(Math.abs(P.advance(33,100,2,ms,34,slow)-(33+100/ms))<1e-9);
  // 조정 시점을 넘지 않는다
  assert.equal(P.advance(33.9,5000,2,ms,34,slow),34);
  // 조정 시점이 없으면 그대로 배속
  assert.ok(Math.abs(P.advance(10,167,2,ms,null,slow)-12)<1e-9);
});

test('‘다음 결정까지’ stops at the next emergency or the next notable event, whichever comes first',()=>{
  const notes=[{t:12,kind:'wait',node:'B',n:10},{t:20,kind:'full',node:'A',n:3},{t:20,kind:'wait',node:'C',n:11},{t:50,kind:'full',node:'C',n:1}];
  assert.deepEqual(P.nextStop(0,{mode:'next',notables:notes,checkpoint:34}),{t:12,kind:'notable',items:[notes[0]]});
  const at20=P.nextStop(12,{mode:'next',notables:notes,checkpoint:34});
  assert.equal(at20.t,20);assert.equal(at20.items.length,2,'같은 시각 사건은 한 번에 보여 줌');
  assert.deepEqual(P.nextStop(20,{mode:'next',notables:notes,checkpoint:34}),{t:34,kind:'emergency',items:[]});
  assert.equal(P.nextStop(34,{mode:'next',notables:notes,checkpoint:67}).t,50);
  assert.equal(P.nextStop(50,{mode:'next',notables:notes,checkpoint:null}),null,'남은 게 없으면 끝까지');
  // 1×·2×에서는 주목할 사건으로 멈추지 않고 긴급 조정 시점에서만 멈춘다
  assert.deepEqual(P.nextStop(0,{mode:'normal',notables:notes,checkpoint:34}),{t:34,kind:'emergency',items:[]});
  assert.equal(P.nextStop(0,{mode:'normal',notables:notes,checkpoint:null}),null);
  assert.deepEqual(P.pendingCheckpoints([34,67],[34]),[67]);
});

test('notable events come from the real run: first full per stop and first time a stop reaches 10 waiting',()=>{
  const s=S.create(cfg),g=S.graph(s);
  const route=nodes=>({nodes,stops:nodes.map(()=>true)});
  const res=Sim.run({g,config:s.config,phase:1,plan:{buses:[{id:1,route:route(['F','C','B','A']),offset:0},{id:2,route:route(['D','A','G']),offset:0}]},requests:D.base(s.config,1,s.seed)});
  const wait=P.waitingTable(res,s.config),notes=P.notables(res,wait,s.config);
  assert.ok(notes.length>0,'기본 1단계 대표 계획에는 주목할 사건이 있다');
  const fullNodes=notes.filter(n=>n.kind==='full').map(n=>n.node),waitNodes=notes.filter(n=>n.kind==='wait').map(n=>n.node);
  assert.equal(new Set(fullNodes).size,fullNodes.length,'정류장마다 만차는 한 번');
  assert.equal(new Set(waitNodes).size,waitNodes.length,'정류장마다 대기 10명은 한 번');
  notes.filter(n=>n.kind==='wait').forEach(n=>{assert.ok(wait[n.node][n.t]>=10);assert.ok(n.t===0||wait[n.node][n.t-1]<10);});
  notes.filter(n=>n.kind==='full').forEach(n=>assert.equal(n.t,res.log.find(e=>e.type==='full'&&e.node===n.node).t));
  for(let i=1;i<notes.length;i++)assert.ok(notes[i-1].t<=notes[i].t);
});

test('emergency checkpoints are shared with the session',()=>{
  assert.deepEqual(S.EMERGENCY_AT,[34,67]);
});
