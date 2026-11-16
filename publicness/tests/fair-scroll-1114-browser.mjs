/* 4단계 정책 카드가 칸보다 길 때 질문이 가려지지 않는다(2026-11-14 제출 전 수정).
 *   전에는 넓은 화면(rail)에서 카드가 넘치면 늘 맨 아래로 붙여(ui-map-plan pinFair) 1366×650 같은 낮은 화면에서는 질문 제목·판단 근거가 계속 가려졌다.
 *   A 실제 단계 진입(배너가 알림 줄에 떠 있는 동안) → 제목이 보인다 → 그 상태에서 선택 버튼을 눌러도(배너가 그 클릭에 사라진다) 버튼이 제자리라 선택이 들어간다 → 배너가 사라진 뒤에도 제목이 보인다
 *   B 배너가 없을 때(1366×650): 처음엔 맨 위 · 아래에 더 있다는 표시 · 스크롤한 자리는 다시 그려도 그대로 · 창 크기를 바꿔도 맨 아래로 끌려가지 않음 · 스크롤해서 버튼을 눌러 고를 수 있음
 *   C 휴대폰(390×844): 제목이 보이고 가로 넘침 없음
 * 실행: (저장소 루트에서) PLAYWRIGHT_MODULE=… node publicness/tests/fair-scroll-1114-browser.mjs */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const S = require('../js/session.js'), cfg = require('../js/config.js'), T = require('../tools/random-finance-1112.cjs');

const s0 = S.create(cfg, { mode: 'default', seed: 42 });
while (s0.phase < 4) { T.lay(s0, T.moderate(s0), 0); T.answer(s0); S.startRun(s0); S.finishRun(s0); S.nextPhase(s0); }
const payload = S.serialize(s0);

