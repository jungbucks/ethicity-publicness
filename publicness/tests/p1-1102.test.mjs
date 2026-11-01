// 2026-11-02 P1-2 ‘다음 멈춤까지’가 서는 곳(엔진 쪽): 주요 인물 왕복 완료·오늘 기준 초과만, 일반 사건(만차·대기 10명)은 아님
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), P = require('../js/run-pace.js'), E = require('../js/resident-evaluation.js');
const ROUTES = { 1: [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G', 'E']]] };
function run(routes) {
  const s = S.create(cfg, { mode: 'default' }); S.beginPlan(s);
  routes.forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes; r.stops = nodes.map(() => true); S.autoPlace(s, num); });
  S.startRun(s); return s;
}

test('재현 1단계: 멈춤은 주요 인물 왕복 완료 시각(다음 이동 도착)뿐 — 일반 사건은 멈춤 목록에 없다', () => {
  const s = run(ROUTES[1]), res = s.current.result, stops = P.residentStops(res, cfg);
  assert.ok(stops.length >= 3); assert.ok(stops.every(x => x.kind === 'resident' && (x.what === 'done' || x.what === 'over')));
  const back = res.passengers.filter(p => p.residentId && p.leg === 'return' && p.status === 'arrived');
  assert.deepEqual(stops.filter(x => x.what === 'done').map(x => x.resident + '@' + x.t).sort(), back.map(p => p.residentId + '@' + Math.ceil(p.arriveT)).sort());
  // nextStop에 멈춤 목록을 주면 일반 사건 시각에서는 서지 않는다
  const first = P.nextStop(0, { mode: 'next', notables: stops, checkpoint: null });
  assert.equal(first.t, stops[0].t); assert.equal(first.items[0].kind, 'resident');
});

test('오늘 기준 초과: 한 번 이동의 기다림이 기준을 넘는 순간(판정 함수와 같은 값)', () => {
  const s = run([[1, ['F', 'C', 'B', 'D']]]), res = s.current.result, stops = P.residentStops(res, cfg), max = cfg.service.maxWait;
  const over = res.passengers.filter(p => p.residentId && E.overWait(cfg, p.waitTotal) && p.t + max + 1 < cfg.bus.window);
  over.forEach(p => { const st = stops.find(x => x.what === 'over' && x.resident === p.residentId); assert.ok(st, p.residentId + ' 초과 멈춤'); assert.ok(st.t > p.t + max - 1e-9, '기준을 넘은 뒤'); });
  stops.filter(x => x.what === 'over').forEach(x => assert.ok(res.passengers.some(p => p.residentId === x.resident && E.overWait(cfg, p.waitTotal)), '초과가 아닌 인물에는 멈춤 없음'));
});
