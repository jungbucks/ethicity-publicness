// 2026-11-18 플레이테스트(pb-3.2.0) P0 — 화면 검사. 엔진·문장 쪽은 tests/playtest-1118.test.mjs
//  P0-1 AI 제안 지도 미리보기: 1단계 빨강 = 외곽 마을→병원→기차역→밀집 주거지→대학교, AI ‘수익’·‘빠른 이동’ 미리보기에서
//       지도에는 AI 계획의 노선만 진하게(내 노선 실선이 남지 않음) · 빠지는 구간 = 회색 점선 + ‘빠짐’ · 더는 서지 않는 정류장 = 경고색 테두리 · ‘내 노선 보기’ = 원래대로
//  P0-2 출발 확인창: 2단계 빌린 버스를 주황 노선에 붙여 예상 수지가 마이너스 → 확인창에 이유 목록(누적 잔액·임차료), 이유가 없으면 확인창 없이 출발
//  P0-3 운행 중 노선 고치기: 고치기 창 한 줄 · 결과 카드 연결 판정 = 고친 노선 · 다음 단계 계획 상태줄 한 번
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/playtest-1118-browser.mjs [p01,p02,p03]  (브라우저는 한 번에 하나) · 스크린샷 = publicness/tests/_shot-pt1118-*.png
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = `http://127.0.0.1:${server.address().port}/publicness/`, SHOT = process.env.SHOT_DIR || 'publicness/tests', shot = (n) => `${SHOT}/_shot-pt1118-${n}.png`;
const only = (process.argv[2] || 'p01,p02,p03').split(','), log = (m) => console.log('  ok ' + m);

async function begin(page) {
  page.setDefaultNavigationTimeout(120000); /* 이 PC는 부하가 크면 첫 화면 load가 30초를 넘는다 */
  await page.goto(base + '?no3d=1', { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#btn-start').click();
  while (await page.locator('#goal-intro').evaluate((d) => d.open)) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') await page.keyboard.press('Enter'); else await page.locator('#btn-goal-start').click(); }
}
const lay = (page, plan) => page.evaluate((PLAN) => {
  const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true; S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  PLAN.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; } });
  A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}, plan);
