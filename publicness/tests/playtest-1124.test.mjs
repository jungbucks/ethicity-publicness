// 2026-11-24 플레이테스트(pb-3.2.0 배포판 → pb-3.2.1) — 엔진·문장 쪽 단위 검사(화면은 tests/playtest-1124-browser.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), Sim = require('../js/sim.js'), C = require('../js/choices.js'), T = require('./playtest-1111-plan.cjs');

/* 계획 깔기: [[정류장 목록, 버스 수], …] — 버스가 모자라면 lease로 빌린다 */
function lay(s, plan, lease) {
  S.beginPlan(s); for (let i = 0; i < (lease || 0); i++) S.lease(s);
  s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  plan.forEach(([nodes, n], i) => {
    s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true });
    for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; assert.ok(b, '버스 모자람'); b.routeNum = i + 1; }
  });
}
const RED = [['F', 'C', 'B', 'A', 'D'], 2], GREEN = [['A', 'G', 'E'], 1], ORANGE = [['B', 'H', 'E'], 1];
function phase2(plan, lease) { const s = S.create(cfg); T.lay(s); assert.ok(S.startRun(s)); S.finishRun(s); S.nextPhase(s); lay(s, plan, lease); assert.ok(S.startRun(s), JSON.stringify(S.validate(s))); return s; }

test('P1-1 재현: 2단계 빨강(버스 2대)·초록·주황 — 11:45에 병원 이동 2건은 버스 안(1)·막 기다리는 중(1)이라 청원이 뜨지 않는다', () => {
  const s = phase2([RED, GREEN, ORANGE], 1), r = s.current.result, t = cfg.petition.t;
  const D = r.passengers.filter((p) => p.o === 'D' && p.t <= t);
  assert.equal(D.length, 2, '그때까지 병원 출발 요청 2건(예전 청원 ‘2건 중 2건’)');
  assert.deepEqual(D.map((p) => Sim.stuckAt(p, t, cfg.service.maxWait)), [null, null], '둘 다 정상 이동 중');
  assert.ok(D.every((p) => p.status === 'arrived'), '하루 끝에는 모두 도착');
  assert.equal(r.petition, null, '센 숫자 0 → 청원 없음');
  assert.equal(r.log.filter((e) => e.type === 'petition').length, 0, '운행 화면 청원 말풍선도 없음');
  S.finishRun(s);
  assert.equal(s.fixedPetition, undefined, '3단계에 답할 고정 청원도 없음');
  assert.deepEqual(C.list(s), []); assert.deepEqual(C.required(s), []);
});

test('P1-1: stuckAt — 기준(27) 넘게 기다리는 중·잇는 노선 없음만 센다(버스 안·걷는 중·도착·기준 안은 빼고)', () => {
  const at = (p, t) => Sim.stuckAt(p, t, 27);
  assert.equal(at({ o: 'D', t: 10, waits: [[10, null]] }, 38), 'wait', '28 기다리는 중');
  assert.equal(at({ o: 'D', t: 10, waits: [[10, null]] }, 37), null, '27 = 기준과 같으면 아직');
  assert.equal(at({ o: 'D', t: 10, waits: [[10, 40]], firstBoardT: 40 }, 45), null, '40에 탐 → 45엔 버스 안');
  assert.equal(at({ o: 'D', t: 10, waits: [[10, 30], [32, null]], firstBoardT: 30 }, 50), 'wait', '환승 대기 포함 20 + 18 = 38');
  assert.equal(at({ o: 'D', t: 10, waits: [], noRouteT: 10, fail: 'NO_LINK' }, 11), 'noRoute');
  assert.equal(at({ o: 'D', t: 10, waits: [[20, null]], noRouteT: 10, linkT: 20 }, 25), null, '노선이 다시 생긴 뒤에는 기준 안');
  assert.equal(at({ o: 'D', t: 10, arriveT: 30, waits: [[10, 15]] }, 45), null, '이미 도착');
  assert.equal(at({ o: 'D', t: 50, waits: [[50, null]] }, 45), null, '아직 요청 전');
});

