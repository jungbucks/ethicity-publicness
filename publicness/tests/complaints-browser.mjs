import {plannedTown,beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer(0);let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const mode of ['2d','3d']){
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install();
    await page.goto(`http://127.0.0.1:${server.address().port}/publicness/${mode==='2d'?'?no3d=1':''}`);
    await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);await plannedTown(page);
    await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+1000));await page.evaluate(()=>window.__pbFast=true);
    await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.locator('#speed-2').click();
    await page.clock.runFor(50);
    await page.locator('.bubble[data-kind="noLink"]').first().waitFor({timeout:15000});
    assert.ok((await page.locator('.bubble[data-kind="noLink"]').first().innerText()).includes('노선 없음'));
    await page.clock.runFor(60);
    const full=page.locator('.bubble[data-kind="full"]').first();await full.waitFor({timeout:20000});
    assert.ok(await full.evaluate(b=>PB.App.s.current.result.log.some(e=>e.type==='full'&&e.node===b.dataset.node&&b.textContent.includes(e.bus+'호차가 만차라 '+e.data.left+'명이 못 탔어요'))));
    assert.equal(await full.evaluate(b=>getComputedStyle(b).borderTopColor),'rgb(198, 40, 40)');
    assert.equal(await full.evaluate(b=>getComputedStyle(b).borderTopWidth),'2px');
    assert.equal(await page.locator('#panel #speed-2').count(),0);
    await page.setViewportSize({width:375,height:812});assert.ok(await page.locator('#run-controls').evaluate(n=>{const r=n.getBoundingClientRect();return r.right<=innerWidth&&r.left>=0&&r.top>=0;}));await page.screenshot({path:'publicness/tests/_shot-run-controls-phone.png'});await page.setViewportSize({width:1366,height:900});
    assert.ok(await page.locator('#stage-overlay .bubble').count()<=2);
    await page.screenshot({path:`publicness/tests/_shot-complaint-${mode}.png`});
    assert.deepEqual(errors,[]);console.log(`PASS ${mode}: no-route and exact full-bus complaint at correct stop, at most two bubbles, no errors`);
    await page.close();
  }
}finally{if(browser)await browser.close();server.close();}
