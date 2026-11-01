// 2026-11-01 단계 전 설명을 결과 화면으로 — 새 흐름 검증(헤드리스 Edge, 2D, 움직임 줄이기).
//  · 기본 5단계 · 랜덤(도전) 8단계(?seed=7): 결과 → 다음 단계 지도 계획 화면까지 클릭 2번 이하, 성찰·「마을이 달라졌어요」·‘계획 시작’ 없음
//  · 1단계: 설명문 없이 지도 위 코치 말풍선이 가리키는 곳만 눌러 첫 노선 만들기(손가락 위치를 실제 마우스로 클릭)
//  · 모든 단계 결과 화면에 그 단계 사례 카드(제목·사례·생각 질문)와 출처 링크(stories.js와 같은 주소), 생각해 보기 두 답 + 글쓰기
//  · 두 답 고르기는 글을 지우지 않고, 다음 단계 지도 HUD에 ‘이번 목표: …’
//  · 인물 HUD 칩(지도·텍스트 모드·운행 중), ‘기준 달성 불가’(칩·결과 카드), 지도 배너, 텍스트 모드 단계 안내
//  · 예전 저장본(성찰 화면에서 멈춤) 불러오기 → 그 단계 지도 계획, 써 둔 답은 결과 화면 글쓰기 칸으로, 고른 카드는 ‘이번 목표’로
//  · 측정: 단계별 클릭 수·단계 전 화면 수·지도 밖 글자 수 → tests/_prestage-measure.json, 스크린샷 tests/_shot-prestage-*.png(1440×900·390×844)
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const stories = require('../js/stories.js');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const SHOT = 'publicness/tests/_shot-prestage-', measure = {}, checks = [];
function ok(m) { checks.push(m); console.log('  ok', m); }
async function fresh(q, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.errors = errors;
  await page.goto(base + '?' + q); await page.evaluate(() => localStorage.clear()); await page.reload(); return page;
}
const screen = page => page.locator('body').getAttribute('data-screen');
// 단계 전 화면의 지도 밖 보이는 글자(0단계 조사와 같은 셈: 공백·문장부호 포함, 컷 대사는 화면 글 한 번만). prose = 버튼·컷 진행 표시·조작 안내 제외
async function textOf(page, sel) {
  return page.evaluate(sel => {
    const root = document.querySelector(sel); if (!root) return { all: 0, prose: 0, lines: [] };
    const out = { all: 0, prose: 0, lines: [] }, len = t => [...t].length;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t;
    while ((t = w.nextNode())) {
      const txt = t.textContent.replace(/\s+/g, ' ').trim(); if (!txt) continue;
      const p = t.parentElement; if (p.closest('script,style,svg,#story-full,.story-sr')) continue;
      let shown = true; for (let a = p; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || (a.tagName === 'DIALOG' && !a.open)) { shown = false; break; } }
      if (!shown) continue; const r = document.createRange(); r.selectNodeContents(t); if (![...r.getClientRects()].some(x => x.width && x.height)) continue;
      const ui = !!p.closest('button,summary') || p.id === 'story-count' || /클릭·터치로 문장 완성/.test(txt);
      out.all += len(txt); if (!ui) { out.prose += len(txt); out.lines.push(txt); }
    }
    return out;
  }, sel);
}
// 컷이 열려 있으면 다음(또는 마지막 버튼)을 누르며 센다. 컷 화면마다 글자 수를 잰다
async function throughCuts(page, rec) {
  for (let i = 0; i < 10 && await page.locator('#goal-intro').evaluate(d => d.open); i++) {
    // Stage 카드(‘N단계’, 2026-11-01 매 단계 다시 뜸)는 1.6초 뒤 저절로 넘어가는 짧은 카드 — 클릭·화면 수에 세지 않는다
    if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') { await page.waitForFunction(() => { const d = document.querySelector('#goal-intro'); return !d.open || d.dataset.stage !== 'true'; }, null, { timeout: 5000 }); continue; }
    await page.waitForTimeout(80); const t = await textOf(page, '#goal-intro');
    rec.screens.push({ name: (await page.locator('#goal-intro-h').textContent()) || 'cut', ...t, phaseHead: await page.locator('#story-phase').evaluate(n => n.hidden ? null : n.textContent) });
    await page.locator('#story-next').click(); rec.clicks++;
  }
}
async function runPhase(page, zero) {
  await page.evaluate(zero => { const S = PB.Session, s = PB.App.s; S.startRun(s); if (zero) s.current.metrics.costs.total = 0; S.finishRun(s); PB.App.go('result'); }, zero);
  await page.locator('#result-think').waitFor();
}
// 코치가 가리키는 정류장(손가락 위치)을 실제 마우스로 누른다
async function tapFinger(page) {
  const p = await page.evaluate(() => { const f = document.querySelector('#coach-finger'), st = document.querySelector('#stage').getBoundingClientRect(); return f && !f.hidden ? { x: st.left + parseFloat(f.style.left), y: st.top + parseFloat(f.style.top) } : null; });
  assert.ok(p, '손가락 표시가 보임'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250);
}

