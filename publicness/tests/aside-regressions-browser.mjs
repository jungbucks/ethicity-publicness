import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{PB.App.startGame();PB.App.s.phase=3;PB.App.s.owned=4;PB.App.s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:1,offset:0}));PB.Session.beginPlan(PB.App.s);PB.Session.updateRoute(PB.App.s,1,{nodes:['E','D','F','G'],stops:[true,true,true,true]});PB.App.go('plan');});
 if(await page.locator('#plan-text-toggle').count())await page.locator('#plan-text-toggle').click();
 await page.locator('#stop-picker').evaluate(e=>e.open=true);
 for(const value of ['-1','1','2','3']){
  await page.locator('#insert-at').selectOption(value);
  assert.equal(await page.locator('#insert-at').inputValue(),value,'selection immediately reflects latest change');
 }
 await page.locator('#next-A').click();
 assert.deepEqual(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes),['E','D','F','G','A']);
 await page.evaluate(()=>{PB.Session.startRun(PB.App.s);PB.Session.finishRun(PB.App.s);PB.App.go('result');document.querySelectorAll('#panel details').forEach(d=>d.open=true);});
 const widths=await page.locator('#panel').evaluate(p=>({client:p.clientWidth,scroll:p.scrollWidth,wide:[...p.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>p.getBoundingClientRect().right+1&&!e.closest('.table-wrap')).map(e=>e.className||e.id||e.tagName)}));
 console.log('result widths',widths);assert.ok(widths.scroll<=widths.client+1,'result panel must not scroll horizontally');
 assert.deepEqual(errors,[]);
 console.log('PASS: actual select changes, insertion order and result width');
}finally{await browser.close();server.close();}
