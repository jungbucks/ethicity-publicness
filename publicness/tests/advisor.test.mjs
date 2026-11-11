// 모의 AI 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('./planned-fixture.cjs');
const G = require('../js/graph.js');
const Dm = require('../js/demand.js');
const Sim = require('../js/sim.js');
const A = require('../js/advisor.js');

const draftPlan = () => ({ buses: cfg.initialDraft.buses.map((b) => ({ id: b.id, route: cfg.initialDraft.routes[b.routeNum - 1], offset: b.offset })) });
const rev = (phase, extra = {}) => ({
  phase, g: G.build(cfg, phase), requests: Dm.base(cfg, phase, 42), owned: 3, fourthAllowed: phase >= 3,
  prevMetrics: null, prevRouteIds: [], plan: draftPlan(), config: cfg, ...extra
});
const WHITELIST = ['phase', 'g', 'requests', 'owned', 'fourthAllowed', 'fourthMustBeNew', 'prevMetrics', 'prevRouteIds', 'plan', 'config', 'rideRatios', 'allowNodes']; // allowNodes(2026-11-11) = 후보 노선에 쓸 수 있는 정류장(지금 지도에 보이는 곳) — 공개 정보를 좁히기만 한다

test('revealed phase carries only public inputs (AC3)', () => {
  const r3 = A.makeRevealed({ phase: 3, g: G.build(cfg, 3), requests: Dm.base(cfg, 3, 42), owned: 3, fourthAllowed: true, prevMetrics: null, prevRouteIds: [], plan: draftPlan(), config: cfg, seed: 42, events: [1] });
  assert.ok(Object.keys(r3).every((k) => WHITELIST.includes(k)), Object.keys(r3).join());
  assert.equal(r3.requests.length, 180);
  assert.ok(r3.requests.some((q) => q.o === 'I'));
  assert.ok(r3.requests.every((q) => q.kind === 'base'));
  assert.ok(!rev(2).requests.some((q) => q.o === 'I' || q.d === 'I'));
});

test('reach targets', () => {
  assert.deepEqual(A.targets(rev(1)), ['F', 'E']);
  const prev = { zones: { A: { N: 10, rate: 0.9 }, B: { N: 10, rate: 0.2 }, C: { N: 5, rate: 0.5 }, D: { N: 0, rate: null }, H: { N: 4, rate: 0.2 } } };
  const rs = { A: 0.9, B: 0.2, C: 0.5, D: 1, H: 0.2 }; /* 2단계부터는 탑승 기록 비율(rideRatios)이 기준 */
  assert.deepEqual(A.targets(rev(2, { prevMetrics: prev, rideRatios: rs })), ['B', 'H']);
  assert.deepEqual(A.targets(rev(3, { prevMetrics: prev, rideRatios: rs })), ['I', 'B', 'H']);
});

test('candidates bounded, deterministic, include draft and examples', () => {
  for (const goal of ['profit', 'time', 'reach']) {
    const c = A.candidates(rev(1), goal);
    assert.ok(c.length <= 30);
    assert.deepEqual(c, A.candidates(rev(1), goal));
    const ids = c.map(G.routeId);
    assert.equal(new Set(ids).size, ids.length, '중복 없음');
    for (const r of [...cfg.initialDraft.routes, ...cfg.exampleRoutes]) assert.ok(ids.includes(G.routeId(r)), G.routeId(r));
    const g = G.build(cfg, 1);
    assert.ok(c.every((r) => G.validateRoute(g, r).length === 0));
  }
});

test('time goal counts unfinished at 120 (AC18)', () => {
  const r = rev(1);
  const res = Sim.run({ g: r.g, config: cfg, phase: 1, plan: r.plan, requests: r.requests });
  const sc = A.score('time', null, res, []);
  const done = res.passengers.filter((p) => p.status === 'arrived');
  const expected = -(done.reduce((s, p) => s + p.arriveT - p.t, 0) + (res.passengers.length - done.length) * 120);
  assert.equal(sc[0], expected);
  assert.ok(res.passengers.length > done.length, '기본 초안엔 미완료가 있다(F)');
});

test('each goal returns a valid 3-bus plan with expectation', () => {
  const g = G.build(cfg, 1);
  for (const goal of ['profit', 'time', 'reach']) {
    const rec = A.recommendSync(rev(1), goal);
    assert.equal(rec.goal, goal);
    assert.equal(rec.plan.buses.length, 3);
    assert.ok(rec.plan.buses.every((b) => b.route == null || G.validateRoute(g, b.route).length === 0));
    assert.equal(rec.expected.N, 148);
    assert.equal(rec.baseline.N, 148);
    assert.ok(rec.evaluated > 0);
    assert.equal(rec.fourth, null);
  }
});

test('recommendation never worsens the goal score', () => {
  const r = rev(1);
  for (const goal of ['profit', 'time', 'reach']) {
    const rec = A.recommendSync(r, goal);
    const t = A.targets(r);
    const s0 = A.score(goal, rec.baseline, rec._baseSim, t, r.plan), s1 = A.score(goal, rec.expected, rec._sim, t, rec.plan);
    assert.ok(A.compare(s1, s0) >= 0, goal);
  }
});

