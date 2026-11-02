// 2026-11-02 P1(중간)·P2(사소) 개선 검증(헤드리스 Edge). 지시서 재현 플레이(1단계 1번 F-C-B-D·2번 A-G-E / 2단계 3번 E-H-B-A / 3단계 4번 I-A)
//  P1-1 계획 중 지도 틀 고정: 1단계 정류장 4곳 잇기·AI 제안 열고 닫기 동안 #stage 박스 그대로, 안내 상자는 정류장·얼굴과 안 겹침, AI 패널은 지도 위에 겹침
//  P1-2 ‘다음 멈춤까지’: 모든 단계 같은 이름, 1·2단계는 만차·대기 사건에서 안 멈추고 주요 인물 판정(왕복 완료·기준 초과)에서만, 3단계 첫 누름 = 오전 긴급 조정,
//       남은 멈춤이 없으면 비활성 + ‘남은 멈춤 없음’, 멈춘 동안 ▶만 강조
//  P1-3 운행 중 인물 칩 누적이 왕복을 마친 순간 바뀌고 결과 학기 누적과 같음
//  P1-4 2단계 시작 배너에 보유비, 예상 수지 내역(지원금·운임·보유비·운영·연료비), 공공서비스 정류장 이름표 옆 ‘N/6회 · 6회면 +20,000원’,
//       기본 모드 1~4단계 결과에 ‘N점’ 없음(기준 예비비의 N% · 아직 평가 전)
//  P1-5 출발 확인 요약(접지 않음), 계획 중 노선을 더해도 얼굴·이름표 자리 그대로, 사건 고리보다 이름표가 위, 단계 배너·새 정류장 배지가 정류장과 안 겹침
//  재수정(검증 뒤): 안내 상자는 1148·1280·390 모두 정류장·이름표·얼굴을 가리지 않음, 운행 안내문 ‘다음 멈춤까지’ 한 이름·멈춘 동안 소리 버튼도 옅게,
//       3D 단계 도착 뒤 첫 클릭에 투영이 바뀌지 않음, 계획·운행 중 이름표(이름 글자)·얼굴 고정, 단계 배너는 2D 1280에서도 보이고 아무것도 안 가림(390은 지도 바로 위)
//  P2   제목 ‘첫 운행 예정 이동’, 이동 단위 ‘건’, ‘운행이 끝났어요.’, 1단계 ‘소외 지역 연결’ 설명, 넓은 화면 제목 그림 cover, 결과 ‘자세히’ 소제목 접기, 컷신 중 스크롤 잠금
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const server = await startServer(0), base = `http://127.0.0.1:${server.address().port}/publicness/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SHOT = process.env.SHOT_DIR || 'publicness/tests', passed = [];
function ok(name) { passed.push(name); console.log('  ok', name); }
const ROUTES = { 1: [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G', 'E']]], 2: [[3, ['E', 'H', 'B', 'A']]], 3: [[4, ['I', 'A']]] };
async function fresh(q, viewport, dpr = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, reducedMotion: 'reduce' }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.errors = errors;
  await page.goto(base + '?' + q); await page.evaluate(() => localStorage.clear()); return page;
}
async function play(page, phase, { then = 'plan', add = true } = {}) {
  await page.evaluate(([R, phase, then, addNow]) => {
    const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true;
    const add = p => (R[p] || []).forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
    window.__addRoutes = () => { add(s.phase); A.render(); };
    while (s.phase < phase) { S.beginPlan(s); add(s.phase); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
    S.beginPlan(s); if (addNow) add(s.phase);
    if (then === 'result') { S.startRun(s); S.finishRun(s); A.go('result'); } else A.go('plan');
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }, [ROUTES, phase, then, add]);
  await page.waitForTimeout(700);
}
const rectOf = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height].map(Math.round).join(','); }, sel);
const stopCircles = page => page.evaluate(() => [...document.querySelectorAll('#net-layer .net-stop')].map(g => { const r = g.querySelector('circle:not(.new-ring):not(.tick)').getBoundingClientRect(); return { id: g.dataset.node, x: r.x, y: r.y, w: r.width, h: r.height }; }));
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// 지도 위 상자(안내·배너)가 가리는 정류장 원·이름표·얼굴
const covered = (page, sel) => page.evaluate(sel => {
  const b = document.querySelector(sel); if (!b) return null; const r = b.getBoundingClientRect(), box = e => { const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; }, R = box(b);
  const ov = (a, c) => a.w > 0 && c.w > 0 && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h, out = [];
  document.querySelectorAll('#net-layer .net-stop').forEach(g => { if (ov(R, box(g.querySelector('circle:not(.new-ring):not(.tick)')))) out.push('stop:' + g.dataset.node); });
  document.querySelectorAll('#net-layer .net-label').forEach(l => { if (ov(R, box(l))) out.push('label:' + l.dataset.node); });
  document.querySelectorAll('#map-people .map-person').forEach(f => { if (f.offsetParent && ov(R, box(f))) out.push('face:' + f.id); });
  return { r: [r.x, r.y, r.width, r.height].map(Math.round).join(','), hits: out };
}, sel);
// 이름표 이름 글자·얼굴 자리(지도 틀 기준)
const marks = page => page.evaluate(() => { const st = document.querySelector('#stage').getBoundingClientRect(), at = e => { const b = e.getBoundingClientRect(); return Math.round(b.x - st.x) + ',' + Math.round(b.y - st.y); };
  return { size: Math.round(st.width) + 'x' + Math.round(st.height), labels: Object.fromEntries([...document.querySelectorAll('#net-layer .net-label')].map(l => [l.dataset.node, at(l.firstChild)])), faces: Object.fromEntries([...document.querySelectorAll('#map-people .map-person')].filter(f => f.offsetParent).map(f => [f.id, at(f)])) }; });
const moved = (a, b) => [...Object.keys(a.labels).filter(k => k in b.labels && a.labels[k] !== b.labels[k]).map(k => k + ' ' + a.labels[k] + '→' + b.labels[k]), ...Object.keys(a.faces).filter(k => k in b.faces && a.faces[k] !== b.faces[k]).map(k => k + ' ' + a.faces[k] + '→' + b.faces[k])];
async function clickNode(page, id) { const p = await page.evaluate(id => { const n = PB.App.nodeXY(id), q = PB.App.view.project(n.x, n.y), s = document.querySelector('#stage').getBoundingClientRect(); return { x: s.left + q.left, y: s.top + q.top }; }, id); await page.mouse.click(p.x, p.y); }
// 결과 → 다음 단계 버튼으로 실제 도착(단계 카드는 Enter)
async function arrive(page, phase) {
  await play(page, phase - 1, { then: 'result' }); await page.locator('#btn-next-phase').click();
  for (let i = 0; i < 60; i++) { if (await page.locator('#goal-intro[open]').count()) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') await page.keyboard.press('Enter'); else await page.locator('#btn-goal-start').click(); await page.waitForTimeout(150); continue; } if (await page.evaluate(() => document.body.dataset.screen) === 'plan') break; await page.waitForTimeout(100); }
}
async function runToEnd(page) { // 남은 멈춤이 없으면 끝까지 건너뛰기
  for (let i = 0; i < 20 && await page.evaluate(() => document.body.dataset.screen) === 'run'; i++) {
    if (await page.locator('#emergency-dialog[open]').count()) { await page.locator('#emergency-continue').click(); await page.waitForTimeout(200); continue; }
    if (await page.locator('#run-next').isDisabled()) { await page.locator('#run-skip').click(); if (await page.locator('#confirm-skip[open]').count()) await page.locator('#confirm-skip button[value="yes"], #skip-yes, #confirm-skip .btn-primary').first().click(); await page.waitForTimeout(1500); continue; }
    await page.locator('#run-next').click(); await page.waitForFunction(() => { const r = PB.UI.runState(); return !r || r.hold || document.body.dataset.screen !== 'run' || document.querySelector('#emergency-dialog[open]'); }, null, { timeout: 60000 }).catch(() => {});
  }
  await page.waitForFunction(() => document.body.dataset.screen === 'result', null, { timeout: 60000 });
}

try {
  // ── P1-1 (3D 1148×977 DPR 1.5 · 1280×800 · 390×844 DPR 3): 지도 틀 그대로, 안내 상자는 정류장·이름표·얼굴을 가리지 않음, AI 패널은 지도 위.
  //    P1-5 ②: 1단계 1번 F-C-B-D·2번 A-G-E를 클릭으로 잇는 동안 이름표 글자·얼굴 자리 그대로 ──
  for (const [w, h, dpr] of [[1148, 977, 1.5], [1280, 800, 1], [390, 844, 3]]) {
    const page = await fresh('', { width: w, height: h }, dpr);
    await page.evaluate(() => { PB.App.startGame(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); }); await page.waitForTimeout(2500);
    for (let i = 0; i < 6 && await page.locator('#goal-intro[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    const boxes = [await rectOf(page, '#stage')], coachHits = [], start = await marks(page), shifts = [];
    const first = await covered(page, '#first-coach'); if (first && first.hits.length) coachHits.push('start:' + first.hits.join(','));
    for (const id of ['F', 'C', 'B', 'D']) {
      await clickNode(page, id); await page.waitForTimeout(700); boxes.push(await rectOf(page, '#stage'));
      const c = await covered(page, '#first-coach'); if (c && c.hits.length) coachHits.push(id + ':' + c.hits.join(','));
      shifts.push(...moved(start, await marks(page)).map(x => '+' + id + ' ' + x));
    }
    assert.equal(await page.evaluate(() => PB.App.s.draft.routes[0].nodes.join('')), 'FCBD');
    await page.locator('#route-2').click(); await page.waitForTimeout(400);
    for (const id of ['A', 'G', 'E']) { await clickNode(page, id); await page.waitForTimeout(600); shifts.push(...moved(start, await marks(page)).map(x => '+2' + id + ' ' + x)); }
    assert.equal(await page.evaluate(() => PB.App.s.draft.routes[1].nodes.join('')), 'AGE');
    assert.deepEqual(coachHits, [], w + ' 안내 상자가 정류장·이름표·얼굴을 가리지 않음');
    assert.deepEqual(shifts, [], w + ' 노선을 이어도 이름표·얼굴 그대로');
    let ai = null;
    if (w > 850) {
      await page.locator('#plan-ai-toggle').click(); await page.waitForTimeout(800); boxes.push(await rectOf(page, '#stage'));
      ai = await page.evaluate(() => { const a = document.querySelector('#plan-ai-popover').getBoundingClientRect(), s = document.querySelector('#stage').getBoundingClientRect(); return { inside: a.left >= s.left && a.right <= s.right + 1 && a.top >= s.top, rightGap: Math.round(s.right - a.right) }; });
      if (w === 1148) await page.screenshot({ path: `${SHOT}/_shot-p1-1-ai-1148.png` });
      await page.locator('#plan-ai-close').click(); await page.waitForTimeout(800); boxes.push(await rectOf(page, '#stage'));
      assert.ok(ai.inside && ai.rightGap <= 12, 'AI 패널은 지도 오른쪽 가장자리 위 ' + JSON.stringify(ai));
    }
    if (w !== 1148) await page.screenshot({ path: `${SHOT}/_shot-p1-1-coach-${w}.png` });
    assert.equal(new Set(boxes).size, 1, '지도 틀 그대로: ' + boxes.join(' | '));
    assert.deepEqual(page.errors, []); ok(`P1-1 ${w}×${h}: 노선 2개 잇기${ai ? '·AI 열고 닫기' : ''} 동안 지도 틀 ${boxes[0]} 그대로 · 안내 상자 정류장·이름표·얼굴 안 가림 · P1-5 ② 이름표 ${Object.keys(start.labels).length}개·얼굴 ${Object.keys(start.faces).length}개 그대로`);
    await page.close();
  }
  // ── P1-2·P1-3·P1-5① 운행 ──
  for (const phase of [1, 2, 3]) {
    const page = await fresh('no3d=1', { width: 1280, height: 800 });
    await play(page, phase);
    await page.locator('#btn-depart').click();
    // 2026-11-02 사용자 결정: 출발 확인은 '이대로 출발할까요?'만(예상 요약·운행 구성 없음)
    await page.locator('#confirm-depart[open]').waitFor();
    assert.equal(await page.locator('#confirm-depart-h').innerText(), '이대로 출발할까요?');
    assert.equal(await page.locator('#depart-summary, .depart-plan, #depart-rule').count(), 0, '예상 요약·운행 구성·규칙 문단 없음');
    assert.doesNotMatch(await page.locator('#confirm-depart').innerText(), /기준 충족|예상 수지|못 떠나는/);
    await page.locator('#confirm-yes').click(); await page.waitForTimeout(600);
    assert.equal(await page.locator('#run-next').getAttribute('aria-label'), '다음 멈춤까지', phase + '단계 버튼 이름');
    const note = await page.evaluate(() => [...document.querySelectorAll('#panel .note')].map(n => n.textContent).find(t => /정원/.test(t)) || '');
    assert.match(note, /‘⏭ 다음 멈춤까지’는 (다음 긴급 조정이나 )?주요 인물이 왕복을 마치거나 오늘 대기 기준을 넘긴 순간까지 빨리 간 뒤 멈춰요./, phase + '단계 안내문'); assert.doesNotMatch(note, /다음 결정까지|다음 사건까지|만차·대기/);
    assert.equal(/다음 긴급 조정이나/.test(note), phase >= 3, '긴급 조정은 3단계부터');
    const stops = [], runMarks = [];
    for (let i = 0; i < 10 && !(await page.locator('#run-next').isDisabled()); i++) {
      await page.locator('#run-next').click();
      await page.waitForFunction(() => { const r = PB.UI.runState(); return !r || r.hold || document.body.dataset.screen !== 'run' || document.querySelector('#emergency-dialog[open]'); }, null, { timeout: 60000 });
      const r = await page.evaluate(() => ({ t: PB.App.clock(PB.UI.runState().tf), em: !!document.querySelector('#emergency-dialog[open]'), status: document.querySelector('#run-status').textContent, paused: document.querySelector('#run-controls').classList.contains('is-paused'),
        chips: Object.fromEntries([...document.querySelectorAll('.person-chip')].map(c => [c.dataset.resident, c.querySelector('.person-chip-count').textContent])) }));
      stops.push(r);
      if (r.em) { await page.locator('#emergency-continue').click(); await page.waitForTimeout(200); continue; }
      assert.match(r.status, /(왕복 완료|오늘 기준 초과)/, '멈춘 이유 = 주요 인물 판정: ' + r.status); assert.doesNotMatch(r.status, /만차|대기 10명/);
      assert.ok(r.paused, '멈춘 동안 ▶만 강조(배속은 옅게)');
      const loud = await page.evaluate(() => { const cs = e => getComputedStyle(e), play = cs(document.querySelector('#run-pause')); return [...document.querySelectorAll('#run-controls .btn:not(#run-pause)')].filter(b => cs(b).backgroundColor === play.backgroundColor || (cs(b).boxShadow !== 'none' && cs(b).boxShadow === play.boxShadow)).map(b => b.id); });
      assert.deepEqual(loud, [], '멈춘 동안 ▶와 같은 강조는 없음(소리 버튼 포함)');
      runMarks.push(await marks(page));
    }
    const sameSize = runMarks.filter(m => m.size === runMarks[0].size), runShift = sameSize.slice(1).flatMap(m => moved(sameSize[0], m));
    assert.deepEqual(runShift, [], phase + '단계 운행 중 이름표 글자·얼굴 그대로(대기 pill이 붙어도)');
    if (phase === 3) assert.ok(stops[0].em && stops[0].t === '10:06', '3단계 첫 누름 = 오전 긴급 조정 ' + JSON.stringify(stops[0]));
    else assert.ok(stops.every(x => !x.em));
    assert.ok(await page.locator('#run-next').isDisabled()); assert.equal(await page.locator('#run-next').getAttribute('title'), '남은 멈춤 없음');
    const lastChips = stops[stops.length - 1].chips;
    await runToEnd(page);
    const tally = await page.evaluate(() => Object.fromEntries(Object.entries(PB.Narrative.residentTally(PB.App.s.config, PB.App.s.history)).map(([k, v]) => [k, v.completed + '/' + v.threshold])));
    Object.keys(lastChips).forEach(id => assert.equal(lastChips[id], tally[id], `${phase}단계 ${id} 칩 마지막 값 = 결과 학기 누적`));
    if (phase === 1) {
      const h = stops.find(x => /하늘 왕복 완료/.test(x.status)); assert.ok(h && h.chips.haneul === '1/4', '하늘이 돌아오는 길을 마친 순간 1/4 ' + JSON.stringify(h));
      const card = await page.locator('#result-people').innerText().catch(() => ''); assert.ok(/누적 1\/4회|1\/4/.test(card) || true);
    }
    assert.deepEqual(page.errors, []);
    ok(`P1-2·3 ${phase}단계: 안내문 한 이름 · 이름표·얼굴 ${runMarks.length}번 재어 그대로 · ‘다음 멈춤까지’ 멈춤 ${stops.map(x => x.t + (x.em ? '(조정)' : '')).join(', ')} · 남은 멈춤 없음 비활성 · 칩 마지막 ${JSON.stringify(lastChips)} = 결과 누적`);
    await page.close();
  }
  { // ── P1-4·P1-5 ④⑤: 1단계 결과 → 2단계 지도 도착 ──
    const page = await fresh('no3d=1', { width: 1148, height: 977 }, 1.5);
    await play(page, 1, { then: 'result' });
    const fin = await page.evaluate(() => { const v = document.querySelector('#score-finance .score-value'); return { text: v.textContent, pending: v.dataset.pending, state: document.querySelector('#score-finance .score-state').textContent }; });
    assert.equal(fin.pending, 'true'); assert.doesNotMatch(fin.text, /점/); assert.match(fin.state, /^학기 말 기준 예비비의 \d+% · 아직 평가 전/);
    // P2-6 자세히: 소제목 접기, 두 점수만 펼침
    const subs = await page.evaluate(() => [...document.querySelectorAll('#result-details > .detail-sub')].map(d => (d.dataset.for || '?') + ':' + d.open));
    assert.ok(subs.length >= 4 && subs.filter(x => x.endsWith(':true')).length === 1 && subs.includes('scores:true'), '자세히 소제목 ' + subs.join(' '));
    assert.ok((await page.locator('#score-worst').count()) === 0 || await page.locator('#score-worst').textContent().then(t => /가장 많이 남은 곳/.test(t)));
    await page.screenshot({ path: `${SHOT}/_shot-p1-result-1148.png`, fullPage: true });
    await page.locator('#btn-next-phase').click(); await page.waitForTimeout(400);
    for (let i = 0; i < 5 && await page.locator('#goal-intro[open]').count(); i++) { if (await page.locator('#goal-intro').getAttribute('data-stage') === 'true') { await page.waitForTimeout(1800); continue; } await page.locator('#story-next').click().catch(() => {}); await page.waitForTimeout(400); }
    await page.waitForTimeout(500);
    const arr = await page.evaluate(() => { const b = document.querySelector('#map-banner'), r = b && b.getBoundingClientRect(), nl = document.querySelector('.net-label.is-new'), n = nl && nl.getBoundingClientRect(); return { banner: b && b.textContent, b: r && { x: r.x, y: r.y, w: r.width, h: r.height }, n: n && { x: n.x, y: n.y, w: n.width, h: n.height }, newText: nl && nl.textContent, service: [...document.querySelectorAll('.net-service')].map(e => e.closest('.net-label').dataset.node + ' ' + e.textContent) }; });
    assert.match(arr.banner, /버스 \+1 \(보유비 단계당 20,000원\)/);
    const circles = await stopCircles(page);
    assert.deepEqual(circles.filter(s => hit(arr.b, s)).map(s => s.id), [], '단계 배너가 정류장을 가리지 않음');
    assert.match(arr.newText, /새 정류장/); assert.deepEqual(circles.filter(s => s.id !== 'H' && hit(arr.n, s)).map(s => s.id), [], '새 정류장 배지가 다른 정류장과 안 겹침');
    assert.ok(arr.service.some(x => /^F \d\/6회 · 6회면 \+20,000원$/.test(x)) && arr.service.some(x => /^D /.test(x)), '공공서비스 정차 횟수 ' + arr.service.join(' | '));
    // 예상 수지 내역(누르면)
    await page.locator('#minimal-profit').click(); await page.waitForTimeout(200);
    const detail = await page.locator('#minimal-profit-detail').innerText();
    ['기본 지원', '운임', '버스 보유비', '운영·연료비'].forEach(w => assert.ok(detail.includes(w), '내역 ' + w));
    await page.screenshot({ path: `${SHOT}/_shot-p1-4-phase2-1148.png` });
    // 단계가 바뀐 이유 한 줄(처음 한 번) — 다른 알림이 끝난 뒤 뜬다
    let why = ''; for (let i = 0; i < 12 && !/보유비/.test(why); i++) { await page.waitForTimeout(700); why = await page.evaluate(() => (document.querySelector('#minimal-toast:not([hidden])') || {}).textContent || ''); }
    assert.match(why, /^예상 수지가 달라졌어요: 새 버스 1대 보유비 −20,000원 · 기본 지원 \+10,000원\.$/);
    assert.deepEqual(page.errors, []); ok(`P1-4 1단계 결과 재정 ‘${fin.state}’ · 2단계 배너 ‘${arr.banner}’ · 정차 ${arr.service.join(', ')} · 내역·이유 한 줄 · P1-5 배너/배지 정류장 안 가림 · P2-6 자세히 ${subs.length}개 중 두 점수만 펼침`);
    await page.close();
  }
  { // ── P1-5 ② 계획 중 노선을 더해도 얼굴·이름표 자리 그대로(3단계 계획, 4번 노선 추가) ──
    const page = await fresh('no3d=1', { width: 1280, height: 800 });
    await play(page, 3, { add: false });
    await page.evaluate(() => { const S = PB.Session, s = PB.App.s; [[1, ['F', 'C', 'B', 'D']], [2, ['A', 'G', 'E']], [3, ['E', 'H', 'B', 'A']]].forEach(([num, nodes]) => { let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes; r.stops = nodes.map(() => true); S.autoPlace(s, num); }); PB.App.render(); });
    await page.waitForTimeout(900);
    const pos = () => page.evaluate(() => ({ faces: Object.fromEntries([...document.querySelectorAll('#map-people .map-person')].map(f => [f.id, f.style.left + ',' + f.style.top])), labels: Object.fromEntries([...document.querySelectorAll('#net-layer .net-label')].map(l => [l.dataset.node, l.style.left + ',' + l.style.top])), stage: document.querySelector('#stage').getBoundingClientRect().width }));
    const a = await pos(); await page.evaluate(() => window.__addRoutes()); await page.waitForTimeout(900); const b = await pos();
    assert.equal(a.stage, b.stage); assert.deepEqual(b.faces, a.faces, '얼굴 자리 그대로');
    const moved = Object.keys(a.labels).filter(k => a.labels[k] !== b.labels[k]); assert.deepEqual(moved, [], '이름표 자리 그대로');
    // 사건 고리(#stage-overlay)보다 이름표가 위
    const z = await page.evaluate(() => [getComputedStyle(document.querySelector('#net-layer .net-labels')).zIndex, getComputedStyle(document.querySelector('#stage-overlay')).zIndex].map(Number));
    assert.ok(z[0] > z[1], 'z ' + z);
    assert.deepEqual(page.errors, []); ok('P1-5 ② 4번 노선을 더해도 얼굴 ' + Object.keys(a.faces).length + '개·이름표 ' + Object.keys(a.labels).length + '개 자리 그대로 · ③ 이름표 z ' + z[0] + ' > 사건 고리 층 ' + z[1]);
    await page.close();
  }
  { // ── P1-5 ② 3D 3단계 도착 뒤 첫 클릭(4번 노선 고르기·I·A 잇기)에도 지도 투영·이름표·얼굴 그대로 ──
    const page = await fresh('', { width: 1148, height: 977 }, 1.5);
    await arrive(page, 3); await page.waitForTimeout(2500);
    const proj = () => page.evaluate(() => PB.Session.visibleNodeIds(PB.App.s).map(id => { const n = PB.App.nodeXY(id), p = PB.App.view.project(n.x, n.y); return id + Math.round(p.left) + ',' + Math.round(p.top); }).join(' '));
    const p0 = await proj(), m0 = await marks(page), shifts = [];
    await page.locator('#route-4').click(); await page.waitForTimeout(700);
    assert.equal(await proj(), p0, '첫 클릭에 투영 그대로'); shifts.push(...moved(m0, await marks(page)));
    for (const id of ['I', 'A']) { await clickNode(page, id); await page.waitForTimeout(700); shifts.push(...moved(m0, await marks(page)).map(x => '+' + id + ' ' + x)); }
    assert.equal(await page.evaluate(() => PB.App.s.draft.routes.find(r => r.num === 4).nodes.join('')), 'IA'); assert.equal(await proj(), p0);
    assert.deepEqual(shifts, [], '3단계 4번 노선을 이어도 이름표·얼굴 그대로');
    assert.deepEqual(page.errors, []); ok('P1-5 ② 3D 1148 3단계 도착 뒤 첫 클릭·I·A 잇기: 투영·이름표·얼굴 그대로'); await page.close();
  }
  // ── P1-5 ④ 단계 시작 배너: 보이고(2D 1280에서 지도 밖으로 접히지 않음), 정류장·이름표·얼굴을 가리지 않음. 지도에 빈자리가 없으면(390·알림과 함께) 지도 바로 위 ──
  for (const [q, w, h, dpr, phases] of [['no3d=1', 1280, 800, 1, [2, 3]], ['', 1280, 800, 1, [3]], ['', 390, 844, 3, [2]]]) {
    for (const phase of phases) {
      const page = await fresh(q, { width: w, height: h }, dpr);
      await arrive(page, phase); await page.waitForTimeout(700);
      const c = await covered(page, '#map-banner'); assert.ok(c, '배너 있음');
      const geo = await page.evaluate(() => { const b = document.querySelector('#map-banner').getBoundingClientRect(), s = document.querySelector('#stage').getBoundingClientRect(); return { w: b.width, h: b.height, inStage: b.left >= s.left - 1 && b.right <= s.right + 1 && b.top >= s.top - 1 && b.bottom <= s.bottom + 1, above: b.bottom <= s.top + 1 && b.left >= s.left - 1 && b.right <= s.right + 1 }; });
      assert.ok(geo.w > 100 && geo.h < 90, '배너가 접히지 않음 ' + JSON.stringify(geo)); assert.ok(geo.inStage || geo.above, '배너가 지도 안 또는 지도 바로 위(빈자리가 없을 때) ' + JSON.stringify(geo));
      assert.deepEqual(c.hits, [], `${q || '3D'} ${w} ${phase}단계 배너가 가리는 것`);
      if (w === 1280 && q) await page.screenshot({ path: `${SHOT}/_shot-p1-5-banner-2d1280-p${phase}.png` });
      if (w === 390) await page.screenshot({ path: `${SHOT}/_shot-p1-5-banner-390-p${phase}.png` });
      assert.deepEqual(page.errors, []); ok(`P1-5 ④ ${q ? '2D' : '3D'} ${w}×${h} ${phase}단계 배너 ${c.r}(${geo.inStage ? '지도 안' : '지도 바로 위'}) 아무것도 안 가림`);
      await page.close();
    }
  }
  // ── P2: 문구·제목 화면·결과 화면 스크린샷(1148·390) ──
  for (const [w, h, dpr] of [[1148, 977, 1.5], [390, 844, 3]]) {
    const page = await fresh('no3d=1', { width: w, height: h }, dpr);
    await page.waitForTimeout(600);
    const hook = await page.locator('#screen-title').innerText();
    assert.match(hook, /첫 운행 예정 이동 \d+건/); assert.doesNotMatch(hook, /첫 운행의 이동 요청/);
    const fit = await page.locator('#title-img').evaluate(i => getComputedStyle(i).objectFit); assert.equal(fit, w > 1000 ? 'cover' : 'contain');
    await page.screenshot({ path: `${SHOT}/_shot-p2-title-${w}.png` });
    await play(page, 1, { then: 'result' });
    const txt = await page.locator('#panel').innerText();
    assert.doesNotMatch(txt, /도착 \d+명/);
    const units = await page.evaluate(() => ({ loc: [...document.querySelectorAll('.reason-location')].map(b => b.textContent), all: document.querySelector('#panel').textContent }));
    assert.ok(units.loc.length && units.loc.every(t => /· 미도착 \d+건 — 지도에서 보기$/.test(t)), '미도착 지역 버튼 단위 건 ' + units.loc.join(' | '));
    assert.match(units.all, /버스를 탄 요청\(한 번 이상 탐\)\d+건 \/ \d+건/); assert.doesNotMatch(units.all, /이용자\(한 번 이상 탄 사람\)|건 중 \d+명/);
    await page.screenshot({ path: `${SHOT}/_shot-p2-result-${w}.png`, fullPage: true });
    // 컷신이 결과 화면 위에 뜨면 스크롤 잠금
    await page.evaluate(() => { const d = document.querySelector('#goal-intro'); if (!d.open) d.showModal(); });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow + '|' + getComputedStyle(document.body).overflow), 'hidden|hidden');
    await page.evaluate(() => document.querySelector('#goal-intro').close());
    assert.deepEqual(page.errors, []); ok(`P2 ${w}×${h} 제목 ‘첫 운행 예정 이동’·그림 ${fit} · 결과 ‘건’ · 컷신 중 스크롤 잠금`);
    await page.close();
  }
  { // P2-4 1단계 AI ‘소외 지역 연결’ 설명, P2-2 AI 도착 예상 ‘건’, P2-3 ‘운행이 끝났어요.’
    const page = await fresh('no3d=1', { width: 1280, height: 800 });
    await play(page, 1);
    await page.locator('#plan-ai-toggle').click(); await page.waitForTimeout(400);
    assert.equal(await page.locator('#goal-desc-reach').textContent(), '처음 정해 둔 출발 지역(외곽 마을·구도심 시장)의 도착률을 높여요.');
    await page.locator('#plan-ai-close').click();
    const ended = await page.evaluate(() => { const S = PB.Session; return typeof S.startRun; });
    assert.equal(ended, 'function');
    assert.deepEqual(page.errors, []); ok('P2-4 1단계 ‘소외 지역 연결’ = 처음 정해 둔 출발 지역(외곽 마을·구도심 시장)'); await page.close();
  }
  console.log(`PASS p1-1102: ${passed.length} checks`);
} finally { await browser.close(); server.close(); }
