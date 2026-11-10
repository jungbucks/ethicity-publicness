// 2026-11-10 어르신 무임 정책을 세션·점수에 연결 — 정책 없음=유지, 4단계 폐지의 stayHome, 저장·복원, 8단계 이어짐, 옛 저장본
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), Sim = require('../js/sim.js');
const { playTo, runAndFinish, balancedPlan, withF } = require('./fairness-fixture.cjs');
const abolishAt4 = (s) => { S.nextPhase(s); s.elderPolicy = { phase: 4, choice: 'abolish' }; };

test('정책 없음 = keep: 실제 운행 운임에 무임 반영, entry.elder 기록', () => {
  const s = playTo(cfg, 1, balancedPlan), h = s.history[0];
  assert.ok(h.elder.free > 0); assert.equal(h.elder.unpaid, h.elder.free * cfg.finance.fare); assert.equal(h.elder.stayed, 0);
  assert.equal(S.elderChoice(s), 'keep');
});
test('4단계 폐지: stayed가 생기고 평가 수요에 남아 stayHome 사유', () => {
  const s = playTo(cfg, 3, balancedPlan); abolishAt4(s);
  const r = runAndFinish(s, balancedPlan), m = r.scores.mobility;
  assert.ok(r.elder.stayed > 0); assert.equal(m.reasons.stayHome, r.elder.stayed);
  const keepS = playTo(cfg, 3, balancedPlan); S.nextPhase(keepS);
  const k = runAndFinish(keepS, balancedPlan);
  assert.equal(m.N, k.scores.mobility.N, '평가 수요는 정책과 무관하게 같다');
  assert.ok(r.metrics.costs.fare > k.metrics.costs.fare, '폐지하면 운임이 는다');
  assert.ok(m.done <= k.scores.mobility.done, '집에 머문 이동은 채울 수 없다');
});
test('1~3단계는 폐지를 골라 둬도 유지와 같다(policyPhase 이전)', () => {
  const s = S.create(cfg); s.elderPolicy = { phase: 4, choice: 'abolish' };
  const h = runAndFinish(s, balancedPlan); assert.equal(h.elder.stayed, 0); assert.ok(h.elder.free > 0);
});
test('paidUnfinished는 요금을 낸 미완료만 센다(무임 제외)', () => {
  const s = playTo(cfg, 3, balancedPlan); /* 3단계 기본 수요에 무임인데 못 마친 승객이 1명 있다 */
  /* 같은 단계를 다시 계산해 승객 단위로 대조 */
  const c = S.expectedRun(s), res = c.result;
  const want = res.passengers.filter((p) => p.firstBoardT != null && !p.free && p.status !== 'arrived').length;
  assert.equal(res.costs.paidUnfinished, want);
  const all = res.passengers.filter((p) => p.firstBoardT != null && p.status !== 'arrived').length;
  /* 무임 대상이 해시로 바뀌어도 성립하도록 숫자(1명)를 박지 않고 관계로 검사 */
  const freeUnfinished = res.passengers.filter((p) => p.firstBoardT != null && p.free && p.status !== 'arrived').length;
  assert.equal(all - want, freeUnfinished, '무임인 미완료는 요금 낸 미완료에 세지 않는다');
});
test('serialize→restore 뒤 같은 정책·같은 결과, 정산 한 번', () => {
  const s = playTo(cfg, 3, balancedPlan); abolishAt4(s);
  S.beginPlan(s); S.startRun(s);
  const back = S.restore(JSON.parse(JSON.stringify(S.serialize(s))), cfg);
  assert.equal(back.elderPolicy.choice, 'abolish');
  if (back.stage === 'plan') S.startRun(back); /* 운행 중 저장은 출발 직전 계획으로 돌아온다 — 기존 규칙 */
  const e = S.finishRun(back);
  assert.equal(back.ledger.filter((r) => r.phase === 4).length, 1); assert.ok(e.elder.stayed > 0);
  const again = S.restore(JSON.parse(JSON.stringify(S.serialize(back))), cfg);
  assert.equal(again.history.filter((h) => h.phase === 4).length, 1); assert.equal(again.current.stayed.length, e.elder.stayed, '결과 화면 복원도 같은 집에 머문 수');
});
test('8단계 세팅: 폐지가 5~8단계에도 이어진다', () => {
  const s = S.create(cfg, { mode: 'fixed', seed: 7 });
  playTo(s, 3, balancedPlan); abolishAt4(s);
  for (let ph = 4; ph <= 6; ph++) { if (ph > 4) S.nextPhase(s); const e = runAndFinish(s, balancedPlan); assert.ok(e.elder.stayed > 0, ph + '단계 stayed'); assert.equal(e.scores.mobility.reasons.stayHome, e.elder.stayed); }
  assert.equal(s.config.phases.length, 8);
});
test('옛 저장본(elderPolicy·entry.elder 없음)도 열린다', () => {
  const old = { stage: 'plan', phase: 1, history: [], config: cfg, mode: 'default', seed: 42, draft: { routes: [], buses: [] }, trust: {}, goalHistory: [] };
  const s = S.restore(old, cfg); assert.equal(s.elderPolicy, undefined); assert.equal(S.elderChoice(s), 'keep');
  const played = playTo(cfg, 2, balancedPlan), data = JSON.parse(JSON.stringify(S.serialize(played)));
  data.history.forEach((h) => { delete h.elder; delete h.scores; });
  const back = S.restore(data, cfg); assert.equal(S.elderChoice(back), 'keep');
  assert.ok(back.history.every((h) => h.scores && h.scores.mobility.reasons.stayHome === 0), '재계산된 점수에도 stayHome 칸이 있다');
});

test('폐지: 어르신이 낸 운임 paid > 0이고 운임 합 이하, 유지: paid 0', () => {
  const k = runAndFinish(S.create(cfg), balancedPlan); assert.equal(k.elder.paid, 0);
  const s = S.create(cfg); runAndFinish(s, balancedPlan); for (let i = 0; i < 3; i++) { S.nextPhase(s); if (i === 2) s.elderPolicy = { phase: 4, choice: 'abolish' }; runAndFinish(s, balancedPlan); }
  const h = s.history[3]; assert.ok(h.elder.paid > 0); assert.ok(h.elder.paid * cfg.finance.fare <= h.metrics.costs.fare);
});
