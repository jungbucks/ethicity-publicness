import {beginPlan} from './browser-fixture.mjs';
// Compare camera elevations without changing production code; default verifies final camera.
import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const angles=process.env.COMPARE_CAMERA?[50,60,70]:[null];
 for(const angle of angles){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(angle!==null)await page.route('**/js/view3d.js',r=>{
   const code=fs.readFileSync('publicness/js/view3d.js','utf8').replace(/var CAMERA_ELEVATION = \d+;/,`var CAMERA_ELEVATION = ${angle};`);
   return r.fulfill({contentType:'application/javascript',body:code});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/`);
  await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
  await page.evaluate(()=>{const s=PB.App.s,S=PB.Session;S.updateRoute(s,1,{nodes:['F','C','D','A'],stops:[true,true,true,true]});S.updateRoute(s,2,{nodes:['B','A','G','E'],stops:[true,true,true,true]});PB.App.render();});
  await page.screenshot({path:`publicness/tests/_shot-camera-${angle??'final'}.png`});
  if(angle===null){
   async function point(id){return page.evaluate(id=>{const p=PB.App.nodeXY(id),q=PB.App.view.project(p.x,p.y),r=document.querySelector('#stage-3d').getBoundingClientRect();return{x:r.left+q.left,y:r.top+q.top};},id);}
   await page.locator('#route-1').click();const c=await point('C'),h=await point('H');
   await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(h.x,h.y,{steps:12});await page.mouse.up();
   assert.deepEqual(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes),['F','H','D','A']);
   await page.locator('#btn-undo').click();assert.deepEqual(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes),['F','C','D','A']);
   await page.setViewportSize({width:820,height:1180});await page.screenshot({path:'publicness/tests/_shot-camera-tablet.png'});
   const bounds=await page.evaluate(()=>{const r=document.querySelector('#stage-3d').getBoundingClientRect();return PB.Session.visibleNodeIds(PB.App.s).map(id=>{const p=PB.App.nodeXY(id),q=PB.App.view.project(p.x,p.y);return q.left>=0&&q.left<=r.width&&q.top>=0&&q.top<=r.height;});});assert.ok(bounds.every(Boolean));
  }
  assert.deepEqual(errors,[]);console.log('PASS camera '+(angle??'final drag, undo and tablet bounds'));await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
