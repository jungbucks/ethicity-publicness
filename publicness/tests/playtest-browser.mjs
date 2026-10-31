// 2026-10-23 플레이테스트 반영 검증(헤드리스 Edge, 2D 지도): 배속별 결과 일치·2배속 = 하루의 절반(2026-10-27 4× 제거 → ‘다음 결정까지’)·배속 기억(단계 전환·새로고침),
// 운행 중/결과 화면 새로고침 복구와 중복 정산 방지, 출발 확인의 인물 경고, 1148×977에서 출발 줄이 편집 내용을 덮지 않음
import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const url=`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`;
async function setPlan(page,routes){
  await page.evaluate((routes)=>{const s=PB.App.s,S=PB.Session;s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);
    routes.forEach(([ns,n])=>{const r=S.addRoute(s,{nodes:ns,stops:ns.map(()=>true)});s.draft.buses.filter(b=>b.routeNum==null).slice(0,n).forEach(b=>S.assign(s,b.id,r.num));});PB.App.render();},routes);
}
const P1=[[['F','C','B','A'],1],[['D','A','G'],1]];
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  // 1) 같은 계획을 1·2·4배속으로 — 기록(수송·대기·비용·인물 판정)이 같다
  const records=[];
  for(const speed of [1,2]){
    const page=await browser.newPage({viewport:{width:1366,height:900}});await page.goto(url);
    await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();await beginPlan(page);await setPlan(page,P1);
    await page.evaluate(()=>window.__pbFast=true);await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.locator('#speed-'+speed).click();
    await page.locator('#resident-summary').waitFor({timeout:60000});
    records.push(await page.evaluate(()=>JSON.stringify({m:PB.App.s.history[0].metrics,r:PB.App.s.history[0].residents})));await page.close();
  }
  assert.equal(records[0],records[1]);
  // 2) 2배속 실제 재생 시간 ≈ 하루의 절반(가짜 시계), 배속은 단계 전환·새로고침 뒤에도 유지
  const ctx=await browser.newContext({viewport:{width:1148,height:977}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto(url);
  await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();await beginPlan(page);await setPlan(page,P1);
  // 출발 줄은 편집 내용 영역 밖(아래)에 있어 덮지 않는다
  const lay=await page.evaluate(()=>{const b=document.querySelector('.panel-body').getBoundingClientRect(),bar=document.querySelector('#depart-bar').getBoundingClientRect();return {bodyBottom:b.bottom,barTop:bar.top,barBottom:bar.bottom};});
  assert.ok(lay.bodyBottom<=lay.barTop+1&&lay.barBottom<=977,'출발 줄이 스크롤 영역과 겹치지 않음 '+JSON.stringify(lay));
  for(const q of ['#btn-new-route','#stop-picker summary','.route-summary']){await page.locator(q).scrollIntoViewIfNeeded();const r=await page.locator(q).boundingBox();assert.ok(r.y+r.height<=lay.barTop,q+' 가 출발 줄 위에서 보임');}
  await page.locator('#btn-depart').click();
  assert.match(await page.locator('#confirm-depart-body').innerText(),/운행 구성/);await page.locator('#confirm-yes').click();await page.locator('#speed-2').click();
  const half=await page.evaluate(()=>PB.config.bus.window*PB.config.playback.msPerMinute/2);
  const t0=await page.evaluate(()=>Date.now());await page.clock.runFor(half-2000);assert.equal(await page.evaluate(()=>PB.App.s.stage),'run','2배속 절반 직전엔 아직 운행 중');
  await page.clock.runFor(4000);await page.locator('#resident-summary').waitFor();assert.ok(await page.evaluate(t0=>Date.now()-t0,t0)<=half+3000);
  // 결과 화면 새로고침 → 이어하기: 같은 결과, 중복 정산 없음
  const before=await page.evaluate(()=>({h:PB.App.s.history.length,bal:PB.App.s.history.reduce((a,h)=>a+h.metrics.costs.total,0),lead:document.querySelector('.outcome-lead').textContent}));
  await page.reload();await page.locator('#btn-continue').click();await page.locator('#resident-summary').waitFor();
  const after=await page.evaluate(()=>({h:PB.App.s.history.length,bal:PB.App.s.history.reduce((a,h)=>a+h.metrics.costs.total,0),lead:document.querySelector('.outcome-lead').textContent}));
  assert.deepEqual(after,before);
  await page.locator('#btn-next-phase').click();await page.locator('#btn-begin-plan').waitFor();assert.equal(await page.evaluate(()=>PB.App.s.phase),2);
  await beginPlan(page);await setPlan(page,[[['F','C','B','A'],1],[['D','A','G'],1],[['E','H','A'],1]]);
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
  assert.equal(await page.locator('#speed-2').getAttribute('aria-pressed'),'true','다음 단계에도 2배속');
  await page.clock.runFor(8000);
  // 운행 중 새로고침 → 출발 직전 계획으로, 정산 없음 → 다시 출발하면 한 번만 기록
  await page.reload();assert.match(await page.locator('#continue-note').innerText(),/2 \/ 5단계 운행/);await page.locator('#btn-continue').click();
  await page.locator('#btn-depart').waitFor();assert.match(await page.locator('#plan-message').innerText(),/출발 직전 계획으로 돌아왔어요/);
  assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);assert.equal(await page.evaluate(()=>PB.App.s.draft.buses.filter(b=>b.routeNum!=null).length),3);
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
  assert.equal(await page.locator('#speed-2').getAttribute('aria-pressed'),'true','새로고침 뒤에도 2배속');
  await page.clock.runFor(32000);await page.locator('#resident-summary').waitFor();assert.equal(await page.evaluate(()=>PB.App.s.history.length),2);
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS 1×/2× identical records, 2× ≈ half day, speed kept across phase and reload, result/run reload restore without double settlement, depart bar clear at 1148×977');
}finally{if(browser)await browser.close();server.close();}
