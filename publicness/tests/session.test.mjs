// 세션(5단계 흐름·신도시·4호차·세팅) 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('./planned-fixture.cjs');
const G = require('../js/graph.js');
const Dm = require('../js/demand.js');
const A = require('../js/advisor.js');
const S = require('../js/session.js');

const R = (s) => { const p = s.split('-'); return { nodes: p.map((x) => x.toUpperCase()), stops: p.map((x) => x === x.toUpperCase()) }; };
function playPhase(s) { S.beginPlan(s); assert.ok(S.startRun(s)); S.finishRun(s); S.nextPhase(s); }

test('five phases always reachable, even with no buses running (AC1)', () => {
  const s = S.create(cfg, { mode: 'default' });
  for (let p = 1; p <= 5; p++) { assert.equal(s.phase, p); playPhase(s); }
  assert.equal(s.stage, 'ending');
  assert.equal(s.history.length, 5);

  const idle = S.create(cfg, { mode: 'default' });
  for (let p = 1; p <= 5; p++) {
    S.beginPlan(idle);
    idle.draft.buses.forEach((b) => S.assign(idle, b.id, null));
    assert.ok(S.startRun(idle)); S.finishRun(idle); S.nextPhase(idle);
  }
  assert.equal(idle.stage, 'ending');
  assert.ok(idle.history.every((h) => h.metrics.costs.total < 150000));
});

test('new town revealed only from phase 3 (AC2)', () => {
  const s = S.create(cfg, { mode: 'default' });
  assert.ok(!S.visibleNodeIds(s).includes('I'));
  assert.ok(!('I' in s.trust));
  playPhase(s);
  assert.ok(!S.visibleNodeIds(s).includes('I'));
  playPhase(s);
  assert.equal(s.phase, 3);
  assert.ok(S.visibleNodeIds(s).includes('I'));
  assert.equal(s.trust.I, 50);
  assert.ok(s.history.every((h) => !('I' in h.trustAfter) && !('I' in h.metrics.zones)));
});

test('fourth bus rules (AC4)', () => {
  const s = S.create(cfg, { mode: 'default' });
  S.beginPlan(s);
  assert.equal(S.introduceFourth(s), false);
  playPhase(s); playPhase(s);
  S.beginPlan(s);
  assert.equal(S.introduceFourth(s), true);
  assert.equal(s.owned, 4);
  assert.equal(S.introduceFourth(s), false, '두 번 도입 불가');
  assert.ok(S.validate(s).some((e) => e.includes('4호차')), '미배정 4호차');
  S.assign(s, 4, 1); // 기존 노선
  assert.ok(S.validate(s).some((e) => e.includes('4호차')));
  const nr = S.addRoute(s, R('I-G-A'));
  S.assign(s, 4, nr.num);
  assert.deepEqual(S.validate(s), []);
  S.startRun(s); S.finishRun(s);
  assert.equal(s.history[2].metrics.costs.holding, 80000);
  S.nextPhase(s); S.beginPlan(s);
  S.assign(s, 4, 1);
  assert.deepEqual(S.validate(s), [], '도입 다음 단계부터 자유 재배정');
  S.startRun(s); S.finishRun(s);
  assert.equal(s.history[3].metrics.costs.holding, 80000);
});

test('events fixed per session and setting (AC10)', () => {
  const a = S.create(cfg, { mode: 'default' }), b = S.create(cfg, { mode: 'default' });
  assert.equal(a.seed, 42);
  assert.deepEqual(a.events, b.events);
  const before = JSON.stringify(a.events);
  S.beginPlan(a);
  for (const goal of ['profit', 'time', 'reach']) { S.chooseGoal(a, goal); A.recommendSync(S.revealed(a), goal); }
  assert.equal(JSON.stringify(a.events), before);
  const r = S.create(cfg, { mode: 'random', rand: () => 0.5 });
  assert.equal(r.seed, 2147483648);
  assert.equal(r.mode, 'random');
  assert.deepEqual(r.events, Dm.drawEvents(cfg, 2147483648));
  assert.equal(S.create(cfg, { mode: 'fixed', seed: 7 }).seed, 7);
});

test('seed sanitizing (Review Focus 3)', () => {
  assert.deepEqual(S.parseSeedParam(null), { seed: 42, mode: 'default', note: null });
  const bad = S.parseSeedParam('abc');
  assert.equal(bad.mode, 'default'); assert.equal(bad.seed, 42); assert.ok(bad.note);
  assert.deepEqual(S.parseSeedParam('-5'), { seed: 4294967291, mode: 'fixed', note: null });
  assert.deepEqual(S.parseSeedParam('0'), { seed: 0, mode: 'fixed', note: null });
  assert.deepEqual(S.parseSeedParam('99999999999'), { seed: 99999999999 % 4294967296, mode: 'fixed', note: null });
  assert.equal(S.parseSeedParam('1.5').mode, 'default');
});

