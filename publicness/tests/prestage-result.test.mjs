// 2026-11-01 단계 전 설명을 결과 화면으로 — 저장 이전(성찰·변화 화면 → 계획), 기준 달성 불가, 반복 합치기, 결과 잇는 한 줄, 인물 한 줄
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), cfg = require('../js/config.js'), S = require('../js/session.js'), N = require('../js/narrative.js'), D = require('../js/demand.js');

function playPhase(s) { S.beginPlan(s); assert.ok(S.startRun(s)); S.finishRun(s); S.nextPhase(s); }

test('저장 이전: 성찰 화면에서 멈춘 저장본 → 그 단계 계획 화면, 자유 서술은 그대로, 선택 카드 문구는 choices로', () => {
  const s = S.create(cfg, { mode: 'default' });
  playPhase(s); // 2단계 reveal
  s.transitionStep = 'reflect';
  s.reflections = { 2: '오래 기다린 사람부터', 3: '외곽 마을에서 기다리는 사람도 살피겠다.' };
  const saved = JSON.parse(JSON.stringify(S.serialize(s)));
  assert.equal(saved.stage, 'reveal'); assert.equal(saved.transitionStep, 'reflect');
  const r = S.restore(saved, cfg);
  assert.equal(r.stage, 'plan'); assert.equal(r.phase, 2); assert.equal('transitionStep' in r, false);
  assert.deepEqual(r.choices, { 1: 'longest' }, '2단계 전 카드 = 1단계 결과에서 고른 답(2단계 지도 목표)');
  assert.equal(r.reflections[3], '외곽 마을에서 기다리는 사람도 살피겠다.', '자유 서술 보존');
  assert.equal(2 in r.reflections, false, '카드 문구는 자유 서술 칸에서 빠짐');
  assert.equal(r.owned, s.owned); assert.deepEqual(r.draft, JSON.parse(JSON.stringify(s.draft)), '초안·버스는 새 단계 값 그대로');
  assert.ok(S.startRun(r), '이전한 계획으로 바로 출발 가능');
});

test('저장 이전: 「마을이 달라졌어요」·1단계 안내 저장본도 계획 화면으로, 이미 고른 답은 덮지 않음', () => {
  const s = S.create(cfg, { mode: 'default' }); // 노선 없이 진행해도 계약 종료가 없는 기본 모드
  assert.equal(s.stage, 'reveal');
  const one = S.restore(JSON.parse(JSON.stringify(S.serialize(s))), cfg);
  assert.equal(one.stage, 'plan'); assert.equal(one.phase, 1);
  playPhase(s); playPhase(s); s.transitionStep = 'changes'; s.choices = { 2: 'many' }; s.reflections = { 3: '더 많은 사람을 빠르게' };
  const r = S.restore(JSON.parse(JSON.stringify(S.serialize(s))), cfg);
  assert.equal(r.stage, 'plan'); assert.equal(r.phase, 3); assert.deepEqual(r.choices, { 2: 'many' }); assert.deepEqual(r.reflections, {});
  // 계획·결과 저장본은 그대로
  S.beginPlan(s); delete s.transitionStep; const p = S.restore(JSON.parse(JSON.stringify(S.serialize(s))), cfg); assert.equal(p.stage, 'plan');
  assert.equal(S.migrateTransition(p), false, '새 저장본은 바꿀 것이 없음');
});

test('기준 달성 불가: 누적 + 남은 단계 < 기준', () => {
  assert.equal(N.criterionState({ completed: 4, threshold: 4, remaining: 1 }), 'done');
  assert.equal(N.criterionState({ completed: 1, threshold: 4, remaining: 3 }), 'open');
  assert.equal(N.criterionState({ completed: 0, threshold: 4, remaining: 3 }), 'impossible');
  assert.equal(N.criterionState(null), null);
  // residentTally와 함께: 기본 5단계(하늘 기준 4회), 아무도 못 해낸 2단계가 끝나면 남은 3단계로는 4회 불가
  const s = S.create(cfg, { mode: 'default' });
  playPhase(s); // 1단계(노선 없음 → 아무도 못 해냄)
  let t = N.residentTally(s.config, s.history);
  assert.equal(N.criterionState(t.haneul), 'open', '1단계 실패 뒤: 남은 4단계로 4회 가능');
  playPhase(s);
  t = N.residentTally(s.config, s.history);
  assert.equal(t.haneul.completed, 0); assert.equal(t.haneul.remaining, 3); assert.equal(N.criterionState(t.haneul), 'impossible');
});