const frames = (page, n = 3) => page.evaluate((n) => new Promise((ok) => { let k = 0; const f = () => (++k >= n ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/* 지도(네트워크층)에서 두 정류장 사이를 잇는 선 찾기 — 선 양 끝이 두 정류장 화면 위치에서 14px 안(차선 간격 포함) */
const mapState = (page, pairs, ids) => page.evaluate(([pairs, ids]) => {
  const v = PB.App.view, st = document.querySelector('#stage').getBoundingClientRect(), P = (id) => { const n = PB.App.s.config.nodes.find((x) => x.id === id); return v.project(n.x, n.y); };
  const near = (x, y, p) => Math.hypot(x - p.left, y - p.top) < 14;
  const lineOn = (ln, a, b) => { const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1'), x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2'); return (near(x1, y1, a) && near(x2, y2, b)) || (near(x1, y1, b) && near(x2, y2, a)); };
  const out = {};
  pairs.forEach(([a, b]) => {
    const pa = P(a), pb = P(b), solid = [...document.querySelectorAll('#net-layer .net-lines line')].filter((ln) => lineOn(ln, pa, pb));
    out[a + b] = { solid: solid.filter((ln) => !ln.getAttribute('stroke-dasharray')).map((ln) => ln.getAttribute('stroke')), dashed: solid.filter((ln) => ln.getAttribute('stroke-dasharray')).map((ln) => ln.getAttribute('stroke')),
      drop: [...document.querySelectorAll('#net-layer .net-drop line')].filter((ln) => lineOn(ln, pa, pb)).map((ln) => ({ dash: ln.getAttribute('stroke-dasharray'), stroke: getComputedStyle(ln).stroke })) };
  });
  out.labels = [...document.querySelectorAll('#net-layer .net-drop-label')].map((e) => ({ text: e.textContent, seg: e.dataset.seg, visible: e.getBoundingClientRect().width > 0 }));
  out.stops = {}; ids.forEach((id) => { const g = document.querySelector(`#net-layer .net-stop[data-node="${id}"]`); out.stops[id] = g ? { dropped: g.classList.contains('dropped'), stroke: getComputedStyle(g.querySelector('circle')).stroke } : null; });
  out.caption = document.querySelector('#stage').dataset.caption; out.stageW = st.width;
  return out;
}, [pairs, ids]);

/* 지금 AI 제안(적용과 같은 previewRec)과 내 초안의 구간·정류장 — 기대값을 게임 함수로 계산해 지도와 맞춘다 */
const plans = (page) => page.evaluate(() => {
  const s = PB.App.s, rec = PB.UI.planRec(), pv = PB.Session.previewRec(s, rec), key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const segs = (st) => st.draft.routes.filter((r) => r.nodes.length >= 2).flatMap((r) => r.nodes.slice(1).map((n, i) => [r.nodes[i], n]));
  const stops = (st) => [...new Set(st.draft.routes.filter((r) => r.nodes.length >= 2).flatMap((r) => r.nodes.filter((n, i) => r.stops[i])))];
  const ai = segs(pv), aiKeys = ai.map(([a, b]) => key(a, b)), mine = segs(s);
  return { ai, mine, aiKeys, dropped: mine.filter(([a, b]) => aiKeys.indexOf(key(a, b)) < 0).map(([a, b]) => [a, b, key(a, b)]), lostStops: stops(s).filter((id) => stops(pv).indexOf(id) < 0), aiStops: stops(pv),
    text: [...document.querySelectorAll('#rec-routes li')].map((li) => li.textContent) };
});
/* 1단계 · 빨강 = 외곽 마을→병원→기차역→밀집 주거지→대학교. ‘빠른 이동’은 이 계획만으로, ‘수익’은 시드 42에서 이 빨강으로는 외곽 마을을 남기므로 초록(기차역→산업·일자리→구도심 시장)을 더한 계획으로 재현 */
const CASES = [{ goal: 'profit', plan: [[['F', 'D', 'A', 'B', 'C'], 1], [['A', 'G', 'E'], 1]] }, { goal: 'time', plan: [[['F', 'D', 'A', 'B', 'C'], 1]] }];
if (only.includes('p01')) for (const C of CASES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await begin(page); await lay(page, C.plan); await frames(page, 4);
  const ALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G'], MINEP = C.plan.flatMap(([ns]) => ns.slice(1).map((n, i) => [ns[i], n]));
  const before = await mapState(page, MINEP, ALL);
  assert.equal(before.FD.solid.length, 1, '미리보기 전: 외곽 마을—병원 빨간 실선 ' + JSON.stringify(before.FD));
  await page.locator('#plan-ai-toggle').click();
  await page.locator('#goal-' + C.goal).click(); await page.locator('#rec-card').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#stage').classList.contains('previewing')); await frames(page, 4);
  const P = await plans(page), g = C.goal;
  assert.ok(P.text.every((t) => t.indexOf('외곽 마을') < 0) && P.lostStops.includes('F'), g + ': 재현 조건 — AI 상세 목록에 외곽 마을 없음 ' + JSON.stringify(P.text));
  const m = await mapState(page, P.mine.concat(P.ai), ALL);
  for (const [a, b, k] of P.dropped) {
    assert.deepEqual(m[a + b].solid, [], `${g}: 빠지는 구간 ${k}에 실선이 남지 않음 ${JSON.stringify(m[a + b])}`);
    assert.deepEqual(m[a + b].dashed, [], `${g}: 빠지는 구간 ${k}에 노선색 점선도 없음`);
    assert.equal(m[a + b].drop.length, 1, `${g}: 빠지는 구간 ${k} = 회색 점선 ${JSON.stringify(m[a + b])}`); assert.ok(m[a + b].drop[0].dash, g + ': 점선');
    assert.ok(m.labels.some((l) => l.text === '빠짐' && l.seg === k && l.visible), `${g}: ${k} ‘빠짐’ 표시 ${JSON.stringify(m.labels)}`);
  }
  assert.ok(P.dropped.some(([, , k]) => k === 'D-F'), g + ': 외곽 마을—병원은 빠지는 구간');
  assert.equal(m.labels.length, P.dropped.length, g + ': 빠짐 표시 = 빠지는 구간 수');
  for (const [a, b] of P.ai) assert.ok(m[a + b].solid.length >= 1 && m[a + b].dashed.length === 0, `${g}: AI 노선 ${a}—${b}는 실선(새 구간 포함) ${JSON.stringify(m[a + b])}`);
  for (const id of ALL) { if (!m.stops[id]) continue; assert.equal(m.stops[id].dropped, P.lostStops.includes(id), `${g}: ${id} 경고 테두리 = 더는 서지 않는 정류장인가 ${JSON.stringify(m.stops[id])}`); }
  const other = P.aiStops[0]; assert.notEqual(m.stops.F.stroke, m.stops[other].stroke, g + ': 외곽 마을 테두리 색이 서는 정류장과 다름');
  assert.equal(await page.locator('#route-buses').evaluate((e) => getComputedStyle(e).visibility), 'hidden', g + ': 내 노선 버스 수 칩은 미리보기 동안 숨김');
  log(`${g}: 지도 = AI 계획만 실선(${P.ai.length}구간), 빠지는 구간 ${P.dropped.map((d) => d[2]).join('·')} 회색 점선 ‘빠짐’, 경고 테두리 ${P.lostStops.join('·')} (${m.stops.F.stroke})`);
  if (g === 'profit') await page.screenshot({ path: shot('p01-profit-1280') });
  await page.locator('#rec-preview').click(); await frames(page, 4);
  const back = await mapState(page, MINEP, ALL);
  assert.equal(back.FD.solid.length, 1, g + ': 내 노선 보기 = 외곽 마을—병원 실선 다시');
  assert.equal(back.labels.length + document_drop(back), 0, g + ': 내 노선 보기 = 빠짐 표시 없음');
  assert.ok(ALL.every((id) => !back.stops[id] || !back.stops[id].dropped), g + ': 내 노선 보기 = 경고 테두리 없음');
  assert.equal(await page.locator('#route-buses').evaluate((e) => getComputedStyle(e).visibility), 'visible', g + ': 버스 수 칩 다시 보임');
  log(g + ': ‘내 노선 보기’로 돌아오면 원래대로');
  assert.deepEqual(errors, [], '페이지 오류 없음');
  await page.close();
  console.log('P0-1 PASS ' + g);
}
function document_drop(st) { return Object.keys(st).filter((k) => st[k] && st[k].drop).reduce((n, k) => n + st[k].drop.length, 0); }

/* P0-2 출발 확인창 — 2단계(무난한 노선 tests/playtest-1111-plan.cjs) + 빌린 버스 한 대를 주황 노선에. 1단계는 페이지 안에서 엔진으로 정산만(재생 생략) */
const { PLAN: PLAN1111 } = require('./playtest-1111-plan.cjs');
const toPhase2 = (page, lease, poor) => page.evaluate(([P, lease, poor]) => {
  const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true;
  const lay = (plan) => { S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); plan.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null && !x.leased)[0]; if (b) b.routeNum = i + 1; } }); };
  if (s.phase === 1) { lay(P[0]); S.startRun(s); S.finishRun(s); if (poor) s.history[0].metrics.costs.total = 5000; S.nextPhase(s); }
  lay(P[1]); if (lease) { const b = S.lease(s); b.routeNum = 3; }
  A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  return { phase: s.phase, balance: S.balance(s), profit: Math.round(PB.UI.Econ.plan(s).k.total) };
}, [PLAN1111, lease, poor]);
const confirmState = (page) => page.evaluate(() => ({ open: document.querySelector('#confirm-depart').open, h: document.querySelector('#confirm-depart-h').textContent, lines: [...document.querySelectorAll('#confirm-depart-body li')].map((li) => ({ id: li.id, text: li.textContent })),
  stage: PB.App.s.stage, hud: document.querySelector('#minimal-profit') && document.querySelector('#minimal-profit').dataset.profit, focus: document.activeElement && document.activeElement.id }));
