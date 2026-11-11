// 2026-11-10 검토 5번: 무임 폐지 효과가 ‘이 게임의 가정’임을 고르기 전에 읽을 수 있게 — 정책 카드에 한 줄 + 접는 규칙 설명
//  · 대상·비율·요금은 js/config.js 값에서 만든다(설정을 바꾸면 문장도 바뀐다) · 실제 사회를 예측하는 모형이 아니라는 범위 · 어느 쪽이 정답인지 이끄는 말 없음
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),Elder=require('../js/elder.js'),N=require('../js/narrative.js');
const f={name:id=>N.nodeName(cfg,id),won:n=>N.won(n)};
const clone=o=>JSON.parse(JSON.stringify(o));
test('rule: 가정 한 줄과 규칙 줄 — 수치는 설정값 그대로', () => {
  const r=Elder.rule(cfg,4,f),all=r.lines.join('\n');
  assert.equal(r.assume,'이 게임에서는 요금이 생기면 일부 어르신이 이동을 포기한다고 가정해요.');
  assert.equal(cfg.elderFree.share,0.3);assert.equal(cfg.elderFree.abolishStay,0.5);assert.equal(cfg.finance.fare,1000);
  assert.match(all,/약 30%/);assert.match(all,/약 50%/);assert.match(all,/1,000원/);
  assert.match(all,/외곽 마을/);assert.match(all,/병원/);
  assert.match(all,/복지관/,'5단계에 생기는 대상 구역도 알림');
  assert.match(all,/유지하면/);assert.match(all,/폐지하면/);assert.match(all,/집에 머/);
  assert.match(all,/이동 수요 충족/);
  assert.match(all,/게임을 위해 정한 값/);assert.match(all,/실제 사회/);assert.match(all,/예측한 것이 아니에요/);
});
test('rule: 설정을 바꾸면 문장의 수치·대상이 따라 바뀐다', () => {
  const c=clone(cfg);c.elderFree.share=0.2;c.elderFree.abolishStay=0.25;c.finance.fare=1500;c.elderFree.zones=['F'];
  const all=Elder.rule(c,4,{name:id=>N.nodeName(c,id),won:f.won}).lines.join('\n');
  assert.match(all,/약 20%/);assert.match(all,/약 25%/);assert.match(all,/1,500원/);assert.doesNotMatch(all,/30%|50%|1,000원|병원|복지관/);
  const at5=Elder.rule(cfg,5,f).lines.join('\n');assert.match(at5,/복지관/);assert.doesNotMatch(at5,/단계부터/,'이미 열린 구역은 지금 대상에');
});
test('rule: 어느 쪽이 정답인지 이끄는 말이 없다', () => {
  const r=Elder.rule(cfg,4,f),all=[r.assume].concat(r.lines).join('\n');
  assert.doesNotMatch(all,/좋아요|나빠요|옳|틀리|바람직|추천|칭찬|벌점|손해|이득|해야 해요|하세요/);
});
test('카드 연결: 고르는 버튼 앞에 가정 한 줄과 접는 규칙 설명을 그린다', () => {
  const ui=fs.readFileSync(new URL('../js/ui-fairness.js',import.meta.url),'utf8');
  assert.match(ui,/PB\.Elder\.rule\(s\.config, s\.phase,/);
  assert.match(ui,/id: 'elder-assume'/);assert.match(ui,/id: 'elder-rule'/);
  assert.ok(ui.indexOf("id: 'elder-rule'")<ui.indexOf("options(App, s, 'elder'"),'선택 버튼보다 앞');
});
