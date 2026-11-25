// 2026-11-10 2단계 고정 청원 + 필수 선택(청원 답·무임 정책)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), Choices = require('../js/choices.js');
const { playTo, runAndFinish, balancedPlan } = require('./fairness-fixture.cjs');

test('2단계 고정 청원: seed 여러 개 x 기본·랜덤 모두 정확히 하나, 사건 추첨 불변', () => {
  for (const opt of [{}, { mode: 'fixed', seed: 7 }, { mode: 'fixed', seed: 1234 }]) {
    const s = S.create(cfg, opt), before = JSON.stringify(s.events);
    const h = playTo(s, 2, balancedPlan).history[1];
    assert.ok(h.petition && h.petition.fixed); assert.equal(h.petition.t, 45);
    assert.equal(JSON.stringify(s.events), before);
    assert.equal(s.fixedPetition.zone, h.petition.zone);
    assert.equal(typeof s.fixedPetition.noRecord, 'boolean');
  }
});
test('required: 3단계 청원 답 필요, 고르면 해제 · 4단계 무임 정책', () => {
  const s = playTo(S.create(cfg), 2, balancedPlan); S.nextPhase(s);
  assert.deepEqual(Choices.required(s), ['petition']);
  Choices.set(s, "petition", "why", "x");
});
test('required: 이유만으로는 부족, 선택하면 해제', () => {
  const s = playTo(S.create(cfg), 2, balancedPlan); S.nextPhase(s);
  Choices.set(s, 'petition', 'why', '병원 가는 길이라'); assert.deepEqual(Choices.required(s), ['petition']);
  Choices.set(s, 'petition', 'choice', 'not-now'); assert.deepEqual(Choices.required(s), []);
  assert.equal(s.petitionReply.zone, s.fixedPetition.zone);
  runAndFinish(s, balancedPlan); S.nextPhase(s);
  assert.deepEqual(Choices.required(s), ['elder']);
  Choices.set(s, 'elder', 'choice', 'abolish'); assert.deepEqual(s.elderPolicy, { phase: 4, choice: 'abolish' });
  assert.deepEqual(Choices.required(s), []);
});
test('옛 저장본: fixedPetition 없이 3단계면 청원 답을 요구하지 않는다', () => {
  const s = playTo(S.create(cfg), 2, balancedPlan); S.nextPhase(s); delete s.fixedPetition;
  assert.deepEqual(Choices.required(s), []);
});
test('set: 200자 자르기·빈 값 지움·잘못된 값 무시', () => {
  const s = S.create(cfg); s.phase = 4;
  assert.equal(Choices.set(s, 'elder', 'choice', 'zzz'), null); assert.equal(s.elderPolicy, undefined);
  Choices.set(s, 'elder', 'choice', 'keep');
  Choices.set(s, 'elder', 'why', 'a'.repeat(300)); assert.equal(s.elderPolicy.why.length, 200);
  Choices.set(s, 'elder', 'why', '  '); assert.equal('why' in s.elderPolicy, false);
  Choices.set(s, 'elder', 'choice', 'bad'); assert.equal(s.elderPolicy.choice, 'keep');
  assert.equal(Choices.set(s, 'nope', 'choice', 'keep'), null);
});
test('2단계에 무작위 청원이 뽑힌 seed에서도 청원은 많아야 하나(2026-11-24: 그 시각에 못 가고 있는 사람이 없으면 0)', () => {
  let found = 0;
  for (let seed = 1; seed < 400 && found < 2; seed++) {
    const s = S.create(cfg, { mode: 'fixed', seed });
    if (!s.events[1] || s.events[1].type !== 'petition') continue;
    found++;
    const h = playTo(s, 2, balancedPlan).history[1];
    const n = s.current.result.log.filter((e) => e.type === 'petition').length;
    assert.ok(n <= 1, '청원 줄 ' + n);
    if (h.petition) assert.ok(h.petition.fixed && h.petition.count >= 1); else assert.equal(n, 0);
  }
  assert.ok(found > 0, '청원 사건 seed를 찾지 못함');
});
test('3단계 이후 단계는 고정 청원을 만들지 않는다', () => {
  const s = playTo(S.create(cfg), 3, balancedPlan);
  assert.ok(!(s.history[2].petition && s.history[2].petition.fixed));
});

