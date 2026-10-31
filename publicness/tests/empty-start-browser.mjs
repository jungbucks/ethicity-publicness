import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/publicness/${mode==='2d'?'?no3d=1':''}`;
  await page.goto(url);assert.ok((await page.locator('#hook-1').innerText()).includes('버스 2대'));assert.ok((await page.locator('#hook-2').innerText()).includes('직접'));
  await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
  assert.equal(await page.locator('.route-tab').count(),2);assert.equal(await page.locator('.bus-assignment').count(),2);assert.ok(await page.evaluate(()=>PB.App.s.draft.buses.every(b=>b.routeNum==null)),'새 버스는 쉬기');
  assert.ok(await page.evaluate(()=>PB.App.s.draft.routes.every(r=>!r.nodes.length)));assert.equal(await page.locator('#plan-errors').innerText(),'');
  await page.screenshot({path:`publicness/tests/_shot-empty-start-${mode}.png`});
  async function fill(num,nodes){await page.locator('#route-'+num).click();for(const id of nodes){await page.locator('#stop-picker').evaluate(n=>n.open=true);await page.locator('.next-stop[data-node="'+id+'"]').click();}}
  await fill(1,['F','C','D']);await page.locator('#assign-route-1').click();await fill(2,['B','A','G']);await page.locator('#assign-route-2').click();assert.ok(await page.locator('#btn-depart').isEnabled());
  await page.evaluate(()=>window.__pbFast=true);
  for(let phase=1;phase<=5;phase++){
    if(phase>1){await page.locator('#btn-next-phase').click();while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);}
    assert.equal(await page.locator('.bus-assignment').count(),phase+1);
    assert.equal(await page.locator('.route-tab').count(),Math.min(phase+1,4));
    assert.equal(await page.locator('.ethics-focus').getAttribute('data-phase'),String(phase));
    assert.match(await page.locator('.ethics-focus').innerText(),new RegExp(['외곽','병원','신도시','경기','복지관'][phase-1]));
    assert.equal(await page.evaluate(()=>PB.Session.visibleNodeIds(PB.App.s).includes('J')),phase>=4);
    assert.equal(await page.evaluate(()=>PB.Session.visibleNodeIds(PB.App.s).includes('K')),phase===5);
    if(phase===5)await page.screenshot({path:`publicness/tests/_shot-welfare-${mode}.png`});
    if(phase>=4){assert.match(await page.locator('#day-agenda').textContent(),/유나/);assert.match(await page.locator('#day-agenda').textContent(),/다은/);}
    if(phase===2){await fill(3,['E','H']);await page.locator('#assign-route-3').click();}
    if(phase===3){await fill(4,['I','A']);await page.locator('#assign-route-4').click();}
    if(phase>=4)await page.locator('#bus-sel-'+(phase+1)).selectOption('1');
    await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.locator('#resident-summary').waitFor();
    assert.ok(await page.locator('#route-report').isVisible());assert.equal(await page.locator('#route-report tbody tr').count(),Math.min(phase+1,4));
    if(phase===4){await page.screenshot({path:`publicness/tests/_shot-route-report-${mode}.png`});await page.screenshot({path:`publicness/tests/_shot-terminal-${mode}.png`});}
  }
  await page.locator('#btn-next-phase').click();await page.locator('#btn-restart').waitFor();
  assert.equal(await page.locator('#goal-intro').getAttribute('data-scene'),'ending');assert.match(await page.locator('#goal-intro-h').textContent(),/하늘/);await page.locator('#btn-goal-start').click();
  await page.goto(url);assert.ok(await page.locator('#btn-continue').isVisible(),'저장된 진행 이어하기');await page.locator('#btn-start').click();await page.locator('#restart-yes').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
  await page.locator('#ai-tools summary').click();await page.locator('#goal-reach').click();await page.locator('#rec-accept').click();assert.ok(await page.locator('#btn-depart').isEnabled());assert.equal(await page.locator('.bus-assignment').count(),2);
  assert.deepEqual(errors,[]);console.log('PASS '+mode+': real two-bus empty start, manual routes, 2→6 bus progression, five phases, AI from blank');await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