try {
  for (const mode of [{ name: 'default', q: 'no3d=1' }, { name: 'random7', q: 'no3d=1&seed=7' }]) {
    const page = await fresh(mode.q), M = measure[mode.name] = { stages: [] };
    // 타이틀(미니멀 기본) 글자
    M.title = await textOf(page, '#screen-title');
    const s1 = { stage: 1, clicks: 0, screens: [] };
    await page.locator('#btn-start').click(); s1.clicks++;
    await throughCuts(page, s1);
    await page.waitForFunction(() => document.body.dataset.screen === 'plan');
    M.stages.push(s1);
    assert.equal(await page.locator('#btn-begin-plan').count(), 0); assert.equal(await page.locator('#tutorial-dialog:modal').count(), 0);
    assert.equal(s1.screens.length, 4, '인트로 컷 4장 그대로'); assert.ok(s1.clicks <= 5, '타이틀 → 지도 클릭 ' + s1.clicks);
    // 1단계: 배너·코치·HUD
    assert.match(await page.locator('#map-banner').textContent(), /^1단계 · 학기 초 · 버스 2대 · 노선 최대 2개$/);
    await page.locator('#first-coach').waitFor(); assert.equal(await page.locator('#first-coach-text').textContent(), '지도에서 출발할 정류장을 누르세요.');
    const chips = await page.locator('#people-hud .person-chip').allInnerTexts();
    assert.equal(chips.length, 3); chips.forEach(c => assert.match(c.replace(/\s+/g, ' '), /^\S+ \d\d:\d\d \S+→\S+ \d+\/\d+$/, c));
    ok(`${mode.name} 1단계: 타이틀→지도 ${s1.clicks}클릭, 배너·코치·HUD 칩 ${chips.length}개(${chips[1].replace(/\s+/g, ' ')})`);
    // 설명문 없이 코치가 가리키는 곳만 눌러 첫 노선 만들기
    await tapFinger(page); assert.equal(await page.locator('#first-coach-text').textContent(), '이어서 갈 정류장을 누르면 노선이 생겨요.');
    await tapFinger(page); assert.equal(await page.locator('#first-coach-text').textContent(), '첫 노선이 생겼어요. 대기 버스가 바로 달려요.');
    const route = await page.evaluate(() => PB.App.s.draft.routes.filter(r => r.nodes.length >= 2).map(r => r.nodes.join('-') + ':' + PB.App.s.draft.buses.filter(b => b.routeNum === r.num).length));
    assert.equal(route.length, 1, '노선 하나'); assert.match(route[0], /:1$/, '대기 버스 1대가 바로 운행');
    await page.waitForFunction(() => !document.querySelector('#first-coach'), null, { timeout: 6000 });
    assert.equal(await page.evaluate(() => PB.App.s.tutorialSeen), true);
    ok(`${mode.name} 1단계 코치만 보고 첫 노선 ${route[0]} (말풍선 2단계 → 완성 → 3초 뒤 닫힘)`);
    if (mode.name === 'default') { await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(400); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: SHOT + 'plan1-1440.png' }); await page.setViewportSize({ width: 1280, height: 900 }); }
    // 칩 → 경로 강조, 운행 중 HUD·얼굴
    await page.locator('#person-chip-narae').click(); await page.waitForTimeout(200);
    assert.ok(await page.locator('#person-path .pp-line, #person-path .pp-missing').count() >= 1, '경로 강조'); assert.equal(await page.locator('#person-path .pp-ring').count(), 2);
    await page.evaluate(() => { const S = PB.Session, s = PB.App.s; S.startRun(s); PB.App.go('run'); }); await page.waitForTimeout(300);
    assert.ok(await page.locator('#people-hud').isVisible(), '운행 중 HUD'); assert.ok(await page.locator('#map-people').isVisible(), '운행 중 얼굴'); assert.equal(await page.locator('#map-people .map-person').count(), 3);
    await page.evaluate(() => { PB.UI.stopRun && PB.UI.stopRun(); const S = PB.Session, s = PB.App.s; if (s.mode !== 'default') s.current.metrics.costs.total = 0; S.finishRun(s); PB.App.go('result'); });
    await page.locator('#result-think').waitFor();
    ok(`${mode.name} 칩을 누르면 경로 굵게+출발·도착 고리, 운행 중에도 HUD·얼굴 3개`);
    const total = await page.evaluate(() => PB.App.s.config.phases.length);
    for (let p = 1; p <= total; p++) {
      if (p > 1) await runPhase(page, mode.name !== 'default');
      // 결과 화면 기본 순서
      const order = await page.$$eval('#panel > *', ns => ns.map(n => n.id).filter(Boolean));
      assert.deepEqual(order.filter(id => ['result-headline', 'result-people', 'result-events', 'result-think', 'result-details', 'result-next-bar'].includes(id)), ['result-headline', 'result-people', 'result-events', 'result-think', 'result-details', 'result-next-bar']);
      assert.deepEqual(await page.locator('#result-headline .stat-label').allTextContents(), ['도착률', '이번 단계 수지']);
      const nRes = await page.evaluate(() => PB.Demand.residents(PB.App.s.config, PB.App.s.phase).length);
      assert.equal(await page.locator('#result-people .resident-card').count(), nRes);
      for (const r of await page.locator('#result-people .resident-reason').allTextContents()) assert.match(r, /^\S+ · .+/);
      assert.ok(await page.locator('#result-events li').count() >= 1 && await page.locator('#result-events li').count() <= 3);
      // 사례 카드·출처
      const item = stories.learning[p - 1], th = page.locator('#result-think');
      if (item) {
        assert.equal(await th.locator('#learning').getAttribute('data-phase'), String(p));
        assert.equal(await th.locator('#learning-title').textContent(), item.title);
        assert.equal(await th.locator('.learning-case').textContent(), item.text, '사례 문구 그대로');
        assert.match(await th.locator('.learning-question').textContent(), new RegExp(item.question.replace(/[?.()]/g, '\\$&')));
        const hrefs = await th.locator('a.learning-source').evaluateAll(a => a.map(x => x.href + '|' + x.textContent));
        assert.deepEqual(hrefs, [{ label: item.source, url: item.url }].concat(item.extraSources || []).map(x => x.url + '|출처: ' + x.label + ' (새 탭)'), '출처 링크 그대로');
        assert.ok(await th.locator('#learning').isVisible(), '펼치지 않아도 보임');
        if (item.subtitle) assert.equal(await th.locator('.learning-subtitle').textContent(), item.subtitle);
      } else assert.equal(await th.locator('#learning').count(), 0);
      const ethics = stories.phaseEthics[p - 1]; assert.equal(await th.locator('#think-prompt').textContent(), ethics.title + '. ' + ethics.text);
      assert.equal(await th.locator('.think-option').count(), 2); assert.ok(await th.locator('#reflection-answer').isVisible());
      M['case' + p] = item ? { title: item.title, sources: (item.extraSources || []).length + 1, bridge: await th.locator('#think-bridge').textContent() } : { title: null, bridge: await th.locator('#think-bridge').textContent().catch(() => '') };
      // ‘자세히’를 펼쳐도 다음 버튼은 화면 안(아래 고정 바)
      await page.locator('#result-details > summary').click(); await page.waitForTimeout(100);
      const nb = await page.locator('#btn-next-phase').boundingBox(), vh = page.viewportSize().height; assert.ok(nb && nb.y >= 0 && nb.y + nb.height <= vh + 1, '다음 버튼 화면 안 ' + JSON.stringify(nb));
      await page.locator('#result-details > summary').click();
      // 2단계 결과에서: 글을 쓰고 답을 골라도 글은 그대로 → 3단계 HUD ‘이번 목표’
      if (p === 2) {
        await page.locator('#reflection-answer').fill('외곽 마을에서 기다리는 사람도 살피겠다.');
        await page.locator('.think-option[data-choice="longest"]').click(); await page.locator('.think-option[data-choice="many"]').click(); await page.locator('.think-option[data-choice="longest"]').click();
        assert.equal(await page.locator('#reflection-answer').inputValue(), '외곽 마을에서 기다리는 사람도 살피겠다.', '답을 골라도 글 그대로');
        assert.deepEqual(await page.evaluate(() => [PB.App.s.choices[2], PB.App.s.reflections[2]]), ['longest', '외곽 마을에서 기다리는 사람도 살피겠다.']);
        if (mode.name === 'default') assert.equal(await page.locator('#resident-day-results li[data-resident="haneul"] .resident-tally').getAttribute('data-state'), 'impossible', '하늘 2단계 뒤 기준 달성 불가');
        if (mode.name === 'default') {
          for (const [w, h] of [[1440, 900], [390, 844]]) {
            await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
            assert.ok(await page.evaluate(w => document.documentElement.scrollWidth <= w + 1, w), w + ' 결과 가로 넘침 없음'); await page.screenshot({ path: SHOT + 'result2-' + w + '.png' });
            await page.evaluate(() => document.querySelector('#result-think').scrollIntoView()); await page.waitForTimeout(150); await page.screenshot({ path: SHOT + 'result2-' + w + '-think.png' });
          }
          await page.setViewportSize({ width: 1280, height: 900 }); }
        ok(`${mode.name} 2단계 결과: 답 고르기가 글을 지우지 않음${mode.name === 'default' ? ', 하늘 ‘기준 달성 불가’' : ''}`);
      }
      if (p === total) { assert.match(await page.locator('#btn-next-phase').textContent(), /학기 마무리|운영 종료/); ok(`${mode.name} ${p}단계(마지막) 결과도 같은 구조`); break; }
      // 다음 단계로: 클릭 수
      const rec = { stage: p + 1, clicks: 1, screens: [] };
      const cutName = await page.evaluate(() => PB.UI.nextCut(PB.App.s));
      // 다음 컷 그림은 결과 화면에서 미리 받아 둔다(컷이 열릴 때 어두운 화면만 보이지 않게)
      if (cutName) { const img = { sol: 'interlude-sol.webp', baseball: 'interlude-cheer.webp', mall: 'interlude-influencer.webp' }[cutName]; assert.ok(await page.evaluate(n => performance.getEntriesByType('resource').some(e => e.name.endsWith('/assets/art/' + n)), img), '미리 받음 ' + img); }
      await page.locator('#btn-next-phase').click();
      await throughCuts(page, rec);
      await page.waitForFunction(() => document.body.dataset.screen === 'plan');
      M.stages.push(rec);
      // 유나·다은(baseball)은 원래 대사 두 컷 그대로(2026-11-01 사용자: 인물 대사는 줄이지 않음) → 그 단계만 3클릭
      const cutCount = cutName === 'baseball' ? 2 : cutName ? 1 : 0;
      assert.ok(rec.clicks <= 1 + cutCount, `${p + 1}단계 결과→지도 클릭 ${rec.clicks}`); assert.equal(rec.screens.length, cutCount);
      if (cutName) assert.equal(rec.screens[0].phaseHead, (p + 1) + '단계 · ' + await page.evaluate(n => PB.App.s.config.phases[n - 1], p + 1));
      assert.equal(await page.locator('#reflection-next, #new-resources, #btn-begin-plan').count(), 0, '성찰·변화 화면 없음');
      const banner = await page.locator('#map-banner').textContent(); assert.ok(banner.startsWith((p + 1) + '단계 · '), banner); rec.banner = banner;
      rec.hud = (await page.locator('#people-hud').innerText()).replace(/\s+/g, ' ');
      if (p === 2) assert.match(rec.hud, /^이번 목표: 오래 기다린 사람부터 /);
      if (p + 1 === 3 && mode.name === 'default') { assert.equal(await page.locator('#person-chip-haneul .person-chip-flag').textContent(), '기준 달성 불가'); ok('default 3단계 HUD 하늘 칩 ‘기준 달성 불가’'); }
      const newIds = await page.evaluate(n => PB.App.s.config.nodes.filter(x => x.fromPhase === n).map(x => x.id), p + 1);
      for (const id of newIds) assert.equal(await page.locator(`.net-label[data-node="${id}"] .net-new`).textContent(), '새 정류장');
      // 텍스트 모드: HUD 그대로 + 단계 안내
      await page.locator('#minimal-text-toggle').click(); await page.locator('#stage-brief').waitFor();
      assert.ok(await page.locator('#people-hud').isVisible(), '텍스트 모드 HUD'); rec.brief = (await page.locator('#stage-brief').innerText()).length;
      if (cutName) assert.match(await page.locator('#stage-brief').innerText(), /새 인물/);
      await page.locator('#minimal-text-toggle').click();
      if (p + 1 === 2 && mode.name === 'default') { await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(2300); await page.screenshot({ path: SHOT + 'plan2-1440.png' });
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391), '390 계획 가로 넘침 없음'); await page.screenshot({ path: SHOT + 'plan2-390.png' }); await page.setViewportSize({ width: 1280, height: 900 }); }
      ok(`${mode.name} ${p}→${p + 1}단계: 클릭 ${rec.clicks}, 컷 ${rec.screens.length}장, 배너 “${banner}”${newIds.length ? ', 새 정류장 배지 ' + newIds.join('') : ''}`);
    }
    assert.deepEqual(page.errors, []); await page.close();
  }

  // 기본 화면(?minimal=0): 같은 흐름·같은 결과 구조
  { const page = await fresh('no3d=1&minimal=0'); await page.locator('#btn-start').click(); let n = 1; while (await page.locator('#goal-intro').evaluate(d => d.open)) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') { await page.keyboard.press('Enter'); await page.waitForTimeout(100); continue; } await page.locator('#story-next').click(); n++; }
    await page.waitForFunction(() => document.body.dataset.screen === 'plan'); await page.locator('#first-coach').waitFor(); assert.ok(await page.locator('#people-hud').isVisible());
    await runPhase(page, false); assert.ok(await page.locator('#result-think #learning').isVisible()); assert.ok(await page.locator('#btn-next-phase').isVisible());
    await page.locator('#btn-next-phase').click(); await page.waitForFunction(() => document.body.dataset.screen === 'plan'); assert.match(await page.locator('#map-banner').textContent(), /^2단계 · /);
    await page.locator('#plan-text-toggle').click(); await page.locator('#stage-brief').waitFor(); assert.ok(await page.locator('#people-hud').isVisible());
    assert.deepEqual(page.errors, []); ok(`기본 화면(?minimal=0): 타이틀→지도 ${n}클릭, 코치·HUD, 1단계 결과 사례 카드, 결과→2단계 지도 1클릭, 텍스트로 편집에 단계 안내`); await page.close(); }
  // 예전 저장본: 성찰 화면에서 멈춘 상태(자유 서술) / 선택 카드를 고른 상태
  for (const [label, answer] of [['free', '외곽 마을에서 기다리는 사람도 살피겠다.'], ['card', '오래 기다린 사람부터']]) {
    const page = await fresh('no3d=1');
    await page.evaluate(answer => {
      const S = PB.Session, s = S.create(PB.config, { mode: 'default' }); S.beginPlan(s); S.startRun(s); S.finishRun(s); S.nextPhase(s);
      s.transitionStep = 'reflect'; s.reflections = { 2: answer };
      localStorage.setItem('ethicity.publicness.save', JSON.stringify({ version: PB.config.SCENARIO_VERSION, savedAt: Date.now(), session: S.serialize(s) }));
    }, answer);
    await page.reload(); assert.ok(await page.locator('#btn-continue').isVisible()); assert.match(await page.locator('#continue-note').textContent(), /2 \/ 5단계 계획/);
    await page.locator('#btn-continue').click(); await page.waitForFunction(() => document.body.dataset.screen === 'plan');
    assert.deepEqual(await page.evaluate(() => [PB.App.s.phase, PB.App.s.stage, 'transitionStep' in PB.App.s]), [2, 'plan', false]);
    assert.equal(await page.locator('#reflection-answer, #reflection-next, #btn-begin-plan').count(), 0);
    if (label === 'card') { assert.equal(await page.locator('#hud-goal').textContent(), '이번 목표: 오래 기다린 사람부터'); }
    await runPhase(page, false);
    assert.equal(await page.locator('#reflection-answer').inputValue(), label === 'free' ? answer : '', '써 둔 답은 2단계 결과 글쓰기 칸으로');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ethicity.publicness.save')).session);
    assert.equal(saved.stage, 'result'); assert.equal('transitionStep' in saved, false);
    if (label === 'card') assert.deepEqual(saved.choices, { 1: 'longest' });
    assert.deepEqual(page.errors, []); ok(`예전 저장본(${label === 'free' ? '성찰 글' : '선택 카드'}) → 2단계 지도 계획${label === 'free' ? ', 2단계 결과 글쓰기 칸에 그대로' : ', ‘이번 목표: 오래 기다린 사람부터’'}`);
    await page.close();
  }
  // 390×844 1단계 계획 화면(코치) 스크린샷
  { const page = await fresh('no3d=1', { width: 390, height: 844 }); await page.evaluate(() => PB.App.startGame()); await page.locator('#first-coach').waitFor(); await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391)); await page.screenshot({ path: SHOT + 'plan1-390.png' }); assert.deepEqual(page.errors, []); await page.close(); }
  fs.writeFileSync('publicness/tests/_prestage-measure.json', JSON.stringify(measure, null, 1));
  console.log(`PASS prestage-flow: ${checks.length} checks`);
} finally { await browser.close(); server.close(); }
