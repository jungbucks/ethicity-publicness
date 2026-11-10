// 2026-11-10 최종 리뷰 I1: 두 점수 화면의 사유 이름표가 Scores.mobility 사유 키를 모두 덮는다
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import vm from 'node:vm'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js'), S = require('../js/session.js');
const { playTo, balancedPlan } = require('./fairness-fixture.cjs');
test('ui-scores 사유 이름표 = Scores.mobility.reasons 키 전부', () => {
  const win = { PB: {} }; win.window = win;
  vm.runInNewContext(fs.readFileSync(new URL('../js/ui-scores.js', import.meta.url), 'utf8'), win);
  const s = playTo(S.create(cfg), 2, balancedPlan), keys = Object.keys(s.history[1].scores.mobility.reasons).sort();
  assert.ok(keys.includes('stayHome'));
  assert.deepEqual([...win.PB.UI.scoreReasonKeys()].sort(), keys);
});
