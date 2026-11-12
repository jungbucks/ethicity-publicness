// 2026-11-12 검토: 운행 중 노선을 고쳐도 보고서 ‘내 계획’에는 출발 계획만 나와, 고친 뒤 운행으로 센 결과 숫자와 이어지지 않았다.
// 보고서는 출발 계획(plan)을 그대로 두고, 운행 중 바꾼 것(changes)을 따로 싣는다 — 시각 · 노선이나 버스 · 고치기 전과 뒤. 처음부터 고친 노선으로 달린 것처럼 보이면 안 된다.
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),N=require('../js/stage-notes.js'),R=require('../js/report.js'),D=require('../js/demand.js'),Names=require('../js/route-names.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
const NAME={A:'기차역',B:'시장',C:'대학교',D:'병원',E:'일자리',F:'외곽 마을'};
// 화면(ui-report fmt)과 같은 이름·시각 함수: 노선·버스 = 색 이름(route-names), 시각 = Demand.clock
const fmt=s=>({won:String,duration:String,rate:String,name:id=>NAME[id]||id,route:n=>Names.route(n,s),bus:(id,from)=>Names.bus(id,s,from),clock:t=>D.clock(s.config,t),choices:{},date:new Date(2026,10,12)});
// 3단계: 빨강 A→B→C(버스 1·2), 초록 F→D(버스 3), 대기 버스 4 — 검토 문서의 재현 조건(tests/midday.test.mjs setup과 같음)
function setup(){const s=S.create(cfg);s.phase=3;s.owned=4;s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:id<=2?1:id===3?2:null,offset:0}));S.beginPlan(s);
 S.updateRoute(s,1,route(['A','B','C']));S.updateRoute(s,2,route(['F','D']));S.startRun(s);return s;}
// 결과 화면이 하는 일(ui-transition): 정산 뒤 출발 계획을 남긴다
function finish(s){S.finishRun(s);N.logPlan(s,s.phase,s.draft,s.current.result);return s;}
const stage=(s,phase=3)=>R.build(s,fmt(s)).stages.find(x=>x.phase===phase);
/* 2026-11-12 랜덤 검토 7번: 노선 줄 끝에 한 바퀴·간격(노선 칩과 같은 Schedule.routeCycle, 여기 duration은 엔진 단위 그대로) */
const DEPART=['빨강 노선: 기차역 → 시장 → 대학교 · 버스 2대 · 한 바퀴 16 · 간격 약 8','초록 노선: 외곽 마을 → 병원 · 버스 1대 · 한 바퀴 32 · 간격 약 32','대기 버스 1대'];
const FOLLOWED='그 뒤 이 노선 버스는 바뀐 정류장을 따랐어요(이번 운행만).',NOTE='아래 결과는 이렇게 바꾼 운행으로 센 숫자예요.';

