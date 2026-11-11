// 운행 속도 재설계(2-4) 브라우저 검증(헤드리스 Edge, 실제 시계):
//  ① 저장된 배속 4 → 2로 바뀌고 4× 버튼이 없다
//  ② 기본 세팅 1단계를 ‘⏭ 다음 멈춤까지’(11-02 P1-2: 주요 인물 판정에서만 멈춤)로만 진행 — 멈출 때마다 원인 정류장 고리·문구가 지도 안에 보이고, 단계가 20초 안에 끝난다
//  ③ 3단계 2×(2026-11-09): 정해진 조정 시각·감속 없음 → 「노선 고치기 · 한 번」 창이 지도를 가리지 않음 → 고친 뒤 2×로 복귀
//  ④ ‘끝까지 건너뛰기’는 확인 없이(안 쓰면 아무 일도 없음), ⏭는 11:00에 한 번 멈춤
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
      /* 2026-11-02 P1-2: 멈춤은 주요 인물 판정(왕복 완료·기준 초과)에서만, 남은 멈춤이 없으면 ⏭가 꺼져 ‘끝까지’로 마무리 */
      runStart=Date.now();if(await page.locator('#run-next').isDisabled())await page.locator('#run-skip').click();else await page.locator('#run-next').click();
    }
    await page.locator('#resident-day-results').waitFor({timeout:30000});
    const total=(Date.now()-t0)/1000;
    console.log('stops',JSON.stringify(stops));
    console.log(`phase1 next-decision: ${stops.length} stops, wall ${total.toFixed(1)}s (probe pauses included), playback-only (click→stop/result) ${(running/1000).toFixed(1)}s`);
    assert.ok(stops.length>=1,'기본 1단계 대표 계획에서 주요 인물 판정으로 한 번 이상 멈춤(11-02 P1-2)');
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
  /* ③·④ 3단계(2026-11-09 새 규칙): 정해진 조정 시각·30분 전 감속 없음 — 2×는 11:00 전후로 그대로 2×.
   * ⏭는 11:00(노선 고치기 시작)에 한 번 멈춤 → 「노선 고치기 · 한 번」 창은 비모달·패널 안·지도 안 가림·뒤쪽 inert → 고치면 고른 2×로.
   * 끝까지 건너뛰기는 노선 고치기를 안 썼어도 묻지 않는다 */
  {
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+(process.env.SHOT3D?'':'?no3d=1'));await phase3(page);
    await page.evaluate(()=>{window.__samples=[];window.__sampler=setInterval(()=>{const st=PB.UI.runState();if(!st)return;window.__samples.push({tf:st.tf,slowed:st.slowed,shown:st.shown});},5);});
    await page.locator('#speed-2').click();
    /* 2026-11-11 플레이테스트 6: 어떤 배속이든 11:00에 한 번 멈춰서 알린다(전에는 2×에서 4초쯤만 열려 있었다) */
    await page.waitForFunction(()=>{const st=PB.UI.runState();return st.hold&&st.tf===st.fixAt;},null,{timeout:30000,polling:20});
    assert.match(await page.locator('#run-statusbar-text').innerText(),/^11:00 .*이제 15:00까지 노선을 한 번 고칠 수 있어요/);
    const samples=await page.evaluate(()=>{clearInterval(window.__sampler);return window.__samples;});
    assert.ok(samples.filter(x=>x.tf>30&&x.tf<40).length>=1,'표본');
    assert.ok(samples.filter(x=>x.tf>30&&x.tf<40).every(x=>!x.slowed&&x.shown===2),'11:00 전까지 감속 없이 2×');
    assert.equal(await page.locator('#run-fix').isDisabled(),false,'11:00 뒤 버튼 켜짐');
    await page.locator('#run-fix').click();await page.locator('#emergency-dialog[open]').waitFor();
    const box=await page.evaluate(()=>{const d=document.querySelector('#emergency-dialog'),r=d.getBoundingClientRect(),m=document.querySelector('#stage').getBoundingClientRect();return {modal:d.matches(':modal'),inPanel:!!d.closest('#panel'),overlap:!(r.right<=m.left||r.left>=m.right||r.bottom<=m.top||r.top>=m.bottom),now:document.querySelector('#fix-now').textContent};});
    assert.equal(box.modal,false);assert.ok(box.inPanel);assert.equal(box.overlap,false,'창이 지도를 가리지 않음');assert.match(box.now,/지금 (기다리는 사람|정류장에서)/);
    await page.screenshot({path:shot('emergency'+(process.env.SHOT3D?'-3d':''))});
    assert.equal(await page.evaluate(()=>document.querySelector('.stage-col').inert&&document.querySelector('#topbar').inert),true);
    await page.locator('#fix-kind-move').click();await page.locator('#fix-bus').selectOption('3');await page.locator('#fix-to').selectOption('2');await page.locator('#fix-apply').click();
    const after=await state(page);assert.equal(after.speed,2);assert.equal(after.shown,2,'고친 뒤 2×');assert.equal(await page.locator('#speed-2').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('ethicity.publicness.speed')),'2');
    await page.locator('#run-skip').click();assert.equal(await page.locator('dialog:modal').count(),0,'확인창 없음');
    await page.locator('#resident-day-results').waitFor({timeout:15000});
    assert.deepEqual(await page.evaluate(()=>PB.App.s.midChanges.map(a=>[a.kind,a.busId])),[['move',3]]);assert.equal(await page.evaluate(()=>(PB.App.s.emergencyLog||[]).length),0);
    assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);
    assert.deepEqual(errors,[]);await page.close();
    console.log('PASS ③④ no slow-down, button opens non-blocking window, back to 2× after the change, skip without confirm');
  }
  // ④-c ⏭는 3단계에서 11:00에 한 번 멈추고(상태 줄 한 줄), 안 써도 끝까지 확인 없이
  {
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'?no3d=1');await phase3(page);
    let hit=null;for(let i=0;i<40;i++){await page.locator('#run-next').click();await page.waitForFunction(()=>PB.UI.runState().hold,null,{timeout:20000,polling:20});const st=await state(page);if(st.tf>=st.fixAt){hit=st;break;}}
    assert.equal(hit&&hit.tf,40);assert.match(await page.locator('#run-statusbar-text').innerText(),/이제 15:00까지 노선을 한 번 고칠 수 있어요/);
    assert.equal(await page.locator('#emergency-dialog').count(),0,'창은 저절로 안 열림');
    await page.locator('#run-skip').click();assert.equal(await page.locator('dialog:modal').count(),0);
    await page.locator('#resident-day-results').waitFor({timeout:15000});assert.equal(await page.evaluate(()=>(PB.App.s.midChanges||[]).length),0);assert.deepEqual(errors,[]);await page.close();
    console.log('PASS ④-c ⏭ stops once at 11:00, skip without confirm when unused');
  }
}finally{if(browser)await browser.close();server.close();}
