// 승객 엔진 검증 — 손으로 계산한 작은 시나리오 + 기본 세션
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Controlled timing fixture: hand-calculated capacity/transfer boundary cases, independent of map tuning.
const cfg = structuredClone(require('./planned-fixture.cjs'));
delete cfg.map;
cfg.bus.offsets = [0,4,8,12];
const G = require('../js/graph.js');
const D = require('../js/demand.js');
const Sim = require('../js/sim.js');

const g1 = G.build(cfg, 1);
// 'A-b-C' → 대문자 정차, 소문자 통과
const R = (s) => { const p = s.split('-'); return { nodes: p.map((x) => x.toUpperCase()), stops: p.map((x) => x === x.toUpperCase()) }; };
const plan = (...bs) => ({ buses: bs.map((b, i) => ({ id: i + 1, route: b[0] ? R(b[0]) : null, offset: b[1] || 0 })) });
let nid = 1;
const req = (o, d, t) => ({ id: nid, key: 'X' + nid++, o, d, t, kind: 'base', row: 0, i: 0 });
const run = (p, requests, event = null, g = g1) => Sim.run({ g, config: cfg, phase: g.phase, plan: p, requests, event });
const P = (res, id) => res.passengers.find((x) => x.id === id);

test('direct trip (AC11)', () => {
  const r = req('A', 'C', 0);
  const p = P(run(plan(['A-B-C', 0]), [r]), r.id);
  assert.deepEqual([p.status, p.firstBoardT, p.arriveT, p.boardings, p.journey.length], ['arrived', 0, 6, 1, 1]);
});

test('one transfer at shared stop waits 1 min (AC11, AC12)', () => {
  const r = req('A', 'C', 0);
  const res = run(plan(['A-B', 0], ['B-C', 0]), [r]);
  const p = P(res, r.id);
  assert.equal(p.journey.length, 2);
  assert.equal(p.journey[0].to, 'B');
  assert.equal(p.arriveT, 11); // 1호차 B 3분 하차 → 4분 준비 → 2호차 B 2분은 놓침, 8분 승차 → C 11분
  const boards = res.log.filter((e) => e.type === 'board' && e.pid === r.id).map((e) => e.t);
  assert.deepEqual(boards, [0, 8]);
});

test('full transfer bus makes 13th wait for next bus of same leg (AC12)', () => {
  const rs = Array.from({ length: 13 }, () => req('A', 'C', 0));
  const res = run(plan(['A-B', 0], ['B-C', 0], ['A-B', 0]), rs);
  const arr = rs.map((r) => P(res, r.id).arriveT).sort((a, b) => a - b);
  assert.deepEqual(arr, [...Array(12).fill(11), 17]);
  assert.equal(P(res, rs[12].id).arriveT, 17); // 가장 큰 id가 기다림
});

test('no transfer at pass node (AC6)', () => {
  const r = req('A', 'F', 0);
  assert.equal(P(run(plan(['A-B', 0], ['C-b-F', 0]), [r]), r.id).fail, 'NO_LINK');
  const r2 = req('A', 'F', 0);
  const p2 = P(run(plan(['A-B', 0], ['C-B-F', 0]), [r2]), r2.id);
  assert.equal(p2.fail, null);
  assert.equal(p2.journey.length, 2);
});

test('crossing lines without shared stop are not linked (AC6)', () => {
  const r = req('B', 'E', 0);
  const res = run(plan(['B-C', 0], ['D-E', 0]), [r]);
  assert.equal(P(res, r.id).fail, 'NO_LINK');
  assert.equal(Sim.structural(g1, plan(['B-C', 0], ['D-E', 0]), 'B', 'E'), false);
});

test('two transfers never chosen (AC11)', () => {
  const r = req('A', 'F', 0);
  assert.equal(P(run(plan(['A-B', 0], ['B-C', 0], ['C-F', 0]), [r]), r.id).fail, 'NO_LINK');
});