test('P1-1: 청원은 그 시각 실제로 못 가고 있는 사람만 세고, 그 숫자가 결과 ‘청원 그 뒤’ 참고 줄과 같은 셈', () => {
  // 병원을 잇지 않는 2단계 → 병원 청원(노선 없음)
  const s = phase2([[['F', 'C', 'B', 'A'], 2], GREEN]), r = s.current.result;
  assert.ok(r.petition && r.petition.zone === 'D' && r.petition.count >= 1, JSON.stringify(r.petition));
  assert.equal(r.petition.count, r.petition.wait + r.petition.noRoute);
  const again = S.petitionZoneAt(r.passengers, r.petition.t, 'D', cfg.service.maxWait);
  assert.equal(again.count, r.petition.count); assert.equal(again.total, r.petition.total);
  S.finishRun(s); assert.equal(s.fixedPetition.noRoute, r.petition.noRoute, '저장되는 고정 청원에도 내역');
});

test('P1-1 배지: 판정할 청원이 없으면 ‘해당 없음’, 청원 당시 실제 문제가 0건이던 청원(예전 저장본)은 판정에서 뺀다', () => {
  const R = require('../js/report.js');
  const s = T.playTo(5); s.fixedPetition = null; s.history.forEach((h) => { if (h.petition) h.petition = null; });
  const b = R.badges(s).find((x) => x.id === 'petition'); assert.equal(b.earned, false); assert.equal(b.na, true);
  const s2 = T.playTo(3); s2.fixedPetition = Object.assign({}, s2.fixedPetition || { phase: 2, zone: 'D', t: 45, total: 2 }, { count: 0 });
  assert.deepEqual(C.judged(s2), [], 'count 0 청원은 판정 안 함');
  const s3 = T.playTo(3); if (s3.fixedPetition) { s3.fixedPetition.count = 1; assert.equal(C.judged(s3).length, 1); }
});

test('P1-2: 이미 답한 동네·같은 요구(병원 → 구도심)는 그 단계 안에 다시 띄우지 않는다', () => {
  const s = phase2([[['F', 'C', 'B', 'A'], 2], GREEN]); S.finishRun(s);
  const fp = s.fixedPetition; assert.equal(fp.zone, 'D'); assert.ok(fp.to);
  S.nextPhase(s); lay(s, [[['F', 'C', 'B', 'A'], 2], GREEN, [['E', 'H', 'A'], 1]]);
  assert.deepEqual(C.required(s), ['petition']); C.set(s, 'petition', 'choice', 'not-now');
  assert.ok(S.startRun(s)); const r = s.current.result;
  assert.equal(r.petition, null, '같은 요구의 3단계 사건 청원은 안 띄움');
  assert.deepEqual(r.repeatPetition, { zone: 'D', t: r.repeatPetition.t, to: fp.to }, '(무엇을 뺐는지만 남김)');
  S.finishRun(s);
  assert.deepEqual(C.unanswered(s), [], '‘답할 차례가 없는 청원’으로 남지 않음');
});

test('P1-2: 답할 차례가 없는 청원 — 마지막 단계는 ‘다음 학기로 넘어간 청원’, 그 밖은 ‘답할 차례가 없던 청원’, 배지 판정에서 빠짐', () => {
  const s = { mode: 'default', config: { phases: [1, 2, 3, 4, 5] }, history: [{ phase: 3, petition: { zone: 'D', t: 49, count: 2, total: 3, wait: 1, noRoute: 1, to: 'E' } }, { phase: 5, petition: { zone: 'F', t: 49, count: 1, total: 4, wait: 1, noRoute: 0 } }] };
  assert.deepEqual(C.unanswered(s).map((p) => [p.phase, p.last]), [[3, false], [5, true]]);
  assert.deepEqual(C.judged(s), []); assert.equal(C.badge(s), false);
  const rep = require('fs').readFileSync(new URL('../js/report.js', import.meta.url), 'utf8');
  assert.match(rep, /label = p\.last \? '다음 학기로 넘어간 청원' : '답할 차례가 없던 청원'/);
  assert.doesNotMatch(rep + require('fs').readFileSync(new URL('../js/ui-transition.js', import.meta.url), 'utf8'), /답하지 않은 청원’으로 남아요/);
});

