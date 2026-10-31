import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);await page.evaluate(()=>PB.App.startGame());await beginPlan(page);
const button=page.locator('#btn-outlook-help'),content=page.locator('#plan-outlook');assert.ok(!await content.isVisible());assert.equal(await page.locator('#expected-arrivals').count(),0);
await button.focus();await page.keyboard.press('Enter');assert.ok(await content.isVisible());assert.ok(await page.locator('#resident-forecast').isVisible());assert.equal(await button.getAttribute('aria-expanded'),'true');
await page.evaluate(()=>{PB.Session.updateRoute(PB.App.s,1,{nodes:['F','D'],stops:[true,true]});PB.App.render();});assert.ok(await content.isVisible());
await button.click();assert.ok(!await content.isVisible());await page.evaluate(()=>{PB.App.s.phase=2;PB.App.render();});assert.equal(await button.getAttribute('aria-expanded'),'false');
console.log('PASS: hidden initially, keyboard opens forecasts, edits refresh, close and next phase remain hidden');}finally{if(browser)await browser.close();server.close();}
