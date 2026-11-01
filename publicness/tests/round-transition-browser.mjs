// 단계 넘기기(2026-11-01): 결과 화면 ‘생각해 보기’에 쓴 글은 새로고침해도 남고, 다음 단계 버튼 한 번에 지도 계획(성찰·변화 화면 없음).
// 새 버스는 지도 배너(‘버스 +1’)와 대기 칸 반짝임으로 알리고, 정산은 한 번만
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{PB.App.startGame();PB.Session.beginPlan(PB.App.s);PB.Session.startRun(PB.App.s);PB.Session.finishRun(PB.App.s);PB.App.go('result');});
 assert.equal(await page.locator('#result-headline .result-stat').count(),2,'two core result metrics exist');
 assert.equal(await page.locator('#stage').isVisible(),false,'result is a full page');
 await page.locator('#reflection-answer').fill('외곽 마을에서 기다리는 사람도 살피겠다.');
 await page.reload();await page.locator('#btn-continue').click();assert.equal(await page.locator('#reflection-answer').inputValue(),'외곽 마을에서 기다리는 사람도 살피겠다.');
 assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);
 await page.locator('#btn-next-phase').click();await page.waitForFunction(()=>document.body.dataset.screen==='plan');
 assert.equal(await page.locator('#reflection-next, #new-resources, #btn-begin-plan').count(),0,'성찰·변화 화면 없음');
 assert.match(await page.locator('#map-banner').innerText(),/버스 \+1/);assert.ok(await page.locator('#bus-depot .depot-bus.is-new').count()>=1,'새 버스 반짝임');
 assert.equal(await page.locator('#panel').isVisible(),false);
 assert.equal(await page.evaluate(()=>PB.App.s.phase),2);assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);
 assert.equal(await page.evaluate(()=>PB.App.s.reflections[1]),'외곽 마을에서 기다리는 사람도 살피겠다.');
 console.log('PASS: result reflection saved across reload → one click to next plan (banner, new bus), no duplicate settlement');
}finally{await browser.close();server.close();}
