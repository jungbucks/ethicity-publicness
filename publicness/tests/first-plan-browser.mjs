import {beginPlan} from './browser-fixture.mjs';
// 첫 계획 안내: 시작 안내 문구, 주요 인물 칩(지도 표시·누적), 출발 막힘 이유와 바로 고치기, 편집 팁 위치, 같은 AI 제안 알림.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['2d','3d']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/${mode==='2d'?'?no3d=1':''}`);
  await page.locator('#btn-start').click();
  while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}
  if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
  const msg=()=>page.locator('#plan-message').textContent();
  // 시작 안내와 인물 칩
  assert.match(await msg(),/정류장 두 곳을 차례로 누르면 1번 노선/);
  assert.equal(await page.locator('#depart-blocker').count(),0,'no blocker before any route exists');
  assert.equal(await page.locator('.resident-chip').count(),3);
  assert.match(await page.locator('#resident-chip-narae').textContent(),/나래 · 09:03 외곽 마을 → 병원·공공서비스 · 누적 0\/4회/);
  await page.locator('#resident-chip-narae').click();
  assert.match(await msg(),/나래 · 출발 외곽 마을, 목적지 병원·공공서비스/);
  // (AI 비교는 노선을 잇기 전에)
  if(mode==='2d')assert.deepEqual(await page.locator('#stage-svg .stop-g.selected').evaluateAll(ns=>ns.map(n=>n.dataset.node).sort()),['D','F']);
  assert.equal(await page.locator('#edit-tips').count(),0,'edit tips hidden for empty route');
  // 같은 제안 알림: 빈 시작(기본 맵 1단계)은 세 목표 제안이 같다. 첫 목표엔 없고 두 번째에 표시, 계획을 바꾸면 비교 기록 초기화
  await page.locator('#ai-tools summary').click();await page.locator('#goal-reach').click();await page.locator('#rec-card').waitFor({timeout:60000});
  assert.equal(await page.locator('#rec-same').count(),0);
  await page.locator('#goal-time').click();await page.locator('#rec-card').waitFor({timeout:60000});
  assert.match(await page.locator('#rec-same').textContent(),/‘소외 지역 연결’ 목표의 제안과 같은 노선이에요/);
  await page.locator('#rec-reject').click();
  assert.match(await msg(),/내 노선을 유지했어요/);
  // 한 곳만 → 이어 갈 안내
  await page.evaluate(()=>PB.App.onNodeClick('F'));
  await page.evaluate(()=>PB.App.onNodeClick('D'));await page.locator('#btn-undo').click();assert.match(await msg(),/방금 편집을 되돌렸어요/);
  await page.locator('#ai-tools summary').click();await page.locator('#goal-profit').click();await page.locator('#rec-card').waitFor({timeout:60000});assert.equal(await page.locator('#rec-same').count(),0,'editing clears comparison');await page.locator('#rec-reject').click();
  assert.equal(await page.evaluate(()=>PB.App.s.draft.routes[0].nodes.join('-')),'F');
  // 두 곳 → 1번 완성. 새 버스는 쉬기로 시작하므로 직접 배정하고, 2호차를 빈 2번에 배정하면 출발이 막힌 이유와 버튼
  await page.evaluate(()=>PB.App.onNodeClick('D'));
  assert.deepEqual(await page.evaluate(()=>PB.App.s.draft.buses.map(b=>b.routeNum)),[null,null],'빈 노선에 자동 배정하지 않음');
  assert.equal(await page.locator('#depart-blocker').count(),0);
  await page.locator('#assign-route-1').click();await page.locator('#bus-sel-2').selectOption('2');
  assert.ok(await page.locator('#btn-depart').isDisabled());
  assert.match(await page.locator('#depart-blocker').textContent(),/2번 노선을 정해 주세요\. 2호차가 배정돼 있는데 정류장이 아직 없어요/);
  // 이어서 만들기: 2번 편집으로 전환
  await page.locator('#blocker-edit-2').click();
  assert.equal(await page.locator('#route-2').getAttribute('aria-pressed'),'true');assert.match(await msg(),/2번 노선을 이어 주세요/);
  // 한 곳만 이으면 막힘 문구가 '한 곳뿐'으로, 중복 오류 문단 없음
  await page.evaluate(()=>PB.App.onNodeClick('B'));
  assert.match(await page.locator('#depart-blocker').textContent(),/한 곳뿐이에요/);assert.equal(await page.locator('#plan-errors').textContent(),'');
  // 쉬게 하기 → 출발 가능, 되돌리기로 복구
  await page.locator('#blocker-rest-2').click();
  assert.equal(await page.locator('#depart-blocker').count(),0);assert.ok(await page.locator('#btn-depart').isEnabled());
  assert.equal(await page.evaluate(()=>PB.App.s.draft.buses.find(b=>b.id===2).routeNum),null);assert.match(await msg(),/2호차는 이번 운행에서 쉬어요/);
  await page.locator('#btn-undo').click();assert.equal(await page.evaluate(()=>PB.App.s.draft.buses.find(b=>b.id===2).routeNum),2);
  // 편집 팁은 세 곳 이상일 때만
  await page.locator('#route-1').click();await page.evaluate(()=>PB.App.onNodeClick('C'));
  assert.equal(await page.locator('#edit-tips').count(),1);
  await page.screenshot({path:`publicness/tests/_shot-first-plan-${mode}.png`});
  assert.deepEqual(errors,[]);console.log('PASS '+mode+': first hint, resident chips, depart blocker edit/rest/undo, edit tips, same-recommendation note');await page.close();
 }
 // 2단계 진입 직후에도 새 빈 노선이면 막힌 이유가 바로 보인다
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);await page.locator('#btn-start').click();
 while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}
 if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await page.locator('#btn-begin-plan').click();
 // 1단계 계획에 처음 들어오면 첫 노선 안내 모달
 assert.ok(await page.locator('#tutorial-dialog').evaluate(d=>d.open&&d.matches(':modal')));
 assert.match(await page.locator('#tutorial-title').textContent(),/정류장 두 곳을 이어 보세요/);assert.equal(await page.locator('.tutorial-steps li').count(),2);
 assert.equal((await page.$$eval('#tutorial-rule p',ps=>ps.map(p=>p.textContent))).join('\n'),'이번 단계는 버스 2대 · 노선 최대 2개로 운영해요.
출발하면 05:00~23:00의 하루 운행이 시작돼요.');
 await page.screenshot({path:'publicness/tests/_shot-tutorial.png'});
 await page.locator('#btn-tutorial-close').click();assert.equal(await page.locator('#tutorial-dialog').evaluate(d=>d.open),false);
 // 도움말에서 다시 보기
 await page.locator('#btn-help').click();await page.locator('#btn-tutorial-replay').click();assert.equal(await page.locator('#help').evaluate(d=>d.open),false);
 assert.ok(await page.locator('#tutorial-dialog').evaluate(d=>d.open));await page.keyboard.press('Escape');assert.equal(await page.locator('#tutorial-dialog').evaluate(d=>d.open),false);
 await page.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});await page.locator('#assign-route-1').click();
 await page.evaluate(()=>window.__pbFast=true);await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.locator('#resident-summary').waitFor({timeout:60000});
 await page.locator('#btn-next-phase').click();
 while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}
 if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await page.locator('#btn-begin-plan').click();
 // 2단계 새 3호차도 쉬기로 시작(빈 3번 노선에 자동 배정하지 않음) — 막힘 없이 시작하고, 배정하면 막힌 이유가 보인다
 assert.equal(await page.evaluate(()=>PB.App.s.draft.buses.find(b=>b.id===3).routeNum),null);assert.equal(await page.locator('#depart-blocker').count(),0);
 await page.locator('#bus-sel-3').selectOption('3');assert.match(await page.locator('#depart-blocker').textContent(),/3번 노선을 정해 주세요\. 3호차/); assert.equal(await page.locator('#tutorial-dialog').evaluate(d=>d.open),false,'tutorial only once in phase 1');
 assert.match(await page.locator('#resident-chip-narae').textContent(),/누적 1\/4회/);
 console.log('PASS tutorial modal on first plan, help replay; phase 2: no tutorial, new bus rests, blocker once assigned to empty route, narae tally 1/4');
}finally{if(browser)await browser.close();server.close();}