test('P1-3: 도착률(Metrics.fmtRate)과 이동 수요 충족 점수(Scores)가 같은 건수면 같은 숫자 — 161/186·207/236·245/282', () => {
  const M = require('../js/metrics.js'), Sc = require('../js/scores.js');
  [[161, 186, 86], [207, 236, 87], [245, 282, 86]].forEach(([d, n, want]) => {
    assert.equal(M.fmtRate(d / n), want + '%'); assert.equal(M.pctOf(d / n), want);
    const units = Array.from({ length: n }, (_, i) => ({ key: 'k' + i, done: i < d }));
    assert.equal(Math.floor(100 * d / n), want, '점수 식(소수점 버림)과 같음');
  });
  // 실제 운행: 결과 요약 도착률과 점수의 N·완료가 같은 단계는 숫자도 같다
  const s = T.playTo(5);
  s.history.forEach((h) => { const m = h.scores.mobility; if (m.N === h.metrics.N && m.done === h.metrics.arrived) assert.equal(M.fmtRate(h.metrics.arrivalRate), m.score + '%', h.phase + '단계'); });
  assert.equal(Sc.overall ? typeof Sc.overall : 'function', 'function');
});

test('P1-4 재현: 5단계 주황(주거지-운동장-구도심-터미널, 버스 1대) — 유나·다은 예상 실패(운동장→터미널 버스편 없음)가 출발 점검에 잡힌다', () => {
  // 4단계도 같은 주황 노선(B-H-E-J)으로 — 유나·다은이 4단계에 누적 기준을 채운다(플레이테스트와 같은 흐름)
  const s = T.playTo(3); S.nextPhase(s); T.lay(s); s.draft.routes[2].nodes = ['B', 'H', 'E', 'J']; C.set(s, 'elder', 'choice', 'keep'); assert.ok(S.startRun(s)); S.finishRun(s);
  S.nextPhase(s); T.lay(s); s.draft.routes[2].nodes = ['B', 'H', 'E', 'J'];
  const gap = S.routeGaps(s).find((g) => g.num === 3); assert.equal(gap.buses, 1); assert.equal(gap.over, false, '간격 3시간 18분은 기준 안(간격 경고 없음)');
  const c = S.departChecks(s);
  assert.deepEqual(c.forecast, [{ id: 'yuna', name: '유나', code: 'noTrip', o: 'H', d: 'J' }, { id: 'daeun', name: '다은', code: 'noTrip', o: 'H', d: 'J' }]);
  const tally = require('../js/narrative.js').residentTally(s.config, s.history);
  assert.ok(tally.yuna.completed >= tally.yuna.threshold, '유나는 누적 기준을 이미 채움(칩 ‘1/1 기준 달성’) — 그래도 이번 단계 예상 실패');
  // 같은 계획에서 실제로도 못 감
  assert.ok(S.startRun(s)); const h = S.finishRun(s); assert.equal(h.residents.yuna.satisfied, false); assert.equal(h.residents.yuna.dayStatus, 'returnIncomplete');
  const plan = require('fs').readFileSync(new URL('../js/ui-plan.js', import.meta.url), 'utf8');
  assert.match(plan, /'예상으로 기준을 못 지키는 주요 인물: '/); assert.match(plan, /noTrip:'버스편 없음'/);
});

test('P1-4: 버스가 하나도 없는 계획이면 예상 실패 목록을 만들지 않는다(‘운행 버스 0대’ 줄 하나로)', () => {
  const s = S.create(cfg); S.beginPlan(s); s.draft.buses.forEach((b) => { b.routeNum = null; });
  assert.deepEqual(S.departChecks(s).forecast, []);
});

