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
test('2단계에 무작위 청원이 뽑힌 seed에서도 청원은 하나', () => {
  let found = 0;
  for (let seed = 1; seed < 400 && found < 2; seed++) {
    const s = S.create(cfg, { mode: 'fixed', seed });
    if (!s.events[1] || s.events[1].type !== 'petition') continue;
    found++;
    const h = playTo(s, 2, balancedPlan).history[1];
    assert.equal(s.current.result.log.filter((e) => e.type === 'petition').length, 1);
    assert.ok(h.petition.fixed);
  }
  assert.ok(found > 0, '청원 사건 seed를 찾지 못함');
});
test('3단계 이후 단계는 고정 청원을 만들지 않는다', () => {
  const s = playTo(S.create(cfg), 3, balancedPlan);
  assert.equal(s.history[2].petition && s.history[2].petition.fixed, undefined);
});

test('why를 choice보다 먼저 써도 저장되고, 이후 choice에도 남는다', () => {
  const s = playTo(S.create(cfg), 2, balancedPlan); S.nextPhase(s);
  Choices.set(s, 'petition', 'why', '병원 가는 길'); assert.equal(s.petitionReply.why, '병원 가는 길'); assert.equal(s.petitionReply.zone, s.fixedPetition.zone);
  assert.deepEqual(Choices.required(s), ['petition']);
  Choices.set(s, 'petition', 'choice', 'reflect'); assert.equal(s.petitionReply.why, '병원 가는 길'); assert.deepEqual(Choices.required(s), []);
  const e = S.create(cfg); e.phase = 4; Choices.set(e, 'elder', 'why', '이유만');
  assert.deepEqual(e.elderPolicy, { phase: 4, why: '이유만' }); assert.equal(S.elderChoice(e), 'keep'); assert.deepEqual(Choices.required(e), ['elder']);
});
test('petitionAt: t 이후에 도착한 구역은 열린 것, t 전에 도착하면 아님', () => {
  const P = (o, t, firstBoardT, arriveT) => ({ o, t, firstBoardT, arriveT });
  const late = S.petitionAt([P('F', 10, 50, 70), P('F', 20, 55, 80), P('D', 5, 6, 20), P('D', 30, 31, 40)], 45);
  assert.deepEqual(late, { zone: 'F', t: 45, count: 2, total: 2 });
  const after = S.petitionAt([P('D', 5, 6, 20), P('D', 30, 31, 40), P('F', 50, 51, 60)], 45);
  assert.equal(after.count, 0); assert.equal(after.zone, 'D', '열린 구역이 없으면 기다린 시간 합이 긴 구역(둘 다 1분씩 → D는 2, F는 t 이후라 제외)');
  assert.equal(S.petitionAt([], 45).zone, 'F');
});
test('noRecord: 1단계에서 청원 구역을 안 지나면 기록 비율 0 → noRecord true, 지나면 false', () => {
  const { withoutF } = require('./fairness-fixture.cjs');
  const a = playTo(S.create(cfg), 2, [{ nodes: ['B', 'A', 'G', 'E'], buses: 1 }]);
  assert.equal(a.fixedPetition.zone, 'D'); assert.equal(a.fixedPetition.noRecord, true); assert.equal(a.history[1].petition.noRecord, true);
  const b = playTo(S.create(cfg), 2, withoutF);
  assert.equal(b.fixedPetition.noRecord, false);
});
test('M2: elderFree 없는 옛 설정이면 4단계에도 무임 정책 선택을 요구하지 않는다', () => {
  const s = playTo(S.create(cfg), 3, balancedPlan); S.nextPhase(s);
  s.config = Object.assign({}, s.config); delete s.config.elderFree; s.phase = 4; s.petitionReply = { zone: 'F', choice: 'reflect' };
  assert.ok(!Choices.required(s).includes('elder'));
});
