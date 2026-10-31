import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require('D:/Works/token_economy/node_modules/playwright'),server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{PB.App.startGame();document.querySelector('#btn-goal-start').click();document.querySelectorAll('dialog[open]').forEach(d=>d.close());PB.Session.beginPlan(PB.App.s);PB.App.s.tutorialSeen=true;PB.App.go('plan');});await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>window.MINIMAL_UI),true);
 const data=await page.evaluate(()=>{const s=PB.App.s,before=JSON.stringify(PB.Session.expected(s));PB.Minimal.set(false);const original=document.querySelector('#plan-toolbar').textContent;PB.Minimal.set(true);PB.Minimal.text(true);const text=document.querySelector('#plan-toolbar').textContent;return{same:before===JSON.stringify(PB.Session.expected(s)),preserved:original===text,original,text};});console.log(data);assert.equal(data.same,true);assert.equal(data.preserved,true);
 await page.evaluate(()=>PB.Minimal.text(false));assert.equal(await page.locator('#minimal-signals').isVisible(),true);assert.equal(await page.locator('#plan-econ').isVisible(),false);
 console.log('PASS minimal flag, unchanged calculations, full text retained, replacement signals');await page.screenshot({path:'publicness/tests/_shot-minimal-plan.png'});
}finally{await browser.close();server.close();}
