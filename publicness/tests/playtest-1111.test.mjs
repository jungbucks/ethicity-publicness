// 2026-11-11 교사 플레이테스트 지적 13건 — 엔진·문장 쪽 단위 검사(화면은 tests/playtest-1111-browser.mjs)
//  기본 모드 · 시드 42 · ‘무난한 노선’(tools/econ-review.cjs 균형 계획과 같은 것 — tests/playtest-1111-plan.cjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), A = require('../js/advisor.js'), P = require('./playtest-1111-plan.cjs');

test('2번: 결과 화면 AI는 다음 단계 수요로 계산해도 이번 단계에 보이는 정류장으로만 노선을 짠다', () => {
  const s = P.playTo(2); // 2단계 결과 화면(신도시는 3단계부터)
  const vis = S.visibleNodeIds(s), base = S.plannedNext(s);
  assert.equal(base.phase, 3); assert.ok(vis.indexOf('I') < 0 && S.visibleNodeIds(base).indexOf('I') >= 0);
  const nodesOf = (rec) => [...new Set(rec.plan.buses.flatMap((b) => (b.route ? b.route.nodes : [])))];
  // 좁히지 않으면(예전) 아직 없는 신도시를 추천한다 — 재현
  const leak = ['time', 'reach', 'profit'].some((g) => nodesOf(A.recommendSync(S.revealed(base), g)).indexOf('I') >= 0);
  assert.equal(leak, true, '예전 동작 재현: 신도시가 추천에 들어감');
  for (const g of ['time', 'reach', 'profit']) {
    const rec = A.recommendSync(S.revealed(base, { allowNodes: vis }), g);
    assert.deepEqual(nodesOf(rec).filter((n) => vis.indexOf(n) < 0), [], g + ': 추천 노선의 정류장은 모두 2단계에 보이는 정류장');
    assert.deepEqual(rec.targets.filter((n) => vis.indexOf(n) < 0), [], g + ': 소외 지역 대상도 보이는 정류장만');
  }
  // 계획 화면(좁히지 않음)은 그대로 — allowNodes가 없으면 그 단계 지도 전체
  assert.equal(S.revealed(base).allowNodes, null);
});

test('5번: 노선 색 이름은 인물 이름과 겹치지 않고(하늘 → 파랑), 색 이름 바로 뒤에 조사를 직접 적은 문장이 없다', () => {
  const Names = require('../js/route-names.js'), fs = require('node:fs'), path = require('node:path'), s = { config: cfg };
  const people = cfg.residents.concat(cfg.challenge.residents).map((r) => r.name);
  cfg.ui.routeNames.forEach((n) => assert.ok(people.indexOf(n) < 0, '인물 이름과 겹침: ' + n));
  assert.equal(cfg.ui.routeNames.length, cfg.ui.routeColors.length); assert.equal(cfg.ui.routeColors[3], '#4A9CC2', '색은 그대로(이름만 바꿈)');
  assert.equal(Names.route(4, s), '파랑 노선'); assert.equal(Names.bus(4, s, 4), '파랑 버스');
  assert.equal(Names.text('4번 노선을 고쳤어요. 4번 노선으로 옮겨요.', s), '파랑 노선을 고쳤어요. 파랑 노선으로 옮겨요.');
  // 색 이름만 쓰고 조사를 붙이는 곳은 Narrative.josa가 받침으로 고른다
  const N = require('../js/narrative.js');
  assert.equal(N.josa(Names.color(4, s), '과와'), '파랑과'); assert.equal(N.josa(Names.color(5, s), '과와'), '보라와'); assert.equal(N.josa(Names.color(4, s), '이가'), '파랑이');
  // 소스 검사: Names.color(…)·C(…) 바로 뒤에 조사 글자로 시작하는 문자열을 잇지 않는다(‘ 노선’·‘ 버스’처럼 띄어서만)
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(src, /Names\.color\([^()]*\)\s*\+\s*'(은|는|이|가|을|를|과|와|으로|로)[ ']/, f + ': 색 이름 뒤에 조사를 직접 적음');
  });
});

