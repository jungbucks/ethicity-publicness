// 2026-10-27 경제 개편 — 지원금(기본+공공서비스 수행분)·실제 주행거리 연료비·하루 근무 운영비·추가 임차·도전 모드 잔액 판정
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), Sim = require('../js/sim.js'), D = require('../js/demand.js'), G = require('../js/graph.js'), Q = require('../js/schedule.js');
const { play } = require('../tools/econ-review.cjs');
const route = (ns) => ({ nodes: ns, stops: ns.map(() => true) });
function planned(opt, routes, phase = 1) {
  // 앞 단계는 수지 0으로 넘긴다(쉬는 버스만으로는 도전 모드 계약이 2단계에서 끝나 원하는 단계까지 못 간다)
  const s = S.create(cfg, opt); while (s.phase < phase) { S.beginPlan(s); S.startRun(s); s.current.metrics.costs = Object.assign({}, s.current.metrics.costs, { total: 0 }); S.finishRun(s); if (!S.nextPhase(s) || s.stage === 'ending') throw new Error('단계 진행 실패'); }
  S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  routes.forEach(([ns, ids, num]) => { const r = S.addRoute(s, route(ns), num); ids.forEach((id) => S.assign(s, id, r.num)); });
  return s;
}
const costs = (s) => S.expectedRun(s).metrics.costs;

test('distance is map geometry (1 coordinate = 1 km), not screen pixels or travel time', () => {
  const g = G.build(cfg, 1), a = cfg.nodes.find((n) => n.id === 'F'), b = cfg.nodes.find((n) => n.id === 'D');
  assert.equal(g.dist('F', 'D'), Math.hypot(a.x - b.x, a.y - b.y));
  const zoomed = structuredClone(cfg); zoomed.map.pixelsPerUnit *= 3; // 화면 배율·시간 환산이 바뀌어도
  assert.equal(G.build(zoomed, 1).dist('F', 'D'), g.dist('F', 'D'), '거리는 그대로');
  assert.notEqual(G.build(zoomed, 1).time('F', 'D'), g.time('F', 'D'));
  assert.equal(G.routeKm(g, route(['F', 'D'])), 2 * g.dist('F', 'D'), '왕복 노선 한 바퀴 = 편도×2');
});

test('fuel counts only driven distance: partial last segment, no dwell, deadhead included', () => {
  const g = G.build(cfg, 1), W = cfg.bus.window, d = g.dist('A', 'B');
  assert.equal(Q.driven(g, [{ from: 'A', to: 'B', t0: W - 1, t1: W + 3 }], W), d * 0.25, '종료 시각에 구간 1/4만 달림');
  assert.equal(Q.driven(g, [{ from: 'A', to: 'B', t0: W + 1, t1: W + 5 }], W), 0, '종료 뒤 구간은 0');
  const tl = Q.timeline(g, cfg, 1, route(['A', 'B']), 0);
  const traversals = tl.segments.reduce((n, x) => n + Math.max(0, Math.min(1, (Math.min(x.t1, W) - x.t0) / (x.t1 - x.t0))), 0);
  assert.ok(Math.abs(tl.km - traversals * d) < 1e-9, '정차(dwell) 시간은 거리에 없다 — 구간 수 × 구간 거리');
  // 긴급 조정으로 다른 노선 시작점까지 빈 차로 가는 거리도 센다
  const s = planned({ mode: 'default' }, [[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]], 3);
  const input = { g: S.graph(s), config: s.config, phase: 3, plan: S.toPlan(s), requests: D.base(s.config, 3, s.seed) };
  const res = Sim.run({ ...input, adjustments: [{ at: 34, busId: 1, route: S.routeByNum(s, 2) }] }), t1 = res.timelines.find((t) => t.busId === 1);
  assert.ok(t1.segments.some((x) => x.deadhead), '공차 이동 구간 있음');
  assert.ok(Math.abs(t1.km - Q.driven(S.graph(s), t1.segments, W)) < 1e-9);
  assert.equal(res.costs.fuel, Math.round(cfg.finance.fuelPerKm * res.timelines.reduce((a, t) => a + t.km, 0)));
});