if (only.includes('p02')) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await begin(page);
  const info = await toPhase2(page, true, false); await frames(page, 3);
  assert.equal(info.phase, 2); assert.ok(info.profit < 0, '재현 조건: 빌린 버스를 주황 노선에 붙이면 예상 수지 마이너스 ' + JSON.stringify(info));
  await page.locator('#btn-depart').click();
  let c = await confirmState(page);
  assert.ok(c.open, '이유가 있으니 확인창이 뜸');
  assert.ok(c.lines.length > 0, '확인창 이유 목록이 비어 있지 않음 ' + JSON.stringify(c));
  const W = (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원';
  const def = c.lines.find((l) => l.id === 'depart-deficit'), lease = c.lines.find((l) => l.id === 'depart-lease');
  assert.ok(def && def.text === `이번 단계 예상 수지가 ${W(info.profit)}이에요 · 누적 잔액 ${W(info.balance)} → 약 ${W(info.balance + info.profit)}.`, '예상 수지 줄 ' + JSON.stringify(def));
  assert.equal(Number(c.hud), info.profit, '확인창 숫자 = 지도 위 예상 수지와 같은 값');
  assert.ok(lease && lease.text === '빌린 버스 임차료 25,000원이 이번 단계에 나가요.', '임차료 줄 ' + JSON.stringify(lease));
  assert.equal(c.focus, 'confirm-no', '이유가 있으면 기본 초점은 노선 고치기');
  log('2단계 빌린 버스 → 확인창 이유: ' + c.lines.map((l) => l.text).join(' / '));
  await page.screenshot({ path: shot('p02-depart-1280') });
  await page.locator('#confirm-no').click();
  // 1단계 잔액이 적어 0원 밑으로 내려가는 경우의 문장(1단계 수지를 5,000원으로 바꿔 둔 새 판)
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page2.on('pageerror', (e) => errors.push(e.message));
  await begin(page2); const poor = await toPhase2(page2, true, true); await frames(page2, 3);
  await page2.locator('#btn-depart').click(); c = await confirmState(page2);
  const def2 = c.lines.find((l) => l.id === 'depart-deficit');
  assert.ok(poor.balance + poor.profit < 0, '재현 조건: 잔액 ' + JSON.stringify(poor));
  assert.equal(def2 && def2.text, `이번 단계 예상 수지가 ${W(poor.profit)}이라 누적 잔액이 0원 밑으로 내려가요(약 ${W(poor.balance + poor.profit)}).`, '0원 밑 문장');
  log('잔액이 0원 밑으로: ' + def2.text);
  await page2.close();
  // 빌린 버스를 반납하면 이유가 없다 → 확인창 없이 바로 운행
  await page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s; s.draft.buses.filter((b) => b.leased).forEach((b) => { b.routeNum = null; S.unlease(s, b.id); }); A.render(); });
  await frames(page, 2);
  const none = await page.evaluate(() => PB.UI.Econ.plan(PB.App.s).k.total); assert.ok(none >= 0, '반납하면 흑자 ' + none);
  await page.locator('#btn-depart').click(); await frames(page, 2);
  c = await confirmState(page);
  assert.equal(c.open, false, '이유가 없으면 확인창을 띄우지 않음 ' + JSON.stringify(c));
  assert.equal(c.stage, 'run', '바로 운행 시작');
  log('이유가 없으면 확인창 없이 바로 출발');
  assert.deepEqual(errors, [], '페이지 오류 없음');
  await page.close();
  console.log('P0-2 PASS');
}