test('6번: 노선을 고칠 수 있게 되는 11:00에는 어떤 배속이든 한 번 선다(RunPace.nextStop must)', () => {
  const RP = require('../js/run-pace.js'), stops = [{ t: 12, what: 'done' }, { t: 40, what: 'window' }, { t: 40, what: 'done', resident: 'x' }, { t: 70, what: 'done' }];
  assert.deepEqual(RP.nextStop(0, { mode: 'normal', notables: stops, checkpoint: null, must: 40 }), { t: 40, kind: 'notable', items: [stops[1], stops[2]] }, '1×·2×에서도 11:00에 멈추고 같은 시각 인물 판정도 함께');
  assert.equal(RP.nextStop(0, { mode: 'next', notables: stops, must: 40 }).t, 12, '⏭는 그 전 인물 멈춤이 먼저');
  assert.equal(RP.nextStop(12, { mode: 'next', notables: stops, must: 40 }).t, 40);
  assert.equal(RP.nextStop(40, { mode: 'normal', notables: stops, must: 40 }), null, '한 번만 — 지나간 뒤에는 서지 않음');
  assert.equal(RP.nextStop(40, { mode: 'next', notables: stops, must: 40 }).t, 70);
  assert.equal(RP.nextStop(0, { mode: 'normal', notables: stops, must: null }), null, '1·2단계·이미 고친 날은 전과 같음');
  // 화면 문장: 시작할 때는 ‘11:00부터’, 지난 단계 문장을 그대로 두지 않는다(ui-run start가 상태 줄을 새로 씀)
  const src = require('node:fs').readFileSync(new URL('../js/ui-run.js', import.meta.url), 'utf8');
  assert.match(src, /'운행 시작 · ' \+ span\[0\] \+ '부터 노선을 한 번 고칠 수 있어요\.'/); assert.match(src, /setStatus\(startText\(s\)\);/);
});

test('7번: 노선별 배차 간격(한 바퀴 ÷ 버스 수)과 기준 초과, 출발 점검에 기준 넘는 노선·버스 없는 노선', () => {
  const Q = require('../js/schedule.js'), D = require('../js/demand.js');
  const s = S.create(cfg); P.lay(s);
  const g = S.graph(s), gaps = S.routeGaps(s), r1 = S.routeByNum(s, 1);
  assert.deepEqual(gaps.map((x) => [x.num, x.buses, x.valid]), [[1, 1, true], [2, 1, true]]);
  assert.equal(gaps[0].headway, Q.cycleMinutes(g, s.config, 1, r1) / 1);
  gaps.forEach((x) => assert.equal(x.over, x.headway > cfg.service.maxWait, '기준 = 주요 인물 대기 기준(' + D.duration(cfg, cfg.service.maxWait) + ')'));
  assert.equal(D.duration(cfg, cfg.service.maxWait), '4시간 3분');
  assert.equal(D.duration(cfg, gaps[0].headway), '3시간 54분'); assert.equal(gaps[0].over, false, '외곽 마을–대학교–주거지–기차역 한 대는 기준 안');
  // 3단계 무난한 노선의 신도시–병원–기차역–일자리 한 대 = 4시간 30분 → 기준 넘음
  const s3 = P.playTo(2); S.nextPhase(s3); P.lay(s3); const g3 = S.routeGaps(s3);
  assert.deepEqual(g3.map((x) => [x.buses, D.duration(cfg, x.headway), x.over]), [[2, '1시간 57분', false], [1, '4시간 30분', true], [1, '2시간 24분', false]]);
  assert.deepEqual(S.departChecks(s3).overGap.map((x) => x.num), [2]); assert.deepEqual(S.departChecks(s3).idleRoutes, []);
  // 같은 노선에 한 대 더 → 간격 절반
  S.assign(s, 2, 1); const two = S.routeGaps(s);
  assert.equal(two[0].headway, gaps[0].headway / 2); assert.equal(two[0].buses, 2); assert.equal(two[1].buses, 0); assert.equal(two[1].headway, null);
  const c = S.departChecks(s);
  assert.deepEqual(c.idleRoutes, [2], '완성됐는데 버스가 없는 노선'); assert.deepEqual(c.overGap.map((x) => x.num), two.filter((x) => x.over).map((x) => x.num));
  // 미완성 노선(정류장 한 곳)은 간격도 ‘버스 없는 노선’도 아니다
  S.routeByNum(s, 2).nodes = ['D']; S.routeByNum(s, 2).stops = [true];
  assert.deepEqual(S.departChecks(s).idleRoutes, []); assert.equal(S.routeGaps(s)[1].valid, false);
});

