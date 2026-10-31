import {beginPlan} from './browser-fixture.mjs';
// 단계 전환(2026-10-23 플레이테스트): Stage 카드는 새 인물이 등장하는 단계(3단계 솔·4단계 유나·다은) 소개 앞에서만.
// 1단계는 캐릭터 소개 뒤 바로 단계 안내, ‘잠깐 생각해 보기’는 별도 창이 아니라 단계 안내 안에 있다. 카드는 키·클릭·타이머로 넘어가고 건너뛰기 글자가 없다.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const url=q=>`http://127.0.0.1:${server.address().port}/publicness/?no3d=1${q||''}`;
async function card(page,title,sub){
 await page.locator('#goal-intro[data-stage="true"]').waitFor();
 assert.equal(await page.locator('#story-stage-title').textContent(),title);assert.equal(await page.locator('#story-stage-sub').textContent(),sub);
 assert.ok(await page.locator('#story-stage-title').isVisible());assert.ok(!await page.locator('#btn-goal-start').isVisible());assert.ok(!await page.locator('#story-next').isVisible());
 assert.equal(await page.locator('#goal-intro').evaluate(d=>getComputedStyle(d,'::backdrop').backgroundColor),'rgba(0, 0, 0, 0.78)');
}
async function playPhase(page){
 await beginPlan(page);
 await page.evaluate(()=>{const s=PB.App.s,S=PB.Session,paths=[['F','C','D','A'],['B','A','G','E'],['H','A','D'],['I','A']];for(const r of s.draft.routes){const n=paths[r.num-1].filter(x=>S.graph(s).has(x));S.updateRoute(s,r.num,{nodes:n,stops:n.map(()=>true)});}s.draft.buses.forEach(b=>{if(b.routeNum==null)S.assign(s,b.id,1);});PB.App.render();});
 await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.locator('#resident-summary').waitFor({timeout:60000});
 assert.equal(await page.locator('dialog#route-report').count(),0,'효율 표는 결과 화면 안에(자동 팝업 없음)');assert.ok(await page.locator('section#route-report').isVisible());
 await page.locator('#btn-next-phase').click();
}
async function learningInline(page,phase){
 await page.locator('#btn-begin-plan').waitFor();
 assert.equal(await page.locator('#learning-dialog:modal').count(),0,'생각해 보기 별도 창 없음');
 assert.equal(await page.locator('#learning').getAttribute('data-phase'),String(phase));
 assert.ok((await page.locator('#learning .learning-question').innerText()).length>10);
}
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url());await page.locator('#btn-start').click();
 // 소개 컷 → 카드 없이 바로 1단계 안내(생각해 보기 포함)
 assert.equal(await page.locator('#goal-intro').getAttribute('data-stage'),'false');assert.equal(await page.locator('#goal-intro-h').textContent(),'하늘');
 assert.equal(await page.locator('#story-count').textContent(),'1 / 4');assert.equal(await page.locator('body').getAttribute('data-screen'),'title');await page.locator('#btn-goal-start').click();
 await learningInline(page,1);assert.equal(await page.locator('#goal-intro').evaluate(d=>d.open),false);assert.equal(await page.evaluate(()=>PB.App.s.phase),1);
 await page.evaluate(()=>window.__pbFast=true);
 // 2단계: 새 인물이 없어 카드 없이 바로 안내
 await playPhase(page);await learningInline(page,2);assert.equal(await page.locator('#goal-intro').evaluate(d=>d.open),false);assert.equal(await page.evaluate(()=>PB.App.s.phase),2);
 // 3단계: 카드 → 클릭 → 솔
 await playPhase(page);await card(page,'Stage 3','변화기 · 3 / 5');await page.locator('#story-stage').click();
 assert.equal(await page.locator('#goal-intro').getAttribute('data-stage'),'false');assert.equal(await page.locator('#goal-intro-h').textContent(),'솔');
 assert.equal(await page.locator('#goal-intro').getAttribute('aria-labelledby'),'goal-intro-h');await page.locator('#btn-goal-start').click();await learningInline(page,3);
 // 4단계: 카드 → Escape → 유나(컷은 건너뛰지 않음)
 await playPhase(page);await card(page,'Stage 4','조정기 · 4 / 5');await page.keyboard.press('Escape');
 assert.ok(await page.locator('#goal-intro').evaluate(d=>d.open));assert.match(await page.locator('#goal-intro-h').textContent(),/유나/);await page.locator('#btn-goal-start').click();await learningInline(page,4);
 // 5단계: 카드 없음
 await playPhase(page);await learningInline(page,5);assert.equal(await page.locator('#goal-intro').evaluate(d=>d.open),false);
 // 결말: 카드 없이 결말 컷
 await playPhase(page);await page.locator('#goal-intro[open]').waitFor();
 assert.equal(await page.locator('#goal-intro').getAttribute('data-scene'),'ending');assert.equal(await page.locator('#goal-intro').getAttribute('data-stage'),'false');
 assert.deepEqual(errors,[]);await page.close();
 // 랜덤 8단계·폰 폭: 1단계는 카드 없이 안내, 줄인 움직임에서도 깨지지 않음
 const r=await browser.newPage({viewport:{width:375,height:812}});
 await r.goto(url());await r.evaluate(()=>{PB.App.motion=true;});await r.locator('input[name=setting][value=random]').check();await r.locator('#btn-start').click();await r.locator('#btn-goal-start').click();
 await learningInline(r,1);assert.equal(await r.evaluate(()=>PB.App.s.config.phases.length),8);
 assert.ok(await r.evaluate(()=>document.documentElement.scrollWidth<=375));await r.screenshot({path:'publicness/tests/_shot-stage-375.png'});
 await r.close();
 console.log('PASS stage flow: no standalone stage card or learning modal, card only before Sol/Yuna cuts (click/Escape), inline learning every phase, route report inline, ending without card, random 8 phases at 375px');
}finally{if(browser)await browser.close();server.close();}
