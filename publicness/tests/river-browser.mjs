// 2026-11-01 강 건너기(기본 세팅만, 거리·시간 × 1.5) + 노선 위 배차 간격 표시 삭제 — 헤드리스 Edge, 2D
//  · 강을 건너는 노선을 만들면 첫 팁 ‘지도에서 보는 것보다 1.5배 오래 걸려요’, 도움말에 ‘강 건너기’ 줄
//  · 노선 위 ‘◷ N시간마다 / 2.4h’ 배지 없음
//  · 랜덤 세팅(seed)에는 강 규칙·도움말 줄 없음
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
async function plan(q, nodes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.errors = errors;
  await page.goto(base + '?no3d=1' + (q ? '&' + q : '')); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ethicity.publicness.seenTips', JSON.stringify({ bus: true })); }); await page.reload();
  await page.evaluate(() => { const A = PB.App; A.startGame(); A.s.tutorialSeen = true; PB.Session.beginPlan(A.s); A.go('plan'); document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
  await page.evaluate(nodes => { const s = PB.App.s; PB.Session.updateRoute(s, 1, { nodes, stops: nodes.map(() => true) }); PB.Session.assign(s, s.draft.buses[0].id, 1); PB.App.render(); }, nodes);
  await page.waitForTimeout(700); return page;
}
const page = await plan('', ['F', 'B', 'A', 'D']);
const g = await page.evaluate(() => { const g = PB.Session.graph(PB.App.s); return { fb: g.river('F', 'B'), ba: g.river('B', 'A') }; });
assert.deepEqual(g, { fb: true, ba: false });
const toast = await page.evaluate(() => { const t = document.querySelector('#minimal-toast, .toast, [role=status]'); return [...document.querySelectorAll('#minimal-toast,.app-toast,[data-toast]')].map(n => n.textContent).join(' | ') || (t && t.textContent) || ''; });
assert.match(toast, /강을 건너는 구간은 다리로 돌아가서, 지도에서 보는 것보다 1\.5배 오래 걸려요/, toast);
assert.equal(await page.locator('.minimal-headway').count(), 0, '노선 위 배차 간격 배지 없음');
await page.evaluate(() => PB.Arrival ? null : null); await page.locator('#btn-help').click(); await page.waitForTimeout(300); await page.locator('#help-more > summary').click(); // 11-02: 규칙표는 ‘자세히 보기’ 안
assert.match(await page.locator('#help-rules').innerText(), /강 건너기[\s\S]*1\.5배/);
assert.deepEqual(page.errors, []); await page.close();
console.log('  ok 기본: F–B 강 건넘 팁·도움말 줄, 배차 간격 배지 없음');
const rnd = await plan('seed=7', ['B', 'A']);
assert.equal(await rnd.evaluate(() => PB.App.s.config.river), undefined);
await rnd.locator('#btn-help').click(); await rnd.waitForTimeout(300); await rnd.locator('#help-more > summary').click();
assert.doesNotMatch(await rnd.locator('#help-rules').innerText(), /강 건너기/);
assert.deepEqual(rnd.errors, []); await rnd.close();
console.log('  ok 랜덤: 강 규칙·도움말 줄 없음');
await browser.close(); server.close(); console.log('PASS river');
