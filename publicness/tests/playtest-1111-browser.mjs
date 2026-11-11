// 2026-11-11 교사 플레이테스트 지적 13건 완료 확인 — 기본 모드 · 시드 42 · 1280×800 · ‘무난한 노선’(tests/playtest-1111-plan.cjs)으로 1~5단계 끝까지
//  결과 화면마다: 1번(못 간 이동 0건인 곳을 살펴볼 곳으로 안 짚음 · 같은 질문 한 번) · 2번(추천 노선의 정류장 ⊂ 그 단계에 보이는 정류장 · 화살표 앞 숫자가 기준과 무관하게 같음 · 표시 이름) · 10·11번
//  3·4단계 계획 화면: 답 고르기 전·후 × 1280×800 · 1148×977에서 노선 탭 위쪽 ≥ 지도 캔버스 아래쪽(3번), ‘왜냐하면’ 한 줄·마침표 없음(12번)
//  그 밖에: 4번 유나·다은 칩 · 5번 파랑 · 6번 운행 시작 문장과 11:00 한 번 멈춤 · 7번 노선 탭 간격·출발 확인 요약 · 8번 청원 그 뒤 · 9번 AI 패널 표·닫기 · 13번 엔딩 · 버전 표시
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/playtest-1111-browser.mjs   (브라우저는 한 번에 하나: D:/Works/.browser-test.lock) · 스크린샷 = SHOT_DIR(기본 publicness/tests)/_shot-pt1111-*.png
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const { PLAN } = require('./playtest-1111-plan.cjs');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = `http://127.0.0.1:${server.address().port}/publicness/`, SHOT = process.env.SHOT_DIR || 'publicness/tests', shot = (n) => `${SHOT}/_shot-pt1111-${n}.png`;
const SIZES = [[1280, 800], [1148, 977]], log = (m) => console.log('  ok ' + m), report = { finance: [], sentences: {} };
const batchim = (w) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
async function begin(page) {
  await page.goto(base + '?no3d=1'); await page.evaluate(() => localStorage.clear()); await page.reload();
  assert.equal(await page.locator('#title-version').innerText(), '버전 ' + await page.evaluate(() => PB.config.SCENARIO_VERSION), '첫 화면에 버전');
  assert.ok(await page.locator('#title-version').isVisible(), '간단 화면에서도 버전이 보임');
  if (begin.shot) { await page.screenshot({ path: shot('title') }); begin.shot = false; }
  await page.locator('#btn-start').click();
  while (await page.locator('#goal-intro').evaluate((d) => d.open)) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') await page.keyboard.press('Enter'); else await page.locator('#btn-goal-start').click(); }
}
const lay = (page, plan) => page.evaluate((PLAN) => {
  const A = PB.App, S = PB.Session, s = A.s; s.tutorialSeen = true; S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  PLAN.forEach(([nodes, n], i) => { s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true }); for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; } });
  A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}, plan);
