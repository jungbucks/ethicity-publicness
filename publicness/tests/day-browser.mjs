import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-19T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T00:00:01Z'));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?${mode==='2d'?'no3d=1':''}`);
  await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
  await page.locator('#day-agenda').evaluate(n=>n.open=true);assert.match(await page.locator('#day-agenda').innerText(),/나래.*병원/);
  await page.evaluate(()=>{const s=PB.App.s,S=PB.Session;S.updateRoute(s,1,{nodes:['F','D'],stops:[true,true]});S.updateRoute(s,2,{nodes:['B','C','A','G'],stops:[true,true,true,true]});S.assign(s,1,1);S.assign(s,2,2);PB.App.render();});
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.clock.runFor(1100);
  assert.match(await page.locator('#top-clock').innerText(),/^05:09/);
  await page.locator('#speed-2').click();await page.clock.runFor(1000);assert.match(await page.locator('#top-clock').innerText(),/^05:27/);
  assert.equal(await page.locator('#panel #speed-2').count(),0);assert.equal(await page.locator('#stage #speed-2').count(),1);
  await page.locator('#run-pause').click();const frozen=await page.locator('#top-clock').innerText();await page.clock.runFor(5000);assert.equal(await page.locator('#top-clock').innerText(),frozen);assert.match(await page.locator('#run-pause').innerText(),/재개/);
  await page.locator('#run-pause').click();assert.equal(await page.locator('#speed-2').getAttribute('aria-pressed'),'true');await page.clock.runFor(1000);assert.notEqual(await page.locator('#top-clock').innerText(),frozen);
  // Advance a compressed day with the existing test-only playback hook.
  await page.evaluate(()=>window.__pbFast=true);await page.clock.runFor(1200);await page.locator('#resident-day-results').waitFor();
  assert.equal(await page.locator('#resident-day-results li').count(),3);assert.match(await page.locator('#resident-day-results [data-resident=narae]').innerText(),/왕복 완료/);
  assert.ok(await page.evaluate(()=>PB.App.s.current.result.passengers.filter(p=>p.leg==='return').every(p=>{const out=PB.App.s.current.result.passengers.find(q=>q.residentId===p.residentId&&q.leg==='outbound');return out.status==='arrived'&&p.t>=out.arriveT+out.returnTrip.stay;})));
  await page.screenshot({path:`publicness/tests/_shot-day-results-${mode}.png`});
  assert.deepEqual(errors,[]);console.log('PASS '+mode+': 05:00 clock, 1x/2x elapsed rate, agenda, conditional return, resident round-trip results');await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
