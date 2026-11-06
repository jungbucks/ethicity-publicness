// 2026-11-02 「모바일 화면 문제」 확인 기준(헤드리스 Edge, 휴대폰 흉내 isMobile·hasTouch·DPR 3)
//  · 세로 360×740(+ 브라우저 아래 바를 뺀 360×684)·390×844, 가로 740×360·844×390 — 계획(1·3단계)·운행(2단계), 2D·3D
//  · 문서 스크롤 없음(세로·가로), 지도 틀 전체가 화면 안, 인물 카드 모두 화면 안·글자 안 잘림(옆으로 밀지 않음)
//  · 지도 위 노선 번호 숫자 없음(노선 끝 점·손잡이에 숫자 없음, ‘N번’ 글자 없음), 알림에 ‘N호차’·‘N번 노선’ 없음
//  · 계획: ‘이 노선으로 출발’과 지도가 함께 화면 안(보이는 높이 안), 노선 칩·되돌리기·노선 초기화 높이가 같음(1px), 노선 칩 폭 같음, 칩 글자 안 잘림
//  · 회전·창 크기 변경 → 지도 틀을 다시 맞춤(세로 ↔ 가로)
//  · 넓은 화면(1280×800)은 휴대폰 배치가 아님
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SHOT = process.env.SHOT_DIR || 'publicness/tests', passed = [];
function ok(name) { passed.push(name); console.log('  ok', name); }
const ROUTES = { 1: [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G', 'E']]], 2: [[3, ['E', 'H', 'B', 'A']]], 3: [[4, ['I', 'A']]] };
async function fresh(q, viewport, mobile = true) {
  const ctx = await browser.newContext(mobile ? { viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.errors = errors; page.ctx = ctx;
  await page.goto(base + '?' + q); await page.evaluate(() => localStorage.clear()); return page;
}
async function play(page, phase, then = 'plan') {
  await page.evaluate(([R, phase, then]) => {
    const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true;
    const add = p => (R[p] || []).forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
    while (s.phase < phase) { S.beginPlan(s); add(s.phase); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
    S.beginPlan(s); add(s.phase);
    if (then === 'run') { S.startRun(s); A.go('run'); } else A.go('plan');
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }, [ROUTES, phase, then]);
  await page.waitForTimeout(1400);
}
// 한 화면 검사 — 위반 목록을 돌려준다
const CHECK = () => {
  const bad = [], d = document.scrollingElement, W = innerWidth, H = innerHeight, r = e => e.getBoundingClientRect();
  const inside = (q, m = 1) => q.left >= -m && q.top >= -m && q.right <= W + m && q.bottom <= H + m;
  if (d.scrollHeight > H + 1) bad.push(`세로 스크롤 ${d.scrollHeight} > ${H}`);
  if (d.scrollWidth > W + 1) bad.push(`가로 스크롤 ${d.scrollWidth} > ${W}`);
  const st = r(document.querySelector('#stage')); if (!inside(st)) bad.push('지도 틀이 화면 밖 ' + [st.left, st.top, st.right, st.bottom].map(Math.round));
  if (st.width < 200 || st.height < 160) bad.push('지도가 너무 작음 ' + Math.round(st.width) + '×' + Math.round(st.height));
  document.querySelectorAll('#people-hud .person-chip').forEach(c => {
    const q = r(c); if (!inside(q)) bad.push('인물 카드 화면 밖 ' + c.id);
    if (c.scrollWidth > c.clientWidth + 1) bad.push('인물 카드 넘침 ' + c.id);
    c.querySelectorAll('span,b').forEach(s => { if (s.offsetParent && s.scrollWidth > s.clientWidth + 1) bad.push('인물 카드 글자 잘림 ' + c.id + ' ' + s.textContent); const sq = r(s); if (s.offsetParent && sq.width && (sq.right > q.right + 1 || sq.left < q.left - 1)) bad.push('인물 카드 글자가 카드 밖 ' + c.id + ' ' + s.textContent); });
  });
  const row = document.querySelector('#people-hud .people-hud-row'); if (row && row.scrollWidth > row.clientWidth + 1) bad.push('인물 카드 줄 옆으로 넘침');
  // 지도 위 노선 번호 숫자
  document.querySelectorAll('#net-layer .net-cap text').forEach(t => { if (t.textContent.trim()) bad.push('노선 끝 번호 ' + t.textContent); });
  document.querySelectorAll('#route-buses .route-num').forEach(t => { if (t.textContent.trim()) bad.push('노선 손잡이 번호 ' + t.textContent); });
  const stageText = document.querySelector('#stage').innerText || ''; if (/\d+\s*번(?!\s*이상)|\d+호차/.test(stageText)) bad.push('지도 글자에 번호: ' + stageText.match(/.{0,8}(\d+\s*번|\d+호차).{0,8}/)[0]);
  const scr = document.body.dataset.screen;
  if (scr === 'plan') {
    const dep = document.querySelector('#btn-depart'), dq = r(dep), vh = window.visualViewport ? visualViewport.height : H;
    if (!(dq.width && dq.top >= 0 && dq.bottom <= vh + 1 && dq.left >= 0 && dq.right <= W + 1)) bad.push('출발 버튼이 보이는 화면 밖 ' + Math.round(dq.bottom) + ' > ' + vh);
    const chips = [...document.querySelectorAll('#plan-toolbar .route-tab')].filter(c => c.offsetParent), sec = ['#btn-undo', '#btn-reset-routes'].map(s => document.querySelector(s));
    const hs = chips.concat(sec).map(e => r(e).height), ws = chips.map(e => r(e).width);
    if (Math.max(...hs) - Math.min(...hs) > 1) bad.push('칩·보조 버튼 높이 다름 ' + hs.map(Math.round).join('/'));
    if (ws.length && Math.max(...ws) - Math.min(...ws) > 1) bad.push('노선 칩 폭 다름 ' + ws.map(Math.round).join('/'));
    if (Math.abs(r(sec[0]).top - r(sec[1]).top) > 1) bad.push('되돌리기·초기화가 한 줄이 아님');
    chips.concat(sec).forEach(e => { if (!inside(r(e))) bad.push('편집 버튼 화면 밖 ' + (e.id || e.textContent)); if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) bad.push('버튼 글자 넘침 ' + (e.id || e.textContent)); });
    chips.forEach(c => { if (/\d+번/.test(c.textContent) && !document.body.classList.contains('route-numbers')) bad.push('노선 칩에 번호 ' + c.textContent); });
    // 행동 줄은 노선 칩·지도를 덮지 않음(자리를 차지하는 줄)
    const act = r(document.querySelector('.plan-actions')), hit = (p, q) => p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1; chips.concat(sec).forEach(c => { if (hit(r(c), act)) bad.push('행동 줄이 편집 버튼을 덮음'); }); if (hit(st, act)) bad.push('행동 줄이 지도를 덮음');
  }
  return { bad, mode: document.body.classList.contains('phone-p') ? 'portrait' : document.body.classList.contains('phone-l') ? 'landscape' : 'none', stage: [st.left, st.top, st.width, st.height].map(Math.round).join(',') };
};
const checkPage = async page => page.evaluate(`(${CHECK.toString()})()`);

try {
  // ── 1 화면 크기·단계·2D/3D별 확인 기준 ──
  const VIEWS = [[360, 740, 'portrait'], [360, 684, 'portrait'], [390, 844, 'portrait'], [740, 360, 'landscape'], [844, 390, 'landscape']];
  const CASES = [['no3d=1', 'plan', 1], ['no3d=1', 'plan', 3], ['no3d=1', 'run', 2], ['', 'plan', 3], ['', 'run', 2]];
  for (const [w, h, want] of VIEWS) for (const [q, then, phase] of CASES) {
    if (!q && !((w === 360 && h === 740) || (w === 844 && h === 390))) continue; // 3D는 대표 두 크기만(swiftshader가 느림)
    const tag = `${q ? '2D' : '3D'} ${w}×${h} ${then} ${phase}단계`;
    const page = await fresh(q, { width: w, height: h });
    await play(page, phase, then); if (then === 'run') await page.waitForTimeout(1500);
    const c = await checkPage(page);
    if (phase === 3 || then === 'run') await page.screenshot({ path: `${SHOT}/_shot-mobile-${w}x${h}-${q ? '2d' : '3d'}-${then}${phase}.png` });
    assert.equal(c.mode, want, tag + ': 휴대폰 배치 ' + c.mode);
    assert.deepEqual(c.bad, [], tag + ': ' + c.bad.join(' | '));
    assert.deepEqual(page.errors, [], tag);
    ok(`1 ${tag}: ${c.mode} · 스크롤 없음 · 지도 ${c.stage} 화면 안 · 인물 카드 다 보임·안 잘림 · 지도 번호 없음${then === 'plan' ? ' · 출발 버튼 보임 · 칩=보조 버튼 높이' : ''}`);
    await page.ctx.close();
  }

  // ── 2 회전·창 크기 변경 → 지도 틀을 다시 맞춤 ──
  {
    const page = await fresh('no3d=1', { width: 360, height: 740 });
    await play(page, 2);
    const a = await checkPage(page);
    await page.setViewportSize({ width: 740, height: 360 }); await page.waitForTimeout(1200);
    const b = await checkPage(page);
    await page.setViewportSize({ width: 360, height: 684 }); await page.waitForTimeout(1200);
    const c = await checkPage(page);
    assert.equal(a.mode, 'portrait'); assert.equal(b.mode, 'landscape'); assert.equal(c.mode, 'portrait');
    assert.notEqual(a.stage, b.stage, '회전하면 지도 틀이 바뀜'); assert.notEqual(a.stage, c.stage, '보이는 높이가 줄면 지도 틀도 줄어듦');
    [a, b, c].forEach((x, i) => assert.deepEqual(x.bad, [], ['세로', '가로', '세로(바)'][i] + ': ' + x.bad.join(' | ')));
    assert.deepEqual(page.errors, []);
    ok(`2 회전·크기 변경: 세로 ${a.stage} → 가로 ${b.stage} → 세로(아래 바) ${c.stage} — 매번 스크롤 없이 지도 전체`);
    await page.ctx.close();
  }

  // ── 3 알림 문구: ‘N호차’·‘N번 노선’ 대신 색 이름 ──
  {
    const page = await fresh('no3d=1', { width: 360, height: 740 });
    await play(page, 2);
    const seen = await page.evaluate(async () => {
      const out = [], n = () => document.querySelector('#minimal-toast'), grab = () => { const t = n(); if (t && !t.hidden && t.textContent) out.push(t.textContent); };
      const mo = new MutationObserver(grab); mo.observe(document.body, { subtree: true, childList: true, characterData: true });
      // 노선 손잡이 누르기(버스 고르기) → 다른 노선 칩 누르기(옮기기)
      document.querySelector('#route-bus-1').click(); await new Promise(r => setTimeout(r, 300)); grab();
      document.querySelector('#route-3').click(); await new Promise(r => setTimeout(r, 300)); grab();
      PB.App.toast('2호차에 3명 못 탐 · 1번 노선'); grab();
      mo.disconnect(); return out;
    });
    assert.ok(seen.length >= 2, '알림이 떠야 함: ' + seen.join(' / '));
    seen.forEach(t => assert.doesNotMatch(t, /\d+호차|\d+번 노선/, '알림에 번호: ' + t));
    assert.ok(seen.some(t => /(빨강|초록|주황|하늘) (노선|버스)/.test(t)), '색 이름 알림: ' + seen.join(' / '));
    const tab = await page.evaluate(() => ({ text: document.querySelector('#route-1').textContent, label: document.querySelector('#route-1').getAttribute('aria-label'), bus: document.querySelector('#route-bus-1').getAttribute('aria-label') }));
    assert.doesNotMatch(tab.text, /\d+번/); assert.match(tab.label, /^빨강 노선/); assert.match(tab.bus, /^빨강 노선/);
    assert.deepEqual(page.errors, []);
    ok(`3 알림 ${seen.length}개 모두 색 이름(${seen.slice(0, 2).join(' / ')}) · 노선 칩 ‘${tab.text}’ · aria ‘${tab.label}’`);
    await page.ctx.close();
  }

  // ── 4 설정 ‘노선 번호 표시’ 켜면 번호가 다시, 끄면 숨김 ──
  {
    const page = await fresh('no3d=1', { width: 360, height: 740 });
    await play(page, 2);
    const on = await page.evaluate(async () => { const c = document.querySelector('#opt-route-numbers'); c.checked = true; c.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 500)); return { caps: [...document.querySelectorAll('#net-layer .net-cap text:not(.cap-count)')].map(t => t.textContent), tab: document.querySelector('#route-1').textContent, handle: document.querySelector('#route-bus-1 .route-num').textContent }; });
    assert.ok(on.caps.includes('1') && /1번/.test(on.tab) && on.handle === '1', '번호 표시 켬: ' + JSON.stringify(on));
    const off = await page.evaluate(async () => { const c = document.querySelector('#opt-route-numbers'); c.checked = false; c.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 500)); return { caps: [...document.querySelectorAll('#net-layer .net-cap text:not(.cap-count)')].length, tab: document.querySelector('#route-1').textContent }; });
    assert.equal(off.caps, 0); assert.doesNotMatch(off.tab, /\d+번/);
    // 선 모양: 노선마다 다름(실선·이중선·점선·동글 점선)
    const pats = await page.evaluate(() => [1, 2, 3].map(n => { const l = document.querySelector(`#net-layer .net-lines line[data-route="${n}"]`); return (l.getAttribute('stroke-dasharray') || 'solid') + (document.querySelector('#net-layer .net-lines .double-stripe') && n === 2 ? '+double' : ''); }));
    assert.equal(new Set(pats).size, 3, '노선 선 모양이 서로 다름: ' + pats.join(' / '));
    assert.deepEqual(page.errors, []);
    ok(`4 설정 노선 번호 표시: 켬 → 끝 점 ${on.caps.join(',')}·칩 ‘${on.tab}’ / 끔 → 숫자 없음 · 선 모양 ${pats.join(' / ')}`);
    await page.ctx.close();
  }

  // ── 5 넓은 화면은 휴대폰 배치가 아님 ──
  {
    const page = await fresh('no3d=1', { width: 1280, height: 800 }, false);
    await play(page, 2);
    const m = await page.evaluate(() => ({ p: document.body.classList.contains('phone-p'), l: document.body.classList.contains('phone-l'), sh: document.scrollingElement.scrollHeight, ih: innerHeight }));
    assert.ok(!m.p && !m.l, '1280: 휴대폰 배치 아님'); assert.ok(m.sh <= m.ih + 1, '1280 스크롤 없음 ' + m.sh);
    assert.deepEqual(page.errors, []); ok('5 1280×800: 넓은 화면 배치 그대로 · 스크롤 없음');
    await page.ctx.close();
  }
  // ── 6 계획 화면 알림은 머리말 자리에 겹침 — 시간·예상 수지·인물 카드·지도·편집 줄을 가리지 않음, 지도 틀 그대로 ──
  for (const [w, h] of [[360, 740], [740, 360]]) {
    const page = await fresh('no3d=1', { width: w, height: h });
    await play(page, 2);
    const res = await page.evaluate(async () => {
      const box = e => e.getBoundingClientRect(), st0 = JSON.stringify(box(document.querySelector('#stage')));
      const hit = (a, b) => a.width && b.width && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      const out = [];
      for (const msg of ['강을 건너는 구간은 다리로 돌아가서, 지도에서 보는 것보다 1.4배 오래 걸려요.', '예상 수지가 달라졌어요: 새 버스 1대 보유비 −30,000원 · 기본 지원 +20,000원.']) {
        PB.App.toast(msg, { priority: true }); await new Promise(r => setTimeout(r, 400));
        const t = document.querySelector('#minimal-toast'), q = box(t);
        if (t.hidden || !q.height) { out.push('알림 안 보임'); continue; }
        if (q.top < -1 || q.bottom > innerHeight + 1 || q.left < -1 || q.right > innerWidth + 1) out.push('알림이 화면 밖');
        ['#minimal-profit', '#map-clock', '#stage', '#plan-toolbar .plan-primary', '#bus-depot', '.plan-actions'].concat([...document.querySelectorAll('#people-hud .person-chip')].map(c => '#' + c.id)).forEach(s => { const e = document.querySelector(s); if (e && e.offsetParent && hit(q, box(e))) out.push('알림이 가림 ' + s + ' ← ' + msg.slice(0, 10)); });
      }
      if (JSON.stringify(box(document.querySelector('#stage'))) !== st0) out.push('알림 때문에 지도 틀이 바뀜');
      return out;
    });
    assert.deepEqual(res, [], `${w}×${h}: ` + res.join(' | ')); assert.deepEqual(page.errors, []);
    ok(`6 ${w}×${h} 계획 알림: 머리말 자리 · 시간·수지·인물 카드·지도·편집 줄 안 가림 · 지도 틀 그대로`);
    await page.ctx.close();
  }
  console.log(`\nmobile-1102: ${passed.length} PASS`);
} finally { await browser.close(); server.close(); }
