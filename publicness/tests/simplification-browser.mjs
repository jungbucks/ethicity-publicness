import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const out='publicness/tests/ui-simplification-artifacts';fs.mkdirSync(out,{recursive:true});
const checks=[];function pass(s){checks.push(s);console.log('PASS '+s);}
async function noOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');}
async function visibleButton(page,id){await page.locator(id).scrollIntoViewIfNeeded();assert.ok(await page.locator(id).evaluate(b=>{const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return y>=0&&y<innerHeight&&b.contains(document.elementFromPoint(x,y));}),id+' unobscured');}
async function start(page,mode='default'){
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(mode=>{PB.App.startGame();document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(mode!=='default')PB.App.s=PB.Session.create(PB.config,{mode,seed:42});const s=PB.App.s;PB.Session.beginPlan(s);s.stage='plan';PB.App.go('plan');},mode);
 if(await page.locator('#first-coach-close').count())await page.locator('#first-coach-close').click();
}
async function finishViaEngine(page){await page.evaluate(()=>{PB.UI.stopRun();const s=PB.App.s;PB.Session.startRun(s);PB.Session.finishRun(s);PB.App.go('result');});}
try {
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  await page.evaluate(()=>{const s=PB.App.s;PB.Session.updateRoute(s,s.draft.routes[0].num,{nodes:['F','D'],stops:[true,true]});PB.Session.assign(s,s.draft.buses[0].id,s.draft.routes[0].num);PB.App.go('plan');});
  const original=await page.evaluate(()=>JSON.stringify(PB.App.s.draft));
  await page.locator('#btn-reset-routes').click();await page.locator('#btn-undo').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(PB.App.s.draft)),original);
  await page.locator('#btn-settings').click();assert.ok(await page.locator('#settings').evaluate(d=>d.open));await page.locator('#settings button[type=submit]').click();
  await page.locator('#btn-help').click();assert.ok(await page.locator('#help').evaluate(d=>d.open));await page.locator('#help button[type=submit]').click();
  assert.equal(await page.locator('#btn-undo svg[data-icon=undo]').count(),1);
  assert.ok(await page.locator('.route-tab-name').first().innerText());await noOverflow(page);
  await page.screenshot({path:`${out}/plan-${viewport.width}.png`});pass(`${viewport.width}: undo/reset, settings/help, visible route names`);
  await page.evaluate(()=>{PB.Session.startRun(PB.App.s);PB.App.go('run');});
  await page.locator('#run-pause').click();assert.equal(await page.evaluate(()=>PB.UI.runState().paused),true);assert.equal(await page.locator('#run-pause svg[data-icon=play]').count(),1);
  await page.locator('#run-pause').click();assert.equal(await page.evaluate(()=>PB.UI.runState().paused),false);
  for(const speed of [2,1]){await page.locator('#speed-'+speed).click();assert.equal(await page.evaluate(()=>PB.App.speed),speed);assert.equal(await page.locator('#speed-'+speed).innerText(),speed+'×');assert.equal(await page.locator('#speed-'+speed+' svg').count(),0);}
  const sound=await page.evaluate(()=>PB.App.sound);await page.locator('#run-sound').click();assert.equal(await page.evaluate(()=>PB.App.sound),!sound);
  if(await page.locator('#run-next').isEnabled()){await page.locator('#run-next').click();assert.equal(await page.evaluate(()=>PB.UI.runState().mode),'next');}else assert.equal(await page.locator('#run-next').getAttribute('title'),'남은 멈춤 없음');
  await page.screenshot({path:`${out}/run-${viewport.width}.png`});await noOverflow(page);pass(`${viewport.width}: pause/resume, 1×/2×, sound, next stop`);
  await page.locator('#run-skip').click();await page.waitForFunction(()=>PB.App.s.stage==='result');
  assert.equal(await page.locator('#panel textarea').count(),0);assert.equal(await page.locator('#result-think #learning').count(),0);
  await page.locator('#result-ai-more').waitFor({timeout:60000});assert.equal(await page.locator('#result-ai-more').evaluate(d=>d.open),false);
  await page.locator('[data-choice=longest]').click();assert.match(await page.locator('#result-ai-summary').innerText(),/소외 지역 연결/);
  await page.locator('#result-ai-more summary').click();assert.equal(await page.locator('#result-ai-more').evaluate(d=>d.open),true);await page.locator('#result-ai-more summary').click();
  await visibleButton(page,'#btn-next-phase');await page.screenshot({path:`${out}/result-${viewport.width}.png`,fullPage:true});await noOverflow(page);
  // Old-save shape: original serializer, old phase notes and no finalReflection.
  const old=await page.evaluate(()=>{PB.App.s.reflections={1:'예전 단계 회고 보존',2:'더 많은 사람을 빠르게'};PB.App.save();return JSON.parse(localStorage.getItem(PB.Storage.SAVE_KEY));});
  assert.equal(old.session.finalReflection,undefined);await page.reload();await page.locator('#btn-continue').click();assert.equal(await page.evaluate(()=>PB.App.s.reflections[1]),'예전 단계 회고 보존');
  await page.locator('#btn-next-phase').click();await page.evaluate(()=>{document.querySelector('#goal-intro').open&&document.querySelector('#btn-goal-start').click();});
  await page.waitForFunction(()=>document.body.dataset.screen==='plan');assert.match(await page.locator('#hud-goal').innerText(),/오래 기다린/);
  await page.evaluate(()=>{PB.App.peekPhase(PB.App.s.history[0],document.querySelector('#phase-label')||document.querySelector('#btn-help'));});assert.match(await page.locator('#phase-peek').innerText(),/예전 단계 회고 보존/);await page.keyboard.press('Escape');
  pass(`${viewport.width}: result no case/writing, AI disclosure/goal, save resume, next goal HUD, old history`);
  // Real engine settles remaining stages; only animation playback is omitted.
  await page.evaluate(()=>{const s=PB.App.s;while(s.stage!=='ending'){PB.Session.beginPlan(s);PB.Session.startRun(s);PB.Session.finishRun(s);PB.Session.nextPhase(s);}PB.App.go('ending');});
  assert.equal(await page.locator('#goal-intro:modal').count(),0);assert.equal(await page.locator('#panel textarea').count(),0);
  await page.locator('#btn-skip-review').click();await visibleButton(page,'#btn-restart');
  await page.locator('#btn-game-review').click();assert.equal(await page.locator('#panel textarea').count(),1);assert.equal(await page.locator('#game-review > .review-case').count(),2);
  assert.equal(await page.locator('#review-more-cases').evaluate(d=>d.open),false);assert.match(await page.locator('#game-review').innerText(),/2019년/);assert.match(await page.locator('#game-review').innerText(),/2017년/);
  await page.locator('#btn-review-done').click();await page.locator('#btn-game-review').click();assert.equal(await page.locator('#final-reflection').inputValue(),'');
  await page.locator('#final-reflection').fill('외곽 마을의 이동을 더 살폈어요. 실제 도착 결과를 비교했어요.');await page.locator('#btn-review-done').click();await page.locator('#btn-game-review').click();assert.match(await page.locator('#final-reflection').inputValue(),/외곽 마을/);
  await noOverflow(page);await visibleButton(page,'#btn-review-done');await page.screenshot({path:`${out}/review-${viewport.width}.png`,fullPage:true});
  await page.reload();await page.locator('#btn-continue').click();await page.locator('#btn-game-review').click();assert.match(await page.locator('#final-reflection').inputValue(),/외곽 마을/);assert.equal(await page.evaluate(()=>PB.App.s.reflections[1]),'예전 단계 회고 보존');assert.equal(await page.evaluate(()=>PB.App.s.reflections[2]),'더 많은 사람을 빠르게');
  await page.locator('#btn-review-skip').click();await page.locator('#btn-restart').click();assert.ok(await page.locator('#confirm-restart').evaluate(d=>d.open));await page.locator('#restart-no').click();
  assert.deepEqual(errors,[]);pass(`${viewport.width}: ending summary first, skip, empty completion, final text reopen/reload, old notes, restart available`);
  await context.close();
 }
 const ctx=await browser.newContext(),p=await ctx.newPage();await start(p,'random');
 await p.evaluate(()=>{const s=PB.App.s;while(s.stage!=='ending'){PB.Session.beginPlan(s);s.draft.buses.forEach(b=>b.routeNum=null);PB.Session.startRun(s);PB.Session.finishRun(s);PB.Session.nextPhase(s);}PB.App.go('ending');});
 assert.equal(await p.evaluate(()=>PB.App.s.end.cause),'contract');assert.ok(await p.evaluate(()=>PB.App.s.history.length<PB.App.s.config.phases.length));await p.locator('#btn-game-review').click();await p.locator('#btn-review-done').click();pass('random early contract ending: review and empty completion');await ctx.close();
 fs.writeFileSync(`${out}/checks.json`,JSON.stringify(checks,null,2));
}finally{await browser.close();server.close();}