test('the faster express bus pays the same fuel per km as any bus (speed is no discount)', () => {
  const s = planned({ mode: 'fixed', seed: 42 }, [[['A', 'B'], [1]]], 6);
  S.addRoute(s, route(['A', 'B']), 5); S.assign(s, 7, 5);
  const res = Sim.run({ g: S.graph(s), config: s.config, phase: 6, plan: S.toPlan(s), requests: [] });
  const one = res.timelines.find((t) => t.busId === 1), seven = res.timelines.find((t) => t.busId === 7), d = S.graph(s).dist('A', 'B');
  assert.ok(seven.segments[0].t1 - seven.segments[0].t0 < one.segments[0].t1 - one.segments[0].t0, '7호차가 더 빨리 달린다');
  const fullOne = one.segments.filter((x) => x.t1 <= 120).length, fullSeven = seven.segments.filter((x) => x.t1 <= 120).length;
  assert.ok(fullSeven > fullOne, '같은 시간에 더 많이 달려서');
  for (const t of [one, seven]) { const done = t.segments.filter((x) => x.t1 <= 120).length; assert.ok(t.km >= done * d - 1e-9 && t.km < (done + 1) * d, '구간당 거리는 같다'); }
});

test('operating cost is a full service day per assigned bus: auto-spacing is no longer a discount for long routes', () => {
  const s = planned({ mode: 'default' }, [[['A', 'B', 'C', 'F', 'E', 'D', 'G', 'A'], [1, 2]]]);
  const plan = S.toPlan(s); assert.ok(plan.buses.some((b) => b.offset > 0), '두 번째 버스는 늦게 출발');
  assert.equal(costs(s).op, 2 * cfg.finance.opPerMin * cfg.bus.window);
});

test('service subsidy needs real buses stopping there, pays each published condition separately, and is not passenger-based', () => {
  const drawnOnly = planned({ mode: 'default' }, [[['F', 'D'], []]]);
  let k = costs(drawnOnly);
  for (const id of ['F', 'D']) { const c = k.service.find((x) => x.id === id); assert.deepEqual([c.stops, c.met], [0, false], id + ': 선만 그리면 정차 0번'); }
  assert.equal(k.subsidyService, 0); assert.equal(k.subsidyBase, 2 * cfg.finance.basePerBus, '기본 지원은 그대로');
  const onlyF = planned({ mode: 'default' }, [[['F', 'C'], [1]], [['A', 'G'], [2]]]);
  k = costs(onlyF);
  assert.equal(k.service.find((c) => c.id === 'F').met, true); assert.equal(k.service.find((c) => c.id === 'D').met, false);
  assert.equal(k.subsidyService, cfg.finance.service.amount, '하나를 놓쳐도 나머지는 받는다');
  // 같은 계획에 승객이 하나도 없어도 수행분은 같다
  const res = Sim.run({ g: S.graph(onlyF), config: onlyF.config, phase: 1, plan: S.toPlan(onlyF), requests: [] });
  assert.equal(res.costs.subsidyService, k.subsidyService); assert.equal(res.costs.fare, 0);
  // 복지관 조건은 5단계부터 공개
  assert.ok(!k.service.some((c) => c.id === 'K'));
});

