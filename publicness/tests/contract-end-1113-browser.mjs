// 2026-11-13 검토 P2 — 계약 종료 화면의 제목·총평·재정 돌아보기·결과 알림·인물 반응 마지막 컷이 같은 이유(같은 숫자)를 말하는지 실제 화면에서 본다.
//  지금 규칙: 시드 245525538 · 무난한 계획 + 매 단계 2대 임차(tools/random-finance-1112.cjs, 엔진 결과를 바꾸지 않음) → 2단계 정산 뒤 계약 종료.
//    node에서 2단계 결과 화면 저장본을 만들어 App.resume(이어하기와 같은 길)으로 열고, ‘운영 종료 화면 보기’를 눌러 종료 화면까지 간다(8단계 클릭 대신).
//  예전 규칙 저장본: 3단계까지 진행한 저장본에서 새 필드를 지우고 잔액이 남은 계약 종료를 넣는다(economy.test·finance-browser와 같은 방식).
//  화면 1280×800 · 390×844, 스크린샷 = SHOT_DIR(기본 publicness/tests)/_shot-c1113-*.png
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/contract-end-1113-browser.mjs   (브라우저는 한 번에 하나: D:/Works/.browser-test.lock)
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const cfg = require('../js/config.js'), S = require('../js/session.js'), T = require('../tools/random-finance-1112.cjs');
const SEED = 245525538, base = `http://127.0.0.1:${server.address().port}/publicness/?seed=${SEED}&no3d=1`, SHOT = process.env.SHOT_DIR || 'publicness/tests', shot = (n) => `${SHOT}/_shot-c1113-${n}.png`;
const log = (m) => console.log('  ok ' + m);
const TAIL = ' 그동안 주민이 해낸 이동은 기록에 남아 있어요. 어디서 돈이 나갔는지부터 다시 봐요.';
const NOW = '1·2단계를 마칠 때 누적 잔액이 2회 연속 0원 미만이어서 운영 계약이 종료됐어요.' + TAIL;
const OLD = '단계 적자가 누적 세 번 쌓여 운영 계약이 종료됐어요.' + TAIL;

// 지금 규칙: 2단계 결과 화면(계약 종료 확정, 아직 종료 화면 전)
const cur = S.create(cfg, { mode: 'random', seed: SEED });
while (!cur.end) { T.lay(cur, T.moderate(cur), 2); T.answer(cur); assert.deepEqual(S.validate(cur), []); S.startRun(cur); S.finishRun(cur); if (!cur.end) S.nextPhase(cur); }
assert.deepEqual([cur.stage, cur.end.cause, cur.end.phase, Math.round(cur.end.balance), cur.negStreak], ['result', 'contract', 2, -74221, 2]);
const SAVED_NOW = { version: cfg.SCENARIO_VERSION, savedAt: Date.now(), session: S.serialize(cur) };
// 예전 규칙: 3단계 결과 화면에서 ‘적자 3회’로 끝난 저장본(잔액은 남음)
const old = S.create(cfg, { mode: 'random', seed: SEED });
for (let p = 1; p <= 3; p++) { T.lay(old, T.moderate(old), 0); T.answer(old); S.startRun(old); S.finishRun(old); if (p < 3) S.nextPhase(old); }
const oldSession = JSON.parse(JSON.stringify(S.serialize(old))); delete oldSession.ledger; delete oldSession.negStreak; oldSession.deficits = 3;
oldSession.end = { cause: 'contract', phase: 3, balance: S.balance(old) }; assert.ok(oldSession.end.balance >= 0);
const SAVED_OLD = { version: cfg.SCENARIO_VERSION, savedAt: Date.now(), session: oldSession };
const won = (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function open(w, h, saved) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base); await page.waitForFunction(() => window.PB && PB.App && PB.App.resume);
  assert.equal(await page.evaluate((s) => PB.App.resume(s), saved), true);
  await page.locator('#finance-status').waitFor();
  return page;
}
async function closeStory(page) { for (let i = 0; i < 20 && await page.locator('#goal-intro').evaluate((d) => d.open); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(50); } }
async function toEnding(page) { assert.equal(await page.locator('#btn-next-phase').innerText(), '운영 종료 화면 보기'); await page.locator('#btn-next-phase').click(); await page.locator('#ending-title').waitFor(); await closeStory(page); }
// 인물 반응 다시 보기 → 마지막 컷(총평 카드)의 전체 문장
async function lastCut(page) {
  await page.locator('#btn-ending-replay').click(); await page.locator('#goal-intro[open]').waitFor();
  for (let i = 0; i < 30; i++) { const d = await page.locator('#goal-intro').evaluate((x) => [Number(x.dataset.cut), x.querySelector('#story-count').textContent]); const total = Number(d[1].split('/')[1]); if (d[0] === total - 1) break; await page.locator('#story-next').click(); await page.waitForTimeout(30); }
  const t = await page.locator('#story-full').textContent(); await closeStory(page); return t;
}

