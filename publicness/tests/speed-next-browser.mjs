// 운행 속도 재설계(2-4) 브라우저 검증(헤드리스 Edge, 실제 시계):
//  ① 저장된 배속 4 → 2로 바뀌고 4× 버튼이 없다
//  ② 기본 세팅 1단계를 ‘⏭ 다음 결정까지’로만 진행 — 멈출 때마다 원인 정류장 고리·문구가 지도 안에 보이고, 단계가 20초 안에 끝난다
//  ③ 3단계 2×: 긴급 조정 30분 전 1×로 감속·예고 고리 → 조정 창이 지도를 가리지 않고 원인·버스 위치를 보여 줌 → 결정 뒤 2×로 복귀
//  ④ ‘끝까지 건너뛰기’는 남은 조정 기회가 있으면 확인창(아니요 = 계속, 예 = 남은 기회 ‘변경 없이 계속’으로 기록)
// 스크린샷: SHOT_DIR(없으면 tests/_shot-speed-*.png). 3D 확인은 SHOT3D=1
import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const here=path.dirname(fileURLToPath(import.meta.url)),shot=name=>path.join(process.env.SHOT_DIR||here,(process.env.SHOT_DIR?'':'_shot-')+'speed-'+name+'.png');
const base=`http://127.0.0.1:${server.address().port}/publicness/`;
const P1=[[['F','C','B','A'],1],[['D','A','G'],1]];
async function setPlan(page,routes){
  await page.evaluate((routes)=>{const s=PB.App.s,S=PB.Session;s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);
    routes.forEach(([ns,n])=>{const r=S.addRoute(s,{nodes:ns,stops:ns.map(()=>true)});s.draft.buses.filter(b=>b.routeNum==null).slice(0,n).forEach(b=>S.assign(s,b.id,r.num));});PB.App.render();},routes);
}
const state=page=>page.evaluate(()=>PB.UI.runState());
// 지도(#stage) 안에 보이는 경고 고리·문구
const alertsOnMap=page=>page.evaluate(()=>{const st=document.querySelector('#stage').getBoundingClientRect();return [...document.querySelectorAll('#stage-overlay .run-alert')].map(a=>{const r=a.querySelector('.run-alert-ring').getBoundingClientRect(),l=a.querySelector('.run-alert-label');return {node:a.dataset.node,kind:a.dataset.kind,text:l.textContent,inside:r.left>=st.left&&r.right<=st.right&&r.top>=st.top&&r.bottom<=st.bottom,visible:getComputedStyle(a).display!=='none'&&r.width>0};});});
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:process.env.SHOT3D?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  // ① 배속 저장 호환
  {
    const ctx=await browser.newContext({viewport:{width:1366,height:900}});await ctx.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('ethicity.publicness.speed','4');sessionStorage.setItem('seeded','1');}});
    const page=await ctx.newPage();await page.goto(base+'?no3d=1');
    assert.equal(await page.evaluate(()=>PB.App.speed),2,'옛 4배속 → 2배속');
    assert.equal(await page.evaluate(()=>localStorage.getItem('ethicity.publicness.speed')),'2','저장값도 2로');
    await page.evaluate(()=>{PB.App.startGame();const s=PB.App.s;s.tutorialSeen=true;});await beginPlan(page);await setPlan(page,P1);
    await page.evaluate(()=>{PB.Session.startRun(PB.App.s);PB.App.go('run');});
    assert.equal(await page.locator('#speed-4').count(),0,'4× 버튼 없음');
    assert.equal(await page.locator('#speed-2').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#run-next').count(),1);
    console.log('PASS ① saved 4 → 2, controls 1×/2×/⏭');await ctx.close();
  }
  // ② 기본 1단계를 ‘다음 결정까지’로만
  {
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+(process.env.SHOT3D?'':'?no3d=1'));
    await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();await beginPlan(page);await setPlan(page,P1);
    await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
    const t0=Date.now();let running=0,runStart=Date.now(),stops=[];
    await page.locator('#run-next').click();
    for(let guard=0;guard<60;guard++){
      await page.waitForFunction(()=>document.body.dataset.screen!=='run'||(PB.UI.runState()&&PB.UI.runState().hold),null,{timeout:30000,polling:20});
      if(await page.evaluate(()=>document.body.dataset.screen)!=='run'){running+=Date.now()-runStart;break;}
      running+=Date.now()-runStart;
      const st=await state(page),al=await alertsOnMap(page);
      assert.equal(st.shown,1,'멈추면 1×로 표시');assert.equal(await page.locator('#speed-1').getAttribute('aria-pressed'),'true');
      assert.ok(al.length>=1&&al.every(a=>a.inside&&a.visible),'원인 정류장 고리가 지도 안에 보임 '+JSON.stringify(al));
      assert.deepEqual(al.map(a=>a.node).sort(),st.alerts.map(a=>a.node).sort());
      assert.match(await page.locator('#run-status').innerText(),/멈춤/);
      stops.push({clock:await page.locator('#top-clock').innerText(),tf:st.tf,alerts:al.map(a=>a.text)});
      if(stops.length===1)await page.screenshot({path:shot('phase1-stop')});
      runStart=Date.now();await page.locator('#run-next').click();
    }
    await page.locator('#resident-day-results').waitFor({timeout:30000});
    const total=(Date.now()-t0)/1000;
    console.log('stops',JSON.stringify(stops));
    console.log(`phase1 next-decision: ${stops.length} stops, wall ${total.toFixed(1)}s (probe pauses included), playback-only (click→stop/result) ${(running/1000).toFixed(1)}s`);
    assert.ok(stops.length>=1,'기본 1단계 대표 계획에서 주목할 사건으로 한 번 이상 멈춤');
    assert.ok(total<20,'결정 없는 단계는 20초 안에 끝남: '+total.toFixed(1)+'s');
    assert.deepEqual(errors,[]);await page.close();
    console.log('PASS ② phase 1 via ⏭: cause visible at every stop, finished in '+total.toFixed(1)+'s');
  }
  // ③·④ 3단계
  async function phase3(page){
    await page.evaluate(()=>{PB.App.startGame();const s=PB.App.s;s.tutorialSeen=true;s.phase=3;s.owned=4;s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:id<=2?id:null,offset:0}));PB.Session.beginPlan(s);
      PB.Session.updateRoute(s,1,{nodes:['F','C','B','A'],stops:[true,true,true,true]});PB.Session.updateRoute(s,2,{nodes:['D','A','G'],stops:[true,true,true]});PB.Session.startRun(s);PB.App.go('run');});
    for(let i=0;i<20&&await page.locator('dialog:modal').count();i++){await page.keyboard.press('Escape');await page.waitForTimeout(50);}
  }
  {
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+(process.env.SHOT3D?'':'?no3d=1'));await phase3(page);
    // 페이지 안에서 5ms마다 재생 상태를 기록(3D·느린 프레임에서도 감속 구간을 놓치지 않게)
    await page.evaluate(()=>{window.__samples=[];window.__sampler=setInterval(()=>{const st=PB.UI.runState();if(!st)return;const stage=document.querySelector('#stage').getBoundingClientRect(),a=document.querySelector('#stage-overlay .run-alert'),r=a&&a.querySelector('.run-alert-ring').getBoundingClientRect();
      window.__samples.push({ms:performance.now(),tf:st.tf,slowed:st.slowed,shown:st.shown,pending:st.pendingEmergency,s1:document.querySelector('#speed-1').getAttribute('aria-pressed'),s2:document.querySelector('#speed-2').getAttribute('aria-pressed'),alert:a?a.querySelector('.run-alert-label').textContent:null,inside:!!r&&r.left>=stage.left&&r.right<=stage.right&&r.top>=stage.top&&r.bottom<=stage.bottom,status:document.querySelector('#run-status').textContent});},5);});
    await page.locator('#speed-2').click();
    await page.locator('#emergency-dialog[open]').waitFor({timeout:30000});
    const samples=await page.evaluate(()=>{clearInterval(window.__sampler);return window.__samples;});
    // 30분 전 감속 — 2×를 골랐어도 1×로 표시되고 원인 정류장에 예고 고리
    const ms=await page.evaluate(()=>PB.config.playback.msPerMinute);const zone=samples.filter(x=>x.slowed&&x.tf<34&&x.pending==null);
    assert.ok(zone.length>=1,'감속 구간 표본');
    zone.forEach(x=>{assert.ok(x.tf>=34-30*120/1080-1e-6,'감속 시작 '+x.tf);assert.equal(x.shown,1);assert.equal(x.s1,'true');assert.equal(x.s2,'false');assert.match(x.alert,/^긴급 조정 예고 · .+ 대기 \d+명$/);assert.ok(x.inside,'예고 고리가 지도 안');assert.match(x.status,/30분 전/);});
    const clicked=samples.findIndex(x=>x.s2==='true');assert.ok(clicked>=0);assert.ok(samples.slice(clicked).filter(x=>!x.slowed&&x.tf<34-30*120/1080-0.2).every(x=>x.s2==='true'),'2×를 고른 뒤 감속 전에는 2×');
    const tfs=[...new Set(zone.map(x=>x.tf))];
    if(tfs.length>=2){const a=zone[0],b=zone[zone.length-1],rate=(b.tf-a.tf)/(b.ms-a.ms)*ms;console.log('slow-zone playback rate',rate.toFixed(2),'× (samples',zone.length,', tf',a.tf.toFixed(2),'→',b.tf.toFixed(2),')');assert.ok(rate<1.3,'감속 구간은 1× '+rate);}
    else console.log('slow-zone: only',tfs.length,'distinct sample(s) — rate not measured');
    const before=samples.slice(clicked).filter(x=>!x.slowed&&x.tf<28);if(before.length>=2){const a=before[0],b=before[before.length-1];console.log('before-zone playback rate',((b.tf-a.tf)/(b.ms-a.ms)*ms).toFixed(2),'×');}
    // 조정 창: 모달 아님, 패널 안, 지도와 겹치지 않음, 원인·버스 위치
    const box=await page.evaluate(()=>{const d=document.querySelector('#emergency-dialog'),r=d.getBoundingClientRect(),m=document.querySelector('#stage').getBoundingClientRect();return {modal:d.matches(':modal'),inPanel:!!d.closest('#panel'),overlap:!(r.right<=m.left||r.left>=m.right||r.bottom<=m.top||r.top>=m.bottom),cause:document.querySelector('#emergency-cause').textContent,buses:[...document.querySelectorAll('#emergency-buses li')].map(l=>l.textContent)};});
    assert.equal(box.modal,false);assert.ok(box.inPanel);assert.equal(box.overlap,false,'조정 창이 지도를 가리지 않음');
    const al2=await alertsOnMap(page);assert.equal(al2.length,1);assert.ok(al2[0].inside);
    assert.match(box.cause,new RegExp('원인 정류장 · '+(await page.evaluate(n=>PB.App.nodeName(n),al2[0].node))+' 대기 \\d+명'));
    assert.equal(box.buses.length,4,'버스 4대 위치');assert.ok(box.buses.some(t=>/이동 중|정류장|출발 대기/.test(t)));assert.ok(box.buses.some(t=>/쉬는 중/.test(t)));
    assert.equal(await page.evaluate(()=>PB.App.s.runCursor),34);
    // 지도는 계속 조작 가능(모달 아님) — 정류장 정보 클릭
    console.log('emergency window',JSON.stringify(box));
    await page.screenshot({path:shot('emergency'+(process.env.SHOT3D?'-3d':''))});
    // ④-a 창이 열린 상태에서 끝까지 건너뛰기 → 확인창 2회, 아니요면 그대로
    await page.locator('#run-skip').click();await page.locator('#confirm-skip[open]').waitFor();
    assert.equal(await page.locator('#confirm-skip-h').innerText(),'남은 긴급 조정 기회 2회를 쓰지 않고 넘어갈까요?');
    await page.locator('#skip-no').click();assert.equal(await page.locator('#emergency-dialog[open]').count(),1);assert.equal(await page.evaluate(()=>(PB.App.s.emergencyLog||[]).length),0);
    // 결정 → 마지막으로 고른 2×로 복귀
    await page.locator('#emergency-bus').selectOption('3');await page.locator('#emergency-route').selectOption('2');await page.locator('#emergency-apply').click();
    const after=await state(page);assert.equal(after.speed,2);assert.equal(after.shown,2,'결정 뒤 2×');assert.equal(await page.locator('#speed-2').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#stage-overlay .run-alert').count(),0,'결정 뒤 고리 사라짐');
    assert.equal(await page.evaluate(()=>localStorage.getItem('ethicity.publicness.speed')),'2');
    // ④-b 남은 1회 → 확인창 문구, 예 → 남은 기회는 ‘변경 없이 계속’으로 기록되고 결과 화면
    await page.locator('#run-skip').click();await page.locator('#confirm-skip[open]').waitFor();
    assert.equal(await page.locator('#confirm-skip-h').innerText(),'남은 긴급 조정 기회 1회를 쓰지 않고 넘어갈까요?');
    await page.locator('#skip-yes').click();await page.locator('#resident-day-results').waitFor({timeout:15000});
    assert.deepEqual(await page.evaluate(()=>PB.App.s.emergencyLog.map(a=>[a.at,a.busId])),[[34,3],[67,null]]);
    assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);
    assert.deepEqual(errors,[]);await page.close();
    console.log('PASS ③④ slow-down to 1× with preview ring, non-blocking window with cause+bus positions, back to 2× after decision, skip confirm n=2/1');
  }
  // ④-c 남은 기회가 없으면 확인 없이 끝까지 / ⏭는 3단계에서도 조정 시점에서 멈춘다
  {
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'?no3d=1');await phase3(page);
    for(let i=0;i<40;i++){await page.locator('#run-next').click();await page.waitForFunction(()=>PB.UI.runState().hold,null,{timeout:20000,polling:20});if(await page.locator('#emergency-dialog[open]').count())break;}
    assert.equal(await page.evaluate(()=>PB.App.s.runCursor),34);await page.locator('#emergency-continue').click();
    for(let i=0;i<40;i++){await page.locator('#run-next').click();await page.waitForFunction(()=>PB.UI.runState().hold,null,{timeout:20000,polling:20});if(await page.locator('#emergency-dialog[open]').count())break;}
    assert.equal(await page.evaluate(()=>PB.App.s.runCursor),67);await page.locator('#emergency-continue').click();
    await page.locator('#run-skip').click();assert.equal(await page.locator('#confirm-skip[open]').count(),0,'남은 기회 0 → 확인창 없음');
    await page.locator('#resident-day-results').waitFor({timeout:15000});assert.deepEqual(errors,[]);await page.close();
    console.log('PASS ④-c ⏭ stops at both checkpoints, skip without confirm when none left');
  }
}finally{if(browser)await browser.close();server.close();}
