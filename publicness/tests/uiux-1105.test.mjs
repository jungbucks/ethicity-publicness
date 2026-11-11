// 2026-11-05 UI/UX 지시서: 화면 없이 확인할 수 있는 계산(출발 전 점검·멈춤 정보·엔딩 문장)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), N = require('../js/narrative.js'), RP = require('../js/run-pace.js');
function start(phase) {
  const s = S.create(cfg, { mode: 'default' });
  while (s.phase < phase) { S.beginPlan(s); s.draft.routes[0].nodes = ['A', 'B']; s.draft.routes[0].stops = [true, true]; S.autoPlace(s, s.draft.routes[0].num); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  S.beginPlan(s); return s;
}
function route(s, num, nodes) { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); }

test('출발 전 점검: 노선 0개 = 운행 버스 없음, 모든 정류장·인물이 경고에 잡힌다', () => {
  const c = S.departChecks(start(1));
  assert.equal(c.noBus, true); assert.equal(c.resting, 2); assert.equal(c.restingCost, 2 * cfg.finance.holding);
  assert.equal(c.unserved.length, 7); assert.deepEqual(c.residents.map(r => r.name), ['하늘', '나래', '준']);
});
test('출발 전 점검: 새 정류장이 목록 앞, 버스 없는 노선은 ‘노선 없음’으로 친다', () => {
  const s = start(2); const c = S.departChecks(s);
  assert.equal(c.newStops[0], 'H'); assert.equal(c.unserved[0], 'H', '새 정류장 먼저');
  s.draft.buses.forEach(b => { b.routeNum = null; }); assert.equal(S.departChecks(s).noBus, true);
  assert.ok(S.departChecks(s).unserved.includes('A'), '버스가 없으면 그 노선 정류장도 서비스 없음');
});
test('출발 전 점검: 모든 인물이 이어진 계획이면 인물 경고 없음, 쉬는 버스 없음', () => {
  const s = start(1); route(s, 1, ['F', 'C', 'B', 'D']); route(s, 2, ['A', 'G']);
  const c = S.departChecks(s);
  assert.deepEqual([c.noBus, c.resting, c.residents.length], [false, 0, 0]); assert.deepEqual(c.unserved, ['E']);
});
test('기준 초과 멈춤에 가는 길·돌아오는 길(leg)이 붙고, 갈아타는 곳이면 그 정류장(node)을 안다', () => {
  const log = [{ type: 'board', pid: 1, t: 10 }, { type: 'alight', pid: 1, t: 12, node: 'C' }];
  const stops = RP.residentStops({ log, passengers: [{ id: 1, residentId: 'narae', leg: 'return', o: 'D', t: 0, status: 'waiting', waitTotal: 40 }] }, { bus: { window: 120, transferMin: 0 }, service: { maxWait: 27 } });
  assert.equal(stops.length, 1); assert.deepEqual([stops[0].what, stops[0].leg, stops[0].node], ['over', 'return', 'C']);
});
test('엔딩: 왕복한 날과 기준을 지킨 날을 한 문장으로(카드·컷이 같은 문장)', () => {
  const hist = [1, 2, 3, 4, 5].map(p => ({ phase: p, metrics: { costs: { total: 0 } }, residents: { haneul: { dayStatus: 'complete', satisfied: p !== 3, waitTotal: 1, o: 'B', d: 'C', homeT: 100 } } }));
  const r = N.endingReactions(cfg, hist).find(x => x.id === 'haneul');
  assert.match(r.text, /왕복 5회 중 기준\(4시간 3분 이내\)을 지킨 것은 4회예요\. 만족 기준은 4회 이상이에요\(누적 4\/4회\)\.$/);
  const story = N.residentStory(hist.map(h => h.residents.haneul), 'haneul', cfg);
  assert.match(story.text, /왕복 5회 중 기준\(4시간 3분 이내\)을 지킨 것은 4회예요\.$/);
});
test('파산 문장은 해요체', () => {
  const v = N.endingConclusion([], [{ metrics: { costs: { total: -1000 } } }], { cause: 'bankrupt' }).verdict;
  assert.match(v, /파산했어요\. 주민의 이동은 지키면서 운영 비용을 다시 설계해 봐요\.$/); assert.doesNotMatch(v, /했다|보자/);
});
