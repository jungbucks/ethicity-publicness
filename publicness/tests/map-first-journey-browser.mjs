import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const mode of ['default','fixed']){
 const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/${mode==='fixed'?'?seed=42&no3d=1':'?no3d=1'}`);
 await page.evaluate(()=>{PB.App.startGame();PB.App.s.tutorialSeen=true;});const total=mode==='default'?5:8;
 for(let phase=1;phase<=total;phase++){
  console.log("phase",mode,phase);
  if(phase>1){await page.locator('#btn-next-phase').click();if(await page.locator('#goal-intro[open]').count())await page.locator('#btn-goal-start').click();await page.locator('#reflection-next').click({timeout:12000}).catch(async e=>{console.log(await page.evaluate(()=>({screen:document.body.dataset.screen,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),bodyClass:document.body.className,rect:document.querySelector('#reflection-next')?.getBoundingClientRect().toJSON(),size:[innerWidth,innerHeight]})));await page.screenshot({path:'publicness/docs/map-first/transition-failure.png'});throw e;});}
  await page.locator('#btn-begin-plan').click();
  if(phase===3){await page.screenshot({path:`publicness/docs/map-first/plan-journey-${mode}.png`});}
  // 도전 모드는 누적 잔액이 2번 연속 마이너스면 계약이 끝난다(2026-10-27 경제 개편) — 무운행으로는 8단계까지 못 가므로 일반 버스를 모든 정류장 순환 노선에 넣는다
  if(mode==='fixed')await page.evaluate(()=>{const A=PB.App,S=PB.Session,s=A.s,ns=S.graph(s).nodes.filter(id=>id!=='N').map(id=>s.config.nodes.find(n=>n.id===id)),cx=ns.reduce((a,n)=>a+n.x,0)/ns.length,cy=ns.reduce((a,n)=>a+n.y,0)/ns.length;
   const order=ns.sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx)).map(n=>n.id),loop=order.concat([order[0]]);s.draft.routes=[];s.draft.buses.forEach(b=>{b.routeNum=null;});
   const r=S.addRoute(s,{nodes:loop,stops:loop.map(()=>true)});s.draft.buses.forEach(b=>S.assign(s,b.id,r.num));A.keepFocus=true;A.render();});
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
  for(let i=0;i<(phase>=3?2:0);i++){for(let k=0;k<40&&!await page.locator('#emergency-dialog[open]').count();k++){await page.locator('#run-next').click();await page.waitForFunction(()=>PB.UI.runState()&&PB.UI.runState().hold,null,{timeout:20000,polling:20});}await page.locator('#emergency-continue').click();}
  await page.locator('#run-skip').click();await page.locator('#resident-day-results').waitFor();
  assert.equal(await page.evaluate(()=>PB.App.s.history.length),phase);
  if(phase===3){await page.screenshot({path:`publicness/docs/map-first/result-${mode}.png`});await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`publicness/docs/map-first/result-${mode}-375.png`});await page.setViewportSize({width:1366,height:900});}
 }
 await page.locator('#btn-next-phase').click();assert.equal(await page.locator('body').getAttribute('data-screen'),'ending');assert.deepEqual(errors,[]);console.log('PASS full journey',mode,total);await page.close();
}}finally{await browser.close();server.close();}
