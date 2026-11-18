// 2026-11-18 플레이테스트(pb-3.2.0) P2 — 화면 검사(조사·저장본 버전 읽기는 tests/playtest-1118-p1.test.mjs)
//  depot 빌린 버스 대기 안내 · elder 무임 유지/폐지 → 예상 수지 · remove 정류장 빼기 상태 줄 · outlook 예상 진입점 합침 · faces AI 적용 뒤 얼굴 그림 그대로 · pass 선 위 서지 않는 정류장 흐리게 · oldsave 예전 버전 저장본 한 줄
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/playtest-1118-p2-browser.mjs [depot,elder,…]  (브라우저는 한 번에 하나) · PT1118_SOFT=1 = 실패를 적기만
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = `http://127.0.0.1:${server.address().port}/publicness/`, SHOT = process.env.SHOT_DIR || 'publicness/tests', shot = (n) => `${SHOT}/_shot-pt1118-${n}.png`;
const only = (process.argv[2] || 'depot,elder,remove,outlook,faces,pass,oldsave').split(','), log = (m) => console.log('  ok ' + m);
const SOFT = process.env.PT1118_SOFT === '1', fails = [], check = (c, m) => { if (c) return; if (SOFT) { fails.push(m); console.log('  FAIL ' + m); } else assert.fail(m); };
const { PLAN: PLAN1111 } = require('./playtest-1111-plan.cjs');
async function begin(page) {
  page.setDefaultNavigationTimeout(120000);
  await page.goto(base + '?no3d=1', { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#btn-start').click();
  while (await page.locator('#goal-intro').evaluate((d) => d.open)) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') await page.keyboard.press('Enter'); else await page.locator('#btn-goal-start').click(); }
}
const frames = (page, n = 3) => page.evaluate((n) => new Promise((ok) => { let k = 0; const f = () => (++k >= n ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/* phase단계 계획 화면까지(앞 단계는 엔진으로 정산만). plan = 그 단계 노선(없으면 무난한 노선) */
const toPlan = (page, phase, plan) => page.evaluate(([P, phase, plan]) => {
  const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true;
  const lay = (pl) => { S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); pl.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null && !x.leased)[0]; if (b) b.routeNum = i + 1; } }); };
  while (s.phase < phase) { lay(P[s.phase - 1]); if (s.phase === 3) PB.Choices.set(s, 'petition', 'choice', 'reflect'); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  lay(plan || P[phase - 1]); A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}, [PLAN1111, phase, plan || null]);
async function page0(w = 1280, h = 800) { const p = await browser.newPage({ viewport: { width: w, height: h } }); p._errors = []; p.on('pageerror', (e) => p._errors.push(e.message)); await begin(p); return p; }
async function done(page) { check(page._errors.length === 0, '페이지 오류 ' + page._errors.join(' | ')); await page.close(); }

if (only.includes('depot')) {
  const page = await page0(); await toPlan(page, 2);
  await page.evaluate(() => { PB.UI.planLease(); PB.App.render(); }); await frames(page);
  const t = await page.locator('#bus-depot .depot-cost').first().innerText();
  const all = await page.evaluate(() => PB.App.s.draft.buses.filter((b) => b.routeNum == null).map((b) => !!b.leased));
  check(all.length === 1 && all[0] === true, '재현 조건: 쉬는 버스 = 빌린 버스 하나 ' + JSON.stringify(all));
  check(/쉬어도 임차료 25,000원/.test(t) && !/보유비/.test(t), '빌린 버스 대기 안내 ' + t);
  log('대기 버스: ' + t); await done(page);
}
if (only.includes('elder')) {
  const page = await page0(); await toPlan(page, 4); await frames(page, 4); await page.waitForTimeout(600);
  const read = () => page.evaluate(() => { const p = document.querySelector('#minimal-profit'); return p ? Number(p.dataset.profit) : null; });
  await page.locator('#elder-keep').click(); await page.waitForTimeout(700); const keep = await read();
  await page.locator('#elder-abolish').click(); await page.waitForTimeout(700); const abolish = await read();
  const engine = await page.evaluate(() => Math.round(PB.Session.expectedRun(PB.App.s).metrics.costs.total));
  check(keep != null && abolish != null && keep !== abolish, `무임 유지/폐지를 바꾸면 지도 위 예상 수지가 바뀜 유지 ${keep} · 폐지 ${abolish}`);
  check(Math.round(abolish) === engine, `폐지 예상 = 엔진 예상 ${abolish} / ${engine}`);
  log(`4단계 예상 수지: 유지 ${keep} → 폐지 ${abolish}`); await done(page);
}
if (only.includes('remove')) {
  const page = await page0(); await toPlan(page, 1, [[['F', 'C', 'B', 'A'], 1]]);
  await page.evaluate(() => { PB.Minimal.text(true); PB.UI.planAssignBus(PB.App.s.draft.buses[1].id, 1); PB.App.render(); }); await frames(page);
  const before = await page.locator('#plan-message').innerText();
  await page.locator('#remove-stop-3').click(); await frames(page);
  const after = await page.locator('#plan-message').innerText(), nodes = await page.evaluate(() => PB.App.s.draft.routes[0].nodes.join(''));
  check(nodes === 'FCB', '기차역이 빠짐 ' + nodes);
  check(after === '기차역을 뺐어요.', `상태 줄 ‘기차역을 뺐어요.’ (전: ${before} → 뒤: ${after})`);
  log('정류장 빼기: ' + before + ' → ' + after); await done(page);
}
if (only.includes('outlook')) {
  const page = await page0(); await toPlan(page, 1, [[['F', 'C', 'B', 'A'], 1]]);
  await page.evaluate(() => { PB.Minimal.text(true); PB.App.render(); }); await frames(page);
  const where = await page.evaluate(() => [...document.querySelectorAll('#btn-outlook-help')].map((b) => ({ inAi: !!b.closest('#ai-tools'), text: b.textContent })));
  check(where.length === 1 && where[0].inAi, '예상 보기 진입점은 AI 제안 안 하나뿐 ' + JSON.stringify(where));
  check(!/AI에게 예상 물어보기/.test(await page.evaluate(() => document.body.innerText)), '‘AI에게 예상 물어보기’ 버튼이 따로 없음');
  await page.locator('#plan-ai-toggle').click(); await page.locator('#btn-outlook-help').click(); await frames(page);
  check(await page.locator('#plan-outlook #expected-arrivals').isVisible(), 'AI 제안 안에서 예상이 펼쳐짐');
  log('예상 진입점: ' + JSON.stringify(where)); await done(page);
}
if (only.includes('faces')) {
  const page = await page0(); await toPlan(page, 1, [[['F', 'D', 'A', 'B', 'C'], 1]]); await frames(page, 4);
  await page.evaluate(() => { document.querySelectorAll('#map-people img, #people-hud img').forEach((img) => { img.__mark = 1; }); });
  await page.locator('#plan-ai-toggle').click(); await page.locator('#goal-profit').click(); await page.locator('#rec-card').waitFor({ timeout: 120000 });
  await page.locator('#rec-accept').click(); await frames(page, 2);
  const r = await page.evaluate(() => { const imgs = [...document.querySelectorAll('#map-people img, #people-hud img')]; return { n: imgs.length, kept: imgs.filter((i) => i.__mark).length, ready: imgs.filter((i) => i.complete && i.naturalWidth > 0).length }; });
  check(r.n > 0 && r.kept === r.n, `AI 적용 뒤 얼굴 그림을 새로 만들지 않음 ${JSON.stringify(r)}`);
  check(r.ready === r.n, `얼굴 그림이 바로 보임 ${JSON.stringify(r)}`);
  log('AI 적용 뒤 얼굴: ' + JSON.stringify(r)); await done(page);
}
if (only.includes('pass')) {
  const page = await page0(); await toPlan(page, 2, [[['B', 'G'], 1], [['F', 'C', 'A'], 1], [['D', 'A'], 1]]); await frames(page, 6); await page.waitForTimeout(600);
  const h = await page.evaluate(() => { const g = document.querySelector('#net-layer .net-stop[data-node="H"]'), o = document.querySelector('#net-layer .net-stop[data-node="A"]'); return { cls: g && g.getAttribute('class'), op: g && Number(getComputedStyle(g).opacity), other: o && Number(getComputedStyle(o).opacity) }; });
  check(/\bpass\b/.test(h.cls || ''), '재현 조건: 종합운동장이 빨강 선 위(지나가기만) ' + JSON.stringify(h));
  check(h.op != null && h.op < 0.6 && h.other === 1, '서지 않는 정류장은 흐리게 ' + JSON.stringify(h));
  await page.locator('#stage').screenshot({ path: shot('p2-pass-1280') });
  log('2단계 종합운동장: ' + JSON.stringify(h)); await done(page);
}
if (only.includes('oldsave')) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page._errors = []; page.on('pageerror', (e) => page._errors.push(e.message)); page.setDefaultNavigationTimeout(120000);
  await page.goto(base + '?no3d=1', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ethicity.publicness.save', JSON.stringify({ version: 'pb-3.0.0', session: { history: [], draft: { routes: [], buses: [] }, phase: 2, stage: 'plan' } })); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#btn-start').waitFor();
  const t = await page.evaluate(() => { const n = document.querySelector('#continue-note'); return { text: n.textContent, vis: n.getBoundingClientRect().height > 0, cont: !document.querySelector('#btn-continue') || document.querySelector('#btn-continue').hidden }; });
  check(t.text === '이전 버전 기록은 이어할 수 없어요.' && t.vis && t.cont, '첫 화면 한 줄 ' + JSON.stringify(t));
  await page.evaluate(() => { localStorage.setItem('ethicity.publicness.save', JSON.stringify({ version: PB.config.SAVE_COMPAT[0], session: { history: [], draft: { routes: [], buses: [] }, phase: 1, stage: 'plan' } })); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#btn-start').waitFor();
  const t2 = await page.locator('#continue-note').textContent();
  check(t2 !== '이전 버전 기록은 이어할 수 없어요.', '받아 주는 버전(SAVE_COMPAT)엔 안내 없음 ' + t2);
  log('예전 버전 저장본: ' + t.text); await done(page);
}
await browser.close(); server.close();
console.log(fails.length ? 'P2 FAIL ' + fails.length : 'P2 PASS');
if (fails.length) process.exitCode = 1;
