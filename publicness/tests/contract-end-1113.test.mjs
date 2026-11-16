// 2026-11-13 검토 P2: 계약 종료 총평이 실제 판정(누적 잔액 2회 연속 0원 미만)과 달리 ‘단계 적자가 누적 세 번’이라 했다.
// 총평·제목·재정 돌아보기·결과 알림이 Session.contractRule 한 곳으로 규칙을 고르는지, 예전 규칙 저장본·파산·정상 마무리 문장은 그대로인지 본다.
// 화면 쪽(제목·#failure-cause·#ending-verdict 한 화면 비교)은 contract-end-1113-browser.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), N = require('../js/narrative.js');
const T = require('../tools/random-finance-1112.cjs');
const SEED = 245525538;
const TAIL = ' 그동안 주민이 해낸 이동은 기록에 남아 있어요. 어디서 돈이 나갔는지부터 다시 봐요.';
const OLD = '단계 적자가 누적 세 번 쌓여 운영 계약이 종료됐어요.' + TAIL;

// 실제 엔진, 결과를 강제로 바꾸지 않음: 무난한 계획 + 매 단계 버스 2대 임차
function leaseTwoEveryStage() {
  const s = S.create(cfg, { mode: 'random', seed: SEED });
  while (!s.end) { T.lay(s, T.moderate(s), 2); T.answer(s); assert.deepEqual(S.validate(s), []); S.startRun(s); S.finishRun(s); if (!s.end) S.nextPhase(s); }
  return s;
}
const conclusionOf = (s) => N.endingConclusion(N.endingReactions(s.config, s.history), s.history, s.end);

test('지금 규칙: 시드 245525538 · 매 단계 2대 임차 → 2단계 계약 종료, 총평 = 누적 잔액 2회 연속 0원 미만(‘세 번’ 아님)', () => {
  const s = leaseTwoEveryStage();
  assert.equal(s.end.cause, 'contract'); assert.equal(s.end.phase, 2); assert.equal(s.phase, 2); assert.equal(s.negStreak, 2);
  assert.deepEqual(s.ledger.map((r) => Math.round(r.balance)), [-29428, -74221]);
  assert.equal(S.contractRule(s.end), 'balance-streak');
  assert.deepEqual(S.contractPhases(s.end), [1, 2]);
  // 도우미가 고른 단계 = 정산 기록에서 실제로 누적 잔액이 0원 미만이었던 단계
  S.contractPhases(s.end).forEach((p) => assert.ok(s.ledger.find((r) => r.phase === p).balance < 0, p + '단계'));
  const c = conclusionOf(s);
  assert.equal(c.verdict, '1·2단계를 마칠 때 누적 잔액이 2회 연속 0원 미만이어서 운영 계약이 종료됐어요.' + TAIL);
  assert.doesNotMatch(c.verdict, /세 번|적자가 누적/);
  // 인물 반응 컷 마지막 장(같은 conclusion 객체)도 같은 이유 + 같은 숫자
  assert.ok(c.text.startsWith(c.verdict + '\n'));
  assert.match(c.text, /보유 잔액 −74,221원/);
  assert.equal(Math.round(c.profit), Math.round(s.end.balance));
  assert.equal(N.contractCause(s.end), '1·2단계를 마칠 때 누적 잔액이 2회 연속 0원 미만이어서 운영 계약이 종료됐어요.');
});

test('지금 규칙 종료 저장본을 되살려도 같은 총평(규칙 판단이 저장본에서 바뀌지 않음)', () => {
  const s = leaseTwoEveryStage(); S.nextPhase(s); assert.equal(s.stage, 'ending');
  const back = S.safeRestore(S.serialize(s), cfg);
  assert.ok(back); assert.deepEqual(back.end, s.end);
  assert.equal(conclusionOf(back).verdict, conclusionOf(s).verdict);
});

test('예전 규칙(적자 3회) 저장본: 잔액이 남은 채 끝난 계약은 그때 문장 그대로 — 제목과 같은 판단', () => {
  // economy.test 예전 저장본 방식: 지금 엔진으로 진행한 저장본에서 새 필드를 지우고 예전 종료 상태를 넣는다
  const s = S.create(cfg, { mode: 'random', seed: SEED });
  for (let p = 1; p <= 3; p++) { T.lay(s, T.moderate(s), 0); T.answer(s); S.startRun(s); S.finishRun(s); if (p < 3) S.nextPhase(s); }
  assert.equal(s.end, null);
  const old = JSON.parse(JSON.stringify(S.serialize(s)));
  delete old.ledger; delete old.negStreak;
  old.deficits = 3; old.end = { cause: 'contract', phase: 3, balance: S.balance(s) }; old.stage = 'ending';
  assert.ok(old.end.balance >= 0, '예전 규칙은 잔액이 남아도 끝났다');
  const r = S.safeRestore(old, cfg);
  assert.ok(r); assert.deepEqual(r.end, old.end, '이미 끝난 계약은 그대로');
  assert.equal(S.contractRule(r.end), 'deficit-count');
  assert.equal(conclusionOf(r).verdict, OLD);
  assert.equal(N.contractCause(r.end), '단계 적자가 누적 세 번 쌓여 운영 계약이 종료됐어요.');
});

test('계약 종료가 아니면 규칙 없음 · 단계를 모르는 종료도 깨지지 않음', () => {
  assert.equal(S.contractRule(null), null); assert.equal(S.contractRule({ cause: 'bankrupt', balance: -1 }), null); assert.equal(S.contractRule({ cause: 'complete', balance: 5 }), null);
  assert.deepEqual(S.contractPhases({ cause: 'contract' }), []);
  assert.equal(N.contractCause({ cause: 'contract' }), '누적 잔액이 2회 연속 0원 미만이어서 운영 계약이 종료됐어요.');
});

test('기본 모드 파산·정상 마무리 총평은 그대로', () => {
  const hs = [1, 2, 3, 4, 5].map((p) => ({ phase: p, metrics: { costs: { total: -1000 } }, residents: {} }));
  const b = N.endingConclusion([{ satisfied: true }, { satisfied: false }], hs, { cause: 'bankrupt', phase: 5, balance: -5000 });
  assert.equal(b.verdict, '주요 인물 2명 중 1명이 만족했지만, 학기 말 잔액이 −5,000원이라 파산했어요. 주민의 이동은 지키면서 운영 비용을 다시 설계해 봐요.');
  assert.match(b.text, /보유 잔액 −5,000원/);
  const ok = [1, 2, 3, 4, 5].map((p) => ({ phase: p, metrics: { costs: { total: 1000 } }, residents: {} }));
  assert.equal(N.endingConclusion([{ satisfied: true }], ok, { cause: 'complete' }).verdict, '다양한 사람들을 만족시켰어요.');
  assert.equal(N.endingConclusion([{ satisfied: true }, { satisfied: false }], ok, { cause: 'complete' }).verdict, '도시 노선을 나름 잘 설계했어요. 하지만 이게 최선이었을까요?');
  assert.match(N.endingConclusion([{ satisfied: true }], ok, { cause: 'complete' }).text, /누적 잔액 5,000원/);
});
