// 2026-11-09 교사 플레이테스트 2: ‘출발했는데 미도착이라는 의미가 이해하기 어려워요’
// 학생이 보는 ‘미도착’을 쉬운 말로 — 건수 ‘목적지까지 못 간 이동 N건’ / 문장 ‘N건은 목적지까지 못 갔어요’ / 상태 ‘아직 못 감’. 숫자는 그대로
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),require=createRequire(import.meta.url);
test('학생 화면 문구에 ‘미도착’이 없다', () => {
  for (const f of ['js/narrative.js','js/ui-result.js','js/ui-ending.js','js/ui-scores.js','js/ui-transition.js','js/ui-plan.js','js/ui-hud.js','js/ui-run.js','index.html'])
    assert.doesNotMatch(read(f), /미도착/, f);
});
test('같은 뜻은 같은 말: 결과 카드 구간 상태·지역 버튼·두 점수 줄', () => {
  const result=read('js/ui-result.js'),scores=read('js/ui-scores.js'),nar=read('js/narrative.js'),tr=read('js/ui-transition.js'),end=read('js/ui-ending.js');
  assert.match(nar, /state:first\?'도착':'아직 못 감'/);
  assert.match(result, /leg\.state==='아직 못 감'\?'✕ '/);
  assert.match(result, /'첫 도착 '\+\(r\.arriveT!=null\?App\.clock\(r\.arriveT\):'아직 못 감'\)/);
  assert.match(result, /' · 목적지까지 못 간 이동 '\+\(g\.noLink\+g\.full\+g\.time\)\+'건 — 지도에서 보기'/);
  assert.match(scores, /'건은 목적지까지 못 갔어요'/); assert.doesNotMatch(scores, /가지 못했어요/);
  assert.match(tr, /목적지까지 못 간 사람이 운행이 끝날 때까지 기다린 시간도 포함해요\./);
  assert.match(end, /outboundIncomplete:'첫 목적지에 못 감'/);
});
test('지역 문장: 숫자는 그대로, 말만 바뀜', () => {
  const cfg=require('../js/config.js'),N=require('../js/narrative.js');
  const mob={ worst:{ id:'A', N:33, done:10, missed:23 }, zones:{ A:{ N:33, done:10 }, F:{ N:12, done:12 } } };
  assert.match(N.bridgeLine(cfg,1,[],mob), /^남은 비율이 가장 큰 곳은 기차역이에요\. 출발한 이동 33건 중 23건은 목적지까지 못 갔어요\./);
});
