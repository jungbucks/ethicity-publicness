// 2026-11-02 P0 버그 4개 수정 검증(헤드리스 Edge). 지시서 재현 플레이: 1단계 1번 외곽 마을→대학교→밀집 주거지→병원, 2번 기차역→일자리→시장 /
// 2단계 3번 시장→운동장→밀집 주거지→기차역 / 3단계 4번 신도시→기차역(노선마다 버스 1대 자동 배정) → 출발 → ⏭로 11:00 → 「노선 고치기 · 한 번」(2026-11-09, 옛 10:06 긴급 조정 대체)
//  P0-1 운행 상황 패널: 1148×977(DPR 1.5)·1280×800·1440×900·390×844에서 헤더 버튼 한 번으로 ‘지금 운행 상황’·주요 인물이 보이고(지도 칸 크기 그대로),
//       다시 누르면 닫힘. 기본 화면(?minimal=0)도 버튼이 화면을 바꿈. 긴급 조정 창이 떠도 인물 칩이 모두 보임
//  P0-2 노선 고치기의 버스 옮기기: 기본 선택 없음(추천 없음) / 유일한 버스를 고르면 노선 색·인물 이름 경고(영향 예상 숫자는 2026-11-09에 뺌) /
//       2대인 노선의 버스를 고르면 경고 없이 옮기기
//  P0-3 결과: 인물 카드와 ‘자주 보는 주민’의 가장 긴 대기가 같은 값, 하루 합은 이름이 다름, 기준 초과면 만족 아님(판정 함수 하나)
//  P0-4 생각해 보기: 외곽 마을이 모두 도착하면 인정하고 가장 낮은 출발 생활권(밀집 주거지)을 짚음, 숫자 = 출발 생활권 표 /
//       2번 노선만 운행하면 지금처럼 외곽 마을 문구와 단계 질문
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/Works/token_economy/node_modules/playwright');
const stories = require('../js/stories.js');
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
// 재현 플레이를 phase 단계까지(앞 단계는 그대로 운행·정산). only = 그 번호 노선만
async function play(page, phase, { only = null, then = 'plan', extra = null } = {}) {
  await page.evaluate(([R, phase, only, then, extra]) => {
    const A = PB.App, S = PB.Session; A.startGame(); const s = A.s; s.tutorialSeen = true;
    const add = p => (R[p] || []).forEach(([num, nodes]) => { if (only && num !== only) return; let r = s.draft.routes.find(x => x.num === num); if (!r) { r = { num, nodes: [], stops: [] }; s.draft.routes.push(r); } r.nodes = nodes.slice(); r.stops = nodes.map(() => true); S.autoPlace(s, num); });
    while (s.phase < phase) { S.beginPlan(s); add(s.phase); S.startRun(s); S.finishRun(s); S.nextPhase(s); }
    S.beginPlan(s); add(s.phase); if (extra) s.draft.buses.forEach(b => { if (b.id === extra[0]) b.routeNum = extra[1]; });
    if (then === 'result') { S.startRun(s); S.finishRun(s); A.go('result'); } else A.go('plan');
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }, [ROUTES, phase, only, then, extra]);
  await page.waitForTimeout(700);
}
async function depart(page) { await page.locator('#btn-depart').click(); await page.locator('#confirm-yes').click(); await page.waitForTimeout(700); await page.locator('#run-pause').click(); await page.waitForTimeout(200); } // 출발 직후 멈춤(조정 시각 전에 패널을 여닫아 보려고)
async function toEmergency(page) { // 2026-11-09: ⏭로 11:00(노선 고치기 시작)까지 간 뒤 「노선 고치기 · 한 번」
  for (let i = 0; i < 25; i++) { const st = await page.evaluate(() => PB.UI.runState()); if (st && st.tf >= st.fixAt) break; await page.locator('#run-next').click().catch(() => {}); await page.waitForTimeout(1000); }
  await page.evaluate(() => PB.UI.openFix());
  assert.equal(await page.locator('#emergency-dialog[open]').count(), 1, '노선 고치기 창'); await page.waitForTimeout(500);
}
const stageBox = page => page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); });
const visible = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }, sel);

