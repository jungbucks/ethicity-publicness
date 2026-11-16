// 2026-11-14 검토 지적 2·3·4번(1번 컷신 그림은 cutscene-image.test.mjs)
//  2. 랜덤(도전) 모드 기본 지원금 5,000 → 8,000원(기본 모드 10,000원·결과 그대로)
//  3. 랜덤 모드도 학기 말 누적 잔액 < 0이면 '무사 완주'가 아니라 파산 — 총평·보고서 머리줄·금배지가 같은 말
//  4. SCENARIO_VERSION pb-3.2.0 — 예전(pb-3.1.0) 저장본은 그때 재정 값으로 이어하기, '지난번 비교'는 재정 값이 다른 기록과 섞이지 않게
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), N = require('../js/narrative.js'), R = require('../js/report.js'), St = require('../js/storage.js'), RC = require('../js/run-compare.js'), D = require('../js/demand.js');
const T = require('../tools/random-finance-1112.cjs');
const SEED = 245525538, read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const f = { won: (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원', duration: (m) => m + 'u', rate: String, name: (id) => id, route: (n) => 'R' + n, clock: (t) => D.clock(cfg, t), choices: {}, date: new Date(2026, 10, 14), bus: (x) => 'bus' + x };
const mem = () => ({ m: {}, getItem(k) { return k in this.m ? this.m[k] : null; }, setItem(k, v) { this.m[k] = String(v); }, removeItem(k) { delete this.m[k]; } });
const copy = (o) => JSON.parse(JSON.stringify(o));
function withBase(base, fn) { const keep = cfg.challenge.finance; cfg.challenge.finance = Object.assign({}, keep, { basePerBus: base }); try { return fn(); } finally { cfg.challenge.finance = keep; } }
// 한 단계를 실제로 운행하되 정산 직전에 회차 수지만 시험값으로(finance-failure.test와 같은 방식)
function season(opt, totals) {
  const s = S.create(cfg, opt);
  for (const t of totals) { S.beginPlan(s); S.startRun(s); s.current.metrics.costs = Object.assign({}, s.current.metrics.costs, { total: t }); S.finishRun(s); S.nextPhase(s); if (s.stage === 'ending') break; }
  return s;
}
// 실제 엔진: 무난한 계획 + 6~8단계 2대 임차(검토자가 재현한 계획)
function lateLease(seed) {
  const s = S.create(cfg, { mode: 'random', seed });
  for (;;) { T.lay(s, T.moderate(s), s.phase >= 6 ? 2 : 0); T.answer(s); assert.deepEqual(S.validate(s), []); S.startRun(s); S.finishRun(s); S.nextPhase(s); if (s.stage === 'ending') return s; }
}

test('3번: 랜덤 모드 — 마지막 단계에 잔액이 처음 마이너스가 돼도 파산(전: 무사 완주), 정확히 0원은 완주, 계약 종료 규칙이 먼저', () => {
  for (const opt of [{ mode: 'fixed', seed: 7 }, { mode: 'random', seed: 12345 }]) {
    const first = season(opt, [10, 10, 10, 10, 10, 10, 10, -100]);
    assert.equal(first.history.length, 8); assert.equal(first.negStreak, 1, '연속 마이너스는 1번뿐(계약 종료 규칙에는 안 걸림)');
    assert.deepEqual(first.end, { cause: 'bankrupt', phase: 8, balance: -30 }, opt.mode);
    assert.equal(season(opt, [10, 0, 0, 0, 0, 0, 0, -10]).end.cause, 'complete', '정확히 0원은 파산이 아니다');
    assert.equal(season(opt, [10, 0, 0, 0, 0, 0, 0, -10.4]).end.cause, 'bankrupt', '−0.4원도 0원 미만(반올림 전 값으로 판정)');
    const streak = season(opt, [10, 10, 10, 10, 10, 10, -100, 0]);
    assert.deepEqual(streak.end, { cause: 'contract', phase: 8, balance: -40 }, '마지막 단계에서 2회 연속 마이너스 = 계약 종료(파산보다 먼저)');
    assert.equal(season(opt, [10, 10, 10, 10, 10, -100, 100, 0]).end.cause, 'complete', '중간에 마이너스였다가 회복하면 완주');
  }
  // 기본 모드는 그대로
  assert.equal(season({ mode: 'default' }, [0, 0, 0, 0, -1]).end.cause, 'bankrupt'); assert.equal(season({ mode: 'default' }, [-100, 0, 0, 0, 100]).end.cause, 'complete');
  assert.equal(S.finalCause(-0.4), 'bankrupt'); assert.equal(S.finalCause(0), 'complete'); assert.equal(S.finalCause(1), 'complete');
});

test('3번: 검토 재현(시드 245525538 · 5,000원 · 무난 + 6~8단계 2대 임차 → −18,541원) — 총평·보고서·금배지가 모두 파산이라고 말한다', () => {
  const s = withBase(5000, () => lateLease(SEED));
  assert.equal(s.config.finance.basePerBus, 5000); assert.equal(s.history.length, 8); assert.equal(Math.round(S.balance(s)), -18541);
  assert.equal(s.end.cause, 'bankrupt', '전에는 complete'); assert.equal(s.end.phase, 8);
  const c = N.endingConclusion(N.endingReactions(s.config, s.history), s.history, s.end);
  assert.match(c.verdict, /학기 말 잔액이 −18,541원이라 파산했어요\./); assert.doesNotMatch(c.verdict, /나름 잘 설계했어요|만족시켰어요\.$/);
  assert.match(c.text, /보유 잔액 −18,541원/);
  const rep = R.build(s, f);
  assert.equal(rep.meta.end, '파산 — 학기 말 잔액이 0원 미만이에요 · 누적 잔액 −18,541원');
  assert.equal(rep.badges.find((b) => b.id === 'solvent').earned, false, '금배지(파산·계약 종료 없이 학기를 마쳤어요)는 못 받는다');
  assert.equal((S.scoresOverall(s) || {}).finance.score, 0);
  // 같은 계획 · 지금 값(8,000원)이면 잔액이 남아 완주
  const now = lateLease(SEED); assert.equal(now.end.cause, 'complete'); assert.ok(S.balance(now) > 0);
  assert.equal(R.build(now, f).badges.find((b) => b.id === 'solvent').earned, true);
});

test('3번: 이 수정 전에 끝난 랜덤 저장본(잔액 마이너스인데 complete)은 되살릴 때 파산으로 읽는다 — 잔액이 남은 완주·계약 종료는 그대로', () => {
  const s = withBase(5000, () => lateLease(SEED)), old = copy(S.serialize(s));
  old.end = { cause: 'complete', phase: 8, balance: old.end.balance }; old.config.SCENARIO_VERSION = 'pb-3.1.0';
  const back = S.safeRestore(old, cfg);
  assert.ok(back); assert.equal(back.end.cause, 'bankrupt'); assert.equal(Math.round(back.end.balance), -18541);
  assert.equal(R.badges(back).find((b) => b.id === 'solvent').earned, false);
  const fine = lateLease(SEED), keep = S.safeRestore(copy(S.serialize(fine)), cfg); assert.deepEqual(keep.end, fine.end);
  const ended = season({ mode: 'fixed', seed: 7 }, [-1, 0]); assert.equal(ended.end.cause, 'contract');
  assert.deepEqual(S.safeRestore(copy(S.serialize(ended)), cfg).end, ended.end);
});

test('3번: 화면 문장 — 랜덤 재정 규칙에 학기 말 파산을 적고, 마지막 단계 결과 알림은 ‘다음 단계’를 말하지 않는다', () => {
  const app = read('js/app.js'), result = read('js/ui-result.js'), ending = read('js/ui-ending.js'), tip = read('js/minimal-ui.js');
  assert.match(app, /회 연속 단계를 마치면 운영 계약이 종료돼요\. 마지막 단계가 끝난 뒤 누적 잔액이 0원 미만이어도 파산으로 끝나요\.'/);
  assert.match(tip, /번 연속 0원 미만이면 운영 계약이 끝나요\. 마지막 단계가 끝난 뒤 0원 미만이어도 파산이에요\.'/);
  assert.match(result, /row\.balance<0&&h\.phase>=s\.config\.phases\.length\)\{lines\.push\('누적 잔액 '\+App\.won\(row\.balance\)\+' — 마지막 단계를 0원 미만으로 마쳐서 파산으로 끝나요\./);
  assert.match(ending, /\(byStreak \? '' : '기본 모드는 '\) \+ '학기 말 잔액이 0원 미만이면 파산으로 끝나요\.'/, '랜덤 모드 파산 화면에 ‘기본 모드는’이라고 쓰지 않는다');
  // 결말 판정은 한 곳(Session.finalCause) — 다른 파일이 모드로 따로 가르지 않는다
  const session = read('js/session.js');
  assert.equal((session.match(/finalCause\(/g) || []).length, 4, '정의 1 + nextPhase·restore 2곳(없던 결말 채우기 · 예전 결말 읽기)');
  assert.doesNotMatch(session, /'final-balance' && bal < 0/);
});

test('2번: 랜덤(도전) 기본 지원금 8,000원 — 도전 세팅에만 적용, 기본 모드는 10,000원 그대로', () => {
  assert.equal(cfg.challenge.finance.basePerBus, 8000); assert.equal(cfg.finance.basePerBus, 10000);
  assert.equal(S.create(cfg, { mode: 'random', seed: SEED }).config.finance.basePerBus, 8000);
  assert.equal(S.create(cfg, { mode: 'fixed', seed: SEED }).config.finance.basePerBus, 8000);
  assert.equal(S.create(cfg, { mode: 'default' }).config.finance.basePerBus, 10000);
  // 교사 시드: 5,000원에서는 무난한 계획도 1단계 −1,798원(경고)이었다 → 8,000원에서는 +4,202원
  const m = T.play(SEED, 8000, 'moderate'); assert.equal(m.rows[0].balance, 4202); assert.equal(m.end.cause, 'complete');
  assert.equal(T.play(SEED, 5000, 'moderate').rows[0].balance, -1798);
  // 긴장은 남는다: 매 단계 2대 임차 = 2단계 계약 종료, 4단계부터 2대씩 = 6단계 계약 종료, 6~8단계만 = 유지
  assert.deepEqual([T.play(SEED, 8000, 'heavy').end.cause, T.play(SEED, 8000, 'heavy').end.phase], ['contract', 2]);
  assert.deepEqual([T.play(SEED, 8000, 'heavyMid').end.cause, T.play(SEED, 8000, 'heavyMid').end.phase], ['contract', 6]);
  assert.equal(T.play(SEED, 8000, 'heavyLate').end.cause, 'complete');
});

test('2번: 주제가 권하는 계획(교사 시드) — AI ‘소외 지역’ 제안을 매 단계 적용하면 5,000원은 7단계 계약 종료, 8,000원은 완주', () => {
  const B0 = cfg.challenge.finance.basePerBus;
  const reach = T.trace(SEED, 'ai-reach'); assert.equal(reach.length, 8);
  assert.deepEqual([T.judge(reach, B0, 5000).end, T.judge(reach, B0, 5000).phase], ['contract', 7]);
  assert.equal(T.judge(reach, B0, 8000).end, 'complete');
  // 예전 기준 균형 계획(tools/econ-review.cjs balanced): 5,000원은 8단계 계약 종료 → 8,000원은 계약은 지키고 8단계까지 운행(이 시드는 학기 말 잔액이 0원 근처)
  const bal = T.trace(SEED, 'balanced');
  assert.deepEqual([T.judge(bal, B0, 5000).end, T.judge(bal, B0, 5000).phase], ['contract', 8]);
  assert.notEqual(T.judge(bal, B0, 8000).end, 'contract'); assert.ok(Math.abs(T.judge(bal, B0, 8000).balance) < 5000);
  // 다시 세는 방식(단계 수지는 기본 지원금에 선형)이 실제로 그 값으로 돌린 결과와 같은지: 무난 + 4~8단계 2대 임차
  for (const B of [5000, 8000]) { const direct = T.play(SEED, B, 'heavyMid'), j = T.judge(T.trace(SEED, 'heavyMid'), B0, B); assert.deepEqual([j.end, j.phase, Math.round(j.balance)], [direct.end.cause, direct.end.phase, Math.round(direct.end.balance)], B + '원'); }
});

test('4번: 버전 pb-3.2.0 — pb-3.1.0 저장본은 이어하기로 받고, 랜덤 저장본은 그때 지원금으로 끝까지', () => {
  assert.equal(cfg.SCENARIO_VERSION, 'pb-3.2.0'); assert.deepEqual(cfg.SAVE_COMPAT, ['pb-3.1.0']);
  const versions = [cfg.SCENARIO_VERSION].concat(cfg.SAVE_COMPAT), valid = (o) => !S.checkSave(o.session, cfg);
  // 5,000원 시절(pb-3.1.0)에 3단계 계획 화면까지 간 랜덤 저장본
  const old = withBase(5000, () => { const s = S.create(cfg, { mode: 'fixed', seed: SEED }); for (let p = 1; p <= 2; p++) { T.lay(s, T.moderate(s), 0); T.answer(s); S.startRun(s); S.finishRun(s); S.nextPhase(s); } S.beginPlan(s); return s; });
  const data = copy(S.serialize(old)); data.config.SCENARIO_VERSION = 'pb-3.1.0';
  const st = mem(); St.writeSave({ version: 'pb-3.1.0', savedAt: 1, session: data }, st);
  assert.equal(St.saveState(cfg.SCENARIO_VERSION, st, valid).state, 'none', '버전 하나만 주면 전처럼 다른 버전은 버림');
  const got = St.saveState(versions, st, valid); assert.equal(got.state, 'ok', '받아 주는 버전 목록에 있으면 이어하기');
  const older = mem(); St.writeSave({ version: 'pb-3.0.0', savedAt: 1, session: data }, older); assert.equal(St.saveState(versions, older, valid).state, 'none', '목록에 없는 버전은 조용히 버림');
  const s = S.safeRestore(got.save.session, cfg);
  assert.ok(s); assert.equal(s.phase, 3); assert.equal(s.config.finance.basePerBus, 5000, '그 판의 지원금 그대로'); assert.equal(s.config.SCENARIO_VERSION, 'pb-3.1.0');
  assert.equal(Math.round(S.balance(s)), Math.round(S.balance(old)), '지난 정산도 그대로');
  T.lay(s, T.moderate(s), 0); T.answer(s); S.startRun(s); const h = S.finishRun(s);
  assert.equal(h.metrics.costs.subsidyBase, 5000 * s.draft.buses.filter((b) => !b.leased).length, '이어 한 단계도 5,000원으로 정산');
  // 그 판에서 ‘같은 조건으로 재도전’(App.retry = S.create(cfg, {mode, seed}))은 새 게임이라 지금 값·지금 버전
  const again = S.create(cfg, { mode: s.mode, seed: s.seed });
  assert.equal(again.config.finance.basePerBus, 8000); assert.equal(again.config.SCENARIO_VERSION, 'pb-3.2.0'); assert.equal(again.seed, s.seed);
  // 저장할 때 버전 = 그 판의 버전(랜덤은 저장본이 든 설정의 버전) / 읽을 때 = 지금 버전 + SAVE_COMPAT
  const app = read('js/app.js');
  assert.match(app, /version: \(App\.s\.config && App\.s\.config\.SCENARIO_VERSION\) \|\| cfg\.SCENARIO_VERSION,/);
  assert.match(app, /PB\.Storage\.saveState\(SAVE_VERSIONS, null, validSave\)/);
  assert.match(read('js/ui-ending.js'), /cfg=s\.config;/, '엔딩 맨 아래 버전 = 그 판의 설정');
});

test('4번: 지난번 비교 — 재정 값이 다른 판(다른 버전·같은 버전 안의 다른 지원금)의 기록과 비교하지 않는다', () => {
  const key = (s) => RC.scenarioKey(s, s.config.SCENARIO_VERSION);
  const now = S.create(cfg, { mode: 'fixed', seed: SEED });
  const v31a = withBase(5000, () => S.create(cfg, { mode: 'fixed', seed: SEED })), v31b = withBase(10000, () => S.create(cfg, { mode: 'fixed', seed: SEED }));
  v31a.config.SCENARIO_VERSION = v31b.config.SCENARIO_VERSION = 'pb-3.1.0';
  assert.equal(key(now), 'fixed|245525538|pb-3.2.0|b8000'); assert.equal(key(v31a), 'fixed|245525538|pb-3.1.0|b5000'); assert.equal(key(v31b), 'fixed|245525538|pb-3.1.0|b10000');
  assert.equal(RC.scenarioKey({ mode: 'default', seed: 42, config: cfg }, cfg.SCENARIO_VERSION), 'default|42|pb-3.2.0', '기본 모드는 버전까지만(설정을 저장하지 않고 늘 지금 값)');
  const st = mem(), sum = { phase: 1, maxWait: 10, missed: 1, N: 10, arrived: 9, total: 8202, routes: [] };
  RC.remember(st, 'fixed|245525538|pb-3.1.0', 1, 'run-old', sum, 1); // 수정 전 키로 남은 기록(10,000원 시절인지 5,000원 시절인지 알 수 없음)
  RC.remember(st, key(v31b), 1, 'run-10000', sum, 2);
  assert.equal(RC.previous(st, key(v31a), 1, 'me'), null, '5,000원 판을 이어 해도 10,000원 기록·예전 키 기록과 비교하지 않는다');
  assert.equal(RC.previous(st, key(now), 1, 'me'), null, '새 판(8,000원)도 마찬가지');
  RC.remember(st, key(now), 1, 'run-new', sum, 3);
  assert.equal(RC.previous(st, key(now), 1, 'me').runId, 'run-new', '같은 조건·같은 재정 값의 지난 운행과는 비교한다');
});
