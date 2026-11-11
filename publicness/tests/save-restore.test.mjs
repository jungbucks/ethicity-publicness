// 2026-11-10 검토 4번: 형식은 JSON이지만 내용이 깨진 저장본을 이어하기로 받지 않는다
//  · Storage.saveState: none(없음·다른 버전) / ok / broken(잘린 JSON·뼈대 없음) — readSave는 ok일 때만 저장본을 준다
//  · Session.checkSave: 최소 뼈대 + stage·phase 범위 · Session.safeRestore: 되살리다 예외가 나도 던지지 않고 null
//  · 정상 저장과 선택 필드가 없는 예전 저장은 그대로 이어진다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),St=require('../js/storage.js'),S=require('../js/session.js'),cfg=require('../js/config.js'),FX=require('./fairness-fixture.cjs');
const V=cfg.SCENARIO_VERSION,read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const mem=()=>{const m={};return {m,getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v);},removeItem:k=>{delete m[k];}};};
const valid=o=>!S.checkSave(o.session,cfg);
const put=(session,version=V)=>{const st=mem();St.writeSave({version,savedAt:1,session},st);return st;};
const state=st=>St.saveState(V,st,valid).state;
const good=()=>{const s=FX.playTo(cfg,2,FX.balancedPlan);return S.serialize(s);}; // 2단계 결과 화면
test('정상 저장: 읽히고, 같은 자리로 되살아난다', () => {
  const st=put(good()),got=St.readSave(V,st,valid);
  assert.equal(state(st),'ok');assert.ok(got);assert.equal(S.checkSave(got.session,cfg),null);
  const s=S.safeRestore(got.session,cfg);
  assert.ok(s);assert.equal(s.phase,2);assert.equal(s.stage,'result');assert.equal(s.history.length,2);assert.ok(s.current&&s.current.result,'결과를 다시 계산');
  assert.ok(St.readSave(V,st),'검사 함수를 안 줘도 뼈대만으로 읽힌다');
});
test('지원하는 예전 저장(선택 필드 없음·단계 전 화면)도 그대로 이어진다', () => {
  const d=good();delete d.ledger;delete d.negStreak;delete d.runId;delete d.stageNotes;delete d.planLog;delete d.fixedPetition;d.history.forEach(h=>{delete h.scores;delete h.rideLog;delete h.elder;});
  d.stage='reveal';d.transitionStep=1;delete d.current;
  const st=put(d);assert.equal(state(st),'ok');
  const s=S.safeRestore(St.readSave(V,st,valid).session,cfg);
  assert.ok(s);assert.equal(s.stage,'plan');assert.equal(s.ledger.length,2);assert.ok(s.history.every(h=>h.scores),'점수를 다시 채움');
});
test('랜덤 세팅 저장(설정 포함)·운행 중 저장도 이어진다', () => {
  const r=S.create(cfg,{mode:'random',seed:7});S.beginPlan(r);
  const st=put(S.serialize(r));assert.equal(state(st),'ok');
  const s=S.safeRestore(St.readSave(V,st,valid).session,cfg);assert.ok(s);assert.equal(s.config.phases.length,8);
  const run=good();run.stage='run';delete run.runCursor;const back=S.safeRestore(run,cfg);assert.equal(back.stage,'plan');assert.equal(back.resumedFromRun,true);
});
test('잘린 JSON·session:{}·잘못된 history는 이어하기로 받지 않는다(깨짐으로 구분)', () => {
  const st=put(good()),raw=st.m[St.SAVE_KEY];
  st.m[St.SAVE_KEY]=raw.slice(0,Math.floor(raw.length/2));
  assert.equal(state(st),'broken');assert.equal(St.readSave(V,st,valid),null);assert.equal(St.readSave(V,st),null);
  for(const bad of [{}, [], 'x', 3, Object.assign(good(),{history:{}}), Object.assign(good(),{history:'x'}), Object.assign(good(),{draft:null}), Object.assign(good(),{draft:{routes:{},buses:[]}})]){
    const b=put(bad);assert.equal(state(b),'broken',JSON.stringify(bad).slice(0,40));assert.equal(St.readSave(V,b,valid),null);assert.equal(St.readSave(V,b),null,'뼈대 검사는 Storage 혼자서도');
    assert.ok(S.checkSave(bad,cfg));assert.equal(S.safeRestore(bad,cfg),null);
  }
});
test('stage·phase 범위: 벗어나면 깨짐', () => {
  const bad=o=>Object.assign(good(),o);
  for(const o of [{phase:0},{phase:6},{phase:'2'},{phase:1.5},{stage:'weird'},{stage:null},{mode:'x'},{seed:'abc'},{mode:'random',config:undefined}]){
    assert.ok(S.checkSave(bad(o),cfg),JSON.stringify(o));assert.equal(state(put(bad(o))),'broken',JSON.stringify(o));assert.equal(S.safeRestore(bad(o),cfg),null);
  }
  assert.equal(S.checkSave(bad({phase:5,stage:'ending'}),cfg),null,'범위 안');
});
test('뼈대는 맞지만 되살리다 예외가 나는 저장본: 던지지 않고 null', () => {
  const d=good();d.history=[{phase:1}];delete d.ledger;
  assert.equal(S.checkSave(d,cfg),null,'뼈대 검사는 통과');
  assert.throws(()=>S.restore(d,cfg));assert.doesNotThrow(()=>S.safeRestore(d,cfg));assert.equal(S.safeRestore(d,cfg),null);
});
test('다른 버전·빈 저장소는 깨짐이 아니라 없음, 막힌 저장소도 멈추지 않는다', () => {
  assert.equal(state(put(good(),'pb-old')),'none');assert.equal(St.readSave(V,put(good(),'pb-old'),valid),null);
  assert.equal(state(mem()),'none');
  const denied={getItem(){throw new Error('SecurityError');},setItem(){throw new Error('SecurityError');}};
  assert.equal(state(denied),'none');assert.equal(St.readSave(V,denied,valid),null);
});
test('keepBroken: 새로 시작하기 전에 깨진 원본을 따로 남긴다', () => {
  const st=put({});const raw=st.m[St.SAVE_KEY];
  assert.equal(St.keepBroken(st),true);assert.equal(st.m[St.BROKEN_KEY],raw);
  assert.equal(St.keepBroken(mem()),false,'남길 것이 없음');
});
test('화면 연결: 이어하기는 검사한 저장본만, 되살리기는 safeRestore로', () => {
  const app=read('js/app.js');
  assert.match(app,/S\.safeRestore\(saved\.session, cfg\)/);assert.doesNotMatch(app,/S\.restore\(/);
  assert.match(app,/PB\.Storage\.saveState\(cfg\.SCENARIO_VERSION, null, validSave\)/);
  assert.doesNotMatch(app,/PB\.Storage\.readSave\(cfg\.SCENARIO_VERSION\)/,'검사 없이 읽지 않는다');
});
