// 주민 이야기·말풍선·팀 저장 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('./planned-fixture.cjs');
const stories = require('../js/stories.js');
const N = require('../js/narrative.js');
const S = require('../js/session.js');
const St = require('../js/storage.js');

const rec = (status, waitTotal, extra = {}) => ({ t: 10, status, waitTotal, arriveT: status === 'arrived' ? 40 : null, firstBoardT: status === 'waiting' ? null : 20, boardings: status === 'waiting' ? 0 : 1, transfer: false, fail: null, ...extra });

test('haneul wait-dropped condition with evidence (AC21)', () => {
  const recs = [rec('arrived', 18), rec('arrived', 15), rec('arrived', 14), rec('arrived', 12), rec('arrived', 10)];
  const s = N.residentStory(recs, 'haneul', cfg);
  assert.equal(s.conditionKey, 'haneul.waitDropped');
  assert.equal(s.text, stories.residents.haneul['haneul.waitDropped'].text);
  assert.equal(s.evidence.length, 5);
  assert.equal(s.evidence[0].waitTotal, 18);
  assert.equal(s.evidence[4].waitTotal, 10);
  assert.equal(s.drop, 8);
});

test('no false change narrative', () => {
  const recs = [rec('arrived', 18), rec('arrived', 18), rec('arrived', 18), rec('arrived', 20), rec('arrived', 18)];
  const s = N.residentStory(recs, 'haneul', cfg);
  assert.notEqual(s.conditionKey, 'haneul.waitDropped');
  assert.ok(['any.change', 'any.current'].includes(s.conditionKey));
  const same = N.residentStory([rec('arrived', 9), rec('arrived', 9)], 'haneul', cfg);
  assert.equal(same.conditionKey, 'any.current', '대기 변화 0이면 변화 문장 없음');
});

test('narae needs two recent completed runs', () => {
  const ok = [rec('waiting', 110), rec('waiting', 100), rec('arrived', 12), rec('arrived', 8), rec('arrived', 6)];
  assert.equal(N.residentStory(ok, 'narae', cfg).conditionKey, 'narae.nowArrives');
  const no = [rec('waiting', 110), rec('arrived', 12), rec('arrived', 8), rec('riding', 6), rec('arrived', 6)];
  const s2 = N.residentStory([...no.slice(0, 3), rec('riding', 6), rec('waiting', 30)], 'narae', cfg);
  assert.notEqual(s2.conditionKey, 'narae.nowArrives');
});

test('sol only from phase 3', () => {
  const never = [null, null, rec('waiting', 80), rec('waiting', 70), rec('waiting', 60)];
  const s = N.residentStory(never, 'sol', cfg);
  assert.equal(s.conditionKey, 'sol.neverBoarded');
  assert.deepEqual(s.evidence.map((e) => e.phase), [3, 4, 5]);
  const riding = [null, null, rec('waiting', 80), rec('arrived', 10), rec('riding', 20)];
  assert.equal(N.residentStory(riding, 'sol', cfg).conditionKey, 'sol.ridingAtEnd');
  assert.equal(N.residentStory([null, null, null, null, null], 'sol', cfg), null);
});

test('closing announcement completes the title', () => {
  const arrived = N.residentStory([rec('waiting', 100), rec('arrived', 10)], 'narae', cfg);
  assert.equal(arrived.closing, '이번 정류장은 병원·공공서비스입니다. 나래가 내렸습니다.');
  const not = N.residentStory([rec('arrived', 10), rec('waiting', 100)], 'narae', cfg);
  assert.equal(not.closing, '나래는 아직 이 정류장에 닿지 못했습니다.');
  const jun = N.residentStory([rec('arrived', 3)], 'jun', cfg);
  assert.equal(jun.closing, '이번 정류장은 기차역입니다. 준이 내렸습니다.');
});

