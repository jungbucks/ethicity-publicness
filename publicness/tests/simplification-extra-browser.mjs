import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE),server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),out='publicness/tests/ui-simplification-artifacts';
try{
 if(!process.argv.includes('--capture-only')){
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.stack);console.log(e.stack);});
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{PB.App.startGame();document.querySelectorAll('dialog[open]').forEach(d=>d.close());const s=PB.App.s;PB.Session.beginPlan(s);PB.Session.updateRoute(s,1,{nodes:['F','D'],stops:[true,true]});PB.Session.assign(s,1,1);PB.Session.assign(s,2,1);PB.App.go('plan');});
 if(await page.locator('#first-coach-close').count())await page.locator('#first-coach-close').click();
 await page.locator('#btn-lease').click();assert.equal(await page.evaluate(()=>PB.App.s.draft.buses.filter(b=>b.leased).length),1);await page.locator('#btn-undo').click();assert.equal(await page.evaluate(()=>PB.App.s.draft.buses.filter(b=>b.leased).length),0);
 await page.locator('#plan-ai-toggle').click();assert.equal(await page.locator('#plan-ai-close svg[data-icon=close]').count(),1);await page.locator('#plan-ai-close').click();
 await page.locator('#plan-text-toggle').click();assert.equal(await page.locator('#drag-stop-0 svg[data-icon=move]').count(),1);await page.locator('#remove-stop-1').click();assert.equal(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes.length),1);await page.locator('#btn-undo').click();assert.equal(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes.length),2);await page.locator('#plan-text-toggle').click();
 await page.evaluate(()=>{PB.Session.startRun(PB.App.s);PB.App.go('run');});
 await page.locator('#run-pause').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>PB.UI.runState().paused),true);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>PB.UI.runState().paused),false);
 await page.locator('#panel h2').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>PB.UI.runState().paused),true);
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.ui-icon')].every(s=>s.getAttribute('aria-hidden')==='true'&&s.getAttribute('viewBox')==='0 0 24 24'&&s.getAttribute('stroke')==='currentColor')),true);
 await page.locator('#run-next').click();assert.equal(await page.evaluate(()=>PB.UI.runState().mode),'next');
 await page.locator('#run-skip').click();await page.waitForFunction(()=>PB.App.s.stage==='result');
 await page.evaluate(()=>{const c=PB.App.s.history[0].metrics.costs.service;const block=PB.UI.Econ.conditions(PB.App.s.history[0].metrics.costs,false);window._paid={data:c,text:block.textContent};});
 const paid=await page.evaluate(()=>window._paid);assert.ok(paid.data.some(c=>c.met));assert.match(paid.text,/지급/);
 assert.equal(await page.locator('#think-choice [aria-pressed=true]').count(),0);await page.locator('#btn-next-phase').click();if(await page.locator('#goal-intro[open]').count())await page.keyboard.press('Enter');await page.waitForFunction(()=>PB.App.s.phase===2&&document.body.dataset.screen==='plan');
 console.log('PASS extra controls, keyboard, payout, no-choice progression');
 // Default and fixed modes use real profit recommendations without overriding costs/settlement.
 const modes=[];
 for(const mode of ['default','fixed']){
  const result=await page.evaluate(async mode=>{const S=PB.Session,s=S.create(PB.config,{mode,seed:42});while(s.stage!=='ending'){S.beginPlan(s);const rec=await PB.Advisor.recommend(S.revealed(s),'profit');S.applyRecommendation(s,rec);S.startRun(s);S.finishRun(s);S.nextPhase(s);}PB.App.s=s;PB.App._sceneKey=null;PB.App.go('ending');return {mode,cause:s.end.cause,phases:s.history.length,balance:S.balance(s)};},mode);
  modes.push(result);await page.locator('#btn-game-review').click();await page.locator('#btn-review-skip').click();assert.ok(await page.locator('#ending-title').isVisible());console.log(JSON.stringify(result));
 }
 assert.ok(modes.some(m=>m.cause==='complete'),'natural complete ending');assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/extra-checks.json`,JSON.stringify({modes,errors},null,2));
 await page.close();
 }
 // Default 3D surface: screenshots and route/style assertions in both viewports.
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const p=await browser.newPage({viewport});await p.goto(`http://127.0.0.1:${server.address().port}/publicness/`);
  await p.evaluate(()=>{PB.App.startGame();document.querySelectorAll('dialog[open]').forEach(d=>d.close());PB.App.motion=true;const s=PB.App.s;PB.Session.beginPlan(s);PB.Session.updateRoute(s,1,{nodes:['F','D'],stops:[true,true]});PB.Session.updateRoute(s,2,{nodes:['B','C','A','G'],stops:[true,true,true,true]});PB.Session.assign(s,1,1);PB.Session.assign(s,2,2);PB.App.go('plan');});
  await p.waitForFunction(()=>PB.App.view.kind==='3d'&&document.querySelectorAll('.net-lines line').length>1);await p.waitForTimeout(1500);await p.evaluate(()=>document.querySelector('#first-coach-close')?.click());
  assert.equal(await p.evaluate(()=>new Set([...document.querySelectorAll('.net-lines line')].map(e=>e.getAttribute('stroke-width'))).size),1);
  assert.equal(await p.locator('.double-stripe,.pat-dot,.pat-dash,.express-stripe,.regional-stripe').count(),0);
  assert.ok(await p.evaluate(()=>[...document.querySelectorAll('.route-tab-status')].filter(e=>e.getClientRects().length).every(e=>e.getBoundingClientRect().bottom<=document.querySelector('#bus-depot').getBoundingClientRect().top)),'route status above depot');
  await p.screenshot({path:`${out}/plan-3d-${viewport.width}.png`});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.close();console.log('PASS 3D solid route styles '+viewport.width);
 }
}finally{await browser.close();server.close();}
