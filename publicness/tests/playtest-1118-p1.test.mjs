// 2026-11-18 플레이테스트(pb-3.2.0) P1 — 엔진·문장 쪽 단위 검사(화면은 tests/playtest-1118-p1-browser.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), A = require('../js/advisor.js'), T = require('./playtest-1111-plan.cjs');

test('P1-5: ‘소외 지역’ 한 목록 — 계획 화면은 지금 단계, 결과 화면은 다음 단계(AI라면?과 같은 입력), 다음 단계 계획 화면과 같다', () => {
  const s0 = S.create(cfg); S.beginPlan(s0);
  assert.deepEqual(S.underserved(s0), cfg.reachInitial, '1단계 = 사람이 정해 둔 지역');
  assert.deepEqual(A.recommendSync(S.revealed(s0), 'reach').targets, S.underserved(s0), '계획 화면 AI 패널 = underserved');
  for (const ph of [1, 2, 3, 4]) {
    const s = T.playTo(ph), u = S.underserved(s);
    const card = A.recommendSync(S.revealed(S.plannedNext(s), { allowNodes: S.visibleNodeIds(s) }), 'reach').targets;
    assert.deepEqual(card, u, ph + '단계 결과: AI라면? 소외 지역 = underserved');
    const n = T.playTo(ph); S.nextPhase(n); T.lay(n);
    const panel = S.underserved(n), fresh = cfg.nodes.filter((x) => x.fromPhase === ph + 1).map((x) => x.id);
    assert.deepEqual(panel.filter((id) => fresh.indexOf(id) < 0), u.filter((id) => fresh.indexOf(id) < 0), `${ph}단계 결과 목록 = ${ph + 1}단계 계획 AI 패널(새 정류장 빼고) ${u} / ${panel}`);
  }
});

