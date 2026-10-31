import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{PB.App.startGame();PB.Session.beginPlan(PB.App.s);PB.Session.startRun(PB.App.s);PB.Session.finishRun(PB.App.s);PB.App.go('result');});
 assert.equal(await page.locator('#result-key-metrics').count(),1,'two core result metrics exist');
 assert.equal(await page.locator('#stage').isVisible(),false,'result is a full page');
 await page.locator('#btn-next-phase').click();assert.equal(await page.locator('body').getAttribute('data-screen'),'reflect');
 await page.locator('#reflection-answer').fill('외곽 마을에서 기다리는 사람도 살피겠다.');
 await page.reload();await page.locator('#btn-continue').click();assert.equal(await page.locator('#reflection-answer').inputValue(),'외곽 마을에서 기다리는 사람도 살피겠다.');
 assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);
 await page.locator('#reflection-next').click();assert.ok(await page.locator('#new-resources').isVisible());
 assert.match(await page.locator('#new-resources').innerText(),/버스 1대/);
 await page.locator('#btn-begin-plan').click();assert.equal(await page.locator('#panel').isVisible(),false);
 assert.equal(await page.evaluate(()=>PB.App.s.phase),2);assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);
 console.log('PASS: result → saved reflection → resources → next plan, no duplicate settlement');
}finally{await browser.close();server.close();}
