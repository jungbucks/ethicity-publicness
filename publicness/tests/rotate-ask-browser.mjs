// 2026-11-16 사용자 지시: ① 휴대폰 세로 화면이면 ‘가로로 돌려 주세요’ 창(js/rotate-ask.js) ② 노선 시작·끝 바깥의 색 점 없앰(js/map-network.js)
//  · 자동 검사(navigator.webdriver)에서는 창을 안 띄우므로 여기서는 ?rotate=1로 켠다
//  · 세로 → 뜸 / 가로로 돌림 → 닫힘 / 다시 세로 → 다시 뜸 / ‘세로로 계속하기’ → 닫히고 이번 방문 동안 안 뜸(새로 고쳐도)
//  · ?rotate=1 없이(자동 검사 기본)·?rotate=0·넓은 화면에서는 안 뜸
//  · 계획 화면(세로·가로)에 .net-cap 없음, 가로 화면 시작·계획 스크린샷
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SHOT = process.env.SHOT_DIR || 'publicness/tests', P = { width: 390, height: 844 }, L = { width: 844, height: 390 };
const ROUTES = [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G', 'E']]];
function ok(name) { console.log('  ok', name); }
async function fresh(q, viewport, mobile = true) {
  const ctx = await browser.newContext(mobile ? { viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message)); page.ctx = ctx;
  await page.goto(base + '?' + q); await page.waitForTimeout(600); return page;
}
const state = (page) => page.evaluate(() => { const d = document.getElementById('rotate-ask'); return { open: !!(d && d.open), modal: !!(d && d.matches(':modal')), need: PB.RotateAsk.need() }; });
async function plan(page) {
  await page.evaluate((R) => {
    const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true; S.beginPlan(s);
    R.forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
    A.go('plan'); document.querySelectorAll('dialog[open]:not(#rotate-ask)').forEach(d => d.close());
  }, ROUTES);
  await page.waitForTimeout(1500);
}
try {
  { // 1 세로 → 뜸, 가로 → 닫힘, 다시 세로 → 다시 뜸, 계속하기 → 안 뜸
    const page = await fresh('rotate=1&no3d=1', P);
    let s = await state(page); assert.deepEqual(s, { open: true, modal: true, need: true }, '세로 시작 화면에서 창이 뜸 ' + JSON.stringify(s));
    assert.match(await page.locator('#rotate-ask-h').textContent(), /가로로 돌려 주세요/);
    const box = await page.locator('#rotate-ask').boundingBox(); assert.ok(box.x >= 8 && box.x + box.width <= P.width - 8 && box.y >= 0 && box.y + box.height <= P.height, '창이 화면 안 ' + JSON.stringify(box));
    const btn = await page.locator('#rotate-ask-skip').boundingBox(); assert.ok(btn.height >= 44, '계속하기 버튼 높이 44 이상 ' + btn.height);
    await page.screenshot({ path: `${SHOT}/_shot-rotate-portrait-390x844.png` }); ok('세로: 안내 창');
    await page.setViewportSize(L); await page.waitForTimeout(400);
    s = await state(page); assert.equal(s.open, false, '가로로 돌리면 닫힘'); assert.equal(await page.evaluate(() => !!document.querySelector('dialog:modal')), false, '남은 모달 없음');
    const t = await page.evaluate(() => { const b = document.querySelector('#btn-start').getBoundingClientRect(), a = document.querySelector('.title-art').getBoundingClientRect(), h = document.querySelector('#title-h1').getBoundingClientRect(); return { start: [b.top, b.bottom], h1: [h.top, h.bottom], art: [a.left, a.width, a.height], doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], vp: [innerWidth, innerHeight] }; });
    assert.ok(t.start[0] >= 0 && t.start[1] <= t.vp[1] && t.h1[0] >= 0 && t.h1[1] <= t.vp[1], '가로 시작 화면: 제목·시작 버튼이 첫 화면 안 ' + JSON.stringify(t));
    assert.ok(t.art[0] > 250 && t.art[1] > 300 && t.art[2] >= t.vp[1] - 1 && t.doc[0] <= t.vp[0] + 1 && t.doc[1] <= t.vp[1] + 1, '그림은 오른쪽 칸·문서 스크롤 없음 ' + JSON.stringify(t));
    await page.screenshot({ path: `${SHOT}/_shot-rotate-title-844x390.png` }); ok('가로: 닫힘 · 시작 화면 두 칸');
    await page.setViewportSize(P); await page.waitForTimeout(400);
    s = await state(page); assert.equal(s.open, true, '다시 세로면 다시 뜸');
    await page.locator('#rotate-ask-skip').tap(); await page.waitForTimeout(200);
    s = await state(page); assert.deepEqual(s, { open: false, modal: false, need: false }, '세로로 계속하기 → 닫힘');
    await page.setViewportSize(L); await page.waitForTimeout(200); await page.setViewportSize(P); await page.waitForTimeout(400);
    assert.equal((await state(page)).open, false, '계속하기 뒤에는 다시 세로여도 안 뜸');
    await page.reload(); await page.waitForTimeout(600);
    assert.equal((await state(page)).open, false, '새로 고쳐도(같은 방문) 안 뜸');
    assert.deepEqual(page.errors, []); ok('다시 세로·계속하기·새로 고침'); await page.ctx.close();
  }
  { // 2 안 뜨는 경우
    let page = await fresh('no3d=1', P); assert.equal((await state(page)).open, false, '자동 검사 기본 = 안 뜸'); await page.ctx.close();
    page = await fresh('rotate=0&no3d=1', P); assert.equal((await state(page)).open, false, '?rotate=0'); await page.ctx.close();
    page = await fresh('rotate=1&no3d=1', L); assert.equal((await state(page)).open, false, '휴대폰 가로'); await page.ctx.close();
    page = await fresh('rotate=1&no3d=1', { width: 1280, height: 800 }, false); assert.equal((await state(page)).open, false, '넓은 화면'); await page.ctx.close();
    page = await fresh('rotate=1&no3d=1', { width: 820, height: 1180 }); assert.equal((await state(page)).open, false, '태블릿 세로(폭 820)'); await page.ctx.close();
    ok('안 뜨는 경우 5가지');
  }
  { // 3 운행·계획 중 세로로 돌리면 뜨고, 계획 화면에 노선 끝 점이 없다
    const page = await fresh('rotate=1&no3d=1', L);
    await plan(page);
    const caps = await page.evaluate(() => ({ cap: document.querySelectorAll('#net-layer .net-cap').length, lines: document.querySelectorAll('#net-layer .net-lines line').length, stops: document.querySelectorAll('#net-layer .net-stop').length, handles: document.querySelectorAll('#route-buses .route-bus').length, mode: document.body.className }));
    assert.equal(caps.cap, 0, '노선 끝 점 없음'); assert.ok(caps.lines >= 5 && caps.stops >= 7 && caps.handles === 2, '노선 선·정류장·노선 손잡이는 그대로 ' + JSON.stringify(caps));
    assert.match(caps.mode, /phone-l/, '가로 휴대폰 배치');
    await page.screenshot({ path: `${SHOT}/_shot-rotate-plan-844x390.png` }); ok('가로 계획: 노선 끝 점 없음');
    await page.setViewportSize(P); await page.waitForTimeout(500);
    assert.equal((await state(page)).open, true, '계획 중 세로로 돌리면 뜸');
    await page.setViewportSize(L); await page.waitForTimeout(500);
    assert.equal((await state(page)).open, false);
    assert.equal(await page.evaluate(() => document.body.classList.contains('phone-l') && document.documentElement.scrollWidth <= innerWidth + 1), true, '가로로 돌아오면 가로 배치·가로 넘침 없음');
    assert.deepEqual(page.errors, []); ok('계획 중 회전'); await page.ctx.close();
  }
  { // 4 넓은 화면 계획: 노선 끝 점 없음(스크린샷)
    const page = await fresh('no3d=1', { width: 1280, height: 800 }, false);
    await plan(page);
    assert.equal(await page.locator('#net-layer .net-cap').count(), 0);
    await page.screenshot({ path: `${SHOT}/_shot-rotate-plan-1280x800.png` }); ok('넓은 화면 계획'); await page.ctx.close();
  }
  console.log('PASS rotate-ask');
} finally { await browser.close(); server.close(); }
