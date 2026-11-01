import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),A=require('../js/advisor.js');
test('AI baseline exposes the same service verdict as departure, including long waits',()=>{
 const s=S.create(cfg);S.beginPlan(s);
 // 2026-11-01 강 건너기 ×1.5 뒤: 옛 F-D-A-G-B-C는 모두 귀가 미완료가 되어, 나래가 하루를 마치되 오래 기다리는 노선으로 바꿈
 S.updateRoute(s,1,{nodes:['C','B','G','A','D','F'],stops:[true,true,true,true,true,true]});
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
