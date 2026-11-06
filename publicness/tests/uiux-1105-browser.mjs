// 2026-11-05 UI/UX 수정 지시서 확인(헤드리스 Edge, 2D). 지시서 ‘끝나고 확인할 것’ 1~6과 P0·P1·P2 항목을 실제 화면에서 잰다.
// 기본 모드 재현 계획: 1단계 빨강 외곽-대학교-밀집 주거지-병원, 초록 기차역-산업 / 2단계 주황 시장-운동장-밀집 주거지-기차역 / 3단계 하늘 신도시-기차역.
// SHOT_DIR에 1060x977·1280x800·390x844 스크린샷을 남긴다.
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SHOT = process.env.SHOT_DIR || 'publicness/tests';
const ok = name => console.log('  ok', name);
// 긴 단계를 나눠 돌릴 때: UX_PART=depart,frame1060,frame1280,run,nolink,p5,misc,tab,goal,tablet,buscount (없으면 전부)
const only = process.env.UX_PART, want = k => !only || only.split(',').includes(k);
const ROUTES = { 1: [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G']]], 2: [[3, ['E', 'H', 'B', 'A']]], 3: [[4, ['I', 'A']]] };
async function fresh(viewport, q = 'no3d=1') {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' }); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + '?' + q); await page.evaluate(() => localStorage.clear()); await page.reload(); return page;
}
async function play(page, phase) {
  await page.evaluate(([R, phase]) => {
    const A = PB.App, S = PB.Session; if (!A.s) { A.startGame(); A.s.tutorialSeen = true; } const s = A.s;
    const add = p => (R[p] || []).forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
    while (s.phase < phase) { S.beginPlan(s); add(s.phase); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
    S.beginPlan(s); add(s.phase); A.enterPlan(); document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }, [ROUTES, phase]); await page.waitForTimeout(700);
}
const stage = page => page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
const rect = (page, q) => page.evaluate(q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; }, q);
const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
async function depart(page) { await page.locator('#btn-depart').click(); await page.locator('#confirm-yes').click(); await page.waitForTimeout(500); await page.locator('#run-pause').click(); await page.waitForTimeout(150); }
async function toEmergency(page) { for (let i = 0; i < 30 && !(await page.locator('#emergency-dialog[open]').count()); i++) { await page.locator('#run-next').click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(700); } assert.equal(await page.locator('#emergency-dialog[open]').count(), 1, '긴급 조정 창'); }

try {
  // ── 1. 노선 없이 출발 ──
  if (want('depart')) { const page = await fresh({ width: 1060, height: 977 });
    await play(page, 1).catch(() => {});
    await page.evaluate(() => { const s = PB.App.s; s.draft.routes.forEach(r => { r.nodes = []; r.stops = []; }); s.draft.buses.forEach(b => { b.routeNum = null; }); PB.App.render(); });
    await page.waitForTimeout(200); await page.locator('#btn-depart').click();
    assert.equal(await page.locator('#confirm-depart-h').innerText(), '운행하는 버스가 없어요');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'confirm-no', '기본 포커스 = 노선 고치기');
    const body = await page.locator('#confirm-depart-body').innerText(); assert.match(body, /쉬는 버스 2대/); assert.match(body, /40,000원/); assert.match(body, /노선이 없는 정류장 7곳/);
    assert.ok((await page.locator('#depart-checks li').count()) <= 3, '본문 경고 최대 3줄'); assert.equal(await page.locator('#depart-more').count(), 1, '넘치는 경고만 자세히');
    assert.ok((await page.locator('#depart-more li').count()) >= 1, '자세히가 비어 있지 않음');
    ok('1 노선 0개: ' + body.split('\n')[0]); await page.locator('#confirm-no').click();
    // 2. 정상 계획 — 경고 없으면 자세히 없음(구도심 시장까지 이어 본다)
    await page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s; const set = (num, nodes) => { let r = s.draft.routes.find(x => x.num === num); r.nodes = nodes; r.stops = nodes.map(() => true); r.autoPlaced = true; }; set(1, ['F', 'C', 'B', 'D']); set(2, ['A', 'G', 'E']); s.draft.buses[0].routeNum = 1; s.draft.buses[1].routeNum = 2; A.render(); });
    await page.waitForTimeout(200); await page.locator('#btn-depart').click();
    assert.equal(await page.locator('#confirm-depart-h').innerText(), '이대로 출발할까요?'); assert.equal(await page.evaluate(() => document.activeElement.id), 'confirm-yes');
    assert.equal(await page.locator('#confirm-depart-body details').count(), 0, '빈 자세히 없음'); assert.equal(await page.locator('#depart-checks').count(), 0); assert.match(await page.locator('#depart-profit').innerText(), /예상 수지/);
    ok('2 정상 계획: 경고·자세히 없음, 포커스 이대로 출발'); await page.locator('#confirm-no').click(); await page.close();
  }
  // ── 지도 틀: 상태를 바꿔도 같은 크기 ──
  for (const vp of [{ width: 1060, height: 977 }, { width: 1280, height: 800 }]) {
    if (!want('frame' + vp.width)) continue;
    const page = await fresh(vp); await play(page, 1); const sizes = {}; sizes.plan = await stage(page);
    await page.screenshot({ path: `${SHOT}/_shot-uiux-${vp.width}x${vp.height}-p1-plan.png` });
    // P0-1: 정차 = 원 안 색 점, 초록은 병원에 서지 않음
    const marks = await page.evaluate(() => { const t = id => [...document.querySelectorAll(`.net-stop[data-node="${id}"] .tick`)].map(c => c.getAttribute('fill')); return { D: t('D'), A: t('A'), E: t('E'), green: document.querySelectorAll('#net-dim-2 > *').length, colors: PB.config.ui.routeColors }; });
    assert.deepEqual(marks.D, [marks.colors[0]], '병원에는 빨강 점만'); assert.deepEqual(marks.A, [marks.colors[1]]); assert.deepEqual(marks.E, []);
    if (vp.width === 1060) ok('P0-1 정차 점: 병원=빨강만(초록 점 없음), 시장=점 없음');
    await depart(page); sizes.run = await stage(page);
    await page.locator('#btn-panel-toggle').click(); await page.waitForTimeout(150); sizes.drawer = await stage(page);
    const dr = await rect(page, '#panel'), st = await rect(page, '#stage'), pf = await rect(page, '#minimal-profit');
    assert.ok(!hit(dr, st), '운행 상황이 지도를 덮지 않음'); assert.ok(!hit(dr, pf), '운행 상황이 수지를 덮지 않음'); await page.locator('#btn-panel-toggle').click();
    await page.keyboard.press('Escape');
    // P2 Space
    await page.evaluate(() => document.activeElement.blur()); const was = await page.evaluate(() => PB.UI.runState().paused); await page.keyboard.press('Space'); await page.waitForTimeout(100); assert.notEqual(await page.evaluate(() => PB.UI.runState().paused), was, 'Space 재개'); await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('Space'); await page.waitForTimeout(100);
    await page.evaluate(() => { const s = PB.App.s; PB.UI.stopRun(); PB.Session.finishRun(s); PB.App.go('result'); }); await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#result-details').open = true; document.querySelector('#result-map-toggle').click(); }); await page.waitForTimeout(250); sizes.resultMap = await stage(page);
    await play(page, 3); sizes.p3 = await stage(page);
    await page.locator('#plan-ai-toggle').click(); await page.locator('#goal-time').click(); await page.locator('#rec-card').waitFor({ timeout: 60000 }); await page.waitForTimeout(200); sizes.ai = await stage(page);
    const ai = await rect(page, '#plan-ai-popover'); assert.ok(!hit(ai, await rect(page, '#stage')), 'AI 패널이 지도를 덮지 않음');
    const head = await page.locator('#rec-compare thead').innerText(); assert.match(head, /내 노선[\s\S]*AI 제안/); assert.equal(await page.locator('#rec-compare tbody tr').count(), 5);
    assert.ok(await page.evaluate(() => { const a = document.querySelector('#rec-compare').getBoundingClientRect().top, b = document.querySelector('.goal-row').getBoundingClientRect().top; return a < b; }), '비교표가 목표 버튼보다 위');
    assert.match(await page.locator('#rec-compare').innerText(), /좋아짐|나빠짐|같음/); assert.match(await page.locator('#rec-people').innerText(), /주요 인물 기준 충족[\s\S]*\(/);
    const toast = await rect(page, '#minimal-toast'); if (toast) { assert.ok(!hit(toast, ai), '알림이 패널에 가리지 않음'); }
    await page.screenshot({ path: `${SHOT}/_shot-uiux-${vp.width}x${vp.height}-p3-ai.png` });
    await page.locator('#plan-ai-close').click(); await page.waitForTimeout(100);
    await depart(page); await toEmergency(page); await page.waitForTimeout(400); sizes.emergency = await stage(page);
    assert.equal(await page.evaluate(() => document.querySelector('#topbar').inert && document.querySelector('.stage-col').inert), true, '긴급 조정 중 뒤쪽 inert');
    const em = await rect(page, '#emergency-dialog'); assert.ok(!hit(em, await rect(page, '#stage')), '긴급 조정 창이 지도를 덮지 않음');
    await page.screenshot({ path: `${SHOT}/_shot-uiux-${vp.width}x${vp.height}-p3-emergency.png` });
    await page.locator('#emergency-continue').click(); await page.waitForTimeout(300); sizes.after = await stage(page); assert.equal(await page.evaluate(() => document.querySelector('#topbar').inert), false);
    const all = Object.values(sizes).map(s => s.w + 'x' + s.h); assert.equal(new Set(all).size, 1, '캔버스 크기 하나: ' + JSON.stringify(sizes));
    assert.deepEqual(page.errors, []); ok(`P1-1 ${vp.width}x${vp.height} 계획·운행·운행 상황·결과 지도·AI·긴급 조정 = ${all[0]}`); await page.close();
  }
  // ── 2. 1단계 운행·결과, 3. 2단계 진입, P1-5, P1-10 ──
  if (want('run')) { const page = await fresh({ width: 1280, height: 800 }); await play(page, 1); await depart(page);
    const live = await page.evaluate(() => { const p = document.querySelector('#minimal-profit'); return { title: p.title, running: +p.dataset.running, total: +p.dataset.live }; });
    assert.match(live.title, /운행 종료 때 정산될 항목: 보유비 −40,000원, 공공서비스 수행분 \+0원/); assert.equal(live.running - 40000, live.total, '화면 수지 − 정산 항목 = 정산 수지');
    await page.evaluate(() => document.querySelector('#run-next').click()); await page.waitForFunction(() => PB.UI.runState().hold, null, { timeout: 30000 });
    const hold = await page.evaluate(() => ({ bar: document.querySelector('#run-statusbar-text').textContent, vis: !!document.querySelector('#run-statusbar').getClientRects().length, alerts: document.querySelectorAll('#stage-overlay .run-alert').length, btn: document.querySelector('#run-open-emergency').hidden }));
    assert.ok(hold.vis, '상태 줄이 보임'); assert.match(hold.bar, /왕복을 마쳐서|을 넘어서/); assert.match(hold.bar, /멈췄어요/); assert.ok(hold.alerts >= 1, '지도 위 말풍선'); assert.equal(hold.btn, true, '1단계는 긴급 조정 없음');
    ok('P1-5 멈춤: ' + hold.bar);
    await page.evaluate(() => { const s = PB.App.s; PB.UI.stopRun(); PB.Session.finishRun(s); PB.App.go('result'); }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const h = PB.App.s.history[0]; return { think: document.querySelector('#think-bridge').textContent, worst: h.scores.mobility.worst, name: PB.App.nodeName(h.scores.mobility.worst.id), detail: document.querySelector('#score-worst').textContent, lead: document.querySelector('#result-lead').textContent, settle: document.querySelector('#result-settle').innerText, trend: document.querySelector('#result-trend').textContent, final: h.metrics.costs.total }; });
    assert.ok(r.think.startsWith('남은 비율이 가장 큰 곳은 '), r.think); /* 2026-11-06 P1-4: 건수 최다(자세히)와 비율 최대(생각해 보기)는 이름이 다른 줄 */ assert.ok(r.detail.includes(`${r.name} 출발 ${r.worst.missed}건 (${r.worst.N}건 중)`), r.detail);
    assert.match(r.lead, /이동 요청 142건\(기본 139건 \+ 추가 3건\)/); assert.match(r.settle, /운행 중[\s\S]*종료 정산[\s\S]*최종/); assert.match(r.trend, /지금 추세\(이번 단계 수지 유지\)라면 학기 말 잔액 약/);
    ok('2 생각해 보기 = 자세히: ' + r.think.slice(0, 50)); ok('P1-4 ' + r.settle.replace(/\n/g, ' / '));
    await page.evaluate(() => { PB.App.s.choices = { 1: 'longest' }; }); await play(page, 2);
    const ban = await page.locator('#map-banner').innerText(); assert.match(ban, /^2단계 · 적응기 · 종합운동장이 생겼어요 · 버스 \+1 \(보유비 단계당 20,000원\) · 노선 \+1 · 이동 요청 \+\d+건$/);
    assert.equal(await page.locator('#hud-trend').count(), 1); const tags = await page.evaluate(() => ({ route: [...document.querySelectorAll('.route-tab .new-tag')].length, stop: document.querySelector('.net-label[data-node="H"] .net-new').textContent }));
    assert.equal(tags.route, 1, '새 노선 칩 표시'); assert.equal(tags.stop, '새 정류장'); ok('3 2단계 배너: ' + ban);
    // 종합운동장 위를 지나는 빨강: 서지 않으면 빈 원·흐린 선
    await page.evaluate(() => { const s = PB.App.s, r = s.draft.routes.find(x => x.num === 1); r.nodes = ['B', 'G']; r.stops = [true, true]; PB.App.render(); }); await page.waitForTimeout(400);
    const h = await page.evaluate(() => { const g = document.querySelector('.net-stop[data-node="H"]'); return { cls: g.getAttribute('class'), pass: g.dataset.pass, zone: document.querySelector('#net-dim-1 circle') ? 1 : 0, ticks: [...g.querySelectorAll('.tick')].map(t => t.getAttribute('fill')), colors: PB.config.ui.routeColors }; });
    assert.ok(h.pass && h.pass.split(',').includes('1'), '빨강이 지나감으로 표시: ' + JSON.stringify(h)); assert.equal(h.zone, 1, '그 구간 흐리게'); assert.ok(!h.ticks.includes(h.colors[0]), '빨강 정차 점 없음');
    ok('P0-1 종합운동장: 빨강 ' + (h.ticks.length ? '점 없음(주황만 정차)' : '빈 원')); assert.deepEqual(page.errors, []); await page.close();
  }
  // ── 노선 없음 말풍선 ──
  if (want('nolink')) { const page = await fresh({ width: 1280, height: 800 }); await play(page, 1);
    await page.locator('#btn-depart').click(); await page.locator('#confirm-yes').click(); await page.locator('.bubble[data-kind="noLink"]').first().waitFor({ timeout: 20000 });
    await page.locator('.bubble[data-kind="noLink"]').first().click({ force: true }); const hint = await page.locator('.bubble-hint').first().textContent(); assert.match(hint, /서는 노선이 없어요|만나는 정류장이 없어요/);
    const pure = await page.evaluate(() => PB.Hud.linkHint(PB.Hud.routesNow(), 'F', 'G')); assert.match(pure, /^빨강과 초록이 만나는 정류장이 없어요/, pure);
    ok('P0-1 c 노선 없음 말풍선: ' + hint + ' / ' + pure); await page.close();
  }
  // ── 5. 5단계: 인물 6명, 쉬는 버스 경고, 스크린샷 ──
  for (const vp of [{ width: 1060, height: 977 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    if (!want('p5')) continue;
    const page = await fresh(vp); await play(page, 5); await page.waitForTimeout(300);
    const chips = await page.evaluate(() => [...document.querySelectorAll('#people-hud .person-chip')].map(c => { const r = c.getBoundingClientRect(); return { id: c.dataset.resident, in: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; }));
    assert.equal(chips.length, 6); assert.ok(chips.every(c => c.in), '인물 6명 모두 화면 안: ' + JSON.stringify(chips));
    assert.equal(await page.evaluate(() => { const r = document.querySelector('.people-hud-row'); return r.scrollWidth > r.clientWidth + 1; }), false, '칩 줄 가로 스크롤 없음');
    await page.locator('#btn-depart').click(); const b = await page.locator('#confirm-depart-body').innerText(); assert.match(b, /쉬는 버스 2대 · 이번 단계 보유비 2 x 20,000원 = 40,000원/); assert.match(b, /어린이·노인복지관\(새\)/);
    assert.equal(await page.locator('#confirm-depart-h').innerText(), '이대로 출발할까요?'); await page.locator('#confirm-no').click(); await page.waitForTimeout(200);
    // 390: 얼굴은 출발 정류장 가까이, 같은 정류장 얼굴끼리 안 겹침
    const faces = await page.evaluate(() => PB.Demand.residents(PB.App.s.config, PB.App.s.phase).map(rd => { const e = document.querySelector('#resident-map-' + rd.id).getBoundingClientRect(), s = document.querySelector('#stage').getBoundingClientRect(), n = PB.App.nodeXY(rd.o), p = PB.App.view.project(n.x, n.y); return { id: rd.id, o: rd.o, d: Math.hypot(e.left + e.width / 2 - s.left - p.left, e.top + e.height / 2 - s.top - p.top), r: e }; }));
    for (const f of faces) assert.ok(f.d <= 70, `${f.id} 얼굴이 출발 정류장 가까이(${Math.round(f.d)}px)`);
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) assert.ok(!(faces[i].r.left < faces[j].r.right - 2 && faces[j].r.left < faces[i].r.right - 2 && faces[i].r.top < faces[j].r.bottom - 2 && faces[j].r.top < faces[i].r.bottom - 2), `${faces[i].id}·${faces[j].id} 얼굴 안 겹침`);
    await page.screenshot({ path: `${SHOT}/_shot-uiux-${vp.width}x${vp.height}.png` });
    assert.deepEqual(page.errors, []); ok(`5 ${vp.width}x${vp.height} 5단계: 인물 6명 화면 안, 쉬는 버스 경고, 얼굴 최대 ${Math.round(Math.max(...faces.map(f => f.d)))}px`); await page.close();
  }
  // ── 결과 작은 지도·엔딩·타이틀 ──
  if (want('misc')) { const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); await page.goto(base + '?no3d=1'); await page.evaluate(() => localStorage.clear()); await page.reload();
    assert.ok(await page.locator('.mode-desc').first().isVisible(), '모드 설명 보임'); assert.match(await page.locator('.setting').innerText(), /2회 연속 0원 미만/); ok('P2 타이틀 모드 설명');
    await play(page, 1); await page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s; S.startRun(s); S.finishRun(s); A.go('result'); }); await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('.resident-card').open = true; }); await page.waitForTimeout(250);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.resident-card[open] .mm-label')].map(t => { const r = t.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, text: t.textContent }; }));
    assert.equal(labels.length, 2); assert.match(labels[0].text, /^출발 /); assert.match(labels[1].text, /^도착 /); assert.ok(!hit(labels[0], labels[1]), '라벨 안 겹침: ' + JSON.stringify(labels)); ok('P1-9 작은 지도: ' + labels.map(l => l.text).join(' / '));
    await page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s; S.nextPhase(s); while (s.stage !== 'ending') { S.beginPlan(s); S.startRun(s); S.finishRun(s); S.nextPhase(s); } A.go('ending'); }); await page.waitForTimeout(500);
    await page.locator('#btn-goal-start').waitFor(); await page.locator('#btn-goal-start').click(); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ending-title', '건너뛰면 제목에 포커스'); assert.equal(await page.evaluate(() => Math.round(scrollY + document.querySelector('#panel').scrollTop)), 0); ok('P2 컷 건너뛰기 → 결과 맨 위 제목'); await page.close();
  }
  // 컷신 중 Tab이 뒤쪽 화면으로 가지 않는다
  if (want('tab')) { const page = await fresh({ width: 1280, height: 800 }); await play(page, 1);
    await page.evaluate(() => PB.Cutscene.play('sol', () => {})); await page.waitForTimeout(200); const seen = new Set();
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); seen.add(await page.evaluate(() => { const a = document.activeElement; return a === document.body || a.closest('#goal-intro') ? 'ok' : a.id || a.tagName; })); }
    assert.deepEqual([...seen], ['ok'], 'Tab은 컷신 안에서만'); ok('P2 컷신 뒤쪽 키보드 차단(모달)'); await page.close();
  }
  // P1-10: 고른 목표를 다음 단계 결과에서 다시 짚는다(결과 화면 위쪽에 실제로 보이는지)
  if (want('goal')) for (const [key, re] of [['longest', /^이번 목표: 오래 기다린 사람부터 → 결과: 최장 대기 지난 단계 .+ → 이번 .+$/], ['many', /^이번 목표: 더 많은 사람을 빠르게 → 결과: 도착률 지난 단계 .+ → 이번 .+$/]]) {
    const page = await fresh({ width: 1280, height: 800 }); await play(page, 1);
    await page.evaluate(k => { const A = PB.App, S = PB.Session, s = A.s; S.startRun(s); S.finishRun(s); s.choices = { 1: k }; S.nextPhase(s); S.beginPlan(s); A.enterPlan(); }, key); await page.waitForTimeout(400);
    assert.match(await page.locator('#hud-goal').innerText(), /^이번 목표: /);
    await page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s; S.startRun(s); S.finishRun(s); A.go('result'); }); await page.waitForTimeout(400);
    const g = page.locator('#result-goal'); assert.ok(await g.isVisible(), '결과 맨 위 요약에 보임'); const box = await rect(page, '#result-goal'), text = await g.innerText(); assert.match(text, re); assert.ok(box.b <= 800, '스크롤 없이 첫 화면');
    assert.equal(await page.locator('#result-headline #result-goal').count(), 1); await page.screenshot({ path: SHOT + '/_shot-uiux-goal-' + key + '.png' }); ok('P1-10 ' + text); assert.deepEqual(page.errors, []); await page.close();
  }
  // 태블릿 세로: 지도 크기 고정 + 계획 화면이 세로로 넘치지 않음
  if (want('tablet')) { const page = await fresh({ width: 820, height: 1180 }); await play(page, 3); const a = await stage(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), '계획 화면 스크롤 없음: ' + await page.evaluate(() => document.documentElement.scrollHeight));
    await page.locator('#plan-ai-toggle').click(); await page.waitForTimeout(150); assert.deepEqual(await stage(page), a); await page.locator('#plan-ai-close').click(); await depart(page); assert.deepEqual(await stage(page), a); await toEmergency(page); await page.waitForTimeout(300); assert.deepEqual(await stage(page), a);
    ok('태블릿 820x1180 지도 ' + a.w + 'x' + a.h + ' 고정·계획 스크롤 없음'); assert.deepEqual(page.errors, []); await page.close();
  }
  // 지도 버스 수 표시(2026-11-05 사용자 승인): 시작 점 글자 없음 · 손잡이 1대 = 색 점, 2대+ = ×N, 0대 = 버스 없음 · 고른 노선만 ‘버스 N대’ · 운행 중 숫자 없음
  if (want('buscount')) for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await fresh(vp); await play(page, 3);
    await page.evaluate(() => { const s = PB.App.s; s.draft.buses.forEach(b => { b.routeNum = 1; }); s.draft.buses[1].routeNum = 2; s.draft.buses[2].routeNum = 2; s.draft.buses[3].routeNum = 3; s.draft.buses[0].routeNum = 3; PB.App.render(); document.querySelector('#route-1').click(); }); await page.waitForTimeout(500);
    const read = () => page.evaluate(() => Object.fromEntries([1, 2, 3, 4].map(n => { const b = document.querySelector('#route-bus-' + n), vis = q => { const e = b && b.querySelector(q); return e && getComputedStyle(e).display !== 'none' ? e.textContent : null; }; return [n, b ? { count: vis('.route-count'), full: vis('.route-full'), buses: b.dataset.buses, idle: b.classList.contains('idle'), aria: b.getAttribute('aria-label') } : null]; })));
    let r = await read();
    assert.deepEqual([r[1].count, r[1].full, r[1].idle], ['버스 없음', null, true], '고른 빈 노선도 버스 없음: ' + JSON.stringify(r[1]));
    assert.deepEqual([r[2].count, r[2].full], ['×2', null], '2대 = ×2'); assert.deepEqual([r[3].count, r[3].full], ['×2', null]);
    assert.match(r[2].aria, /버스 2대/); assert.match(r[1].aria, /운행 대기/);
    assert.equal(await page.locator('#net-layer .net-cap text').count(), 0, '시작 점 글자 없음'); assert.equal(await page.locator('#route-2').evaluate(e => e.textContent.includes('버스 2대')), true, '아래 노선 버튼은 그대로');
    await page.screenshot({ path: SHOT + '/_shot-uiux-buscount-' + vp.width + '.png' });
    await page.evaluate(() => document.querySelector('#route-2').click()); await page.waitForTimeout(350); r = await read(); assert.deepEqual([r[2].count, r[2].full], [null, '버스 2대'], '고른 노선만 또렷: ' + JSON.stringify(r[2])); assert.deepEqual([r[3].count, r[3].full], ['×2', null]);
    await page.evaluate(() => { const s = PB.App.s; s.draft.buses[2].routeNum = 1; PB.App.render(); }); await page.waitForTimeout(350); r = await read(); assert.deepEqual([r[1].count, r[1].full], [null, null], '1대 = 색 점만(고르지 않은 노선)');
    await page.locator('#route-bus-1').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150); assert.equal(await page.locator('#route-bus-1').getAttribute('aria-pressed'), 'true', '키보드로 고르기'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    // 노선 번호 표시를 켜도 동작
    await page.evaluate(() => { const c = document.querySelector('#opt-route-numbers'); c.checked = true; c.dispatchEvent(new Event('change')); }); await page.waitForTimeout(350);
    assert.equal(await page.locator('#route-bus-1 .route-num').textContent(), '1'); r = await read(); assert.equal(r[3].count, '×2'); assert.equal(await page.locator('#net-layer .net-cap text').first().textContent(), '1');
    await page.evaluate(() => { const c = document.querySelector('#opt-route-numbers'); c.checked = false; c.dispatchEvent(new Event('change')); }); await page.waitForTimeout(200);
    await depart(page); assert.equal(await page.locator('#net-layer .net-cap text').count(), 0, '운행 중 지도 숫자 없음'); assert.equal(await page.locator('#stage .route-count:visible, #stage .route-full:visible').count(), 0);
    await page.screenshot({ path: SHOT + '/_shot-uiux-buscount-run-' + vp.width + '.png' }); assert.deepEqual(page.errors, []); ok('버스 수 표시 ' + vp.width); await page.close();
  }
  console.log('PASS uiux-1105');
} finally { await browser.close(); server.close(); }