test('정류장 더하기(검토 재현: A→B→C로 출발, 11:45에 E를 A와 B 사이에): 출발 계획은 그대로, 고친 내용은 따로',()=>{
 const s=setup();assert.equal(S.midApply(s,{at:45,kind:'add',routeNum:1,node:'E',pos:0}),true);finish(s);
 assert.deepEqual(s.midChanges[0].route.nodes,['A','E','B','C'],'실제 기록');
 const st=stage(s);
 assert.deepEqual(st.plan,DEPART,'내 계획 = 출발할 때 계획(고친 노선으로 바꿔 쓰지 않음)');assert.equal(st.planLabel,'내 계획 (출발할 때)');
 assert.deepEqual(st.changes,[{at:45,kind:'add',head:'11:45 노선 고침 · 빨강 노선에 일자리 더함',detail:['고치기 전: 기차역 → 시장 → 대학교','고친 뒤: 기차역 → 일자리 → 시장 → 대학교',FOLLOWED]}]);
 assert.equal(st.changeNote,NOTE);
 assert.ok(!st.plan.join('|').includes('일자리'),'출발 계획 줄에는 고친 정류장이 없음');
});
test('정류장 빼기: 시각 · 노선 · 고치기 전과 뒤',()=>{
 const s=setup();assert.equal(S.midApply(s,{at:52,kind:'remove',routeNum:1,node:'B'}),true);finish(s);
 const st=stage(s);assert.deepEqual(st.plan,DEPART);
 assert.deepEqual(st.changes,[{at:52,kind:'remove',head:D.clock(cfg,52)+' 노선 고침 · 빨강 노선에서 시장 뺌',detail:['고치기 전: 기차역 → 시장 → 대학교','고친 뒤: 기차역 → 대학교',FOLLOWED]}]);
});
test('순환 노선을 고치면 고치기 전·뒤도 순환으로 적는다',()=>{
 const s=setup();s.midChanges=[{phase:3,at:45,kind:'add',routeNum:1,node:'E',pos:2,from:route(['A','B','C','A']),route:route(['A','B','C','E','A']),busIds:[1,2]}];finish(s);
 assert.deepEqual(stage(s).changes[0].detail.slice(0,2),['고치기 전: 기차역 → 시장 → 대학교 (순환)','고친 뒤: 기차역 → 시장 → 대학교 → 일자리 (순환)']);
});
test('버스 한 대 옮기기: 대기 버스 → 초록 노선, 버스 수 전·뒤와 달리기 시작한 시각',()=>{
 const s=setup();assert.equal(S.midApply(s,{at:50,kind:'move',busId:4,routeNum:2}),true);finish(s);
 const re=s.current.result.log.find(e=>e.type==='reassign'&&e.bus===4);assert.ok(re,'엔진 기록');
 assert.deepEqual(s.planLog[3].moveStart,{4:re.data.starts});
 const st=stage(s);assert.deepEqual(st.plan,DEPART);
 assert.deepEqual(st.changes,[{at:50,kind:'move',head:'12:30 노선 고침 · 대기 버스 한 대를 초록 노선으로 옮김',
  detail:['옮기기 전: 대기 버스 1대 · 초록 노선 버스 1대','옮긴 뒤: 대기 버스 0대 · 초록 노선 버스 2대',D.clock(cfg,re.data.starts)+'부터 초록 노선에서 달렸어요.']}]);
});
test('버스 한 대 옮기기: 달리던 빨강 버스 → 초록 노선',()=>{
 const s=setup();assert.equal(S.midApply(s,{at:50,kind:'move',busId:1,routeNum:2}),true);finish(s);
 const c=stage(s).changes[0];
 assert.equal(c.head,'12:30 노선 고침 · 빨강 버스 한 대를 초록 노선으로 옮김');
 assert.deepEqual(c.detail.slice(0,2),['옮기기 전: 빨강 노선 버스 2대 · 초록 노선 버스 1대','옮긴 뒤: 빨강 노선 버스 1대 · 초록 노선 버스 2대']);
});
test('버스를 옮기라고 했지만 운행이 끝날 때까지 못 옮겼으면 그렇게 적고, 버스 수가 바뀐 것처럼 쓰지 않는다',()=>{
 const s=setup();assert.equal(S.midApply(s,{at:50,kind:'move',busId:4,routeNum:2}),true);S.finishRun(s);
 N.logPlan(s,3,s.draft,{log:[]}); // 옮겨 간 기록이 없는 운행
 assert.deepEqual(s.planLog[3].moveStart,{4:null});
 assert.deepEqual(stage(s).changes[0].detail,['운행이 끝날 때까지 옮겨 가지 못했어요.']);
 N.logPlan(s,3,s.draft);assert.deepEqual(s.planLog[3].moveStart,{4:null},'운행 기록 없이 다시 남겨도 앞서 적은 값은 남음');
});
test('고치지 않은 운행·기록이 없는 예전 저장본: 전과 똑같이 나온다',()=>{
 const s=finish(setup()),st=stage(s);
 assert.deepEqual(st.plan,DEPART);assert.deepEqual(st.changes,[]);assert.equal(st.changeNote,null);assert.equal(st.planLabel,'내 계획');
 assert.equal(s.planLog[3].moveStart,undefined,'옮긴 버스가 없으면 계획 기록 모양 그대로');
 // 예전 저장본: midChanges·planLog 필드가 아예 없음 → history.plan으로 되살린 계획만
 const old=S.serialize(s);delete old.midChanges;delete old.planLog;delete old.emergencyLog;
 const r=S.restore(JSON.parse(JSON.stringify(old)),cfg),so=stage(r);
 assert.deepEqual(so.plan,DEPART);assert.deepEqual(so.changes,[]);assert.equal(so.planLabel,'내 계획');
 // 계획 기록(planLog)만 없는 저장본에 고친 기록이 있어도 고친 내용은 나온다
 const m=setup();S.midApply(m,{at:45,kind:'add',routeNum:1,node:'E',pos:0});S.finishRun(m);
 assert.equal(m.planLog&&m.planLog[3],undefined);assert.equal(stage(m).changes[0].head,'11:45 노선 고침 · 빨강 노선에 일자리 더함');
});
test('저장 → 이어하기: 고친 내용이 그대로 남고, 다음 단계를 운행한 뒤에도 그 단계 보고서에 남는다',()=>{
 for(const c of [{at:45,kind:'add',routeNum:1,node:'E',pos:0},{at:45,kind:'remove',routeNum:1,node:'B'},{at:50,kind:'move',busId:4,routeNum:2}]){
  const s=setup();assert.equal(S.midApply(s,c),true);s.runCursor=c.at;
  const running=S.restore(JSON.parse(JSON.stringify(S.serialize(s))),cfg);finish(running);finish(s); // 운행 도중 저장했다가 이어서 끝낸 것과 그대로 끝낸 것
  const want=stage(s);assert.equal(want.changes.length,1,c.kind);
  assert.deepEqual(stage(running),want,c.kind+' 운행 중 이어하기');
  const again=S.restore(JSON.parse(JSON.stringify(S.serialize(s))),cfg);
  assert.deepEqual(stage(again),want,c.kind+' 결과 화면에서 이어하기');
  assert.ok(S.nextPhase(again));S.beginPlan(again);assert.ok(S.startRun(again),'4단계 출발');finish(again);
  const later=S.restore(JSON.parse(JSON.stringify(S.serialize(again))),cfg);
  assert.deepEqual(stage(later,3),want,c.kind+' 다음 단계 뒤');assert.deepEqual(stage(later,4).changes,[],'4단계는 고친 것 없음');
 }
});
test('예전 저장본의 긴급 조정 기록(emergencyLog 버스 이동)도 운행 중 바꾼 것으로 나온다',()=>{
 const s=finish(setup());s.emergencyLog=[{phase:3,at:34,busId:4,routeNum:2,route:route(['F','D'])},{phase:3,at:67,busId:null,routeNum:null,route:null},{phase:2,at:34,busId:1,routeNum:1,route:null}];
 const st=stage(s);assert.deepEqual(st.plan,DEPART);
 assert.deepEqual(st.changes,[{at:34,kind:'move',head:D.clock(cfg,34)+' 노선 고침 · 버스 한 대를 초록 노선으로 옮김',detail:[]}],'‘변경 없이 계속’과 다른 단계 기록은 뺌');
});
test('화면(ui-report): 보고서 그리기가 출발 계획 이름표와 운행 중 바꾼 것 줄을 쓴다',()=>{
 const ui=readFileSync(new URL('../js/ui-report.js',import.meta.url),'utf8');
 assert.match(ui,/row\(st\.planLabel \|\| '내 계획', ul\)/);assert.match(ui,/row\('운행 중 바꾼 것', cl\)/);assert.match(ui,/st\.changes/);assert.match(ui,/clock: App\.clock/);
 assert.match(readFileSync(new URL('../js/ui-transition.js',import.meta.url),'utf8'),/logPlan\(s,h\.phase,s\.draft,res\)/);
});
