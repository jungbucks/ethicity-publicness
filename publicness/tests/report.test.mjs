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
  assert.deepEqual(s1.numbers,[['실제로 생긴 이동 요청의 도착률','75% (20건 중 15건)'],['그중 목적지까지 못 간 이동','5건'],['버스를 탄 사람의 최장 대기','2시간 15분'],['단계 수지','−4,200원'],['주요 인물 기준 충족','2명 중 1명']]);
  assert.equal(s1.eval,null,'점수 기록이 없는 예전 단계는 평가 줄 없음');assert.equal(r.scope,null);
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
  assert.equal(R.fileName(' 김 하늘/1 ',new Date(2026,10,9)),'공정성포용성_보고서_김_하늘_1_20261109');
  assert.equal(R.fileName('',new Date(2026,0,2)),'공정성포용성_보고서_20260102');
});

// --- 공정성·포용 개편: 선택 줄과 금배지 ---
const FX=require('./fairness-fixture.cjs');
const real=()=>({won:n=>Math.round(n)+'원',duration:v=>v+'초',rate:r=>Math.round(r*100)+'%',name:id=>id,route:n=>'노선'+n,choices:{},date:new Date(2026,10,10)});
const earned=(s,id)=>R.badges(s).find(b=>b.id===id).earned;
test('badges: 5개 고정 순서, 정책 내용과 무관', () => {
  const s=FX.finishedSession({petition:'reflect',elder:'abolish',whyBoth:true});
  assert.deepEqual(R.badges(s).map(b=>b.id),['residents','petition','record','reasons','solvent']);
  const flip=FX.finishedSession({petition:'not-now',elder:'keep',whyBoth:true});
  assert.equal(earned(flip,'reasons'),true);
  assert.equal(earned(s,'reasons'),earned(flip,'reasons'));
  assert.equal(earned(s,'solvent'),s.end.cause==='complete');
  R.badges(s).forEach(b=>{assert.equal(typeof b.label,'string');assert.equal(typeof b.earned,'boolean');});
});
test('badges: reasons는 둘 다 적어야, 옛 저장본은 어르신만', () => {
  assert.equal(earned(FX.finishedSession({petition:'reflect',elder:'keep'}),'reasons'),false);
  assert.equal(earned(FX.finishedSession({petition:'reflect',elder:'keep',why_elder:true}),'reasons'),false);
  const old=FX.finishedSession({elder:'keep',why_elder:true});delete old.fixedPetition;delete old.petitionReply;
  assert.equal(earned(old,'reasons'),true);
});
test('badges: solvent·record·petition·residents 조건', () => {
  const s=FX.finishedSession({petition:'reflect',elder:'keep'});
  s.end={cause:'bankrupt'};assert.equal(earned(s,'solvent'),false);
  const z=((s.config.rideLog||{}).hiddenAtStart||[])[0];assert.ok(z,'숨은 구역 설정');
  s.history[0].rideLog[z]={requests:5,rode:2,arrived:1};assert.equal(earned(s,'record'),true);
  s.history.forEach(h=>{Object.keys(h.rideLog).forEach(k=>{h.rideLog[k].rode=0;});});assert.equal(earned(s,'record'),false);
  const pz=s.fixedPetition.zone;
  s.history[1].rideLog[pz]={requests:10,rode:5,arrived:4};s.history[2].rideLog[pz]={requests:10,rode:8,arrived:8};
  assert.equal(earned(s,'petition'),true);
  s.history[2].rideLog[pz]={requests:10,rode:8,arrived:4};assert.equal(earned(s,'petition'),false);
  delete s.fixedPetition;assert.equal(earned(s,'petition'),false);
  const e=FX.finishedSession({});e.history=[];assert.equal(earned(e,'residents'),false);
});
test('fileName 접두어', () => { assert.match(R.fileName('김',new Date(2026,10,10)),/^공정성포용성_보고서_김_20261110$/); });
test('choices 줄: 이유 비면 (쓰지 않음), 없으면 null', () => {
  const s=FX.finishedSession({petition:'reflect',elder:'abolish'});
  const c=R.build(s,real()).choices,z=s.fixedPetition.zone;
  assert.match(c.petition,new RegExp('^2단계 '+z+' 주민 청원 · 3단계 답 → 반영한다 · 이유: \\(쓰지 않음\\) · 못 간 이동 \\d+건 → \\d+건$'));
  assert.equal(c.elder,'4단계 어르신 무임승차 폐지 · 이유: (쓰지 않음)');
  const w=FX.finishedSession({petition:'not-now',elder:'keep',whyBoth:true});
  assert.match(R.build(w,real()).choices.petition,/이번엔 못 한다 · 이유: 이유 petition · /);
  assert.equal(R.build(w,real()).choices.elder,'4단계 어르신 무임승차 유지 · 이유: 이유 elder');
  assert.deepEqual(R.build(FX.finishedSession({}),real()).choices,{petition:null,elder:null,petitions:[]}); /* 2026-11-12: petitions = 청원마다 한 줄(고정+사건) */
  const old=FX.finishedSession({elder:'keep'});delete old.fixedPetition;assert.equal(R.build(old,real()).choices.petition,null);
  old.history.forEach(h=>delete h.rideLog);assert.doesNotThrow(()=>{R.build(old,real());R.badges(old);});
});

