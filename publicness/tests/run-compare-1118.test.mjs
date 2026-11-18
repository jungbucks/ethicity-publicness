// 2026-11-18 외부 검토 8·9번: 결과 화면 '지난번 같은 단계와 비교'(js/run-compare.js)
//  8. 일반 노선을 직행·광역으로 바꿔도(정류장·버스 수 같음) '계획은 지난번과 같아요' — 요약에 노선마다 차량 종류(Schedule.routeVehicleId)를 남겨 비교한다.
//     색만 다른 같은 성능의 일반 노선은 여전히 같은 계획. 차량 기록이 없는 예전 요약은 차이를 짐작해 적지 않는다(같다고 단정도 하지 않는다).
//  9. 무임 유지와 폐지를 바꿔도 계획 설명은 같다고 나옴 — 요약에 그 단계에 적용된 무임 정책과 이미 계산한 '집에 머문 이동'을 남겨 비교한다.
//     정책 기록이 없는 예전 요약과는 '같아요'라고 말하지 않는다.
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js'), RC = require('../js/run-compare.js'), Q = require('../js/schedule.js'), C = require('../js/choices.js');
const T = require('../tools/random-finance-1112.cjs');
const f = { duration: (v) => v + '분', won: (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원', route: (n) => ({ 1: '빨강 노선', 2: '초록 노선', 5: '직행 노선', 6: '광역 노선' })[n] || n + '번 노선', name: (id) => id };
const copy = (o) => JSON.parse(JSON.stringify(o));
const ctx = (s) => ({ config: s.config, elder: S.elderChoice(s) });

// 지정 세팅 42(도전 규칙 적용), A→B에 버스 한 대
const s42 = S.create(cfg, { mode: 'fixed', seed: 42 });
const h6 = { phase: 6, metrics: { maxWait: 30, N: 10, arrived: 8, costs: { total: 1000 } }, residents: {} };
const draftOf = (num, busId) => ({ routes: [{ num, nodes: ['A', 'B'], stops: [true, true] }], buses: [{ id: busId, routeNum: num }] });

test('8번 재현: 지정 세팅 42에서 A–B 일반 노선과 직행 노선은 한 바퀴가 다르다(엔진 값)', () => {
  const g = S.graph(s42), r = { nodes: ['A', 'B'], stops: [true, true] };
  assert.ok(s42.config.challengeApplied);
  assert.notEqual(Q.routeCycle(g, s42.config, 1, r), Q.routeCycle(g, s42.config, 5, r), '일반 vs 직행 한 바퀴');
});

test('8번: 일반 ↔ 직행, 일반 ↔ 광역은 달라진 계획으로 알린다', () => {
  const reg = RC.summary(h6, draftOf(1, 1), ctx(s42)), exp = RC.summary(h6, draftOf(5, 7), ctx(s42)), rgn = RC.summary(h6, draftOf(6, 9), ctx(s42));
  assert.equal(reg.routes[0].vehicle, 'regular'); assert.equal(exp.routes[0].vehicle, 'express'); assert.equal(rgn.routes[0].vehicle, 'regional');
  assert.notDeepEqual(RC.planChanges(reg.routes, exp.routes, f), [], 'planChanges가 비면 안 된다');
  assert.equal(RC.lines(reg, exp, f).plan, '달라진 계획: 직행 노선 일반 버스 → 직행 버스로 바꿈');
  assert.equal(RC.lines(exp, reg, f).plan, '달라진 계획: 빨강 노선 직행 버스 → 일반 버스로 바꿈');
  assert.equal(RC.lines(reg, rgn, f).plan, '달라진 계획: 광역 노선 일반 버스 → 광역 버스로 바꿈');
});

test('8번: 같은 성능의 일반 노선끼리 색만 바꾼 것은 여전히 같은 계획', () => {
  const a = RC.summary(h6, draftOf(1, 1), ctx(s42)), b = RC.summary(h6, draftOf(2, 1), ctx(s42));
  assert.equal(b.routes[0].vehicle, 'regular');
  assert.deepEqual(RC.planChanges(a.routes, b.routes, f), []);
  assert.equal(RC.lines(a, b, f).plan, '계획은 지난번과 같아요.');
  // 기본 모드(도전 규칙 없음)는 5번도 일반 버스
  const sd = S.create(cfg, { mode: 'default' }), d1 = RC.summary(h6, draftOf(1, 1), ctx(sd)), d5 = RC.summary(h6, draftOf(5, 1), ctx(sd));
  assert.equal(d5.routes[0].vehicle, 'regular'); assert.equal(RC.lines(d1, d5, f).plan, '계획은 지난번과 같아요.');
});

test('8번: 차량 기록이 없는 예전 요약은 차이를 짐작하지 않고, 같다고 단정하지도 않는다', () => {
  const noVehicle = (o) => { o.routes.forEach((r) => { delete r.vehicle; }); return o; };
  const old = noVehicle(RC.summary(h6, draftOf(1, 1), ctx(s42))), exp = RC.summary(h6, draftOf(5, 7), ctx(s42));
  assert.equal(RC.summary(h6, draftOf(1, 1)).routes[0].vehicle, undefined, '설정 없이 만든 요약 = 예전 요약 모양');
  assert.deepEqual(RC.planChanges(old.routes, exp.routes, f), [], '짐작한 차이 없음');
  const plan = RC.lines(old, exp, f).plan;
  assert.ok(!plan.includes('직행 버스') && !plan.includes('같아요'), plan);
  assert.equal(plan, '지난 기록에 버스 종류가 남아 있지 않아 계획이 같은지 다 비교하지 못했어요.');
  // 번호가 같으면(같은 조건 키 = 같은 모드) 차량도 같으니 예전 요약과도 같은 계획
  assert.equal(RC.lines(noVehicle(RC.summary(h6, draftOf(5, 7), ctx(s42))), exp, f).plan, '계획은 지난번과 같아요.');
  // 차량·정책 모두 없는 예전 기록(6단계 = 무임 정책 단계)은 둘 다 모른다고 적는다
  assert.equal(RC.lines(RC.summary(h6, draftOf(1, 1)), exp, f).plan, '지난 기록에 무임 정책·버스 종류가 남아 있지 않아 계획이 같은지 다 비교하지 못했어요.');
});

// 9번: 지정 세팅 42를 3단계까지 같은 계획으로 지나고, 4단계를 같은 노선으로 두 번(유지·폐지) 계산
function phase4(choice) {
  const s = S.create(cfg, { mode: 'fixed', seed: 42 });
  while (s.phase < 4) { T.lay(s, T.moderate(s), 0); T.answer(s); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  T.lay(s, T.moderate(s), 0); T.answer(s); C.set(s, 'elder', 'choice', choice); assert.deepEqual(S.validate(s), []);
  S.startRun(s); S.finishRun(s);
  const h = s.history[s.history.length - 1]; assert.equal(h.phase, 4);
  return { s, h, sum: RC.summary(h, s.draft, ctx(s)) };
}
const keep = phase4('keep'), abolish = phase4('abolish');

test('9번 재현: 같은 노선·다른 무임 정책 — 집에 머문 이동과 단계 수지가 다르다(엔진 값)', () => {
  assert.deepEqual(keep.sum.routes, abolish.sum.routes, '노선·버스는 같다');
  assert.equal(keep.sum.policy.stayHome, 0); assert.ok(abolish.sum.policy.stayHome > 0, '폐지 = 집에 머문 이동 있음');
  assert.notEqual(Math.round(keep.sum.total), Math.round(abolish.sum.total));
  assert.equal(keep.sum.policy.elder, 'keep'); assert.equal(abolish.sum.policy.elder, 'abolish');
});

test('9번: 정책이 바뀌면 달라진 계획에 무임 유지 → 폐지(집에 머문 이동 수와 함께)', () => {
  const plan = RC.lines(keep.sum, abolish.sum, f).plan;
  assert.ok(plan.includes('무임 유지 → 폐지'), plan);
  assert.equal(plan, '달라진 계획: 어르신 무임 유지 → 폐지(집에 머문 이동 0건 → ' + abolish.sum.policy.stayHome + '건)');
  assert.ok(RC.lines(abolish.sum, keep.sum, f).plan.startsWith('달라진 계획: 어르신 무임 폐지 → 유지('));
  assert.equal(RC.lines(keep.sum, copy(keep.sum), f).plan, '계획은 지난번과 같아요.', '같은 정책·같은 노선');
  // 노선이 함께 바뀌어도 정책 변화는 앞에(두 가지까지만 보여서 잘리지 않게)
  const moved = copy(abolish.sum); moved.routes.forEach((r) => { r.buses += 1; });
  assert.ok(RC.lines(keep.sum, moved, f).plan.startsWith('달라진 계획: 어르신 무임 유지 → 폐지('));
});

test('9번: 정책 기록이 없는 예전 비교 기록과는 같다고 말하지 않는다', () => {
  const old = copy(abolish.sum); delete old.policy; old.routes.forEach((r) => { delete r.vehicle; });
  const plan = RC.lines(old, abolish.sum, f).plan;
  assert.ok(!plan.includes('같아요'), plan);
  assert.equal(plan, '지난 기록에 무임 정책이 남아 있지 않아 계획이 같은지 다 비교하지 못했어요.');
  // 다른 변화가 있으면 그 변화는 그대로 + 비교 못 한 부분을 덧붙인다
  const more = copy(abolish.sum); more.routes[0].buses += 1;
  assert.match(RC.lines(old, more, f).plan, /^달라진 계획: .+ 버스 \d대 → \d대 \(지난 기록에 무임 정책이 없어 그 부분은 비교하지 못했어요\)$/);
  // 무임 정책이 없는 단계(1~3단계)는 예전 기록과도 그대로 같은 계획
  const p2 = { phase: 2, metrics: { maxWait: 30, N: 10, arrived: 8, costs: { total: 1000 } }, residents: {} };
  const a = RC.summary(p2, draftOf(1, 1)), b = RC.summary(p2, draftOf(1, 1), ctx(s42));
  assert.deepEqual(b.policy, {}, '정책이 없는 단계 = 빈 정책(예전 기록과 구분)');
  assert.equal(RC.lines(a, b, f).plan, '계획은 지난번과 같아요.');
});

test('결과 화면이 요약에 설정과 무임 정책을 넘긴다(ui-transition compareLines)', async () => {
  const fs = await import('node:fs'), src = fs.readFileSync(new URL('../js/ui-transition.js', import.meta.url), 'utf8');
  assert.ok(src.includes('RC.summary(h,s.draft,{config:s.config,elder:PB.Session.elderChoice(s)})'));
});
