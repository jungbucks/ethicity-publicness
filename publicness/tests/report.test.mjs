// 2026-11-09 테스터 6번: 엔딩 ‘내 운영 보고서’(인쇄·PDF) 내용 — 이미 계산된 숫자와 학생이 쓴 것만. AI 제안 내용은 넣지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),R=require('../js/report.js');
const f={won:n=>(n<0?'−':'')+Math.abs(Math.round(n)).toLocaleString('ko-KR')+'원',duration:v=>Math.floor(v/60)+'시간'+(v%60?' '+v%60+'분':''),rate:r=>Math.round(r*100)+'%',
 name:id=>({A:'기차역',G:'산업·일자리',F:'외곽 마을',C:'대학교',B:'구도심 시장'})[id]||id,route:n=>({1:'빨강 노선',2:'초록 노선'})[n],choices:{many:'더 많은 사람을 빠르게',longest:'오래 기다린 사람부터'},
 date:new Date(2026,10,9)};
const hist=(phase,o)=>Object.assign({phase,metrics:{N:20,arrived:15,arrivalRate:.75,maxWait:135,costs:{total:-4200}},residents:{sol:{satisfied:true},nare:{satisfied:false},jun:null},plan:{buses:[]}},o);
const sess=()=>({mode:'default',seed:42,config:{phases:['첫 운행','시장 날'],SCENARIO_VERSION:'pb-x'},end:{cause:'complete'},
 history:[hist(1),hist(2,{metrics:{N:30,arrived:30,arrivalRate:1,maxWait:60,costs:{total:9000}}})],
 planLog:{1:{routes:[{num:1,nodes:['F','C','B'],buses:2},{num:2,nodes:['A','G','A'],buses:1}],resting:1},2:{routes:[{num:1,nodes:['F','C'],buses:3}],resting:0}},
 choices:{1:'longest'},stageNotes:{1:{kept:'외곽 마을',lost:'수지',aiView:'diff',aiWhy:'사람이 남아서'}},finalReflection:'  순자 할머니를 더 살피게 됐다.  ',
 aiCards:{1:{rows:[{change:'비밀 AI 문장'}]}},lastRec:{plan:'비밀'}});
test('build: 머리(모드·날짜·끝)와 단계별 계획·숫자·목표·문장, 마지막 소감', () => {
  const r=R.build(sess(),f);
  assert.equal(r.title,'내 운영 보고서');
  assert.deepEqual(r.meta,{mode:'기본 세팅',date:'2026년 11월 9일',end:'한 학기 운행을 마쳤어요 · 누적 잔액 +4,800원',stages:'2단계 중 2단계 운행'});
  assert.equal(r.stages.length,2);
  const s1=r.stages[0];
  assert.equal(s1.title,'1단계 · 첫 운행');
  assert.deepEqual(s1.plan,['빨강 노선: 외곽 마을 → 대학교 → 구도심 시장 · 버스 2대','초록 노선: 기차역 → 산업·일자리 (순환) · 버스 1대','대기 버스 1대']);
  assert.deepEqual(s1.numbers,[['도착률','75% (20건 중 15건)'],['목적지까지 못 간 이동','5건'],['최장 대기','2시간 15분'],['단계 수지','−4,200원'],['주요 인물 기준 충족','2명 중 1명']]);
  assert.equal(s1.goal,'오래 기다린 사람부터');
  assert.equal(s1.mine,'이번에 나는 외곽 마을을 먼저 챙겼다. 그 대신 수지가 손해를 봤다.');
  assert.equal(s1.ai,'AI는 (쓰지 않음) 바꾸자고 했다. 나는 다른 생각이다. 왜냐하면 사람이 남아서.');
  const s2=r.stages[1];
  assert.equal(s2.goal,'(고르지 않음)');assert.equal(s2.mine,'(쓰지 않음)');assert.equal(s2.ai,'(쓰지 않음)');assert.equal(s2.numbers[3][1],'+9,000원');
  assert.equal(r.final.text,'순자 할머니를 더 살피게 됐다.');
  assert.doesNotMatch(JSON.stringify(r),/비밀/,'AI 제안 내용은 보고서에 없음');
});
test('build: 랜덤·파산·계약 종료·planLog 없는 예전 게임·빈 소감', () => {
  const s=sess();s.mode='random';s.seed=777;s.end={cause:'bankrupt'};delete s.planLog;delete s.finalReflection;
  s.history[0].plan={buses:[{id:1,route:{nodes:['F','C'],stops:[true,true]}},{id:2,route:null}]};s.draft={routes:[]};
  const r=R.build(s,f);
  assert.equal(r.meta.mode,'랜덤 세팅 · 번호 777');assert.match(r.meta.end,/^파산 — 학기 말 잔액이 0원 미만이에요/);
  assert.deepEqual(r.stages[0].plan,['노선 1: 외곽 마을 → 대학교 · 버스 1대','대기 버스 1대']);
  assert.deepEqual(r.stages[1].plan,['노선 없음']);
  assert.equal(r.final.text,'(쓰지 않음)');
  s.end={cause:'contract',phase:2};s.mode='fixed';assert.equal(R.build(s,f).meta.end.split(' · ')[0],'운영 계약 종료(2단계)');assert.equal(R.build(s,f).meta.mode,'지정 세팅 · 번호 777');
});
test('fileName: 인쇄할 때만 쓰는 PDF 이름(이름은 저장 안 함)', () => {
  assert.equal(R.fileName(' 김 하늘/1 ',new Date(2026,10,9)),'공공성_보고서_김_하늘_1_20261109');
  assert.equal(R.fileName('',new Date(2026,0,2)),'공공성_보고서_20260102');
});
