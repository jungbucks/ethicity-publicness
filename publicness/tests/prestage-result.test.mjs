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
  assert.equal(r.reflections[2], '오래 기다린 사람부터', '옛 선택 문구도 원본 기록으로 보존');
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
  assert.equal(r.stage, 'plan'); assert.equal(r.phase, 3); assert.deepEqual(r.choices, { 2: 'many' }); assert.deepEqual(r.reflections, {3:'더 많은 사람을 빠르게'});
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

/* 2026-11-12 교사 랜덤 검토 11번: 다음 운행 목표는 한 곳만 + 이유 한 줄(예전 ‘남은 비율이 가장 큰 곳은 … 살펴볼 곳은 …’ 두 곳 문장을 대체).
 * 고르는 순서: 이번 단계 주제 지역 중 못 간 이동이 있는 곳(못 간 비율 → 건수) → 없으면 못 간 비율이 가장 큰 출발지(같으면 건수) */
const ONE = (name, N, left) => '다음 운행에서 살펴볼 곳은 ' + name + '. 이번 단계가 챙기기로 한 곳인데 출발한 이동 ' + N + '건 중 ' + left + '건이 목적지까지 못 갔어요.';
const WORST = (name, N, left) => '다음 운행에서 살펴볼 곳은 ' + name + '. 출발한 이동 가운데 목적지까지 못 간 비율이 가장 커요(' + N + '건 중 ' + left + '건).';
test('결과와 질문을 잇는 한 줄(2026-11-12 한 곳만): 주제 지역에 못 간 이동이 있으면 그곳, 없으면 못 간 비율이 가장 큰 곳 · 90% 미만이면 고정 질문', () => {
  const ps = [{ o: 'F', d: 'A', status: 'arrived' }, { o: 'B', d: 'F', status: 'waiting' }, { o: 'F', d: 'D', status: 'riding' }, { o: 'A', d: 'B', status: 'waiting' }];
  // 최악(기차역)이 주제 지역이 아니어도, 주제 지역(외곽 마을)에 못 간 이동이 있으면 그곳 한 곳만
  const big = { zones: { A: { N: 33, done: 0 }, E: { N: 14, done: 0 }, F: { N: 12, done: 6 }, B: { N: 1, done: 0 } } };
  assert.equal(N.bridgeLine(cfg, 1, [], big), ONE('외곽 마을이에요', 12, 6));
  assert.deepEqual([N.bridgeLine(cfg, 1, ps), N.thinkFocus(cfg, 1, ps).ethics], [ONE('외곽 마을이에요', 2, 1), true]);
  const only = [{ o: 'F', d: 'A', status: 'waiting' }, { o: 'F', d: 'D', status: 'arrived' }];
  assert.equal(N.bridgeLine(cfg, 1, only), ONE('외곽 마을이에요', 2, 1));
  // 모두 도착하면 거기서 끝
  assert.deepEqual([N.bridgeLine(cfg, 1, ps.slice(0, 1)), N.thinkFocus(cfg, 1, ps.slice(0, 1)).ethics], ['외곽 마을에서 출발한 이동 1건이 모두 도착했어요.', false]);
  // 주제 지역이 모두 도착 → 못 간 비율이 가장 큰 곳
  const ok = [{ o: 'F', d: 'A', status: 'arrived' }, { o: 'B', d: 'F', status: 'waiting' }, { o: 'A', d: 'B', status: 'arrived' }];
  assert.equal(N.bridgeLine(cfg, 1, ok), WORST('밀집 주거지예요', 1, 1));
  // 두 점수 평가(mobility)를 넘기면 그 zones 값을 그대로 쓴다
  const mob = { worst: { id: 'A', N: 33, done: 10, missed: 23 }, zones: { A: { N: 33, done: 10 }, F: { N: 12, done: 12 } } };
  assert.equal(N.bridgeLine(cfg, 1, ok, mob), WORST('기차역이에요', 33, 23));
  const many = (n, left) => Array.from({ length: n }, (_, i) => ({ o: 'F', d: 'A', status: i < left ? 'waiting' : 'arrived' }));
  assert.equal(N.thinkFocus(cfg, 1, many(9, 1)).ethics, true); assert.equal(N.thinkFocus(cfg, 1, many(10, 1)).ethics, false);
  // 비율이 같은 두 곳(기차역·밀집 주거지 1/1)이어도 한 곳만(같으면 건수, 그다음 정류장 순)
  const two = N.bridgeLine(cfg, 2, ps); assert.equal(two, WORST('기차역이에요', 1, 1) + ' 이번에는 대학교·병원·공공서비스에서 출발한 이동이 없었어요.');
  assert.ok(!two.includes('밀집 주거지'), '둘째 곳은 말하지 않음');
  assert.equal(N.bridgeLine(cfg, 5, []), '이번에는 어린이·노인복지관에서 출발한 이동이 없었어요.');
  assert.equal(N.bridgeLine(cfg, 9, ps), '');
});

