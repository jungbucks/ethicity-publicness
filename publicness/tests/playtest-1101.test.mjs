// 2026-11-01 플레이테스트 수정 — 조사 헬퍼(모든 정류장 이름 × 조사), 긴급 조정의 효과 없는 이동 막기·미리 보기
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), cfg = require('../js/config.js'), S = require('../js/session.js'), N = require('../js/narrative.js');

// 손으로 적은 정답표(받침 없음 → 를·가·는·와·로, 받침 있음 → 을·이·은·과·으로, ㄹ 받침은 ‘로’)
const EXPECT = {
  '기차역': ['을', '이', '은', '과', '으로'], '밀집 주거지': ['를', '가', '는', '와', '로'], '대학교': ['를', '가', '는', '와', '로'],
  '병원·공공서비스': ['를', '가', '는', '와', '로'], '구도심 시장': ['을', '이', '은', '과', '으로'], '외곽 마을': ['을', '이', '은', '과', '로'],
  '산업·일자리': ['를', '가', '는', '와', '로'], '종합운동장': ['을', '이', '은', '과', '으로'], '신도시': ['를', '가', '는', '와', '로'],
  '고속버스터미널': ['을', '이', '은', '과', '로'], '어린이·노인복지관': ['을', '이', '은', '과', '으로'], '호수공원': ['을', '이', '은', '과', '으로'],
  '솔잎몰': ['을', '이', '은', '과', '로'], '대도시': ['를', '가', '는', '와', '로']
};
const KINDS = ['을를', '이가', '은는', '과와', '으로'];

test('조사 헬퍼: 모든 정류장 이름(기본 + 도전 세팅) × 을/를·이/가·은/는·와/과·으로/로', () => {
  const names = new Set(cfg.nodes.map(n => n.name));
  for (const seed of [7, 42, 1234]) S.create(cfg, { mode: 'fixed', seed }).config.nodes.forEach(n => names.add(n.name));
  const rows = [];
  for (const name of names) {
    assert.ok(EXPECT[name], '정답표에 없는 정류장 이름: ' + name);
    const got = KINDS.map(k => N.josa(name, k));
    assert.deepEqual(got, EXPECT[name].map(j => name + j), name);
    rows.push(got.join(' | '));
  }
  assert.equal(rows.length, Object.keys(EXPECT).length, '모든 정류장 이름을 확인');
  console.log('  ' + rows.join('\n  '));
});

function phase3() {
  const s = S.create(cfg); s.phase = 3; s.owned = 4;
  s.draft.buses = [1, 2, 3, 4].map(id => ({ id, routeNum: id <= 2 ? 1 : id === 3 ? 2 : null, offset: 0 }));
  S.beginPlan(s); S.updateRoute(s, 1, { nodes: ['A', 'B'], stops: [true, true] }); S.updateRoute(s, 2, { nodes: ['F', 'D'], stops: [true, true] });
  S.startRun(s); return s;
}
test('긴급 조정: 지금 달리는 노선으로 ‘옮기기’는 받지 않고 조정권도 쓰지 않는다', () => {
  const s = phase3();
  assert.equal(S.busRouteAt(s, 1, 34), 1); assert.equal(S.busRouteAt(s, 4, 34), null, '쉬는 버스');
  assert.equal(S.emergencyDecision(s, 34, 1, 1), false); assert.equal((s.emergencyLog || []).length, 0, '조정권 그대로');
  assert.ok(S.emergencyDecision(s, 34, 1, 2));
  assert.equal(S.busRouteAt(s, 1, 67), 2, '앞선 조정으로 옮긴 노선이 지금 노선');
  assert.equal(S.emergencyDecision(s, 67, 1, 2), false, '옮겨 간 노선으로 다시 옮기기도 막음');
});
test('긴급 조정 미리 보기 = 실제로 그 노선에 들어가는 시각(저장·결과는 그대로)', () => {
  const s = phase3(), before = JSON.stringify(s.current.metrics), p = S.emergencyPreview(s, 34, 1, 2), q = S.emergencyPreview(s, 34, 4, 2);
  assert.equal(JSON.stringify(s.current.metrics), before, '미리 보기는 결과를 바꾸지 않음'); assert.equal((s.emergencyLog || []).length, 0);
  assert.equal(p.resting, false); assert.equal(q.resting, true); assert.ok(p.starts >= 34 && q.starts >= 34);
  assert.ok(S.emergencyDecision(s, 34, 1, 2));
  const tl = s.current.result.timelines.find(t => t.busId === 1);
  assert.equal(tl.assignments[0].t, p.starts, '미리 보기 시각 = 실제 합류 시각');
});
