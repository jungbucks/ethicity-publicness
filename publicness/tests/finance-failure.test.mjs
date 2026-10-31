// 2026-10-23 모드별 재정 실패·재시도 — 판정 로직은 회차 수지를 지정한 시험용 상태로 검증한다(경제 수치는 그대로)
// 기본: 끝까지 진행 → 학기 말 잔액 < 0이면 파산 / 랜덤(도전, 2026-10-27 개편): 누적 잔액 < 0인 정산이 2번 연속이면 운영 계약 종료.
// 회차 적자(수지 < 0)는 경고·분석용으로 세기만 한다(예전 ‘적자 3회’ 규칙은 흑자가 쌓여 있어도 끝냈다)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), N = require('../js/narrative.js');
const route = (ns) => ({ nodes: ns, stops: ns.map(() => true) });

// 한 단계를 실제로 운행하되, 정산 직전에 회차 수지만 시험값으로 바꾼다
function phase(s, total) {
  S.beginPlan(s); S.startRun(s);
  if (total != null) s.current.metrics.costs = Object.assign({}, s.current.metrics.costs, { total });
  return S.finishRun(s);
}
function season(opt, totals) {
  const s = S.create(cfg, opt), stages = [];
  for (const t of totals) { phase(s, t); stages.push(s.end ? s.end.cause : null); S.nextPhase(s); if (s.stage === 'ending') break; }
  return { s, stages };
}

test('default mode: keeps going below zero, judges only the final balance (−1 → bankrupt, 0 → normal ending, recovery → normal)', () => {
  const neg = season({ mode: 'default' }, [-100, -100, -100, -100, -100]);
  assert.equal(neg.s.history.length, 5, '중간 마이너스여도 5단계까지 진행');
  assert.deepEqual(neg.stages.slice(0, 4), [null, null, null, null], '중간에는 종료 상태가 없다');
  assert.equal(neg.s.stage, 'ending'); assert.equal(neg.s.end.cause, 'bankrupt'); assert.equal(neg.s.end.balance, -500);
  assert.equal(neg.s.deficits, 5, '적자 횟수는 기록만'); assert.equal(neg.s.end.cause, 'bankrupt', '기본 모드는 적자 횟수·연속 마이너스로 중간에 끝내지 않는다');
  const zero = season({ mode: 'default' }, [-100, 0, 0, 0, 100]);
  assert.equal(zero.s.end.cause, 'complete', '최종 잔액 정확히 0원은 파산이 아니다');
  const recover = season({ mode: 'default' }, [-100000, -50000, 200000, 0, 0]);
  assert.equal(recover.s.end.cause, 'complete', '중간 적자 후 회복하면 파산 아님');
  const minus1 = season({ mode: 'default' }, [0, 0, 0, 0, -1]);
  assert.equal(minus1.s.end.cause, 'bankrupt');
  // 잔액이 낮으면 ‘학기 말에 평가’ 안내
  const s = S.create(cfg); phase(s, 10000);
  assert.equal(S.financeStatus(s).low, true); assert.equal(S.financeStatus(s).rule, 'final-balance');
});

test('random mode: deficits are warnings; surplus keeps loss-making service going; two negative balances in a row end the contract', () => {
  for (const opt of [{ mode: 'fixed', seed: 7 }, { mode: 'random', seed: 12345 }]) {
    const s = S.create(cfg, opt);
    phase(s, -1); assert.equal(s.deficits, 1); assert.equal(s.negStreak, 1); assert.equal(s.end, null, '잔액 마이너스 1번째는 경고'); S.nextPhase(s);
    phase(s, 500000); assert.equal(s.negStreak, 0, '잔액이 0원 이상이면 연속 횟수 초기화'); S.nextPhase(s);
    phase(s, -1); S.nextPhase(s); phase(s, -1); S.nextPhase(s); phase(s, -1);
    assert.equal(s.deficits, 4); assert.equal(s.end, null, '모은 흑자로 적자 단계를 버티면 계약 유지(예전 규칙은 3회째 종료)'); S.nextPhase(s);
    phase(s, -600000); assert.equal(s.end, null, '잔액이 처음 마이너스가 된 단계는 경고만'); S.nextPhase(s);
    phase(s, -1);
    assert.equal(s.stage, 'result', '종료 단계의 운행·정산 결과를 먼저 보여 준다');
    assert.deepEqual(s.end, { cause: 'contract', phase: 7, balance: -100005 });
    assert.deepEqual(S.financeStatus(s).deficitPhases, [1, 3, 4, 5, 6, 7]);
    assert.ok(S.nextPhase(s)); assert.equal(s.stage, 'ending'); assert.equal(s.phase, 7, '다음 단계로 넘어가지 않는다');
    S.startRun(s); assert.equal(s.stage, 'ending', '종료 뒤에는 출발하지 않는다'); assert.equal(s.history.length, 7);
  }
});

