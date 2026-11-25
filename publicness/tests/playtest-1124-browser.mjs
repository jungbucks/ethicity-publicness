// 2026-11-24 플레이테스트(pb-3.2.0 배포판 → pb-3.2.1) — 화면 검사. 엔진·문장 쪽은 tests/playtest-1124.test.mjs
//  ver 첫 화면 버전 · p11 2단계 결과(청원 없음)·P2-8 ‘N단계로’ 옆 진행 표시 · p14 5단계 출발 확인창 ‘예상으로 기준을 못 지키는 주요 인물’ + 칩 경고
//  p15 1단계 빈 노선 AI 비교 ‘—(노선 없음)’ · p21 목록 연결 ‘추가 위치’ 안내 줄·바로 누르기 · p25 단계가 바뀌어도 정류장 자리 그대로·노선 칩은 자기 선 위·라벨
//  p26 첫 노선 안내 닫힘(AI 창·첫 정류장) · p27 낮 고치기 세 버튼 한 줄(1280·375) · p22 버스가 0대가 된 노선 줄
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/playtest-1124-browser.mjs [ver,p11,…]  (브라우저는 한 번에 하나) · 스크린샷 = publicness/tests/_shot-pt1124-*.png
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = `http://127.0.0.1:${server.address().port}/publicness/`, SHOT = process.env.SHOT_DIR || 'publicness/tests', shot = (n) => `${SHOT}/_shot-pt1124-${n}.png`;
const ALL = ['ver', 'p11', 'p14', 'p15', 'p21', 'p25', 'p26', 'p27', 'p22'], only = process.argv[2] ? process.argv[2].split(',') : ALL;
const fails = [], check = (c, m) => { if (c) console.log('  ok ' + m); else { fails.push(m); console.log('  FAIL ' + m); } };
const { PLAN } = require('./playtest-1111-plan.cjs');
async function open(w, h, q) {
  const page = await browser.newPage({ viewport: { width: w, height: h } }), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(60000);
  await page.goto(base + (q || '?no3d=1'), { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PB && PB.App && PB.Session);
  return { page, errors };
}
const frames = (page, n = 4) => page.evaluate((n) => new Promise((ok) => { let k = 0; const f = () => (++k >= n ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/* 페이지 안: plans[단계-1] = [[정류장, 버스 수], …](없으면 무난한 계획) · lease[단계] = 빌릴 대수 · 마지막 단계는 계획 화면까지 */
const playTo = (page, to, over, lease) => page.evaluate(({ to, over, lease, PLAN }) => {
  const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true;
  const lay = (ph) => { S.beginPlan(s); for (let i = 0; i < ((lease || {})[ph] || 0); i++) S.lease(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
    ((over || {})[ph] || PLAN[ph - 1]).forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; } }); };
  for (;;) {
    lay(s.phase);
    if (s.phase === to) break;
    if (PB.Choices.required(s).includes('petition')) PB.Choices.set(s, 'petition', 'choice', 'reflect');
    if (s.phase === 4) PB.Choices.set(s, 'elder', 'choice', 'keep');
    if (!S.startRun(s)) throw new Error('출발 실패 ' + s.phase); S.finishRun(s); S.nextPhase(s);
  }
  if (PB.Choices.required(s).includes('petition')) PB.Choices.set(s, 'petition', 'choice', 'reflect');
  if (s.phase === 4) PB.Choices.set(s, 'elder', 'choice', 'keep');
  A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  return s.phase;
}, { to, over: over || null, lease: lease || null, PLAN });
const RED = [['F', 'C', 'B', 'A', 'D'], 2], GREEN = [['A', 'G', 'E'], 1], ORANGE = [['B', 'H', 'E'], 1];

try {
  if (only.includes('ver')) {
    const { page } = await open(1280, 800);
    await page.locator('#title-version').waitFor(); await page.waitForFunction(() => document.querySelector('#title-version').textContent.trim().length > 0);
    check((await page.locator('#title-version').innerText()) === '버전 pb-3.2.1', 'ver: 첫 화면 ' + await page.locator('#title-version').innerText());
    await page.close();
  }
  if (only.includes('p11')) {
    const { page, errors } = await open(1280, 800);
    await playTo(page, 2, { 2: [RED, GREEN, ORANGE] }, { 2: 1 });
    const r = await page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s; S.startRun(s); S.finishRun(s); A.go('result'); const b = document.querySelector('#ai-busy-next'); return { petition: s.history[1].petition, busyNow: !!b && b.textContent, nextSib: b && b.previousElementSibling && b.previousElementSibling.id }; });
    check(r.petition === null, 'p11: 2단계 11:45 병원 청원 없음 ' + JSON.stringify(r.petition));
    const txt = await page.locator('#panel').innerText();
    check(!/주민 청원/.test(txt), 'p11: 결과 화면에 청원 줄 없음');
    await frames(page, 2);
    const busy = await page.evaluate(() => { const b = document.querySelector('#ai-busy-next'); return b ? { t: b.textContent, prev: b.previousElementSibling && b.previousElementSibling.id, card: !!document.querySelector('#result-ai-wait') } : { t: null, card: !!document.querySelector('#result-ai-wait') }; });
    check(busy.t === 'AI라면? 계산 중…' && busy.prev === 'btn-next-phase' || !busy.card, 'p11 P2-8: 계산 중이면 ‘N단계로’ 바로 옆 진행 표시 ' + JSON.stringify(busy));
    await page.screenshot({ path: shot('p11-result-busy') });
    await page.waitForFunction(() => !document.querySelector('#result-ai-wait'), null, { timeout: 120000 });
    check(!(await page.locator('#ai-busy-next').count()), 'p11 P2-8: 계산이 끝나면 진행 표시 사라짐');
    check(!errors.length, 'p11: 페이지 오류 없음 ' + errors.join(' | '));
    await page.close();
  }
  if (only.includes('p14')) {
    const { page, errors } = await open(1280, 800);
    const B4 = PLAN[3].map((x, i) => i === 2 ? [['B', 'H', 'E', 'J'], x[1]] : x), B5 = PLAN[4].map((x, i) => i === 2 ? [['B', 'H', 'E', 'J'], x[1]] : x);
    await playTo(page, 5, { 4: B4, 5: B5 }); await frames(page, 6);
    const chips = await page.evaluate(() => ['yuna', 'daeun', 'jun'].map((id) => { const c = document.querySelector('#person-chip-' + id); return c ? { id, done: c.classList.contains('done'), flag: (c.querySelector('.person-chip-flag.forecast') || {}).textContent || null, label: c.getAttribute('aria-label') } : { id }; }));
    check(chips[0].done && chips[0].flag === '예상 실패' && chips[1].flag === '예상 실패', 'p14: 누적 달성 칩에도 경고 ' + JSON.stringify(chips.map((c) => [c.id, c.done, c.flag])));
    check(chips[2].flag === null, 'p14: 기준을 지킬 인물(준)은 경고 없음');
    check(/운동장→터미널 버스편 없음/.test(chips[0].label), 'p14: 칩 설명에 이유 ' + chips[0].label);
    await page.screenshot({ path: shot('p14-chips') });
    await page.evaluate(() => { const t = document.querySelector('#plan-text-toggle'); if (t && !document.querySelector('#btn-depart')) t.click(); });
    await page.locator('#btn-depart').click();
    await page.locator('#confirm-depart[open]').waitFor({ timeout: 10000 }).catch(() => {});
    const dlg = await page.evaluate(() => ({ open: !!document.querySelector('#confirm-depart[open]'), lines: [...document.querySelectorAll('#confirm-depart-body li')].map((l) => l.id + ': ' + l.textContent) }));
    check(dlg.open && dlg.lines.some((l) => l === 'depart-forecast: 예상으로 기준을 못 지키는 주요 인물: 유나, 다은(운동장→터미널 버스편 없음).'), 'p14: 출발 확인창 이유 ' + JSON.stringify(dlg));
    await page.screenshot({ path: shot('p14-depart') });
    check(!errors.length, 'p14: 페이지 오류 없음 ' + errors.join(' | '));
    await page.close();
  }
  if (only.includes('p15')) {
    const { page, errors } = await open(1280, 800);
    await page.evaluate(() => { const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true; S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); });
    await page.locator('#plan-ai-toggle').click(); await frames(page);
    await page.locator('#plan-ai-popover #goal-time').click();
    await page.locator('#rec-row-wait').waitFor({ timeout: 120000 });
    const row = await page.evaluate(() => { const r = document.querySelector('#rec-row-wait'), a = document.querySelector('#rec-row-arrived'); return { mine: r.children[1].textContent, ai: r.children[2].textContent, cls: r.children[2].className, arrived: a.children[1].textContent }; });
    check(row.arrived === '0건' && row.mine === '—(노선 없음)' && !/나빠짐|좋아짐|같음/.test(row.ai) && row.cls === 'na', 'p15: 최장 대기 ' + JSON.stringify(row));
    await page.screenshot({ path: shot('p15-ai') });
    check(!errors.length, 'p15: 페이지 오류 없음 ' + errors.join(' | '));
    await page.close();
  }
  if (only.includes('p21')) {
    const { page, errors } = await open(1280, 800);
    await playTo(page, 1, { 1: [[['F', 'C', 'B'], 1]] });
    await page.evaluate(() => { const t = document.querySelector('#plan-text-toggle'); if (t) t.click(); });
    await page.locator('#route-1').click().catch(() => {}); await frames(page);
    await page.evaluate(() => { const d = document.querySelector('#stop-picker'); if (d && !d.open) d.querySelector('summary').click(); });
    const before = await page.locator('#picker-end').innerText();
    await page.locator('#insert-at').selectOption('0');
    const after = await page.locator('#picker-end').innerText();
    check(/^지금 밀집 주거지 쪽 끝에 붙어요/.test(before) && after === '지금 외곽 마을 다음에 들어가요.', 'p21: 안내 줄 ' + before + ' → ' + after);
    await page.locator('#next-A').click();
    let nodes = await page.evaluate(() => PB.App.s.draft.routes[0].nodes.join(''));
    check(nodes === 'FACB', 'p21: 고른 자리(외곽 마을 다음)에 들어감 ' + nodes);
    // 바꾼 뒤 이벤트가 오기 전에 바로 누른 경우(셀렉트 값만 바뀜) — 정류장 버튼이 셀렉트 값을 다시 읽는다
    await page.evaluate(() => { const sel = document.querySelector('#insert-at'); sel.value = '1'; });
    await page.locator('#next-G').click();
    nodes = await page.evaluate(() => PB.App.s.draft.routes[0].nodes.join(''));
    check(nodes === 'FAGCB', 'p21: change 전에 눌러도 고른 자리(기차역 다음) ' + nodes);
    await page.locator('#insert-at').selectOption('-1'); await page.locator('#next-E').click();
    nodes = await page.evaluate(() => PB.App.s.draft.routes[0].nodes.join(''));
    check(nodes === 'EFAGCB', 'p21: 맨 앞 ' + nodes);
    check(!errors.length, 'p21: 페이지 오류 없음 ' + errors.join(' | '));
    await page.close();
  }
  if (only.includes('p25')) {
    for (const q of ['?no3d=1', '']) {
      const { page, errors } = await open(1280, 800, q), tag = q ? '2D' : '3D';
      await playTo(page, 2); await frames(page, 8); await page.waitForTimeout(900);
      const pos = () => page.evaluate(() => { const o = {}; 'ABCDEFGH'.split('').forEach((id) => { const n = PB.App.nodeXY(id), p = PB.App.view.project(n.x, n.y); o[id] = [Math.round(p.left), Math.round(p.top)]; }); return o; });
      const p2 = await pos();
      await page.evaluate((P) => { const A = PB.App, S = PB.Session, s = A.s; S.startRun(s); S.finishRun(s); S.nextPhase(s); S.beginPlan(s); A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); }, PLAN);
      await frames(page, 8); await page.waitForTimeout(1200);
      const p3 = await pos(), moved = Object.keys(p2).filter((id) => Math.abs(p2[id][0] - p3[id][0]) > 2 || Math.abs(p2[id][1] - p3[id][1]) > 2);
      check(!moved.length, `p25 ${tag}: 3단계(신도시 추가)에도 기존 정류장 자리 그대로 ` + JSON.stringify(moved.map((id) => [id, p2[id], p3[id]])));
      // 노선 칩: 글자(×N) 있음 · 자기 노선 선 위(가까운 거리 ≤ 6px)
      await page.evaluate((P) => { const A = PB.App, S = PB.Session, s = A.s; s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); P[2].forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; } }); A.enterPlan(); }, PLAN);
      await frames(page, 8); await page.waitForTimeout(600);
      const chips = await page.evaluate(() => { const A = PB.App, v = A.view, st = document.querySelector('#stage').getBoundingClientRect();
        return [...document.querySelectorAll('#route-buses .route-bus')].map((b) => { const num = Number(b.dataset.num), r = PB.Session.routeByNum(A.s, num), dot = b.querySelector('.route-num').getBoundingClientRect(), c = { x: dot.left + dot.width / 2 - st.left, y: dot.top + dot.height / 2 - st.top };
          let best = Infinity; for (let i = 1; i < r.nodes.length; i++) { const a = A.nodeXY(r.nodes[i - 1]), bb = A.nodeXY(r.nodes[i]), o = v.laneOffset ? v.laneOffset(r.nodes[i - 1], r.nodes[i], num) : { dx: 0, dy: 0 }, P = v.project(a.x + o.dx / 110, a.y + o.dy / 110), Q = v.project(bb.x + o.dx / 110, bb.y + o.dy / 110);
            const ex = Q.left - P.left, ey = Q.top - P.top, l = ex * ex + ey * ey, t = l ? Math.max(0, Math.min(1, ((c.x - P.left) * ex + (c.y - P.top) * ey) / l)) : 0; best = Math.min(best, Math.hypot(c.x - P.left - t * ex, c.y - P.top - t * ey)); }
          return { num, count: (b.querySelector('.route-count') || {}).textContent || '', dist: Math.round(best * 10) / 10 }; }); });
      check(chips.length === 3 && chips.every((c) => /^×\d$|^버스 없음$/.test(c.count)), `p25 ${tag}: 칩마다 글자 ` + JSON.stringify(chips));
      check(chips.every((c) => c.dist <= 6), `p25 ${tag}: 칩이 자기 노선 선 위 ` + JSON.stringify(chips.map((c) => [c.num, c.dist])));
      // 서지 않는 노선 선이 이름표 위를 지나면 이름표가 위(z-index) — 이름표 가운데 점에서 맨 위 요소가 이름표인지
      // 이름표는 노선 선(서지 않는 노선 포함)보다 위 층 — 이름표 상자 z-index > 노선 svg·인물 경로·놓을 자리 강조, 바탕은 거의 불투명(pointer-events:none이라 elementFromPoint로는 못 잼)
      const z = await page.evaluate(() => { const zi = (q) => { const e = document.querySelector(q); return e ? Number(getComputedStyle(e).zIndex) || 0 : null; }, lab = document.querySelector('.net-label'), bg = lab ? getComputedStyle(lab).backgroundColor : '';
        return { labels: zi('#net-layer .net-labels'), routes: zi('#net-layer .net-route-svg'), status: zi('#net-layer .net-status-svg'), path: zi('#person-path'), drop: zi('#drop-highlight'), bg }; });
      check(z.labels > Math.max(z.routes, z.status, z.path || 0, z.drop || 0) && !/rgba\([^)]*,\s*0?\.[0-8]\d*\)/.test(z.bg), `p25 ${tag}: 정류장 이름표가 노선 선 위 층 ` + JSON.stringify(z));
      await page.screenshot({ path: shot('p25-plan3-' + tag) });
      check(!errors.length, `p25 ${tag}: 페이지 오류 없음 ` + errors.join(' | '));
      await page.close();
    }
  }
  if (only.includes('p26')) {
    for (const how of ['ai', 'stop']) {
      const { page, errors } = await open(1280, 800);
      await page.evaluate(() => { PB.App.startGame(); });
      for (let i = 0; i < 60 && !(await page.locator('#first-coach').count()); i++) { if (await page.locator('#goal-intro').evaluate((d) => d.open)) await page.locator('#btn-goal-start').click().catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150); if ((await page.locator('body').getAttribute('data-screen')) !== 'plan') { const nb = page.locator('#story-next'); if (await nb.count() && await nb.isVisible()) await nb.click().catch(() => {}); } }
      const had = await page.locator('#first-coach').count();
      if (how === 'ai') await page.locator('#plan-ai-toggle').click(); else await page.evaluate(() => PB.App.onNodeClick('F'));
      await page.waitForTimeout(700);
      const gone = !(await page.locator('#first-coach').count()), seen = await page.evaluate(() => PB.App.s.tutorialSeen);
      check(had && gone && seen, `p26 ${how}: 첫 노선 안내가 떠 있다가 닫힘 (떠 있음 ${had}, 닫힘 ${gone}, 본 것으로 ${seen})`);
      check(!errors.length, `p26 ${how}: 페이지 오류 없음 ` + errors.join(' | '));
      await page.close();
    }
  }
  if (only.includes('p27') || only.includes('p22')) {
    for (const [w, h] of [[1280, 800], [375, 740]]) {
      const { page, errors } = await open(w, h);
      await page.evaluate(() => { PB.App.startGame(); const s = PB.App.s; s.tutorialSeen = true; s.phase = 3; s.owned = 4; s.draft.buses = [1, 2, 3, 4].map((id) => ({ id, routeNum: id <= 2 ? 1 : id === 3 ? 2 : null, offset: 0 })); PB.Session.beginPlan(s);
        PB.Session.updateRoute(s, 1, { nodes: ['F', 'C', 'B', 'A'], stops: [true, true, true, true] }); PB.Session.updateRoute(s, 2, { nodes: ['D', 'A', 'G'], stops: [true, true, true] }); PB.Session.startRun(s); PB.App.go('run'); });
      for (let i = 0; i < 20 && await page.locator('dialog:modal').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(50); }
      await page.evaluate(() => { if (!PB.UI.runState().paused) document.querySelector('#run-pause').click(); });
      for (let i = 0; i < 12; i++) { await page.locator('#run-next').click(); await page.waitForFunction(() => PB.UI.runState().hold, null, { timeout: 60000, polling: 20 }); const st = await page.evaluate(() => PB.UI.runState()); if (st.tf >= 40) break; }
      await page.locator('#run-fix').dispatchEvent('click'); await page.locator('#fix-kind-add').waitFor();
      const btns = await page.evaluate(() => [...document.querySelectorAll('.fix-kind')].map((b) => { const r = document.createRange(); r.selectNodeContents(b); const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; return { t: b.textContent, lines, clip: b.scrollWidth > b.clientWidth + 1, fs: getComputedStyle(b).fontSize }; }));
      check(btns.length === 3 && btns.every((b) => b.lines === 1 && !b.clip), `p27 ${w}: 세 버튼 한 줄·안 잘림 ` + JSON.stringify(btns));
      await page.screenshot({ path: shot('p27-fix-' + w) });
      if (w === 1280 && only.includes('p22')) {
        // 빨강(버스 2대)에서 초록(1대)의 버스를 옮겨 초록을 0대로 → 병원·일자리 구간이 ‘버스가 0대가 된 초록 노선 때문에’
        await page.locator('#fix-kind-move').click();
        const done = await page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s, st = S.midStatus(s, PB.UI.runState().tf); const ok = S.midApply(s, { at: st.at, kind: 'move', routeNum: 1, busId: 3 }); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); S.finishRun(s); A.go('result'); return ok; });
        await frames(page, 4);
        const t = await page.evaluate(() => ({ waits: (document.querySelector('#result-waits') || {}).textContent || '', tips: (document.querySelector('#score-tips') || {}).textContent || '' }));
        check(done && /버스가 0대가 된 .+ 때문에 못 탄 요청 \d+건/.test(t.waits), 'p22: 결과 대기 줄 ' + t.waits);
        check(/버스가 0대가 된 .+ 때문에 못 탄 이동이 \d+건이에요/.test(t.tips), 'p22: 점수 팁 ' + t.tips.slice(0, 200));
        await page.screenshot({ path: shot('p22-result'), fullPage: true });
      }
      check(!errors.length, `p27 ${w}: 페이지 오류 없음 ` + errors.join(' | '));
      await page.close();
    }
  }
} finally { await browser.close(); server.close(); }
console.log(fails.length ? `\n실패 ${fails.length}개` : '\n모두 통과'); process.exit(fails.length ? 1 : 0);