// --- 2026-11-10 검토 2번: 실제로 생긴 요청과 평가 대상 이동 수요를 나눠 싣는다(점수 계산식·화면의 두 점수는 그대로) ---
const row=(st,label)=>(st.numbers.find(n=>n[0]===label)||[])[1];
const check=(s)=>{
  const r=R.build(s,real());
  r.stages.forEach((st,i)=>{
    const h=s.history[i],m=h.scores.mobility,e=st.eval;
    assert.equal(e.N,m.N);assert.equal(e.done,m.done);assert.equal(e.score,m.score);assert.equal(e.missed,m.N-m.done);
    assert.equal(e.tried+e.stayHome+e.notStarted,m.N-m.done,h.phase+'단계 사유 합계 = 평가상 못 마친 이동');
    assert.equal(e.stayHome,m.reasons.stayHome);assert.equal(e.notStarted,m.reasons.parentFailed+m.reasons.lateParent);
    assert.equal(row(st,'실제로 생긴 이동 요청의 도착률'),Math.round(h.metrics.arrivalRate*100)+'% ('+h.metrics.N+'건 중 '+h.metrics.arrived+'건)');
    assert.equal(row(st,'그중 목적지까지 못 간 이동'),(h.metrics.N-h.metrics.arrived)+'건');
    assert.equal(row(st,'이동 수요 충족(평가 대상)'),m.score+'점 ('+m.N+'건 중 '+m.done+'건 완료)');
    assert.ok(row(st,'평가 대상 중 못 마친 이동').startsWith((m.N-m.done)+'건'),row(st,'평가 대상 중 못 마친 이동'));
    assert.ok(row(st,'버스를 탄 사람의 최장 대기'),'최장 대기 범위 표기');assert.equal(row(st,'최장 대기'),undefined);
  });
  return r;
};
test('numbers: 폐지 — 집에 머문 이동이 보고서에 남고, 평가 수요·완료·사유 합계가 h.scores.mobility와 같다', () => {
  const s=FX.finishedSession({petition:'reflect',elder:'abolish'}),r=check(s),h4=s.history[3],st4=r.stages[3];
  assert.deepEqual([h4.metrics.N,h4.metrics.arrived,h4.scores.mobility.N,h4.scores.mobility.done,h4.scores.mobility.reasons.stayHome],[224,157,236,157,10],'검토 문서의 4단계 재현값');
  assert.equal(row(st4,'실제로 생긴 이동 요청의 도착률'),'70% (224건 중 157건)');assert.equal(row(st4,'그중 목적지까지 못 간 이동'),'67건');
  assert.equal(row(st4,'이동 수요 충족(평가 대상)'),'66점 (236건 중 157건 완료)');
  assert.match(row(st4,'평가 대상 중 못 마친 이동'),/^79건 \(.*무임 폐지로 집에 머문 이동 10건.*\)$/);
  assert.match(row(st4,'평가 대상 중 못 마친 이동'),/시작하지 못한 돌아오는 이동 \d+건/);
  assert.doesNotMatch(row(r.stages[2],'평가 대상 중 못 마친 이동'),/집에 머문/,'3단계는 정책 전');
  assert.match(r.scope,/실제로 생긴 이동 요청/);assert.match(r.scope,/평가 대상/);assert.match(r.scope,/집에 머문 이동/);
});
test('numbers: 유지 — 집에 머문 이동 줄이 없고 합계는 그대로 맞는다', () => {
  const s=FX.finishedSession({petition:'reflect',elder:'keep'}),r=check(s);
  r.stages.forEach(st=>{assert.equal(st.eval.stayHome,0);assert.doesNotMatch(row(st,'평가 대상 중 못 마친 이동'),/집에 머문/);});
  assert.match(r.scope,/평가 대상/);
});