/* P0-3 운행 중 노선 고치기 — 3단계(1·2단계는 무난한 노선을 엔진으로 정산만), 초록은 산업·일자리 없이. 11:00 창의 안내 한 줄 → 주황 끝에 산업·일자리 더함 → 결과 준 카드 → 4단계 계획 상태 줄 */
const PLAN3 = [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A'], 1], [['E', 'H', 'A'], 1]];
/* PT1118_SOFT=1 → p03 검사를 실패로 멈추지 않고 적기만(수정 전 HEAD 사본에서 세 증상을 한 번에 보려고) */
const SOFT = process.env.PT1118_SOFT === '1', check = (c, m) => { if (SOFT) console.log((c ? '  ok ' : '  FAIL ') + m); else assert.ok(c, m); };
if (only.includes('p03')) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await begin(page);
  await page.evaluate(([P, P3]) => {
    const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true;
    const lay = (plan) => { S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); plan.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; } }); };
    for (const ph of [0, 1]) { lay(P[ph]); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
    lay(P3); PB.Choices.set(s, 'petition', 'choice', 'reflect'); PB.Choices.set(s, 'petition', 'why', '검사'); A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  }, [PLAN1111, PLAN3]);
  await page.evaluate(() => { localStorage.setItem('ethicity.publicness.speed', '2'); });
  await page.locator('#btn-depart').click();
  await (async () => { if (await page.locator('#confirm-depart').evaluate((d) => d.open)) await page.locator('#confirm-yes').click(); })();
  await page.waitForFunction(() => document.body.dataset.screen === 'run' && PB.UI.runState());
  // 11:00 창까지(⏭) — midday-browser와 같은 방법
  for (let i = 0; i < 14; i++) { const st = await page.evaluate(() => { const r = PB.UI.runState(); return { tf: r.tf, fixAt: r.fixAt, hold: r.hold }; }); if (st.hold && st.tf >= st.fixAt) break; await page.locator('#run-next').click(); await page.waitForFunction(() => PB.UI.runState().hold, null, { timeout: 30000, polling: 20 }); }
  await page.locator('#run-fix').click(); await page.locator('#emergency-dialog').waitFor();
  const scope = await page.evaluate(() => { const e = document.querySelector('#fix-scope'); return e && e.getBoundingClientRect().height > 0 ? e.textContent : null; });
  check(scope === '이번 운행에만 적용돼요. 다음 단계는 출발할 때 계획으로 시작해요.', '고치기 창 한 줄(보임) ' + scope);
  log('고치기 창: ' + scope);
  await page.screenshot({ path: shot('p03-fix-1280') });
  // 주황 끝에 산업·일자리 더하기(엔진 직접 — 창 조작 흐름은 midday-browser가 본다) → 정산 → 결과
  /* 창에서 주황 노선 끝에 산업·일자리 더하기 → 끝까지(재생 생략) → 결과 */
  await page.locator('#fix-kind-add').click(); await page.locator('#fix-route').selectOption('3'); await page.locator('#fix-node').selectOption('G');
  const posOpts = await page.locator('#fix-pos option').evaluateAll((os) => os.map((o) => [o.value, o.textContent])); await page.locator('#fix-pos').selectOption(posOpts[posOpts.length - 1][0]);
  await page.locator('#fix-apply').click();
  const fixed = await page.evaluate(() => PB.App.s.midChanges.map((c) => ({ kind: c.kind, routeNum: c.routeNum, node: c.node, route: c.route.nodes.join('') })));
  assert.deepEqual(fixed, [{ kind: 'add', routeNum: 3, node: 'G', route: 'EHAG' }], '고치기 기록 ' + JSON.stringify(fixed) + ' ' + JSON.stringify(posOpts));
  await page.evaluate(() => { window.__pbFast = true; }); await page.locator('#run-skip').click();
  for (let i = 0; i < 40 && !(await page.evaluate(() => PB.App.s.stage === 'result')); i++) { if (await page.locator('#skip-fix-go').isVisible().catch(() => false)) await page.locator('#skip-fix-go').click(); await page.waitForTimeout(300); }
  await page.locator('li[data-resident="jun"] details.resident-card').waitFor({ state: 'attached', timeout: 30000 });
  const card = await page.evaluate(() => new Promise((ok) => { const d = document.querySelector('li[data-resident="jun"] details.resident-card'); d.open = true; setTimeout(() => { const cap = d.querySelector('.resident-minimap figcaption'), map = d.querySelector('.resident-minimap svg');
    ok({ cap: cap && cap.textContent, aria: map && map.getAttribute('aria-label'), focus: map ? map.querySelectorAll('.mm-focus').length : -1, missing: map ? map.querySelectorAll('.mm-missing').length : -1, reason: d.querySelector('.resident-reason').textContent, legs: [...d.querySelectorAll('.journey-leg')].map((p) => p.textContent) }); }, 300); }));
  check(card.cap && !/잇는 노선 없음/.test(card.cap) && !/잇는 노선 없음/.test(card.aria), '준 카드 작은 지도: 고친 노선으로 이어짐 ' + JSON.stringify(card));
  check(card.focus > 0 && card.missing === 0, '고친 노선 구간을 굵게(끊긴 선 없음) ' + JSON.stringify(card));
  check(!/잇는 노선 없음|노선이 없/.test(card.reason), '이유 한 줄도 노선 있음 ' + card.reason);
  log('준 카드: ' + card.cap + ' · ' + card.reason);
  // 4단계 계획: 상태 줄 한 번 · 고친 정류장은 계획에 없음(지금 동작 유지)
  await page.evaluate(() => { const t = PB.App.toast; window.__toasts = []; PB.App.toast = function (m, o) { const r = t.apply(this, arguments); window.__toasts.push([String(m), r, Date.now()]); return r; }; });
  await page.locator('#btn-next-phase').click();
  for (let i = 0; i < 40 && await page.locator('#goal-intro').evaluate((d) => d.open); i++) { await page.locator('#btn-goal-start').click().catch(() => {}); await page.waitForTimeout(80); }
  await page.waitForFunction(() => document.body.dataset.screen === 'plan' && PB.App.s.phase === 4, null, { timeout: 30000 });
  const p4 = await page.evaluate(() => { const s = PB.App.s;
    return { phase: s.phase, msg: document.querySelector('#plan-message') && document.querySelector('#plan-message').textContent, map: document.querySelector('#map-plan-message') && document.querySelector('#map-plan-message').textContent, orange: (s.draft.routes.find((r) => r.num === 3) || { nodes: [] }).nodes.join('') }; });
  assert.equal(p4.phase, 4);
  check(p4.msg === '지난 운행 중 고친 내용은 계획에 남지 않았어요.', '4단계 계획 상태 줄 ' + JSON.stringify(p4));
  assert.ok(p4.orange.indexOf('G') < 0, '4단계 주황 노선에 산업·일자리 없음 ' + p4.orange);
  const toasts = await page.evaluate(() => window.__toasts.filter((x) => /지난 운행 중 고친 내용/.test(x[0])));
  const toast = await page.waitForFunction(() => { const t = document.querySelector('#minimal-toast'); return t && /지난 운행 중 고친 내용/.test(t.textContent) && t.textContent; }, null, { timeout: 12000 }).then((h) => h.jsonValue()).catch(() => null);
  check(!!toast || toasts.some((x) => x[1]), '간단 화면: 상태 줄 알림(#minimal-toast)으로 보임 ' + JSON.stringify(toasts));
  log('4단계 상태 줄: ' + p4.msg + (toast || toasts.some((x) => x[1]) ? ' (미니멀 알림으로도 보임)' : ' (미니멀 알림은 확인 못 함 ' + JSON.stringify(toasts) + ')'));
  if (process.env.PT1118_DEBUG) { await page.screenshot({ path: shot('p03-plan4-1280') }); console.log(JSON.stringify(await page.evaluate(() => ({ toast: document.querySelector('#minimal-toast')?.textContent, hidden: document.querySelector('#minimal-toast')?.hidden, pm: document.querySelector('#plan-message')?.getBoundingClientRect().height, mpm: document.querySelector('#map-plan-message')?.textContent, mpmH: document.querySelector('#map-plan-message')?.getBoundingClientRect().height, banner: !!document.querySelector('#map-banner'), pending: PB.App._pendingToast })))); }
  // 다른 일을 하면 사라지고, 같은 단계에서 다시 그려도 다시 나오지 않음
  await page.evaluate(() => { PB.UI.planAssignBus(PB.App.s.draft.buses[0].id, null); PB.App.render(); });
  assert.notEqual(await page.locator('#plan-message').textContent(), '지난 운행 중 고친 내용은 계획에 남지 않았어요.', '한 번만');
  assert.deepEqual(errors, [], '페이지 오류 없음');
  await page.close();
  console.log('P0-3 PASS');
}

await browser.close(); server.close();