test('deleting assigned route unassigns buses (Review Focus 1)', () => {
  const s = S.create(cfg, { mode: 'default' });
  S.beginPlan(s);
  S.assign(s, 2, 1);
  const out = S.deleteRoute(s, 1);
  assert.deepEqual(out.unassigned, [1, 2]);
  assert.equal(s.draft.buses.find((b) => b.id === 1).routeNum, null);
  assert.ok(!s.draft.routes.some((r) => r.num === 1));
  assert.ok(S.startRun(s));
});

test('startRun guard against double start (Review Focus 4)', () => {
  const s = S.create(cfg, { mode: 'default' });
  S.beginPlan(s);
  assert.ok(S.startRun(s));
  assert.equal(S.startRun(s), null);
  S.finishRun(s);
  S.finishRun(s);
  assert.equal(s.history.length, 1);
});

test('plan is an immutable snapshot after start', () => {
  const s = S.create(cfg, { mode: 'default' });
  S.beginPlan(s);
  S.startRun(s);
  const snap = JSON.stringify(s.current.plan);
  s.draft.routes[0].nodes.push('Z');
  S.setOffset(s, 1, 12);
  assert.equal(JSON.stringify(s.current.plan), snap);
});

test('invalid assigned route blocks start with a fixable message', () => {
  const s = S.create(cfg, { mode: 'default' });
  S.beginPlan(s);
  const r = S.addRoute(s, { nodes: ['A'], stops: [true] });
  S.assign(s, 1, r.num);
  assert.ok(S.validate(s).length > 0);
  assert.equal(S.startRun(s), null);
});

test('apply recommendation copies the 3-bus plan and keeps fourth manual', () => {
  const s = S.create(cfg, { mode: 'default' });
  playPhase(s); playPhase(s);
  S.beginPlan(s);
  S.chooseGoal(s, 'reach');
  const rec = A.recommendSync(S.revealed(s), 'reach');
  S.applyRecommendation(s, rec);
  assert.equal(s.owned, 3);
  const plan = S.toPlan(s);
  assert.deepEqual(plan.buses.map((b) => b.route && G.routeId(b.route)), rec.plan.buses.map((b) => b.route && G.routeId(b.route)));
  assert.deepEqual(s.goalHistory.at(-1), { phase: 3, goal: 'reach', action: 'accept' });
  assert.ok(rec.fourth);
  assert.equal(S.applyFourth(s, rec), true);
  assert.equal(s.owned, 4);
  assert.deepEqual(S.validate(s), []);
});

test('residents tracked from their i=0 request; sol from phase 3', () => {
  const s = S.create(cfg, { mode: 'default' });
  playPhase(s);
  const h = s.history[0];
  assert.ok(h.residents.haneul && h.residents.narae && h.residents.jun);
  assert.equal(h.residents.sol, null);
  assert.equal(h.residents.narae.status, 'waiting', '기본 초안은 F를 지나지 않는다');
  playPhase(s); playPhase(s);
  assert.ok(s.history[2].residents.sol);
});

test('ending summary has zone subtitles, finance and goal history', () => {
  const s = S.create(cfg, { mode: 'default' });
  for (let p = 1; p <= 5; p++) { S.beginPlan(s); S.chooseGoal(s, 'time'); S.markGoalAction(s, 'reject'); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  const e = S.endingSummary(s);
  assert.deepEqual(Object.keys(e.zones).sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
  assert.equal(e.zones.I.history.filter((x) => x.N > 0).length, 3);
  assert.equal(e.finance.perPhase.length, 5);
  assert.equal(e.finance.balance, e.finance.perPhase.reduce((a, c) => a + c.total, 0));
  assert.equal(e.goalHistory.length, 5);
  assert.equal(e.seed, 42);
  assert.equal(e.residents.haneul.length, 5);
  assert.equal(e.residents.sol.filter(Boolean).length, 3);
});

test('AI after introducing the fourth bus recommends a startable plan (final review I1)', () => {
  const s = S.create(cfg, { mode: 'default' });
  playPhase(s); playPhase(s);
  S.beginPlan(s);
  S.introduceFourth(s);
  for (const goal of ['profit', 'time', 'reach']) {
    S.chooseGoal(s, goal);
    const rec = A.recommendSync(S.revealed(s), goal);
    assert.equal(rec.plan.buses.length, 4);
    S.applyRecommendation(s, rec);
    assert.deepEqual(S.validate(s), [], goal);
  }
});

test('fourth-bus button changes only bus 4 (final review I2)', () => {
  const s = S.create(cfg, { mode: 'default' });
  playPhase(s); playPhase(s);
  S.beginPlan(s);
  S.chooseGoal(s, 'reach');
  const rec = A.recommendSync(S.revealed(s), 'reach');
  S.markGoalAction(s, 'reject');
  const before = JSON.stringify(s.draft.buses.slice(0, 3));
  assert.equal(S.applyFourth(s, rec), true);
  assert.equal(JSON.stringify(s.draft.buses.slice(0, 3)), before, '1~3호차 그대로');
  const b4 = s.draft.buses.find((b) => b.id === 4);
  assert.equal(G.routeId(S.routeByNum(s, b4.routeNum)), G.routeId(rec.fourth.plan.buses.find((b) => b.id === 4).route));
  assert.equal(s.goalHistory.at(-1).action, 'reject');
});