test('lease: one bus for this phase only, fee replaces holding, moving it around never re-charges, auto-returned next phase', () => {
  const s = planned({ mode: 'default' }, [[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]]);
  const before = costs(s);
  assert.equal(S.leaseLimit(s), 2);
  const a = S.lease(s), b = S.lease(s); assert.deepEqual([a.id, b.id], [21, 22]); assert.equal(S.lease(s), null, '단계당 최대 2대');
  assert.equal(s.owned, 2, '기본 제공 대수는 그대로');
  let k = costs(s);
  assert.equal(k.lease, 2 * cfg.finance.lease.fee, '쉬고 있어도 임차료'); assert.equal(k.holding, before.holding, '임차 차량에는 보유비 없음');
  assert.equal(k.subsidyBase, before.subsidyBase, '기본 지원은 기본 제공 차량만'); assert.equal(k.op, before.op, '쉬는 임차 차량은 운영비 0');
  S.assign(s, 21, 1); S.assign(s, 21, 2); S.assign(s, 21, null); S.assign(s, 21, 1);
  k = costs(s); assert.equal(k.lease, 2 * cfg.finance.lease.fee, '배치·이동·회수·재배치에도 임차료는 한 번');
  assert.equal(S.unlease(s, 21), false, '달리는 버스는 바로 반납 안 됨'); assert.ok(S.unlease(s, 22)); assert.equal(costs(s).lease, cfg.finance.lease.fee);
  S.startRun(s); const h = S.finishRun(s); assert.equal(h.metrics.costs.lease, cfg.finance.lease.fee, '정산은 출발한 계획 기준 한 번');
  assert.equal(S.lease(s), null, '운행 뒤에는 임차 불가');
  const back = S.restore(S.serialize(s), cfg); assert.equal(back.history[0].metrics.costs.lease, cfg.finance.lease.fee, '결과 저장본 복구에도 같은 금액');
  S.nextPhase(s); assert.ok(!s.draft.buses.some((x) => x.leased), '다음 단계에 자동 반납'); assert.equal(s.draft.buses.length, 3, '단계 지급 버스만');
  assert.equal(S.leaseLimit(s), 2, '다음 단계에 자동 재임차 없음(다시 고를 수 있음)');
});

test('lease survives save/restore during planning without duplication; challenge dedicated buses keep their rules', () => {
  const s = planned({ mode: 'fixed', seed: 7 }, [[['A', 'B'], [1]]], 6);
  const b = S.lease(s); S.assign(s, b.id, 1);
  const r = S.restore(JSON.parse(JSON.stringify(S.serialize(s))), cfg);
  assert.equal(r.draft.buses.filter((x) => x.leased).length, 1); assert.equal(costs(r).lease, cfg.finance.lease.fee);
  assert.equal(S.canAssign(r, b.id, 6), false, '6번 광역은 여전히 9호차만'); assert.equal(S.canAssign(r, 7, 1), false, '7호차는 5번만');
});

test('challenge: accumulated surplus can carry loss-making service; no-service and center-only cannot win on money', () => {
  const bal = play({ mode: 'fixed', seed: 7 }, 'balanced');
  assert.ok(bal.deficits >= 3, '적자 단계가 3번 이상인데도'); assert.equal(bal.end, 'complete', '모아 둔 흑자로 계약 유지');
  for (const opt of [{ mode: 'default' }, { mode: 'fixed', seed: 42 }]) {
    const none = play(opt, 'none'), balanced = play(opt, 'balanced'), cut = play(opt, 'cut-outer');
    assert.ok(none.balance < 0 && none.end !== 'complete', opt.mode + ': 무운행은 재정적으로도 실패');
    assert.ok(balanced.balance > 0 && balanced.end === 'complete', opt.mode + ': 균형 운영은 재정·서비스를 함께');
    assert.ok(cut.balance < balanced.balance, opt.mode + ': 외곽·병원을 끊는 것이 돈으로도 정답은 아니다');
  }
});

test('one missed condition costs only that condition in that phase (no cascade)', () => {
  const full = planned({ mode: 'default' }, [[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]]);
  const missD = planned({ mode: 'default' }, [[['F', 'C', 'B', 'A'], [1]], [['A', 'G'], [2]]]);
  const a = costs(full), b = costs(missD);
  assert.equal(a.subsidyService - b.subsidyService, cfg.finance.service.amount);
  assert.equal(a.subsidyBase, b.subsidyBase);
});

