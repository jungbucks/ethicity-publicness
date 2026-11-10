// 어르신 무임 엔진 — 표시·정책 적용·운임 0원
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), Demand = require('../js/demand.js'), Elder = require('../js/elder.js'), Graph = require('../js/graph.js'), Sim = require('../js/sim.js'), Metrics = require('../js/metrics.js'), Session = require('../js/session.js');
const allStop = (ns) => ({ nodes: ns, stops: ns.map(() => true) });

test('elder 표시: 대상 구역·일반 요청만, 같은 seed면 같은 결과', () => {
  const q = Demand.base(cfg, 1, 42), e = q.filter(r => r.elder);
  assert.ok(e.length > 0);
  assert.ok(e.every(r => ['F','D','K'].includes(r.o) || ['F','D','K'].includes(r.d)));
  assert.ok(e.every(r => !r.residentId && !r.familyId));
  assert.deepEqual(Demand.base(cfg, 1, 42).filter(r => r.elder).map(r => r.key), e.map(r => r.key));
  const pool = q.filter(r => !r.residentId && !r.familyId && (['F','D'].includes(r.o) || ['F','D'].includes(r.d)));
  assert.ok(Math.abs(e.length / pool.length - 0.4) < 0.12, '약 40%');
});
test('ride keep: elder는 free, stayed 없음 · abolish는 4단계부터 일부 stayed, 남은 elder 유료', () => {
  const q = Demand.base(cfg, 4, 42);
  const keep = Elder.ride(cfg, 4, q, 'keep');
  assert.equal(keep.stayed.length, 0); assert.ok(keep.ride.filter(r => r.elder).every(r => r.free === true));
  const ab = Elder.ride(cfg, 4, q, 'abolish'), n = q.filter(r => r.elder).length;
  assert.ok(ab.stayed.length > 0 && ab.stayed.length < n);
  assert.equal(ab.ride.length, q.length - ab.stayed.length);
  assert.ok(ab.ride.every(r => !r.free));
  assert.equal(Elder.ride(cfg, 3, q, 'abolish').stayed.length, 0, '정책 단계 전에는 폐지가 적용되지 않음');
  assert.ok(!q.some(r => 'free' in r), '입력 배열은 그대로');
});
test('운임: 무임 승객은 0원, freeRiders에 셈', () => {
  const g = Graph.build(cfg, 1), plan = { buses: [{ id: 1, route: allStop(['F','C','D','A']), offset: 0 }, { id: 2, route: allStop(['B','A','G','E']), offset: 0 }] };
  const req = Elder.ride(cfg, 1, Demand.base(cfg, 1, 42), 'keep').ride;
  const res = Sim.run({ g, config: cfg, phase: 1, plan, requests: req });
  const first = res.passengers.filter(p => p.firstBoardT != null), free = first.filter(p => p.free).length;
  assert.ok(free > 0); assert.equal(res.costs.freeRiders, free);
  assert.equal(res.costs.fare, cfg.finance.fare * (first.length - free));
  const routes = plan.buses.map((b, i) => Object.assign({ num: i + 1 }, b.route));
  const buses = plan.buses.map((b, i) => ({ id: b.id, routeNum: i + 1 }));
  const rows = Metrics.routeEconomy(res, routes, buses, cfg, g).rows;
  assert.equal(rows.reduce((a, r) => a + r.fare, 0), res.costs.fare, '노선별 운임 합 = 정산 운임');
});
test('랜덤 8단계: 5단계부터 복지관 K도 대상', () => {
  const s = Session.create(cfg, { mode: 'fixed', seed: 7 });
  assert.ok(Demand.base(s.config, 5, s.seed).some(r => r.elder && (r.o === 'K' || r.d === 'K')));
});
test('Sim.judgePetition 내보냄', () => { assert.equal(typeof Sim.judgePetition, 'function'); });
test('해시 독립성: hash(key,1)과 hash(key,2) 상관 약함, 어르신 대상 중 안 타는 비율 약 50%', () => {
  const q = Demand.base(cfg, 4, 42), n = q.length;
  const a = q.map(r => Demand.hash(r.key, 1)), b = q.map(r => Demand.hash(r.key, 2));
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  assert.ok(Math.abs(sab / Math.sqrt(saa * sbb)) < 0.1, '피어슨 상관 |r| < 0.1');
  const s7 = Session.create(cfg, { mode: 'fixed', seed: 7 });
  const el = Demand.base(cfg, 4, 42).concat(Demand.base(s7.config, 6, s7.seed)).filter(r => r.elder);
  assert.ok(el.length >= 20, '표본 ' + el.length);
  const stay = el.filter(r => Demand.hash(r.key, 2) < 0.5).length / el.length;
  assert.ok(Math.abs(stay - 0.5) < 0.2, '어르신 대상 중 hash2<0.5 비율 ' + stay);
});