test('8번: 청원이 말한 이동을 같은 기준(그 구역·그 시각까지 생긴 요청 중 그때까지 못 간 이동)으로 3단계에도 센다', () => {
  const s2 = P.playTo(2), fp = s2.fixedPetition, ps2 = s2.current.result.passengers;
  assert.ok(fp && fp.total > 0, '2단계 고정 청원');
  const again = S.petitionZoneAt(ps2, fp.t, fp.zone);
  assert.deepEqual([again.zone, again.t, again.count, again.total], [fp.zone, fp.t, fp.count, fp.total], '청원 문장의 숫자와 같은 셈');
  assert.equal(s2.history[1].petitionCheck, undefined, '2단계에는 없음');
  const s3 = P.playTo(3), h3 = s3.history[2];
  assert.deepEqual(h3.petitionCheck, S.petitionZoneAt(s3.current.result.passengers, fp.t, fp.zone));
  assert.equal(h3.petitionCheck.zone, fp.zone); assert.equal(h3.petitionCheck.t, fp.t);
  // 그 구역에서 그 시각까지 생긴 요청만, 그때까지 도착하지 못한 것만
  const toy = [{ o: 'D', t: 10, arriveT: 20 }, { o: 'D', t: 30, arriveT: 60 }, { o: 'D', t: 40, arriveT: null }, { o: 'D', t: 50, arriveT: null }, { o: 'A', t: 10, arriveT: null }];
  assert.deepEqual(S.petitionZoneAt(toy, 45, 'D'), { zone: 'D', t: 45, count: 2, total: 3 });
  // 저장본에도 남는다
  assert.deepEqual(S.restore(S.serialize(s3), cfg).history[2].petitionCheck, h3.petitionCheck);
});

test('13번: 엔딩 총평은 해요체, 금액 이름은 누적 잔액', () => {
  const N = require('../js/narrative.js');
  const hs = [1, 2, 3, 4, 5].map((p) => ({ phase: p, metrics: { costs: { total: 1000 } }, residents: {} }));
  const some = N.endingConclusion([{ satisfied: true }, { satisfied: false }], hs, { cause: 'complete' }), all = N.endingConclusion([{ satisfied: true }], hs, { cause: 'complete' });
  assert.equal(some.verdict, '도시 노선을 나름 잘 설계했어요. 하지만 이게 최선이었을까요?'); assert.equal(all.verdict, '다양한 사람들을 만족시켰어요.');
  [some, all, N.endingConclusion([], hs, { cause: 'contract' })].forEach((c) => { assert.doesNotMatch(c.verdict, /(했다|이다|있다|됐다|보자|을까)[.?]/, c.verdict); });
  assert.match(some.text, /누적 잔액 5,000원/); assert.doesNotMatch(some.text, /총 수익|누적 손익/);
  assert.match(N.endingConclusion([], hs, { cause: 'bankrupt' }).text, /보유 잔액 5,000원/);
});