test('반복 합치기: 연속으로 같은 문장만 ×N, 떨어져 있으면 따로', () => {
  const lines = ['가', '가', '가', '나', '가', '가'].map((x, i) => ({ t: i, text: x }));
  const m = N.mergeRepeats(lines, x => x.text);
  assert.deepEqual(m.map(x => [x.item.text, x.count, x.item.t, x.last.t]), [['가', 3, 0, 2], ['나', 1, 3, 3], ['가', 2, 4, 5]]);
  assert.deepEqual(N.mergeRepeats([], x => x), []);
});

test('결과와 질문을 잇는 한 줄: 단계 주제 정류장 이동 중 남은 건수', () => {
  const ps = [{ o: 'F', d: 'A', status: 'arrived' }, { o: 'B', d: 'F', status: 'waiting' }, { o: 'F', d: 'D', status: 'riding' }, { o: 'A', d: 'B', status: 'waiting' }];
  assert.equal(N.bridgeLine(cfg, 1, ps), '이번에 외곽 마을 이동 2건이 남았어요.');
  assert.equal(N.bridgeLine(cfg, 1, ps.slice(0, 1)), '이번에 외곽 마을 이동 1건은 모두 도착했어요.');
  assert.match(N.bridgeLine(cfg, 2, ps), /^이번에 대학교·병원/);
  // 아직 없는 정류장(복지관은 5단계부터)은 빼고, 남는 게 없으면 빈 문장
  assert.equal(N.bridgeLine(cfg, 5, []), '이번에는 어린이·노인복지관에 오가는 이동이 없었어요.');
  assert.equal(N.bridgeLine(cfg, 9, ps), '');
});

test('인물 한 줄: 어느 이동·어디서 얼마나·노선 버스 수와 간격', () => {
  const rd = cfg.residents.filter(r => r.id === 'narae')[0], name = id => N.nodeName(cfg, id);
  const out = { residentId: 'narae', leg: 'outbound', o: rd.o, d: rd.d, status: 'arrived', waitTotal: 10, boardings: 1, deniedBoardings: 0, journey: [{ from: rd.o, to: rd.d, routeId: 'r1' }] };
  const back = { residentId: 'narae', leg: 'return', o: rd.d, d: rd.o, status: 'waiting', waitTotal: 36, boardings: 0, deniedBoardings: 0, legIndex: 0, journey: [{ from: rd.d, to: rd.o, routeId: 'r2' }] };
  const info = id => id === 'r2' ? { num: 2, buses: 1, headway: 38 } : null;
  const rec = { o: rd.o, d: rd.d, finalDestination: rd.o, dayStatus: 'returnIncomplete', satisfied: false };
  const line = N.residentLine(cfg, rd, rec, [out, back], info);
  assert.equal(line, '나래 · ' + name(rd.d) + '→' + name(rd.o) + ' 귀가, ' + name(rd.d) + '에서 ' + D.duration(cfg, 36) + ' 대기 (2번 노선 버스 1대, 간격 ' + D.duration(cfg, 38) + ')');
  assert.match(N.residentLine(cfg, rd, { ...rec, dayStatus: 'outboundIncomplete' }, [{ ...out, status: 'waiting', fail: 'NO_LINK' }], info), /잇는 노선이 없었어요$/);
  assert.match(N.residentLine(cfg, rd, { ...rec, dayStatus: 'outboundIncomplete' }, [{ ...out, status: 'waiting', deniedBoardings: 2 }], info), /만차로 2번 못 탐/);
  assert.match(N.residentLine(cfg, rd, { ...rec, dayStatus: 'complete', satisfied: true }, [out, { ...back, status: 'arrived', waitTotal: 4 }], info), /돌아오는 길까지 마쳤어요 \(가장 긴 대기/);
  assert.match(N.residentLine(cfg, rd, { ...rec, dayStatus: 'returnIncomplete' }, [out], info), /시작하지 못했어요$/);
});
