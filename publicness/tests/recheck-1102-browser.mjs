// 2026-11-02 독립 재검증에서 남은 것(헤드리스 Edge, 움직임 줄이기 끔 — 실제 단계 전환 카메라 이동을 그대로 본다)
//  1 P1-2 그날 마지막 멈춤: ⏭ 꺼짐 + 안내문·알림이 ‘⏭ 누르면…’ 대신 ‘남은 멈춤이 없어요. ▶ 재개하거나 ⏩ 끝까지 가요.’
//  3 P1-5 ② 단계 도착: 카메라·지도 틀이 자리 잡기 전에는 이름표를 그리지 않음 — 보이는 이름표 배치는 처음부터 끝까지 한 가지(구석에 몰린 배치 없음)
//  4 P1-5 ④ 단계 배너: 보이는 자리는 한 곳(옮겨 다니지 않음), 정류장·이름표·얼굴·노선 손잡이·인물 칩·예상 수지 상자를 가리지 않음
//  5 P1-5 ③ 알림(#minimal-toast): 정류장·이름표·얼굴·노선 손잡이·배너를 가리지 않음(좁은 화면은 지도 아래 알림 줄), 지도 틀 크기 그대로
//  +  390 AI 제안 아래 시트 = 화면 전체 폭
// (2 이동 요청 단위 ‘건’은 tests/p2-units-1102.test.mjs)
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SHOT = process.env.SHOT_DIR || 'publicness/tests', passed = [];
function ok(name) { passed.push(name); console.log('  ok', name); }
const ROUTES = { 1: [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G', 'E']]], 2: [[3, ['E', 'H', 'B', 'A']]], 3: [[4, ['I', 'A']]] };
async function fresh(q, viewport, dpr = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.errors = errors;
  await page.goto(base + '?' + q); await page.evaluate(() => localStorage.clear()); return page;
}
async function play(page, phase, then = 'plan') {
  await page.evaluate(([R, phase, then]) => {
    const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true;
    const add = p => (R[p] || []).forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
    while (s.phase < phase) { S.beginPlan(s); add(s.phase); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
    S.beginPlan(s); add(s.phase);
    if (then === 'result') { S.startRun(s); S.finishRun(s); A.go('result'); } else if (then === 'run') { S.startRun(s); A.go('run'); } else A.go('plan');
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }, [ROUTES, phase, then]);
  await page.waitForTimeout(700);
}
// 지도 위 표시 사각형(화면 좌표): 정류장 원·이름표·얼굴·노선 손잡이 + (선택) 인물 칩·예상 수지 상자
const COVER = (sel, extra) => {
  const b = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!b) return null;
  const box = e => { const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; }, R = box(b);
  const ov = (a, c) => a.w > 0 && c.w > 0 && a.x < c.x + c.w - 0.5 && c.x < a.x + a.w - 0.5 && a.y < c.y + c.h - 0.5 && c.y < a.y + a.h - 0.5, out = [];
  document.querySelectorAll('#net-layer .net-stop').forEach(g => { if (ov(R, box(g.querySelector('circle:not(.new-ring):not(.tick)')))) out.push('stop:' + g.dataset.node); });
  document.querySelectorAll('#net-layer .net-label').forEach(l => { if (ov(R, box(l))) out.push('label:' + l.dataset.node); });
  document.querySelectorAll('#map-people .map-person').forEach(f => { if (f.offsetParent && ov(R, box(f))) out.push('face:' + f.id); });
  document.querySelectorAll('#route-buses .route-bus').forEach(h => { if (!h.hidden && ov(R, box(h))) out.push('handle:' + h.id); });
  if (extra) { document.querySelectorAll('#people-hud .person-chip').forEach(c => { if (ov(R, box(c))) out.push('chip:' + (c.dataset.resident || c.textContent.slice(0, 3))); }); const p = document.querySelector('#minimal-profit'); if (p && p.offsetParent && ov(R, box(p))) out.push('profit'); const bn = document.querySelector('#map-banner'); if (extra === 'toast' && bn && bn.style.visibility !== 'hidden' && ov(R, box(bn))) out.push('banner'); }
  return { r: [R.x, R.y, R.w, R.h].map(Math.round).join(','), hits: out };
};
// 단계 도착: 결과 → 다음 단계 버튼. 누르기 전에 프레임마다 이름표·배너를 기록한다
async function arriveSampled(page, phase) {
  await play(page, phase - 1, 'result');
  await page.evaluate(() => {
    window.__frames = []; const t0 = performance.now();
    const ov = (a, c) => a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
    (function f() {
      if (document.body.dataset.screen === 'plan') {
        const stage = document.querySelector('#stage'), st = stage.getBoundingClientRect(), shown = !stage.classList.contains('net-settling');
        const labs = shown ? [...document.querySelectorAll('#net-layer .net-label')].map(l => l.getBoundingClientRect()) : [];
        let pairs = 0; for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) if (ov(labs[i], labs[j])) pairs++;
        const b = document.querySelector('#map-banner'), br = b && b.style.visibility !== 'hidden' && b.getBoundingClientRect();
        window.__frames.push({ t: Math.round(performance.now() - t0), n: labs.length, pairs, sig: labs.map(r => Math.round(r.x - st.x) + ',' + Math.round(r.y - st.y)).join(' '), banner: br ? Math.round(br.x + scrollX) + ',' + Math.round(br.y + scrollY) : null, inStrip: !!(b && b.parentNode && b.parentNode.id === 'map-strip') });
      }
      if (performance.now() - t0 < 9000) requestAnimationFrame(f);
    })();
  });
  await page.locator('#btn-next-phase').click();
  for (let i = 0; i < 60; i++) { if (await page.locator('#goal-intro[open]').count()) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') await page.keyboard.press('Enter'); else await page.locator('#btn-goal-start').click(); await page.waitForTimeout(150); continue; } if (await page.evaluate(() => document.body.dataset.screen) === 'plan') break; await page.waitForTimeout(150); }
}
const summary = frames => { const vis = frames.filter(f => f.n), layouts = [...new Set(vis.map(f => f.sig))].filter(s => vis.filter(f => f.sig === s).length > 1), /* 첫 한 프레임(약 0.03초)만 다른 배치는 세지 않는다 — 2D 화면에서 도착 순간 한 번(2026-11-06 보고함) */ banners = [...new Set(frames.filter(f => f.banner).map(f => f.banner))].filter(b => frames.filter(f => f.banner === b).length > 1); return { layouts: layouts.length, maxPairs: Math.max(0, ...vis.map(f => f.pairs)), first: vis.length ? vis[0].t : null, banners, inStrip: frames.some(f => f.inStrip) }; };

try {
  // ── 3·4·5: 2·3단계 도착(2D·3D × 1148 DPR1.5 · 1280 · 1440 · 390 DPR3) ──
  const CASES = [['', 1280, 800, 1, [2, 3]], ['no3d=1', 1280, 800, 1, [2, 3]], ['', 1148, 977, 1.5, [2]], ['no3d=1', 1148, 977, 1.5, [2]], ['', 1440, 900, 1, [2]], ['', 390, 844, 3, [2, 3]], ['no3d=1', 390, 844, 3, [2, 3]]];
  for (const [q, w, h, dpr, phases] of CASES) for (const phase of phases) {
    const tag = `${q ? '2D' : '3D'} ${w}×${h} ${phase}단계`, file = `${q ? '2d' : '3d'}-${w}-p${phase}`;
    const page = await fresh(q, { width: w, height: h }, dpr);
    await arriveSampled(page, phase);
    // 배너가 처음 보일 때(가린 것 기록 + 스크린샷)
    await page.waitForFunction(() => { const b = document.querySelector('#map-banner'); return b && b.style.visibility !== 'hidden'; }, null, { timeout: 30000 });
    const bannerCover = await page.evaluate(([s]) => (0, eval)('(' + s + ')')('#map-banner', 'banner'), [COVER.toString()]);
    const stage0 = await page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); });
    if (phase === 2) await page.screenshot({ path: `${SHOT}/_shot-recheck-arrive-${file}-banner.png` });
    // 알림이 뜨는 동안 가린 것(10초, 0.15초마다)
    const toastHits = new Set(), toasts = new Set(), bannerLater = new Set(); let toastShot = false;
    for (let i = 0; i < 66; i++) {
      const c = await page.evaluate(([s]) => { const n = document.querySelector('#minimal-toast'); if (!n || n.hidden || !n.textContent) return null; const r = (0, eval)('(' + s + ')')(n, 'toast'); r.text = n.textContent; r.where = n.classList.contains('in-strip') ? 'strip' : n.classList.contains('is-outside') ? 'beside' : 'map'; return r; }, [COVER.toString()]);
      if (c) { toasts.add(c.where + ':' + c.text.slice(0, 18)); c.hits.forEach(x => toastHits.add(x + ' ← ' + c.text.slice(0, 14))); if (!toastShot && phase === 2 && /예상 수지가 달라졌어요/.test(c.text)) { toastShot = true; await page.screenshot({ path: `${SHOT}/_shot-recheck-arrive-${file}-toast.png` }); } }
      const bc = await page.evaluate(([s]) => { const b = document.querySelector('#map-banner'); return b && b.style.visibility !== 'hidden' ? (0, eval)('(' + s + ')')(b, 'banner') : null; }, [COVER.toString()]); if (bc) bc.hits.forEach(x => bannerLater.add(x));
      await page.waitForTimeout(150);
    }
    const stage1 = await page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); });
    const sm = summary(await page.evaluate(() => window.__frames));
    assert.equal(sm.layouts, 1, `${tag}: 보이는 이름표 배치는 한 가지(${sm.layouts}가지)`);
    assert.ok(sm.maxPairs <= 1, `${tag}: 겹친 이름표 쌍 ${sm.maxPairs}`);
    assert.equal(sm.banners.length, 1, `${tag}: 배너 자리 한 곳 — ${sm.banners.join(' → ')}`);
    assert.deepEqual(bannerCover.hits, [], `${tag}: 배너 ${bannerCover.r}가 가림 ${bannerCover.hits.join(',')}`);
    assert.deepEqual([...bannerLater], [], `${tag}: 배너가 떠 있는 동안 나중에 가리게 된 것 ${[...bannerLater].join(',')}`);
    assert.deepEqual([...toastHits], [], `${tag}: 알림이 가림 ${[...toastHits].join(' | ')}`);
    assert.equal(stage1, stage0, `${tag}: 알림이 떠도 지도 틀 그대로`);
    assert.deepEqual(page.errors, []);
    ok(`3·4·5 ${tag}: 이름표 배치 1가지(처음 보인 때 ${sm.first}ms, 겹침 ${sm.maxPairs}쌍) · 배너 ${sm.banners[0]}${sm.inStrip ? '(알림 줄)' : ''} 한 곳·아무것도 안 가림 · 알림 ${[...toasts].join(' / ') || '없음'} 안 가림 · 지도 틀 ${stage0}`);
    await page.close();
  }

  // ── 5 운행 중 알림: 2D 1280 3단계 긴급 조정 안내 · 3D 390 2단계 운행 ──
  for (const [q, w, h, dpr, phase] of [['no3d=1', 1280, 800, 1, 3], ['', 390, 844, 3, 2]]) {
    const tag = `${q ? '2D' : '3D'} ${w}×${h} ${phase}단계 운행`;
    const page = await fresh(q, { width: w, height: h }, dpr);
    await play(page, phase, 'run'); await page.waitForTimeout(800);
    const hits = new Set(), seen = new Set();
    for (let k = 0; k < 3 && await page.evaluate(() => document.body.dataset.screen) === 'run'; k++) {
      if (await page.locator('#emergency-dialog[open]').count()) { await page.locator('#emergency-continue').click(); await page.waitForTimeout(300); }
      if (await page.locator('#run-next').isDisabled()) break;
      await page.locator('#run-next').click();
      await page.waitForFunction(() => { const r = PB.UI.runState(); return !r || r.hold || document.querySelector('#emergency-dialog[open]'); }, null, { timeout: 60000 }).catch(() => {});
      for (let i = 0; i < 8; i++) {
        const c = await page.evaluate(([s]) => { const n = document.querySelector('#minimal-toast'); if (!n || n.hidden || !n.textContent) return null; const r = (0, eval)('(' + s + ')')(n, 'toast'); r.text = n.textContent; r.where = n.classList.contains('in-strip') ? 'strip' : n.classList.contains('is-outside') ? 'beside' : 'map'; return r; }, [COVER.toString()]);
        if (c) { seen.add(c.where + ':' + c.text.slice(0, 16)); c.hits.forEach(x => hits.add(x + ' ← ' + c.text.slice(0, 14))); }
        await page.waitForTimeout(150);
      }
    }
    /* 2026-11-05 UI/UX: 멈춘 이유는 알림 대신 상태 줄 #run-statusbar로 옮겼다 */
    const bar = await page.evaluate(() => { const b = document.querySelector('#run-statusbar'), r = b && b.getBoundingClientRect(); return !!(r && r.width && r.top >= 0 && r.bottom <= innerHeight + 1 && document.querySelector('#run-statusbar-text').textContent.trim()); });
    assert.ok(seen.size > 0 || bar, tag + ': 알림이나 상태 줄이 보여야 함');
    assert.deepEqual([...hits], [], `${tag}: 알림이 가림 ${[...hits].join(' | ')}`);
    assert.deepEqual(page.errors, []); ok(`5 ${tag}: 알림 ${[...seen].join(' / ')} — 정류장·이름표·얼굴 안 가림`);
    await page.close();
  }

  // ── 1 그날 마지막 멈춤(2D 1단계: 1번 F-C-B-D·2번 A-G-E) — 1148 DPR1.5 · 1280 · 390 DPR3 ──
  for (const [w, h, dpr] of [[1148, 977, 1.5], [1280, 800, 1], [390, 844, 3]]) {
    const page = await fresh('no3d=1', { width: w, height: h }, dpr);
    await play(page, 1, 'run'); await page.waitForTimeout(600);
    let last = null, holds = [];
    for (let k = 0; k < 12; k++) {
      if (await page.evaluate(() => document.body.dataset.screen) !== 'run' || await page.locator('#run-next').isDisabled()) break;
      await page.locator('#run-next').click();
      await page.waitForFunction(() => { const r = PB.UI.runState(); return !r || r.hold || document.body.dataset.screen !== 'run'; }, null, { timeout: 60000 });
      if (await page.evaluate(() => document.body.dataset.screen) !== 'run') break;
      await page.waitForTimeout(250);
      const st = await page.evaluate(() => ({ status: document.querySelector('#run-status').textContent, toast: (document.querySelector('#minimal-toast') || {}).textContent || '', disabled: document.querySelector('#run-next').disabled, title: document.querySelector('#run-next').title }));
      holds.push(st);
      if (st.disabled) { last = st; break; }
      assert.match(st.status, /⏭ 누르면 다음 멈춤까지 빨리 가요\.$/, '남은 멈춤이 있으면 ⏭ 안내: ' + st.status);
    }
    assert.ok(last, `${w}: 마지막 멈춤에 닿아야 함 — ${holds.map(x => x.status).join(' / ')}`);
    assert.equal(last.title, '남은 멈춤 없음');
    assert.match(last.status, /멈췄어요\. 남은 멈춤이 없어요\. ▶ 재개하거나 ⏩ 끝까지 가요\.$/, last.status);
    assert.doesNotMatch(last.status + last.toast, /⏭ 누르면/, '꺼진 ⏭를 안내하지 않음');
    assert.equal(await page.locator('#run-statusbar-text').textContent(), last.status, '상태 줄 = 안내문(2026-11-05 멈춘 이유는 상태 줄로)');
    await page.screenshot({ path: `${SHOT}/_shot-recheck-laststop-2d-${w}.png` });
    assert.deepEqual(page.errors, []); ok(`1 2D ${w}: 멈춤 ${holds.length}번 중 마지막 ‘${last.status}’ · ⏭ 꺼짐 · 알림 같은 문장`);
    await page.close();
  }

  // ── 390 AI 제안 아래 시트 = 화면 전체 폭 ──
  {
    const page = await fresh('no3d=1', { width: 390, height: 844 }, 3);
    await play(page, 2); await page.locator('#plan-ai-toggle').click(); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const b = document.querySelector('#plan-ai-popover').getBoundingClientRect(); return { x: b.x, w: b.width, W: innerWidth }; });
    assert.ok(Math.abs(r.x) < 1 && Math.abs(r.w - r.W) < 1, 'AI 시트 폭 ' + JSON.stringify(r));
    assert.deepEqual(page.errors, []); ok(`390 AI 제안 아래 시트 ${Math.round(r.w)}px = 화면 폭 ${r.W}px`);
    await page.close();
  }
  console.log(`\nrecheck-1102: ${passed.length} PASS`);
} finally { await browser.close(); server.close(); }
