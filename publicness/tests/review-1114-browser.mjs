// 2026-11-14 검토 지적 1·3·4번을 실제 화면에서 본다(2번 값·표는 단위 검사와 README).
//  A. 컷신 그림 404: 첫 컷 그림(intro-haneul.webp)만 막고 새 게임 → 반복 요청 없음(assets/art/1 요청 0), 그 컷은 그림 자리만 비고 대사·버튼은 그대로, 다음 컷 그림은 보임.
//     예비 그림까지 404(interlude-cheer + intro-village): 요청이 늘지 않고 끝까지 넘어가며, 그 뒤 다른 컷 그림은 보임.
//  B. 예전 버전(pb-3.1.0 · 랜덤 지원금 5,000원) 저장본 = 8단계 결과 화면, 누적 잔액이 처음 마이너스(−18,541원, 검토 재현 계획):
//     이어하기에 뜨고(버전을 올려도 하던 판 유지) 그 판의 지원금 그대로 → 결과 알림·엔딩 제목·총평·재정 돌아보기·보고서 머리줄·금배지가 모두 ‘파산’.
//  C. 지난번 비교: 같은 세팅 번호의 예전 키 기록(재정 값이 다른 판)과는 비교하지 않고, 같은 재정 값의 기록과만 비교.
// 화면 1280×800, 스크린샷 = SHOT_DIR(기본 publicness/tests)/_shot-r1114-*.png
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/review-1114-browser.mjs   (브라우저는 한 번에 하나: D:/Works/.browser-test.lock)
import { createRequire } from 'node:module'; import assert from 'node:assert/strict'; import { startServer } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), server = await startServer(0);
const cfg = require('../js/config.js'), S = require('../js/session.js'), T = require('../tools/random-finance-1112.cjs'), RC = require('../js/run-compare.js');
const SEED = 245525538, root = `http://127.0.0.1:${server.address().port}/publicness/`, SHOT = process.env.SHOT_DIR || 'publicness/tests', shot = (n) => `${SHOT}/_shot-r1114-${n}.png`;
const log = (m) => console.log('  ok ' + m), copy = (o) => JSON.parse(JSON.stringify(o));

// B용 저장본: 5,000원 시절 설정으로 무난한 계획 + 6~8단계 2대 임차, 8단계 결과 화면(아직 엔딩 전)
const keep = cfg.challenge.finance; cfg.challenge.finance = { basePerBus: 5000 };
const old = S.create(cfg, { mode: 'fixed', seed: SEED });
for (;;) { T.lay(old, T.moderate(old), old.phase >= 6 ? 2 : 0); T.answer(old); S.startRun(old); S.finishRun(old); if (old.phase >= 8) break; S.nextPhase(old); }
cfg.challenge.finance = keep;
assert.deepEqual([old.stage, old.phase, old.end, Math.round(S.balance(old)), old.negStreak], ['result', 8, null, -18541, 1]);
const oldSession = copy(S.serialize(old)); oldSession.config.SCENARIO_VERSION = 'pb-3.1.0';
const SAVED_OLD = { version: 'pb-3.1.0', savedAt: Date.now(), session: oldSession };
// C용 저장본: 지금 버전 · 지금 지원금, 1단계 결과 화면
const cur = S.create(cfg, { mode: 'fixed', seed: SEED }); T.lay(cur, T.moderate(cur), 0); T.answer(cur); S.startRun(cur); S.finishRun(cur);
const SAVED_NEW = { version: cfg.SCENARIO_VERSION, savedAt: Date.now(), session: copy(S.serialize(cur)) };
const KEY_NEW = RC.scenarioKey(cur, cur.config.SCENARIO_VERSION); assert.equal(KEY_NEW, `fixed|${SEED}|pb-3.2.0|b8000`);
const prevSum = Object.assign(RC.summary(cur.history[0], cur.draft), { total: 8202 }); // 다른 판의 같은 계획·다른 수지
const runs = (key) => JSON.stringify({ v: 1, runs: [{ key, phase: 1, runId: 'other-game', at: 1, sum: prevSum }] });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function newPage(block) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), reqs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { const m = r.url().match(/\/assets\/art\/([^?]*)/); if (m) reqs.push(m[1]); });
  if (block) await page.route(block, (route) => route.fulfill({ status: 404, body: 'not found' }));
  return { page, reqs };
}
const img = (page) => page.evaluate(() => { const i = document.querySelector('#story-image'), c = getComputedStyle(i); return { head: document.querySelector('#goal-intro-h').textContent, src: i.getAttribute('src'), hidden: i.hidden, display: c.display, visibility: c.visibility, missing: i.classList.contains('is-missing'), natural: i.naturalWidth, alt: i.alt, mark: i.dataset.fallback || null }; });
async function nextCut(page, from) { for (let k = 0; k < 6; k++) { if (!(await page.locator('#goal-intro').evaluate((d) => d.open)) || (await page.locator('#goal-intro-h').textContent()) !== from) return; await page.locator('#story-next').click(); await page.waitForTimeout(120); } }

