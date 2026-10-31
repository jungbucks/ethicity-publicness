import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{
  const S=PB.Session,s=S.create(PB.config);PB.App.s=s;PB.App.motion=true;
  for(let phase=1;phase<=5;phase++){for(const r of s.draft.routes)S.updateRoute(s,r.num,{nodes:['A','B'],stops:[true,true]});s.draft.buses.forEach(b=>S.assign(s,b.id,1));S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=Math.max(0,s.current.metrics.costs.total);S.finishRun(s);S.nextPhase(s);} // 이 설계는 원래 학기 말 잔액이 음수(파산) — 파산 화면은 finance-browser, 여기서는 기존 엔딩 분기만
  // Deliberately synthesized completion evidence exercises both presentation branches.
  for(const h of s.history)for(const r of Object.values(h.residents))if(r){r.dayStatus='complete';r.satisfied=true;r.homeT=110;}
  PB.App.go('ending');
 });
 assert.equal(await page.locator('#goal-intro').getAttribute('data-scene'),'ending');
 for(const [index,name] of ['하늘','나래','준','솔','유나','다은'].entries()){
  assert.equal(await page.locator('#goal-intro-h').textContent(),name+' · 만족');await page.locator('#story-image').evaluate(img=>img.decode());
  if(index===0)await page.screenshot({path:'publicness/tests/_shot-ending-reaction.png'});await page.locator('#story-next').click();
 }
 assert.match(await page.locator('#story-full').textContent(),/다양한 사람들을 만족시켰다/);assert.match(await page.locator('#story-full').textContent(),/총 수익/);
 await page.screenshot({path:'publicness/tests/_shot-ending-all.png'});await page.locator('#story-next').click();
 await page.evaluate(()=>PB.App.render());assert.ok(!await page.locator('#goal-intro').evaluate(d=>d.open));
 await page.evaluate(()=>{PB.App.s.history[4].residents.daeun.dayStatus='returnIncomplete';PB.App.s.history[3].residents.daeun.satisfied=false;PB.App.s.history[4].residents.daeun.satisfied=false;PB.App.render();});await page.locator('#btn-ending-replay').click();
 for(let i=0;i<5;i++)await page.locator('#story-next').click();assert.equal(await page.locator('#goal-intro-h').textContent(),'다은 · 불만족');await page.locator('#story-next').click();
 assert.match(await page.locator('#story-full').textContent(),/하지만 이게 최선이었을까/);
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'publicness/tests/_shot-ending-phone.png'});const b=await page.locator('#story-next').boundingBox();assert.ok(b.y+b.height<=812);
 await page.keyboard.press('Escape');await page.locator('#btn-records').click();assert.ok(await page.locator('#records').isVisible());assert.deepEqual(errors,[]);
 console.log('PASS seven ending cuts, all/one-failed branches, signed profit, replay/skip, no duplicate autoplay, phone');await page.close();
}finally{if(browser)await browser.close();server.close();}