test('2026-11-11 플레이테스트 1·10 + 11-12 한 곳: 못 간 이동 0건인 곳은 짚지 않고, 문장에는 한 곳만', () => {
  const m1 = { zones: { A: { N: 33, done: 19 }, G: { N: 20, done: 10 }, B: { N: 32, done: 32 }, E: { N: 14, done: 0 }, F: { N: 12, done: 12 }, C: { N: 19, done: 16 }, D: { N: 12, done: 3 } } };
  const l1 = N.bridgeLine(cfg, 1, [], m1);
  assert.equal(l1, WORST('구도심 시장이에요', 14, 14));
  // AI가 못 본 주제 지역(모두 도착)은 까닭 한 줄(살펴볼 곳이라 부르지 않음 — 11-11 지시 그대로)
  const l1b = N.bridgeLine(cfg, 1, [], m1, { unseen: { F: { seen: 0, real: 12 } } });
  assert.equal(l1b, l1 + ' 외곽 마을은 출발 12건이 모두 도착했지만, AI가 본 이동 0건 · 실제 12건이라 AI 제안에서 빠지기 쉬운 곳이에요.');
  assert.ok(!l1b.includes('살필까요'));
  const half = { zones: { E: { N: 14, done: 0 }, F: { N: 12, done: 6 } } };
  assert.equal(N.bridgeLine(cfg, 1, [], half, { unseen: { F: { seen: 0, real: 12 } } }), ONE('외곽 마을이에요', 12, 6));
  assert.equal(N.bridgeLine(cfg, 1, [], { zones: { F: { N: 12, done: 12 } } }, { unseen: { F: { seen: 0, real: 12 } } }), '외곽 마을에서 출발한 이동 12건이 모두 도착했어요. 외곽 마을은 AI가 본 이동 0건 · 실제 12건이라 AI 제안에서 빠지기 쉬운 곳이에요.');
  const m4 = { zones: { H: { N: 12, done: 3 }, J: { N: 17, done: 17 }, A: { N: 52, done: 47 } } };
  assert.equal(N.bridgeLine(cfg, 4, [], m4), ONE('종합운동장이에요', 12, 9)); assert.deepEqual(N.thinkFocus(cfg, 4, [], m4).focus, ['H']);
  const m4b = { zones: { H: { N: 12, done: 3 }, J: { N: 17, done: 17 }, A: { N: 52, done: 2 } } };
  const l4 = N.bridgeLine(cfg, 4, [], m4b); assert.equal(l4, ONE('종합운동장이에요', 12, 9)); assert.ok(!l4.includes('기차역'), '최악(기차역)은 같은 문장에 안 나옴');
  const m5 = { zones: { H: { N: 12, done: 4 }, K: { N: 6, done: 6 } } };
  assert.equal(N.bridgeLine(cfg, 5, [], m5), WORST('종합운동장이에요', 12, 8));
  const tie = { zones: { G: { N: 20, done: 10 }, H: { N: 6, done: 3 }, F: { N: 12, done: 12 } } };
  assert.equal(N.bridgeLine(cfg, 2, [], tie), WORST('산업·일자리예요', 20, 10) + ' 이번에는 대학교·병원·공공서비스에서 출발한 이동이 없었어요.');
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
