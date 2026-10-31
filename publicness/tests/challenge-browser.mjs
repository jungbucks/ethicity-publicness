import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?seed=42${mode==='2d'?'&no3d=1':''}`);
  await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();assert.equal(await page.locator('#top-phase li').count(),8);if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
  await page.evaluate(()=>window.__pbFast=true);
  assert.ok(!await page.evaluate(()=>PB.Session.visibleNodeIds(PB.App.s).includes('H')));
  for(let phase=1;phase<=8;phase++){
   if(phase>1){await page.locator('#btn-next-phase').click();while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);}
   assert.equal(await page.locator('.bus-assignment').count(),phase+1);assert.equal(await page.locator('.route-tab').count(),phase<3?phase+1:phase<6?4:phase<8?5:6);
   assert.equal(await page.evaluate(()=>PB.Session.visibleNodeIds(PB.App.s).includes('H')),phase>=2);
   assert.match(await page.locator('.ethics-focus').innerText(),new RegExp(phase===6?'호수공원':phase===7?'솔잎몰':phase===8?'경계':'이번 단계'));
   await page.evaluate(phase=>{const s=PB.App.s,S=PB.Session,paths=[['F','C','D'],['B','A','G'],['H','E',...(phase>=4?['J']:[])],['I','A'],['B','L',...(phase>=7?['M']:[])] ,['A','N']];for(const r of s.draft.routes){const nodes=paths[r.num-1];S.updateRoute(s,r.num,{nodes,stops:nodes.map(()=>true)});}s.draft.buses.forEach(b=>{if(b.routeNum==null)S.assign(s,b.id,phase===7?5:1);});PB.App.render();},phase);
   if(phase>=6){
    assert.deepEqual(await page.locator('#bus-sel-7 option').evaluateAll(xs=>xs.map(x=>x.value)),['','5']);
    await page.locator('#route-5').click();assert.match(await page.locator('#express-rule').innerText(),/최대 3개/);
    if(phase===6){
     await page.locator('#stop-picker').evaluate(d=>d.open=true);await page.locator('#next-A').click();
     const before=await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,5).nodes);
     await page.locator('#stop-picker').evaluate(d=>d.open=true);await page.locator('#next-C').click();assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,5).nodes),before);
     await page.evaluate(()=>PB.App.onLink({route:5,index:0},{node:'C'}));assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,5).nodes),before);
     await page.evaluate(()=>PB.App.onLink({node:'L'},{node:'C'}));assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,5).nodes),['B','C','A']);
     await page.locator('#btn-undo').click();assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,5).nodes),before);
     await page.locator('#remove-stop-2').click();await page.locator('#stop-picker').evaluate(d=>d.open=true);await page.locator('#next-D').click();assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,5).nodes),['B','L','D']);
    }
    assert.ok(await page.locator('#btn-new-route').isDisabled());assert.equal(await page.evaluate(()=>PB.App.nodeName('L')),'호수공원');await page.screenshot({path:`publicness/tests/_shot-challenge-${phase}-${mode}.png`});}
   if(phase===8){
    await page.locator('#route-6').click();assert.match(await page.locator('#regional-rule').innerText(),/24명/);
    assert.deepEqual(await page.locator('#bus-sel-9 option').evaluateAll(xs=>xs.map(x=>x.value)),['','6']);
    assert.ok(!(await page.locator('#bus-sel-1 option').evaluateAll(xs=>xs.map(x=>x.value))).includes('6'));
    const before=await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,6).nodes);
    await page.evaluate(()=>PB.App.onLink({route:6,index:0},{node:'B'}));assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,6).nodes),before);
    await page.evaluate(()=>PB.App.onLink({node:'A'},{node:'B'}));assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,6).nodes),['B','N']);
    await page.locator('#btn-undo').click();assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,6).nodes),before);
    await page.evaluate(()=>PB.App.onLink({node:'N'},{node:'C'}));assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,6).nodes),before);
    await page.locator('#btn-reverse').click();await page.evaluate(()=>PB.App.onLink({node:'A'},{node:'B'}));assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,6).nodes),['N','B']);await page.locator('#btn-undo').click();await page.locator('#btn-undo').click();
    if(mode==='2d')assert.equal(await page.locator('.admin-boundary').count(),1);
    await page.screenshot({path:'publicness/tests/_shot-regional-'+mode+'.png'});
   }
   // 이 설계는 추가 버스를 1번에 몰아 적자가 쌓인다 — 재정 종료는 finance-browser에서 보고, 여기서는 8단계 진행만(수지 0 하한)
   await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.evaluate(()=>{const k=PB.App.s.current.metrics.costs;k.total=Math.max(0,k.total);});await page.locator('#resident-summary').waitFor();
   if(phase>=6)assert.match(await page.locator('#family-result').textContent(),/3팀/);
  }
  assert.equal(await page.locator('#btn-next-phase').textContent(),'학기 마무리 보기');await page.locator('#btn-next-phase').click();
  assert.equal(await page.locator('#goal-intro').getAttribute('data-scene'),'ending');assert.match(await page.locator('#story-full').textContent(),/만족 기준 6회 이상/);await page.locator('#btn-goal-start').click();
  assert.match(await page.locator('#ending-families').textContent(),/9팀/);await page.locator('#btn-records').click();assert.equal(await page.locator('#goal-history li').count(),8);
  assert.equal(await page.evaluate(()=>PB.App.s.history.length),8);assert.deepEqual(errors,[]);console.log('PASS '+mode+': eight phases, six routes, nine buses, park/mall, family results, eight-phase ending records');await page.close();
 }
}finally{if(browser)await browser.close();server.close();}
