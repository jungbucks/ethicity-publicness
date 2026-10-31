import {plannedTown,beginPlan} from './browser-fixture.mjs';
// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package if not on module path.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer(0),base=`http://127.0.0.1:${server.address().port}/publicness/`;
let browser,checks=0;
const check=(yes,label)=>{assert.ok(yes,label);checks++;console.log('PASS '+label);};
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const mode of ['2d','3d']){
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install();
    await page.goto(base+(mode==='2d'?'?no3d=1':''));
    await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);await plannedTown(page);
    check(await page.evaluate(()=>PB.App.view.kind)===mode,mode+' loaded');
    check(await page.locator('.offset-btn').count()===0,mode+' no departure controls');
    check(!(await page.locator('body').innerText()).includes('중앙역'),mode+' station renamed');
    // Remove the three initial routes through the visible controls.
    for(let i=0;i<3;i++){await page.locator('.route-tab').first().click();await page.locator('#btn-delete-route').click();}
    await page.locator('#btn-new-route').click();
    async function xy(id){return page.evaluate(id=>{const p=PB.App.nodeXY(id),q=PB.App.view.project(p.x,p.y),r=document.querySelector(PB.App.view.kind==='3d'?'#stage-3d':'#stage-svg').getBoundingClientRect();return{x:r.left+q.left,y:r.top+q.top};},id);}
    async function drag(a,b){await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();}
    let f=await xy('F'),h=await xy('H'),e=await xy('E');
    await drag(f,h);await drag(h,e);
    check(await page.evaluate(()=>PB.App.s.draft.routes.length===1&&PB.App.s.draft.routes[0].nodes.join('-')==='F-H-E'),mode+' real pointer drag creates free outer route without orphan');
    await page.mouse.click(f.x,f.y);
    check(await page.evaluate(()=>PB.Graph.isLoop(PB.App.s.draft.routes[0])),mode+' tap first stop closes loop');
    const d=await xy('D');await drag(h,d);
    check(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes.join('-')==='F-D-E-F'),mode+' drag middle stop replaces it');
    // The midpoint is close to the school stop; target the open quarter of the segment.
    const b=await xy('B');await drag({x:f.x+(d.x-f.x)*0.25,y:f.y+(d.y-f.y)*0.25},b);
    check(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes.join('-')==='F-B-D-E-F'),mode+' drag segment inserts stop');
    // Cancel must not commit a route edit.
    const before=await page.evaluate(()=>JSON.stringify(PB.App.s.draft));
    await page.mouse.move(f.x,f.y);await page.mouse.down();await page.mouse.move(h.x,h.y,{steps:4});
    await page.locator(mode==='3d'?'#stage-3d canvas':'#stage-svg').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
    check(await page.evaluate(()=>JSON.stringify(PB.App.s.draft))===before,mode+' cancelled drag preserves draft');
    const num=await page.evaluate(()=>PB.App.s.draft.routes[0].num);await page.locator('#bus-sel-1').selectOption(String(num));
    await page.locator('#ai-tools summary').click();await page.locator('#goal-reach').click();await page.locator('#rec-card').waitFor();
    const draft=await page.evaluate(()=>JSON.stringify(PB.App.s.draft));
    check(await page.locator('#stage').evaluate(n=>n.classList.contains('previewing')),mode+' AI preview marked');
    await page.locator('#rec-preview').click();
    check(await page.evaluate(()=>JSON.stringify(PB.App.s.draft))===draft,mode+' preview never applies silently');
    await page.locator('#rec-accept').click();
    check(await page.evaluate(()=>PB.App.s.draft.buses.every(b=>b.offset===0)),mode+' AI uniform departures');
    await page.locator('#panel').evaluate(n=>n.scrollTop=0);
    await page.screenshot({path:`publicness/tests/_shot-v2-plan-${mode}.png`});
    await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+1000));
    await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
    check(await page.locator('#speed-1').count()===1&&await page.locator('#speed-2').count()===1,mode+' speed controls available');
    const clock=()=>page.locator('#top-clock').innerText().then(t=>parseInt(t));
    const t0=await clock();await page.clock.runFor(1600);const t1=await clock();
    const switchGap=await page.evaluate(()=>{const before=parseInt(document.querySelector('#top-clock').textContent);document.querySelector('#speed-2').click();return parseInt(document.querySelector('#top-clock').textContent)-before;});
    check(await page.locator('#speed-2').getAttribute('aria-pressed')==='true',mode+' 2x selected');
    check(switchGap>=0&&switchGap<=1,mode+' speed switch does not jump time');
    await page.clock.runFor(1600);const t2=await clock();
    check(t1-t0>=1&&t1-t0<=2&&t2-t1>=3&&t2-t1<=4,mode+' 1x and 2x clock rates');
    await page.locator('#speed-1').click();check(await clock()>=t2,mode+' switching back never rewinds');
    await page.locator('#speed-2').click();
    await page.clock.resume();
    // 3D 구역 모델(2026-10-23) 뒤로 swiftshader+가짜 시계(resume)에서 프레임이 느려 재생이 늦게 따라온다(실제 시계에선 2배속 정상, 승객 표시 3D 약 18초) — 기다림만 늘림
    await page.waitForFunction(()=>document.querySelector('[data-riders]'),{},{timeout:45000});
    check(await page.locator('[data-riders]').count()>0,mode+' live riders visible');
    await page.screenshot({path:`publicness/tests/_shot-v2-run-${mode}.png`});
    // Validate all count transitions including zero through the same display interface.
    const counts=await page.evaluate(()=>{
      const result=PB.App.s.current.result;
      const event=result.log.find(x=>x.type==='arrive'||x.type==='alight');
      const before=PB.Sim.occupancyAt(result,event.t-0.01),after=PB.Sim.occupancyAt(result,event.t);
      PB.App.view.setBuses([{id:1,x:0,y:0,color:'#2563eb',riders:3}]);const has=!!document.querySelector('[data-riders="3"]');
      PB.App.view.setBuses([{id:1,x:0,y:0,color:'#2563eb',riders:0}]);const empty=!document.querySelector('[data-riders]');
      return{has,empty,before,after};
    });check(counts.has&&counts.empty,mode+' empty bus clears occupancy badge');
    await page.evaluate(()=>window.__pbFast=true);await page.locator('#resident-summary').waitFor();
    check(await page.locator('#result-details').evaluate(n=>!n.open),mode+' statistics collapsed by default');
    await page.screenshot({path:`publicness/tests/_shot-v2-result-${mode}.png`});
    for(let phase=2;phase<=5;phase++){
      await page.locator('#btn-next-phase').click();while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
      if(phase===3){
        check(await page.evaluate(()=>PB.Session.graph(PB.App.s).has('I')),mode+' new town appears in phase 3');
        await page.locator('#btn-fourth').click();await page.locator('#btn-new-route').click();
        for(const id of ['I','F','D']){await page.locator('#stop-picker').evaluate(n=>n.open=true);await page.locator('.next-stop[data-node="'+id+'"]').press('Enter');}
        const newNum=await page.evaluate(()=>PB.App.s.draft.routes.at(-1).num);
        await page.locator('#bus-sel-4').selectOption(String(newNum));
      }
      await page.locator('#btn-depart').press('Enter');await page.locator('#confirm-yes').press('Enter');
      await page.locator('#resident-summary').waitFor();
    }
    await page.locator('#btn-next-phase').click();await page.locator('#btn-restart').waitFor();
    check(await page.evaluate(()=>JSON.parse(localStorage.getItem('ethicity.result.publicness')).completed===true),mode+' five phases finish and save completion');
    check(errors.length===0,mode+' no runtime errors: '+errors.join(','));await page.close();
  }
  const context=await browser.newContext({viewport:{width:800,height:1000},hasTouch:true});const touch=await context.newPage();
  await touch.goto(base+'?no3d=1');await touch.locator('#btn-start').tap();await touch.locator('#btn-goal-start').tap();if(await touch.locator('#learning-dialog:modal').count())await touch.locator('#btn-learning-continue').tap();await beginPlan(touch,'tap');await plannedTown(touch);await touch.locator('#btn-new-route').tap();
  for(const id of ['F','H','E']){await touch.locator('#stop-picker').evaluate(n=>n.open=true);await touch.locator('.next-stop[data-node="'+id+'"]').tap();}
  check(await touch.evaluate(()=>PB.App.s.draft.routes.at(-1).nodes.join('-')==='F-H-E'),'touch stop buttons free route');
  check(await touch.locator('#btn-new-route').isDisabled(),'four routes disables add');
  await touch.locator('#btn-delete-route').tap();await touch.locator('#btn-new-route').tap();
  check(await touch.evaluate(()=>PB.App.s.draft.routes.at(-1).num===4),'deleted route slot reused as 4');
  await touch.setViewportSize({width:375,height:812});
  check(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'375px no page overflow');
  await touch.screenshot({path:'publicness/tests/_shot-v2-mobile.png',fullPage:true});await context.close();
  console.log(`Verified ${checks} checks.`);
}finally{if(browser)await browser.close();server.close();}
