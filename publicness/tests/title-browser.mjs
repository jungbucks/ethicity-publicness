import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[820,1180],[375,812]]){
  const page=await browser.newPage({viewport:{width,height}});await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
  await page.locator('#title-img').evaluate(img=>img.decode());
  const info=await page.evaluate(()=>{const img=document.querySelector('#title-img'),r=img.getBoundingClientRect(),copy=document.querySelector('.title-copy').getBoundingClientRect(),scale=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight);return {fit:getComputedStyle(img).objectFit,loaded:img.naturalWidth>0,overflow:document.documentElement.scrollWidth>innerWidth,copyBottom:copy.bottom,copyRight:copy.right,imageTop:r.top,artBottom:r.bottom,peopleLeft:r.right-scale*img.naturalWidth*.32};});
  assert.ok(info.loaded);assert.equal(info.fit,'contain');assert.equal(info.overflow,false);
  assert.ok(width<=1000?info.copyBottom>info.artBottom:info.copyRight<info.peopleLeft);
  await page.screenshot({path:`publicness/tests/_shot-title-${width}.png`,fullPage:true});
  await page.locator('#btn-start').click();assert.ok(await page.locator('#goal-intro').evaluate(d=>d.open));await page.locator('#btn-goal-start').click();await page.locator('#btn-begin-plan').waitFor();
  console.log('PASS '+width+'x'+height+': whole illustration, no character overlap/overflow, start flow');await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
