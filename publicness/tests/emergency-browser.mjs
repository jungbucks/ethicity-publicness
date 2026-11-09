// 2026-11-09 새 규칙: 정해진 시각(10:06·15:03) 긴급 조정 → 11:00~15:00에 한 번 「노선 고치기 · 한 번」(기본 화면 minimal=0 = 패널 버튼).
// ⏭는 11:00에 한 번 멈춤 → 버스 한 대 옮기기 → 새로고침해도 기록·버튼 상태 유지 → 끝까지 → 정산 한 번, 결과 ‘생긴 일’·‘운행 중 바꾼 것’
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true});
async function toWindow(page){for(let i=0;i<12;i++){await page.locator('#run-next').click();await page.waitForFunction(()=>PB.UI.runState()&&PB.UI.runState().hold,null,{timeout:20000,polling:20});const st=await page.evaluate(()=>PB.UI.runState());if(st.tf>=st.fixAt)return st;}throw new Error('no 11:00 stop');}
try{const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGE ERROR',e.stack));await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1&minimal=0`);
 await page.evaluate(()=>{PB.App.startGame();const s=PB.App.s;s.phase=3;s.owned=4;s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:id===1?1:null,offset:0}));PB.Session.beginPlan(s);PB.Session.updateRoute(s,1,{nodes:['A','B'],stops:[true,true]});PB.Session.updateRoute(s,2,{nodes:['F','D'],stops:[true,true]});PB.Session.startRun(s);PB.App.go('run');});
 assert.equal(await page.locator('#run-skip').count(),1,'run can be skipped');
 assert.equal(await page.locator('#run-fix-panel').isDisabled(),true);
 const st=await toWindow(page);assert.equal(st.tf,40);
 await page.locator('#run-fix-panel').click();await page.locator('#emergency-dialog[open]').waitFor();
 assert.equal(await page.evaluate(()=>PB.App.s.runCursor),40);
 await page.locator('#fix-kind-move').click();await page.locator('#fix-bus').selectOption('2');await page.locator('#fix-to').selectOption('2');await page.locator('#fix-apply').click();
 assert.equal(await page.evaluate(()=>PB.App.s.midChanges.length),1);
 await page.reload();await page.locator('#btn-continue').click();await page.locator('#run-fix-panel').waitFor();
 assert.equal(await page.evaluate(()=>PB.App.s.midChanges.length),1);assert.equal(await page.locator('#run-fix-panel-why').innerText(),'오늘은 이미 고쳤어요');
 await page.locator('#run-skip').click();await page.locator('#resident-day-results').waitFor();
 assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);assert.equal(await page.evaluate(()=>PB.App.s.midChanges.length),1);
 assert.equal(await page.locator('#result-events li').filter({hasText:'노선 고침'}).count(),1);
 assert.match(await page.locator('#result-events li').filter({hasText:'노선 고침'}).innerText(),/^11:00 노선 고침 · 대기 버스 한 대를 .+ 노선으로 옮김$/);
 await page.locator('#result-details > summary').click();await page.locator('details.detail-sub[data-for="emergency-report"] > summary').click();assert.ok(await page.locator('#emergency-report').isVisible());
 console.log('PASS: ⏭ stops at 11:00, one change, resume keeps it, settlement once, result lines');
}finally{await browser.close();server.close();}
