// 2026-11-18 플레이테스트 최종 캡처(검사 아님): 1148×977 · 1280×800 · 390×844 × AI 미리보기(1단계 ‘수익’) · 운행 중 HUD · 2단계 출발 확인창 · 결과 카드 작은 지도
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/playtest-1118-shots.mjs [1148x977,…]  → publicness/tests/_shot-pt1118-final-<장면>-<크기>.png (브라우저는 한 번에 하나)
import { createRequire } from 'node:module'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = `http://127.0.0.1:${server.address().port}/publicness/`, SHOT = process.env.SHOT_DIR || 'publicness/tests', out = [];
const { PLAN } = require('./playtest-1111-plan.cjs');
const sizes = (process.argv[2] || '1148x977,1280x800,390x844').split(',').map((x) => x.split('x').map(Number));
const frames = (page, n = 4) => page.evaluate((n) => new Promise((ok) => { let k = 0; const f = () => (++k >= n ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function begin(page) {
  page.setDefaultNavigationTimeout(120000);
  await page.goto(base + '?no3d=1', { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#btn-start').click();
  while (await page.locator('#goal-intro').evaluate((d) => d.open)) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') await page.keyboard.press('Enter'); else await page.locator('#btn-goal-start').click(); }
}
const lay = (page, phase, plan, lease) => page.evaluate(([P, phase, plan, lease]) => {
  const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true;
  const put = (pl) => { S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); pl.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null && !x.leased)[0]; if (b) b.routeNum = i + 1; } }); };
  while (s.phase < phase) { put(P[s.phase - 1]); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  put(plan || P[phase - 1]); if (lease) { const b = S.lease(s); b.routeNum = 3; } A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}, [PLAN, phase, plan || null, !!lease]);
async function snap(page, name, w, h) { const f = `${SHOT}/_shot-pt1118-final-${name}-${w}x${h}.png`; await page.screenshot({ path: f }); out.push(f); }

for (const [w, h] of sizes) {
  // 1) AI 미리보기 — 1단계 빨강 외곽 마을→병원→기차역→밀집 주거지→대학교 + 초록 기차역→산업·일자리→구도심 시장, ‘수익’
  let page = await browser.newPage({ viewport: { width: w, height: h } });
  await begin(page); await lay(page, 1, [[['F', 'D', 'A', 'B', 'C'], 1], [['A', 'G', 'E'], 1]]); await frames(page);
  await page.locator('#plan-ai-toggle').click(); await page.locator('#goal-profit').click(); await page.locator('#rec-card').waitFor({ timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('#stage').classList.contains('previewing')); await frames(page, 6); await page.waitForTimeout(500);
  await snap(page, 'ai-preview', w, h);
  // 2) 운행 중 HUD — 같은 판에서 AI 제안을 거절하고 1단계 무난한 노선으로 출발, 잠시 뒤
  await page.locator('#rec-reject').click().catch(() => {}); await page.locator('#plan-ai-close').click({ timeout: 5000 }).catch(() => {}); await lay(page, 1); await frames(page);
  await page.locator('#btn-depart').scrollIntoViewIfNeeded(); await page.locator('#btn-depart').click(); if (await page.locator('#confirm-depart').evaluate((d) => d.open)) await page.locator('#confirm-yes').click();
  await page.waitForFunction(() => document.body.dataset.screen === 'run' && PB.UI.runState() && PB.UI.runState().tf > 4, null, { timeout: 60000 }); await page.waitForTimeout(400);
  await snap(page, 'run-hud', w, h); await page.close();
  // 3) 2단계 출발 확인창 — 무난한 노선 + 빌린 버스 한 대를 주황 노선에(예상 수지 마이너스)
  page = await browser.newPage({ viewport: { width: w, height: h } });
  await begin(page); await lay(page, 2, null, true); await frames(page);
  await page.locator('#btn-depart').click(); await page.locator('#confirm-depart[open]').waitFor(); await page.waitForTimeout(300);
  await snap(page, 'depart-2', w, h); await page.locator('#confirm-no').click(); await page.close();
  // 4) 결과 카드 작은 지도 — 1단계 빨강 한 노선 결과, 하늘 카드 펼침
  page = await browser.newPage({ viewport: { width: w, height: h } });
  await begin(page); await lay(page, 1, [[['F', 'D', 'A', 'B', 'C'], 1]]);
  await page.evaluate(() => { const S = PB.Session, s = PB.App.s; S.startRun(s); S.finishRun(s); PB.App.go('result'); });
  const card = page.locator('li[data-resident="haneul"] details.resident-card'); await card.waitFor({ state: 'attached', timeout: 60000 });
  await card.evaluate((d) => { d.open = true; }); await page.waitForTimeout(500);
  await page.locator('li[data-resident="haneul"] .resident-minimap').evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  await snap(page, 'minimap', w, h); await page.close();
}
await browser.close(); server.close();
console.log(out.join('\n'));
