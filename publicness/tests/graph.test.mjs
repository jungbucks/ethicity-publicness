// 도로 그래프·노선 규칙·난수 검증: node --test publicness/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('./planned-fixture.cjs');
const G = require('../js/graph.js');
const Rng = require('../js/rng.js');

const T = true, F = false;
const g1 = G.build(cfg, 1);
const g3 = G.build(cfg, 3);

test('phase 1 graph hides I', () => {
  assert.equal(g1.has('I'), false);
  assert.equal(g1.time('G', 'I'), null);
  assert.equal(g3.has('I'), true);
  assert.equal(g3.time('G', 'I'), 5);
  assert.equal(g3.time('E', 'I'), 5);
});

test('links are two-way with distance-derived seconds', () => {
  assert.equal(g1.time('A', 'B'), 5);
  assert.equal(g1.time('B', 'A'), 5);
  assert.equal(g1.time('H', 'G'), 5);
  assert.equal(g1.time('B', 'F'), 5);
  assert.equal(g1.time('A', 'C'), 10);
});

test('neighbors sorted', () => {
  assert.deepEqual(G.neighbors(g1, 'A'), ['B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(G.neighbors(g3, 'G'), ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'I']);
});

test('cycle A-B-C is 24 seconds, with B passed 22', () => {
  assert.equal(G.cycleMinutes(g1, { nodes: ['A', 'B', 'C'], stops: [T, T, T] }), 24);
  assert.equal(G.cycleMinutes(g1, { nodes: ['A', 'B', 'C'], stops: [T, F, T] }), 22);
  assert.equal(G.oneWayMinutes(g1, { nodes: ['A', 'B', 'C'], stops: [T, T, T] }), 10);
});

test('validateRoute rejects bad routes (AC5)', () => {
  assert.deepEqual(G.validateRoute(g1, { nodes: ['B', 'A', 'G', 'E'], stops: [T, T, T, T] }), []);
  assert.deepEqual(G.validateRoute(g1, { nodes: ['A', 'C'], stops: [T, T] }), [], '자유 연결');
  assert.ok(G.validateRoute(g1, { nodes: ['A', 'B', 'A'], stops: [T, T, T] }).length > 0, '중복');
  assert.ok(G.validateRoute(g1, { nodes: ['A'], stops: [T] }).length > 0, '1노드');
  assert.ok(G.validateRoute(g1, { nodes: ['A', 'B', 'C'], stops: [F, T, T] }).length > 0, '끝점 통과');
  assert.ok(G.validateRoute(g1, { nodes: ['G', 'I'], stops: [T, T] }).length > 0, '1단계 신도시');
  assert.deepEqual(G.validateRoute(g3, { nodes: ['G', 'I'], stops: [T, T] }), []);
  assert.ok(G.validateRoute(g1, { nodes: ['A', 'B'], stops: [T] }).length > 0, '길이 불일치');
});

test('routeId is canonical over direction', () => {
  const a = G.routeId({ nodes: ['E', 'G', 'A', 'B'], stops: [T, F, T, T] });
  const b = G.routeId({ nodes: ['B', 'A', 'G', 'E'], stops: [T, T, F, T] });
  assert.equal(a, 'B-A-g-E');
  assert.equal(b, 'B-A-g-E');
  assert.notEqual(G.routeId({ nodes: ['B', 'A', 'G', 'E'], stops: [T, T, T, T] }), a);
});

test('shortestPath ties by node id on a controlled graph', () => {
  const g1 = G.build({nodes:cfg.nodes, roads:[{a:'A',b:'B',min:2},{a:'B',b:'C',min:2},{a:'A',b:'D',min:2},{a:'D',b:'C',min:2},{a:'B',b:'F',min:4}]},1);
  const p = G.shortestPath(g1, 'A', 'C');
  assert.equal(p.minutes, 4);
  assert.deepEqual(p.nodes, ['A', 'B', 'C']);
  assert.deepEqual(G.shortestPath(g1, 'A', 'F'), { nodes: ['A', 'B', 'F'], minutes: 6 });
  assert.deepEqual(G.shortestPath(g1, 'A', 'A'), { nodes: ['A'], minutes: 0 });
});

test('rng xorshift32 follows PRD order', () => {
  const ref = (seed, n) => {
    let x = (seed >>> 0) || 1; const out = [];
    for (let k = 0; k < n; k++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out.push(x / 2 ** 32); }
    return out;
  };
  const r = Rng.create(42);
  assert.deepEqual([r.next(), r.next(), r.next()], ref(42, 3));
  assert.equal(Rng.create(0).next(), Rng.create(1).next());
  const u = Rng.create(7).next();
  assert.ok(u >= 0 && u < 1);
});

test('config carries PRD values', () => {
  assert.equal(cfg.bus.capacity, 12);
  assert.equal(cfg.bus.window, 120);
  assert.deepEqual(cfg.bus.offsets, [0]);
  assert.deepEqual([cfg.finance.basePerBus, cfg.finance.holding, cfg.finance.fuelPerKm, cfg.finance.service.amount, cfg.finance.service.minStops], [10000, 20000, 150, 20000, 6]);
  assert.equal(cfg.defaultSeed, 42);
  assert.equal(cfg.nodes.length, 9);
  assert.equal(cfg.roads.length, 13);
  assert.equal(cfg.demandRows.length, 11);
});
