import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const view of ['2d','3d']){
 const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/${view==='2d'?'?no3d=1':''}`);
 await page.evaluate(()=>{PB.App.startGame();PB.Session.beginPlan(PB.App.s);PB.App.go('plan');});
 assert.equal(await page.locator('#plan-toolbar').count(),1,'map toolbar exists');
 assert.equal(await page.locator('#panel').isVisible(),false,'text editor starts closed');
 // 노선을 완성하면 대기 버스 1대(1호차)가 자동으로 운행한다(2026-10-27 버스 배치 개편)
 await page.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});
 assert.deepEqual(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes),['F','D']);
 assert.equal(await page.evaluate(()=>PB.App.s.draft.buses[0].routeNum),1);
 const target=await page.evaluate(()=>{const a=PB.App.view.project(PB.App.nodeXY('F').x,PB.App.nodeXY('F').y),b=PB.App.view.project(PB.App.nodeXY('D').x,PB.App.nodeXY('D').y),r=document.querySelector('#stage').getBoundingClientRect();return{x:r.left+(a.left+b.left)/2,y:r.top+(a.top+b.top)/2};});
 const token=await page.locator('#bus-token-2').boundingBox();await page.mouse.move(token.x+token.width/2,token.y+token.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.up();
 assert.equal(await page.evaluate(()=>PB.App.s.draft.buses[1].routeNum),1,'actual pointer drag assigns bus');
 await page.locator('#btn-undo').click();assert.equal(await page.evaluate(()=>PB.App.s.draft.buses[1].routeNum),null,'undo restores bus');
 await page.locator('#resident-map-narae').click();await page.locator('#resident-destination line').waitFor();assert.equal(await page.locator('#resident-destination line').count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#resident-destination line').count(),0);
 await page.locator('#plan-text-toggle').click();assert.ok(await page.locator('#panel').isVisible());
 await page.locator('#plan-text-toggle').click();await page.locator('#plan-ai-toggle').click();await page.locator('#goal-time').click();
 await page.locator('#rec-card').waitFor();assert.match(await page.locator('#rec-people').innerText(),/기준 충족/);
 const original=await page.evaluate(()=>JSON.stringify(PB.App.s.draft));await page.locator('#rec-reject').click();assert.equal(await page.evaluate(()=>JSON.stringify(PB.App.s.draft)),original);
 await page.locator('#plan-ai-toggle').click();
 await page.screenshot({path:`publicness/docs/map-first/plan-${view}-desktop.png`});
 await page.setViewportSize({width:375,height:812});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:`publicness/docs/map-first/plan-${view}-375.png`});
 assert.deepEqual(errors,[]);await page.close();console.log('PASS map-first',view);
}}finally{await browser.close();server.close();}
