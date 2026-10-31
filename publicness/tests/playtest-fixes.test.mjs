// 2026-10-23 플레이테스트 피드백 반영 — 저장 복구·중복 정산 방지, 예측과 실제 판정의 같은 기준, 지표 정의, 새 버스 쉬기, 늦은 인물 만회
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), D = require('../js/demand.js'), N = require('../js/narrative.js');
const route = (ns) => ({ nodes: ns, stops: ns.map(() => true) });
function plan(s, routes) {
  s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  routes.forEach(([ns, n]) => { const r = S.addRoute(s, route(ns)); s.draft.buses.filter((b) => b.routeNum == null).slice(0, n).forEach((b) => S.assign(s, b.id, r.num)); });
}
const ACCESS = [[[['F', 'C', 'B', 'A'], 1], [['D', 'A', 'G'], 1]], [[['F', 'C', 'B', 'A'], 1], [['D', 'A', 'G'], 1], [['E', 'H', 'A'], 1]],
  [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 1], [['E', 'H', 'A'], 1]], [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 2], [['J', 'E', 'H', 'B'], 1]],
  [[['F', 'K', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 2], [['J', 'E', 'H', 'B'], 1], [['B', 'C'], 1]]];

test('save → restore keeps progress; run restores to the pre-departure plan without settling twice', () => {
  const s = S.create(cfg); S.beginPlan(s); plan(s, ACCESS[0]);
  S.startRun(s);
  const mid = S.restore(S.serialize(s), cfg); // 운행 중 저장본
  assert.equal(mid.stage, 'plan'); assert.equal(mid.resumedFromRun, true); assert.equal(mid.history.length, 0); assert.equal(mid.current, null);
  assert.deepEqual(mid.draft, s.draft);
  S.startRun(mid); S.finishRun(mid);
  S.finishRun(s);
  assert.deepEqual(mid.history[0].metrics, s.history[0].metrics, '다시 출발해도 같은 결과(결정적)');
  const atResult = S.restore(S.serialize(s), cfg); // 결과 화면 저장본
  assert.equal(atResult.stage, 'result'); assert.equal(atResult.history.length, 1);
  assert.deepEqual(atResult.current.metrics, s.history[0].metrics, '결과를 다시 계산해도 같은 값');
  assert.equal(S.finishRun(atResult), null, '결과에서 다시 정산하지 않는다');
  atResult.stage = 'run'; assert.equal(S.finishRun(atResult), null); assert.equal(atResult.history.length, 1, '같은 단계는 한 번만 기록');
  atResult.stage = 'result'; assert.ok(S.nextPhase(atResult)); assert.equal(atResult.phase, 2);
  const json = JSON.stringify(S.serialize(s));
  assert.ok(!json.includes('"passengers"'), '저장본에는 승객·로그를 넣지 않는다'); assert.ok(json.length < 200000);
});

test('new buses start resting in every phase (default and challenge) and empty routes get no bus', () => {
  for (const opt of [{ mode: 'default' }, { mode: 'fixed', seed: 7 }]) {
    const s = S.create(cfg, opt);
    assert.ok(s.draft.buses.every((b) => b.routeNum == null));
    while (s.stage !== 'ending') {
      const before = s.draft.buses.length; S.beginPlan(s); S.startRun(s); S.finishRun(s); S.nextPhase(s);
      if (s.stage === 'ending') break;
      s.draft.buses.slice(before).forEach((b) => assert.equal(b.routeNum, null, s.phase + '단계 ' + b.id + '호차'));
    }
  }
});

test('departure warning (expected) and actual judgement use the same verdict', () => {
  const s = S.create(cfg); // 1단계 기본 세팅은 사건이 없어 예상 수요 = 실제 수요
  assert.equal(s.events[0].type, 'none');
  for (const routes of [ACCESS[0], [[['C', 'B', 'A'], 1], [['A', 'G', 'E'], 1]], [[['A', 'B', 'C', 'F', 'E', 'D', 'G', 'A'], 2]]]) {
    const t = S.create(cfg); S.beginPlan(t); plan(t, routes);
    const ex = S.expected(t); S.startRun(t); S.finishRun(t);
    Object.keys(ex.residents).forEach((id) => {
      const a = ex.residents[id], b = t.history[0].residents[id]; if (!a) return;
      assert.equal(a.satisfied, b.satisfied, id); assert.deepEqual(a.reasons, b.reasons, id);
    });
  }
});

test('service criterion: a long wait fails the day even when the round trip completes, with a concrete reason', () => {
  const s = S.create(cfg); S.beginPlan(s);
  plan(s, [[['A', 'B', 'C', 'F', 'E', 'D', 'G', 'A'], 2]]); // 모든 정류장을 도는 긴 순환
  const m = S.expected(s);
  const longWait = Object.values(m.residents).filter(Boolean).some((r) => r.reasons.some((x) => x.code === 'longWait'));
  const any = Object.values(m.residents).filter(Boolean).filter((r) => !r.satisfied);
  assert.ok(any.length > 0, '긴 순환에서는 기준을 못 채우는 사람이 있다');
  any.forEach((r) => assert.ok(r.reasons.length && r.reasons.every((x) => x.text.length > 5)));
  assert.ok(longWait || any.some((r) => r.dayStatus !== 'complete'));
});