const frame = (page) => page.evaluate(() => {
  const st = document.querySelector('#stage').getBoundingClientRect(), tabs = [...document.querySelectorAll('#plan-toolbar .route-tab')].map((b) => b.getBoundingClientRect()), card = document.querySelector('.fair-card'), cr = card && card.getBoundingClientRect(), req = document.querySelector('#choice-required');
  const depart = document.querySelector('#btn-depart').getBoundingClientRect(), undo = document.querySelector('#btn-undo').getBoundingClientRect();
  return { stageBottom: Math.round(st.bottom), tabTop: Math.round(Math.min(...tabs.map((r) => r.top))), tabBottom: Math.round(Math.max(...tabs.map((r) => r.bottom))), undoTop: Math.round(undo.top), inner: innerHeight, rail: document.body.classList.contains('rail'),
    banners: document.querySelectorAll('#map-strip > *').length, card: cr ? { top: Math.round(cr.top), bottom: Math.round(cr.bottom), h: Math.round(cr.height), scroll: card.scrollHeight > card.clientHeight + 1, right: Math.round(cr.right) } : null,
    reqIn: !!req && !!req.closest('.fair-card'), reqText: req ? req.textContent : null, departTop: Math.round(depart.top), departDisabled: document.querySelector('#btn-depart').disabled, docScroll: document.documentElement.scrollHeight > innerHeight + 1 };
});
function tabsClear(f, label) {
  assert.ok(f.rail, label + ': 넓은 화면 배치'); assert.ok(f.tabTop >= f.stageBottom, `${label}: 노선 탭 위쪽(${f.tabTop}) ≥ 지도 캔버스 아래쪽(${f.stageBottom})`);
  assert.ok(f.undoTop >= f.stageBottom, `${label}: 되돌리기 버튼도 지도 밑에 안 깔림`); assert.ok(f.tabBottom <= f.inner, label + ': 탭이 창 안');
  if (f.card) { assert.ok(f.card.bottom <= f.departTop, `${label}: 카드(${f.card.bottom})가 출발 버튼(${f.departTop}) 위`); assert.ok(f.card.top >= 52, label + ': 카드가 상단 바 아래'); }
}
const waitBannersGone = (page) => page.waitForFunction(() => !document.querySelector('#map-banner') && !document.querySelector('#map-strip .in-strip'), null, { timeout: 12000 }).catch(() => {});
async function resultChecks(page, p) {
  await page.locator('#result-ai-rows').waitFor({ state: 'attached', timeout: 90000 });
  const r = await page.evaluate(() => {
    const s = PB.App.s, h = s.history[s.history.length - 1], T = (q) => { const n = document.querySelector(q); return n ? n.textContent : null; }, z = h.scores.mobility.zones, card = s.aiCards[h.phase];
    const focus = PB.Narrative.thinkFocus(s.config, h.phase, s.current.result.passengers, h.scores.mobility, { unseen: PB.UI.fairness.seenStats(s, h) });
    return { bridge: T('#think-bridge') || '', think: document.querySelector('#result-think').textContent, legend: T('#think-choice legend'), focus: focus.focus.map((id) => ({ id, name: PB.App.nodeName(id), left: z[id].N - z[id].done })),
      zeroNames: Object.keys(z).filter((id) => z[id].N > 0 && z[id].N === z[id].done).map((id) => PB.App.nodeName(id)), visible: S_visible(s), card: { visible: card.visible, applied: card.applied, rows: card.rows.map((x) => ({ goal: x.goal, nodes: x.nodes, base: x.base, num: x.num, change: x.change, targets: x.targets })) },
      rows: [...document.querySelectorAll('#result-ai-rows li')].map((li) => ({ goal: li.dataset.goal, text: li.childNodes[0].textContent + li.childNodes[1].textContent, picked: !li.querySelector('.ai-picked-tag').hidden, applied: !li.querySelector('.ai-applied-tag').hidden, cls: li.className })),
      summary: T('#result-ai-summary'), source: T('#result-ai-source'), note: T('#result-ai-note'), josa: ['#note-kept-josa', '#note-lost-josa', '#note-ai-what-josa'].map(T), noteLines: [...document.querySelectorAll('.note-line')].map((n) => n.textContent),
      profit: Math.round(h.metrics.costs.total), balance: Math.round(PB.Session.balance(s)), arrived: h.metrics.arrived, N: h.metrics.N, fin: h.scores.finance.score, finStatus: h.scores.finance.status, mob: h.scores.mobility.score, elder: h.elder, names: s.config.nodes.map((n) => n.name) };
    function S_visible(s) { return PB.Session.visibleNodeIds(s); }
  });
  // ── 1번 ──
  assert.ok(!r.bridge.includes('살필까요'), `${p}단계: 연결 문장에 질문 없음 — ${r.bridge}`);
  assert.equal(r.think.split('살필까요').length - 1, 1, p + '단계: 같은 질문은 소제목에 한 번');
  const pick = r.bridge.match(/살펴볼 곳은 (.+?)(이에요|예요)\(출발 (\d+)건 중 (\d+)건 목적지까지 못 감\)/);
  if (pick) { assert.ok(Number(pick[4]) > 0, p + '단계: 살펴볼 곳은 못 간 이동이 있는 곳'); pick[1].split('·').length; r.zeroNames.forEach((n) => assert.ok(!('·' + pick[1] + '·').includes('·' + n + '·'), `${p}단계: 못 간 이동 0건인 ${n}을 살펴볼 곳으로 짚지 않음`)); }
  assert.ok(!/살펴볼 곳은[^.]*모두 도착/.test(r.bridge), p + '단계: ‘모두 도착’인 곳을 살펴볼 곳이라 하지 않음');
  r.focus.forEach((f) => assert.ok(f.left > 0, `${p}단계: 살펴볼 곳 ${f.name} 못 간 이동 ${f.left}건`));
  // ── 10번: 괄호 뒤 조사 ──
  for (const m of r.bridge.matchAll(/([가-힣·]+)\([^)]*\)(과|와|이에요|예요)/g)) { const want = batchim(m[1]) ? (m[2] === '과' || m[2] === '이에요') : (m[2] === '와' || m[2] === '예요'); assert.ok(want, `${p}단계: ‘${m[1]}(…)${m[2]}’ 조사`); }
  // ── 2번 ──
  assert.deepEqual(r.card.visible, r.visible, p + '단계: 카드에 남긴 보이는 정류장');
  r.card.rows.forEach((x) => assert.deepEqual(x.nodes.filter((n) => r.visible.indexOf(n) < 0), [], `${p}단계 ${x.goal}: 추천 노선의 정류장이 모두 이 단계에 보이는 정류장`));
  const bases = [...new Set(r.card.rows.map((x) => x.base))]; assert.equal(bases.length, 1, `${p}단계: 화살표 앞 숫자가 기준과 무관하게 같음 ${JSON.stringify(r.card.rows.map((x) => x.num))}`);
  r.rows.forEach((x) => { assert.ok(x.text.includes('(예상 도착률 ' + bases[0] + ' → '), `${p}단계 ${x.goal}: ${x.text}`); });
  const hiddenNames = await page.evaluate(() => PB.App.s.config.nodes.filter((n) => n.fromPhase > PB.App.s.phase).map((n) => n.name));
  [r.summary].concat(r.rows.map((x) => x.text)).forEach((t) => hiddenNames.forEach((n) => assert.ok(!t.includes(n), `${p}단계: 아직 지도에 없는 ${n}을 말하지 않음 — ${t}`)));
  const reach = r.rows.find((x) => x.goal === 'reach'), profit = r.rows.find((x) => x.goal === 'profit');
  if (r.card.rows.find((x) => x.goal === 'reach').targets.length) assert.match(reach.text, / · [가-힣· ]+ 도착률 \d+% → \d+%\)$/, '소외 지역은 대상을 적은 도착률'); assert.match(profit.text, / · 예상 수지 [−\d,]+원 → [−\d,]+원\)$/);
  assert.equal(r.card.applied, null); assert.equal(r.source, '이번 계획은 직접 만들었어요.');
  /* 1단계: 아무것도 고르기 전 = 표시 없음. 2단계부터: 지난 결과에서 고른 목표(이 검사는 늘 ‘오래 기다린 사람부터’ = 지도 위 ‘이번 목표’)에 대응한 줄만 ‘내 목표와 가까운 기준’ */
  assert.ok(r.rows.every((x) => !x.applied), p + '단계: AI 제안을 적용하지 않았으면 ‘내가 고른 기준’ 없음');
  assert.deepEqual(r.rows.filter((x) => x.picked).map((x) => x.goal), p === 1 ? [] : ['reach'], p + '단계: 처음 표시');
  await page.locator('.think-option[data-choice=many]').click();
  let tags = await page.evaluate(() => [...document.querySelectorAll('#result-ai-rows li')].map((li) => [li.dataset.goal, [...li.querySelectorAll('.ai-tag')].filter((t) => !t.hidden).map((t) => t.textContent).join('|')]));
  assert.deepEqual(tags, [['time', '내 목표와 가까운 기준'], ['reach', ''], ['profit', '']], p + '단계: 결과 화면 목표에 대응시킨 표시 이름');
  await page.locator('.think-option[data-choice=longest]').click();
  tags = await page.evaluate(() => [...document.querySelectorAll('#result-ai-rows li')].map((li) => [li.dataset.goal, [...li.querySelectorAll('.ai-tag')].filter((t) => !t.hidden).map((t) => t.textContent).join('|')]));
  assert.deepEqual(tags, [['time', ''], ['reach', '내 목표와 가까운 기준'], ['profit', '']]);
  assert.ok((await page.locator('#result-ai-summary').innerText()).startsWith('[소외 지역 연결] '));
  if (p < 5) assert.match(r.note, /AI는 지금 지도에 있는 정류장만 썼어요\./);
  // ── 11번: 빈칸이 비어 있으면 뒤 조사 없음 ──
  assert.deepEqual(r.josa, ['', '', ''], p + '단계: 빈칸 뒤 조사 없음'); assert.ok(r.noteLines.every((t) => !/을\(를\)|이\(가\)/.test(t)), JSON.stringify(r.noteLines));
  if (p === 1) {
    await page.fill('#note-kept', '외곽 마을'); await page.fill('#note-ai-what', '시장');
    assert.deepEqual(await page.evaluate(() => ['#note-kept-josa', '#note-ai-what-josa'].map((q) => document.querySelector(q).textContent)), ['을', '을']);
    await page.fill('#note-kept', '나래'); assert.equal(await page.locator('#note-kept-josa').innerText(), '를');
    await page.fill('#note-kept', ''); await page.fill('#note-ai-what', ''); assert.deepEqual(await page.evaluate(() => ['#note-kept-josa', '#note-ai-what-josa'].map((q) => document.querySelector(q).textContent)), ['', '']);
    const why = await page.evaluate(() => { const l = document.querySelector('#note-ai-why').closest('.note-line'), lab = l.querySelector('.note-nowrap').getBoundingClientRect(), inp = l.querySelector('input').getBoundingClientRect(); return { oneLine: lab.height < 40, same: Math.abs((lab.top + lab.bottom) / 2 - (inp.top + inp.bottom) / 2) < 14 }; });
    assert.deepEqual(why, { oneLine: true, same: true }, '결과 화면 ‘왜냐하면’ 한 줄, 입력 칸과 같은 줄');
  }
  report.finance.push({ phase: p, profit: r.profit, balance: r.balance, arrived: r.arrived + '/' + r.N, finance: r.fin, financeStatus: r.finStatus, mobility: r.mob, elder: r.elder });
  report.sentences['result' + p] = { bridge: r.bridge, rows: r.rows.map((x) => x.text), summary: r.summary };
  await page.evaluate(() => { document.querySelector('#result-ai-more').open = true; });
  for (const id of ['#result-ai', '#result-think']) { await page.locator(id).scrollIntoViewIfNeeded(); await page.locator(id).screenshot({ path: shot(`result${p}-${id.slice(8)}`) }); }
  await page.evaluate(() => { document.querySelector('#result-ai-more').open = false; });
  log(`${p}단계 결과: 1·2·10·11번 — ${r.bridge}`);
}
const direct = (page) => page.evaluate(() => { const A = PB.App, S = PB.Session, s = A.s; if (!S.startRun(s)) throw new Error('출발 실패 ' + JSON.stringify(S.validate(s))); S.finishRun(s); A.go('result'); });
const nextPlan = (page) => page.evaluate(() => { const A = PB.App, S = PB.Session; S.nextPhase(A.s); A.enterPlan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(30000);
  begin.shot = true; await begin(page);
  for (let p = 1; p <= 5; p++) {
    await lay(page, PLAN[p - 1]);
    if (p === 3 || p === 4) {
      // ── 3번: 답 고르기 전 — 단계에 막 들어온 순간(배너가 떠 있을 수 있음)과 배너가 사라진 뒤, 두 창 크기 ──
      const kind = p === 3 ? 'petition' : 'elder', pickId = p === 3 ? '#petition-reflect' : '#elder-keep';
      await page.locator('#' + kind + '-card').waitFor(); await page.waitForTimeout(500);
      const f0 = await frame(page); tabsClear(f0, `${p}단계 고르기 전(들어온 직후, 알림 ${f0.banners}개) 1280×800`);
      assert.ok(f0.reqIn && /골라야 출발할 수 있어요\.$/.test(f0.reqText) && f0.departDisabled, p + '단계: 안내 줄은 카드 안, 출발 막힘');
      await page.screenshot({ path: shot(`plan${p}-before-entry-1280`) });
      if (p === 4) { /* 단계 배너가 떠 있는 동안의 첫 클릭(배너가 그 클릭에 사라지며 칸이 늘어남)도 버튼에 맞는다 */
        report.entryBanners4 = f0.banners; await page.locator(pickId).click(); assert.equal(await page.locator(pickId).getAttribute('aria-pressed'), 'true', '4단계: 배너가 떠 있을 때 누른 첫 클릭이 빗나가지 않음');
        await page.evaluate(() => { delete PB.App.s.elderPolicy; PB.App.render(); }); assert.equal(await page.locator('#btn-depart').isDisabled(), true);
      }
      await waitBannersGone(page); await page.waitForTimeout(400);
      const before = {};
      for (const [w, h] of SIZES) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1300); before[w] = await frame(page); tabsClear(before[w], `${p}단계 고르기 전 ${w}×${h}`); assert.equal(before[w].card.scroll, false, `${p}단계 ${w}×${h}: 카드가 칸 안에 다 보임(카드 안 스크롤 없음)`); assert.equal(before[w].docScroll, false, `${p}단계 ${w}: 페이지 세로 스크롤 없음`); await page.screenshot({ path: shot(`plan${p}-before-${w}`) }); }
      // ── 12번: ‘왜냐하면’ 한 줄, 마침표 없음 ──
      const why = await page.evaluate((kind) => { const l = document.querySelector('.fair-why'), lab = l.querySelector('.fair-why-label'), r = lab.getBoundingClientRect(), i = document.querySelector('#' + kind + '-why').getBoundingClientRect(), cs = getComputedStyle(lab); return { text: l.textContent, lines: Math.round(r.height / parseFloat(cs.lineHeight)), sameRow: Math.abs((r.top + r.bottom) / 2 - (i.top + i.bottom) / 2) < 12, inputW: Math.round(i.width) }; }, kind);
      assert.equal(why.text, '왜냐하면', p + '단계: 입력 칸 뒤 마침표 없음'); assert.equal(why.lines, 1, p + '단계: ‘왜냐하면’ 한 줄'); assert.ok(why.sameRow && why.inputW > 120, JSON.stringify(why));
      // ── 고른 뒤 ──
      await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(1300);
      await page.locator(pickId).click(); assert.equal(await page.locator(pickId).getAttribute('aria-pressed'), 'true', p + '단계: 답 고름');
      assert.equal(await page.locator('#choice-required').count(), 0); assert.equal(await page.locator('#btn-depart').isDisabled(), false);
      for (const [w, h] of SIZES) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1300); const f = await frame(page); tabsClear(f, `${p}단계 고른 뒤 ${w}×${h}`); assert.equal(f.card.h, before[w].card.h, `${p}단계 ${w}: 고르기 전후 카드 높이 같음`); assert.equal(f.card.bottom, before[w].card.bottom, '카드 아래쪽 제자리'); await page.screenshot({ path: shot(`plan${p}-after-${w}`) }); }
      await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(1300);
      report['card' + p] = { before: before[1280].card, before1148: before[1148].card };
      // AI 패널을 열어도 탭이 밀리지 않고, 카드와 패널이 같은 칸을 나눠 쓴다
      await page.locator('#plan-ai-toggle').click(); await page.locator('#goal-time').click(); await page.locator('#rec-card').waitFor({ timeout: 30000 }); await page.waitForTimeout(300);
      const fa = await frame(page); tabsClear(fa, `${p}단계 AI 패널 열림 1280×800`);
      const ai = await page.evaluate(() => { const pop = document.querySelector('#plan-ai-popover').getBoundingClientRect(), card = document.querySelector('.fair-card').getBoundingClientRect(), h2 = parseFloat(getComputedStyle(document.querySelector('#plan-ai-h')).fontSize), x = document.querySelector('#plan-ai-close'), xt = parseFloat(getComputedStyle(x.querySelector('.btn-text')).fontSize);
        const row = document.querySelector('#rec-people'), cells = row ? [...row.children].map((c) => ({ over: c.scrollWidth > c.clientWidth + 1, h: Math.round(c.getBoundingClientRect().height), text: c.textContent })) : [];
        const spans = row ? [...row.querySelectorAll('td')].map((td) => [...td.childNodes].map((n) => { const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; })) : [];
        return { popBottom: Math.round(pop.bottom), cardTop: Math.round(card.top), overlap: !(pop.bottom <= card.top + 1 || card.bottom <= pop.top + 1), h2, xt, closeText: x.textContent, cells, spans, popH: Math.round(pop.height) }; });
      assert.equal(ai.overlap, false, `${p}단계: AI 패널과 카드가 겹치지 않음 ${JSON.stringify(ai)}`); assert.ok(ai.popH >= 180, 'AI 패널이 쓸 만큼 남음 ' + ai.popH); report['aiPanelH' + p] = ai.popH; assert.equal(fa.card.h, 64, 'AI 패널이 열려 있는 동안 카드는 제목과 한 줄로 접힘');
      await page.screenshot({ path: shot(`plan${p}-ai-1280`) });
      await page.locator('#rec-people').scrollIntoViewIfNeeded(); await page.locator('#plan-ai-popover').screenshot({ path: shot(`plan${p}-ai-table`) });
      report['aiTable' + p] = await page.evaluate(() => [...document.querySelector('#rec-people').children].map((c) => ({ w: c.clientWidth, sw: c.scrollWidth, cs: getComputedStyle(c).wordBreak + '/' + getComputedStyle(c).overflowWrap + '/' + getComputedStyle(c).whiteSpace })));
      // ── 9번 ──
      assert.ok(ai.xt < ai.h2, `9번: ‘닫기’ 글자(${ai.xt}px)가 제목(${ai.h2}px)보다 작음`); assert.equal(ai.closeText, '닫기');
      assert.ok(ai.cells.length === 3 && ai.cells.every((c) => !c.over), '9번: 주요 인물 기준 충족 행이 칸을 넘치지 않음 ' + JSON.stringify(ai.cells));
      ai.spans.forEach((parts) => { for (let i = 1; i < parts.length; i++) assert.ok(parts[i][0] >= parts[i - 1][1] - 2, '9번: 칸 안 글자가 서로 겹치지 않음 ' + JSON.stringify(parts)); });
      await page.setViewportSize({ width: 1148, height: 977 }); await page.waitForTimeout(1300); await page.locator('#rec-people').scrollIntoViewIfNeeded(); await page.locator('#plan-ai-popover').screenshot({ path: shot(`plan${p}-ai-1148`) });
      await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(1300);
      await page.locator('#plan-ai-close').click();
    }
    // ── 7번: 노선 탭의 배차 간격 ──
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#plan-toolbar .route-tab')].map((b) => { const g = b.querySelector('.route-tab-gap'), r = g.getBoundingClientRect(), br = b.getBoundingClientRect(); return { num: Number(b.dataset.num), status: b.querySelector('.route-tab-status').textContent, gap: g.textContent, over: g.classList.contains('is-over'), color: getComputedStyle(g).color, inside: r.left >= br.left - 1 && r.right <= br.right + 1 && r.bottom <= br.bottom + 1 && r.top >= br.top - 1, clip: g.scrollWidth > g.clientWidth + 1, label: b.getAttribute('aria-label') }; }));
    const gaps = await page.evaluate(() => PB.Session.routeGaps(PB.App.s).map((x) => ({ num: x.num, buses: x.buses, text: x.headway == null ? '' : '간격 약 ' + PB.App.duration(x.headway), over: x.over })));
    assert.deepEqual(tabs.map((t) => [t.num, t.gap, t.over]), gaps.map((g) => [g.num, g.text, g.over]), p + '단계: 탭마다 간격'); assert.ok(tabs.every((t) => t.inside && !t.clip && /^버스 \d대$|· 버스 \d대$/.test(t.status)), JSON.stringify(tabs));
    if (p === 3) { const o = tabs.find((t) => t.over); assert.ok(o && o.gap === '간격 약 4시간 30분' && /기준 4시간 3분 넘음/.test(o.label), '3단계 초록 노선 한 대 = 기준 넘음'); assert.notEqual(o.color, tabs.find((t) => !t.over).color, '기준을 넘으면 주의 색'); report.overColor = o.color; }
    // ── 4번: 유나·다은 칩 ──
    if (p >= 4) {
      const chip = await page.evaluate(() => ['yuna', 'daeun'].map((id) => { const b = document.querySelector('#person-chip-' + id), n = b.querySelector('.person-chip-next'), r = b.getBoundingClientRect(), nr = n.getBoundingClientRect(); return { trip: b.querySelector('.person-chip-trip').textContent, next: n.textContent, label: b.getAttribute('aria-label'), inside: nr.left >= r.left - 1 && nr.right <= r.right + 1 && nr.bottom <= r.bottom + 1, count: b.querySelector('.person-chip-count').textContent }; }));
      const want = p === 4 ? { trip: '터미널→운동장', next: '20:00 이후 →주거지', full: '14:00 고속버스터미널→종합운동장 → (20:00 이후) 종합운동장→밀집 주거지, 23:00 전 도착' } : { trip: '주거지→운동장', next: '20:00 이후 →터미널', full: '11:00 밀집 주거지→종합운동장 → (20:00 이후) 종합운동장→고속버스터미널, 23:00 전 도착' };
      chip.forEach((c) => { assert.equal(c.trip, want.trip); assert.equal(c.next, want.next); assert.ok(c.label.includes(want.full) && /학기 누적 \d\/1회/.test(c.label), c.label); assert.ok(c.inside, '다음 이동 줄이 칩 안'); });
      await page.locator('#person-chip-yuna').click(); await page.waitForTimeout(400);
      const toast = await page.evaluate(() => [...document.querySelectorAll('.minimal-toast, #map-toast, [role=status]')].map((n) => n.textContent).filter((t) => t.includes('유나 · ')).join(' / '));
      assert.ok(toast.includes(want.full) && toast.includes('첫 이동') && toast.includes('다음 이동'), '칩을 누르면 전체 일정 안내: ' + toast);
      assert.equal(await page.evaluate(() => document.querySelectorAll('#person-path .pp-ring').length), 3, '출발·운동장·마지막 목적지 고리');
      await page.screenshot({ path: shot(`plan${p}-chips-1280`) }); await page.locator('#person-chip-yuna').click();
      report['chip' + p] = chip[0];
    }
    if (p === 4) { const f = await frame(page); report.card4Scroll = f.card.scroll; }
    if (p === 1 || p === 3 || p === 4) {
      // ── 7번 출발 확인창 + 6번 운행 화면 ──
      if (p >= 3) { await page.locator('#btn-depart').click(); assert.equal(await page.locator('#confirm-depart[open]').count(), 0, '첫 클릭은 이유 안내'); }
      await page.locator('#btn-depart').click(); await page.locator('#confirm-depart[open]').waitFor();
      const lines = await page.evaluate(() => [...document.querySelectorAll('#confirm-depart-body li')].map((l) => [l.id, l.textContent]));
      if (p === 3) { assert.deepEqual(lines, [['depart-over-gap', '배차 간격이 기준(4시간 3분)을 넘는 노선: 초록(버스 1대 · 약 4시간 30분).']], JSON.stringify(lines)); await page.screenshot({ path: shot('depart3-1280') }); }
      else if (p === 1) assert.deepEqual(lines, [['depart-unserved', '노선이 없는 정류장 1곳: 구도심 시장.']], JSON.stringify(lines));
      else assert.deepEqual(lines, [], p + '단계: 문제가 없으면 제목 한 줄만 ' + JSON.stringify(lines));
      assert.equal(await page.locator('#confirm-depart-h').innerText(), '이대로 출발할까요?');
      await page.locator('#confirm-yes').click(); await page.waitForFunction(() => document.body.dataset.screen === 'run' && PB.UI.runState());
      const st0 = await page.evaluate(() => ({ text: document.querySelector('#run-statusbar-text').textContent, panel: document.querySelector('#run-status').textContent, tf: PB.UI.runState().tf, fixAt: PB.UI.runState().fixAt, clock: PB.App.clock(PB.UI.runState().tf) }));
      assert.equal(st0.text, p >= 3 ? '운행 시작 · 11:00부터 노선을 한 번 고칠 수 있어요.' : '운행 시작', `${p}단계 운행을 시작한 직후(${st0.clock}) 상태 줄: ${st0.text}`); assert.ok(!st0.text.includes('이제'), '11:00 전에는 ‘이제’라고 하지 않음');
      if (p >= 3) {
        assert.equal(await page.locator('#run-fix').isDisabled(), true); await page.locator('#speed-2').click();
        await page.waitForFunction(() => { const st = PB.UI.runState(); return st.hold && st.tf === st.fixAt; }, null, { timeout: 40000, polling: 30 });
        const st1 = await page.evaluate(() => ({ text: document.querySelector('#run-statusbar-text').textContent, paused: PB.UI.runState().paused, fixOk: !document.querySelector('#run-fix').disabled, why: document.querySelector('#run-fix-why').textContent }));
        assert.match(st1.text, /^11:00 이제 15:00까지 노선을 한 번 고칠 수 있어요\(‘노선 고치기 · 한 번’\)\. 재개하면 2배속/, st1.text); assert.ok(st1.paused && st1.fixOk, '2배속에서도 11:00에 한 번 멈추고 버튼이 켜짐'); assert.equal(st1.why, '지금 한 번 고칠 수 있어요');
        if (p === 3) await page.screenshot({ path: shot('run3-1100-1280') });
        await page.locator('#run-pause').click(); await page.waitForTimeout(400);
        const st2 = await page.evaluate(() => PB.UI.runState()); assert.ok(!st2.paused && !st2.hold && st2.tf > st2.fixAt && st2.shown === 2, '재개하면 고른 2배속으로, 다시 서지 않음');
        report.sentences['run' + p] = [st0.text, st1.text];
      }
      await page.locator('#run-skip').click(); await page.locator('#result-headline').waitFor({ timeout: 20000 });
    } else await direct(page);
    await resultChecks(page, p);
    if (p === 3) {
      // ── 8번: 청원 그 뒤 — 청원이 말한 이동과 같은 기준 ──
      const f = await page.evaluate(() => { const s = PB.App.s, T = (q) => { const n = document.querySelector(q); return n ? n.textContent : null; }; return { fp: s.fixedPetition, chk: s.history[2].petitionCheck, then: T('#petition-then'), fail: T('#petition-fail'), same: T('#petition-same'), answer: T('#petition-answer'), ev2: s.history[1].petition, name: PB.App.nodeName(s.fixedPetition.zone), clock: PB.App.clock(s.fixedPetition.t) }; });
      assert.equal(f.then, `청원이 말한 이동(${f.clock}까지 ${f.name}에서 출발한 요청 가운데 그때까지 도착하지 못한 이동): 2단계 ${f.fp.total}건 중 ${f.fp.count}건 → 3단계 ${f.chk.total}건 중 ${f.chk.count}건`);
      assert.deepEqual([f.ev2.total, f.ev2.count], [f.fp.total, f.fp.count], '청원 문장의 숫자와 같은 2단계 값'); assert.match(f.fail, /^하루가 끝났을 때 /); assert.equal(f.same, null, '노선을 바꿨으면 ‘바뀌지 않았어요’ 줄 없음');
      await page.locator('#petition-followup').scrollIntoViewIfNeeded(); await page.locator('#petition-followup').screenshot({ path: shot('result3-petition') });
      report.sentences.petition = [f.answer, f.then, f.fail]; log('8번 청원 그 뒤: ' + f.then);
    }
    if (p < 5) await nextPlan(page);
  }
  // ── 13번·4번(단위)·버전: 엔딩 ──
  await page.locator('#btn-next-phase').click();
  for (let i = 0; i < 40 && await page.locator('#goal-intro').evaluate((d) => d.open); i++) { await page.locator('#btn-goal-start').click().catch(() => {}); await page.waitForTimeout(80); }
  await page.locator('#ending-verdict').waitFor();
  const end = await page.evaluate(() => { const T = (q) => document.querySelector(q).textContent, s = PB.App.s, o = PB.Session.scoresOverall(s); return { verdict: T('#ending-verdict'), profit: T('#ending-profit'), seed: T('#end-seed'), cards: [...document.querySelectorAll('.resident-card')].map((c) => c.dataset.id + ': ' + c.querySelector('p:not(.note)').textContent), v: PB.config.SCENARIO_VERSION, balance: PB.App.won(PB.Session.balance(s)), fin: o.finance.score, mob: o.mobility.score, reserve: o.finance.reserve.amount, cause: s.end.cause,
    cut: PB.Narrative.endingReactions(s.config, s.history).map((r) => r.text.split('\n')[1]) }; });
  assert.ok(['도시 노선을 나름 잘 설계했어요. 하지만 이게 최선이었을까요?', '다양한 사람들을 만족시켰어요.'].includes(end.verdict), end.verdict);
  assert.equal(end.profit, `누적 잔액 ${end.balance} · 지원금·운임에서 비용을 뺀 5단계 합계`); assert.ok(!/총 수익|누적 손익/.test(await page.locator('#panel').innerText()));
  assert.ok(end.seed.endsWith('시나리오 ' + end.v) && end.v !== 'pb-3.0.0', end.seed);
  end.cards.concat(end.cut).forEach((t) => assert.ok(!/\d일 중|\d일이에요|\d일 이상/.test(t), '엔딩 단위는 회: ' + t));
  const yuna = end.cut[4]; assert.match(yuna, /^(일정 2회 중 |2회 중 일정 \d회, 그중 )기준\(4시간 3분 이내\)을 지킨 것은 \d회예요\. 만족 기준은 1회 이상이에요\(누적 \d\/1회\)\.$/, yuna);
  await page.locator('#btn-settings').click(); assert.equal(await page.locator('#settings-version').innerText(), '버전 ' + end.v); await page.screenshot({ path: shot('settings') }); await page.keyboard.press('Escape');
  await page.waitForFunction(() => { const n = document.querySelector('#minimal-toast'); return !n || n.hidden; }, null, { timeout: 9000 }); /* 5단계 칩 안내(5초쯤)가 사라진 뒤 */ await page.screenshot({ path: shot('ending'), fullPage: true });
  report.ending = end; log('13번 엔딩: ' + end.verdict + ' / ' + end.profit + ' / ' + yuna);
  assert.deepEqual(errors, [], '페이지 오류 없음');
  await page.close();

  // ── B. 2번: AI 제안을 실제로 적용했을 때만 ‘내가 고른 기준’ ──
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(30000);
    await begin(page); await lay(page, PLAN[0]); await waitBannersGone(page);
    await page.locator('#plan-ai-toggle').click(); await page.locator('#goal-profit').click(); await page.locator('#rec-card').waitFor({ timeout: 30000 }); await page.locator('#rec-accept').click();
    await direct(page); await page.locator('#result-ai-rows').waitFor({ state: 'attached', timeout: 90000 });
    const b = await page.evaluate(() => ({ source: document.querySelector('#result-ai-source').textContent, applied: PB.App.s.aiCards[1].applied, tags: [...document.querySelectorAll('#result-ai-rows li')].map((li) => [li.dataset.goal, [...li.querySelectorAll('.ai-tag')].filter((t) => !t.hidden).map((t) => t.textContent).join('|')]) }));
    assert.equal(b.source, '이번 계획은 AI ‘수익’ 제안을 적용했어요.'); assert.equal(b.applied, 'profit'); assert.deepEqual(b.tags, [['time', ''], ['reach', ''], ['profit', '내가 고른 기준']]);
    await page.locator('.think-option[data-choice=many]').click();
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#result-ai-rows li')].map((li) => [...li.querySelectorAll('.ai-tag')].filter((t) => !t.hidden).map((t) => t.textContent).join('|'))), ['내 목표와 가까운 기준', '', '내가 고른 기준'], '두 표시는 따로');
    await page.evaluate(() => { document.querySelector('#result-ai-more').open = true; }); await page.locator('#result-ai').scrollIntoViewIfNeeded(); await page.locator('#result-ai').screenshot({ path: shot('result1-ai-applied') });
    assert.deepEqual(errors, []); await page.close(); log('2번: 실제 적용 = ‘내가 고른 기준’, 목표 대응 = ‘내 목표와 가까운 기준’');
  }
  // ── C. 8번: ‘반영한다’를 골랐는데 노선이 그대로면 한 줄 ──
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(30000);
    await begin(page); await lay(page, PLAN[0]); await direct(page); await nextPlan(page); await lay(page, PLAN[1]); await direct(page); await nextPlan(page); await lay(page, PLAN[1]);
    await page.evaluate(() => { PB.Choices.set(PB.App.s, 'petition', 'choice', 'reflect'); }); await direct(page);
    assert.equal(await page.locator('#petition-same').innerText(), '노선은 바뀌지 않았어요(2단계와 같은 노선·버스 수로 출발했어요).');
    await page.locator('#petition-followup').scrollIntoViewIfNeeded(); await page.locator('#petition-followup').screenshot({ path: shot('result3-petition-same') });
    // ‘이번엔 못 한다’면 그 줄은 없다
    await page.evaluate(() => { PB.Choices.set(PB.App.s, 'petition', 'choice', 'not-now'); PB.App.render(); });
    assert.equal(await page.locator('#petition-same').count(), 0);
    assert.deepEqual(errors, []); await page.close(); log('8번: 반영한다 + 같은 노선 → ‘노선은 바뀌지 않았어요’');
  }
  console.log('REPORT ' + JSON.stringify(report));
  console.log('PASS playtest-1111: 기본 모드 시드 42 1~5단계 — 1·2·3·4·6·7·8·9·10·11·12·13번 + 버전 표시');
} finally { await browser.close(); server.close(); }