try {
  // ── A-1. 첫 컷 그림만 404 ──
  {
    const { page, reqs } = await newPage(/intro-haneul\.webp$/);
    await page.goto(root + '?no3d=1'); await page.locator('#btn-start').click();
    await page.locator('#goal-intro[open]').waitFor(); await page.waitForTimeout(1500);
    const n1 = reqs.length, c1 = await img(page);
    await page.waitForTimeout(1500);
    const tries = reqs.filter((u) => /intro-haneul/.test(u)).length;
    assert.equal(reqs.length, n1, '그림 요청이 더 늘지 않는다(전: 3초에 344번)'); assert.ok(tries <= 3, '없는 그림 요청 ' + tries + '번(컷 그림 1 + 미리 받기)');
    assert.deepEqual(reqs.filter((u) => !/\.(webp|png)$/.test(u)), [], 'assets/art/1 같은 엉뚱한 요청 없음');
    assert.deepEqual([c1.head, c1.src, c1.missing, c1.visibility, c1.hidden, c1.mark], ['하늘', 'assets/art/intro-haneul.webp', true, 'hidden', false, null]); assert.notEqual(c1.display, 'none');
    assert.equal(c1.alt, '일러스트를 불러오지 못했어요. 대사를 읽고 계속할 수 있습니다.');
    assert.ok(await page.locator('#goal-intro-text').isVisible() && await page.locator('#story-next').isVisible(), '대사와 다음 버튼은 보인다');
    await page.screenshot({ path: shot('cut-missing') });
    await nextCut(page, '하늘'); await page.waitForTimeout(900);
    const c2 = await img(page);
    assert.deepEqual([c2.head, c2.src, c2.missing, c2.visibility, c2.hidden], ['나래', 'assets/art/intro-narae.webp', false, 'visible', false]); assert.ok(c2.natural > 0, '다음 컷 그림이 보인다'); assert.notEqual(c2.display, 'none');
    await page.screenshot({ path: shot('cut-next') });
    assert.deepEqual(await page.evaluate(() => PB.ImgFallback.missing.slice()), ['assets/art/intro-haneul.webp']);
    log('A-1 첫 컷 그림 404: 요청 ' + n1 + '번에서 멈춤 · 그 컷은 그림 자리만 비움 · 다음 컷(나래) 그림 보임');
    await page.close();
  }
  // ── A-2. 예비 그림까지 404 ──
  {
    const { page, reqs } = await newPage(/(interlude-cheer|intro-village)\.webp$/);
    await page.goto(root + '?no3d=1'); await page.waitForFunction(() => window.PB && PB.Cutscene && PB.App && PB.App.ready);
    await page.evaluate(() => { window.__done = 0; PB.Cutscene.play('baseball', () => { window.__done++; }); });
    await page.waitForTimeout(1500); const n1 = reqs.filter((u) => /cheer|village/.test(u)).length, c1 = await img(page);
    await page.waitForTimeout(1000);
    assert.equal(reqs.filter((u) => /cheer|village/.test(u)).length, n1, '요청이 늘지 않는다'); assert.ok(n1 <= 6, '요청 수 ' + n1);
    assert.deepEqual(reqs.filter((u) => !/\.(webp|png)$/.test(u)), []);
    assert.deepEqual([c1.head, c1.src, c1.missing, c1.visibility], ['유나 · 치어리더', 'assets/art/intro-village.webp', true, 'hidden']);
    await nextCut(page, '유나 · 치어리더'); assert.equal(await page.locator('#goal-intro-h').textContent(), '다은 · 야구 팬');
    await nextCut(page, '다은 · 야구 팬'); await page.waitForFunction(() => window.__done === 1); assert.equal(await page.locator('#goal-intro').evaluate((d) => d.open), false);
    await page.evaluate(() => PB.Cutscene.play('sol', () => {})); await page.waitForTimeout(1500);
    const c3 = await img(page); assert.deepEqual([c3.src, c3.missing, c3.visibility], ['assets/art/interlude-sol.webp', false, 'visible']); assert.ok(c3.natural > 0);
    log('A-2 예비 그림까지 404: 요청 ' + n1 + '번에서 멈춤 · 대사 읽고 끝까지 넘어감 · 그 뒤 솔 컷 그림 보임');
    await page.close();
  }
  // ── B. 예전 버전 저장본 이어하기 → 마지막 단계 첫 마이너스 = 파산 ──
  {
    const { page } = await newPage();
    await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ethicity.publicness.save', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVED_OLD));
    await page.goto(root + `?seed=${SEED}&no3d=1`);
    assert.ok(await page.locator('#btn-continue').isVisible(), '버전이 올라가도 pb-3.1.0 저장본은 이어하기에 뜬다');
    assert.equal(await page.locator('#title-version').innerText(), '버전 pb-3.2.0');
    assert.match(await page.locator('#continue-note').innerText(), /8 \/ 8단계 결과/);
    await page.locator('#btn-continue').click(); await page.locator('#finance-status').waitFor();
    const st = await page.evaluate(() => ({ base: PB.App.s.config.finance.basePerBus, v: PB.App.s.config.SCENARIO_VERSION, bal: Math.round(PB.Session.balance(PB.App.s)), saved: JSON.parse(localStorage.getItem('ethicity.publicness.save')).version, rule: PB.App.financeRuleText(PB.App.s) }));
    assert.deepEqual([st.base, st.v, st.bal, st.saved], [5000, 'pb-3.1.0', -18541, 'pb-3.1.0'], '그 판의 지원금·버전 그대로(다시 저장해도)');
    assert.match(st.rule, /마지막 단계가 끝난 뒤 누적 잔액이 0원 미만이어도 파산으로 끝나요\.$/);
    const fin = await page.locator('#finance-status').innerText();
    assert.match(fin, /누적 잔액 −18,541원 — 마지막 단계를 0원 미만으로 마쳐서 파산으로 끝나요\. 이번 단계 결과와 정산을 확인한 뒤 종료 화면으로 넘어가요\./); assert.doesNotMatch(fin, /다음 단계를 마칠 때도/);
    await page.locator('#finance-status').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('result8-bankrupt') });
    assert.equal(await page.locator('#btn-next-phase').innerText(), '학기 마무리 보기'); await page.locator('#btn-next-phase').click(); await page.locator('#ending-title').waitFor();
    const got = await page.evaluate(() => { const T = (q) => document.querySelector(q).textContent; return { title: T('#ending-title'), verdict: T('#ending-verdict'), profit: T('#ending-profit'), cause: T('#failure-cause'), seed: T('#end-seed'), eyebrow: T('#panel .eyebrow'), end: PB.App.s.end.cause }; });
    assert.equal(got.end, 'bankrupt'); assert.equal(got.eyebrow, '운영 종료'); assert.equal(got.title, '파산 — 학기 말 잔액이 0원 미만이에요');
    assert.match(got.verdict, /학기 말 잔액이 −18,541원이라 파산했어요\. 주민의 이동은 지키면서 운영 비용을 다시 설계해 봐요\.$/); assert.doesNotMatch(got.verdict, /나름 잘 설계했어요/);
    assert.match(got.profit, /^보유 잔액 −18,541원 · /);
    assert.match(got.cause, /^마지막 단계까지 운행했지만 학기 말 보유 잔액이 −18,541원이에요\. 학기 말 잔액이 0원 미만이면 파산으로 끝나요\./); assert.doesNotMatch(got.cause, /기본 모드는/);
    assert.ok(got.seed.endsWith('시나리오 pb-3.1.0'), got.seed);
    await page.locator('#ending-title').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('ending-bankrupt') });
    await page.locator('#btn-report').click(); await page.waitForFunction(() => document.body.classList.contains('report-open'));
    const rep = await page.evaluate(() => ({ text: document.querySelector('#panel').innerText, solvent: document.querySelector('[data-badge=solvent] .badge-state').textContent }));
    assert.match(rep.text, /파산 — 학기 말 잔액이 0원 미만이에요 · 누적 잔액 −18,541원/); assert.doesNotMatch(rep.text, /한 학기 운행을 마쳤어요/); assert.equal(rep.solvent, '아직');
    await page.locator('#report-badges').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('report-bankrupt') });
    // 새로고침: 첫 화면 이어하기 안내도 파산
    await page.reload(); assert.match(await page.locator('#continue-note').innerText(), /파산으로 운영 종료/);
    log('B 예전 버전(pb-3.1.0 · 5,000원) 저장본 이어하기 → 8단계 −18,541원: 결과 알림·제목·총평·재정 돌아보기·보고서·금배지 모두 파산, 엔딩 버전 pb-3.1.0');
    await page.close();
  }
  // ── C. 지난번 비교: 재정 값이 다른 판의 기록과 섞지 않는다 ──
  for (const [key, expectShown] of [[`fixed|${SEED}|pb-3.1.0`, false], [`fixed|${SEED}|pb-3.1.0|b5000`, false], [KEY_NEW, true]]) {
    const { page } = await newPage();
    await page.addInitScript(([s, r]) => { localStorage.setItem('ethicity.publicness.save', s); localStorage.setItem('ethicity.publicness.stageRuns', r); }, [JSON.stringify(SAVED_NEW), runs(key)]);
    await page.goto(root + `?seed=${SEED}&no3d=1`); await page.locator('#btn-continue').click(); await page.locator('#btn-next-phase').waitFor();
    const shown = await page.locator('#result-rerun').count();
    assert.equal(shown, expectShown ? 1 : 0, key);
    if (expectShown) { const t = await page.locator('#result-rerun').innerText(); assert.match(t, /지난번 같은 단계와 비교: 이번 단계 수지 \+8,202원 → \+4,202원/); assert.match(t, /계획은 지난번과 같아요\./); }
    await page.close();
  }
  log('C 지난번 비교: 예전 키·다른 지원금 기록은 안 나오고, 같은 버전·같은 지원금 기록과만 비교');
  assert.deepEqual(errors, []);
  console.log('PASS review-1114-browser');
} catch (e) { console.error('FAIL', e); process.exitCode = 1; }
finally { await browser.close(); server.close(); }
