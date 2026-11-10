// 정류장 1명당 운임 — 첫 탑승 정류장 기준, 3분위
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Metrics = require('../js/metrics.js'), fx = require('./fairness-fixture.cjs'), S = require('../js/session.js');
/* rows = [[정류장, 1명당 운임(1000 유료 1명 · 0 무임 1명 · 500 유료+무임 각 1명)], ...] */
function fakeResult(rows) {
  const passengers = [], log = [], add = (stop, free) => { const i = passengers.length; passengers.push({ id: i, o: stop, firstBoardT: 10, free }); log.push({ t: 10, type: 'board', pid: i, bus: 1, node: stop }); };
  rows.forEach(([stop, fare]) => { if (fare === 500) { add(stop, false); add(stop, true); } else add(stop, fare === 0); });
  return { passengers, log, costs: { fare: 0 } };
}
test('stopFares: 첫 탑승 정류장 기준, 무임 0원, 합계 = 정산 운임', () => {
  const s = fx.playTo(null, 4, fx.withF), res = s.current.result;
  const sf = Metrics.stopFares(res), sum = Object.values(sf).reduce((a, x) => a + x.fare, 0);
  assert.equal(sum, res.costs.fare);
  assert.equal(Object.values(sf).reduce((a, x) => a + x.free, 0), res.costs.freeRiders);
  assert.ok(Object.values(sf).reduce((a, x) => a + x.riders, 0) > 0);
});
test('tier: 3분위, 모두 같으면 mid, 탑승 0이면 null', () => {
  const fake = (rows) => Metrics.stopFares(fakeResult(rows));
  assert.deepEqual(Object.values(fake([['A', 1000], ['B', 1000], ['C', 1000]])).map(x => x.tier), ['mid', 'mid', 'mid']);
  /* 정류장당 승객 1명씩: A 1000 · B 500 · C 0 · D 1000 · E 0 · F 500 -> 위 1/3 A·D, 아래 1/3 C·E */
  const t = fake([['A', 1000], ['B', 500], ['C', 0], ['D', 1000], ['E', 0], ['F', 500]]);
  assert.equal(t.A.tier, 'hi'); assert.equal(t.D.tier, 'hi'); assert.equal(t.C.tier, 'lo'); assert.equal(t.E.tier, 'lo'); assert.equal(t.B.tier, 'mid');
  assert.deepEqual(Metrics.stopFares({ passengers: [], log: [], costs: {} }), {});
  const nobody = Metrics.stopFares({ passengers: [{ id: 1, o: 'A', firstBoardT: null }], log: [], costs: {} });
  assert.equal(nobody.A.riders, 0); assert.equal(nobody.A.tier, null); assert.equal(nobody.A.perRider, 0);
});
test('tier: 정류장이 하나·둘이어도 무너지지 않음', () => {
  const one = Metrics.stopFares(fakeResult([['A', 0], ['A', 0]]));
  assert.equal(one.A.tier, 'mid');
  const two = Metrics.stopFares(fakeResult([['A', 1000], ['B', 0]]));
  assert.equal(two.A.tier, 'hi'); assert.equal(two.B.tier, 'lo');
});
test('첫 탑승 로그가 없으면 p.o, 환승 재탑승은 세지 않음', () => {
  const r = { passengers: [{ id: 1, o: 'A', firstBoardT: 5, free: false }], log: [{ t: 5, type: 'board', pid: 1, node: 'B' }, { t: 9, type: 'board', pid: 1, node: 'C' }], costs: {} };
  assert.deepEqual(Object.keys(Metrics.stopFares(r)).filter(k => Metrics.stopFares(r)[k].riders), ['B']);
  const r2 = { passengers: [{ id: 1, o: 'A', firstBoardT: 5, free: false }], log: [], costs: {} };
  assert.equal(Metrics.stopFares(r2).A.riders, 1);
});