test('capacity 12 and same-minute seat reuse (AC13)', () => {
  const rs = Array.from({ length: 13 }, () => req('A', 'C', 0));
  const res = run(plan(['A-B-C', 0], ['A-B-C', 8]), rs);
  const late = P(res, rs[12].id);
  assert.equal(late.firstBoardT, 8);
  assert.equal(late.arriveT, 14);
  assert.ok(rs.slice(0, 12).every((r) => P(res, r.id).firstBoardT === 0));

  const down = Array.from({ length: 12 }, () => req('A', 'B', 0));
  const up = Array.from({ length: 12 }, () => req('B', 'C', 3));
  const res2 = run(plan(['A-B-C', 0]), [...down, ...up]);
  assert.ok(up.every((r) => P(res2, r.id).firstBoardT === 3));
});

test('wrong direction bus is not boarded (AC13)', () => {
  const r = req('B', 'C', 8);
  const p = P(run(plan(['A-B-C', 0]), [r]), r.id);
  assert.deepEqual([p.firstBoardT, p.arriveT], [15, 18]);
});

test('transfer rider counts 2 boardings, 1 fare, never on two buses (AC14)', () => {
  const r = req('A', 'C', 0);
  const res = run(plan(['A-B', 0], ['B-C', 0]), [r]);
  assert.equal(P(res, r.id).boardings, 2);
  assert.equal(res.costs.fare, 1000);
  let aboard = 0;
  for (const e of res.log.filter((x) => x.pid === r.id)) {
    if (e.type === 'board') { aboard++; assert.equal(aboard, 1); }
    if (e.type === 'alight' || e.type === 'arrive') aboard--;
  }
});

test('wait accumulates first + transfer wait, open waits run to 120 (AC15)', () => {
  const r = req('A', 'C', 0);
  const lost = req('F', 'E', 10);
  const res = run(plan(['A-B', 0], ['B-C', 0]), [r, lost]);
  assert.equal(P(res, r.id).waitTotal, 4); // 처음 0분 + 환승 대기 4~8분(환승 이동 1분 제외)
  assert.equal(P(res, lost.id).fail, 'NO_LINK');
  assert.equal(P(res, lost.id).waitTotal, 0); // 잇는 노선이 없으면 ‘기다림’이 아니라 경로 없음
});

test('120-minute boundary (AC16)', () => {
  const home = req('B', 'A', 117); // B 117분 승차 → A 120분 도착 = 완료
  const late = req('A', 'C', 113); // A 120분 방문에는 새로 타지 못함
  const res = run(plan(['A-B-C', 0]), [home, late]);
  assert.equal(P(res, home.id).status, 'arrived');
  assert.equal(P(res, home.id).arriveT, 120);
  assert.equal(P(res, late.id).status, 'waiting');
  assert.equal(res.log.filter((e) => e.type === 'board' && e.t === 120).length, 0);
  const reqs = D.base(cfg, 1, 42);
  const res2 = run({ buses: cfg.initialDraft.buses.map((b) => ({ id: b.id, route: cfg.initialDraft.routes[b.routeNum - 1], offset: b.offset })) }, reqs);
  const c = (s) => res2.passengers.filter((p) => p.status === s).length;
  assert.equal(c('arrived') + c('waiting') + c('transfer') + c('riding'), reqs.length);
});

test('petition from zone with highest unfinished ratio', () => {
  const a = req('F', 'D', 0), b = req('A', 'B', 0);
  const res = run(plan(['A-B', 0]), [a, b], { phase: 1, type: 'petition', t: 5, odIndex: 0 });
  assert.deepEqual(res.petition, { zone: 'F', t: 5, count: 1, total: 1 });
  assert.ok(res.log.some((e) => e.type === 'petition' && e.t === 5));
  const c = req('A', 'B', 0);
  const res2 = run(plan(['A-B', 0]), [c], { phase: 1, type: 'petition', t: 10, odIndex: 0 });
  assert.equal(res2.petition, null);
});

