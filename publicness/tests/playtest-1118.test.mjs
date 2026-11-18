// 2026-11-18 플레이테스트(pb-3.2.0) P0 — 엔진·문장 쪽 단위 검사(화면은 tests/playtest-1118-browser.mjs)
//  기본 모드 · 시드 42
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), A = require('../js/advisor.js');

function phase1(routes) {
  const s = S.create(cfg); S.beginPlan(s);
  routes.forEach(([nodes, n], i) => { const r = s.draft.routes[i]; r.nodes = nodes.slice(); r.stops = nodes.map(() => true); for (let k = 0; k < n; k++) s.draft.buses.filter((b) => b.routeNum == null)[0].routeNum = r.num; });
  return s;
}

test('P0-1: AI 제안 미리보기 — 내 계획에서 빠지는 구간과 더는 서지 않는 정류장(Session.previewDiff)', () => {
  // 1단계 빨강 = 외곽 마을→병원→기차역→밀집 주거지→대학교, ‘빠른 이동’ 제안은 외곽 마을·병원을 뺀다
  const s = phase1([[['F', 'D', 'A', 'B', 'C'], 1]]), rec = A.recommendSync(S.revealed(s), 'time'), pv = S.previewRec(s, rec);
  const aiNodes = pv.draft.routes.flatMap((r) => r.nodes);
  assert.ok(aiNodes.indexOf('F') < 0, '재현 조건: 제안에 외곽 마을 없음 ' + JSON.stringify(pv.draft.routes.map((r) => r.nodes.join(''))));
  const d = S.previewDiff(s, pv);
  assert.ok(d.segs.some((x) => x.key === 'D-F'), '외곽 마을—병원 = 빠지는 구간 ' + JSON.stringify(d.segs));
  assert.ok(d.stops.indexOf('F') >= 0, '외곽 마을 = 더는 서지 않는 정류장');
  // 제안에도 있는 구간(방향 무관)·정류장은 빠짐이 아님
  const aiKeys = new Set(pv.draft.routes.flatMap((r) => r.nodes.slice(1).map((n, i) => [r.nodes[i], n].sort().join('-'))));
  d.segs.forEach((x) => assert.ok(!aiKeys.has(x.key), x.key + '는 제안에 없는 구간'));
  assert.deepEqual(d.stops.filter((id) => aiNodes.indexOf(id) >= 0), [], '제안이 서는 정류장은 빠짐 아님');
  // 같은 계획이면 빠지는 것 없음 · 정류장 1곳짜리 노선은 지도에 안 그려지므로 안 셈
  assert.deepEqual(S.previewDiff(s, s), { segs: [], stops: [] });
  const one = phase1([[['F'], 0]]); assert.deepEqual(S.previewDiff(one, pv), { segs: [], stops: [] });
  // 거꾸로 이은 같은 구간은 남는 구간
  const rev = phase1([[['C', 'B', 'A'], 1]]), fwd = phase1([[['A', 'B', 'C'], 1]]);
  assert.deepEqual(S.previewDiff(rev, fwd), { segs: [], stops: [] });
});

test('P0-2: 출발 확인 — 노선을 달리는 빌린 버스는 임차료 이유(Session.departChecks.leasedRunning)', () => {
  const T = require('./playtest-1111-plan.cjs'), s = T.playTo(1); S.nextPhase(s); T.lay(s);
  let c = S.departChecks(s);
  assert.equal(c.leasedRunning, 0); assert.equal(c.leaseRunningCost, 0);
  const b = S.lease(s); c = S.departChecks(s);
  assert.equal(c.restingLeased, 1, '빌리기만 하면 쉬는 빌린 버스'); assert.equal(c.leasedRunning, 0);
  b.routeNum = 3; c = S.departChecks(s);
  assert.equal(c.restingLeased, 0); assert.equal(c.leasedRunning, 1); assert.equal(c.leaseRunningCost, cfg.finance.lease.fee);
  // 재현: 이 계획(2단계 무난한 노선 + 빌린 버스를 주황 노선에)은 예상 수지가 마이너스인데 예전 점검 목록은 모두 비어 있었다
  assert.ok(S.expectedRun(s).metrics.costs.total < 0, '예상 수지 마이너스');
  assert.equal(c.overGap.length + c.idleRoutes.length + c.unserved.length + c.resting + c.residents.length + c.transfers.length + (c.noBus ? 1 : 0), 0, '다른 이유는 없음');
});

test('P0-3: 운행 중 고친 노선을 탄 승객 — 고친 노선 id를 출발 노선 운행표로 잇는다(Session.midRouteFor)', () => {
  const T = require('./playtest-1111-plan.cjs'), C = require('../js/choices.js'), G = require('../js/graph.js'), s = T.playTo(2); S.nextPhase(s);
  // 3단계: 초록은 산업·일자리 없이, 11:00(엔진 40)에 주황 노선 끝에 산업·일자리를 더함 → 준(기차역→산업·일자리)은 고친 주황으로만 간다
  S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A'], 1], [['E', 'H', 'A'], 1]].forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) s.draft.buses.filter((x) => x.routeNum == null)[0].routeNum = i + 1; });
  C.set(s, 'petition', 'choice', 'reflect');
  assert.ok(S.startRun(s)); assert.ok(S.midApply(s, { at: 40, kind: 'add', routeNum: 3, node: 'G', pos: 2 }));
  S.finishRun(s);
  const res = s.current.result, tlIds = new Set(res.timelines.filter((t) => t.route).map((t) => t.routeId));
  const jun = res.passengers.filter((p) => p.residentId === 'jun' && p.journey);
  assert.ok(jun.length, '준은 고친 노선으로 다녀옴');
  const ids = [...new Set(jun.flatMap((p) => p.journey.map((l) => l.routeId)))];
  assert.deepEqual(ids, ['E-H-A-G'], '준의 탑승 기록은 고친 노선 id');
  assert.ok(!tlIds.has('E-H-A-G'), '재현: 운행표에는 고친 노선 id가 없다(예전 결과 카드가 못 찾아 ‘잇는 노선 없음’)');
  const m = S.midRouteFor(s, 3, 'E-H-A-G');
  assert.ok(m && tlIds.has(m.fromId), '출발 노선 운행표로 이어짐 ' + JSON.stringify(m));
  assert.equal(m.fromId, 'A-H-E'); assert.equal(m.routeNum, 3); assert.deepEqual(m.route.nodes, ['E', 'H', 'A', 'G']); assert.equal(G.routeId(m.route), 'E-H-A-G');
  assert.equal(S.midRouteFor(s, 3, 'A-H-E'), null, '고치지 않은 id는 null'); assert.equal(S.midRouteFor(s, 2, 'E-H-A-G'), null, '다른 단계는 null');
  // 동작은 그대로: 다음 단계 계획은 출발할 때 계획(고친 정류장 없음)
  S.nextPhase(s); S.beginPlan(s); assert.ok(s.draft.routes.every((r) => !(r.num === 3 && r.nodes.indexOf('G') >= 0)), '4단계 주황 노선에 산업·일자리 없음(지금 동작 유지)');
});