const server = await startServer(0), browser = await chromium.launch({ channel: 'msedge', headless: true });
const open = async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
  await page.waitForFunction(() => window.PB && PB.App && PB.App.enterPlan);
  await page.evaluate((d) => { PB.App.s = PB.Session.restore(d, PB.config); PB.App.s.tutorialSeen = true; PB.App.enterPlan(); document.querySelectorAll('dialog[open]').forEach((x) => x.close()); }, payload);
  await page.waitForSelector('.fair-card');
  return { page, errors };
};
const snap = (page) => page.evaluate(() => {
  const c = document.querySelector('.fair-card'), h = c.querySelector('h3'), r = c.getBoundingClientRect(), t = h.getBoundingClientRect(), b = document.getElementById('elder-keep').getBoundingClientRect(), f = (c.querySelector('.fair-fact') || h).getBoundingClientRect();
  const hit = document.elementFromPoint(t.left + 20, t.top + t.height / 2);
  return { rail: document.body.classList.contains('rail'), ch: c.clientHeight, sh: c.scrollHeight, st: Math.round(c.scrollTop), top: r.top, bottom: r.bottom,
    titleIn: t.top >= r.top - 1 && t.bottom <= r.bottom + 1 && !!hit && (hit === h || h.contains(hit)), factIn: f.top >= r.top - 1 && f.bottom <= r.bottom + 1,
    btnTop: Math.round(b.top), btnBottom: Math.round(b.bottom), btnLeft: b.left, btnW: b.width, more: c.classList.contains('more-below'), banner: !!document.getElementById('map-banner'),
    hOverflow: document.documentElement.scrollWidth - window.innerWidth, cardHOverflow: c.scrollWidth - c.clientWidth, choice: (PB.App.s.elderPolicy || {}).choice || null };
});
try {
  /* A — 실제 단계 진입, 배너가 떠 있는 동안 */
  for (const [w, h] of [[1366, 650], [1280, 800], [1148, 977]]) {
    const { page, errors } = await open(w, h);
    await page.waitForSelector('#map-strip #map-banner', { timeout: 15000 });
    await page.waitForTimeout(500);
    const a = await snap(page);
    assert.equal(a.rail, true, `${w}x${h} rail layout`);
    assert.equal(a.titleIn, true, `${w}x${h} 배너가 떠 있어도 질문 제목이 보인다 ${JSON.stringify(a)}`);
    assert.ok(a.hOverflow <= 0 && a.cardHOverflow <= 1, `${w}x${h} 가로 넘침 없음 ${JSON.stringify(a)}`);
    /* 보이는 부분을 진짜 마우스로 누른다 — 이 누름에 배너가 사라지고 칸이 늘어나도 버튼이 제자리여야 선택이 들어간다 */
    const y = Math.min(a.btnBottom, a.bottom) - Math.min(12, (Math.min(a.btnBottom, a.bottom) - Math.max(a.btnTop, a.top)) / 2);
    assert.ok(Math.min(a.btnBottom, a.bottom) - Math.max(a.btnTop, a.top) >= 16, `${w}x${h} 선택 버튼이 16px 넘게 보인다 ${JSON.stringify(a)}`);
    await page.mouse.click(a.btnLeft + a.btnW / 2, y, { delay: 80 }); /* 사람이 누르는 길이(누름과 뗌 사이에 배너가 사라지고 칸이 늘어난다) */
    await page.waitForFunction(() => !document.getElementById('map-banner'), null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const b = await snap(page);
    assert.equal(b.choice, 'keep', `${w}x${h} 배너가 사라지는 그 클릭으로 선택이 들어갔다 ${JSON.stringify({ a, b, y })}`);
    assert.equal(b.titleIn, true, `${w}x${h} 배너가 사라진 뒤에도 질문 제목이 보인다 ${JSON.stringify(b)}`);
    assert.ok(b.hOverflow <= 0 && b.cardHOverflow <= 1, `${w}x${h} 고른 뒤 가로 넘침 없음`);
    assert.deepEqual(errors, []);
    console.log(`PASS A ${w}x${h}: 제목 보임(배너 있음·없음) · 배너가 사라지는 클릭으로 선택 · 스크롤 ${a.st}→${b.st} · 버튼 위 ${a.btnTop}→${b.btnTop}`);
    await page.close();
  }
  /* B — 낮은 화면, 배너가 없을 때 */
  {
    const { page, errors } = await open(1366, 650);
    await page.waitForFunction(() => !document.getElementById('map-banner') && document.querySelector('.fair-card'), null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const a = await snap(page);
    assert.ok(a.sh > a.ch + 20, `전제: 1366×650에서는 카드가 칸보다 길다 ${JSON.stringify(a)}`);
    assert.equal(a.st, 0, '처음에는 맨 위(질문·근거부터) ' + JSON.stringify(a));
    assert.ok(a.titleIn && a.factIn, '질문 제목과 첫 근거 줄이 보인다 ' + JSON.stringify(a));
    assert.equal(a.more, true, '아래에 더 있다는 표시');
    assert.ok(a.btnTop < a.bottom - 8, '선택 버튼 윗부분이 보여 아래에 더 있음을 알 수 있다 ' + JSON.stringify(a));
    /* 학생이 스크롤 → 다시 그려도 그 자리 */
    await page.mouse.move((a.btnLeft + a.btnW / 2), a.top + 60); await page.mouse.wheel(0, 50); await page.waitForTimeout(300);
    const b = await snap(page); assert.ok(b.st >= 30, '휠로 내려감 ' + JSON.stringify(b));
    assert.equal(b.titleIn, true, '내려도 질문 제목은 위에 붙어 있다 ' + JSON.stringify(b));
    await page.evaluate(() => PB.App.render()); await page.waitForTimeout(300);
    const c = await snap(page); assert.ok(Math.abs(c.st - b.st) <= 2, `다시 그려도 읽던 자리 그대로 ${b.st} → ${c.st}`);
    /* 창 크기 변경: 맨 아래로 끌려가지 않고, 보이던 아래쪽 기준으로 맞춘다 */
    await page.setViewportSize({ width: 1366, height: 700 }); await page.waitForTimeout(500);
    const d = await snap(page); assert.ok(Math.abs((d.st + d.ch) - (c.st + c.ch)) <= 3 || d.st === 0, `창을 키워도 보이던 아래쪽이 그대로 ${JSON.stringify({ c: [c.st, c.ch], d: [d.st, d.ch] })}`);
    assert.equal(d.titleIn, true);
    await page.setViewportSize({ width: 1366, height: 650 }); await page.waitForTimeout(500);
    const e = await snap(page); assert.ok(e.st < e.sh - e.ch || e.st === c.st, '창을 줄여도 맨 아래로 끌려가지 않는다 ' + JSON.stringify(e)); assert.equal(e.titleIn, true);
    /* 끝까지 내려 버튼을 눌러 고른다 → 고른 뒤에도 자리가 튀지 않는다 */
    await page.mouse.move(e.btnLeft + e.btnW / 2, e.top + 60); await page.mouse.wheel(0, 400); await page.waitForTimeout(300); // 학생처럼 휠로 끝까지
    const f = await snap(page); await page.locator('#elder-abolish').click(); await page.waitForTimeout(400);
    const g = await snap(page); assert.equal(g.choice, 'abolish'); assert.ok(Math.abs(g.st - f.st) <= 2, `고른 뒤 스크롤 자리 그대로 ${f.st} → ${g.st}`);
    assert.ok(g.hOverflow <= 0 && g.cardHOverflow <= 1);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'publicness/tests/_shot-fair-scroll-1366x650.png' });
    console.log(`PASS B 1366x650: 처음 맨 위 · 표시 · 스크롤 유지(다시 그림 ${b.st}→${c.st}, 창 크기 ${c.st}→${d.st}→${e.st}) · 스크롤해 선택`);
    await page.close();
  }
  /* C — 휴대폰 */
  {
    const { page, errors } = await open(390, 844);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const c = document.querySelector('.fair-card'), h = c.querySelector('h3'), t = h.getBoundingClientRect(), k = document.getElementById('elder-keep').getBoundingClientRect(); return { rail: document.body.classList.contains('rail'), titleH: t.height, hOverflow: document.documentElement.scrollWidth - window.innerWidth, btnH: k.height, sticky: getComputedStyle(h).position }; });
    assert.equal(r.rail, false); assert.ok(r.titleH > 0 && r.btnH >= 40, JSON.stringify(r)); assert.ok(r.hOverflow <= 0, '가로 넘침 없음 ' + JSON.stringify(r)); assert.notEqual(r.sticky, 'sticky', '휴대폰 배치는 그대로');
    await page.locator('#elder-keep').scrollIntoViewIfNeeded(); await page.locator('#elder-keep').click();
    assert.equal(await page.evaluate(() => (PB.App.s.elderPolicy || {}).choice), 'keep');
    assert.deepEqual(errors, []);
    console.log('PASS C 390x844: 제목·버튼 · 가로 넘침 없음 · 선택');
    await page.close();
  }
} finally { await browser.close(); server.close(); }
