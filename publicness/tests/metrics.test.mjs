// 지표·불만·신뢰·결말 소제목 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('./planned-fixture.cjs');
const G = require('../js/graph.js');
const Sim = require('../js/sim.js');
const M = require('../js/metrics.js');

const g1 = G.build(cfg, 1);
const R = (s) => { const p = s.split('-'); return { nodes: p.map((x) => x.toUpperCase()), stops: p.map((x) => x === x.toUpperCase()) }; };
const plan = (...bs) => ({ buses: bs.map((b, i) => ({ id: i + 1, route: b[0] ? R(b[0]) : null, offset: b[1] || 0 })) });
let nid = 1;
const req = (o, d, t) => ({ id: nid, key: 'X' + nid++, o, d, t, kind: 'base', row: 0, i: 0 });
const sum = (p, reqs) => M.summarize(Sim.run({ g: g1, config: cfg, phase: 1, plan: p, requests: reqs }), g1, p, cfg);

test('essential link rate differs from arrive rate (AC17)', () => {
  const p = plan(['A-B-C', 0]);
  const m = sum(p, [req('A', 'C', 0), req('A', 'C', 118)]);
  assert.equal(m.essential.N, 2);
  assert.equal(m.essential.linkRate, 1);
  assert.equal(m.essential.arriveRate, 0.5);
  const m2 = sum(p, [req('A', 'B', 0)]);
  assert.equal(m2.essential.N, 0);
  assert.equal(m2.essential.linkRate, null);
  assert.equal(m2.essential.arriveRate, null);
});

test('zone without requests shows 요청 없음', () => {
  const m = sum(plan(['A-B', 0]), [req('A', 'B', 0)]);
  assert.equal(m.zones.H.N, 0);
  assert.equal(m.zones.H.rate, null);
  assert.equal(m.zones.H.D, null);
  assert.equal(M.fmtRate(null), '요청 없음');
  assert.equal(M.fmtRate(0.456), '46%');
  assert.ok(!('I' in m.zones), '1단계에는 신도시 생활권이 없다');
});

test('discontent formula (AC20)', () => {
  assert.equal(M.discontent({ N: 10, arrived: 6, waitOver: 5, tripOver: 2 }, cfg), 39);
  assert.equal(M.discontent({ N: 0, arrived: 0, waitOver: 0, tripOver: 0 }, cfg), null);
});

test('trust update (AC20)', () => {
  assert.equal(M.nextTrust(50, 39, cfg), 53.3);
  assert.equal(M.nextTrust(53.3, null, cfg), 53.3);
});

test('subtitle kinds', () => {
  const h = (rates, maxWait = 10) => rates.map((r, k) => ({ phase: k + 1, rate: r, maxWait, N: 10 }));
  assert.equal(M.subtitle(h([0.5, 0.6, 0.7, 0.85, 0.9]), cfg).kind, 'stable');
  assert.equal(M.subtitle(h([0.5, 0.6, 0.7, 0.85, 0.9], 25), cfg).kind, 'improving');
  assert.equal(M.subtitle(h([0.5, 0.55, 0.6, 0.62, 0.7]), cfg).kind, 'improving');
  assert.equal(M.subtitle(h([0.5, 0.5, 0.5, 0.55, 0.6]), cfg).kind, 'remaining');
  const sol = [{ phase: 1, rate: null, maxWait: 0, N: 0 }, { phase: 2, rate: null, maxWait: 0, N: 0 },
    { phase: 3, rate: 0.2, maxWait: 30, N: 16 }, { phase: 4, rate: 0.3, maxWait: 30, N: 16 }, { phase: 5, rate: 0.4, maxWait: 30, N: 16 }];
  const s = M.subtitle(sol, cfg);
  assert.deepEqual([s.kind, s.firstPhase, s.lastPhase], ['improving', 3, 5]);
  assert.equal(M.subtitle([{ phase: 1, rate: 1, maxWait: 0, N: 5 }], cfg).kind, 'remaining', '관측 한 번은 변화를 말하지 않음');
});

test('overall rate is sum-based, not zone average', () => {
  const m = sum(plan(['A-B', 0]), [req('A', 'B', 0), req('B', 'F', 0), req('B', 'F', 0), req('B', 'F', 0)]);
  assert.equal(m.arrivalRate, 0.25);
  assert.equal(m.zones.A.rate, 1);
  assert.equal(m.zones.B.rate, 0);
  assert.equal(m.N, 4);
  assert.equal(m.users, 1);
  assert.equal(m.arrived + m.waiting + m.transfer + m.riding, m.N);
});

test('travel averages kept separate; no-route requests are not counted as waiting', () => {
  const m = sum(plan(['A-B', 0]), [req('A', 'B', 0), req('F', 'E', 20)]);
  assert.equal(m.travel.doneAvg, 6);
  assert.equal(m.travel.openAvg, 100);
  assert.equal(m.maxWait, 0); // 탄 사람의 최장 대기만
  assert.equal(m.noLink, 1); assert.equal(m.zones.F.noLink, 1);
  assert.deepEqual(m.notBoarded, { count: 0, longest: 0 });
  assert.deepEqual(m.requests, { planned: 2, followUps: 0, extra: 0 });
  assert.equal(m.zones.F.waitOver, 0);
  assert.equal(m.zones.F.tripOver, 1);
});