try {
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const page = await open(w, h, SAVED_NOW), tag = w + 'x' + h;
    // 결과 화면 알림(지금 규칙)
    const fin = await page.locator('#finance-status').innerText();
    assert.match(fin, /누적 잔액이 2회 연속 0원 미만\(−74,221원\)이라 운영 계약이 종료돼요/); assert.doesNotMatch(fin, /세 번|3회|이전 규칙/);
    await page.locator('#finance-status').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('result-' + tag) });
    await toEnding(page);
    const got = await page.evaluate(() => ({ title: document.querySelector('#ending-title').textContent, verdict: document.querySelector('#ending-verdict').textContent, profit: document.querySelector('#ending-profit').textContent, cause: document.querySelector('#failure-cause').textContent,
      ledger: [...document.querySelectorAll('#failure-ledger tbody tr')].map((r) => [...r.cells].map((c) => c.textContent)), body: document.querySelector('#panel').innerText }));
    assert.equal(got.title, '잔액 부족으로 운영 계약 종료');
    assert.equal(got.verdict, NOW);
    assert.match(got.profit, /^보유 잔액 −74,221원 · /);
    assert.match(got.cause, /^1·2단계를 마칠 때 누적 잔액이 연속으로 0원 미만이어서 운영 계약이 종료됐어요\. 마지막 보유 잔액은 −74,221원이에요\./);
    // 정산 표: 총평이 말한 1·2단계가 실제로 잔액 마이너스, 마지막 잔액이 총평 아래 숫자와 같음
    assert.deepEqual(got.ledger.map((r) => [r[0], r[2], r[3]]), [['1단계', '마이너스', won(cur.ledger[0].balance)], ['2단계', '마이너스', '−74,221원']]);
    assert.doesNotMatch(got.body, /누적 세 번|이전 규칙/);
    await page.locator('#ending-title').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('ending-' + tag) });
    await page.locator('#failure-cause').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('cause-' + tag) });
    const cut = await lastCut(page); assert.ok(cut.startsWith(NOW + '\n'), cut); assert.match(cut, /보유 잔액 −74,221원/);
    log(tag + ' 지금 규칙: 결과 알림·제목·총평·재정 돌아보기·정산 표·마지막 컷이 같은 이유(1·2단계 누적 잔액 2회 연속 0원 미만, −74,221원)');
    if (w === 1280) {
      // 내 운영 보고서: 이유 문장은 없고 ‘운영 계약 종료(2단계)’ — 다른 이유를 말하지 않는지만
      await page.locator('#btn-report').click(); await page.waitForFunction(() => document.body.classList.contains('report-open'));
      const rep = await page.locator('#panel').innerText(); assert.match(rep, /운영 계약 종료\(2단계\) · 누적 잔액 −74,221원/); assert.doesNotMatch(rep, /세 번|이전 규칙/);
      log('보고서 머리 = 운영 계약 종료(2단계) · 누적 잔액 −74,221원');
    }
    await page.close();
  }
  // 예전 규칙 저장본(1280×800): 결과 알림·제목·총평·재정 돌아보기가 모두 그때 이유
  const page = await open(1280, 800, SAVED_OLD);
  const fin = await page.locator('#finance-status').innerText();
  assert.match(fin, /이전 규칙\(회차 적자 누적 3회\)으로 운영 계약이 종료돼요/); assert.doesNotMatch(fin, /2회 연속 0원 미만/);
  await toEnding(page);
  assert.equal(await page.locator('#ending-title').innerText(), '적자 누적으로 운영 계약 종료(이전 규칙)');
  assert.equal(await page.locator('#ending-verdict').textContent(), OLD);
  assert.match(await page.locator('#failure-cause').textContent(), /^3단계에서 이전 규칙\(회차 적자 누적 3회\)으로 운영 계약이 종료됐어요\./);
  assert.ok((await lastCut(page)).startsWith(OLD + '\n'));
  await page.locator('#ending-title').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('legacy-1280x800') });
  log('예전 규칙 저장본: 결과 알림·제목·총평·재정 돌아보기·마지막 컷 모두 이전 규칙(적자 3회) 문장');
  await page.close();
  assert.deepEqual(errors, []);
  console.log('PASS contract-end-1113-browser');
} catch (e) { console.error('FAIL', e); process.exitCode = 1; }
finally { await browser.close(); server.close(); }