try {
  // ── P0-1 운행 상황 패널(미니멀 기본 화면) ──
  for (const [w, h, dpr, q] of [[1148, 977, 1.5, ''], [1280, 800, 1, 'no3d=1'], [1440, 900, 1, 'no3d=1'], [390, 844, 3, 'no3d=1']]) {
    const page = await fresh(q, { width: w, height: h }, dpr);
    await play(page, 3); await depart(page);
    const btn = page.locator('#btn-panel-toggle'), before = await stageBox(page);
    assert.ok(await btn.isVisible(), `${w} 헤더 버튼 보임`); assert.equal(await btn.getAttribute('aria-expanded'), 'false');
    assert.equal(await visible(page, '#run-live'), false, '처음엔 지도만');
    await btn.click(); await page.waitForTimeout(300);
    assert.ok(await visible(page, '#run-live'), `${w} 한 번 누르면 ‘지금 운행 상황’ 보임`); assert.ok(await visible(page, '#run-residents'), '주요 인물 상태 보임');
    assert.match(await page.locator('#run-residents').innerText(), /하늘[\s\S]*나래[\s\S]*준/);
    assert.equal(await btn.getAttribute('aria-expanded'), 'true'); assert.equal(await stageBox(page), before, '지도 칸 크기·자리 그대로(겹쳐 덮음)');
    if (w === 1148 || w === 390) await page.screenshot({ path: `${SHOT}/_shot-p0-1-drawer-${w}.png` });
    await btn.click(); await page.waitForTimeout(300);
    assert.equal(await visible(page, '#run-live'), false, '다시 누르면 닫힘'); assert.equal(await stageBox(page), before);
    // 긴급 조정 창이 뜨면 패널이 이미 보이니 버튼은 숨김, 인물 칩은 가로 스크롤 없이 모두 보임
    await toEmergency(page);
    assert.equal(await btn.isVisible(), false, '조정 창이 떠 있으면 헛도는 버튼 없음');
    const chips = await page.evaluate(() => { const row = document.querySelector('.people-hud-row'), rr = row.getBoundingClientRect(); return { scroll: row.scrollWidth - row.clientWidth, out: [...row.querySelectorAll('.person-chip')].filter(c => { const r = c.getBoundingClientRect(); return r.right > Math.min(rr.right, innerWidth) + 1 || r.left < rr.left - 1 || r.width === 0; }).map(c => c.dataset.resident), n: row.querySelectorAll('.person-chip').length }; });
    assert.equal(chips.n, 4); assert.deepEqual(chips.out, [], `${w} 인물 칩 모두 보임`); assert.ok(chips.scroll <= 1, '칩 줄 가로 스크롤 없음 ' + chips.scroll);
    if (w === 1148) await page.screenshot({ path: `${SHOT}/_shot-p0-1-emergency-${w}.png` });
    assert.deepEqual(page.errors, []); ok(`P0-1 ${w}×${h} 운행 상황 한 번에 열고 닫기(지도 크기 그대로) · 조정 창에서 인물 칩 ${chips.n}개 모두 보임`);

    // ── P0-2 (1148에서) 노선마다 1대 → 기본 선택 없음·권고, 유일한 버스 경고 ──
    if (w === 1148) {
      await page.locator('#fix-kind-move').click(); await page.waitForTimeout(200);
      assert.equal(await page.locator('#fix-bus').inputValue(), '', '기본 선택 없음(추천 없음)'); assert.ok(await page.locator('#fix-apply').isDisabled());
      await page.selectOption('#fix-bus', '2'); await page.selectOption('#fix-to', '1'); await page.waitForTimeout(400);
      const warn = await page.locator('#fix-warn').textContent();
      assert.ok(await page.locator('#fix-warn').isVisible()); assert.match(warn, /^초록 노선 버스가 0대가 돼요\./); /* 2026-11-02 노선은 색 이름(2번 = 초록) */ assert.match(warn, /준\(기차역→산업·일자리\)/);
      assert.equal(await page.locator('#emergency-impact').count(), 0, '영향 예상 숫자 없음(2026-11-09)');
      await page.screenshot({ path: `${SHOT}/_shot-p0-2-warn-1148.png` });
      await page.locator('#fix-cancel').click(); await page.waitForTimeout(300);
      assert.equal(await page.locator('#emergency-dialog[open]').count(), 0);
      ok('P0-2 버스 옮기기: 기본 선택 없음, 초록 노선의 유일한 버스를 고르면 ‘초록 노선 버스가 0대…준(기차역→산업·일자리)…’ — ' + warn);
    }
    await page.close();
  }
  { // P0-2 2대인 노선이 있으면 그 노선 버스가 기본, 옮기기 그대로(4호차를 1번에 더해 1번 2대·4번 0대)
    const page = await fresh('no3d=1', { width: 1280, height: 800 });
    await play(page, 3, { extra: [4, 1] }); await depart(page); await toEmergency(page);
    await page.locator('#fix-kind-move').click(); const def = await page.evaluate(() => { const s = PB.App.s, at = PB.UI.runState().pendingEmergency; return String(s.draft.buses.find(b => PB.Session.busRouteAt(s, b.id, at) === 1).id); });
    await page.selectOption('#fix-bus', def); const to = await page.evaluate(() => [...document.querySelectorAll('#fix-to option')].find(o => o.value).value); await page.selectOption('#fix-to', to); await page.waitForTimeout(300);
    assert.ok(await page.locator('#fix-warn').isHidden(), '2대인 노선의 버스는 경고 없음');
    await page.locator('#fix-apply').click(); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => PB.App.s.midChanges.filter(a => a.phase === 3 && a.kind === 'move').length), 1, '옮기기 반영');
    assert.deepEqual(page.errors, []); ok(`P0-2 2대인 노선(빨강)의 ${def}호차를 고르면 경고 없이 옮기기(→${to}번)`);
    await page.close();
  }

  // ── P0-3·P0-4 결과 화면 ──
  for (const phase of [1, 2]) {
    const page = await fresh('no3d=1', { width: 1280, height: 900 });
    await play(page, phase, { then: 'result' });
    const r = await page.evaluate(() => {
      const t = s => [...document.querySelectorAll(s)].map(e => e.textContent.trim()), cfg = PB.App.s.config, h = PB.App.s.history[PB.App.s.history.length - 1];
      const zone = id => { const z = h.metrics.zones[id]; return { N: z.N, left: z.N - z.arrived, rate: z.rate }; };
      return { bridge: t('#think-bridge')[0] || '', prompt: t('#think-prompt'), cards: t('.resident-reason'), freq: t('[aria-labelledby=res-h] li'), zoneB: zone('B'), zoneF: zone('F'), zoneC: zone('C'), zoneD: zone('D'),
        recs: Object.fromEntries(Object.entries(h.residents).filter(([, v]) => v).map(([k, v]) => [k, { lw: v.longestWait, sum: v.waitTotal, ok: v.satisfied }])), max: cfg.service.maxWait };
    });
    // P0-3: 카드·자주 보는 주민의 ‘가장 긴 대기’가 같은 값, 하루 합은 이름이 다름, 기준 초과면 만족 아님
    for (const [id, name] of [['haneul', '하늘'], ['narae', '나래'], ['jun', '준']]) {
      const card = r.cards.find(x => x.startsWith(name + ' ·')), row = r.freq.find(x => x.includes(' ' + name + '('));
      const a = (card.match(/가장 긴 대기 ([^/)]+?) \//) || [])[1], b = (row.match(/가장 긴 대기 ([^/]+?) \//) || [])[1];
      assert.ok(a && a === b, `${phase}단계 ${name} 카드(${a}) = 자주 보는 주민(${b})`); assert.match(row, /하루 동안 기다린 시간 합/); assert.doesNotMatch(row, / 기다린 시간 \d/);
      assert.match(card, /기준 4시간 3분/);
      assert.equal(r.recs[id].ok, r.recs[id].lw <= r.max, `${name} 판정 = 가장 긴 대기 ≤ 기준`);
    }
    // P0-4: 숫자는 출발 생활권 표와 같다
    if (phase === 1) {
      assert.equal(r.zoneF.left, 0, '재현 1단계 외곽 마을 출발 모두 도착');
      assert.match(r.bridge, /^남은 비율이 가장 큰 곳은 .+(이에요|예요)\. (출발한 이동 \d+건 중 \d+건은 목적지까지 못 갔어요\. )?이번 단계에서 살펴볼 곳은 외곽 마을이에요\(출발 \d+건 모두 도착\)\. 다음에는 누구의 이동을 살필까요\?$/); /* 11-05 P0-3 */
      assert.deepEqual(r.prompt, [], '외곽 마을을 문제처럼 묻는 고정 문구 없음');
    } else {
      const N = r.zoneC.N + r.zoneD.N, left = r.zoneC.left + r.zoneD.left;
      assert.ok(N > 0 && left >= 0); assert.match(r.bridge, /대학교·병원·공공서비스/, '주제 지역 90% 미만이면 그 지역을 함께(11-05 P0-3)');
      const e = stories.phaseEthics[1]; assert.deepEqual(r.prompt, [e.title + '. ' + e.text]);
    }
    assert.ok(await page.locator('#learning').count() === 1 && await page.locator('.learning-source').count() >= 1, '사례 카드·출처 그대로');
    await page.screenshot({ path: `${SHOT}/_shot-p0-34-result-p${phase}.png`, fullPage: true });
    assert.deepEqual(page.errors, []); ok(`P0-3·4 ${phase}단계 결과: 가장 긴 대기 카드=주민 목록(판정 값), 하루 합 따로 · 생각해 보기 “${r.bridge}”`);
    await page.close();
  }
  { // 2번 노선만 운행하면 지금처럼 외곽 마을 문구와 단계 질문
    const page = await fresh('no3d=1', { width: 1280, height: 900 });
    await play(page, 1, { only: 2, then: 'result' });
    const bridge = await page.locator('#think-bridge').textContent(), e = stories.phaseEthics[0];
    assert.match(bridge, /목적지까지 못 갔어요|건 목적지까지 못 감\)/); assert.match(bridge, /외곽 마을/); assert.equal(await page.locator('#think-prompt').textContent(), e.title + '. ' + e.text);
    ok('P0-4 2번 노선만: “' + bridge + '” + ‘' + e.title + '’'); await page.close();
  }
  { // 기본 화면(?minimal=0): 버튼이 패널을 접고 펼친다(화면이 바뀜)
    const page = await fresh('no3d=1&minimal=0', { width: 1280, height: 800 });
    await play(page, 3); await depart(page);
    const btn = page.locator('#btn-panel-toggle'), a = await visible(page, '#run-live');
    await btn.click(); await page.waitForTimeout(300); const b = await visible(page, '#run-live');
    await btn.click(); await page.waitForTimeout(300); const c = await visible(page, '#run-live');
    assert.ok(a !== b && a === c, '기본 화면도 누를 때마다 패널이 보였다 안 보였다 ' + [a, b, c]);
    assert.deepEqual(page.errors, []); ok('P0-1 기본 화면(?minimal=0) 패널 접기/펼치기가 화면을 바꿈'); await page.close();
  }
  console.log(`PASS p0-1102: ${passed.length} checks`);
} finally { await browser.close(); server.close(); }
