// 2026-11-18 보안 검토 2·3 — 화면 검사
//  name   보고서 이름은 지금 게임에만: 같은 판에서 돌아오면 그대로, 재도전·새 게임은 입력 칸·인쇄 파일 이름 모두 빈 이름
//  broken 깨진 저장본: 따로 남기는 것은 버전·오류 분류뿐(원문 없음), 이 게임 기록 지우기(새로 시작)에 .broken도 포함, 다른 게임 키는 그대로
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/security-1118-browser.mjs [name,broken]  (브라우저는 한 번에 하나) · PT1118_SOFT=1 = 실패를 적기만
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = `http://127.0.0.1:${server.address().port}/publicness/`;
const only = (process.argv[2] || 'name,broken').split(','), log = (m) => console.log('  ok ' + m);
const SOFT = process.env.PT1118_SOFT === '1', fails = [], check = (c, m) => { if (c) return; if (SOFT) { fails.push(m); console.log('  FAIL ' + m); } else assert.fail(m); };
const { PLAN } = require('./playtest-1111-plan.cjs');
async function open(page) { page.setDefaultNavigationTimeout(120000); await page.goto(base + '?no3d=1', { waitUntil: 'domcontentloaded' }); }
/* 지금 세션을 엔딩까지(엔진 정산) */
const toEnding = (page) => page.evaluate((P) => { const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true;
  const lay = (pl) => { S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); pl.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; } }); };
  while (s.stage !== 'ending') { lay(P[s.phase - 1]); if (s.phase === 3) PB.Choices.set(s, 'petition', 'choice', 'reflect'); if (s.phase === 4) PB.Choices.set(s, 'elder', 'choice', 'keep'); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  document.querySelectorAll('dialog[open]').forEach((d) => d.close()); A.go('ending'); }, PLAN);
const report = (page) => page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); PB.UI.openReport(PB.App, 'ending'); });
const printName = (page) => page.evaluate(() => { let t = null; const p = window.print; window.print = () => { t = document.title; }; document.querySelector('#btn-report-print').click(); window.print = p; return t; });

if (only.includes('name')) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await open(page); await page.evaluate(() => { localStorage.clear(); PB.App.startGame(); });
  await toEnding(page); await report(page); await page.locator('#report-name').fill('김하늘');
  const t1 = await printName(page);
  await page.locator('#btn-report-back').click(); await report(page);
  const same = await page.locator('#report-name').inputValue();
  check(same === '김하늘' && /김하늘/.test(t1), `같은 판으로 돌아오면 이름 그대로 ${same} · ${t1}`);
  for (const how of ['same', 'new']) {
    await page.evaluate((how) => { PB.App._reportFor = null; if (how === 'same') PB.App.retry('same'); else PB.App.startGame(); /* 새 게임 = 첫 화면 시작과 같은 길(기본 세팅) */ }, how);
    await toEnding(page); await report(page);
    const v = await page.locator('#report-name').inputValue(), t = await printName(page);
    check(v === '' && !/김하늘/.test(t), `${how === 'same' ? '재도전' : '새 게임'}: 입력 칸·파일 이름 빈 이름 (${JSON.stringify(v)} · ${t})`);
    log(`${how}: 입력 ${JSON.stringify(v)} · 파일 이름 ${t}`);
  }
  check(errors.length === 0, '페이지 오류 ' + errors.join(' | '));
  await page.close();
}
if (only.includes('broken')) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const SECRET = '그때 쓴 서술 답안 비밀문장-1118';
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ethicity.publicness.save', '{"version":"' + PB.config.SCENARIO_VERSION + '","session":{"stageNotes":{"1":{"kept":"' + x + '"}},"hist'); localStorage.setItem('ethicity.privacy.save', 'OTHER-GAME'); localStorage.setItem('ethicity.result.publicness', 'R'); }, SECRET);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#btn-start').waitFor();
  check(/불러오지 못해서/.test(await page.locator('#continue-note').textContent()), '깨진 저장본 안내');
  await page.locator('#btn-start').click();
  for (let i = 0; i < 30 && await page.locator('#goal-intro').evaluate((d) => d.open); i++) { await page.locator('#btn-goal-start').click().catch(() => {}); await page.waitForTimeout(60); }
  const st = await page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  const bk = st['ethicity.publicness.save.broken'];
  check(!!bk && !bk.includes('비밀문장') && !bk.includes('stageNotes'), '따로 남긴 것에 원문 없음 ' + (bk || '').slice(0, 120));
  let parsed = null; try { parsed = JSON.parse(bk); } catch (e) { parsed = null; }
  check(!!parsed && Object.keys(parsed).sort().join() === "error,version" && parsed.error === "json", "버전·오류 분류만 " + bk);
  check(st['ethicity.privacy.save'] === 'OTHER-GAME', '다른 게임 키 그대로');
  log('깨진 저장본 진단: ' + bk);
  // 이 게임 기록 지우기(첫 화면 ‘새로 시작하기’ → 예): .broken도 지움, 다른 게임 키는 그대로
  await page.evaluate(() => PB.App.save()); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#btn-start').waitFor();
  await page.locator('#btn-start').click(); await page.locator('#restart-yes').click(); await page.waitForTimeout(300);
  const st2 = await page.evaluate(() => ({ broken: localStorage.getItem('ethicity.publicness.save.broken'), other: localStorage.getItem('ethicity.privacy.save') }));
  check(st2.broken === null && st2.other === 'OTHER-GAME', '새로 시작 = 이 게임 저장본·.broken 지움, 다른 게임 키 보존 ' + JSON.stringify(st2));
  check(errors.length === 0, '페이지 오류 ' + errors.join(' | '));
  await page.close();
}
await browser.close(); server.close();
console.log(fails.length ? 'SEC FAIL ' + fails.length : 'SEC PASS');
if (fails.length) process.exitCode = 1;
