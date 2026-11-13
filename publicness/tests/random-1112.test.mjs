// 2026-11-12 교사 랜덤 모드 검토(시드 245525538, 1280×800) 12건 — 순수 로직 회귀 검사. 화면 쪽은 random-1112-browser.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), G = require('../js/graph.js'), Q = require('../js/schedule.js');
export const SEED = 245525538;

// 단계 p의 계획 화면까지(정산 결과는 상관없음 — 계약 종료는 지워서 끝까지 간다)
export function reach(p, opts = {}) {
  const s = S.create(cfg, { mode: 'random', seed: SEED });
  while (s.phase < p) { S.beginPlan(s); if (opts.each) opts.each(s); S.startRun(s); S.finishRun(s); s.end = null; s.negStreak = 0; S.nextPhase(s); }
  S.beginPlan(s); return s;
}
export function lay(s, routes) {
  s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  routes.forEach(([num, nodes, ids]) => { s.draft.routes.push({ num, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); ids.forEach((id) => { const b = s.draft.buses.find((x) => x.id === id); if (b) b.routeNum = num; }); });
}

test('7번: 직행 노선 한 바퀴·간격은 한 함수(노선 번호로 차량 속도) — 노선 칩·글 목록·보고서가 같은 값', () => {
  const s = reach(6); lay(s, [[5, ['F', 'B', 'L'], [7]], [1, ['A', 'B'], [1]]]);
  const g = S.graph(s), r5 = S.routeByNum(s, 5);
  assert.equal(S.routeCycle(s, 5), Q.cycleMinutes(g, s.config, 7, r5), '직행 = 7호차(1.5배) 속도');
  assert.notEqual(S.routeCycle(s, 5), G.cycleMinutes(g, r5), '속도를 뺀 값(예전 글 목록)과 다름');
  const gap = S.routeGaps(s).find((x) => x.num === 5);
  assert.equal(gap.headway, S.routeCycle(s, 5), '버스 1대 = 간격과 한 바퀴가 같음');
  assert.equal(S.routeHeadway(s, 5), S.routeCycle(s, 5));
  // 버스가 없어도(계획 중) 직행 노선은 직행 차량 속도로
  s.draft.buses.find((b) => b.id === 7).routeNum = null;
  assert.equal(S.routeCycle(s, 5), Q.cycleMinutes(g, s.config, 7, r5));
  assert.equal(Q.routeVehicleId(s.config, 6), 9); assert.equal(Q.routeVehicleId(s.config, 2), 1);
  const base = S.create(cfg, { mode: 'default' });
  assert.equal(Q.routeVehicleId(base.config, 5), 1, '기본 모드는 모두 일반 버스');
});

test('7번: 보고서 노선 줄에도 같은 한 바퀴·간격', () => {
  const Report = require('../js/report.js'), D = require('../js/demand.js');
  const s = reach(6); lay(s, [[5, ['F', 'B', 'L'], [7]], [1, ['A', 'B'], [1, 2]]]);
  const lap5 = S.routeCycle(s, 5), lap1 = S.routeCycle(s, 1);
  S.startRun(s); S.finishRun(s);
  s.planLog = { 6: { routes: [{ num: 5, nodes: ['F', 'B', 'L'], buses: 1 }, { num: 1, nodes: ['A', 'B'], buses: 2 }], resting: 0 } };
  const f = { won: String, duration: (m) => 'D' + m, rate: String, name: (id) => id, route: (n) => 'R' + n, clock: (t) => D.clock(s.config, t), choices: {}, date: new Date(2026, 10, 12) };
  const st = Report.build(s, f).stages.find((x) => x.phase === 6);
  assert.ok(st.plan[0].endsWith(' · 한 바퀴 D' + lap5 + ' · 간격 약 D' + lap5), st.plan[0]);
  assert.ok(st.plan[1].endsWith(' · 한 바퀴 D' + lap1 + ' · 간격 약 D' + lap1 / 2), st.plan[1]);
});

test('2번: 노선은 이어지지만 갈아타기 2번 → TOO_MANY_TRANSFERS(유나·다은), 정말 안 이어지면 NO_LINK — 길 찾기 규칙(1번까지)은 그대로', () => {
  const s = reach(4); lay(s, [[1, ['J', 'B'], [1]], [2, ['B', 'A'], [2]], [3, ['A', 'H'], [3]]]);
  const Sim = require('../js/sim.js'), g = S.graph(s), plan = S.toPlan(s);
  assert.equal(Sim.transfersNeeded(g, plan, 'J', 'H'), 2); assert.equal(Sim.structural(g, plan, 'J', 'H'), false, '한 번 환승으로는 못 감(규칙 그대로)');
  assert.equal(Sim.transfersNeeded(g, plan, 'J', 'A'), 1); assert.equal(Sim.transfersNeeded(g, plan, 'J', 'C'), null);
  const tr = S.departChecks(s).transfers;
  assert.deepEqual(tr.map((x) => x.name), ['유나', '다은'], '계획 화면·출발 확인창이 미리 경고할 인물');
  assert.ok(tr.every((x) => x.n === 2 && x.legs[0].o === 'J' && x.legs[0].d === 'H'));
  const r = S.startRun(s), yuna = r.passengers.find((p) => p.residentId === 'yuna' && p.leg === 'outbound');
  assert.equal(yuna.fail, 'TOO_MANY_TRANSFERS'); assert.equal(yuna.waitTotal, 0, '노선 없음처럼 기다린 것으로 세지 않음(대기·해시 그대로)');
  const m = s.current.metrics; assert.ok(m.transfers >= 2, '결과 요약: 갈아타기 2번 이동 따로 셈 ' + m.transfers);
  assert.equal(r.passengers.filter((p) => p.fail === 'NO_LINK').length, m.noLink, '잇는 노선이 정말 없는 이동만 noLink');
  const rec = S.finishRun(s).residents.yuna;
  assert.equal(rec.reasons[0].code, 'transfers'); assert.match(rec.reasons[0].text, /갈아타기를 두 번 해야 해서 못 가요\(갈아타기는 한 번까지\)/);
  const N = require('../js/narrative.js');
  assert.ok(Object.keys(N).length > 0);
  const sc = s.history[s.history.length - 1].scores.mobility.reasons; assert.ok(sc.transfers >= 2, '평가 대상 못 간 이유도 나눠 셈');
});

test('2번: 예전 저장본(transfers 없는 기록)도 그대로 읽힌다 — 보고서·재정 돌아보기', () => {
  const s = reach(3); lay(s, [[1, ['A', 'B'], [1]]]); S.startRun(s); S.finishRun(s);
  const h = s.history[s.history.length - 1]; delete h.metrics.transfers; delete h.scores.mobility.reasons.transfers;
  Object.values(h.metrics.zones).forEach((z) => delete z.transfers);
  const back = S.safeRestore(JSON.parse(JSON.stringify(S.serialize(s))), cfg); assert.ok(back);
  const N = require('../js/narrative.js'), fr = N.financeReview(back.config, back.history); assert.equal(fr.transfers, 0);
  const Report = require('../js/report.js'), D = require('../js/demand.js');
  const f = { won: String, duration: String, rate: String, name: (id) => id, route: (n) => 'R' + n, clock: (t) => D.clock(back.config, t), choices: {}, date: new Date(2026, 10, 12) };
  const st = Report.build(back, f).stages.find((x) => x.phase === 3); assert.ok(st.numbers.length > 0);
});

// ── 4번: 청원(고정 + 사건) ──
const T = require('../tools/random-finance-1112.cjs'), C = require('../js/choices.js');
function playRandom(to, seed = SEED) { const s = S.create(cfg, { mode: 'random', seed }); while (s.phase < to) { T.lay(s, T.moderate(s), 0); T.answer(s); S.startRun(s); S.finishRun(s); S.nextPhase(s); } S.beginPlan(s); return s; }
test('4번: 랜덤 6단계 사건 청원 → 7단계 계획에서 답(필수), 그 뒤·보고서·금배지가 같은 하루 끝 숫자', () => {
  const s = playRandom(7), pf = C.petitionFor(s, 7);
  assert.equal(pf.kind, 'event'); assert.equal(pf.phase, 6); assert.equal(pf.zone, 'D', '병원·공공서비스(교사 재현과 같은 곳)');
  assert.deepEqual(C.required(s), ['petition'], '답을 골라야 출발');
  C.set(s, 'petition', 'choice', 'reflect'); C.set(s, 'petition', 'why', '병원 가는 길');
  assert.deepEqual(s.petitionReplies[7], { zone: 'D', phase: 6, choice: 'reflect', why: '병원 가는 길' }); assert.deepEqual(C.required(s), []);
  assert.equal(s.petitionReply.zone, s.fixedPetition.zone, '고정 청원 답(3단계에 한 것)은 그대로');
  T.lay(s, T.moderate(s), 0); S.startRun(s); const h7 = S.finishRun(s);
  assert.ok(h7.petitionCheck && h7.petitionCheck.zone === 'D', '참고 줄용 같은 시각 숫자');
  const o = C.outcome(s, C.list(s).find((p) => p.phase === 6)), log6 = s.history[5].rideLog.D, log7 = h7.rideLog.D;
  assert.equal(o.before.failed, log6.requests - log6.arrived); assert.equal(o.after.failed, log7 ? log7.requests - log7.arrived : 0);
  const Report = require('../js/report.js'), D = require('../js/demand.js');
  const f = { won: String, duration: String, rate: String, name: (id) => s.config.nodes.find((n) => n.id === id).name, route: (n) => 'R' + n, clock: (t) => D.clock(s.config, t), choices: {}, date: new Date(2026, 10, 12) };
  const lines = Report.build(s, f).choices.petitions;
  const line6 = lines.find((x) => x.phase === 6); assert.ok(line6, JSON.stringify(lines));
  assert.equal(line6.text, '6단계 병원·공공서비스 주민 청원 · 7단계 답 → 반영한다 · 이유: 병원 가는 길 · 못 간 이동 ' + o.before.failed + '건 → ' + o.after.failed + '건');
  assert.ok(lines.find((x) => x.phase === 2), '고정 청원 줄도 그대로');
  assert.equal(Report.badges(s).find((b) => b.id === 'petition').earned, C.badge(s));
  assert.match(Report.badges(s).find((b) => b.id === 'petition').rule, /줄었거나 0건을 지켰으면 받아요\. 청원이 여러 번이면 모두\./);
});
test('4번: 금배지 조건 — 줄면 받음, 0→0도 받음, 같거나 늘면 아직, 여러 번이면 모두', () => {
  const mk = (a, b, c, d) => ({ mode: 'random', config: { phases: new Array(8) }, fixedPetition: { phase: 2, zone: 'F', t: 45, count: 1, total: 2 }, petitionReply: { choice: 'reflect' },
    history: [{ phase: 2, rideLog: { F: { requests: 10, rode: 9, arrived: 10 - a } } }, { phase: 3, rideLog: { F: { requests: 10, rode: 9, arrived: 10 - b } } },
      { phase: 6, petition: { zone: 'D', t: 48, count: 1, total: 1 }, rideLog: { D: { requests: 5, rode: 5, arrived: 5 - c } } }, { phase: 7, rideLog: { D: { requests: 5, rode: 5, arrived: 5 - d } } }] });
  assert.equal(C.badge(mk(2, 1, 1, 0)), true, '둘 다 줄었음');
  assert.equal(C.badge(mk(0, 0, 0, 0)), true, '0건을 지킴');
  assert.equal(C.badge(mk(2, 1, 1, 1)), false, '사건 청원이 그대로(1 → 1)라 아직');
  assert.equal(C.badge(mk(2, 3, 0, 0)), false, '고정 청원이 늘어서 아직');
  assert.deepEqual(['down', 'zero', 'same', 'up'].map((v, i) => C.outcome(mk(...[[3, 1, 0, 0], [0, 0, 0, 0], [2, 2, 0, 0], [1, 4, 0, 0]][i]), C.list(mk(0, 0, 0, 0))[0]).verdict), ['down', 'zero', 'same', 'up']);
  const UIv = (o) => o; assert.ok(UIv);
  // 기본 모드는 사건 청원을 답하게 하지 않는다(기본 모드 흐름 그대로)
  const def = mk(0, 0, 0, 0); def.mode = 'default'; assert.deepEqual(C.list(def).map((p) => p.kind), ['fixed']);
  // 마지막 단계 청원은 답할 단계가 없다
  const last = mk(0, 0, 0, 0); last.history.push({ phase: 8, petition: { zone: 'A', t: 40, count: 1, total: 1 }, rideLog: {} });
  assert.equal(C.petitionFor(Object.assign(last, { phase: 9 }), 9), null);
});
test('4번: 예전 저장본(사건 청원 답 필드 없음)도 그대로 이어진다', () => {
  const s = playRandom(7), d = JSON.parse(JSON.stringify(S.serialize(s))); delete d.petitionReplies;
  const back = S.safeRestore(d, cfg); assert.ok(back); assert.deepEqual(C.required(back), ['petition'], '그 단계면 답을 고르게 함');
  assert.equal(C.get(back, 'petition'), null);
});

// ── 5번: 랜덤 모드 전용 재정 손잡이(값은 그대로) ──
test('5번: 랜덤 모드 기본 지원금은 config.challenge.finance에서만 — 기본 모드 재정 출력은 HEAD(6192c92)와 바이트까지 같다', () => {
  assert.equal(cfg.challenge.finance.basePerBus, 5000, '랜덤 값 = 5,000원(2026-11-13 교사 결정)'); assert.equal(cfg.finance.basePerBus, 10000, '기본 모드는 10,000원 그대로');
  const keep = cfg.challenge.finance; cfg.challenge.finance = { basePerBus: 3000 };
  try {
    const r = S.create(cfg, { mode: 'random', seed: SEED }), d = S.create(cfg, { mode: 'default' });
    assert.equal(r.config.finance.basePerBus, 3000); assert.equal(d.config.finance.basePerBus, 10000); assert.equal(cfg.finance.basePerBus, 10000, '원본 설정은 안 바뀜');
    assert.equal(S.create(cfg, { mode: 'fixed', seed: SEED }).config.finance.basePerBus, 3000, '?seed= 지정 세팅도 도전 모드라 같은 값');
  } finally { cfg.challenge.finance = keep; }
  const P = require('./playtest-1111-plan.cjs'), s = P.playTo(5);
  const now = { ledger: s.ledger, costs: s.history.map((h) => h.metrics.costs), finance: s.history.map((h) => h.scores.finance), mobility: s.history.map((h) => [h.scores.mobility.N, h.scores.mobility.done, h.scores.mobility.score]), arrived: s.history.map((h) => [h.metrics.N, h.metrics.arrived]), balance: S.balance(s) };
  /* HEAD 6192c92 코드로 같은 계획(playtest-1111-plan)을 돌려 뽑은 값(2026-11-12) */
  const HEAD = {"ledger":[{"phase":1,"income":125000,"cost":94482,"total":30518,"balance":30518,"deficit":false},{"phase":2,"income":181000,"cost":140074,"total":40926,"balance":71444,"deficit":false},{"phase":3,"income":240000,"cost":184825,"total":55175,"balance":126619,"deficit":false},{"phase":4,"income":278000,"cost":230059,"total":47941,"balance":174560,"deficit":false},{"phase":5,"income":334000,"cost":274262,"total":59738,"balance":234298,"deficit":false}],"costs":[{"subsidyBase":20000,"subsidyService":20000,"service":[{"id":"F","label":"외곽 마을","need":6,"stops":5,"met":false,"amount":20000},{"id":"D","label":"병원","need":6,"stops":6,"met":true,"amount":20000}],"fare":85000,"holding":40000,"lease":0,"leased":0,"op":24000,"fuel":30482,"km":203.2,"subsidy":40000,"total":30518,"freeRiders":7,"paidUnfinished":0},{"subsidyBase":30000,"subsidyService":20000,"service":[{"id":"F","label":"외곽 마을","need":6,"stops":5,"met":false,"amount":20000},{"id":"D","label":"병원","need":6,"stops":6,"met":true,"amount":20000}],"fare":131000,"holding":60000,"lease":0,"leased":0,"op":36000,"fuel":44074,"km":293.8,"subsidy":50000,"total":40926,"freeRiders":9,"paidUnfinished":3},{"subsidyBase":40000,"subsidyService":40000,"service":[{"id":"F","label":"외곽 마을","need":6,"stops":10,"met":true,"amount":20000},{"id":"D","label":"병원","need":6,"stops":8,"met":true,"amount":20000}],"fare":160000,"holding":80000,"lease":0,"leased":0,"op":48000,"fuel":56825,"km":378.8,"subsidy":80000,"total":55175,"freeRiders":13,"paidUnfinished":0},{"subsidyBase":50000,"subsidyService":40000,"service":[{"id":"F","label":"외곽 마을","need":6,"stops":10,"met":true,"amount":20000},{"id":"D","label":"병원","need":6,"stops":15,"met":true,"amount":20000}],"fare":188000,"holding":100000,"lease":0,"leased":0,"op":60000,"fuel":70059,"km":467.1,"subsidy":90000,"total":47941,"freeRiders":14,"paidUnfinished":0},{"subsidyBase":60000,"subsidyService":60000,"service":[{"id":"F","label":"외곽 마을","need":6,"stops":10,"met":true,"amount":20000},{"id":"D","label":"병원","need":6,"stops":15,"met":true,"amount":20000},{"id":"K","label":"복지관","need":6,"stops":17,"met":true,"amount":20000}],"fare":214000,"holding":120000,"lease":0,"leased":0,"op":72000,"fuel":82262,"km":548.4,"subsidy":120000,"total":59738,"freeRiders":14,"paidUnfinished":0}],"finance":[{"balance":30518,"reserve":{"amount":74600,"fleet":2,"busCost":27291,"perBus":37291,"phases":1},"served":true,"score":40,"status":"partial"},{"balance":71444,"reserve":{"amount":111900,"fleet":3,"busCost":27291,"perBus":37291,"phases":1},"served":true,"score":63,"status":"partial"},{"balance":126619,"reserve":{"amount":150200,"fleet":4,"busCost":27552,"perBus":37552,"phases":1},"served":true,"score":84,"status":"partial"},{"balance":174560,"reserve":{"amount":186700,"fleet":5,"busCost":27339,"perBus":37339,"phases":1},"served":true,"score":93,"status":"partial"},{"balance":234298,"reserve":{"amount":225300,"fleet":6,"busCost":27552,"perBus":37552,"phases":1},"served":true,"score":100,"status":"full"}],"mobility":[[142,92,64],[166,137,82],[186,173,93],[236,202,85],[282,228,80]],"arrived":[[142,92],[166,137],[186,173],[236,202],[282,228]],"balance":234298};
  assert.equal(JSON.stringify(now), JSON.stringify(HEAD));
});
