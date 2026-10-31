import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),D=require('../js/demand.js');
test('stop load counts origin+destination base requests and tiers them at 55/30',()=>{
 const s=S.create(cfg),load=D.stopLoad(s.config,1,s.seed),reqs=D.base(s.config,1,s.seed);
 assert.equal(Object.values(load).reduce((a,x)=>a+x.count,0),reqs.length*2);
 assert.deepEqual({A:load.A.tier,B:load.B.tier,C:load.C.tier,F:load.F.tier,D:load.D.tier},{A:'high',B:'high',C:'mid',F:'low',D:'low'});
 for(const x of Object.values(load))assert.equal(x.tier,x.count>=55?'high':x.count>=30?'mid':'low');
});
test('busy stops never exceed half the visible stops in any phase (default and random)',()=>{
 for(const opt of [{},{mode:'fixed',seed:42}]){const s=S.create(cfg,opt);
  for(let p=1;p<=s.config.phases.length;p++){const load=D.stopLoad(s.config,p,s.seed),ids=Object.keys(load);
   assert.ok(ids.filter(id=>load[id].tier==='high').length*2<=ids.length,'phase '+p);}}
});
test('new town grows each phase and matches the dense housing area by phase 5',()=>{
 const s=S.create(cfg),I=p=>D.stopLoad(s.config,p,s.seed).I.count,B=p=>D.stopLoad(s.config,p,s.seed).B.count;
 assert.ok(I(3)<I(4)&&I(4)<I(5),`I ${I(3)}→${I(4)}→${I(5)}`);
 assert.ok(I(5)>=B(5)*0.9,`phase 5 new town ${I(5)} vs dense ${B(5)}`);
 assert.equal(D.stopLoad(s.config,5,s.seed).I.tier,'high');
});
