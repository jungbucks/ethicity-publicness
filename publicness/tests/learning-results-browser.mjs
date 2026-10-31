import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?seed=42${mode==='2d'?'&no3d=1':''}`);
  await page.locator('#btn-start').click();
  async function scenes(){while(await page.locator('#goal-intro').evaluate(d=>d.open)){assert.equal(await page.locator('#learning-dialog:modal').count(),0);if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}}
  await scenes();
  for(let phase=1;phase<=7;phase++){
   // ‘잠깐 생각해 보기’는 단계 안내 안의 #learning(별도 창 없음)
   {await page.locator('#learning').waitFor();assert.equal(await page.locator('#learning-dialog:modal').count(),0);assert.equal(await page.locator('#learning').getAttribute('data-phase'),String(phase));assert.match(await page.locator('.learning-question').innerText(),/\?/);assert.equal(await page.locator('.learning-source').first().getAttribute('target'),'_blank');
    if([1,6,7].includes(phase)){await page.screenshot({path:`publicness/tests/_shot-learning-${phase}-${mode}.png`});await page.setViewportSize({width:375,height:812});assert.ok(await page.locator('#learning').evaluate(d=>d.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:`publicness/tests/_shot-learning-phone-${phase}-${mode}.png`});await page.setViewportSize({width:1366,height:900});}
    if(phase===6){assert.match(await page.locator('.learning-subtitle').innerText(),/자동화 사례/);assert.equal(await page.locator('.learning-source').count(),2);}
    if(phase===7)assert.match(await page.locator('.learning-case').innerText(),/AI만의 사용량은 아니에요/);
   }
   await beginPlan(page);
   // Run the real engine synchronously; only playback is skipped in this UI probe.
   await page.evaluate(()=>{const s=PB.App.s,S=PB.Session;for(const r of s.draft.routes){const nodes=r.num===1?['F','D']:['B','C','A','G'];S.updateRoute(s,r.num,{nodes:r.num===5?['B','L']:nodes,stops:(r.num===5?['B','L']:nodes).map(()=>true)});}s.draft.buses.forEach(b=>{if(b.routeNum==null)S.assign(s,b.id,1);});S.startRun(s);s.current.metrics.costs.total=Math.max(0,s.current.metrics.costs.total);/* 이 설계는 5단계 적자 누적 계약 종료 — 재정은 finance-browser에서 */S.finishRun(s);PB.App.go('result');});
   const card=page.locator('[data-resident="narae"] .resident-card'),head=card.locator(':scope > summary');
   assert.ok(!/\d\d:\d\d/.test(await head.innerText()));
   await head.hover();assert.ok(await card.evaluate(d=>d.open));await page.mouse.move(5,5);assert.ok(!await card.evaluate(d=>d.open));
   await head.focus();await page.keyboard.press('Enter');assert.ok(await card.evaluate(d=>d.open));assert.equal(await card.locator('.journey-leg').count(),2);assert.ok(!await card.locator('.resident-times').evaluate(d=>d.open));await page.keyboard.press('Escape');assert.ok(!await card.evaluate(d=>d.open));
   if(phase===4){await page.locator('#resident-day-results').scrollIntoViewIfNeeded();await page.locator('#resident-day-results img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));assert.equal(await page.locator('.resident-face').count(),6);await page.screenshot({path:`publicness/tests/_shot-resident-faces-${mode}.png`});}
   if(phase<7){await page.locator('#btn-next-phase').click();await scenes();}
  }
  assert.deepEqual(errors,[]);console.log('PASS '+mode+': inline learning phases 1–7, six faces, hover, keyboard, detailed trips');await page.close();
 }
 const ctx=await browser.newContext({viewport:{width:375,height:812},hasTouch:true}),p=await ctx.newPage();await p.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await p.evaluate(()=>PB.App.startGame());await beginPlan(p,'tap');
 await p.evaluate(()=>{const s=PB.App.s,S=PB.Session;s.draft.buses.forEach(b=>b.routeNum=null);S.startRun(s);S.finishRun(s);PB.App.go('result');});
 const c=p.locator('[data-resident="haneul"] .resident-card');await c.locator(':scope > summary').tap();assert.ok(await c.evaluate(d=>d.open));assert.match(await c.innerText(),/아직 시작하지 못함/);await p.screenshot({path:'publicness/tests/_shot-resident-phone.png'});await c.locator(':scope > summary').tap();assert.ok(!await c.evaluate(d=>d.open));console.log('PASS touch: tap expands/collapses, no-link explanation, phone layout');await ctx.close();
}finally{if(browser)await browser.close();server.close();}
