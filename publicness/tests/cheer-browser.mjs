import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{PB.App.motion=true;window.finished=0;PB.Cutscene.play('baseball',()=>window.finished++);});
 await page.locator('#story-image').evaluate(img=>img.decode());
 assert.match(await page.locator('#story-image').getAttribute('src'),/interlude-cheer.webp$/);
 assert.match(await page.locator('#goal-intro-h').textContent(),/유나/);
 await page.screenshot({path:'publicness/tests/_shot-cheer-desktop.png'});
 await page.locator('#story-next').click();assert.match(await page.locator('#goal-intro-h').textContent(),/다은/);
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'publicness/tests/_shot-cheer-phone.png'});
 const b=await page.locator('#story-next').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=375&&b.y+b.height<=812);
 await page.locator('#story-next').click();assert.equal(await page.evaluate(()=>window.finished),1);assert.ok(!await page.locator('#goal-intro').evaluate(d=>d.open));
 console.log('PASS cheer art decoded, Yuna→Daeun dialogue, desktop/phone, one completion');await page.close();
}finally{if(browser)await browser.close();server.close();}
