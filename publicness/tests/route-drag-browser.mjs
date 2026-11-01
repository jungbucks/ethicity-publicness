import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require('D:/Works/token_economy/node_modules/playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const view of ['2d','3d']){
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?minimal=0${view==='2d'?'&no3d=1':''}`);
 await page.evaluate(()=>{PB.App.startGame();document.querySelector('#btn-goal-start').click();document.querySelectorAll('dialog[open]').forEach(d=>d.close());const s=PB.App.s;PB.Session.beginPlan(s);s.tutorialSeen=true;s.draft.routes=[{num:1,nodes:['A','B','F'],stops:[true,true,true],autoPlaced:true}];s.draft.buses.forEach((b,i)=>b.routeNum=i?null:1);PB.App.go('plan');});await page.waitForTimeout(800);
 const pos=id=>page.evaluate(id=>{const n=PB.App.nodeXY(id),p=PB.App.view.project(n.x,n.y),b=document.querySelector('#stage').getBoundingClientRect();return{x:p.left+b.left,y:p.top+b.top};},id);
 const state=()=>page.evaluate(()=>JSON.stringify(PB.App.s.draft));const nodes=()=>page.evaluate(()=>PB.App.s.draft.routes[0].nodes);
 const before=await state(),a=await pos('A'),d=await pos('D');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(d.x,d.y,{steps:8});await page.waitForTimeout(250);
 assert.equal(await state(),before,'preview must not mutate draft');assert.equal(await page.evaluate(()=>PB.RouteDrag.active()),true);
 await page.waitForFunction(()=>document.querySelector('#route-edit-tooltip').dataset.profit!=null);const preview=await page.locator('#route-edit-tooltip').getAttribute('data-profit');await page.mouse.up();await page.waitForTimeout(200);
 assert.deepEqual(await nodes(),['D','A','B','F']);assert.equal(await page.evaluate(()=>String(PB.UI.Econ.plan(PB.App.s).k.total)),preview);
 await page.locator('#btn-undo').click();assert.equal(await state(),before,'one undo restores entire drag');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(d.x,d.y,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await state(),before);
 await page.waitForTimeout(420);await page.mouse.move(d.x,d.y);await page.waitForTimeout(100);await page.mouse.click(d.x,d.y);assert.deepEqual(await nodes(),['D','A','B','F'],'click uses nearest head');
 await page.locator('#btn-undo').click();await page.waitForTimeout(420);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(d.x,d.y,{steps:5});await page.waitForTimeout(80);await page.mouse.move(a.x,a.y,{steps:5});await page.waitForTimeout(80);await page.mouse.up();assert.equal(await state(),before,'returning to prior stop rewinds');
 await page.evaluate(()=>{PB.App.onRouteClick(1,0);PB.App.onRouteDouble(1,0);PB.App.onNodeClick('D');});assert.deepEqual(await nodes(),['D','B','F'],'deletion clears old segment selection');
 await page.evaluate(()=>{const api=PB.UI.routeEdit,begin=api.begin;api.begin=()=>null;try{PB.App.onNodeClick('G');}finally{api.begin=begin;}});
 assert.deepEqual(errors,[]);console.log('PASS',view,'head, preview equality, undo, Esc, click, rewind, stale segment, unavailable transaction');await page.close();
}}finally{await browser.close();server.close();}