test('costs identity with deadhead, unassigned and 4 buses (AC19)', () => {
  const rs = [req('A', 'C', 0), req('F', 'E', 0), req('B', 'C', 110)];
  const res = run(plan(['A-B-C', 0], ['F-C-D-A', 4], [null, 0], ['A-B', 12]), rs);
  const k = res.costs;
  assert.equal(k.holding, 80000);
  assert.equal(k.subsidyBase, 40000, '기본 지원 = 기본 제공 차량 1대당 10,000원');
  assert.equal(k.subsidy, k.subsidyBase + k.subsidyService);
  assert.equal(k.op, 100 * (120 + 120 + 0 + 120), '운행 배정 차량은 출발이 늦어도 하루 근무 전체(2026-10-27)');
  const km = res.timelines.reduce((s, t) => s + t.km, 0);
  assert.equal(k.fuel, Math.round(150 * km), '연료·정비비 = 실제 주행거리 × 단가');
  assert.equal(k.lease, 0);
  assert.equal(k.total, k.subsidy + k.fare - k.holding - k.lease - k.op - k.fuel);
  const users = res.passengers.filter((p) => p.firstBoardT != null).length;
  assert.equal(k.fare, 1000 * users);
  assert.equal(k.paidUnfinished, res.passengers.filter((p) => p.firstBoardT != null && p.status !== 'arrived').length);
});

test('deterministic per seed and plan (AC10)', () => {
  const p = { buses: cfg.initialDraft.buses.map((b) => ({ id: b.id, route: cfg.initialDraft.routes[b.routeNum - 1], offset: b.offset })) };
  const h1 = Sim.hash(run(p, D.base(cfg, 1, 42)));
  const h2 = Sim.hash(run(p, D.base(cfg, 1, 42)));
  assert.equal(h1, h2);
  assert.notEqual(h1, Sim.hash(run(p, D.base(cfg, 1, 7))));
});

test('default draft leaves outer village F unlinked (hook fact)', () => {
  const p = { buses: cfg.initialDraft.buses.map((b) => ({ id: b.id, route: cfg.initialDraft.routes[b.routeNum - 1], offset: b.offset })) };
  const reqs = D.base(cfg, 1, 42);
  const t0 = Date.now();
  const res = run(p, reqs);
  const ms = Date.now() - t0;
  const f = res.passengers.filter((x) => x.o === 'F' || x.d === 'F');
  assert.equal(res.passengers.length, 148);
  assert.equal(f.length, 24);
  assert.ok(f.every((x) => x.fail === 'NO_LINK'));
  console.log(`  기본 세션 1회 시뮬레이션 ${ms}ms`);
});

test('full bus logs how many were left behind', () => {
  const rs = Array.from({ length: 13 }, () => req('A', 'C', 0));
  const res = run(plan(['A-B-C', 0], ['A-B-C', 8]), rs);
  const full = res.log.filter((e) => e.type === 'full');
  assert.equal(full.length, 1);
  assert.deepEqual([full[0].t, full[0].node, full[0].bus, full[0].data.left], [0, 'A', 1, 1]);
});

test('a delayed rider may board before 120 and end riding (PRD §7, AC16)', () => {
  const rs = Array.from({ length: 13 }, () => req('B', 'C', 110));
  const res = run(plan(['A-B-C', 0], ['A-B-C', 8]), rs);
  const late = P(res, rs[12].id);
  assert.equal(late.fail, null, '계획상 여정은 있음(1호차 111분 → 114분)');
  assert.equal(late.firstBoardT, 119, '같은 구간 다음 버스(2호차 119분)에 탐');
  assert.equal(late.status, 'riding', '도착 예정 122분 → 탑승 중으로 끝남');
  assert.equal(res.costs.paidUnfinished, 1);
});