test('P1-7: 청원이 바라는 곳(to)과 답하지 않은 청원 — 기본 모드 3단계 사건 청원은 답할 차례가 없어 결과·보고서에 남는다', () => {
  const Ch = require('../js/choices.js'), R = require('../js/report.js');
  const s = T.playTo(3);
  const fp = s.fixedPetition; assert.ok(fp && fp.to, '2단계 고정 청원에 바라는 곳 ' + JSON.stringify(fp));
  assert.ok(cfg.nodes.some((n) => n.id === fp.to) && fp.to !== fp.zone);
  const h3 = s.history.find((h) => h.phase === 3);
  assert.ok(h3.petition && !h3.petition.fixed, '재현: 3단계 사건 청원 ' + JSON.stringify(h3.petition));
  assert.equal(Ch.list(s).some((p) => p.phase === 3), false, '기본 모드 사건 청원은 답하는 목록에 없음(지금 흐름 그대로)');
  const un = Ch.unanswered(s);
  assert.deepEqual(un.map((p) => [p.phase, p.zone]), [[3, h3.petition.zone]], '답하지 않은 청원 = 3단계 사건 청원');
  assert.ok(un[0].to, '바라는 곳');
  const names = (id) => cfg.nodes.find((n) => n.id === id).name;
  const rep = R.build ? R.build(s, { won: (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원', duration: (v) => Math.floor(v / 60) + '시간', rate: (r) => Math.round(r * 100) + '%', name: names, route: (n) => n + '번 노선', choices: { many: '더 많은 사람을 빠르게', longest: '오래 기다린 사람부터' }, date: new Date(2026, 10, 18) }) : null;
  if (rep) {
    const lines = rep.choices.petitions.map((p) => p.text);
    assert.ok(lines.some((t) => t.startsWith('3단계 ' + names(h3.petition.zone) + ' 주민 청원 · 답하지 않은 청원 · ') && t.includes('가는 버스를 늘려 주세요') && t.includes('못 간 이동 ' + h3.petition.count + '건')), JSON.stringify(lines));
  }
  // 고정 청원이 답할 목록은 그대로
  assert.deepEqual(Ch.list(s).map((p) => [p.kind, p.phase, p.answer]), [['fixed', 2, 3]]);
});

test('P1-9: 엔딩 총평 세 갈래 — 두 점수와 주요 인물 만족 수(계산식 그대로, 문장만)', () => {
  const N = require('../js/narrative.js'), hist = [{ metrics: { costs: { total: 10000 } } }], R = (k, n) => Array.from({ length: n }, (_, i) => ({ satisfied: i < k }));
  const ov = (f, m) => ({ finance: { score: f }, mobility: { score: m } }), v = (k, n, f, m) => N.endingConclusion(R(k, n), hist, { cause: 'complete' }, ov(f, m)).verdict;
  // 재현: 재정 21점 · 6명 중 3명 불만족 — 예전에는 ‘나름 잘 설계했어요’
  assert.equal(N.endingConclusion(R(3, 6), hist, { cause: 'complete' }).verdict, '도시 노선을 나름 잘 설계했어요. 하지만 이게 최선이었을까요?', '점수 없이 부르면 예전 그대로');
  assert.equal(v(3, 6, 21, 80), '주요 인물 6명 중 3명이 만족하지 못했어요. 재정 건전성은 21점이에요. 누구의 이동과 어떤 비용을 먼저 챙길지 다시 설계해 봐요.');
  assert.equal(v(6, 6, 100, 82), '다양한 사람들을 만족시켰어요.');
  assert.equal(v(6, 6, 60, 82), '도시 노선을 나름 잘 설계했어요. 하지만 이게 최선이었을까요?', '모두 만족해도 재정이 70 아래면 보통');
  assert.equal(v(4, 6, 100, 82), '도시 노선을 나름 잘 설계했어요. 하지만 이게 최선이었을까요?');
  assert.equal(v(6, 6, 100, 40), '이동 수요 충족은 40점이에요. 누구의 이동과 어떤 비용을 먼저 챙길지 다시 설계해 봐요.');
  assert.equal(N.endingConclusion(R(6, 6), hist, { cause: 'complete' }, { finance: null, mobility: { score: 90 } }).verdict, '다양한 사람들을 만족시켰어요.', '재정 보류(null)는 따지지 않음');
  // 파산·계약 종료는 예전 문장 그대로
  assert.match(N.endingConclusion(R(3, 6), [{ metrics: { costs: { total: -5000 } } }], { cause: 'bankrupt' }, ov(0, 80)).verdict, /파산했어요/);
});

test('P2: 빈칸 조사 — 받침에 맞는 을·를·이·가로 끝나면 붙이지 않는다', () => {
  const NT = require('../js/stage-notes.js');
  assert.equal(NT.particle('노선을', '을를'), ''); assert.equal(NT.particle('버스를', '을를'), ''); assert.equal(NT.particle('나래가', '이가'), ''); assert.equal(NT.particle('기차역이', '이가'), '');
  assert.equal(NT.particle('외곽 마을', '을를'), '을', '낱말 끝 ‘을’(마을)은 조사가 아님'); assert.equal(NT.particle('아이', '이가'), '가', '아이');
  assert.equal(NT.particle('노선', '을를'), '을'); assert.equal(NT.particle('버스', '을를'), '를'); assert.equal(NT.particle('기차역', '이가'), '이');
});
test('P2: 저장본 버전 읽기(Storage.saveVersion) — 이어할 수 없는 예전 버전 안내용', () => {
  const St = require('../js/storage.js'), mem = (v) => { const m = new Map(v ? [[St.SAVE_KEY, v]] : []); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: (k) => m.delete(k) }; };
  assert.equal(St.saveVersion(mem(JSON.stringify({ version: 'pb-3.0.0', session: {} }))), 'pb-3.0.0');
  assert.equal(St.saveVersion(mem(null)), null); assert.equal(St.saveVersion(mem('{깨짐')), null);
  assert.equal(St.saveState([cfg.SCENARIO_VERSION].concat(cfg.SAVE_COMPAT), mem(JSON.stringify({ version: 'pb-3.0.0', session: {} }))).state, 'none', '예전 버전은 지금처럼 none(조용히 버림)');
});
