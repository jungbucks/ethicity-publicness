import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/publicness/?${mode==='2d'?'no3d=1&':''}`;
  async function start(){await page.locator('#btn-start').click();if(await page.locator('#confirm-restart').evaluate(d=>d.open))await page.locator('#restart-yes').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);}
  await page.goto(url);await page.locator('input[value=random]').check();await start();
  const state=await page.evaluate(()=>({seed:PB.App.s.seed,nodes:PB.App.s.config.nodes,base:PB.config.nodes,xy:PB.App.nodeXY('A'),kind:PB.App.view.kind}));
  assert.notDeepEqual(state.nodes,state.base);assert.deepEqual(state.xy,(({x,y})=>({x,y}))(state.nodes.find(n=>n.id==='A')));assert.equal(state.kind,mode);
  assert.equal(state.nodes.find(n=>n.id==='C').name,'대학교');assert.equal(state.nodes.find(n=>n.id==='H').name,'종합운동장');
  await page.locator('#stop-picker').evaluate(n=>n.open=true);await page.locator('.next-stop[data-node=F]').click();await page.locator('#stop-picker').evaluate(n=>n.open=true);await page.locator('.next-stop[data-node=C]').click();
  await page.locator('#route-2').click();await page.locator('#stop-picker').evaluate(n=>n.open=true);await page.locator('.next-stop[data-node=B]').click();await page.locator('#stop-picker').evaluate(n=>n.open=true);await page.locator('.next-stop[data-node=A]').click();
  assert.ok(await page.locator('#btn-depart').isEnabled());await page.screenshot({path:`publicness/tests/_shot-random-map-${mode}.png`});
  await page.evaluate(()=>window.__pbFast=true);await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.locator('#resident-summary').waitFor();
  await page.locator('#btn-next-phase').click();assert.deepEqual(await page.evaluate(()=>PB.App.s.config.nodes),state.nodes);
  await page.goto(url+'seed='+state.seed);await start();assert.deepEqual(await page.evaluate(()=>PB.App.s.config.nodes),state.nodes);
  await page.goto(url);await start();assert.deepEqual(await page.evaluate(()=>PB.App.s.config.nodes),state.base);
  await page.screenshot({path:`publicness/tests/_shot-default-map-${mode}.png`});
  assert.deepEqual(errors,[]);console.log('PASS '+mode+': random layout, session coordinates, stable phases, seed replay, default restore, route operation');await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