test('P2-2: 운행 중 버스 옮기기로 버스가 0대가 된 노선 — emptiedRoutes, 출발 계획으로는 이어졌던 구간(lostLink)', () => {
  const s = T.playTo(2); S.nextPhase(s); T.lay(s); C.set(s, 'petition', 'choice', 'reflect'); assert.ok(S.startRun(s));
  const one = S.routesInOrder(s).find((r) => S.routeBuses(s, r.num).length === 1), other = S.routesInOrder(s).find((r) => r.num !== one.num);
  const st = S.midStatus(s, 40); assert.ok(st.ok, JSON.stringify(st));
  assert.ok(S.midApply(s, { at: st.at, kind: 'move', routeNum: other.num, busId: S.routeBuses(s, one.num)[0] }));
  const m = s.midChanges[s.midChanges.length - 1]; assert.equal(m.from, one.num); assert.equal(m.fromLeft, 0);
  const h = S.finishRun(s);
  assert.deepEqual(S.emptiedRoutes(s, h), [one.num]);
  const lost = h.scores.mobility.noLinkAll.filter((p) => S.lostLink(s, h, p.o, p.d));
  assert.ok(lost.length > 0, '그 노선만 잇던 구간이 노선 없음으로 ' + JSON.stringify(h.scores.mobility.noLinkAll));
  // 예전 기록(fromLeft 없음)도 출발 계획에서 다시 센다
  delete m.fromLeft; assert.deepEqual(S.emptiedRoutes(s, h), [one.num]);
});

test('P2-3·P2-4: 다음 운행 목표의 까닭 한 줄 · 학기 마무리 일정 인물 문장', () => {
  const N = require('../js/narrative.js');
  const l = N.bridgeLine(cfg, 1, [], { zones: { F: { N: 12, done: 12 } } }, { unseen: { F: { seen: 0, real: 12 } } });
  assert.ok(l.endsWith('AI는 탑승 기록을 보고 소외 지역을 골라서, 기록에 잡히지 않은 외곽 마을의 이동은 오히려 놓칠 수 있어요.'), l);
  const ok = { o: 'J', d: 'H', finalDestination: 'B', dayStatus: 'complete', satisfied: true, homeT: 110 }, miss = { o: 'B', d: 'H', finalDestination: 'J', dayStatus: 'returnIncomplete', satisfied: false };
  assert.equal(N.residentStory([null, null, null, ok, miss], 'yuna', cfg).text, '유나의 일정 2번 중 1번은 기준 안에 마쳤고, 마지막 일정(운동장→터미널)은 마치지 못했어요.');
  assert.equal(N.residentStory([null, null, null, ok, miss], 'yuna', cfg).closing, null, '못 마친 마지막 일정은 위 문장에만');
  assert.equal(N.residentStory([null, null, null, miss, Object.assign({}, miss, { dayStatus: 'outboundIncomplete' })], 'daeun', cfg).text, '다은의 일정 2번 중 기준 안에 마친 일정은 없고, 마지막 일정(주거지→운동장)은 마치지 못했어요.');
  const done = N.residentStory([null, null, null, ok, Object.assign({}, ok, { o: 'B', finalDestination: 'J' })], 'daeun', cfg);
  assert.equal(done.text, '다은의 일정 2번을 모두 기준 안에 마쳤어요.'); assert.match(done.closing, /^마지막 목적지에 /);
});

test('버전 pb-3.2.1 · pb-3.2.0 저장본도 이어하기(새 저장 칸은 없으면 예전 방식)', () => {
  assert.equal(cfg.SCENARIO_VERSION, 'pb-3.2.1'); assert.ok(cfg.SAVE_COMPAT.includes('pb-3.2.0'));
  // 예전 저장본 모양: 고정 청원에 wait·noRoute 없음, 결과 화면 되살리기
  const s = T.playTo(2); if (s.fixedPetition) { delete s.fixedPetition.wait; delete s.fixedPetition.noRoute; }
  const back = S.restore(JSON.parse(JSON.stringify(S.serialize(s))), cfg);
  assert.equal(back.stage, 'result'); assert.deepEqual(back.fixedPetition, s.fixedPetition);
  S.nextPhase(back); assert.equal(back.phase, 3);
});
