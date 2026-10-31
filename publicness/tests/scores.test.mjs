// 2026-10-27 두 점수 — 재정 건전성(잔액 ÷ 기준 예비비) · 이동 수요 충족(완료 ÷ 계획과 무관한 평가 수요)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), Sc = require('../js/scores.js'), D = require('../js/demand.js'), G = require('../js/graph.js');
const { play } = require('../tools/score-review.cjs');
const route = (ns) => ({ nodes: ns, stops: ns.map(() => true) });
function runPhase1(routes, opt = { mode: 'default' }) {
  const s = S.create(cfg, opt); S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  routes.forEach(([ns, ids]) => { const r = S.addRoute(s, route(ns)); ids.forEach((id) => S.assign(s, id, r.num)); });
  S.startRun(s); const h = S.finishRun(s); return { s, h };
}

test('evaluation demand is fixed before planning: same seed and phase give the same denominator for any plan', () => {
  const a = runPhase1([]), b = runPhase1([[['B', 'C', 'A'], [1, 2]]]), c = runPhase1([[['F', 'D'], [1]], [['A', 'G'], [2]]]);
  const base = D.base(cfg, 1, cfg.defaultSeed), returns = base.filter((q) => q.returnTrip).length, extra = D.extra(cfg, 1, a.s.events[0]).length;
  [a, b, c].forEach(({ h }) => assert.equal(h.scores.mobility.N, base.length + returns + extra));
  assert.ok(returns > 0, '기본 1단계에 알려진 왕복이 있다');
  assert.ok(a.h.metrics.N < a.h.scores.mobility.N, '무운행이면 실제로 생긴 요청(옛 분모)은 귀가만큼 작다');
});

test('a failed first trip keeps its known return in the denominator as an unrealized, incomplete trip', () => {
  const { h, s } = runPhase1([]);
  const m = h.scores.mobility, returns = D.base(cfg, 1, cfg.defaultSeed).filter((q) => q.returnTrip).length;
  assert.equal(m.done, 0); assert.equal(m.score, 0);
  assert.equal(m.reasons.parentFailed, returns, '선행 이동 미완료로 진행하지 못한 이동');
  assert.equal(s.current.result.passengers.filter((p) => p.leg === 'return').length, 0, '시뮬레이션에는 생기지 않았다(발생했다고 세지 않음)');
});

test('completion means arrival, counted once per request even if passengers are duplicated', () => {
  const { s, h } = runPhase1([[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]]);
  const ps = s.current.result.passengers, ev = s.events[0];
  const once = Sc.mobility(cfg, 1, s.seed, ev, ps), twice = Sc.mobility(cfg, 1, s.seed, ev, ps.concat(ps));
  assert.deepEqual(twice, once);
  assert.equal(once.done, ps.filter((p) => p.status === 'arrived').length, '도착한 승객만 완료(탑승 중·환승 중은 미완료)');
  assert.ok(h.scores.mobility.done < h.scores.mobility.N);
});

test('no evaluation demand → score is null (not 100)', () => {
  const empty = structuredClone(cfg); empty.demandRows = []; empty.residents = [];
  const m = Sc.mobility(empty, 1, 42, { type: 'none' }, []);
  assert.equal(m.N, 0); assert.equal(m.score, null);
});

test('finance score boundaries: negative, zero, partial, reserve reached, far above reserve, and hold', () => {
  const res = { amount: 100000 };
  assert.deepEqual([Sc.finance(-5000, res, true).score, Sc.finance(-5000, res, true).status], [0, 'negative']);
  assert.deepEqual([Sc.finance(0, res, true).score, Sc.finance(0, res, true).status], [0, 'zero']);
  assert.equal(Sc.finance(50000, res, true).score, 50);
  assert.equal(Sc.finance(99999, res, true).score, 99, '내림 — 기준에 닿기 전에는 100점이 아니다');
  assert.deepEqual([Sc.finance(100000, res, true).score, Sc.finance(100000, res, true).status], [100, 'full']);
  assert.equal(Sc.finance(900000, res, true).score, 100, '더 쌓아도 오르지 않는다');
  const hold = Sc.finance(900000, res, false);
  assert.equal(hold.status, 'hold'); assert.equal(hold.score, null); assert.equal(hold.balance, 900000, '잔액은 그대로 보인다');
});

test('reserve does not shrink when buses rest, and leased buses are not part of it', () => {
  const all = runPhase1([[['B', 'C', 'A'], [1, 2]]]), rest = runPhase1([[['B', 'C', 'A'], [1]]]), none = runPhase1([]);
  const amt = (x) => x.h.scores.finance.reserve.amount;
  assert.equal(amt(all), amt(rest)); assert.equal(amt(all), amt(none));
  const s = S.create(cfg, { mode: 'default' }); S.beginPlan(s); s.draft.routes = []; const r = S.addRoute(s, route(['B', 'A']));
  s.draft.buses.forEach((b) => S.assign(s, b.id, r.num)); const lb = S.lease(s); S.assign(s, lb.id, r.num);
  S.startRun(s); assert.equal(S.finishRun(s).scores.finance.reserve.amount, amt(all), '임차 차량은 기준에 넣지 않는다');
});

