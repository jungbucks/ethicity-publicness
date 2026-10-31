// 모드별 재정 실패·재시도(헤드리스 Edge, 2D 지도). 회차 수지는 정산 직전에 시험값으로 바꿔 판정만 본다(경제 수치는 그대로).
// 2026-10-27 경제 개편 반영 — 랜덤(도전)은 ‘누적 잔액이 0원 미만인 채로 단계를 2번 연속 마치면 계약 종료’, 회차 적자는 경고·기록만.
// 랜덤(지정 세팅 7): 규칙 안내 → 잔액 마이너스 1번째 경고(결과 본문·상단) → 흑자로 회복하면 경고 해제 → 적자 단계가 3번 넘어도 잔액이 남으면 계속
//   → 새로고침 뒤 같은 기록 → 잔액 마이너스 2번 연속에 계약 종료 → 종료 화면 새로고침 복구 → 같은 조건 재도전(상태 초기화) / 새 랜덤 게임
// 기본: 잔액이 낮을 때 ‘학기 말 평가’ 안내 → 학기 말 잔액 < 0이면 파산 엔딩(인물 결과 유지) → 같은 시나리오로 다시 시작
import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const base=`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`;
async function closeStory(page){for(let i=0;i<20&&await page.locator('#goal-intro').evaluate(d=>d.open);i++){await page.keyboard.press('Escape');await page.waitForTimeout(50);}}
// 버스를 쉬게 둔 채 출발 → 정산(finishRun) 직전에 끼어들어 회차 수지를 시험값으로(재생이 빨리 끝나도 경쟁 없이, 새로고침하면 다시 건다)
async function runPhase(page,total){
  await page.evaluate(t=>{window.__pbFast=true;PB.App.setSpeed(2);window.__forceTotal=t;const S=PB.Session;
    if(!S.__forced){const orig=S.finishRun;S.finishRun=function(s){if(window.__forceTotal!=null&&s.current){s.current.metrics.costs.total=window.__forceTotal;window.__forceTotal=null;}return orig(s);};S.__forced=true;}},total);
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
  // 3단계부터 긴급 조정 기회가 있으면 끝까지 건너뛰기(남은 기회는 ‘변경 없이 계속’)
  // (빠른 재생이라 누르기 전에 운행이 끝나 버튼이 사라질 수 있다 — 그때는 그냥 넘어간다)
  await page.locator('#run-skip').click({timeout:3000}).catch(()=>{});await page.locator('#skip-yes').click({timeout:1500}).catch(()=>{});
  try{await page.locator('#btn-next-phase').waitFor({timeout:90000});}catch(e){await page.screenshot({path:'publicness/tests/_shot-failure-debug.png'});throw e;}
}
const next=async(page)=>{await page.locator('#btn-next-phase').click();await beginPlan(page);};
const top=page=>page.locator('#top-deficit');
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const ctx=await browser.newContext({viewport:{width:1366,height:900}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'&seed=7');
  assert.match(await page.locator('label.radio').nth(1).innerText(),/누적 잔액이 2번 연속 0원 미만이면 운영 계약이 끝나요/);
  await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();
  const rule=await page.locator('#phase-changes').innerText();
  assert.match(rule,/재정 규칙[\s\S]*한 단계 적자는 경고일 뿐[\s\S]*0원 미만인 채로 2번 연속 단계를 마치면 운영 계약이 종료돼요/);
  assert.match(rule,/지원금[\s\S]*공공서비스 수행분/);
  assert.ok(await top(page).isHidden(),'처음엔 경고 없음');
  const startEvents=await page.evaluate(()=>JSON.stringify(PB.App.s.events));
  // 1단계 −10 → 잔액 −10: 1번째 경고(창 없이 결과 본문 + 상단)
  await beginPlan(page);await runPhase(page,-10);
  assert.match(await page.locator('#finance-status').innerText(),/적자예요[\s\S]*누적 잔액 −10원 — 다음 단계를 마칠 때도 0원 미만이면 운영 계약이 종료됩니다/);
  assert.equal(await top(page).innerText(),'잔액 마이너스 1/2회 연속');
  assert.equal(await page.locator('dialog:modal').count(),0,'경고는 새 창 없이 결과 화면에');
  // 2단계 +5,000 → 잔액 4,990: 경고 해제
  await next(page);await runPhase(page,5000);
  assert.equal(await page.locator('#finance-status').count(),0,'흑자로 회복하면 알림 없음');assert.ok(await top(page).isHidden());
  // 3·4단계 적자지만 모아 둔 잔액으로 메움 — 적자 단계가 3번이 돼도 계약 유지(예전 규칙이면 여기서 종료)
  await page.evaluate(()=>{PB.Session.nextPhase(PB.App.s);PB.App.go('reveal');}); // 2단계 뒤 인물 소개 컷은 건너뜀
  await beginPlan(page);await runPhase(page,-10);
  assert.match(await page.locator('#finance-status').innerText(),/적자예요\. 모아 둔 잔액\(4,980원\)으로 메웠어요/);
  await next(page);await runPhase(page,-10);
  assert.equal(await page.evaluate(()=>[PB.App.s.deficits,PB.App.s.end]).then(x=>JSON.stringify(x)),JSON.stringify([3,null]),'적자 3번이어도 계약 유지');
  assert.equal(await page.locator('#btn-next-phase').innerText(),'5단계로');
  // 결과 화면 새로고침 → 이어하기: 같은 정산·같은 연속 횟수(중복 집계 없음)
  const snap=()=>page.evaluate(()=>JSON.stringify({l:PB.App.s.ledger,d:PB.App.s.deficits,n:PB.App.s.negStreak,h:PB.App.s.history.length}));
  const before=await snap();await page.reload();await page.locator('#btn-continue').click();await page.locator('#btn-next-phase').waitFor();
  assert.equal(await snap(),before);
  // 5단계 −10,000 → 잔액 −5,030(1번째), 6단계 −1 → −5,031(2번째 연속) → 계약 종료
  await next(page);await runPhase(page,-10000);
  assert.match(await page.locator('#finance-status').innerText(),/누적 잔액 −5,030원 — 다음 단계를 마칠 때도/);assert.equal(await top(page).innerText(),'잔액 마이너스 1/2회 연속');
  await next(page);await runPhase(page,-1);
  assert.match(await page.locator('#finance-status').innerText(),/누적 잔액이 2번 연속 0원 미만\(−5,031원\)이라 운영 계약이 종료돼요/);
  assert.equal(await top(page).innerText(),'잔액 마이너스 2/2회 연속');
  assert.equal(await page.locator('#btn-next-phase').innerText(),'운영 종료 화면 보기');
  await page.locator('#btn-next-phase').click();await page.locator('#ending-title').waitFor();await closeStory(page);
  assert.equal(await page.locator('#ending-title').innerText(),'잔액 부족으로 운영 계약 종료');
  assert.equal(await page.locator('#failure-ledger tbody tr').count(),6);
  assert.deepEqual(await page.$$eval('#failure-ledger thead th',ths=>ths.map(t=>t.textContent)),['단계','회차 수지','잔액 판정','보유 잔액','수입','비용']);
  assert.match(await page.locator('#failure-report').innerText(),/적자 단계: 1·3·4·5·6단계\./);
  assert.match(await page.locator('#failure-cause').innerText(),/5·6단계를 마칠 때 누적 잔액이 연속으로 0원 미만이어서 운영 계약이 종료됐어요\. 마지막 보유 잔액은 −5,031원/);
  const tips=await page.locator('#failure-tips li').count();assert.ok(tips>=1&&tips<=3,'제안 1~3개 '+tips);
  assert.match(await page.locator('#failure-report').innerText(),/외곽 노선을 없애는 것만이 답은 아니에요/);
  assert.doesNotMatch(await page.locator('#failure-report').innerText(),/없애세요|폐지하세요/);
  assert.ok(await page.locator('.resident-card').count()>0,'인물 결과도 함께');
  await page.screenshot({path:'publicness/tests/_shot-failure-contract.png',fullPage:false});
  // 종료 화면 새로고침 → 이어하기에 종료 원인 표시, 같은 종료 화면
  await page.reload();assert.match(await page.locator('#continue-note').innerText(),/잔액 부족으로 운영 계약 종료/);
  await page.locator('#btn-continue').click();await closeStory(page);assert.equal(await page.locator('#ending-title').innerText(),'잔액 부족으로 운영 계약 종료');
  assert.equal(await page.evaluate(()=>PB.App.s.history.length),6);
  // 같은 조건으로 재도전: 세팅·사건 그대로, 진행 상태는 처음부터
  const seed=await page.evaluate(()=>PB.App.s.seed);
  await page.locator('#btn-retry-same').click();await page.locator('#phase-changes').waitFor();
  const st=await page.evaluate(()=>{const s=PB.App.s;return {seed:s.seed,mode:s.mode,phase:s.phase,stage:s.stage,h:s.history.length,l:s.ledger.length,d:s.deficits,end:s.end,events:JSON.stringify(s.events)};});
  assert.deepEqual(st,{seed,mode:'fixed',phase:1,stage:'reveal',h:0,l:0,d:0,end:null,events:startEvents});
  assert.ok(await top(page).isHidden(),'재도전하면 경고 없음');
  // 예전 규칙으로 끝난 저장본(잔액이 남은 채 종료)은 그때 이유를 그대로 보여 준다
  await page.evaluate(()=>{PB.App.s.end={cause:'contract',phase:1,balance:12000};PB.App.s.stage='ending';PB.App.go('ending');});await closeStory(page);
  assert.equal(await page.locator('#ending-title').innerText(),'적자 누적으로 운영 계약 종료(이전 규칙)');
  // 새 랜덤 게임은 다른 세팅
  await page.locator('#btn-retry-new').click();await page.locator('#phase-changes').waitFor();
  assert.deepEqual(await page.evaluate(()=>[PB.App.s.mode,PB.App.s.history.length,PB.App.s.deficits]),['random',0,0]);
  assert.notEqual(await page.evaluate(()=>PB.App.s.seed),seed);
  await ctx.close();

  // 기본 모드
  const c2=await browser.newContext({viewport:{width:1366,height:900}}),p2=await c2.newPage();p2.on('pageerror',e=>errors.push(e.message));
  await p2.goto(base);await p2.locator('#btn-start').click();await p2.locator('#btn-goal-start').click();
  assert.match(await p2.locator('#phase-changes').innerText(),/재정 규칙[\s\S]*마지막 단계가 끝난 뒤 누적 잔액이 0원 미만이면 파산/);
  assert.ok(await top(p2).isHidden(),'기본 모드엔 잔액 연속 경고 없음');
  await beginPlan(p2);await runPhase(p2,-50000);
  assert.match(await p2.locator('#finance-status').innerText(),/기본 모드는 재정을 학기 말에 평가해요/);
  assert.equal(await p2.locator('#btn-next-phase').innerText(),'2단계로','마이너스여도 다음 단계로');
  assert.ok(await top(p2).isHidden(),'기본 모드는 마이너스여도 상단 경고 없음');
  // 나머지 단계는 시험 상태로 빠르게: 학기 말 잔액 < 0 → 파산 엔딩
  await p2.evaluate(()=>{const S=PB.Session,s=PB.App.s;S.nextPhase(s);
    while(s.stage!=='ending'){S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=-1000;S.finishRun(s);S.nextPhase(s);}PB.App.go('ending');});
  await closeStory(p2);
  assert.equal(await p2.locator('#ending-title').innerText(),'파산 — 학기 말 잔액이 0원 미만이에요');
  assert.match(await p2.locator('#ending-verdict').innerText(),/주요 인물 \d명 중 \d명이 만족했지만/);
  assert.equal(await p2.locator('#failure-ledger tbody tr').count(),5);assert.equal(await p2.locator('#failure-ledger thead th').count(),5,'기본 모드는 잔액 판정 열 없음');
  assert.match(await p2.locator('#ending-profit').innerText(),/보유 잔액 −54,000원/);
  assert.ok(await p2.locator('.resident-card').count()>0);assert.equal(await p2.locator('#btn-retry-new').count(),0);
  await p2.screenshot({path:'publicness/tests/_shot-failure-bankrupt.png'});
  await p2.locator('#btn-retry-same').click();await p2.locator('#phase-changes').waitFor();
  assert.deepEqual(await p2.evaluate(()=>[PB.App.s.mode,PB.App.s.seed,PB.App.s.phase,PB.App.s.history.length,PB.App.s.end]),['default',require_default_seed(),1,0,null]);
  assert.deepEqual(errors,[]);await c2.close();
  console.log('PASS random: balance rule shown, 1st negative balance warns, recovery clears, 3+ deficit phases keep the contract, reload keeps the record, 2nd negative in a row ends it w/ ledger·tips·residents, ending reload, legacy-rule title, same-condition retry resets & reproduces events, new random; default: low-balance note, continues below zero, bankrupt ending with residents, same-scenario retry');
}finally{if(browser)await browser.close();server.close();}
function require_default_seed(){return require('../js/config.js').defaultSeed;}