test('josa follows final consonant', () => {
  assert.equal(N.fill('{name}{이가}', { name: '준' }), '준이');
  assert.equal(N.fill('{name}{이가}', { name: '하늘' }), '하늘이');
  assert.equal(N.fill('{name}{이가}', { name: '나래' }), '나래가');
  assert.equal(N.fill('{name}{은는}', { name: '솔' }), '솔은');
  assert.equal(N.fill('{name}{은는}', { name: '나래' }), '나래는');
  assert.equal(N.fill('{a}분', { a: 7 }), '7분');
});

test('bubbles are backed by the log', () => {
  const s = S.create(cfg, { mode: 'default' });
  S.beginPlan(s);
  const res = S.startRun(s);
  const bs = N.bubbles(res, cfg, 120);
  assert.ok(bs.length > 0 && bs.length <= 12);
  for (const b of bs) {
    const p = res.passengers.find((x) => x.id === b.pid);
    assert.ok(b.t >= p.t, '요청 이전 말풍선 없음');
    if (b.kind === 'wait') {
      assert.ok(p.firstBoardT == null || p.firstBoardT > b.t, '그 시각까지 아직 타지 않음');
      assert.ok(b.text.includes(String(b.t - p.t)));
    }
    if (b.kind === 'arrive') assert.equal(p.arriveT, b.t);
  }
  assert.ok(bs.some((b) => b.residentId === 'narae'), '나래(F)는 노선이 없어 말풍선이 있다');
  assert.ok(N.bubbles(res, cfg, 30).every((b) => b.t <= 30));
});

test('stories never invent out-of-ride outcomes', () => {
  const all = JSON.stringify(stories);
  for (const w of ['취업', '합격', '건강', '병이 나', '성공', '행복해']) assert.ok(!all.includes(w), w);
  assert.equal(stories.reflection.length, 3);
  assert.equal(stories.reflection[0], '어떤 목표를 선택했고 실제 결과는 예상과 어떻게 달랐나요?');
});

test('hook lines come from the real default draft', () => {
  const s = S.create(cfg, { mode: 'default' });
  // 앞선 테스트가 cfg를 바꿀 수 있어 값은 세션에서 다시 계산해 비교한다
  const lines = N.hookLines(s), reqs = require('../js/demand.js').base(s.config, 1, s.seed).length;
  assert.equal(lines[0], '버스 ' + s.owned + '대, 첫 운행의 이동 요청 ' + reqs + '건.');
  assert.ok(lines[1].length > 0);
});

test('storage is safe without localStorage', () => {
  assert.equal(St.readPlayer(), null);
  assert.equal(St.writeResult('x'), false);
});

test('storage reads player and writes only the team result key', () => {
  const store = { 'ethicity.player': '{"character":"char_03","nickname":"반짝이는 고래"}' };
  const fake = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  assert.deepEqual(St.readPlayer(fake), { nickname: '반짝이는 고래' });
  assert.equal(St.writeResult('카드', fake), true);
  assert.deepEqual(JSON.parse(store['ethicity.result.publicness']), { game: 'publicness', completed: true, ending: null, card: '카드' });
  assert.equal(St.readPlayer({ getItem: () => '{"nick' }), null);
  assert.equal(St.readPlayer({ getItem: () => '{"nickname":["x"]}' }), null);
});

test('non-resident no-link bubbles appear once per origin-destination pair', () => {
  const s = S.create(cfg, { mode: 'default' });
  S.beginPlan(s);
  const res = S.startRun(s);
  const bs = N.bubbles(res, cfg, 120).filter((b) => b.kind === 'noLink' && !b.residentId);
  const pairs = bs.map((b) => { const p = res.passengers.find((x) => x.id === b.pid); return p.o + p.d; });
  assert.equal(new Set(pairs).size, pairs.length);
  assert.ok(N.bubbles(res, cfg, 120).some((b) => b.kind === 'wait'), '기다림 말풍선도 섞인다');
});
