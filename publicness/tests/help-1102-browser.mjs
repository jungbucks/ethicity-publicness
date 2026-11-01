// 2026-11-02 도움말 단순화(사용자 “도움말 저거 애들이 읽겠니?”) — 헤드리스 Edge, 1440×900·390×844
//  · 기본(미니멀): 맨 위 ‘첫 노선 안내 다시 보기’ + 아이콘 4칸(노선 만들기·버스 옮기기·출발·배속·돈) 한 줄씩(15자 안팎), 긴 규칙표는 ‘자세히 보기’ 접힘 안
//  · 접힌 안에도 규칙·재정(#help-rules)·AI·숫자 설명이 그대로, 텍스트 모드는 펼친 채로 열림(정보를 줄이지 않음)
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const SHOT = process.env.SHOT_DIR || 'publicness/tests';
try {
  for (const [w, h, dpr] of [[1440, 900, 1], [390, 844, 3]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce' }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?no3d=1'); await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => { const A = PB.App; A.startGame(); A.s.tutorialSeen = true; PB.Session.beginPlan(A.s); A.go('plan'); document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
    await page.waitForTimeout(500);
    await page.locator('#btn-help').click(); await page.locator('#help[open]').waitFor();
    const r = await page.evaluate(() => {
      const d = document.querySelector('#help'), first = [...d.children].filter(n => n.tagName !== 'H2' && n.nodeType === 1)[0];
      const items = [...d.querySelectorAll('.help-quick li')].map(li => ({ b: li.querySelector('b').textContent, t: li.querySelector('span').textContent, icon: !!li.querySelector('svg.help-ico'), vis: li.getBoundingClientRect().height > 0 }));
      return { first: first.querySelector('#btn-tutorial-replay') ? 'replay' : first.className, items, open: document.querySelector('#help-more').open, rules: document.querySelector('#help-rules').textContent, longVisible: [...d.querySelectorAll('#help-more h3')].some(x => x.checkVisibility()) };
    });
    assert.equal(r.first, 'replay', '맨 위 = 첫 노선 안내 다시 보기');
    assert.deepEqual(r.items.map(x => x.b), ['노선 만들기', '버스 옮기기', '출발·배속', '돈']); assert.ok(r.items.every(x => x.icon && x.vis && [...x.t].length <= 16), JSON.stringify(r.items));
    assert.equal(r.open, false, 'open ' + await page.evaluate(() => document.body.className)); assert.equal(r.longVisible, false, '긴 규칙은 접힌 안');
    ['버스·노선', '기본 지원', '공공서비스 수행분', '재정 규칙', '대기 기준', '학기 말 기준'].forEach(k => assert.ok(r.rules.includes(k), '규칙표 그대로: ' + k));
    await page.screenshot({ path: `${SHOT}/_shot-help-${w}.png` });
    await page.locator('#help-more > summary').click(); assert.ok(await page.locator('#help-rules').isVisible(), '자세히 보기를 누르면 규칙표');
    await page.locator('#help form button[type=submit]').click();
    // 텍스트 모드는 펼친 채
    await page.evaluate(() => PB.Minimal.text(true)); await page.locator('#btn-help').click(); await page.locator('#help[open]').waitFor();
    assert.equal(await page.locator('#help-more').evaluate(d => d.open), true, '텍스트 모드는 자세히가 펼쳐진 채'); assert.ok(await page.locator('#help-rules').isVisible());
    await page.locator('#help form button[type=submit]').click();
    assert.deepEqual(errors, []); console.log(`  ok ${w}×${h} 도움말: 안내 다시 보기 + 아이콘 4칸(${r.items.map(x => x.b + ' “' + x.t + '”').join(', ')}) · 자세히 접힘(텍스트 모드 펼침)`);
    await page.close();
  }
  console.log('PASS help-1102');
} finally { await browser.close(); server.close(); }