test('no service at all → finance on hold every phase and overall; mobility still evaluated', () => {
  const s = S.create(cfg, { mode: 'default' });
  while (s.stage !== 'ending') { S.beginPlan(s); s.draft.buses.forEach((b) => { b.routeNum = null; }); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  s.history.forEach((h) => assert.equal(h.scores.finance.status, 'hold'));
  const o = S.scoresOverall(s);
  assert.equal(o.finance.status, 'hold'); assert.equal(o.mobility.score, 0); assert.ok(o.mobility.N > 0);
  assert.ok(o.finance.balance < 0, '실제 잔액(파산)은 그대로');
});

test('game totals: mobility = Σdone / ΣN (not the mean of phase percents); finance = last balance vs last phase reserve', () => {
  const s = S.create(cfg, { mode: 'default' });
  const plans = [[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]];
  for (let p = 0; p < 2; p++) { S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
    plans.forEach(([ns, ids]) => { const r = S.addRoute(s, route(ns)); ids.forEach((id) => S.assign(s, id, r.num)); }); S.startRun(s); S.finishRun(s); if (p === 0) S.nextPhase(s); }
  const o = S.scoresOverall(s), ms = s.history.map((h) => h.scores.mobility);
  assert.equal(o.mobility.N, ms[0].N + ms[1].N); assert.equal(o.mobility.done, ms[0].done + ms[1].done);
  assert.equal(o.mobility.score, Math.floor(100 * o.mobility.done / o.mobility.N));
  assert.equal(o.finance.balance, S.balance(s)); assert.equal(o.finance.reserve.amount, s.history[1].scores.finance.reserve.amount);
  assert.deepEqual([o.from, o.to, o.total], [1, 2, 5]);
});

test('no double counting from re-finishing or save/restore; old saves are filled only when the recomputed run matches', () => {
  const { s } = runPhase1([[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]]);
  const before = JSON.stringify(S.scoresOverall(s));
  s.stage = 'run'; assert.equal(S.finishRun(s), null, '같은 단계 두 번 정산 안 함'); s.stage = 'result';
  const back = S.restore(S.serialize(s), cfg);
  assert.equal(JSON.stringify(S.scoresOverall(back)), before);
  const old = S.serialize(s); delete old.history[0].scores;
  const re = S.restore(old, cfg);
  assert.equal(re.history[0].scores.recomputed, true);
  const a = Object.assign({}, re.history[0].scores); delete a.recomputed;
  assert.deepEqual(a, s.history[0].scores, '같은 계획·사건이면 같은 점수');
  const bad = S.serialize(s); delete bad.history[0].scores; bad.history[0].metrics.arrived += 1;
  const nr = S.restore(bad, cfg);
  assert.equal(nr.history[0].scores, undefined, '재계산이 기록과 다르면 채우지 않는다');
  assert.deepEqual(S.scoresOverall(nr).missing, [1]);
});

test('suggestions need recorded causes', () => {
  const quiet = { reasons: { full: 0, noLink: 0 }, noLinkPairs: [] };
  assert.deepEqual(Sc.suggestions(cfg, quiet, [{ num: 1, buses: 1, perBus: 20, fulls: 0 }]), [], '원인 없으면 제안 없음');
  const t = Sc.suggestions(cfg, { reasons: { full: 4, noLink: 3 }, noLinkPairs: [{ o: 'F', d: 'D', n: 3 }] },
    [{ num: 1, buses: 2, perBus: 30, fulls: 5 }, { num: 2, buses: 3, perBus: 4, fulls: 0 }, { num: 3, buses: 1, perBus: 40, fulls: 0 }]);
  assert.deepEqual(t.map((x) => x.code), ['full', 'noLink', 'lowUse']);
  assert.equal(t[0].num, 1); assert.equal(t[2].num, 2);
  assert.deepEqual(Sc.suggestions(cfg, { reasons: { full: 0, noLink: 0 }, noLinkPairs: [] }, [{ num: 1, buses: 2, perBus: 30, fulls: 5 }]), [], '만차가 있어도 놓친 이동이 없으면 증차 제안 안 함');
});

test('representative strategies: no-service is never rated, money above the reserve adds nothing, outer gaps stay visible', () => {
  const none = play({ mode: 'default' }, 'none'), center = play({ mode: 'default' }, 'center'), loop = play({ mode: 'default' }, 'loop'), bal = play({ mode: 'default' }, 'balanced');
  assert.equal(none.finance, '보류'); assert.equal(center.finance, 0);
  assert.equal(loop.finance, 100); assert.equal(bal.finance, 100);
  assert.ok(loop.balance > bal.balance, '잔액은 순환이 더 많지만 점수는 같다');
  assert.equal(center.outer.split('/')[0], '0', '중심가 집중은 외곽 0건 완료가 따로 드러난다');
  [none, center, loop, bal].forEach((r) => assert.equal(r.N, none.N, '같은 시나리오면 평가 수요가 같다'));
  const g = play({ mode: 'fixed', seed: 42 }, 'block-first'), d = play({ mode: 'fixed', seed: 42 }, 'balanced');
  assert.equal(g.N, d.N); assert.ok(d.done > g.done && d.mobility >= g.mobility, '첫 이동을 막아도 분모가 줄지 않아 유리해지지 않는다');
});
