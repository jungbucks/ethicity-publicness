// 경제 개편 화면 검증(헤드리스): 계획 화면 예상 재정·노선 한 줄, 끌기 라벨(대수·간격·비용), 끌기 취소·되돌리기·저장 복구에서 금액·차량 보존,
// 임차·반납, 출발 확인 재정, 결과 재정표·노선별 표 합계 = 회차 수지, 375px 가로 넘침 없음. 2D·3D
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`;
const state=p=>p.evaluate(()=>({draft:JSON.stringify(PB.App.s.draft),econ:document.querySelector('#plan-econ-h').textContent,depot:document.querySelector('#depot-count').textContent}));
const won=s=>Number(String(s).replace(/[^0-9−-]/g,'').replace('−','-'));
try{for(const view of (process.env.VIEWS||'2d,3d').split(',')){
 const page=await browser.newPage({viewport:{width:1366,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+(view==='2d'?'?no3d=1':''));
 await page.evaluate(()=>{localStorage.clear();PB.App.startGame();PB.Session.beginPlan(PB.App.s);PB.App.go('plan');});
 assert.match(await page.locator('#plan-econ-h').innerText(),/이번 단계 예상 수지 −[\d,]+원 · 수행분 0\/2/,'무운행 예상은 마이너스, 조건 0/2');
 await page.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});
 assert.match(await page.locator('#route-econ').innerText(),/1번 · 한 바퀴 [\d.]+km · 버스 1대 · 약 .+ 간격 · 운영·연료 약 [\d,]+원 · 운임 약 [\d,]+원 → 손익 [−+]?[\d,]+원 \(기본 수요 기준 예상\)/);
 assert.match(await page.locator('#plan-econ-h').innerText(),/수행분 2\/2/);
 // 임차 → 대기 버스 +1, 예상에 임차료. 되돌리기로 원래대로
 const s0=await state(page);
 await page.locator('#btn-lease').click();assert.equal(await page.locator('#bus-token-21').count(),1);assert.match(await page.locator('#bus-token-21').innerText(),/임차/);
 assert.equal(await page.evaluate(()=>PB.App.s.owned),2,'기본 제공 대수는 그대로');
 const s1=await state(page);assert.notEqual(s1.econ,s0.econ,'임차료가 예상에 반영');
 // 끌기 취소(Esc·빈 곳)는 금액·대수 그대로
 for(const how of ['esc','empty']){const t=await page.locator('#bus-token-21').boundingBox();await page.mouse.move(t.x+t.width/2,t.y+t.height/2);await page.mouse.down();
  const b=await page.locator('#route-bus-1').boundingBox(),empty=await page.evaluate(()=>{const r=document.querySelector('#stage').getBoundingClientRect();for(let y=r.top+40;y<r.bottom;y+=30)for(let x=r.left+40;x<r.right;x+=30)if(PB.UI.busDrop.targetAt(x,y).kind==='none')return {x,y};});
  await page.mouse.move(how==='esc'?b.x+b.width/2:empty.x,how==='esc'?b.y+b.height/2:empty.y,{steps:6});
  if(how==='esc'){assert.match(await page.locator('#drag-ghost').innerText(),/놓으면 1번 1→2대 · 간격 .+ → .+ · 운영·연료 \+약 [\d,]+원 \(기본 수요 기준\)/,'대수·간격·비용 변화');await page.keyboard.press('Escape');}
  await page.mouse.up();await page.waitForTimeout(150);assert.deepEqual(await state(page),s1,how+': 취소하면 그대로');}
 // 놓으면 반영, 비용은 임차료를 다시 받지 않음(운영·연료만 늘어남)
 const before=await page.evaluate(()=>PB.UI.Econ.plan(PB.App.s).k);await page.waitForTimeout(400);
 const t=await page.locator('#bus-token-21').boundingBox(),b=await page.locator('#route-bus-1').boundingBox();
 await page.mouse.move(t.x+t.width/2,t.y+t.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:6});await page.mouse.up();await page.waitForTimeout(150);
 const after=await page.evaluate(()=>PB.UI.Econ.plan(PB.App.s).k);
 assert.equal(after.lease,before.lease,'배치해도 임차료 한 번');assert.equal(after.holding,before.holding);assert.ok(after.op>before.op&&after.fuel>before.fuel);
 // 되돌리기 2번 → 임차 전 상태와 같은 금액·차량
 await page.waitForTimeout(400);await page.locator('#btn-undo').click();await page.locator('#btn-undo').click();
 assert.deepEqual(await state(page),s0,'되돌리기로 임차 전과 같음');
 // 임차 → 반납
 await page.locator('#btn-lease').click();await page.locator('#lease-return-21').click();assert.deepEqual(await state(page),s0,'반납하면 임차료 없음');
 // 저장 → 새로고침 → 이어하기: 임차 차량·금액 그대로(복제·소실 없음)
 await page.locator('#btn-lease').click();await page.locator('#btn-lease').click();assert.ok(await page.locator('#btn-lease').isDisabled(),'단계당 2대 한도');
 const saved=await state(page);await page.reload();await page.locator('#btn-continue').click();
 for(let i=0;i<40&&!(await page.locator('#plan-econ').count());i++){if(await page.locator('#btn-begin-plan').isVisible().catch(()=>false))await page.locator('#btn-begin-plan').click();await page.waitForTimeout(100);}
 assert.deepEqual(await state(page),saved,'이어하기 후 차량·예상 금액 같음');
 await page.locator('#lease-return-22').click();
 // 출발 확인: 조건·지급 시점·예상(기본 수요 기준)
 // 출발 확인은 운행 구성만(2026-10-27 단순화) — 예상 결과·재정 예상은 계획 화면에만
 await page.locator('#btn-depart').click();const dep=await page.locator('#confirm-depart').innerText();
 assert.match(dep,/운행 구성/);assert.match(dep,/21호차/);assert.equal(await page.locator('#depart-finance,#depart-risks').count(),0);assert.doesNotMatch(dep,/예상/);
 await page.locator('#confirm-yes').click();await page.waitForTimeout(300);await page.locator('#run-skip').click();
 for(let i=0;i<80&&!(await page.locator('#finance').count());i++){if(await page.locator('#skip-yes').isVisible().catch(()=>false))await page.locator('#skip-yes').click();await page.waitForTimeout(200);}
 // 결과: 재정표 항목, 노선별 표 합계 + 공동 항목 = 회차 수지(화면 숫자로 확인)
 const fin=await page.locator('#finance').textContent();
 for(const label of ['지원금 · 기본','공공서비스 수행분','운임 수입','차량 보유비','임차료 (이번 단계 1대)','관제·운영비','연료·정비비','이번 단계 회차 수지'])assert.ok(fin.includes(label),label);
 const k=await page.evaluate(()=>PB.App.s.history[0].metrics.costs);
 const rows=await page.$$eval('#finance .route-economy-table tbody tr',trs=>trs.map(tr=>[...tr.children].map(td=>td.textContent)));
 const sum=rows.reduce((a,r)=>a+won(r[4]),0);assert.equal(sum+k.subsidyBase+k.subsidyService-k.holding-k.lease,k.total,'노선 손익 합 + 공동 항목 = 회차 수지');
 assert.equal(rows.reduce((a,r)=>a+won(r[2]),0),k.fare,'노선 운임 합 = 전체 운임(환승 중복 없음)');
 assert.ok(!/없애세요|폐지하세요/.test(fin));
 assert.deepEqual(errors,[]);await page.close();console.log('PASS economy',view);
}
 // 375px: 계획 화면 경제 줄·임차 버튼이 넘치지 않는다
 const ctx=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:2,hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await ctx.newPage();
 await page.goto(base+'?no3d=1');await page.evaluate(()=>{localStorage.clear();PB.App.startGame();PB.Session.beginPlan(PB.App.s);PB.App.go('plan');PB.App.onNodeClick('F');PB.App.onNodeClick('D');});
 await page.locator('#btn-lease').click();await page.locator('#plan-econ-more > summary').click();await page.waitForTimeout(200);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'가로 넘침 없음');
 await page.screenshot({path:'publicness/tests/_shot-economy-375.png',fullPage:true});await ctx.close();console.log('PASS economy 375');
}finally{await browser.close();server.close();}
