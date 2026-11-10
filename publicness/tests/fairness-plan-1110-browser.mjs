// 2026-11-10 공정성·포용 개편 Task 7: 계획 화면 — 청원 카드·정책 카드·AI가 본 자료 줄·출발 전 선택 필수
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/fairness-plan-1110-browser.mjs
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';import {beginPlan} from './browser-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const ROUTES=[[1,['B','A','G','E'],1],[2,['A','D'],1]];
const lay=(page)=>page.evaluate(R=>{const A=PB.App,S=PB.Session,s=A.s;S.beginPlan(s);s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);
 R.forEach(([num,nodes,buses])=>{s.draft.routes.push({num,nodes:nodes.slice(),stops:nodes.map(()=>true),autoPlaced:true});s.draft.buses.filter(b=>b.routeNum==null).slice(0,buses).forEach(b=>b.routeNum=num);});},ROUTES);
const runPhase=async(page)=>{await lay(page);await page.evaluate(()=>{const A=PB.App,S=PB.Session;A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());S.startRun(A.s);S.finishRun(A.s);A.go('result');});};
const nextPlan=(page)=>page.evaluate(()=>{const A=PB.App,S=PB.Session;S.nextPhase(A.s);A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
const over=(page,sel)=>page.evaluate(sel=>{const W=innerWidth,bad=[...document.querySelectorAll(sel+', '+sel+' *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&(r.right>W+1||r.left<-1);}).map(n=>n.id||n.tagName);return {doc:document.documentElement.scrollWidth>W+1,bad};},sel);
try{for(const [w,h] of [[1280,800],[390,844]]){
 const page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?no3d=1');await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.locator('#btn-start').click();while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}
 if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
 // 1) 1단계: AI가 본 자료 줄
 await page.locator('#plan-ai-toggle').click();await page.locator('#goal-reach').click();await page.locator('#rec-card').waitFor({timeout:20000});
 const seen1=await page.locator('#rec-seen').textContent();assert.ok(seen1.includes('예전 노선')&&seen1.includes('외곽 마을 0건'),'1단계 줄: '+seen1);
 assert.equal(await page.locator('#petition-card').count(),0,'1단계엔 청원 카드 없음');
 // 2) 2단계 정산 → 3단계 계획
 await runPhase(page);await nextPlan(page);await runPhase(page);await nextPlan(page);
 const fp=await page.evaluate(()=>PB.App.s.fixedPetition);assert.ok(fp,'고정 청원 기록');
 await page.locator('#petition-card').waitFor();assert.equal(await page.locator('#elder-card').count(),0);
 assert.equal(await page.locator('#btn-depart').isDisabled(),true,'답 전 출발 막힘');
 assert.ok((await page.locator('#choice-required').textContent()).includes('청원에 답을 골라야 출발할 수 있어요.'));
 const order=await page.evaluate(()=>{const c=document.querySelector('#petition-card'),r=document.querySelector('#plan-toolbar .route-tabs');return !!r&&!!(c.compareDocumentPosition(r)&Node.DOCUMENT_POSITION_FOLLOWING);});assert.ok(order,'카드 자리: 노선 편집 위');
 const t=await page.locator('#petition-card').textContent();assert.ok(t.includes('주민 청원')&&t.includes('요청')&&/\d+건/.test(t),'청원 문장: '+t);
 // 3) 선택 → 활성, 첫 클릭은 이유 안내
 await page.locator('#petition-not-now').click();
 assert.equal(await page.locator('#petition-not-now').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#btn-depart').isDisabled(),false);assert.equal(await page.locator('#choice-required').count(),0);
 const bh=await page.evaluate(()=>['#petition-reflect','#petition-not-now'].map(i=>Math.round(document.querySelector(i).getBoundingClientRect().height)));assert.ok(bh.every(x=>x>=44),'버튼 44px '+bh);
 await page.locator('#btn-depart').click();await page.locator('#why-nudge').waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.id),'petition-why');assert.equal(await page.evaluate(()=>PB.App.s.stage),'plan');assert.equal(await page.evaluate(()=>document.querySelector('#confirm-depart').open),false);
 await page.locator('#btn-depart').click();await page.waitForFunction(()=>document.querySelector('#confirm-depart').open);
 await page.evaluate(()=>document.querySelector('#confirm-depart').close());
 // 이유 입력 → 저장
 await page.fill('#petition-why','지금은 버스가 모자라서');
 assert.equal(await page.evaluate(()=>PB.App.s.petitionReply.why),'지금은 버스가 모자라서');
 await page.evaluate(()=>scrollTo(0,0));
 assert.deepEqual(await over(page,'#petition-card'),{doc:false,bad:[]},'청원 카드 넘침 없음');
 const mapVisible=await page.evaluate(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return r.height>=200&&r.top>=0&&r.bottom<=innerHeight;});
 await page.screenshot({path:`${SHOT}/_shot-petition-card-${w}.png`});
 // 4) 새로고침 → 이어하기
 await page.reload();await page.locator('#btn-continue').click();await page.locator('#petition-card').waitFor();
 assert.equal(await page.locator('#petition-not-now').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#petition-why').inputValue(),'지금은 버스가 모자라서');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ethicity.publicness.save')).session.petitionReply.choice),'not-now');
 // 5) 4단계 정책 카드
 await runPhase(page);await nextPlan(page);
 await page.locator('#elder-card').waitFor();assert.equal(await page.locator('#petition-card').count(),0);
 const et=await page.locator('#elder-card').textContent();assert.ok(et.includes('어르신 무임승차를 유지할까요?')&&et.includes('이 마을은 어르신 버스 요금이 무료예요(마을 정책).'));
 const facts=await page.locator('#elder-facts').textContent();assert.ok(/무임 승객 \d+명 · 받지 않은 운임 /.test(facts),'사실 줄: '+facts);
 assert.ok((await page.locator('#choice-required').textContent()).includes('무임승차 유지·폐지를 골라야 출발할 수 있어요.'));assert.equal(await page.locator('#btn-depart').isDisabled(),true);
 await page.waitForSelector('#map-banner',{state:'detached',timeout:8000}).catch(()=>{});await page.locator('#elder-abolish').click();assert.equal(await page.locator('#elder-abolish').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#btn-depart').isDisabled(),false);
 await page.fill('#elder-why','요금 수입이 필요해서');
 assert.deepEqual(await page.evaluate(()=>{const e=JSON.parse(localStorage.getItem('ethicity.publicness.save')).session.elderPolicy;return [e.choice,e.why];}),['abolish','요금 수입이 필요해서']);
 assert.deepEqual(await over(page,'#elder-card'),{doc:false,bad:[]},'정책 카드 넘침 없음');
 await page.screenshot({path:`${SHOT}/_shot-elder-card-${w}.png`});
 assert.deepEqual(errors,[]);await page.close();console.log('  ok',w);
}console.log('PASS fairness-plan-1110');}finally{await browser.close();server.close();}
