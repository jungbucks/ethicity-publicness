// 2026-11-10 기울어진 탑승 기록 — AI 추천은 지난 운행에서 버스에 실제로 탄 기록만 본다(1단계 외곽 마을 F는 0건)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), Demand = require('../js/demand.js'), RideLog = require('../js/ride-log.js');
const { playTo, withF, withoutF } = require('./fairness-fixture.cjs');

test('설정: 1단계에 기록이 없는 구역 = F', () => {
  assert.deepEqual(cfg.rideLog, { hiddenAtStart: ['F'] });
});
test('1단계: F 출발 요청은 AI에게 0건, 나머지는 그대로', () => {
  const s = S.create(cfg); S.beginPlan(s);
  const rev = S.revealed(s);
  assert.equal(rev.requests.filter(q => q.o === 'F').length, 0);
  const all = Demand.base(cfg, 1, s.seed).filter(q => q.o !== 'F' && q.leg !== 'return');
  assert.equal(rev.requests.filter(q => q.o !== 'F').length, all.length);
  assert.ok(rev.requests.some(q => q.d === 'F'), '도착지가 F인 요청은 보인다(출발 기준)');
  assert.equal(rev.rideRatios.F, 0); assert.equal(rev.rideRatios.A, 1);
  const v = S.aiView(s);
  assert.deepEqual(v.hidden, ['F']);
  assert.equal(v.records, rev.requests.length, '1단계 기록 수 = 보이는 기본 수요 수');
});
test('2단계: 비율 = 1단계 탑승 기록 · F를 이은 계획 vs 안 이은 계획', () => {
  const a = playTo(cfg, 1, withF), b = playTo(cfg, 1, withoutF);
  assert.ok(a.history[0].rideLog && b.history[0].rideLog, 'finishRun이 rideLog를 남긴다');
  S.nextPhase(a); S.nextPhase(b);
  assert.ok(S.aiView(a).ratios.F > 0); assert.equal(S.aiView(b).ratios.F, 0);
  assert.ok(S.revealed(a).requests.some(q => q.o === 'F'));
  assert.equal(S.revealed(b).requests.filter(q => q.o === 'F').length, 0);
  assert.ok(!S.aiView(a).hidden.includes('F')); assert.ok(S.aiView(b).hidden.includes('F'), '노선이 안 간 구역은 기록이 계속 비어 있다');
  const rode = Object.keys(a.history[0].rideLog).reduce((k, z) => k + a.history[0].rideLog[z].rode, 0);
  assert.equal(S.aiView(a).records, rode, '2단계 기록 수 = 1단계 탄 이동 수');
  const L = a.history[0].rideLog.F; assert.equal(S.aiView(a).ratios.F, L.rode / L.requests);
  assert.equal(S.aiView(a).ratios.H, 1, '이번 단계에 처음 생긴 구역은 비율 1');
});
test('fromRun: 출발 기준, 돌아오는 이동·돌발 제외', () => {
  const ps = [
    { o: 'F', d: 'A', kind: 'base', leg: 'outbound', firstBoardT: 3, status: 'arrived' },
    { o: 'A', d: 'F', kind: 'base', leg: 'return', firstBoardT: 40, status: 'arrived' },
    { o: 'F', d: 'D', kind: 'base', firstBoardT: null, status: 'noLink' },
    { o: 'F', d: 'C', kind: 'base', firstBoardT: 9, status: 'riding' },
    { o: 'A', d: 'B', kind: 'base', leg: null, firstBoardT: 5, status: 'arrived' },
    { o: 'A', d: 'B', kind: 'extra', firstBoardT: 6, status: 'arrived' },
    { o: 'G', d: 'B', kind: 'extra', firstBoardT: 6, status: 'arrived' }
  ];
  assert.deepEqual(RideLog.fromRun(ps), { F: { requests: 3, rode: 2, arrived: 1 }, A: { requests: 1, rode: 1, arrived: 1 } });
});
test('ratios: 1단계 숨김 0·나머지 1 / 2단계 이후 기록 비율, 기록 없는 구역·요청 0건은 1', () => {
  assert.deepEqual(RideLog.ratios(cfg, 1, null, ['A', 'F', 'B']), { A: 1, F: 0, B: 1 });
  const log = { F: { requests: 4, rode: 1, arrived: 1 }, A: { requests: 0, rode: 0, arrived: 0 } };
  assert.deepEqual(RideLog.ratios(cfg, 2, log, ['A', 'F', 'H']), { A: 1, F: 0.25, H: 1 });
  assert.deepEqual(RideLog.ratios(cfg, 3, null, ['F', 'A']), { F: 1, A: 1 }, '기록을 못 채운 옛 저장본은 1');
});
test('visible·seenFor: 출발 구역별 고르게 퍼뜨려 floor(r×개수)개, 돌아오는 이동 제외 — 같은 규칙', () => {
  const q = (key, o, leg) => ({ key, o, d: 'A', kind: 'base', leg });
  const reqs = [q('f1', 'F'), q('b1', 'B'), q('f2', 'F'), q('f3', 'F'), q('b2', 'B'), q('r1', 'F', 'return'), q('c1', 'C')];
  const ratios = { F: 0.5, B: 0, C: 1 };
  assert.deepEqual(RideLog.visible(reqs, ratios).map(x => x.key), ['f2', 'c1']); /* E1: 앞에서 round → 고른 간격 floor(3×0.5)=1건 */
  const log = { F: { requests: 2, rode: 1, arrived: 1 }, B: { requests: 3, rode: 0, arrived: 0 }, C: { requests: 1, rode: 1, arrived: 0 } };
  assert.deepEqual(RideLog.seenFor(cfg, 2, log, reqs), { F: 1, B: 0, C: 1 });
  const base = S.rideRequests(S.create(cfg), 1, null).ride.filter(x => x.kind === 'base');
  const seen = RideLog.seenFor(cfg, 1, null, base), vis = RideLog.visible(base, RideLog.ratios(cfg, 1, null, Object.keys(seen)));
  assert.equal(seen.F, 0); assert.ok(seen.A > 0);
  Object.keys(seen).forEach(z => assert.equal(seen[z], vis.filter(x => x.o === z).length, z));
});
test('같은 seed·계획이면 같은 AI 입력(결정성), 저장·복원 뒤에도', () => {
  const keys = (s) => S.revealed(s).requests.map(q => q.key);
  const a = playTo(cfg, 1, withF), b = playTo(cfg, 1, withF);
  S.nextPhase(a); S.nextPhase(b); S.beginPlan(a); S.beginPlan(b);
  assert.deepEqual(keys(a), keys(b));
  const r = S.restore(JSON.parse(JSON.stringify(S.serialize(a))), cfg);
  assert.deepEqual(keys(r), keys(a));
  assert.deepEqual(S.aiView(r), S.aiView(a));
});
test('옛 저장본: entry.rideLog 없으면 다시 계산해 채우고, 못 하면 비율 1', () => {
  const a = playTo(cfg, 1, withF); S.nextPhase(a);
  const want = a.history[0].rideLog;
  const old = JSON.parse(JSON.stringify(S.serialize(a))); delete old.history[0].rideLog;
  const r = S.restore(old, cfg);
  assert.deepEqual(r.history[0].rideLog, want);
  assert.deepEqual(S.aiView(r), S.aiView(a));
  const bad = JSON.parse(JSON.stringify(S.serialize(a))); delete bad.history[0].rideLog; bad.history[0].metrics.N += 1;
  const r2 = S.restore(bad, cfg);
  assert.equal(r2.history[0].rideLog, undefined, '재실행 결과가 기록과 다르면 채우지 않는다');
  const v = S.aiView(r2);
  Object.keys(v.ratios).forEach(z => assert.equal(v.ratios[z], 1, z));
  assert.deepEqual(v.hidden, []);
  assert.ok(S.revealed(r2).requests.some(q => q.o === 'F'));
});
test('E1: 부분 비율은 하루 전체에서 고르게 — 이른 시간만 남지 않는다, 개수=seenFor, 결정적', () => {
  const reqs = Array.from({ length: 10 }, (_, i) => ({ key: 'f' + i, o: 'F', d: 'A', kind: 'base', t: 60 + i * 60 }));
  const a = RideLog.visible(reqs, { F: 0.5 }), b = RideLog.visible(reqs, { F: 0.5 });
  assert.equal(a.length, 5); assert.deepEqual(a.map(x => x.key), b.map(x => x.key));
  const ts = a.map(x => x.t), med = reqs[4].t;
  assert.ok(Math.max(...ts) > med && Math.min(...ts) < med);
  assert.equal(RideLog.seenFor(cfg, 2, { F: { requests: 10, rode: 5, arrived: 0 } }, reqs).F, 5);
  assert.equal(RideLog.visible(reqs, { F: 1 }).length, 10); assert.equal(RideLog.visible(reqs, { F: 0 }).length, 0);
});
