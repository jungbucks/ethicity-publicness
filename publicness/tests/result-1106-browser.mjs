// 2026-11-06 결과 화면 개선 지시서(플레이어 피드백) 확인: 자세한 기록 열기·첫 팁·AI라면? 카드·숫자 설명·생각해 보기 데이터 줄·멈춘 이유·칩 이름표.
// 나눠 돌릴 때 RX_PART=details,ai,sources,last,numbers,run,tip (없으면 전부). SHOT_DIR에 스크린샷을 남긴다.
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SHOT = process.env.SHOT_DIR || 'publicness/tests';
const only = process.env.RX_PART, want = k => !only || only.split(',').includes(k), ok = n => console.log('  ok', n);
const ROUTES = { 1: [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G']]], 2: [[3, ['E', 'H', 'B', 'A']]], 3: [[4, ['I', 'A']]] };
async function fresh(viewport, motion = 'reduce') {
  const page = await browser.newPage({ viewport, reducedMotion: motion }); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + '?no3d=1'); await page.evaluate(() => localStorage.clear()); await page.reload(); return page;
}
// 그 단계 계획까지 빠르게 + 결과 화면으로
const toPlan = (page, phase) => page.evaluate(([R, phase]) => {
  const A = PB.App, S = PB.Session; if (!A.s) { A.startGame(); A.s.tutorialSeen = true; } const s = A.s;
  const add = p => (R[p] || []).forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
  while (s.phase < phase) { S.beginPlan(s); add(s.phase); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
  S.beginPlan(s); add(s.phase); A.enterPlan(); document.querySelectorAll('dialog[open]').forEach(d => d.close());
}, [ROUTES, phase]);
const toResult = async (page, phase) => { await toPlan(page, phase); await page.evaluate(() => { const A = PB.App, S = PB.Session; S.startRun(A.s); S.finishRun(A.s); A.go('result'); }); await page.locator('#result-ai').waitFor({ timeout: 8000 }); };
const card = async page => { const t = Date.now(); await page.locator('#result-ai-rows').waitFor({ timeout: 90000 }); return Date.now() - t; };

try {
  if (want('details')) for (const [w, h, motion] of [[1280, 800, 'no-preference'], [1148, 977, 'reduce'], [390, 844, 'reduce']]) {
    const page = await fresh({ width: w, height: h }, motion); await toResult(page, 1); await card(page);
    const sm = page.locator('#result-details > summary');
    assert.equal(await sm.innerText(), '자세한 기록 보기 (점수·지도·재정)');
    assert.equal(await sm.evaluate(n => getComputedStyle(n, '::before').content), '"▸"');
    const tip = await page.locator('#score-tips li').first().textContent().catch(() => null);
    if (tip) assert.equal(await page.locator('#result-first-tip').textContent(), tip, '첫 팁이 요약 아래에도');
    assert.ok(await page.locator('#result-first-tip').evaluate(n => n.closest('#result-headline') && !n.closest('#result-details')), '자세히 밖');
    await sm.scrollIntoViewIfNeeded(); await sm.click(); await page.waitForTimeout(motion === 'reduce' ? 200 : 900);
    assert.equal(await sm.evaluate(n => getComputedStyle(n, '::before').content), '"▾"');
    const r = await page.evaluate(() => { const s = document.querySelector('#result-details > summary').getBoundingClientRect(), f = document.querySelector('#result-map-toggle').getBoundingClientRect(), b = document.querySelector('#result-next-bar').getBoundingClientRect(), top = document.querySelector('#topbar'), tb = top ? top.getBoundingClientRect() : { bottom: 0 }; return { sTop: s.top, fBottom: f.bottom, barTop: b.top, topBottom: tb.bottom, vh: innerHeight, sticky: top ? getComputedStyle(top).position : '' }; });
    assert.ok(r.sTop >= 0 && r.sTop < r.vh * 0.4, '제목이 화면 위쪽 ' + JSON.stringify(r));
    if (r.sticky === 'sticky') assert.ok(r.sTop >= r.topBottom - 1, '위 고정 줄에 안 가림 ' + JSON.stringify(r));
    assert.ok(r.fBottom <= r.barTop, '펼친 내용 첫 줄이 고정 바 위에 ' + JSON.stringify(r));
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(200);
    const end = await page.evaluate(() => { const list = [...document.querySelectorAll('#result-details > *')], last = list[list.length - 1].getBoundingClientRect(), bar = document.querySelector('#result-next-bar').getBoundingClientRect(); return { last: last.bottom, bar: bar.top }; });
    assert.ok(end.last <= end.bar + 1, '마지막 내용이 바에 안 가림 ' + JSON.stringify(end));
    await page.evaluate(() => scrollTo(0, 0)); const y0 = await sm.evaluate(n => n.getBoundingClientRect().top); await sm.scrollIntoViewIfNeeded(); await sm.click(); await page.waitForTimeout(250);
    assert.equal(await page.locator('#result-details').evaluate(d => d.open), false);
    await page.screenshot({ path: `${SHOT}/_shot-r1106-details-${w}.png` });
    assert.deepEqual(page.errors, []); ok(`P0-1 ${w}×${h}: 열면 제목 ${Math.round(r.sTop)}px, 첫 줄 ${Math.round(r.fBottom)} < 바 ${Math.round(r.barTop)} (${y0 ? 'y0' : ''})`); await page.close();
  }

  if (want('ai')) {
    const page = await fresh({ width: 1280, height: 800 }); await toResult(page, 1);
    const before = await page.evaluate(() => { const s = PB.App.s; return JSON.stringify({ phase: s.phase, stage: s.stage, draft: s.draft, trust: s.trust, gh: s.goalHistory }); });
    const ms = await card(page);
    const after = await page.evaluate(() => { const s = PB.App.s; return JSON.stringify({ phase: s.phase, stage: s.stage, draft: s.draft, trust: s.trust, gh: s.goalHistory }); });
    assert.equal(after, before, '계산이 세션을 안 건드림');
    const c = await page.evaluate(() => ({ text: document.querySelector('#result-ai').innerText, order: [...document.querySelector('#panel').children].map(n => n.id).filter(Boolean), saved: PB.App.s.aiCards[1], rows: document.querySelectorAll('#result-ai-rows li').length }));
    console.log(c.text); console.log('  계산 시간', ms, 'ms');
    assert.match(c.text, /이번 계획은 직접 만들었어요/); assert.match(c.text, /AI 추천은 정답이 아니라, 무엇을 중요하게 보느냐에 따라 달라져요/); assert.match(c.text, /기본 수요 기준/);
    assert.doesNotMatch(c.text, /—/, 'em dash 없음');
    const iAi = c.order.indexOf('result-ai'); assert.ok(iAi > c.order.indexOf('result-people') && iAi === c.order.indexOf('result-think') - 1, '주민들의 하루 뒤·생각해 보기 바로 앞 ' + c.order);
    if (!c.saved.same) {
      assert.equal(c.rows, 3); assert.match(c.text, /\[빠른 이동\] AI는 도착 시간을 줄이려고 .+ 추천해요\. \(예상 도착률 .+ → .+\)/); assert.match(c.text, /\[수익\] AI는 수지를 키우려고 .+ 추천해요\. \(예상 수지 .+ → .+\)/);
      await page.locator('.think-option[data-choice=many]').click(); assert.equal(await page.locator('[data-goal=time].ai-picked').count(), 1); assert.ok(await page.locator('[data-goal=time] .ai-picked-tag').isVisible());
      await page.locator('.think-option[data-choice=longest]').click(); assert.equal(await page.locator('[data-goal=reach].ai-picked').count(), 1); assert.equal(await page.locator('[data-goal=time].ai-picked').count(), 0);
      await page.screenshot({ path: `${SHOT}/_shot-r1106-ai-1280.png`, fullPage: true });
    }
    // 새로 열어도 저장본을 그대로(다시 계산하지 않음)
    await page.reload(); await page.locator('#btn-continue').click().catch(() => {}); await page.locator('#result-ai').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('#result-ai-wait').count(), 0, '저장본은 바로 보임'); assert.equal(await page.locator('[data-goal=reach].ai-picked').count(), c.saved.same ? 0 : 1, '고른 답 표시 유지');
    // 다음 단계 계획에서 같은 기준 = 같은 제안
    const saved = await page.evaluate(() => PB.App.s.aiCards[1].rows.map(r => [r.goal, r.sig]));
    await page.locator('#btn-next-phase').click(); await page.waitForFunction(() => document.body.dataset.screen === 'plan' || document.querySelector('#cutscene:not([hidden]),.cutscene'), null, { timeout: 8000 });
    await page.evaluate(() => { const A = PB.App; if (A.s.stage !== 'plan' && A.enterPlan) A.enterPlan(); }); await page.waitForTimeout(600);
    for (const [goal, sig] of saved) {
      const now = await page.evaluate(g => PB.Advisor.recommend(PB.Session.revealed(PB.App.s), g).then(r => r.plan.buses.map(b => b.route ? b.route.nodes.join('-') : '쉬기').sort().join('|')), goal);
      assert.equal(now, sig, goal + ' 다음 단계 제안과 같음');
    }
    assert.deepEqual(page.errors, []); ok('P0-2 카드·위치·세션 불변·저장·다음 단계 제안 일치'); await page.close();
  }

  if (want('sources')) {
    const page = await fresh({ width: 1280, height: 800 }); await toPlan(page, 1); await page.waitForTimeout(500);
    // 진짜 AI 제안 적용(같은 함수) → 출처 줄
    const apply = (goal, edit) => page.evaluate(async ([goal, edit]) => { const A = PB.App, S = PB.Session, s = A.s; S.chooseGoal(s, goal); const rec = await PB.Advisor.recommend(S.revealed(s), goal); S.applyRecommendation(s, rec); const used = s.draft.buses.map(b => b.routeNum); s.draft.routes = s.draft.routes.filter(r => used.indexOf(r.num) >= 0); if (edit) { const b = s.draft.buses.find(x => x.routeNum != null); const others = s.draft.routes.filter(r => r.num !== b.routeNum); if (others.length) b.routeNum = others[0].num; else { const r = s.draft.routes[0]; r.nodes = r.nodes.slice(0, Math.max(2, r.nodes.length - 1)); r.stops = r.nodes.map(() => true); } } S.startRun(s); S.finishRun(s); A.go('result'); }, [goal, edit]);
    await apply('profit', false); await card(page);
    assert.equal(await page.locator('#result-ai-source').innerText(), '이번 계획은 AI ‘수익’ 제안을 적용했어요.');
    await page.close();
    const p2 = await fresh({ width: 1280, height: 800 }); await toPlan(p2, 1); await p2.waitForTimeout(500);
    await p2.evaluate(async () => { const A = PB.App, S = PB.Session, s = A.s; S.chooseGoal(s, 'time'); const rec = await PB.Advisor.recommend(S.revealed(s), 'time'); S.applyRecommendation(s, rec); const r = s.draft.routes.find(x => x.nodes.length > 2 && s.draft.buses.some(b => b.routeNum === x.num)); if (r) { r.nodes = r.nodes.slice(0, -1); r.stops = r.nodes.map(() => true); } S.startRun(s); S.finishRun(s); A.go('result'); });
    await card(p2); console.log('  고친 뒤 출처:', await p2.locator('#result-ai-source').innerText());
    assert.deepEqual(p2.errors, []); ok('P0-2 출처 줄'); await p2.close();
  }

  if (want('last')) {
    const page = await fresh({ width: 1280, height: 800 }); await toResult(page, 5); const ms = await card(page);
    console.log(await page.locator('#result-ai').innerText()); console.log('  5단계 계산', ms, 'ms');
    assert.match(await page.locator('#result-ai-note').innerText(), /이번 단계 기본 수요/);
    assert.deepEqual(page.errors, []); ok('마지막 단계 카드'); await page.close();
  }

  if (want('numbers')) {
    const page = await fresh({ width: 1280, height: 800 });
    for (const phase of [1, 2, 3]) {
      await toResult(page, phase); await page.waitForTimeout(100);
      const r = await page.evaluate(() => { const s = PB.App.s, h = s.history[s.history.length - 1], m = h.scores.mobility; return { N: h.metrics.N, arrived: h.metrics.arrived, sN: m.N, done: m.done, ex: m.excluded, unreal: (m.reasons.parentFailed || 0) + (m.reasons.lateParent || 0), why: document.querySelector('#score-count-why')?.textContent || '', bridge: document.querySelector('#think-bridge')?.textContent, rate: document.querySelector('#result-stat-arrival .stat-value').textContent, score: m.score, zones: m.zones }; });
      console.log(`  ${phase}단계`, JSON.stringify({ N: r.N, arrived: r.arrived, sN: r.sN, done: r.done, ex: r.ex, unreal: r.unreal, rate: r.rate, score: r.score })); console.log('   ', r.why); console.log('   ', r.bridge);
      if (r.N !== r.sN) { assert.ok(r.why, '건수가 다르면 설명'); assert.ok(!r.why.includes('세서 건수가 달라요'), '더하고 뺀 건수로 맞아떨어짐: ' + JSON.stringify(r)); }
      assert.match(r.bridge, /남은 비율이 가장 큰 곳은|모두 도착/);
      await page.evaluate(() => { const A = PB.App; document.querySelectorAll('dialog[open]').forEach(d => d.close()); A.s.stage = 'result'; PB.Session.nextPhase(A.s); });
    }
    assert.deepEqual(page.errors, []); await page.close();
    // 첫 이동을 못 마쳐 돌아오는 이동이 안 생기는 계획(지시서의 141건 ↔ 142건)
    const p2 = await fresh({ width: 1280, height: 800 });
    await p2.evaluate(() => { const A = PB.App, S = PB.Session; A.startGame(); A.s.tutorialSeen = true; const s = A.s; const r = s.draft.routes[0]; r.nodes = ['F', 'C']; r.stops = [true, true]; S.autoPlace(s, r.num); S.beginPlan(s); A.enterPlan(); S.startRun(s); S.finishRun(s); A.go('result'); });
    await p2.locator('#result-ai').waitFor({ timeout: 8000 });
    const r = await p2.evaluate(() => { const s = PB.App.s, h = s.history[0], m = h.scores.mobility; return { N: h.metrics.N, sN: m.N, ex: m.excluded, unreal: (m.reasons.parentFailed || 0) + (m.reasons.lateParent || 0), lead: document.querySelector('#result-lead').textContent, why: document.querySelector('#score-count-why')?.textContent || '', bridge: document.querySelector('#think-bridge')?.textContent }; });
    console.log('  부실 계획', JSON.stringify(r)); assert.ok(r.N !== r.sN, '건수가 다른 계획'); assert.match(r.why, new RegExp('실제로 생긴 이동 ' + r.N + '건을 세고, 점수는 .+ ' + r.sN + '건을 세요'));
    assert.deepEqual(p2.errors, []); ok('P1-3·P1-4'); await p2.close();
  }

  if (want('run')) {
    for (const [w, h] of [[1280, 800], [1148, 977]]) {
      const page = await fresh({ width: w, height: h }); await toPlan(page, 1); await page.waitForTimeout(600);
      const size = () => page.evaluate(() => { const c = document.querySelector('#stage').getBoundingClientRect(); return Math.round(c.width) + 'x' + Math.round(c.height); });
      const plan = await size(); await page.locator('#btn-depart').click(); await page.locator('#confirm-yes').click(); await page.waitForTimeout(500);
      const run = await size(); console.log(`  P2-8 ${w}×${h}: 계획 ${plan} · 운행 ${run}`); assert.equal(run, plan, '지도 틀 같음');
      if (w === 1280) {
        let got = null;
        for (let i = 0; i < 10 && !got; i++) {
          await page.locator('#run-next').click(); await page.waitForFunction(() => { const r = PB.UI.runState(); return !r || r.hold || document.body.dataset.screen !== 'run'; }, null, { timeout: 30000 });
          const r = await page.evaluate(() => ({ status: document.querySelector('#run-status')?.textContent || '', bar: document.querySelector('#run-statusbar-text')?.textContent || '', vis: !!document.querySelector('#run-statusbar')?.getClientRects().length, chip: [...document.querySelectorAll('.person-chip')].map(c => [c.dataset.resident, c.querySelector('.person-chip-count').textContent, c.getAttribute('aria-label')]) }));
          if (/왕복을 마쳐서/.test(r.bar)) got = r;
        }
        assert.ok(got, '왕복 완료 멈춤'); console.log('   ', got.bar); assert.match(got.bar, /^\d\d:\d\d .+[이가] 왕복을 마쳐서 멈췄어요\./); assert.ok(got.vis, '상태 줄이 보임');
        got.chip.forEach(([id, n, label]) => assert.ok(label.includes(`학기 누적 ${n}회`), id + ' ' + n + ' / ' + label));
        ok('P2-5·P2-7 ' + got.chip.map(c => c[0] + ' ' + c[1]).join(' '));
      }
      assert.deepEqual(page.errors, []); await page.close();
    }
  }

  if (want('tip')) {
    const page = await fresh({ width: 1148, height: 977 }); await toPlan(page, 1); await page.waitForTimeout(800);
    // 빨강 노선을 고르고 끝 정류장 근처 빈 정류장에 올린다
    const info = await page.evaluate(() => { const A = PB.App, s = A.s, r = s.draft.routes[0], box = document.querySelector('#stage').getBoundingClientRect(), xy = id => { const p = A.nodeXY(id), q = A.view.project(p.x, p.y); return { x: box.left + q.left, y: box.top + q.top }; }; if (PB.UI.routeEdit.select) PB.UI.routeEdit.select(r.num); return { nodes: r.nodes, spots: Object.fromEntries(s.config.nodes.filter(n => r.nodes.indexOf(n.id) < 0 && (n.fromPhase || 1) <= 1).map(n => [n.id, xy(n.id)])), route: r.num }; });
    await page.locator('.route-tab').first().click().catch(() => {}); await page.waitForTimeout(300);
    const seen = [];
    for (const [id, p] of Object.entries(info.spots)) {
      await page.mouse.move(p.x, p.y); await page.waitForTimeout(350);
      const r = await page.evaluate(() => { const t = document.querySelector('#route-edit-tooltip'); if (!t || t.hidden) return null; const a = t.getBoundingClientRect(), hits = [...document.querySelectorAll('#stage .net-label,#stage .stop-name,#minimal-toast:not([hidden])')].filter(n => { const b = n.getBoundingClientRect(); return b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }).map(n => n.textContent.slice(0, 8)); return { text: t.textContent, hits }; });
      if (r) seen.push([id, r]);
    }
    console.log('  툴팁', JSON.stringify(seen).slice(0, 700)); assert.ok(seen.length >= 1, '툴팁이 떴음');
    seen.forEach(([id, r]) => { const m = r.text.match(/간격 (.+?) → (.+?) ·/); if (m) assert.notEqual(m[1], m[2], '전후가 같으면 값 하나: ' + r.text); });
    await page.screenshot({ path: `${SHOT}/_shot-r1106-tip-1148.png` });
    // 끝 손잡이를 잡고 아직 정류장에 안 닿은 순간 = 노선이 그대로 — 전후가 같은 값(지시서 P2-6)의 실제 원인. 값 하나만 보인다
    const handle = page.locator('.route-end-handle').first(), hb = await handle.boundingBox();
    if (hb) { await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 22, hb.y + 30, { steps: 4 }); await page.waitForTimeout(350);
      const held = await page.locator('#route-edit-tooltip').textContent(); console.log('  잡은 채:', held); await page.keyboard.press('Escape'); await page.mouse.up(); assert.doesNotMatch(held, /간격 .+ → /, '전후 같으면 화살표 없음'); }
    assert.deepEqual(page.errors, []); ok('P2-6 툴팁 겹침 ' + seen.filter(x => x[1].hits.length).length + '/' + seen.length); await page.close();
  }
  console.log('PASS result-1106');
} finally { await browser.close(); server.close(); }