test('route economy: fares counted once at first boarding (transfers included), route sums + shared lines = phase total', () => {
  const M = require('../js/metrics.js');
  for (const opt of [{ mode: 'default' }, { mode: 'fixed', seed: 42 }]) for (const phase of [1, 3, 5]) {
    const s = planned(opt, phase === 1 ? [[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]] : [[['F', 'C', 'B', 'A'], [1, 2]], [['D', 'A', 'G'], [3]], [['E', 'H', 'A'], [4]]], phase);
    if (phase >= 3) { const b = S.lease(s); S.assign(s, b.id, 2); }
    S.startRun(s); const res = s.current.result, k = res.costs, e = M.routeEconomy(res, S.routesInOrder(s), s.draft.buses, s.config, S.graph(s));
    const sum = (f) => e.rows.reduce((a, r) => a + r[f], 0);
    assert.equal(sum('fare'), k.fare, '운임 합 = 전체(환승 중복 없음)'); assert.equal(sum('op'), k.op); assert.equal(sum('fuel'), k.fuel);
    assert.ok(res.passengers.some((p) => p.boardings > 1), '환승 승객이 있는 경우로 검증');
    assert.equal(sum('profit') + e.common.subsidyBase + e.common.subsidyService - e.common.holding - e.common.lease, k.total, '노선 손익 + 공동 항목 = 회차 수지');
    assert.equal(e.common.lease, phase >= 3 ? cfg.finance.lease.fee : 0);
  }
});
test('route economy follows an emergency move: costs after the move (with deadhead) belong to the new route', () => {
  const M = require('../js/metrics.js');
  const s = planned({ mode: 'default' }, [[['F', 'C', 'B', 'A'], [1, 2]], [['D', 'A', 'G'], [3]]], 3);
  S.startRun(s); assert.ok(S.emergencyDecision(s, 34, 2, 2));
  const res = s.current.result, e = M.routeEconomy(res, S.routesInOrder(s), s.draft.buses, s.config, S.graph(s));
  assert.equal(e.rows.reduce((a, r) => a + r.op, 0), res.costs.op); assert.equal(e.rows.reduce((a, r) => a + r.fuel, 0), res.costs.fuel);
  assert.equal(e.rows.find((r) => r.num === 2).buses, 2, '옮긴 버스가 새 노선에도 잡힌다');
});

test('old saves (single subsidy + time-based move cost, deficit-count era) still load, settle and explain', () => {
  const M = require('../js/metrics.js'), N = require('../js/narrative.js');
  const s = planned({ mode: 'fixed', seed: 7 }, [[['F', 'C', 'B', 'A'], [1]], [['D', 'A', 'G'], [2]]]);
  S.startRun(s); S.finishRun(s); S.nextPhase(s);
  const old = JSON.parse(JSON.stringify(S.serialize(s)));
  old.history[0].metrics.costs = { subsidy: 150000, fare: 90000, holding: 40000, op: 22400, move: 21000, paidUnfinished: 0, total: 156600 };
  delete old.ledger; delete old.negStreak; delete old.deficits; old.draft.buses.forEach((b) => { delete b.leased; });
  const r = S.restore(old, cfg);
  assert.deepEqual([r.ledger[0].income, r.ledger[0].cost, r.ledger[0].total], [240000, 83400, 156600], '예전 항목으로 정산 기록을 다시 만든다');
  assert.equal(r.negStreak, 0); assert.equal(S.balance(r), 156600);
  const p = M.costParts(old.history[0].metrics.costs); assert.equal(p.legacy, true); assert.equal(p.fuel, 21000); assert.equal(p.subsidyBase, 150000);
  const rv = N.financeReview(r.config, r.history); assert.equal(rv.totals.fuel, 21000); assert.ok(rv.costs.every((c) => Number.isFinite(c[2])));
  // 이어서 새 규칙으로 다음 단계를 정산해도 섞이지 않는다
  S.beginPlan(r); S.startRun(r); const h = S.finishRun(r);
  assert.equal(M.costParts(h.metrics.costs).legacy, false); assert.equal(r.ledger.length, 2); assert.equal(S.balance(r), 156600 + h.metrics.costs.total);
});
