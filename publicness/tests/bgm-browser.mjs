// 2026-11-01 배경음악: 첫 입력 뒤 재생, 계획=b2 / 운행=b3, 설정에서 끄면 멈추고 다시 열어도 꺼짐, 파일 로드 오류 없음
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/?no3d=1`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }), errors = [], bad = [];
page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (/audio\/bgm/.test(r.url()) && r.status() >= 400) bad.push(r.url()); });
await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
assert.equal(await page.evaluate(() => PB.Bgm.state().playing), false, '입력 전에는 재생 안 함');
await page.mouse.click(5, 5); // 첫 입력
await page.evaluate(() => { const A = PB.App; A.startGame(); A.s.tutorialSeen = true; PB.Session.beginPlan(A.s); A.go('plan'); document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
await page.waitForFunction(() => PB.Bgm.state().playing && PB.Bgm.state().cur === 'plan', null, { timeout: 8000 });
await page.waitForFunction(() => PB.Bgm.state().volume >= 0.139, null, { timeout: 5000 }); const v = await page.evaluate(() => PB.Bgm.state().volume); assert.ok(v <= 0.14 + 1e-6, '볼륨은 0.14까지(서서히 올라감): ' + v);
await page.evaluate(() => { PB.Session.startRun(PB.App.s); PB.App.go('run'); });
await page.waitForFunction(() => PB.Bgm.state().cur === 'run' && PB.Bgm.state().playing, null, { timeout: 8000 });
await page.evaluate(() => { PB.Bgm.set(false); }); await page.waitForTimeout(600);
assert.equal(await page.evaluate(() => PB.Bgm.state().playing), false, '끄면 멈춤');
await page.reload(); assert.equal(await page.evaluate(() => document.getElementById('opt-bgm').checked), false, '다시 열어도 꺼짐');
await page.mouse.click(5, 5); await page.waitForTimeout(400); assert.equal(await page.evaluate(() => PB.Bgm.state().playing), false);
assert.deepEqual(bad, []); assert.deepEqual(errors, []);
await browser.close(); server.close(); console.log('PASS bgm');