test('ai repeat does not change inputs (AC10)', () => {
  const r = rev(1);
  const before = JSON.stringify({ req: r.requests, plan: r.plan });
  const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && !Object.isFrozen(v) && deepFreeze(v)); return Object.freeze(o); };
  deepFreeze(r.requests); deepFreeze(r.plan);
  const a = A.recommendSync(r, 'reach'), b = A.recommendSync(r, 'reach');
  assert.deepEqual(a.plan, b.plan);
  assert.equal(JSON.stringify({ req: r.requests, plan: r.plan }), before);
});

test('advisor ignores invalid draft routes (Review Focus 2)', () => {
  const r = rev(1);
  r.plan = { buses: [...draftPlan().buses.slice(0, 2), { id: 3, route: { nodes: ['A'], stops: [true] }, offset: 0 }] };
  const rec = A.recommendSync(r, 'time');
  assert.equal(rec.plan.buses.length, 3);
});

test('fourth bus only as a separate card on a new route (AC4)', () => {
  const r = rev(3, { prevRouteIds: draftPlan().buses.map((b) => G.routeId(b.route)) });
  const t0 = Date.now();
  const rec = A.recommendSync(r, 'reach');
  const ms = Date.now() - t0;
  assert.equal(rec.plan.buses.length, 3);
  assert.ok(rec.fourth);
  assert.equal(rec.fourth.plan.buses.length, 4);
  const b4 = rec.fourth.plan.buses.find((b) => b.id === 4);
  const others = rec.fourth.plan.buses.filter((b) => b.id !== 4 && b.route).map((b) => G.routeId(b.route));
  assert.ok(b4.route);
  assert.ok(!others.includes(G.routeId(b4.route)));
  assert.ok(!r.prevRouteIds.includes(G.routeId(b4.route)));
  assert.equal(rec.fourth.expected.costs.holding, 80000);
  console.log(`  3단계 추천(4호차 포함) ${ms}ms, 평가 ${rec.evaluated}회`);
  assert.ok(ms < 4000, `${ms}ms`);
});

test('async recommend matches sync', async () => {
  const r = rev(1);
  const ticks = [];
  const a = await A.recommend(r, 'profit', (done, total) => ticks.push([done, total]));
  const b = A.recommendSync(r, 'profit');
  assert.deepEqual(a.plan, b.plan);
  assert.ok(ticks.length > 1);
});

// 소외 지역 연결 = 정차 여부 우선(2026-11-10)
const Session = require('../js/session.js');
const realCfg = require('../js/config.js');
const fx = require('./fairness-fixture.cjs');
const planCfg = () => { const s = Session.create(realCfg); Session.beginPlan(s); return s; };
const hasF = (rec) => rec.plan.buses.some((b) => b.route && b.route.nodes.includes('F'));

test('reach: 기록 0건이어도 1단계 제안은 외곽 마을에 정차한다', () => {
  const s = planCfg();
  const rec = A.recommendSync(Session.revealed(s), 'reach');
  assert.ok(hasF(rec));
});
test('time 목표는 기록 0건인 외곽 마을을 고를 이유가 없다(1단계)', () => {
  const s = planCfg();
  const rec = A.recommendSync(Session.revealed(s), 'time');
  assert.ok(!hasF(rec));
});
test('targets: 2단계 F 비율 0이면 F가 맨 앞', () => {
  const s = fx.playTo(realCfg, 1, fx.withoutF);
  Session.nextPhase(s);
  const r = Session.revealed(s);
  assert.equal(r.rideRatios.F, 0);
  const tg = A.targets(r);
  assert.equal(tg[0], 'F');
  assert.ok(tg.length <= 3 && new Set(tg).size === tg.length);
});
test('targets: 비율이 가장 낮은 두 곳(같으면 이름 순) + 비율 0이 아닌 F는 앞에 안 붙는다', () => {
  const g = { has: () => true };
  const rs = { A: 0.9, B: 0.2, C: 0.5, F: 0.4, H: 0.2 };
  assert.deepEqual(A.targets({ phase: 2, g, config: realCfg, rideRatios: rs }), ['B', 'H']);
});
test('score(reach): 정차 비율이 도착률보다 먼저 비교된다', () => {
  const m = { zones: { F: { N: 5, rate: 0 }, E: { N: 5, rate: 0.9 } }, arrived: 1 };
  const route = (nodes) => ({ buses: [{ id: 1, route: { nodes, stops: nodes.map(() => true) } }] });
  const withF1 = A.score('reach', m, null, ['F', 'E'], route(['F', 'E']));
  const noF = A.score('reach', m, null, ['F', 'E'], route(['E', 'B']));
  assert.equal(withF1[0], 1); assert.equal(noF[0], 0.5);
  assert.equal(A.compare(withF1, noF), 1);
  assert.equal(withF1.length, 3);
});
