import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require('D:/Works/token_economy/node_modules/playwright');
const expected=[...fs.readFileSync(new URL('../js/cutscene.js',import.meta.url),'utf8').matchAll(/text:'([^']*)'/g)].map(m=>m[1]);
const server=process.env.GAME_URL?null:await startServer(0),base=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}/publicness/`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const minimal of [1,0]){
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=new URL(base);url.searchParams.set('minimal',minimal);url.searchParams.set('no3d','1');url.searchParams.set('verify','original-dialogue');await page.goto(url.href);
  let index=0;
  for(const [kind,count] of [['intro',4],['sol',1],['baseball',2],['mall',1]]){
   await page.evaluate(kind=>PB.Cutscene.play(kind,()=>{}),kind);
   for(let i=0;i<count;i++){
    assert.equal(await page.locator('#story-typed').textContent(),expected[index]);
    assert.equal(await page.locator('#story-full').textContent(),expected[index]);index++;
    await page.locator('#story-next').click();
   }
  }
  assert.equal(index,8);assert.deepEqual(errors,[]);console.log(`PASS ${base} minimal=${minimal}: all 8 original dialogues`);await page.close();
 }
}finally{await browser.close();if(server)server.close();}
