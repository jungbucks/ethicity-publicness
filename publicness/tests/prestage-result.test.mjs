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

test('결과와 질문을 잇는 한 줄(11-06 P1-4): 첫 줄 = 남은 비율이 가장 큰 출발지(비율이 같으면 둘 다), 주제 지역은 그다음, 90% 미만이면 고정 질문', () => {
  const ps = [{ o: 'F', d: 'A', status: 'arrived' }, { o: 'B', d: 'F', status: 'waiting' }, { o: 'F', d: 'D', status: 'riding' }, { o: 'A', d: 'B', status: 'waiting' }];
  // 최악이 주제 지역이 아니면 둘을 구분해서 적고 단계 고정 질문을 보인다
  const big = { zones: { A: { N: 33, done: 0 }, E: { N: 14, done: 0 }, F: { N: 12, done: 6 }, B: { N: 1, done: 0 } } };
  const line = N.bridgeLine(cfg, 1, [], big);
  assert.ok(line.startsWith('남은 비율이 가장 큰 곳은 기차역(33건 중 33건 목적지까지 못 감)과 '), line); assert.ok(line.includes('외곽 마을이에요(출발 12건 중 6건 목적지까지 못 감)'), line); assert.ok(line.indexOf('기차역') < line.indexOf('외곽 마을'), '기차역 줄이 먼저'); assert.ok(!line.includes('밀집 주거지'), '5건 미만은 비율로 앞서지 않음');
  assert.deepEqual([N.bridgeLine(cfg, 1, ps), N.thinkFocus(cfg, 1, ps).ethics], ['남은 비율이 가장 큰 곳은 기차역(1건 중 1건 목적지까지 못 감)과 밀집 주거지(1건 중 1건 목적지까지 못 감)예요. 이번 단계에서 살펴볼 곳은 외곽 마을이에요(출발 2건 중 1건 목적지까지 못 감).', true]);
  // 주제 지역이 곧 최다면 한 곳만
  const only = [{ o: 'F', d: 'A', status: 'waiting' }, { o: 'F', d: 'D', status: 'arrived' }];
  assert.equal(N.bridgeLine(cfg, 1, only), '남은 비율이 가장 큰 곳은 외곽 마을이에요. 출발한 이동 2건 중 1건은 목적지까지 못 갔어요.');
  // 모두 도착하면 거기서 끝
  assert.deepEqual([N.bridgeLine(cfg, 1, ps.slice(0, 1)), N.thinkFocus(cfg, 1, ps.slice(0, 1)).ethics], ['외곽 마을에서 출발한 이동 1건이 모두 도착했어요.', false]);
  // 외곽 마을 100%, 밀집 주거지 0/1 → 밀집 주거지가 첫 줄
  const ok = [{ o: 'F', d: 'A', status: 'arrived' }, { o: 'B', d: 'F', status: 'waiting' }, { o: 'A', d: 'B', status: 'arrived' }];
  assert.equal(N.bridgeLine(cfg, 1, ok), '남은 비율이 가장 큰 곳은 밀집 주거지예요. 출발한 이동 1건 중 1건은 목적지까지 못 갔어요.'); /* 2026-11-11: 모두 도착한 주제 지역은 살펴볼 곳으로 안 짚고, 질문은 소제목 한 번만 */
  // 두 점수 평가(mobility)를 넘기면 그 worst·zones 값을 그대로 쓴다 — 결과 ‘자세히’의 가장 많이 남은 곳과 같은 값
  const mob = { worst: { id: 'A', N: 33, done: 10, missed: 23 }, zones: { A: { N: 33, done: 10 }, F: { N: 12, done: 12 } } };
  assert.equal(N.bridgeLine(cfg, 1, ok, mob), '남은 비율이 가장 큰 곳은 기차역이에요. 출발한 이동 33건 중 23건은 목적지까지 못 갔어요.');
  // 9건 중 1건 남음(89%)은 아직 짚고, 10건 중 1건(90%)은 인정
  const many = (n, left) => Array.from({ length: n }, (_, i) => ({ o: 'F', d: 'A', status: i < left ? 'waiting' : 'arrived' }));
  assert.equal(N.thinkFocus(cfg, 1, many(9, 1)).ethics, true); assert.equal(N.thinkFocus(cfg, 1, many(10, 1)).ethics, false);
  assert.equal(N.bridgeLine(cfg, 2, ps), '남은 비율이 가장 큰 곳은 기차역(1건 중 1건 목적지까지 못 감)과 밀집 주거지(1건 중 1건 목적지까지 못 감)예요. 이번에는 대학교·병원·공공서비스에서 출발한 이동이 없었어요.');
  // 아직 없는 정류장(복지관은 5단계부터)은 빼고, 남는 게 없으면 빈 문장
  assert.equal(N.bridgeLine(cfg, 5, []), '이번에는 어린이·노인복지관에서 출발한 이동이 없었어요.');
  assert.equal(N.bridgeLine(cfg, 9, ps), '');
});

