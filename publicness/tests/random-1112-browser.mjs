// 2026-11-12 교사 랜덤 모드 검토(시드 245525538, 1280×800) 완료 확인 — 브라우저.
//  ?seed=245525538(지정 세팅 = 랜덤과 같은 도전 세팅·배치)로 1~8단계 + 엔딩 + 운영 보고서까지, 단계마다 무난한 계획(tools/random-finance-1112.cjs moderate)을 깔고
//  화면 버튼으로 출발(출발 확인창)·‘끝까지’(11:00 물음 창)·결과·다음 단계를 지난다. 4단계는 유나·다은이 갈아타기 2번이 필요한 배치로 따로 확인.
//  확인 항목: 1 그림 대체(portrait 4장을 404로 막고 칩·지도 핀·결과·엔딩 카드에 깨진 그림 없음) · 2 갈아타기 2번 경고·실패 이유 · 3 고른 끝으로 목록 연결 ·
//  4 청원 그 뒤·보고서·금배지 숫자 · 6 3~8단계 ‘끝까지’ 11:00 · 7 직행 노선 시간 · 8 출발 확인 초점 · 9 계획 화면에 11:00 문장 없음 · 10 누적 표기 · 11 한 곳 · 12 수행분 문장 ·
//  저장 이어하기(새로고침) · 1148×977·390×844 화면. 스크린샷 = SHOT_DIR(기본 publicness/tests)/_shot-r1112-*.png
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/random-1112-browser.mjs   (브라우저는 한 번에 하나: D:/Works/.browser-test.lock)
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const cfg = require('../js/config.js'), S = require('../js/session.js'), T = require('../tools/random-finance-1112.cjs'), C = require('../js/choices.js');
const SEED = 245525538, base = `http://127.0.0.1:${server.address().port}/publicness/`, SHOT = process.env.SHOT_DIR || 'publicness/tests', shot = (n) => `${SHOT}/_shot-r1112-${n}.png`;
const log = (m) => console.log('  ok ' + m), report = { skip: {}, sentences: {} };
const BLOCK = ['sol', 'yuna', 'daeun', 'jinho']; // 배포판에서 404였다는 그림 — 대체 표시 확인용으로 막는다

// 단계마다 무난한 계획(노선 + 버스 번호 → 노선 번호). 배치는 시드로 정해지므로 node에서 미리 만든다
const PLANS = {}; { const s = S.create(cfg, { mode: 'random', seed: SEED }); for (;;) { T.lay(s, T.moderate(s), 0); T.answer(s); PLANS[s.phase] = { routes: JSON.parse(JSON.stringify(s.draft.routes)), buses: Object.fromEntries(s.draft.buses.map((b) => [b.id, b.routeNum])) }; S.startRun(s); S.finishRun(s); if (s.phase >= 8) break; S.nextPhase(s); } }
const TRANSFER4 = { routes: [{ num: 1, nodes: ['J', 'B'] }, { num: 2, nodes: ['B', 'A'] }, { num: 3, nodes: ['A', 'H'] }, { num: 4, nodes: ['C', 'D', 'E', 'F', 'G', 'I', 'K'].filter((x) => x !== 'K') }].map((r) => ({ ...r, stops: r.nodes.map(() => true), autoPlaced: true })), buses: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4 } };

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], bad = [];
async function newPage(w, h, block = true) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !/portrait-(sol|yuna|daeun|jinho)-calm/.test(r.url())) bad.push(r.status() + ' ' + r.url()); });
  if (block) await page.route(/portrait-(sol|yuna|daeun|jinho)-calm\.webp$/, (route) => route.fulfill({ status: 404, body: 'not found' }));
  return page;
}
const brokenImages = (page) => page.evaluate(() => [...document.images].filter((i) => i.complete && i.getAttribute('src') && i.naturalWidth === 0 && i.offsetParent !== null).map((i) => i.getAttribute('src')));
async function closeIntro(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.locator('#goal-intro').evaluate((d) => d.open).catch(() => false)) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') await page.keyboard.press('Enter'); else await page.locator('#btn-goal-start').click().catch(() => {}); await page.waitForTimeout(60); continue; }
    if (await page.locator('body').getAttribute('data-screen') === 'plan') break; await page.waitForTimeout(80);
  }
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); const c = document.querySelector('#first-coach-close'); if (c) c.click(); });
}
const lay = (page, plan) => page.evaluate((P) => {
  const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true; S.beginPlan(s); s.draft.buses = s.draft.buses.filter((b) => !b.leased);
  s.draft.routes = JSON.parse(JSON.stringify(P.routes)); s.draft.buses.forEach((b) => { b.routeNum = P.buses[b.id] != null ? P.buses[b.id] : null; });
  A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}, plan);