test('random mode: exactly 0 is not a deficit; fewer than 3 deficits reaches the normal ending; −0.4 counts (judged before rounding)', () => {
  const zero = season({ mode: 'fixed', seed: 7 }, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(zero.s.deficits, 0); assert.equal(zero.s.end.cause, 'complete'); assert.equal(zero.s.history.length, 8);
  const two = season({ mode: 'fixed', seed: 7 }, [-1, 1, -1, 1, 0, 0, 0, 0]);
  assert.equal(two.s.deficits, 2); assert.equal(two.s.end.cause, 'complete', '잔액이 마이너스여도 연속 2번이 아니면 계속');
  const streak = season({ mode: 'fixed', seed: 7 }, [-1, 0]);
  assert.equal(streak.s.end.cause, 'contract', '−1원 잔액이 2번 연속(두 번째는 적자 아닌 0원 단계여도)이면 종료');
  const s = S.create(cfg, { mode: 'fixed', seed: 7 }); phase(s, -0.4);
  assert.equal(s.deficits, 1); assert.equal(s.ledger[0].deficit, true);
  assert.equal(N.won(-0.4), '−1원 미만', '화면에서도 0원으로 보이지 않는다'); assert.equal(N.won(0), '0원'); assert.equal(N.won(-1500), '−1,500원');
});

test('reload / result re-entry / restore never settles or counts a deficit twice', () => {
  const s = S.create(cfg, { mode: 'fixed', seed: 7 });
  phase(s, 20); S.nextPhase(s); phase(s, -10);
  const snap = () => JSON.stringify({ l: s.ledger, d: s.deficits, e: s.end, h: s.history.length, n: s.negStreak });
  const before = snap();
  // 결과 화면 저장본 → 복구(결과 다시 계산) → 다시 정산 시도
  const r = S.restore(JSON.parse(JSON.stringify(S.serialize(s))), cfg);
  assert.equal(r.stage, 'result'); assert.equal(r.deficits, 1); assert.equal(r.ledger.length, 2);
  assert.equal(S.finishRun(r), null); r.stage = 'run'; assert.equal(S.finishRun(r), null); r.stage = 'result';
  assert.equal(r.deficits, 1); assert.equal(r.ledger.length, 2);
  assert.equal(snap(), before);
  // 운행 중 저장본 → 출발 직전 계획, 다시 출발하면 한 번만 집계
  S.nextPhase(r); S.beginPlan(r); S.startRun(r);
  const mid = S.restore(JSON.parse(JSON.stringify(S.serialize(r))), cfg);
  assert.equal(mid.stage, 'plan'); assert.equal(mid.deficits, 1); assert.equal(mid.ledger.length, 2);
  mid.current = null; S.startRun(mid); mid.current.metrics.costs.total = -30; S.finishRun(mid);
  assert.equal(mid.deficits, 2); assert.equal(mid.negStreak, 1); assert.equal(mid.end, null); assert.equal(mid.ledger.length, 3);
  S.nextPhase(mid); S.beginPlan(mid); S.startRun(mid); mid.current.metrics.costs.total = -10; S.finishRun(mid);
  assert.equal(mid.deficits, 3); assert.equal(mid.end.cause, 'contract'); assert.equal(mid.ledger.length, 4);
  // 종료 화면 저장본도 종료 원인을 그대로 복구
  S.nextPhase(mid);
  const end = S.restore(JSON.parse(JSON.stringify(S.serialize(mid))), cfg);
  assert.equal(end.stage, 'ending'); assert.deepEqual(end.end, mid.end); assert.equal(end.deficits, 3); assert.equal(end.negStreak, 2);
  // 연속 횟수가 없던 예전 저장본은 정산 기록에서 다시 센다
  const legacy = JSON.parse(JSON.stringify(S.serialize(mid))); delete legacy.negStreak;
  assert.equal(S.restore(legacy, cfg).negStreak, 2);
  // 정산 기록이 없던 예전 저장본은 운행 기록에서 한 번씩만 다시 만든다
  const old = JSON.parse(JSON.stringify(S.serialize(s))); delete old.ledger; delete old.deficits; delete old.end;
  const re = S.restore(old, cfg);
  assert.equal(re.deficits, 1); assert.deepEqual(re.ledger, s.ledger);
});

test('retry: same conditions reproduce the map, demand and events with a clean run state; new random differs', () => {
  for (const opt of [{ mode: 'default' }, { mode: 'random', seed: 99 }, { mode: 'fixed', seed: 7 }]) {
    const s = S.create(cfg, opt); phase(s, -10); S.nextPhase(s); phase(s, -10);
    const again = S.create(cfg, s.mode === 'default' ? { mode: 'default' } : { mode: s.mode, seed: s.seed });
    assert.equal(again.seed, s.seed); assert.deepEqual(again.events, s.events, '외생적 사건 조건 재현');
    assert.deepEqual(again.config.nodes.map((n) => [n.id, n.x, n.y]), s.config.nodes.map((n) => [n.id, n.x, n.y]), '지도 재현');
    const blank = S.create(cfg, s.mode === 'default' ? { mode: 'default' } : { mode: s.mode, seed: s.seed });
    assert.deepEqual(S.serialize(again), S.serialize(blank), '새로 만든 것과 똑같은 초기 상태');
    for (const [k, v] of [['phase', 1], ['stage', 'reveal'], ['deficits', 0], ['end', null], ['current', null]]) assert.deepEqual(again[k], v, k);
    assert.deepEqual(again.history, []); assert.deepEqual(again.ledger, []); assert.deepEqual(again.goalHistory, []);
    assert.equal(again.owned, cfg.bus.initialBuses); assert.ok(again.draft.buses.every((b) => b.routeNum == null));
  }
  let n = 0; const fresh = S.create(cfg, { mode: 'random', rand: () => (++n * 0.37) % 1 });
  assert.notEqual(fresh.seed, 99);
});

test('failure review is grounded in the record: tips only for observed problems, no route-abolition answer, event vs choice split', () => {
  // 노선 없이 버스를 쉬게 한 단계 → 쉬는 버스·노선 없음 제안
  const s = S.create(cfg); S.beginPlan(s); S.startRun(s); S.finishRun(s);
  const idle = N.financeReview(cfg, s.history);
  assert.deepEqual(idle.tips.map((t) => t.code).sort(), ['noLink', 'resting']);
  assert.ok(idle.tips.length <= 3);
  // 모든 버스를 노선에 넣고 모든 정류장을 이은 단계 → 쉬는 버스·노선 없음 제안은 나오지 않는다
  const t = S.create(cfg); S.beginPlan(t);
  t.draft.routes = []; const r1 = S.addRoute(t, route(['F', 'C', 'B', 'A'])), r2 = S.addRoute(t, route(['D', 'A', 'G']));
  S.assign(t, 1, r1.num); S.assign(t, 2, r2.num); S.startRun(t); S.finishRun(t);
  const busy = N.financeReview(cfg, t.history);
  assert.equal(busy.resting, 0); assert.ok(!busy.tips.some((x) => x.code === 'resting'));
  assert.equal(busy.noLink, t.history[0].metrics.noLink);
  [idle, busy].forEach((rv) => rv.tips.concat([{ text: rv.caution }]).forEach((x) => assert.doesNotMatch(x.text, /폐지하세요|없애세요|줄이세요/)));
  assert.match(idle.caution, /외곽 노선을 없애는 것만이 답은 아니에요/);
  // 사건 운임 = 돌발 수요 승객 중 실제로 탄 사람 × 운임
  const ev = S.create(cfg, { mode: 'fixed', seed: 7 });
  let found = null;
  while (!found && ev.stage !== 'ending') {
    S.beginPlan(ev); ev.draft.routes = []; ev.draft.buses.forEach((b) => { b.routeNum = null; });
    const all = S.addRoute(ev, route(S.graph(ev).nodes.filter((x) => x !== 'N'))); ev.draft.buses.forEach((b) => S.assign(ev, b.id, all.num));
    S.startRun(ev); const res = ev.current.result; const e = S.finishRun(ev);
    if (e.event && e.event.type === 'demand') found = { e, boarded: res.passengers.filter((p) => p.kind === 'extra' && p.firstBoardT != null).length };
    S.nextPhase(ev);
  }
  assert.ok(found, '시드 7에 돌발 수요 사건이 있다');
  assert.equal(found.e.eventFare, found.boarded * cfg.finance.fare);
  assert.deepEqual(N.financeReview(ev.config, ev.history).event.phases, [found.e.phase]);
});
