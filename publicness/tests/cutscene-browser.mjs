import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const [width,height] of [[1366,900],[820,1180],[375,812]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
  await page.locator('#btn-start').click();
  assert.equal(await page.locator('#goal-intro').getAttribute('data-stage'),'false','intro comes first');
  for(const [index,name] of ['하늘','나래','준','솔잎마을의 AI'].entries()){
   assert.equal(await page.locator('#goal-intro-h').textContent(),name);
   await page.locator('#story-image').evaluate(img=>img.decode());
   assert.equal(await page.evaluate(()=>PB.App.s),null);
   await page.evaluate(()=>{if(document.querySelector('#story-typed').textContent!==document.querySelector('#story-full').textContent)document.querySelector('#story-next').click();});
   assert.equal(await page.locator('#goal-intro').getAttribute('data-cut'),String(index));
   assert.equal(await page.locator('#story-typed').textContent(),await page.locator('#story-full').textContent());
   const box=await page.locator('#story-next').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
   if(index===0||index===3)await page.screenshot({path:`publicness/tests/_shot-cutscene-${width}-${index}.png`});
   await page.keyboard.press('ArrowRight');
  }
  // 소개가 끝나면 Stage 카드 없이 바로 1단계 안내(생각해 보기 포함)
  await page.locator('#btn-begin-plan').waitFor();assert.equal(await page.locator('body').getAttribute('data-screen'),'reveal');assert.ok(await page.locator('#learning').isVisible());assert.equal(await page.locator('#goal-intro').evaluate(d=>d.open),false);
  if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();
  await page.evaluate(()=>{PB.App.motion=true;window.sceneDone=0;PB.Cutscene.play('sol',()=>window.sceneDone++);});
  await page.locator('#story-image').evaluate(img=>img.decode());
  assert.equal(await page.locator('#story-typed').textContent(),await page.locator('#story-full').textContent());
  assert.equal(await page.locator('#story-image').evaluate(img=>getComputedStyle(img).animationName),'none');
  await page.screenshot({path:`publicness/tests/_shot-cutscene-sol-${width}.png`});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.sceneDone),1);
  assert.deepEqual(errors,[]);console.log(`PASS ${width}: four illustrations, typewriter, keyboard, start, Sol, reduced motion, escape`);await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
