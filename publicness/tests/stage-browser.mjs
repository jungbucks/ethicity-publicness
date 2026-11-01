import {beginPlan} from './browser-fixture.mjs';
// 단계 전환(2026-11-01 단계 전 설명을 결과 화면으로): 따로 넘기는 Stage 카드·단계 안내·성찰 화면 없음.
// 새 인물이 오는 단계(3단계 솔·4단계 유나·다은)만 컷 한 장 — 머리에 ‘N단계 · 이름’, 건너뛰기 가능. 그 밖의 단계는 결과에서 바로 지도 계획.
// ‘생각해 보기’ 사례 카드는 별도 창이 아니라 그 단계 결과 화면 안(#result-think #learning)에 있다. 결말은 카드 없이 결말 컷.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const url=q=>`http://127.0.0.1:${server.address().port}/publicness/?no3d=1${q||''}`;
async function phaseCut(page,head,name){
 await page.locator('#goal-intro[open][data-stage="false"]').waitFor();
 assert.equal(await page.locator('#story-phase').textContent(),head);assert.ok(await page.locator('#story-phase').isVisible());
 assert.match(await page.locator('#goal-intro-h').textContent(),name);assert.ok(await page.locator('#btn-goal-start').isVisible(),'건너뛰기 가능');assert.ok(!await page.locator('#story-stage').isVisible(),'따로 넘기는 카드 없음');
 assert.ok(await page.locator('#story-count').isHidden(),'한 장이면 ‘1 / 1’ 없음');
}
async function playPhase(page,phase){
 await beginPlan(page);
 await page.evaluate(()=>{const s=PB.App.s,S=PB.Session,paths=[['F','C','D','A'],['B','A','G','E'],['H','A','D'],['I','A']];for(const r of s.draft.routes){const n=paths[r.num-1].filter(x=>S.graph(s).has(x));S.updateRoute(s,r.num,{nodes:n,stops:n.map(()=>true)});}s.draft.buses.forEach(b=>{if(b.routeNum==null)S.assign(s,b.id,1);});PB.App.render();});
 await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
 /* 운행은 끝까지 건너뛰기(남은 긴급 조정 기회는 ‘변경 없이 계속’) */await page.locator('#run-skip').click();if(await page.locator('#confirm-skip[open]').count())await page.locator('#skip-yes').click();await page.locator('#resident-summary').waitFor({state:'attached',timeout:60000});
 assert.equal(await page.locator('dialog#route-report').count(),0,'효율 표는 결과 화면 안에(자동 팝업 없음)');assert.equal(await page.locator('section#route-report').count(),1);
 assert.equal(await page.locator('#learning-dialog:modal').count(),0,'생각해 보기 별도 창 없음');
 assert.equal(await page.locator('#result-think #learning').getAttribute('data-phase'),String(phase));assert.ok((await page.locator('#learning .learning-question').innerText()).length>10);
 await page.locator('#btn-next-phase').click();
}
const planNow=async page=>{await page.waitForFunction(()=>document.body.dataset.screen==='plan');assert.equal(await page.locator('#goal-intro').evaluate(d=>d.open),false);};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url());await page.locator('#btn-start').click();
 // 소개 컷 → 카드·안내 없이 바로 1단계 지도 계획(코치 말풍선)
 assert.equal(await page.locator('#goal-intro').getAttribute('data-stage'),'false');assert.equal(await page.locator('#goal-intro-h').textContent(),'하늘');
 assert.equal(await page.locator('#story-count').textContent(),'1 / 4');assert.equal(await page.locator('body').getAttribute('data-screen'),'title');await page.locator('#btn-goal-start').click();
 await planNow(page);await page.locator('#first-coach').waitFor();assert.equal(await page.evaluate(()=>PB.App.s.phase),1);
 await page.evaluate(()=>window.__pbFast=true);
 // 1 → 2단계: 새 인물이 없어 컷 없이 바로 지도
 await playPhase(page,1);await planNow(page);assert.equal(await page.evaluate(()=>PB.App.s.phase),2);
 // 2 → 3단계: 컷 한 장(머리 ‘3단계 · 변화기’) → 클릭 → 지도
 await playPhase(page,2);await phaseCut(page,'3단계 · 변화기',/^솔$/);assert.equal(await page.locator('#goal-intro').getAttribute('aria-labelledby'),'goal-intro-h');
 await page.locator('#story-next').click();await planNow(page);
 // 3 → 4단계: 컷 한 장(유나 · 다은) → Escape(건너뛰기) → 지도
 await playPhase(page,3);await phaseCut(page,'4단계 · 조정기',/유나 · 다은/);await page.keyboard.press('Escape');await planNow(page);
 // 4 → 5단계: 컷 없음
 await playPhase(page,4);await planNow(page);
 // 결말: 카드 없이 결말 컷
 await playPhase(page,5);await page.locator('#goal-intro[open]').waitFor();
 assert.equal(await page.locator('#goal-intro').getAttribute('data-scene'),'ending');assert.equal(await page.locator('#goal-intro').getAttribute('data-stage'),'false');assert.ok(await page.locator('#story-phase').isHidden());
 assert.deepEqual(errors,[]);await page.close();
 // 랜덤 8단계·폰 폭: 1단계는 카드 없이 지도, 줄인 움직임에서도 깨지지 않음
 const r=await browser.newPage({viewport:{width:375,height:812}});
 await r.goto(url());await r.evaluate(()=>{PB.App.motion=true;});await r.locator('input[name=setting][value=random]').check();await r.locator('#btn-start').click();await r.locator('#btn-goal-start').click();
 await planNow(r);assert.equal(await r.evaluate(()=>PB.App.s.config.phases.length),8);
 assert.ok(await r.evaluate(()=>document.documentElement.scrollWidth<=375));await r.screenshot({path:'publicness/tests/_shot-stage-375.png'});
 await r.close();
 console.log('PASS stage flow: no separate stage card / guide / reflection, one cut with phase head before Sol·Yuna·Daeun (click/Escape), learning on every result, route report inline, ending without card, random 8 phases at 375px');
}finally{if(browser)await browser.close();server.close();}
