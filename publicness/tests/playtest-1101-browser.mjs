// 2026-11-01 플레이테스트 수정 검증(헤드리스 Edge). 지도(미니멀) 모드와 텍스트 모드 모두.
// P0: 긴급 조정 기본값·효과 없는 이동 금지·미리 보기·완료 알림 / 확인창이 열리면 운행 멈춤 / 390px 이름표 / 도움말·출발 문구 / 빈 알림 /
//     머리말 보기 버튼 하나 / 조사 / 첫 정류장 안내 / 컷신 첫 클릭
// P1: AI 제안 패널(지도 밖·시트·제목·닫기·기준 한 줄·버튼 스크롤 없이·적용하면 닫힘) / ‘다음 사건까지’와 멈춘 이유 / ‘회’ /
//     1440×900·1280×800 한 화면 / 금액(노선 없음 안내·지금까지) / 배차 간격 글 / 결과 카드 ＋−
// P2: 이름표 기본 방향 고정 / 텍스트 모드 지도 안내 숨김
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SHOT = process.env.SHOT_DIR || 'publicness/tests', passed = [];
function ok(name) { passed.push(name); console.log('  ok', name); }
async function fresh(q = 'no3d=1', viewport = { width: 1366, height: 900 }, dpr = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, reducedMotion: 'reduce' }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.errors = errors;
  await page.goto(base + '?' + q); await page.evaluate(() => localStorage.clear()); return page;
}
// 단계 phase 계획 화면(앞 단계는 그대로 운행·정산)
async function toPlan(page, phase, routes) {
  await page.evaluate(({ phase, routes }) => {
    const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true;
    while (s.phase < phase) { S.beginPlan(s); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
    S.beginPlan(s); if (routes) { s.draft.routes = routes.map(r => ({ num: r.num, nodes: r.nodes, stops: r.nodes.map(() => true), autoPlaced: true })); s.draft.buses.forEach(b => { b.routeNum = null; }); routes.forEach(r => (r.buses || []).forEach(id => { const b = s.draft.buses.find(x => x.id === id); if (b) b.routeNum = r.num; })); }
    A.go('plan'); document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }, { phase, routes }); await page.waitForTimeout(500);
}
async function toEmergency(page) {
  for (let i = 0; i < 40 && !await page.locator('#emergency-dialog[open]').count(); i++) {
    await page.locator('#run-next').click();
    await page.waitForFunction(() => PB.UI.runState() && PB.UI.runState().hold, null, { timeout: 20000, polling: 20 });
  }
  await page.locator('#emergency-dialog[open]').waitFor();
}
const PH3 = [{ num: 1, nodes: ['A', 'B'], buses: [1, 2] }, { num: 2, nodes: ['F', 'D'], buses: [3] }, { num: 3, nodes: ['B', 'C', 'E'], buses: [] }];

try {
  // ── P0-1 긴급 조정 ───────────────────────────────
  for (const q of ['no3d=1', 'no3d=1&textmode']) {
    const page = await fresh(q);
    await toPlan(page, 3, PH3);
    if (q.includes('textmode')) await page.evaluate(() => PB.Minimal.text(true));
    await page.evaluate(() => { const S = PB.Session, s = PB.App.s; S.startRun(s); PB.App.go('run'); });
    await toEmergency(page);
    const info = await page.evaluate(() => {
      const s = PB.App.s, S = PB.Session, at = PB.UI.runState().pendingEmergency, bus = document.querySelector('#emergency-bus'), route = document.querySelector('#emergency-route');
      const cause = document.querySelector('#stage-overlay .run-alert[data-kind="emergency"]')?.dataset.node || null;
      const rows = [];
      for (const o of [...bus.options]) { bus.value = o.value; bus.dispatchEvent(new Event('change')); rows.push({ id: Number(o.value), cur: S.busRouteAt(s, Number(o.value), at), routes: [...route.options].map(x => Number(x.value)), preview: document.querySelector('#emergency-preview').textContent }); }
      return { at, cause, rows };
    });
    for (const r of info.rows) assert.ok(!r.routes.includes(r.cur), `${r.id}호차 목록에 지금 노선(${r.cur}번)이 없음`);
    assert.ok(info.rows.every(r => /^\d+호차는 (승객을 내린 뒤|차고에서 출발해) \d\d:\d\d부터 \d+번 노선에 들어가요\.$|운행이 끝날 때까지/.test(r.preview)), '미리 보기 한 줄: ' + info.rows.map(r => r.preview).join(' / '));
    ok(q + ' P0-1 새 노선 목록에 지금 달리는 노선 없음 · 미리 보기 한 줄');
    // 기본값 다시 그리기(패널을 다시 열면 기본 규칙대로)
    await page.evaluate(() => PB.App.render()); await page.locator('#emergency-dialog[open]').waitFor();
    const def = await page.evaluate(() => { const s = PB.App.s, S = PB.Session, at = PB.UI.runState().pendingEmergency;
      return { bus: Number(document.querySelector('#emergency-bus').value), route: Number(document.querySelector('#emergency-route').value), cur: S.busRouteAt(s, Number(document.querySelector('#emergency-bus').value), at), preview: document.querySelector('#emergency-preview').textContent, live: document.querySelector('#emergency-preview').getAttribute('aria-live') }; });
    assert.notEqual(def.route, def.cur, '기본값이 효과 없는 이동이 아님'); assert.equal(def.live, 'polite');
    assert.equal(def.bus, 4, '기본 버스 = 원인과 무관한 쉬는 4호차'); assert.ok(def.preview.startsWith('4호차는 차고에서 출발해 '), def.preview);
    // 같은 노선 이동은 엔진도 받지 않는다(조정권 그대로)
    assert.equal(await page.evaluate(() => { const s = PB.App.s, at = PB.UI.runState().pendingEmergency; return PB.Session.emergencyDecision(s, at, 1, PB.Session.busRouteAt(s, 1, at)); }), false);
    if (!q.includes('textmode')) await page.screenshot({ path: `${SHOT}/_shot-playtest-p0-1-after-window.png` });
    await page.locator('#emergency-apply').click();
    const t = await page.evaluate(() => ({ text: document.querySelector('#minimal-toast').textContent, hidden: document.querySelector('#minimal-toast').hidden, role: document.querySelector('#minimal-toast').getAttribute('role'), live: document.querySelector('#minimal-toast').getAttribute('aria-live'), log: PB.App.s.emergencyLog.length }));
    assert.equal(t.text, `${def.bus}호차를 ${def.route}번 노선으로 옮겼어요.`); assert.equal(t.hidden, false); assert.equal(t.role, 'status'); assert.equal(t.live, 'polite'); assert.equal(t.log, 1);
    if (!q.includes('textmode')) await page.screenshot({ path: `${SHOT}/_shot-playtest-p0-1-after-toast.png` });
    ok(q + ' P0-1 기본값 = 4호차(대기) → 원인 노선, 옮긴 뒤 aria-live 알림');
    // ── P0-2 확인창이 열리면 멈춤 ───────────────
    await page.waitForTimeout(300);
    await page.locator('#run-skip').click(); await page.locator('#confirm-skip[open]').waitFor();
    const a = await page.evaluate(() => PB.UI.runState().tf); await page.waitForTimeout(1500); const b = await page.evaluate(() => PB.UI.runState().tf);
    assert.equal(b, a, '건너뛰기 확인창이 열린 동안 시계가 멈춤');
    if (!q.includes('textmode')) await page.screenshot({ path: `${SHOT}/_shot-playtest-p0-2-after.png` });
    await page.locator('#skip-no').click(); await page.waitForTimeout(900); const c = await page.evaluate(() => PB.UI.runState().tf);
    assert.ok(c > b, '닫으면 이어 감');
    await page.locator('#btn-help').click(); const h1 = await page.evaluate(() => PB.UI.runState().tf); await page.waitForTimeout(800); const h2 = await page.evaluate(() => PB.UI.runState().tf);
    assert.equal(h2, h1, '도움말 창이 열린 동안에도 멈춤'); await page.locator('#help form button[type=submit]').click();
    ok(q + ' P0-2 확인창·도움말이 열린 동안 시뮬레이션 멈춤, 닫으면 이어 감');
    assert.deepEqual(page.errors, []); await page.close();
  }

  // ── P0-3 / P2-18 이름표(390×844 DPR 3, 3D·2D) ──
  for (const q of ['', 'no3d=1']) {
    const page = await fresh(q, { width: 390, height: 844 }, 3);
    await toPlan(page, 4, [{ num: 1, nodes: ['F', 'D', 'A'], buses: [1, 2] }, { num: 2, nodes: ['B', 'C', 'A'], buses: [3, 4] }]);
    await page.waitForTimeout(800);
    const m = () => page.evaluate(() => {
      const A = PB.App, st = document.querySelector('#stage').getBoundingClientRect(), labels = [...document.querySelectorAll('.net-label')];
      const P = {}; labels.forEach(l => { const n = A.nodeXY(l.dataset.node); P[l.dataset.node] = A.view.project(n.x, n.y); });
      const dist = (p, b) => Math.hypot(Math.max(b.x - p.left, 0, p.left - (b.x + b.w)), Math.max(b.y - p.top, 0, p.top - (b.y + b.h)));
      const out = labels.map(l => { const r = l.getBoundingClientRect(), b = { x: r.x - st.x, y: r.y - st.y, w: r.width, h: r.height }, id = l.dataset.node; return { id, b, own: dist(P[id], b), leader: !!document.querySelector(`.net-leaders line[data-node="${id}"]`) || dist(P[id], b) <= 10 }; });
      let overl = 0; for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const a = out[i].b, c = out[j].b; if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) overl++; }
      const cv = document.querySelector('#stage-3d canvas'); return { out, overl, canvas: cv && !document.querySelector('#stage-3d').hidden ? [cv.width, cv.clientWidth, devicePixelRatio] : null };
    });
    let r = await m();
    assert.ok(r.out.every(x => x.own <= 40), '모든 이름표가 자기 정류장 40px 안: ' + r.out.map(x => x.id + Math.round(x.own)).join(' '));
    // 2026-11-01 간판형(좁은 지도): 연결선 없이 바로 옆(공공서비스 고리 정류장은 고리 바깥 34px 안), 짧은 이름 + 전체 이름 aria-label
    assert.ok(r.out.every(x => x.own <= 34), '간판형 — 바로 옆: ' + r.out.map(x => x.id + Math.round(x.own)).join(' '));
    assert.equal(await page.locator('.net-leaders line').count(), 0, '좁은 지도엔 연결선 없음'); assert.equal(r.overl, 0, '이름표끼리 안 겹침');
    assert.equal(await page.locator('.net-label[data-node="D"]').getAttribute('aria-label'), '병원·공공서비스'); assert.equal(await page.locator('.net-label[data-node="D"] > span').first().innerText(), '병원');
    if (r.canvas) assert.equal(r.canvas[0], r.canvas[1] * Math.min(r.canvas[2], 2), '3D 캔버스 버퍼 = CSS 크기 × min(DPR,2), 이름표는 CSS 좌표');
    await page.screenshot({ path: `${SHOT}/_shot-playtest-p0-3-after-390${q ? '-2d' : ''}.png` });
    // 화면 크기가 바뀌면 다시 배치
    await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(900); r = await m();
    assert.ok(r.out.every(x => x.own <= 40), '크기 바꾼 뒤에도 자기 정류장 옆'); assert.equal(r.overl, 0);
    ok((q || '3d') + ' P0-3 390px DPR3 간판형 이름표(바로 옆·연결선 없음·짧은 이름)·겹침 없음, 820px로 바꾸면 다시 배치');
    assert.deepEqual(page.errors, []); await page.close();
  }
  {
    const page = await fresh('', { width: 1440, height: 900 });
    await toPlan(page, 4, [{ num: 1, nodes: ['F', 'D', 'A'], buses: [1, 2] }, { num: 2, nodes: ['B', 'C', 'A'], buses: [3, 4] }]);
    // 정류장 기준 상대 자리(지도 틀 크기가 바뀌어도 비교되게)
    const pos = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.net-label')].map(l => { const n = PB.App.nodeXY(l.dataset.node), p = PB.App.view.project(n.x, n.y); return [l.dataset.node, l.dataset.dir + ':' + Math.round(parseFloat(l.style.left) - p.left) + ',' + Math.round(parseFloat(l.style.top) - p.top)]; })));
    await page.waitForTimeout(600); const a = await pos();
    await page.evaluate(() => { const s = PB.App.s; s.draft.routes.push({ num: 3, nodes: ['E', 'J'], stops: [true, true], autoPlaced: true }); PB.App.render(); }); await page.waitForTimeout(600); const b = await pos();
    const moved = Object.keys(a).filter(k => a[k] !== b[k]);
    assert.ok(moved.every(k => ['E', 'J'].includes(k)), '새 노선이 닿은 정류장 말고는 이름표가 그대로: ' + moved.join(','));
    ok('P2-18 노선을 더해도 다른 정류장 이름표는 제자리(움직인 것: ' + (moved.join(',') || '없음') + ')');
    await page.close();
  }

  // ── P0-4 도움말·출발 확인 / P0-6 머리말 버튼 / P0-7·8 문구 / P1-14 한 화면 / P1-15 금액 / P2-19 ──
  for (const [w, h] of [[1440, 900], [1280, 800]]) {
    const page = await fresh('', { width: w, height: h });
    await toPlan(page, 4, [{ num: 1, nodes: ['F', 'D', 'A'], buses: [1, 2] }, { num: 2, nodes: ['B', 'C', 'A'], buses: [3, 4] }]);
    await page.waitForTimeout(700);
    const fit = await page.evaluate(() => { const d = document.querySelector('#btn-depart').getBoundingClientRect(), st = document.querySelector('#stage').getBoundingClientRect(), tabs = document.querySelector('#plan-toolbar .route-tabs').getBoundingClientRect(), dep = document.querySelector('#bus-depot').getBoundingClientRect();
      return { depart: d.bottom, tabs: tabs.bottom, depot: dep.bottom, stageTop: st.top, stageBottom: st.bottom, H: innerHeight, scroll: document.documentElement.scrollHeight }; });
    assert.ok(fit.depart <= fit.H && fit.tabs <= fit.H && fit.depot <= fit.H && fit.stageTop >= 0, `${w}×${h} 지도·노선 버튼·대기 버스·출발 버튼이 한 화면: ` + JSON.stringify(fit));
    assert.ok(fit.scroll <= fit.H + 1, '세로 스크롤 없음 ' + fit.scroll);
    await page.screenshot({ path: `${SHOT}/_shot-playtest-plan-${w}.png` });
    ok(`P1-14 ${w}×${h} 한 화면(출발 버튼 아래 끝 ${Math.round(fit.depart)} ≤ ${fit.H})`);
    await page.close();
  }
  {
    const page = await fresh('', { width: 1366, height: 900 });
    await toPlan(page, 1);
    const empty = await page.evaluate(() => ({ cls: document.querySelector('#minimal-profit').className, text: document.querySelector('#minimal-profit').textContent }));
    assert.match(empty.cls, /empty/); assert.equal(empty.text, '노선을 만들면 예상 수지가 나와요'); ok('P1-15 노선이 없으면 숫자 대신 흐린 안내');
    // 첫 정류장 안내(P0-8)
    await page.evaluate(() => PB.App.onNodeClick('B')); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.querySelector('#map-plan-message').textContent), '밀집 주거지에서 시작해요. 이어 갈 정류장을 누르세요.');
    assert.equal(await page.evaluate(() => document.querySelector('#minimal-toast').textContent), '밀집 주거지에서 시작해요. 이어 갈 정류장을 누르세요.');
    await page.evaluate(() => PB.App.onNodeClick('A')); await page.waitForTimeout(200);
    assert.match(await page.evaluate(() => document.querySelector('#map-plan-message').textContent), /^기차역 정류장을 연결했어요\./); ok('P0-8 첫 정류장 = 시작 안내, 두 번째부터 연결');
    // 조사(P0-7): 끝을 늘리는 지도 편집 문구
    const msg = await page.evaluate(() => { const E = PB.UI.routeEdit, s = PB.App.s; s.draft.routes[0].nodes = ['A', 'D']; s.draft.routes[0].stops = [true, true]; PB.App.render();
      const tx = E.begin({ end: 'tail' }); tx.route = PB.RouteEdit.visit(tx.route, tx.mode, 'G'); tx.last = 'G'; E.commit(tx); return document.querySelector('#map-plan-message').textContent; });
    assert.equal(msg, '병원·공공서비스 쪽 끝에 산업·일자리를 이었어요.'); ok('P0-7 ‘산업·일자리를 이었어요’');
    // 노선이 생기면 예상 숫자
    assert.doesNotMatch(await page.evaluate(() => document.querySelector('#minimal-profit').className), /empty/);
    // 머리말 버튼 하나(P0-6)
    const vis = () => page.evaluate(() => [...document.querySelectorAll('#topbar button')].filter(b => b.offsetParent && /지도·텍스트|3D 마을/.test(b.textContent)).map(b => b.id + ':' + b.getAttribute('aria-pressed')));
    assert.deepEqual(await vis(), ['minimal-text-toggle:false']);
    await page.locator('#plan-text-toggle').click(); await page.waitForTimeout(300);
    assert.deepEqual(await vis(), ['minimal-text-toggle:true'], '‘텍스트로 편집’ 뒤에도 하나, 눌린 상태');
    // P2-19: 텍스트 모드 지도 안내는 노선이 있으면 숨김
    assert.equal(await page.evaluate(() => document.querySelector('#stage').dataset.caption), '');
    await page.locator('#minimal-text-toggle').click(); await page.waitForTimeout(300);
    assert.deepEqual(await vis(), ['minimal-text-toggle:false']); ok('P0-6 머리말 ‘지도·텍스트 보기’ 하나 · aria-pressed / P2-19 노선이 있으면 지도 안내 숨김');
    // P0-4 도움말·출발 확인 문구
    await page.locator('#btn-help').click();
    const help = await page.locator('#help').innerText(); assert.doesNotMatch(help, /바꿀 수 없어요/); assert.match(help, /출발한 뒤에는 3단계부터 오전·오후 한 번씩 버스 한 대만 옮길 수 있어요\. 노선 모양은 다음 단계에서 고쳐요\./);
    await page.locator('#help form button[type=submit]').click();
    await page.evaluate(() => PB.Minimal.text(true)); await page.locator('#btn-depart').click(); await page.locator('#confirm-depart[open]').waitFor();
    assert.match(await page.locator('#depart-rule').innerText(), /^이번 단계는 출발하면 운행이 끝날 때까지 그대로 달려요\. 3단계부터는 오전·오후 한 번씩 버스 한 대만 옮길 수 있어요/);
    await page.locator('#confirm-yes').click(); await page.waitForTimeout(300);
    // P1-12 1단계 = ‘다음 사건까지’
    assert.equal(await page.locator('#run-next').getAttribute('aria-label'), '다음 사건까지');
    assert.match(await page.locator('#panel .note').filter({ hasText: '이번 단계는 출발하면' }).innerText(), /3단계부터는 오전·오후 한 번씩 버스 한 대만/);
    ok('P0-4 도움말·출발 확인·운행 안내 문구(텍스트 모드) / P1-12 1단계 버튼 이름 ‘다음 사건까지’');
    assert.deepEqual(page.errors, []); await page.close();
  }

  // ── P1-15 운행 중 ‘지금까지’ / P1-13 ‘회’ / P1-16 배차 간격 / P0-5 빈 알림 / P1-17 결과 카드 ──
  {
    const page = await fresh('no3d=1', { width: 1366, height: 900 });
    await toPlan(page, 2, [{ num: 1, nodes: ['F', 'D', 'A', 'B'], buses: [1] }, { num: 2, nodes: ['B', 'C', 'E'], buses: [2, 3] }]);
    assert.equal(await page.locator('.minimal-headway').count(), 0); ok('P1-16 노선 위 배차 간격 표시 없음(2026-11-01 사용자 지시로 삭제)');
    await page.locator('#route-1').click(); await page.waitForTimeout(100); // 계획 알림을 하나 남겨 둔다(다음 단계 첫 화면에서 빈 알림이 뜨던 조건)
    await page.evaluate(() => { PB.Session.startRun(PB.App.s); PB.App.go('run'); }); await page.waitForTimeout(1200);
    const live1 = await page.evaluate(() => ({ text: document.querySelector('#minimal-profit').innerText, v: Number(document.querySelector('#minimal-profit').dataset.live) }));
    assert.match(live1.text, /지금까지[\s\S]*예상 [+−-]?[\d,]+/);
    await page.waitForFunction(v => { const p = document.querySelector('#minimal-profit'); return p && p.dataset.live != null && Number(p.dataset.live) !== v; }, live1.v, { timeout: 15000 });
    const live2 = await page.evaluate(() => Number(document.querySelector('#minimal-profit').dataset.live));
    const end = await page.evaluate(() => { const s = PB.App.s; return [PB.UI.Econ.live(s, s.config.bus.window).total, s.current.metrics.costs.total]; });
    assert.equal(end[0], end[1], '운행이 끝나는 시각의 ‘지금까지’ = 정산 수지');
    ok(`P1-15 운행 중 ‘지금까지’ ${live1.v} → ${live2}(갱신), 끝 시각 값 = 정산 수지 ${end[1]}`);
    // P1-13 텍스트 모드 지금 운행 상황의 ‘만차로 남겨짐’
    await page.evaluate(() => PB.Minimal.text(true)); await page.locator('#run-skip').click(); await page.locator('#resident-day-results').waitFor({ state: 'attached', timeout: 20000 });
    // P1-17 결과 카드 ＋/−
    const card = page.locator('#resident-day-results .resident-card summary').first();
    assert.equal(await card.getAttribute('aria-expanded'), 'false'); assert.equal(await card.locator('.resident-expand').textContent(), '＋');
    await card.click(); assert.equal(await card.getAttribute('aria-expanded'), 'true'); assert.equal(await card.locator('.resident-expand').textContent(), '−');
    await card.click(); assert.equal(await card.getAttribute('aria-expanded'), 'false'); ok('P1-17 결과 인물 카드 펼치면 −·aria-expanded=true, 접으면 ＋');
    // P0-5: 다음 단계 ‘노선 설계하기’ 직후 빈 알림 없음(미니멀 지도 모드)
    await page.evaluate(() => PB.Minimal.text(false));
    // 2026-11-01: ‘노선 설계하기’ 화면 없이 다음 단계 지도 계획으로 바로(App.enterPlan) — 그 직후에도 빈 알림이 없어야 한다
    await page.evaluate(() => { const S = PB.Session, s = PB.App.s; S.nextPhase(s); PB.App.enterPlan(); });
    const seen = []; for (let i = 0; i < 15; i++) { seen.push(await page.evaluate(() => { const n = document.querySelector('#minimal-toast'); return n.hidden || getComputedStyle(n).display === 'none' ? 'hidden' : JSON.stringify(n.textContent); })); await page.waitForTimeout(100); }
    assert.ok(seen.every(x => x !== '""'), '빈 알림 없음: ' + seen.join(' ')); assert.equal(await page.evaluate(() => PB.App.toast('  ')), false);
    ok('P0-5 다음 단계 지도 계획 진입 직후 빈 알림 없음, 빈 문장은 그리지 않음');
    assert.deepEqual(page.errors, []); await page.close();
  }
  // P1-13 ‘만차로 남겨짐 N회’ — 정원을 1명으로 줄여 만차를 일부러 만든다(표시 문구만 확인)
  {
    const page = await fresh('no3d=1&minimal=0', { width: 1366, height: 900 });
    await toPlan(page, 1, [{ num: 1, nodes: ['B', 'A'], buses: [1] }]);
    await page.evaluate(() => { const s = PB.App.s; s.config.bus.capacity = 1; PB.Session.startRun(s); PB.App.go('run'); });
    // P1-12 1단계 ‘다음 사건까지’ — 사건에서 멈추면 이유가 맨 앞
    assert.equal(await page.locator('#run-next').getAttribute('aria-label'), '다음 사건까지'); assert.equal(await page.locator('#run-next .btn-text').textContent(), '다음 사건까지');
    await page.locator('#run-next').click(); await page.waitForFunction(() => PB.UI.runState().hold, null, { timeout: 20000 });
    const why = await page.locator('#run-status').textContent();
    assert.match(why, /^(대기 10명 이상 · .+ \d+명|만차 · .+호차에 \d+명 못 탐).* \d\d:\d\d 멈춤\. ▶ 재개하면 \d배속, ⏭ 누르면 다음 사건까지 빨리 가요\.$/, why);
    ok('P1-12 멈춘 이유 먼저: ' + why);
    await page.evaluate(() => { PB.UI.stopRun(); PB.App.s.runCursor = 110; PB.App.go('run'); }); await page.waitForTimeout(1500);
    const row = await page.evaluate(() => { const dts = [...document.querySelectorAll('#run-live dt')]; const i = dts.findIndex(d => d.textContent === '만차로 남겨짐'); return document.querySelectorAll('#run-live dd')[i].textContent; });
    assert.match(row, /^(\d+회 · \d+명|없음)$/, row); ok('P1-13 ‘만차로 남겨짐 ' + row + '’');
    await page.close();
  }

  // ── P1-10·11 AI 제안 패널(1440 사이드바, 390 아래 시트) ──
  for (const [w, h, dpr] of [[1440, 900, 1], [390, 844, 2]]) {
    const page = await fresh(w < 500 ? 'no3d=1' : '', { width: w, height: h }, dpr);
    await toPlan(page, 2, [{ num: 1, nodes: ['A', 'B'], buses: [1, 2] }]);
    await page.locator('#plan-ai-toggle').click(); await page.locator('#plan-ai-popover:not([hidden])').waitFor();
    const head = await page.evaluate(() => ({ h: document.querySelector('#plan-ai-h').textContent, close: document.querySelector('#plan-ai-close').getAttribute('aria-label'), desc: [...document.querySelectorAll('.goal-desc')].map(p => p.textContent) }));
    assert.equal(head.h, 'AI 제안'); assert.equal(head.close, 'AI 제안 닫기'); assert.equal(head.desc.length, 3);
    await page.locator('#goal-reach').click(); await page.locator('#rec-card').waitFor({ timeout: 60000 }); await page.waitForTimeout(500);
    const geo = await page.evaluate(() => {
      const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const pop = r('#plan-ai-popover'), st = r('#stage'), acts = ['#rec-preview', '#rec-reject', '#rec-accept'].map(r), cs = getComputedStyle(document.querySelector('#plan-ai-popover'));
      const lines = [...document.querySelectorAll('.net-lines line[stroke-dasharray]')].map(l => l.getBoundingClientRect());
      return { pop, st, acts, pos: cs.position, H: innerHeight, W: innerWidth, crit: document.querySelector('#rec-criterion').textContent, people: document.querySelector('#rec-people')?.className, peopleText: document.querySelector('#rec-people')?.textContent, dashed: lines.length, dashedIn: lines.every(b => b.left >= st.x - 2 && b.right <= st.r + 2 && b.top >= st.y - 2 && b.bottom <= st.b + 2) };
    });
    assert.ok(geo.acts.every(a => a.y >= 0 && a.b <= geo.H && a.x >= 0 && a.r <= geo.W && a.h > 0), '세 버튼이 스크롤 없이 화면 안: ' + JSON.stringify(geo.acts));
    assert.match(geo.crit, /^이 제안의 ‘소외 지역’은 /);
    if (geo.peopleText) { const m = geo.peopleText.match(/(\d+)\/\d+명 → (\d+)\/\d+명/); if (m && Number(m[2]) <= Number(m[1])) assert.match(geo.people, /rec-people-warn/, '인물 기준 그대로·나빠지면 주황'); }
    if (w > 850) {
      const overlapX = Math.min(geo.pop.r, geo.st.r) - Math.max(geo.pop.x, geo.st.x), overlapY = Math.min(geo.pop.b, geo.st.b) - Math.max(geo.pop.y, geo.st.y);
      assert.ok(overlapX <= 0 || overlapY <= 0, 'AI 패널이 지도와 겹치지 않음(지도 밖 사이드바)'); assert.ok(geo.dashed > 0 && geo.dashedIn, '제안 노선(점선)이 지도 안에 다 보임');
    } else { assert.equal(geo.pos, 'fixed'); assert.ok(geo.pop.b >= geo.H - 1 && geo.pop.h <= geo.H * 0.5, '아래 시트 ' + JSON.stringify(geo.pop)); }
    await page.screenshot({ path: `${SHOT}/_shot-playtest-ai-${w}.png` });
    await page.locator('#rec-accept').click(); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ hidden: document.querySelector('#plan-ai-popover').hidden, toast: document.querySelector('#minimal-toast').textContent }));
    assert.equal(after.hidden, true, '적용하면 패널 닫힘'); assert.equal(after.toast, '제안을 적용했어요. 지도에서 바로 고칠 수 있어요.');
    // 닫기(×)
    await page.locator('#plan-ai-toggle').click(); await page.locator('#plan-ai-close').click(); assert.equal(await page.evaluate(() => document.querySelector('#plan-ai-popover').hidden), true);
    ok(`P1-10·11 ${w}px AI 패널 ${w > 850 ? '지도 밖 사이드바·점선 노선 지도 안' : '아래 시트'} · 제목·닫기·기준 3줄 · 버튼 스크롤 없이 · 적용하면 닫히고 알림 · 기준 한 줄`);
    assert.deepEqual(page.errors, []); await page.close();
  }

  // ── P0-9 컷신: 출력이 끝났으면 첫 클릭에 넘어감 / 출력 중이면 첫 클릭은 문장 완성 ──
  {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?no3d=1'); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.locator('#btn-start').click(); await page.locator('#goal-intro[open]').waitFor();
    assert.equal(await page.evaluate(() => PB.CutsceneTyping()), true); await page.locator('#story-next').click();
    assert.equal(await page.locator('#story-count').textContent(), '1 / 4', '출력 중 첫 클릭은 문장 완성'); assert.equal(await page.evaluate(() => PB.CutsceneTyping()), false);
    for (let i = 0; i < 3; i++) { await page.locator('#story-next').click(); await page.waitForFunction(() => !PB.CutsceneTyping(), null, { timeout: 20000 }); }
    assert.equal(await page.locator('#story-count').textContent(), '4 / 4');
    await page.locator('#story-next').click(); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.querySelector('#goal-intro').open), false, '출력이 끝난 마지막 컷은 첫 클릭에 넘어감');
    assert.deepEqual(errors, []); ok('P0-9 컷신 출력 중 첫 클릭 = 문장 완성, 끝났으면 첫 클릭에 다음'); await page.close();
  }
  console.log(`PASS playtest-1101: ${passed.length} checks`);
} finally { await browser.close(); server.close(); }
