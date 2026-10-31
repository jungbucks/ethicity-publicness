import {plannedTown,beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:800,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/${mode==='2d'?'?no3d=1':''}`);
  await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);await plannedTown(page);
  const stage=await page.locator('#stage').boundingBox();const order=await page.locator('.stop-order').boundingBox();assert.ok(stage.y+stage.height<order.y&&order.y<1000,'map and order visible together');
  await page.screenshot({path:`publicness/tests/_shot-usability-tablet-${mode}.png`});
  await page.locator('#btn-new-route').click();for(const id of ['F','C','D']){await page.locator('#stop-picker').evaluate(n=>n.open=true);await page.locator('.next-stop[data-node="'+id+'"]').click();}
  assert.ok((await page.locator('#route-allocation').innerText()).includes('운행 버스 없음'));
  await page.locator('#btn-depart').click();assert.match(await page.locator('#confirm-depart-body').innerText(),/4번 · .*버스 없음 — 운행하지 않아요/);await page.locator('#confirm-no').click();
  await page.locator('#assign-route-1').click();assert.equal(await page.evaluate(()=>PB.App.s.draft.buses[0].routeNum),4);
  assert.ok((await page.locator('#route-allocation').innerText()).includes('운행 버스: 1호차'));
  assert.ok((await page.locator('#unassigned-warning').innerText()).includes('1번'));
  const fixedStage=await page.locator('#stage').boundingBox();assert.equal(Math.round(stage.y),Math.round(fixedStage.y),'editor scrolling keeps map fixed');
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.evaluate(()=>window.__pbFast=true);await page.locator('#resident-summary').waitFor();
  const reason=page.locator('.reason-location').first();const origin=await reason.getAttribute('data-origin');await reason.click();
  assert.equal(await page.locator('#stage').getAttribute('data-reason-origin'),origin);assert.ok((await page.locator('#reason-focus').innerText()).includes('출발 정류장'));
  await page.screenshot({path:`publicness/tests/_shot-usability-result-${mode}.png`});
  assert.deepEqual(errors,[]);console.log('PASS '+mode+': unassigned warning, assignment transfer, tablet fixed map, result reason selection');await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