async function answerChoices(page) {
  for (let k = 0; k < 3; k++) {
    if (await page.locator('#petition-reflect').count() && await page.locator('#petition-reflect').getAttribute('aria-pressed') !== 'true') { await page.locator('#petition-reflect').click(); await page.locator('#petition-why').fill('기다린 사람이 많아서'); }
    if (await page.locator('#elder-keep').count() && await page.locator('#elder-keep').getAttribute('aria-pressed') !== 'true') { await page.locator('#elder-keep').click(); await page.locator('#elder-why').fill('어르신 이동을 지키려고'); }
  }
}
// 출발 확인창까지 — 경고 줄과 기본 초점(8번)
async function depart(page) {
  await page.locator('#btn-depart').click();
  if (!await page.locator('#confirm-depart[open]').count()) await page.locator('#btn-depart').click(); // 이유 안내 뒤 두 번째
  await page.locator('#confirm-depart[open]').waitFor();
  return page.evaluate(() => ({ lines: [...document.querySelectorAll('#confirm-depart-body li')].map((l) => [l.id, l.textContent]), focus: document.activeElement && document.activeElement.id, title: document.querySelector('#confirm-depart-h').textContent }));
}
// ‘끝까지’ — 3단계부터 11:00에 한 번 묻고(6번) ‘그대로 끝까지’
async function skip(page, p) {
  await page.waitForFunction(() => document.body.dataset.screen === 'run' && PB.UI.runState());
  await page.locator('#run-skip').click(); await page.waitForTimeout(150);
  const ask = await page.evaluate(() => { const d = document.querySelector('#skip-fix-ask'), st = PB.UI.runState(); return { open: !!(d && d.open), clock: PB.App.clock(st.tf), focus: document.activeElement && document.activeElement.id, text: d ? d.textContent : '', bar: document.querySelector('#run-statusbar-text').textContent }; });
  report.skip[p] = ask;
  if (p >= 3) {
    assert.ok(ask.open && ask.clock === '11:00', `${p}단계: ‘끝까지’가 11:00에 멈추고 묻는다 ${JSON.stringify(ask)}`); assert.equal(ask.focus, 'skip-fix-open', '물음 창 첫 초점 = 노선 고치기');
    if (p === 3) await page.screenshot({ path: shot('skip-ask-3') });
    await page.locator('#skip-fix-go').click();
  } else assert.ok(!ask.open, `${p}단계: 노선 고치기가 없는 단계는 묻지 않음`);
  await page.locator('#result-headline').waitFor({ timeout: 30000 });
}
async function nextStage(page) { await page.locator('#btn-next-phase').click(); await closeIntro(page); }

