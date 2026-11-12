// 2026-11-02 P2-a 재수정(검증에서 남은 것): 이동은 ‘건’으로 셈(같은 화면에서 명·건 섞지 않음), 화면 문구는 ‘-어요’ 말투, 운행 안내문은 ‘다음 멈춤까지’ 한 이름
// 컷 대사(stories.cuts 등 원문)는 대상이 아니다 — 사용자 결정(컷 대사 원문 유지)
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), S = require('../js/session.js'), stories = require('../js/stories.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('잘못된 세팅 번호 안내·제목 훅 둘째 문장은 -어요 말투', () => {
  assert.equal(S.parseSeedParam('abc').note, '세팅 번호는 정수여야 해요. 기본 세팅으로 시작해요.');
  assert.equal(stories.hook.line2.text, '그런데 지금 노선도에는 외곽 마을을 지나는 버스가 한 대도 없어요.');
});

test('도움말 모의 AI 설명·도전 모드 재정 알림에 -습니다가 남지 않음', () => {
  const html = read('index.html'), result = read('js/ui-result.js');
  assert.match(html, /가장 좋아지는 계획을 최대 3회 골라요\./); assert.doesNotMatch(html, /고릅니다/);
  assert.match(result, /0원 미만이면 운영 계약이 종료돼요\./); assert.doesNotMatch(result, /종료됩니다/);
});

test('이동 요청 단위는 건: 미도착 지역 버튼·주민 청원·돌발 수요 소식·버스를 탄 요청', () => {
  const result = read('js/ui-result.js'), run = read('js/ui-run.js'), tr = read('js/ui-transition.js');
  assert.match(result, /' · 목적지까지 못 간 이동 '\+\(g\.noLink\+\(g\.transfers\|\|0\)\+g\.full\+g\.time\)\+'건 — 지도에서 보기'/);
  assert.doesNotMatch(result + tr, /건 중 ' ?\+ ?h\.petition\.count ?\+ ?'명/);
  assert.match(result, /h\.petition\.count \+ '건이 아직 도착하지 못했어요\.'/); assert.match(tr, /h\.petition\.count\+'건이 아직 도착하지 못했어요\.'/);
  assert.match(result, /\['버스를 탄 요청\(한 번 이상 탐\)', m\.users \+ '건 \/ ' \+ m\.N \+ '건'\]/); assert.doesNotMatch(result, /이용자\(한 번 이상 탄 사람\)/);
  assert.match(run, /동안 12건\)\./); assert.doesNotMatch(run, /동안 12명/);
  assert.match(run, /'우리 동네에서 출발한 요청 ' \+ e\.data\.count \+ '건이 아직 도착하지 못했어요\.'/);
});

test('운행 안내문: 단계와 무관하게 ‘⏭ 다음 멈춤까지’, 멈추는 곳 = 노선 고치기 시작 11:00(3단계부터, 2026-11-09 긴급 조정 대체)·주요 인물 왕복 완료·대기 기준 초과', () => {
  const run = read('js/ui-run.js');
  assert.doesNotMatch(run, /‘⏭ 다음 결정까지’는|‘⏭ 다음 사건까지’는/);
  assert.match(run, /' ‘⏭ 다음 멈춤까지’는 ' \+ \(hasEmergency\(s\) \? '노선을 고칠 수 있게 되는 ' \+ fixSpan\(\)\.split\('~'\)\[0\] \+ '이나 ' : ''\) \+ '주요 인물이 왕복을 마치거나 오늘 대기 기준을 넘긴 순간까지 빨리 간 뒤 멈춰요\.'/);
  assert.doesNotMatch(run, /다음 긴급 조정이나/);
});

test('재검증(11-02): AI에게 예상 물어보기의 미도착 지역·결과 첫 줄도 이동 요청은 건(사람 수 명과 섞지 않음)', () => {
  const plan = read('js/ui-plan.js'), result = read('js/ui-result.js');
  assert.match(plan, /'에서 출발하는 이동 요청 '\+\(z\.N-z\.arrived\)\+'건은 아직 도착하기 어려워요\.'/);
  assert.doesNotMatch(plan, /\(z\.N-z\.arrived\)\+'명/);
  assert.match(result, /'이동 요청 '\+m\.N\+'건 중 '\+m\.arrived\+'건이 목적지에 도착했어요\.'/);
  assert.doesNotMatch(result, /m\.N\+'명 중/);
});

test('재검증(11-02): 그날 마지막 멈춤 안내는 꺼진 ⏭ 대신 ▶·⏩', () => {
  const run = read('js/ui-run.js');
  assert.match(run, /\(stopsLeft\(\) \? '재개하면 ' \+ App\.speed \+ '배속, 다음 멈춤을 누르면 ' \+ nextLabel\(R\.s\) \+ ' 빨리 가요\.' : '남은 멈춤이 없어요\. 재개하거나 끝까지 가요\.'\)/);
});