test('late residents (Yuna, Daeun) can miss one of their two days and still be satisfied', () => {
  const t = N.satisfactionTargets(cfg);
  assert.deepEqual(t, { haneul: 4, narae: 4, jun: 4, sol: 2, yuna: 1, daeun: 1 });
  cfg.residents.forEach((r) => assert.equal(cfg.phases.length - r.fromPhase + 1 - t[r.id], 1, r.id + ' 여유 1번'));
  const hist = [4, 5].map((phase) => ({ phase, residents: { yuna: { dayStatus: 'complete', satisfied: phase === 5 }, daeun: { dayStatus: 'complete', satisfied: false } } }));
  const rs = N.endingReactions(cfg, hist);
  assert.equal(rs.find((r) => r.id === 'yuna').satisfied, true, '4단계 실패 후 5단계 성공');
  assert.equal(rs.find((r) => r.id === 'daeun').satisfied, false, '두 번 모두 놓치면 불만족(자동 성공 아님)');
});

test('request counts: notice (planned + follow-ups), forecast and result share one breakdown; stop counts are origin+destination', () => {
  const s = S.create(cfg); S.beginPlan(s); plan(s, ACCESS[0]);
  for (let p = 1; p <= 5; p++) {
    if (p > 1) { S.beginPlan(s); plan(s, ACCESS[p - 1]); }
    const q = D.requestPlan(s.config, p, s.seed), ex = S.expected(s);
    assert.equal(ex.requests.planned, q.planned, p + '단계 예정 이동');
    assert.ok(ex.requests.followUps <= q.followUps); assert.equal(ex.requests.extra, 0);
    assert.equal(ex.N, ex.requests.planned + ex.requests.followUps);
    const load = D.stopLoad(s.config, p, s.seed);
    assert.equal(Object.values(load).reduce((a, x) => a + x.count, 0), 2 * q.planned, '정류장 숫자 합 = 예정 이동의 두 배(출발+도착)');
    S.startRun(s); const m = s.current.metrics, ev = s.events[p - 1];
    assert.equal(m.requests.planned, q.planned); assert.equal(m.requests.extra, D.extra(s.config, p, ev).length);
    assert.equal(m.N, m.requests.planned + m.requests.followUps + m.requests.extra);
    S.finishRun(s); S.nextPhase(s);
  }
});

test('no-route requests are reported separately and never as a long wait', () => {
  const s = S.create(cfg); S.beginPlan(s); plan(s, [[['A', 'B'], 1]]);
  const m = S.expected(s);
  assert.ok(m.noLink > 0);
  const ex = S.expectedRun(s);
  ex.result.passengers.filter((p) => p.fail === 'NO_LINK').forEach((p) => assert.equal(p.waitTotal, 0));
  assert.ok(m.maxWait <= cfg.bus.window);
});

test('josa follows the final consonant of dynamic words', () => {
  assert.equal(N.josa('다은', '은는'), '다은은'); assert.equal(N.josa('유나', '은는'), '유나는');
  assert.equal(N.josa('고속버스터미널', '이었'), '고속버스터미널이었'); assert.equal(N.josa('밀집 주거지', '이었'), '밀집 주거지였');
  assert.equal(N.josa('솔잎몰', '으로'), '솔잎몰로'); assert.equal(N.josa('기차역', '으로'), '기차역으로');
  const story = N.residentStory([null, null, null, { o: 'J', d: 'H', finalDestination: 'B', dayStatus: 'complete', homeT: 110 }, { o: 'B', d: 'H', finalDestination: 'J', dayStatus: 'complete', homeT: 110 }], 'daeun', cfg);
  assert.match(story.text, /^다은은 /); assert.match(story.text, /고속버스터미널이었어요/);
});

// 대표 설계 세 가지를 다섯 단계에 걸쳐 비교: 서비스 기준이 설계 차이를 드러내는지(분석 근거는 CLAUDE.md 2026-10-23)
const DEMAND = [[[['C', 'B', 'A'], 1], [['A', 'G', 'E'], 1]], [[['C', 'B', 'A'], 2], [['H', 'A', 'G', 'E'], 1]], [[['C', 'B', 'A'], 2], [['H', 'A', 'G', 'E'], 1], [['A', 'I', 'D'], 1]],
  [[['C', 'B', 'A'], 2], [['H', 'A', 'G', 'E'], 1], [['A', 'I', 'D'], 1], [['J', 'E', 'H', 'A'], 1]], [[['C', 'B', 'A'], 2], [['H', 'A', 'G', 'E'], 2], [['A', 'I', 'D'], 1], [['J', 'E', 'H', 'A'], 1]]];
function season(design) {
  const s = S.create(cfg);
  for (let p = 1; p <= 5; p++) { S.beginPlan(s); plan(s, design(s, p)); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  const r = N.endingReactions(cfg, s.history);
  return { satisfied: r.filter((x) => x.satisfied).map((x) => x.id), money: s.history.reduce((a, h) => a + h.metrics.costs.total, 0) };
}
function tour(s) {
  const g = S.graph(s), pos = Object.fromEntries(s.config.nodes.map((n) => [n.id, n])), left = g.nodes.slice(), out = [left.shift()];
  while (left.length) { const a = pos[out[out.length - 1]]; left.sort((x, y) => Math.hypot(pos[x].x - a.x, pos[x].y - a.y) - Math.hypot(pos[y].x - a.x, pos[y].y - a.y)); out.push(left.shift()); }
  return out.concat(out[0]);
}
test('representative designs: access-minded plan satisfies everyone, a long all-stops loop does not, none goes bankrupt', () => {
  const loop = season((s) => [[tour(s), s.draft.buses.length]]), demand = season((s, p) => DEMAND[p - 1]), access = season((s, p) => ACCESS[p - 1]);
  assert.equal(access.satisfied.length, 6);
  assert.ok(loop.satisfied.length < access.satisfied.length, 'loop ' + loop.satisfied);
  assert.ok(!demand.satisfied.includes('narae'), '수요 집중 설계는 외곽 마을의 나래를 놓친다');
  [loop, demand, access].forEach((d) => assert.ok(d.money > 0));
});
