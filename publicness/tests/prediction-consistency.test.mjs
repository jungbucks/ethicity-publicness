import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),A=require('../js/advisor.js');
test('AI baseline exposes the same service verdict as departure, including long waits',()=>{
 const s=S.create(cfg);S.beginPlan(s);
 S.updateRoute(s,1,{nodes:['F','D','A','G','B','C'],stops:[true,true,true,true,true,true]});
 S.assign(s,1,1);
 const rec=A.recommendSync(S.revealed(s),'time'),before=S.expected(s);
 assert.deepEqual(rec.baseline.residents,before.residents);
 assert.ok(Object.values(before.residents).some(r=>r?.dayStatus==='complete'&&!r.satisfied));
});
test('service wait boundary is inclusive and round trip completion alone is insufficient',()=>{
 const rd=cfg.residents.find(r=>r.id==='narae'),rec={dayStatus:'complete'};
 for(const wait of [26,27,28]){
  const legs=['outbound','return'].map(leg=>({residentId:rd.id,leg,status:'arrived',waitTotal:leg==='outbound'?wait:0,o:'F',d:'D'}));
  const verdict=S.residentVerdict(cfg,rd,rec,legs);
  assert.equal(verdict.ok,wait<=27);
  if(wait>27)assert.equal(verdict.reasons[0].code,'longWait');
 }
});
