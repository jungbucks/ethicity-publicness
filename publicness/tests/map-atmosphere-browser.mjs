import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/publicness/?${mode==='2d'?'no3d=1':''}`;
  async function start(){await page.locator('#btn-start').click();if(await page.locator('#confirm-restart').evaluate(d=>d.open))await page.locator('#restart-yes').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);}
  await page.goto(url);await start();assert.equal(await page.evaluate(()=>PB.App.view.kind),mode);
  if(mode==='2d')assert.equal(await page.locator('.layer-terrain polyline').count(),3);
  for(const [t,time,light,sun] of [[0,'05:00','dawn',false],[60,'14:00','day',true],[100,'20:00','night',false],[120,'23:00','night',false]]){
   await page.evaluate(t=>PB.App.updateClock(t),t);
   assert.equal(await page.locator('#top-clock').innerText(),time);assert.equal(await page.locator('#map-clock').getAttribute('data-daylight'),light);
   assert.equal(await page.locator('#clock-sun').evaluate(e=>getComputedStyle(e).display!=='none'),sun);
  }
  await page.evaluate(()=>PB.App.updateClock(60));await page.screenshot({path:`publicness/tests/_shot-atmosphere-${mode}.png`});
  await page.setViewportSize({width:375,height:812});
  const b=await page.locator('#map-clock').boundingBox(),stage=await page.locator('#stage').boundingBox();assert.ok(b.x>=stage.x&&b.x+b.width<=stage.x+stage.width);
  await page.screenshot({path:`publicness/tests/_shot-atmosphere-phone-${mode}.png`});
  if(mode==='2d'){await page.goto(url);await page.locator('input[value=random]').check();await start();assert.equal(await page.locator('.layer-terrain polyline').count(),0);}
  assert.deepEqual(errors,[]);console.log('PASS '+mode+': map clock placement, moon/sun/moon, 05–23h, phone bounds'+(mode==='2d'?', fixed-only river':''));await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
