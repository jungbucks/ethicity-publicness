// 운행 중 노선 고치기(하루 한 번, 2026-11-09) 브라우저 검증 — 헤드리스 Edge. 3D는 SHOT3D=1(swiftshader).
//  ① 1280: 시작 때 버튼은 꺼져 있고 이유 ‘11:00~15:00에 한 번 쓸 수 있어요’ → ⏭가 11:00에 한 번 멈추고 한 줄 → 버튼 켜짐
//  ② 버튼 → 재생 멈춤·창(정류장 더하기: 노선·정류장·자리, 지도 고리, 바뀐 모양 한 줄, 예상·추천 없음) → 고치기 → 다시 달림·‘오늘은 이미 고쳤어요’·지도 노선 모양 바뀜
//  ③ 끝까지 → 결과 ‘생긴 일’ 한 줄 ‘HH:MM 노선 고침 · ○○ 노선에 ○○ 더함’ → 새로고침해도 같은 결과
//  ④ 375 터치: 버스 한 대 옮기기 / ⑤ 텍스트 모드: 패널 버튼으로 정류장 빼기 / ⑥ 그만두기 = 안 쓴 것
// 스크린샷: SHOT_DIR(없으면 tests/_shot-midday-*.png)
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const here=path.dirname(fileURLToPath(import.meta.url)),D3=!!process.env.SHOT3D,tag=D3?'-3d':'-2d',shot=name=>path.join(process.env.SHOT_DIR||here,(process.env.SHOT_DIR?'':'_shot-')+'midday-'+name+tag+'.png');
const base=`http://127.0.0.1:${server.address().port}/publicness/`+(D3?'':'?no3d=1');
async function phase3(page){
  await page.evaluate(()=>{localStorage.clear();PB.App.startGame();const s=PB.App.s;s.tutorialSeen=true;s.phase=3;s.owned=4;s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:id<=2?id:null,offset:0}));PB.Session.beginPlan(s);
    PB.Session.updateRoute(s,1,{nodes:['F','C','B','A'],stops:[true,true,true,true]});PB.Session.updateRoute(s,2,{nodes:['D','A','G'],stops:[true,true,true]});PB.Session.startRun(s);PB.App.go('run');});
  for(let i=0;i<20&&await page.locator('dialog:modal').count();i++){await page.keyboard.press('Escape');await page.waitForTimeout(50);}
  await page.evaluate(()=>{if(!PB.UI.runState().paused)document.querySelector('#run-pause').click();}); // 3D(swiftshader)는 느려 시작 직후 1×로도 11:00을 넘길 수 있어 멈춘 채 시작(⏭가 다시 달림)
}
const state=page=>page.evaluate(()=>PB.UI.runState());
const why=(page,id='run-fix')=>page.locator('#'+id+'-why').innerText();
async function toWindow(page){ // ⏭를 눌러 11:00 멈춤까지(그 전 인물 멈춤은 다시 ⏭)
  for(let i=0;i<12;i++){await page.locator('#run-next').click();await page.waitForFunction(()=>PB.UI.runState().hold,null,{timeout:30000,polling:20});const st=await state(page);if(st.tf>=st.fixAt)return st;}
  throw new Error('11:00 멈춤 없음');
}
function noOverlap(a,b){return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;}
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:D3?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  // ①②③ 1280
  {
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await phase3(page);
    await page.locator('#run-fix').waitFor();
    assert.equal(await page.locator('#run-fix').isDisabled(),true,'창 밖이면 꺼짐');assert.equal(await why(page),'11:00~15:00에 한 번 쓸 수 있어요');
    assert.equal(await page.locator('#run-fix').innerText(),'노선 고치기 · 한 번');
    await page.screenshot({path:shot('closed-1280')});
    const st=await toWindow(page);assert.equal(st.tf,40);
    assert.match(await page.locator('#run-statusbar-text').innerText(),/^11:00 .*이제 15:00까지 노선을 한 번 고칠 수 있어요/);
    assert.equal(await page.locator('#run-fix').isDisabled(),false);assert.equal(await why(page),'지금 한 번 고칠 수 있어요');
    await page.screenshot({path:shot('open-1280')});
    // 다시 달리다가 아무 때나 누름
    await page.locator('#run-pause').click();await page.waitForFunction(()=>PB.UI.runState().tf>44,null,{timeout:30000,polling:20});
    const pre=await page.evaluate(()=>({tf:PB.UI.runState().tf,dis:document.querySelector('#run-fix').disabled,why:document.querySelector('#run-fix-why').textContent}));
    await page.locator('#run-fix').dispatchEvent('click'); /* 재생 중 누름 — 3D 헤드리스는 프레임이 느려 click()의 ‘안정’ 대기 동안 15:00을 넘김 */
    const at=await page.evaluate(()=>PB.UI.runState().pendingEmergency);assert.ok(at>=44&&at<=66,'고친 시각 '+at+' '+JSON.stringify(pre)+' '+JSON.stringify(await page.evaluate(()=>({tf:PB.UI.runState().tf,why:document.querySelector('#run-fix-why').textContent}))));
    assert.equal(await page.evaluate(()=>PB.App.s.runCursor),at);
    const tf1=(await state(page)).tf;await page.waitForTimeout(400);assert.equal((await state(page)).tf,tf1,'창이 열린 동안 멈춤');
    const box=await page.evaluate(()=>{const d=document.querySelector('#emergency-dialog'),r=d.getBoundingClientRect(),m=document.querySelector('#stage').getBoundingClientRect();return {modal:d.matches(':modal'),inPanel:!!d.closest('#panel'),overlap:!(r.right<=m.left||r.left>=m.right||r.bottom<=m.top||r.top>=m.bottom),text:d.innerText};});
    assert.equal(box.modal,false);assert.ok(box.inPanel);assert.equal(box.overlap,false,'창이 지도를 가리지 않음');
    assert.match(box.text,/노선 고치기/);assert.match(box.text,/버스는 가던 정류장까지 간 뒤 바뀐 노선을 따라요/);assert.match(box.text,/지금 (기다리는 사람|정류장에서)/);
    assert.doesNotMatch(box.text,/AI|추천|예상/,'AI 제안·예상 없음');
    await page.locator('#fix-kind-add').click();
    assert.equal(await page.locator('#fix-apply').isDisabled(),true);
    const node=await page.evaluate(()=>[...document.querySelectorAll('#fix-node option')].find(o=>o.value&&!o.disabled).value);
    await page.locator('#fix-node').selectOption(node);
    assert.ok(await page.locator('#fix-pos').count(),'넣을 곳');
    const res=await page.locator('#fix-result').innerText();assert.match(res,/^바뀐 .+ 노선: .+ → /);
    const ring=await page.evaluate(()=>[...document.querySelectorAll('#stage-overlay .run-alert')].map(a=>[a.dataset.node,a.textContent]));assert.deepEqual(ring,[[node,'여기에 더해요']]);
    await page.screenshot({path:shot('dialog-1280')});
    await page.locator('#fix-apply').click();
    assert.equal(await page.locator('#emergency-dialog').count(),0,'창 닫힘');
    const after=await state(page);assert.equal(after.fixing,false);assert.equal(after.paused,false,'다시 달림');
    assert.equal(await page.evaluate(()=>PB.App.s.midChanges.length),1);
    await page.waitForFunction(()=>document.querySelector('#run-fix-why').textContent==='오늘은 이미 고쳤어요',null,{timeout:5000});assert.equal(await page.locator('#run-fix').isDisabled(),true);
    await page.locator('#run-pause').click();await page.waitForTimeout(400);await page.screenshot({path:shot('after-1280')});await page.locator('#run-pause').click();
    const routes=await page.evaluate(()=>PB.Hud.routesNow().map(r=>r.route.nodes.join('')));assert.ok(routes.some(r=>r.includes(node)),'지도·인물 경로가 바뀐 노선 모양 '+routes);
    await page.locator('#run-skip').click();await page.locator('#resident-day-results, #result-next-bar').first().waitFor({timeout:20000});
    const events=await page.locator('#panel').innerText(),name=await page.evaluate(n=>PB.App.nodeName(n),node);
    const line=new RegExp('\\d\\d:\\d\\d 노선 고침 · .+ 노선에 '+name+' 더함');assert.match(events,line,'결과 생긴 일 한 줄');
    await page.locator('#result-events').scrollIntoViewIfNeeded();await page.screenshot({path:shot('result-1280'),fullPage:false});
    const hash=await page.evaluate(()=>PB.Sim.hash(PB.App.s.current.result));
    await page.reload();await page.locator('#btn-continue').waitFor({state:'visible',timeout:10000});await page.locator('#btn-continue').click();
    await page.waitForFunction(()=>PB.App.s.current&&PB.App.s.current.result,null,{timeout:10000});
    assert.equal(await page.evaluate(()=>PB.Sim.hash(PB.App.s.current.result)),hash,'새로고침해도 같은 결과');
    assert.deepEqual(errors,[]);await page.close();
    console.log('PASS ①②③ 1280: closed/open button, ⏭ stops at 11:00, add stop dialog, result line, reload same');
  }
  // ④ 375 터치 — 버스 한 대 옮기기, ⑥ 그만두기
  {
    const ctx=await browser.newContext({viewport:{width:375,height:740},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await phase3(page);await toWindow(page);
    await page.locator('#run-fix').tap();await page.locator('#emergency-dialog[open]').waitFor();
    await page.locator('#fix-cancel').tap();assert.equal(await page.evaluate(()=>(PB.App.s.midChanges||[]).length),0,'그만두기 = 안 씀');
    assert.equal(await page.locator('#run-fix').isDisabled(),false,'다시 쓸 수 있음');
    await page.locator('#run-fix').tap();await page.locator('#emergency-dialog[open]').waitFor();
    await page.screenshot({path:shot('dialog-375')});
    await page.locator('#fix-kind-move').tap();await page.locator('#fix-bus').selectOption('3');await page.locator('#fix-to').selectOption('1');
    assert.match(await page.locator('#fix-result').innerText(),/부터 .+ 노선을 달려요/);
    const sz=await page.evaluate(()=>({w:document.documentElement.scrollWidth,vw:innerWidth,apply:document.querySelector('#fix-apply').getBoundingClientRect().height}));assert.ok(sz.w<=sz.vw,'가로 넘침 없음 '+JSON.stringify(sz));assert.ok(sz.apply>=40);
    await page.screenshot({path:shot('dialog-375-move')});
    await page.locator('#fix-apply').tap();assert.equal(await page.evaluate(()=>PB.App.s.midChanges[0].kind),'move');
    assert.equal(await page.evaluate(()=>PB.App.s.current.result.log.some(e=>e.type==='reassign'&&e.bus===3)),true);
    await page.screenshot({path:shot('after-375')});
    assert.deepEqual(errors,[]);await ctx.close();console.log('PASS ④⑥ 375 touch: cancel keeps the chance, move one bus');
  }
  // ⑤ 텍스트 모드 — 패널 버튼으로 정류장 빼기
  {
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await phase3(page);
    await page.locator('#minimal-text-toggle').click();await page.locator('#run-fix-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#run-fix-panel').isDisabled(),true);assert.equal(await why(page,'run-fix-panel'),'11:00~15:00에 한 번 쓸 수 있어요');
    await toWindow(page);await page.locator('#run-fix-panel').click();await page.locator('#emergency-dialog[open]').waitFor();
    await page.locator('#fix-kind-remove').click();await page.locator('#fix-route').selectOption('1');await page.locator('#fix-node').selectOption('C');
    assert.match(await page.locator('#fix-result').innerText(),/^바뀐 .+: .+ → /);
    await page.screenshot({path:shot('text-mode')});
    await page.locator('#fix-apply').click();const c=await page.evaluate(()=>PB.App.s.midChanges[0]);assert.deepEqual([c.kind,c.node,c.route.nodes.join('')],['remove','C','FBA']);
    assert.deepEqual(errors,[]);await page.close();console.log('PASS ⑤ text mode: panel button removes a stop');
  }
}finally{if(browser)await browser.close();server.close();}
