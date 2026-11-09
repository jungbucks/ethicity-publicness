// 2026-11-09 테스터 6번(AI 없이 끝낸 학생도 배우게): 결과 화면 단계별 문장 틀(선택, 점수 없음) — 저장·조사·보고서 문장·계획 기록
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),N=require('../js/stage-notes.js'),S=require('../js/session.js');
test('set/get: 단계마다 선택 필드, 빈 값은 지워서 저장본이 깨끗하다', () => {
  const s={};
  assert.deepEqual(N.get(s,2),{kept:'',lost:'',aiWhat:'',aiView:'',aiWhy:''},'아무것도 안 쓰면 빈 칸');
  N.set(s,2,'kept','외곽 마을 사람들');N.set(s,2,'aiView','diff');
  assert.deepEqual(s.stageNotes,{2:{kept:'외곽 마을 사람들',aiView:'diff'}});
  assert.equal(N.get(s,2).kept,'외곽 마을 사람들');assert.equal(N.get(s,1).kept,'');
  N.set(s,2,'kept','');N.set(s,2,'aiView',null);
  assert.equal(s.stageNotes,undefined,'모두 지우면 필드도 없앰');
  assert.throws(()=>N.set(s,1,'score','x'),/field/);
  N.set(s,1,'aiView','maybe');assert.equal(s.stageNotes,undefined,'같은/다른 생각 말고는 저장 안 함');
});
test('옛 저장본(stageNotes 없음)도 그대로 열리고 restore 뒤에도 남는다', () => {
  const cfg=require('../js/config.js');
  const old={stage:'plan',phase:1,history:[],config:cfg,mode:'default',seed:42,draft:{routes:[],buses:[]},trust:{},goalHistory:[]};
  const s=S.restore(old,cfg);assert.equal(s.stageNotes,undefined);assert.equal(N.get(s,1).kept,'');
  N.set(s,1,'aiWhy','버스가 너무 비어서');
  const back=S.restore(JSON.parse(JSON.stringify(S.serialize(s))),cfg);
  assert.equal(N.get(back,1).aiWhy,'버스가 너무 비어서');
});
test('particle: 입력 낱말 받침에 맞는 조사, 비었거나 한글이 아니면 (을)를 꼴', () => {
  assert.equal(N.particle('순자 할머니','을를'),'를');assert.equal(N.particle('외곽 마을','을를'),'을');
  assert.equal(N.particle('수익','이가'),'이');assert.equal(N.particle('버스','이가'),'가');
  assert.equal(N.particle('','을를'),'을(를)');assert.equal(N.particle('AI','이가'),'이(가)');assert.equal(N.particle('  병원  ','을를'),'을');
});
test('sentences: 보고서 문장 — 쓴 것만, 빈칸은 (쓰지 않음)', () => {
  assert.deepEqual(N.sentences({}),{mine:'(쓰지 않음)',ai:'(쓰지 않음)'});
  assert.deepEqual(N.sentences({kept:'외곽 마을',lost:'수지'}),{mine:'이번에 나는 외곽 마을을 먼저 챙겼다. 그 대신 수지가 손해를 봤다.',ai:'(쓰지 않음)'});
  assert.equal(N.sentences({kept:'순자 할머니'}).mine,'이번에 나는 순자 할머니를 먼저 챙겼다. 그 대신 (쓰지 않음) 손해를 봤다.');
  assert.equal(N.sentences({aiWhat:'노선',aiView:'same',aiWhy:'더 빨라져서'}).ai,'AI는 노선을 바꾸자고 했다. 나는 같은 생각이다. 왜냐하면 더 빨라져서.');
  assert.equal(N.sentences({aiView:'diff'}).ai,'AI는 (쓰지 않음) 바꾸자고 했다. 나는 다른 생각이다. 왜냐하면 (쓰지 않음).');
  assert.equal(N.sentences({aiWhy:'사람이 남아서.'}).ai,'AI는 (쓰지 않음) 바꾸자고 했다. 나는 (고르지 않음). 왜냐하면 사람이 남아서.','끝 마침표 겹치지 않음');
});
test('logPlan/planOf: 결과 화면의 출발 계획을 색 번호로 남기고, 없으면 기록(history.plan)에서 되살린다', () => {
  const draft={routes:[{num:1,nodes:['F','C','B'],stops:[true,true,true]},{num:2,nodes:['A','G'],stops:[true,true]},{num:3,nodes:[],stops:[]}],buses:[{id:1,routeNum:1},{id:2,routeNum:1},{id:3,routeNum:2},{id:4,routeNum:null}]};
  const s={draft};N.logPlan(s,1,draft);
  assert.deepEqual(s.planLog,{1:{routes:[{num:1,nodes:['F','C','B'],buses:2},{num:2,nodes:['A','G'],buses:1}],resting:1}});
  const h={phase:1};assert.deepEqual(N.planOf(s,h),s.planLog[1]);
  // 예전 게임(planLog 없음): history.plan의 버스 노선을 묶고, 지금 초안에 같은 정류장 노선이 있으면 그 색 번호
  const old={draft:{routes:[{num:2,nodes:['A','G'],stops:[true,true]}],buses:[]}};
  const hp={phase:1,plan:{buses:[{id:1,route:{nodes:['F','C','B'],stops:[true,true,true]}},{id:2,route:{nodes:['F','C','B'],stops:[true,true,true]}},{id:3,route:{nodes:['A','G'],stops:[true,true]}},{id:4,route:null}]}};
  assert.deepEqual(N.planOf(old,hp),{routes:[{num:null,nodes:['F','C','B'],buses:2},{num:2,nodes:['A','G'],buses:1}],resting:1});
});