test('2026-11-11 플레이테스트 1·10: 못 간 이동 0건인 곳은 살펴볼 곳으로 안 짚고, 질문은 문장에 안 넣고, 괄호 뒤 조사는 괄호 앞 낱말을 따른다', () => {
  // 1단계 시드 42 무난한 노선: 시장 0/14, 외곽 마을 12/12 → 외곽 마을을 살펴볼 곳이라 하지 않는다
  const m1 = { zones: { A: { N: 33, done: 19 }, G: { N: 20, done: 10 }, B: { N: 32, done: 32 }, E: { N: 14, done: 0 }, F: { N: 12, done: 12 }, C: { N: 19, done: 16 }, D: { N: 12, done: 3 } } };
  const l1 = N.bridgeLine(cfg, 1, [], m1);
  assert.equal(l1, '남은 비율이 가장 큰 곳은 구도심 시장이에요. 출발한 이동 14건 중 14건은 목적지까지 못 갔어요.');
  // AI가 못 본 곳이면 까닭을 적어 한 줄(살펴볼 곳이라 부르지 않음)
  const l1b = N.bridgeLine(cfg, 1, [], m1, { unseen: { F: { seen: 0, real: 12 } } });
  assert.equal(l1b, l1 + ' 외곽 마을은 출발 12건이 모두 도착했지만, AI가 본 이동 0건 · 실제 12건이라 AI 제안에서 빠지기 쉬운 곳이에요.');
  assert.ok(!l1b.includes('살펴볼 곳') && !l1b.includes('살필까요'));
  // 못 간 이동이 남은 곳은 AI가 못 봤어도 살펴볼 곳 한 줄만(까닭 줄 없음)
  const half = { zones: { E: { N: 14, done: 0 }, F: { N: 12, done: 6 } } };
  assert.equal(N.bridgeLine(cfg, 1, [], half, { unseen: { F: { seen: 0, real: 12 } } }), '남은 비율이 가장 큰 곳은 구도심 시장이에요. 출발한 이동 14건 중 14건은 목적지까지 못 갔어요. 이번 단계에서 살펴볼 곳은 외곽 마을이에요(출발 12건 중 6건 목적지까지 못 감).');
  // 모두 도착 + AI가 못 봄
  assert.equal(N.bridgeLine(cfg, 1, [], { zones: { F: { N: 12, done: 12 } } }, { unseen: { F: { seen: 0, real: 12 } } }), '외곽 마을에서 출발한 이동 12건이 모두 도착했어요. 외곽 마을은 AI가 본 이동 0건 · 실제 12건이라 AI 제안에서 빠지기 쉬운 곳이에요.');
  // 주제 지역이 두 곳(4단계 운동장·터미널)이면 못 간 이동이 있는 곳만 — 그곳이 최악이면 한 줄
  const m4 = { zones: { H: { N: 12, done: 3 }, J: { N: 17, done: 17 }, A: { N: 52, done: 47 } } };
  assert.equal(N.bridgeLine(cfg, 4, [], m4), '남은 비율이 가장 큰 곳은 종합운동장이에요. 출발한 이동 12건 중 9건은 목적지까지 못 갔어요.');
  assert.deepEqual(N.thinkFocus(cfg, 4, [], m4).focus, ['H']);
  const m4b = { zones: { H: { N: 12, done: 3 }, J: { N: 17, done: 17 }, A: { N: 52, done: 2 } } };
  assert.equal(N.bridgeLine(cfg, 4, [], m4b), '남은 비율이 가장 큰 곳은 기차역이에요. 출발한 이동 52건 중 50건은 목적지까지 못 갔어요. 이번 단계에서 살펴볼 곳은 종합운동장이에요(출발 12건 중 9건 목적지까지 못 감).');
  // 5단계 복지관 6/6: 문장에서 빠진다
  const m5 = { zones: { H: { N: 12, done: 4 }, K: { N: 6, done: 6 } } };
  assert.equal(N.bridgeLine(cfg, 5, [], m5), '남은 비율이 가장 큰 곳은 종합운동장이에요. 출발한 이동 12건 중 8건은 목적지까지 못 갔어요.');
  // 괄호 뒤 조사: 받침 없는 ‘산업·일자리’ 뒤는 ‘와’, 받침 있는 ‘종합운동장’ 뒤는 ‘이에요’
  const tie = { zones: { G: { N: 20, done: 10 }, H: { N: 6, done: 3 }, F: { N: 12, done: 12 } } };
  assert.equal(N.bridgeLine(cfg, 2, [], tie), '남은 비율이 가장 큰 곳은 산업·일자리(20건 중 10건 목적지까지 못 감)와 종합운동장(6건 중 3건 목적지까지 못 감)이에요. 이번에는 대학교·병원·공공서비스에서 출발한 이동이 없었어요.');
  assert.equal(N.josaNote('밀집 주거지', '1건', '과와'), '밀집 주거지(1건)와'); assert.equal(N.josaNote('기차역', '1건', '이에요'), '기차역(1건)이에요');
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