test('why를 choice보다 먼저 써도 저장되고, 이후 choice에도 남는다', () => {
  const s = playTo(S.create(cfg), 2, balancedPlan); S.nextPhase(s);
  Choices.set(s, 'petition', 'why', '병원 가는 길'); assert.equal(s.petitionReply.why, '병원 가는 길'); assert.equal(s.petitionReply.zone, s.fixedPetition.zone);
  assert.deepEqual(Choices.required(s), ['petition']);
  Choices.set(s, 'petition', 'choice', 'reflect'); assert.equal(s.petitionReply.why, '병원 가는 길'); assert.deepEqual(Choices.required(s), []);
  const e = S.create(cfg); e.phase = 4; Choices.set(e, 'elder', 'why', '이유만');
  assert.deepEqual(e.elderPolicy, { phase: 4, why: '이유만' }); assert.equal(S.elderChoice(e), 'keep'); assert.deepEqual(Choices.required(e), ['elder']);
});
test('petitionAt(2026-11-24 P1-1): t에 기준 시간(27)을 넘겨 기다리는 사람·잇는 노선이 없는 사람만 센다 — 버스 안·막 기다리기 시작한 사람은 빼고, 0명이면 청원 없음', () => {
  const P = (o, t, firstBoardT, arriveT, fail) => ({ o, t, firstBoardT, arriveT, fail: fail || null });
  // F: 10에 요청해 50에 탐(45에 35 기다리는 중 → 셈), 20에 요청해 30에 탐(45에 버스 안 → 안 셈) / D: 노선 없음(셈), 40에 요청(5 기다림 → 안 셈)
  const a = S.petitionAt([P('F', 10, 50, 70), P('F', 20, 30, 80), P('D', 5, null, null, 'NO_LINK'), P('D', 40, 60, 70)], 45, 27);
  assert.deepEqual(a, { zone: 'D', t: 45, count: 1, total: 2, wait: 0, noRoute: 1 }, '비율이 같으면(1/2) 정류장 ID 순');
  const none = S.petitionAt([P('D', 5, 6, 20), P('D', 30, 31, 40), P('F', 40, 50, 60), P('F', 50, 51, 60)], 45, 27);
  assert.equal(none, null, '못 가고 있는 사람이 없으면 청원 없음(예전에는 기다린 시간 합이 긴 곳·F로 늘 띄웠다)');
  assert.equal(S.petitionAt([], 45, 27), null);
});
test('noRecord: 1단계에서 청원 구역을 안 지나면 기록 비율 0 → noRecord true, 지나면 false', () => {
  const { withoutF } = require('./fairness-fixture.cjs');
  const a = playTo(S.create(cfg), 2, [{ nodes: ['B', 'A', 'G', 'E'], buses: 1 }]);
  assert.ok(a.fixedPetition, '2단계 고정 청원');
  const RL = require('../js/ride-log.js'), ratios = (s) => RL.ratios(cfg, 2, s.history[0].rideLog, cfg.nodes.map((n) => n.id));
  assert.equal(a.fixedPetition.noRecord, ratios(a)[a.fixedPetition.zone] === 0, 'noRecord = 1단계 기록 비율 0'); assert.equal(a.history[1].petition.noRecord, a.fixedPetition.noRecord);
  /* 2026-11-24 P1-1: 청원 동네가 ‘그 시각에 못 가고 있는 사람’ 기준으로 바뀌어 예전 계획의 동네(D)와 달라질 수 있다 — 두 경우(기록 있음·없음)를 한 번씩 찾는다 */
  const b = playTo(S.create(cfg), 2, withoutF);
  if (b.fixedPetition) assert.equal(b.fixedPetition.noRecord, ratios(b)[b.fixedPetition.zone] === 0);
});
test('M2: elderFree 없는 옛 설정이면 4단계에도 무임 정책 선택을 요구하지 않는다', () => {
  const s = playTo(S.create(cfg), 3, balancedPlan); S.nextPhase(s);
  s.config = Object.assign({}, s.config); delete s.config.elderFree; s.phase = 4; s.petitionReply = { zone: 'F', choice: 'reflect' };
  assert.ok(!Choices.required(s).includes('elder'));
});
