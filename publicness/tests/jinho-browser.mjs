// 2026-10-23 도전 모드 7단계 인물 진호(인플루언서, 신도시 → 솔잎몰 왕복) — 6단계 결과 뒤 소개 컷(Stage 7 카드 + 그림),
// 단계 안내 ‘새 인물’, 운행 중 버스 이름표 [진호], 결과 카드 초상, 학기 말 반응. 기본 모드에는 나오지 않는다. (헤드리스 Edge, 2D 지도)
import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const base=`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  assert.ok(!await page.evaluate(()=>PB.Session.create(PB.config).config.residents.some(r=>r.id==='jinho')),'기본 모드엔 없음');
  await page.goto(base+'&seed=42');await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();
  // 6단계 결과까지 시험 상태로(재정은 판정 밖으로 0 하한)
  await page.evaluate(()=>{const S=PB.Session,s=PB.App.s;for(let p=1;p<=6;p++){S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=Math.max(0,s.current.metrics.costs.total);S.finishRun(s);if(p<6)S.nextPhase(s);}PB.App.go('result');});
  await page.locator('#btn-next-phase').click();
  assert.equal(await page.locator('#goal-intro').getAttribute('data-stage'),'true');assert.match(await page.locator('#story-stage-sub').innerText(),/붐비는 도시 · 7 \/ 8/);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#goal-intro').getAttribute('data-scene'),'mall');assert.equal(await page.locator('#goal-intro-h').innerText(),'진호 · 인플루언서');
  await page.locator('#story-image').evaluate(i=>i.decode());assert.ok(await page.locator('#story-image').evaluate(i=>i.naturalWidth===1920&&/interlude-influencer\.webp$/.test(i.src)));
  await page.keyboard.press('Space');assert.match(await page.locator('#story-typed').innerText(),/솔잎몰 개장/);assert.equal(await page.locator('#story-next').innerText(),'솔잎몰 연결하기');
  await page.screenshot({path:'publicness/tests/_shot-jinho-cut.png'});
  await page.locator('#story-next').click();
  assert.match(await page.locator('#phase-changes').innerText(),/새 인물\s*진호 \(신도시 → 솔잎몰\)/);
  assert.match(await page.locator('#phase-changes').innerText(),/새로 생김\s*솔잎몰/);
  // 신도시–솔잎몰 왕복 노선에 버스 두 대 → 운행 중 [진호] 이름표, 결과 카드
  await beginPlan(page);
  await page.evaluate(()=>{const s=PB.App.s,S=PB.Session;const r=S.routeByNum(s,1);S.updateRoute(s,1,{nodes:['I','M'],stops:[true,true]});s.draft.buses.forEach(b=>b.routeNum=null);S.assign(s,1,1);S.assign(s,2,1);PB.App.render();window.__pbFast=true;});
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.rider-count')].some(e=>e.textContent.includes('[진호]')),null,{timeout:60000});
  await page.locator('#resident-summary').waitFor({timeout:90000});
  const card=page.locator('[data-resident="jinho"]');assert.equal(await card.count(),1);
  await card.locator('img').evaluate(i=>i.decode());assert.ok(await card.locator('img').evaluate(i=>i.naturalWidth===512&&/portrait-jinho-calm\.webp$/.test(i.src)));
  assert.match(await card.innerText(),/진호/);assert.equal(await page.evaluate(()=>PB.App.s.history.at(-1).residents.jinho.dayStatus),'complete');
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:'publicness/tests/_shot-jinho-result.png'});
  // 학기 말: 진호 반응(기준 1회 — 이번 완료로 충족)
  await page.evaluate(()=>{const S=PB.Session,s=PB.App.s;S.nextPhase(s);S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=Math.max(0,s.current.metrics.costs.total);S.finishRun(s);S.nextPhase(s);PB.App.go('ending');});
  const r=await page.evaluate(()=>PB.Narrative.endingReactions(PB.App.s.config,PB.App.s.history).find(x=>x.id==='jinho'));
  assert.equal(r.threshold,1);assert.equal(r.satisfied,true);assert.equal(r.image,'interlude-influencer.webp');
  assert.ok(await page.locator('.resident-card[data-id="jinho"]').count()===1,'엔딩 인물 카드');
  assert.deepEqual(errors,[]);console.log('PASS jinho: challenge-only, Stage 7 card + mall cut (image), new-person row, [진호] tag on bus, result portrait, ending reaction');
}finally{if(browser)await browser.close();server.close();}
