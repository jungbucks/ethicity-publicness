import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),D=require('../js/demand.js'),Sim=require('../js/sim.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
test('day clock and duration agree at 05:00, noon and 23:00',()=>{assert.equal(D.clock(cfg,0),'05:00');assert.equal(D.clock(cfg,120),'23:00');assert.equal(D.duration(cfg,10),'1시간 30분');assert.equal(D.duration(cfg,5),'45분');assert.equal(D.duration(cfg,20),'3시간');});
test('default and 100 seeded layouts preserve diagonal towns and hospital proximity',()=>{
 for(const opts of [{},...Array.from({length:100},(_,seed)=>({mode:'fixed',seed}))]){
  const ns=S.create(cfg,opts).config.nodes,n=id=>ns.find(x=>x.id===id),dist=(a,b)=>Math.hypot(n(a).x-n(b).x,n(a).y-n(b).y);
  assert.ok(n('F').x*n('I').x<0&&n('F').y*n('I').y<0);assert.ok(dist('I','D')<dist('I','E'));assert.ok(dist('F','D')>dist('I','D')*2);
 }
});
test('only four residents have linked routines, Sol goes to station, demand remains seeded',()=>{
 const qs=D.base(cfg,3,42);assert.deepEqual(qs,D.base(cfg,3,42));
 const named=qs.filter(q=>q.residentId);assert.equal(named.length,4);assert.equal(named.find(q=>q.residentId==='sol').d,'A');assert.ok(named.every(q=>q.leg==='outbound'));
 assert.ok(qs.some(q=>q.t>90));assert.ok(qs.some(q=>q.t<30));
 assert.ok(qs.filter(q=>q.o==='G'&&q.d==='A').every(q=>q.t>=74));
});
test('late arrival postpones the return and arrival after closing creates no phantom return',()=>{
 const s=S.create(cfg),original=D.base(cfg,1,42).find(q=>q.residentId==='narae'),plan={buses:[{id:1,route:route(['F','D']),offset:0}]};
 // 2026-10-27 기본 지도를 세로로 펼친 뒤엔 늦게 출발하면 아예 도착하지 못한다 → ‘도착했지만 귀가 준비가 운행 종료 뒤’는 오래 머무는 경우로 만든다(84분 출발·99 도착·30 머묾 → 129)
 for(const t of [60,84]){
  const q={...original,t,returnTrip:t===84?{...original.returnTrip,stay:30}:original.returnTrip},res=Sim.run({g:S.graph(s),config:cfg,phase:1,plan,requests:[q]}),out=res.passengers[0],back=res.passengers.find(p=>p.leg==='return');
  assert.equal(out.status,'arrived');
  if(t===60){assert.ok(back);assert.equal(back.t,out.arriveT+q.returnTrip.stay);assert.ok(back.t>q.returnTrip.earliest);}
  else{assert.ok(out.returnReadyT>=120);assert.equal(back,undefined);}
 }
});
test('return is spawned only after real arrival and stay; direct village route allows round trip',()=>{
 const s=S.create(cfg),q=D.base(s.config,1,s.seed).find(q=>q.residentId==='narae');assert.ok(q);
 const run=plan=>Sim.run({g:S.graph(s),config:s.config,phase:1,plan,requests:[q]});
 const empty=run({buses:[]});assert.equal(empty.passengers.length,1);
 const res=run({buses:[{id:1,route:route(['F','D']),offset:0}]}),out=res.passengers[0],back=res.passengers.find(p=>p.leg==='return');
 assert.equal(out.status,'arrived');assert.ok(back);assert.ok(back.t>=out.arriveT+q.returnTrip.stay);assert.equal(back.o,'D');assert.equal(back.d,'F');assert.equal(back.status,'arrived');
 assert.equal(new Set(res.passengers.map(p=>p.id)).size,res.passengers.length);
});
test('time AI cannot benefit from suppressing a resident outbound to avoid return demand',()=>{
 const A=require('../js/advisor.js'),M=require('../js/metrics.js'),s=S.create(cfg),q=D.base(cfg,1,42).find(q=>q.residentId==='jun');
 const scores=[{buses:[]},{buses:[{id:1,route:route(['A','B','C','D','E','G']),offset:0}]}].map(plan=>{const res=Sim.run({g:S.graph(s),config:cfg,phase:1,plan,requests:[q]});return A.score('time',M.summarize(res,S.graph(s),plan,cfg),res,[])[0];});
 assert.ok(scores[1]>scores[0]);
});
