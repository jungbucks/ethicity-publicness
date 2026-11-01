// 2026-11-02 P0 수정(엔진 쪽): 인물 대기 판정 한 곳(P0-3) · 긴급 조정 영향 예상(P0-2)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), E = require('../js/resident-evaluation.js');
const ROUTES = { 1: [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G', 'E']]], 2: [[3, ['E', 'H', 'B', 'A']]], 3: [[4, ['I', 'A']]] };
function play(upto) {
  const s = S.create(cfg, { mode: 'default' });
  const add = p => (ROUTES[p] || []).forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
  for (let p = 1; p <= upto; p++) { S.beginPlan(s); add(p); if (p < upto) { S.startRun(s); S.finishRun(s); S.nextPhase(s); } }
  return s;
}

test('대기 기준: 4시간 3분과 같으면 통과, 넘으면 실패(">" 한 곳)', () => {
  const max = cfg.service.maxWait;
  assert.equal(E.overWait(cfg, max), false); assert.equal(E.overWait(cfg, max + 1), true); assert.equal(E.overWait({ service: null }, 999), false);
  const ps = [{ residentId: 'x', leg: 'outbound', waitTotal: 5 }, { residentId: 'x', leg: 'return', waitTotal: 9 }, { residentId: 'y', leg: 'outbound', waitTotal: 30 }];
  assert.deepEqual(E.legWaits(ps, 'x'), { out: 5, back: 9, longest: 9 }); assert.deepEqual(E.legWaits(ps, 'z'), { out: null, back: null, longest: 0 });
});

test('재현 1단계: 기록의 가장 긴 대기 = 두 이동 중 긴 쪽, 만족 판정·학기 누적이 그 값을 따른다', () => {
  const s = play(1); S.startRun(s); S.finishRun(s);
  const h = s.history[0], ps = s.current.result.passengers;
  ['haneul', 'narae', 'jun'].forEach(id => {
    const r = h.residents[id], w = E.legWaits(ps, id);
    assert.equal(r.longestWait, w.longest); assert.ok(r.waitTotal >= r.longestWait, '하루 합 ≥ 가장 긴 대기(다른 지표)');
    if (r.dayStatus === 'complete') assert.equal(r.satisfied, !E.overWait(cfg, r.longestWait), id + ' 판정 = 가장 긴 대기 기준');
  });
  // 하늘: 하루 합은 기준을 넘지만(4시간 30분) 한 번 이동의 가장 긴 대기는 기준과 같아(4시간 3분) 통과 — 같은 값 비교라 화면마다 어긋나지 않는다
  assert.equal(h.residents.haneul.longestWait, cfg.service.maxWait); assert.ok(h.residents.haneul.waitTotal > cfg.service.maxWait); assert.equal(h.residents.haneul.satisfied, true);
});

test('긴급 조정 영향 예상: 노선의 유일한 버스를 옮기면 하루 도착 예상이 준다(결과는 바뀌지 않음)', () => {
  const s = play(3); S.startRun(s);
  const at = S.EMERGENCY_AT[0], before = JSON.stringify(s.current.result.passengers.length);
  const r = S.emergencyImpact(s, at, 2, 1);
  assert.ok(r.after.arrived < r.before.arrived, `도착 ${r.before.arrived} → ${r.after.arrived}`); assert.ok(r.before.total >= 3);
  assert.equal(JSON.stringify(s.current.result.passengers.length), before); assert.equal((s.emergencyLog || []).length, 0, '미리 보기만');
  const again = S.emergencyImpact(s, at, 2, 1, r.before); assert.deepEqual(again, r, 'base를 넘겨도 같은 값');
});