let page;
try {
  // ── 1280×800: 1~8단계 + 엔딩 + 보고서 ──
  page = await newPage(1280, 800);
  await page.goto(base + '?no3d=1&seed=' + SEED); await page.evaluate(() => localStorage.clear()); await page.reload();
  assert.equal(await page.locator('#seed-note').innerText(), '지정된 세팅 ' + SEED + '(으)로 시작해요.', '시드 지정 방법 = ?seed=');
  await page.locator('#btn-start').click(); await closeIntro(page);
  assert.equal(await page.evaluate(() => PB.App.s.seed + ' ' + PB.App.s.config.phases.length), SEED + ' 8');
  for (let p = 1; p <= 8; p++) {
    await lay(page, p === 4 ? TRANSFER4 : PLANS[p]); await page.waitForTimeout(500);
    // 9번: 계획 화면(05:00)에 11:00 문장이 남지 않음
    const planText = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((n) => n.offsetParent !== null && n.children.length === 0).map((n) => n.textContent).join(' '));
    assert.ok(!/이제 15:00까지/.test(planText), p + '단계 계획 화면에 ‘이제 15:00까지’ 문장 없음');
    // 12번
    if (await page.locator('#plan-econ-h').count()) { const e = await page.locator('#plan-econ-h').innerText(); assert.match(e, /공공서비스 정류장 하루 6번 정차: \d\/\d곳/, e); assert.ok(!e.includes('수행분'), e); }
    await answerChoices(page);
    if (p === 4) {
      // ── 2번: 갈아타기 2번 미리 경고 ──
      const chips = await page.evaluate(() => ['yuna', 'daeun', 'haneul'].map((id) => { const b = document.querySelector('#person-chip-' + id); const f = b && b.querySelector('.person-chip-flag.transfer'); return { id, flag: f ? f.textContent : null, label: b ? b.getAttribute('aria-label') : '' }; }));
      assert.equal(chips[0].flag, '갈아타기 2번 필요'); assert.equal(chips[1].flag, '갈아타기 2번 필요'); assert.equal(chips[2].flag, null);
      assert.ok(chips[0].label.includes('유나: 갈아타기 2번 필요, 이대로면 못 가요'), chips[0].label);
      await page.locator('#person-chip-yuna').click(); await page.waitForTimeout(400);
      const toast = await page.evaluate(() => [...document.querySelectorAll('#minimal-toast, [role=status]')].map((n) => n.textContent).filter((t) => t.includes('유나 · ')).join(' / '));
      assert.match(toast, /갈아타기 2번 필요\(.+\) — 갈아타기는 한 번까지라 이대로면 못 가요/, toast);
      assert.ok(await page.locator('#person-path .pp-line.too-many').count() > 0, '갈아타기 2번 길은 끊긴 선');
      await page.screenshot({ path: shot('plan4-transfer-1280') }); await page.locator('#person-chip-yuna').click();
      // 3번: 대학교 쪽 끝에서 목록 연결 → 대학교 쪽에 붙음
      await page.evaluate(() => { const s = PB.App.s; s.draft.routes.find((r) => r.num === 4).nodes = ['C', 'B', 'F']; s.draft.routes.find((r) => r.num === 4).stops = [true, true, true]; PB.App.render(); });
      await page.locator('#route-4').click(); await page.waitForTimeout(200);
      const handle = page.locator('.route-end-handle[data-end=head]'); await handle.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
      await page.locator('#btn-text-mode, #plan-text-toggle').first().click().catch(() => {}); await page.waitForTimeout(300);
      if (!await page.locator('#stop-picker').count()) await page.evaluate(() => { PB.Minimal && PB.Minimal.text && PB.Minimal.text(true); PB.App.render(); });
      await page.evaluate(() => { const d = document.querySelector('#stop-picker'); if (d) d.open = true; });
      const endLine = await page.locator('#picker-end').innerText(); assert.ok(endLine.startsWith('지금 대학교 쪽 끝에 붙어요.'), endLine);
      await page.locator('#stop-picker').screenshot({ path: shot('picker-end-1280') });
      await page.locator('#next-J').click(); await page.waitForTimeout(200);
      const r4 = await page.evaluate(() => PB.App.s.draft.routes.find((r) => r.num === 4).nodes.join(''));
      assert.equal(r4, 'JCBF', '대학교 쪽 끝을 고른 뒤 목록 연결 = 대학교 쪽(맨 앞)에 붙음');
      await page.locator('#picker-end-switch').click(); await page.waitForTimeout(150);
      assert.ok((await page.locator('#picker-end').innerText()).startsWith('지금 외곽 마을 쪽 끝에 붙어요.'), '끝 바꾸기 버튼');
      log('3번 목록 연결: 대학교 쪽 끝 → ' + r4);
      await lay(page, TRANSFER4); await answerChoices(page);
      await page.evaluate(() => { if (PB.Minimal && PB.Minimal.text) PB.Minimal.text(false); PB.App.render(); });
    }
    if (p === 6) {
      // ── 7번: 직행 노선 시간 — 노선 칩 간격 = 글 목록 한 바퀴 = 노선 카드 = 출발 확인 ──
      const lap = await page.evaluate(() => { const S = PB.Session, s = PB.App.s, A = PB.App; return { cycle: A.duration(S.routeCycle(s, 5)), gap: A.duration(S.routeHeadway(s, 5)), buses: s.draft.buses.filter((b) => b.routeNum === 5).length }; });
      const chip = await page.locator('#route-5 .route-tab-gap').innerText();
      assert.equal(chip.replace(/\s+/g, ' ').trim(), '간격 약 ' + lap.gap, '노선 칩 ' + chip);
      await page.locator('#route-5').click(); await page.waitForTimeout(200);
      const texts = await page.evaluate(() => { PB.App.render(); return { list: (document.querySelector('#text-routes-body') || {}).textContent || '', summary: (document.querySelector('.route-summary') || {}).textContent || '', econ: (document.querySelector('#route-econ') || {}).textContent || '' }; });
      if (texts.summary) assert.ok(texts.summary.endsWith('한 바퀴 ' + lap.cycle), texts.summary);
      if (texts.econ) assert.ok(texts.econ.includes(lap.gap + ' 간격'), texts.econ);
      report.lap6 = { lap, chip, texts }; log('7번 직행: 한 바퀴 ' + lap.cycle + ' · 간격 ' + lap.gap + ' · 버스 ' + lap.buses + '대');
    }
    if (p === 7) {
      // ── 4번: 6단계 사건 청원에 7단계에서 답하는 칸 ──
      assert.equal(await page.locator('#petition-card').count(), 1, '7단계 계획에 청원 카드');
      report.sentences.petitionCard = await page.locator('#petition-card').innerText(); await page.locator('#petition-card').screenshot({ path: shot('plan7-petition') });
    }
    const dep = await depart(page);
    // 8번: 경고가 있으면 노선 고치기, 없으면 이대로 출발
    assert.equal(dep.focus, dep.lines.length ? 'confirm-no' : 'confirm-yes', `${p}단계 확인창 초점 ${JSON.stringify(dep)}`);
    if (p === 4) { const t = dep.lines.find((l) => l[0] === 'depart-transfers'); assert.ok(t && /유나: 갈아타기 2번 필요, 이대로면 못 가요/.test(t[1]) && /다은: 갈아타기 2번 필요/.test(t[1]), JSON.stringify(dep.lines)); await page.screenshot({ path: shot('depart4-1280') }); report.sentences.depart4 = t[1]; }
    report['depart' + p] = dep;
    await page.locator('#confirm-yes').click();
    await skip(page, p);
    await page.waitForTimeout(600);
    const broken = await brokenImages(page); assert.deepEqual(broken, [], p + '단계 결과: 깨진 그림 없음');
    const res = await page.evaluate(() => ({ bridge: (document.querySelector('#think-bridge') || {}).textContent || '', faces: document.querySelectorAll('.img-fallback-initial').length }));
    // 11번: 한 곳만
    assert.ok((res.bridge.match(/살펴볼 곳/g) || []).length <= 1 && !res.bridge.includes('남은 비율이 가장 큰 곳'), p + '단계 연결 문장 한 곳: ' + res.bridge);
    report.sentences['bridge' + p] = res.bridge;
    if (p === 4) {
      const why = await page.evaluate(() => [...document.querySelectorAll('#panel *')].map((n) => n.textContent).filter((t) => /갈아타기를 두 번 해야 해서 못 갔어요\(갈아타기는 한 번까지\)/.test(t)).length);
      assert.ok(why > 0, '4단계 결과: 유나·다은 실패 이유 = 갈아타기 두 번'); await page.screenshot({ path: shot('result4-1280'), fullPage: true });
      const m = await page.evaluate(() => ({ t: PB.App.s.history[3].metrics.transfers, n: PB.App.s.history[3].metrics.noLink })); report.result4 = m; log('2번 4단계 결과: 갈아타기 2번 ' + m.t + '건 · 노선 없음 ' + m.n + '건');
    }
    if (p === 7) {
      const f = await page.evaluate(() => { const T = (q) => { const n = document.querySelector(q); return n ? n.textContent : null; }; return { fail: T('#petition-fail'), verdict: T('#petition-verdict'), then: T('#petition-then'), answer: T('#petition-answer') }; });
      assert.match(f.fail, /^하루가 끝났을 때 병원·공공서비스에서 출발해 목적지까지 못 간 이동: 6단계 \d+건\(출발 \d+건 중\) → 7단계 \d+건\(출발 \d+건 중\)$/, f.fail);
      assert.match(f.verdict, /^반영했(어요|지만)/); assert.ok(!f.then || f.then.startsWith('참고 · '), f.then);
      report.sentences.followup7 = f; await page.locator('#petition-followup').scrollIntoViewIfNeeded(); await page.locator('#petition-followup').screenshot({ path: shot('result7-petition') });
    }
    if (p === 3) {
      const f = await page.evaluate(() => ({ fail: (document.querySelector('#petition-fail') || {}).textContent, verdict: (document.querySelector('#petition-verdict') || {}).textContent }));
      report.sentences.followup3 = f; assert.match(f.fail || '', /^하루가 끝났을 때 /);
    }
    if (p === 5) { // 새로고침 뒤 이어하기(결과 화면 저장본)
      await page.reload(); await page.locator('#btn-continue').click(); await page.locator('#result-headline').waitFor({ timeout: 30000 });
      assert.equal(await page.evaluate(() => PB.App.s.phase + PB.App.s.stage), '5result', '새로고침 뒤 이어하기'); log('새로고침 뒤 이어하기: 5단계 결과');
    }
    if (p < 8) {
      await nextStage(page);
      // 9번: 다음 단계 계획(05:00)에 남은 상태 문장 없음
      const stale = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((n) => n.offsetParent !== null && n.children.length === 0 && /이제 15:00까지/.test(n.textContent)).map((n) => n.id || n.className));
      assert.deepEqual(stale, [], (p + 1) + '단계 계획: 11:00 문장이 보이지 않음');
    }
  }
  // 엔딩 → 보고서
  await page.locator('#btn-next-phase').click();
  for (let i = 0; i < 40 && await page.locator('#goal-intro').evaluate((d) => d.open); i++) { await page.locator('#btn-goal-start').click().catch(() => {}); await page.waitForTimeout(80); }
  await page.locator('#ending-verdict').waitFor({ timeout: 30000 }); await page.waitForTimeout(800);
  assert.deepEqual(await brokenImages(page), [], '엔딩: 깨진 그림 없음');
  report.endingFaces = await page.evaluate(() => [...document.querySelectorAll('.resident-card .face')].map((f) => f.textContent.trim() || 'img'));
  await page.screenshot({ path: shot('ending-1280'), fullPage: true });
  await page.locator('#btn-report').click(); await page.locator('#report-badges').waitFor();
  const rep = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#report-choices .report-row, #report-choices dl > *, #report-choices p')].map((n) => n.textContent), choices: document.querySelector('#report-choices').innerText, badge: document.querySelector('[data-badge=petition]').innerText, plan6: (document.querySelector('[data-phase="6"] .report-plan') || {}).innerText }));
  assert.ok(/6단계 청원/.test(rep.choices) && /6단계 병원·공공서비스 주민 청원 · 7단계 답 → 반영한다 · 이유: 기다린 사람이 많아서 · 못 간 이동 \d+건 → \d+건/.test(rep.choices), rep.choices);
  assert.match(rep.badge, /줄었거나 0건을 지켰으면 받아요/);
  const num7 = rep.choices.match(/6단계 병원·공공서비스 주민 청원[^\n]*못 간 이동 (\d+)건 → (\d+)건/), f7 = report.sentences.followup7.fail.match(/6단계 (\d+)건\(출발 \d+건 중\) → 7단계 (\d+)건/);
  assert.deepEqual([num7[1], num7[2]], [f7[1], f7[2]], '그 뒤 화면과 보고서가 같은 숫자');
  const lapReport = rep.plan6 || ''; assert.ok(lapReport.includes('한 바퀴 ' + report.lap6.lap.cycle), '보고서 직행 한 바퀴 = 화면: ' + lapReport);
  report.report = rep; await page.screenshot({ path: shot('report-1280'), fullPage: true });
  log('1280×800 1~8단계·엔딩·보고서 통과');
  await page.close();

  // ── 1148×977 · 390×844: 4단계 경고·확인창, 7단계 청원 카드 ──
  for (const [w, h] of [[1148, 977], [390, 844]]) {
    page = await newPage(w, h);
    await page.goto(base + '?no3d=1&seed=' + SEED); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.locator('#btn-start').click(); await closeIntro(page);
    await page.evaluate((PL) => { const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true; const C = PB.Choices;
      while (s.phase < 4) { S.beginPlan(s); s.draft.routes = JSON.parse(JSON.stringify(PL[s.phase].routes)); s.draft.buses.forEach((b) => { b.routeNum = PL[s.phase].buses[b.id] != null ? PL[s.phase].buses[b.id] : null; }); if (C.petitionFor(s, s.phase)) C.set(s, 'petition', 'choice', 'reflect'); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
      A.enterPlan(); }, PLANS);
    await closeIntro(page); await lay(page, TRANSFER4); await page.waitForTimeout(800);
    const flags = await page.evaluate(() => [...document.querySelectorAll('.person-chip-flag.transfer')].map((f) => { const r = f.getBoundingClientRect(), b = f.closest('.person-chip').getBoundingClientRect(); return { t: f.textContent, inside: r.right <= b.right + 1 && r.left >= b.left - 1 && r.width > 0 }; }));
    assert.equal(flags.length, 2, w + ': 칩 경고 두 개'); assert.ok(flags.every((f) => f.inside), w + ': 경고가 칩 안 ' + JSON.stringify(flags));
    assert.deepEqual(await brokenImages(page), [], w + ': 깨진 그림 없음');
    await page.screenshot({ path: shot(`plan4-transfer-${w}`) });
    await page.locator('#elder-keep').click();
    const dep = await depart(page); assert.equal(dep.focus, 'confirm-no'); assert.ok(dep.lines.some((l) => l[0] === 'depart-transfers'), JSON.stringify(dep.lines));
    await page.screenshot({ path: shot(`depart4-${w}`) });
    await page.locator('#confirm-no').click();
    log(w + '×' + h + ' 4단계 경고·확인창');
    await page.close();
  }

  // ── 기본 모드 5단계 한 번(무난한 노선 playtest-1111-plan) — 그림을 막은 채 3·4단계 칩·지도 핀·결과·엔딩에 깨진 그림 없음, 화면 버튼으로 출발·끝까지 ──
  {
    const { PLAN } = require('./playtest-1111-plan.cjs');
    page = await newPage(1280, 800);
    await page.goto(base + '?no3d=1'); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.locator('#btn-start').click(); await closeIntro(page);
    for (let p = 1; p <= 5; p++) {
      await page.evaluate((PL) => { const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true; S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
        PL.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; } });
        A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); }, PLAN[p - 1]);
      await page.waitForTimeout(700); await answerChoices(page);
      if (p >= 3) { assert.deepEqual(await brokenImages(page), [], '기본 ' + p + '단계 계획: 깨진 그림 없음'); assert.ok(await page.locator('#people-hud .img-fallback-initial, #map-people .img-fallback-initial').count() >= 2, '기본 ' + p + '단계: 막은 초상은 이름 첫 글자'); }
      if (p === 4) await page.screenshot({ path: shot('default-plan4-1280') });
      await depart(page); await page.locator('#confirm-yes').click(); await skip(page, p);
      assert.deepEqual(await brokenImages(page), [], '기본 ' + p + '단계 결과: 깨진 그림 없음');
      if (p < 5) await nextStage(page);
    }
    await page.locator('#btn-next-phase').click();
    for (let i = 0; i < 40 && await page.locator('#goal-intro').evaluate((d) => d.open); i++) { await page.locator('#btn-goal-start').click().catch(() => {}); await page.waitForTimeout(80); }
    await page.locator('#ending-verdict').waitFor({ timeout: 30000 }); await page.waitForTimeout(600);
    assert.deepEqual(await brokenImages(page), [], '기본 엔딩: 깨진 그림 없음');
    const dflt = await page.evaluate(() => ({ bal: Math.round(PB.Session.balance(PB.App.s)), petitions: PB.Choices.list(PB.App.s).map((p) => p.kind) }));
    assert.equal(dflt.bal, 234298, '기본 모드 무난한 노선 누적 잔액 = 수정 전과 같음(CLAUDE.md 11-11 표 234,298)'); assert.deepEqual(dflt.petitions, ['fixed'], '기본 모드는 고정 청원만');
    await page.locator('#btn-report').click(); await page.locator('#report-badges').waitFor();
    log('기본 모드 5단계·엔딩·보고서: 누적 잔액 ' + dflt.bal + ' · 깨진 그림 없음');
    await page.close();
  }

  // ── 그림을 막지 않은 진짜 파일: 랜덤 4·7단계 칩·지도 핀이 모두 풀림(404 없음) ──
  page = await newPage(1280, 800, false);
  await page.goto(base + '?no3d=1&seed=' + SEED); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.locator('#btn-start').click(); await closeIntro(page);
  for (const P of [4, 7]) {
    await page.evaluate(([PL, P]) => { const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true; while (s.phase < P) { S.beginPlan(s); S.startRun(s); S.finishRun(s); s.end = null; s.negStreak = 0; S.nextPhase(s); } A.enterPlan(); }, [PLANS, P]);
    await closeIntro(page); await page.waitForTimeout(1500);
    const imgs = await page.evaluate(() => [...document.querySelectorAll('#people-hud img, #map-people img')].map((i) => [i.getAttribute('src'), i.complete && i.naturalWidth > 0]));
    assert.ok(imgs.length >= 5 && imgs.every((x) => x[1]), P + '단계 실제 그림 파일 ' + JSON.stringify(imgs));
  }
  log('그림을 막지 않으면 sol·yuna·daeun·jinho 포함 모두 풀림');
  await page.close();
  assert.deepEqual(bad, [], '그 밖의 404 없음');
  assert.deepEqual(errors, [], '페이지 오류 없음');
  console.log('PASS random-1112 ' + JSON.stringify({ skip: Object.fromEntries(Object.entries(report.skip).map(([k, v]) => [k, v.open ? v.clock : '-'])) }));
  console.log(JSON.stringify(report.sentences, null, 1));
} finally { await browser.close(); server.close(); }
