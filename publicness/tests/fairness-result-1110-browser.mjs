// 2026-11-10 공정성·포용 개편 Task 9: 결과 화면 — 청원 확인·무임 정책 결과·AI가 본 이동
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/fairness-result-1110-browser.mjs
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';import {beginPlan} from './browser-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const BAL=[[1,['F','C','D','A'],1],[2,['B','A','G','E'],1],[3,['H','A','G'],1],[4,['A','I'],1]];
const NOF=[[1,['B','A','G','E'],1],[2,['A','D'],1]],WITHF=[[1,['F','C','D','A'],1],[2,['B','A','G','E'],1]];
const BAD=/적자|손해|때문에|잘했|아쉽/;
const lay=(page,R)=>page.evaluate(R=>{const A=PB.App,S=PB.Session,s=A.s;S.beginPlan(s);s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);
 R.forEach(([num,nodes,buses])=>{s.draft.routes.push({num,nodes:nodes.slice(),stops:nodes.map(()=>true),autoPlaced:true});s.draft.buses.filter(b=>b.routeNum==null).slice(0,buses).forEach(b=>b.routeNum=num);});},R);
const runPhase=async(page,R)=>{await lay(page,R);await page.evaluate(()=>{const A=PB.App,S=PB.Session;A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());S.startRun(A.s);S.finishRun(A.s);A.go('result');});};
const nextPlan=(page)=>page.evaluate(()=>{const A=PB.App,S=PB.Session;S.nextPhase(A.s);A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
const over=(page)=>page.evaluate(()=>{const W=innerWidth,sel='#petition-followup, #elder-result, #ai-seen-gap',bad=[...document.querySelectorAll(sel+', '+sel.split(', ').map(x=>x+' *').join(', '))].filter(n=>{const r=n.getBoundingClientRect();return r.width&&(r.right>W+1||r.left<-1);}).map(n=>n.id||n.tagName);return {doc:document.documentElement.scrollWidth>W+1,bad};});
const txt=(page,id)=>page.evaluate(id=>{const n=document.querySelector(id);return n?n.textContent:null;},id);
const shot=async(page,name,w)=>{await page.evaluate(n=>{const e=document.querySelector(n);if(e)e.scrollIntoView({block:'center'});},'#petition-followup, #elder-result, #ai-seen-gap');await page.screenshot({path:`${SHOT}/_shot-fair-result-${name}-${w}.png`});};
async function fresh(page){await page.goto(base+'?no3d=1');await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.locator('#btn-start').click();while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}
 if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);}
async function to4(page,policy){ /* 1·2단계 F 안 잇기, 3단계 not-now + F 잇기, 4단계 정책 */
 await runPhase(page,NOF);await nextPlan(page);await runPhase(page,NOF);await nextPlan(page);
 await page.evaluate(()=>{const s=PB.App.s;PB.Choices.set(s,'petition','choice','not-now');PB.Choices.set(s,'petition','why','버스가 모자라서');});
 await runPhase(page,BAL);}
try{for(const [w,hh] of [[1280,800],[390,844]]){
 const page=await browser.newPage({viewport:{width:w,height:hh},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await fresh(page);
 // (a) 1단계
 await runPhase(page,NOF);
 const gap1=await txt(page,'#ai-seen-gap');assert.ok(gap1&&gap1.includes('외곽 마을')&&gap1.includes('AI가 본 이동 0건'),'1단계 격차: '+gap1);
 assert.equal(await page.locator('#petition-followup').count(),0);assert.equal(await page.locator('#elder-result').count(),0);
 const ord=await page.evaluate(()=>{const e=document.querySelector('#result-events'),g=document.querySelector('#ai-seen-gap'),a=document.querySelector('#result-ai');return !!(e.compareDocumentPosition(g)&4)&&!!(g.compareDocumentPosition(a)&4);});assert.ok(ord,'자리: events 다음, ai 앞');
 assert.deepEqual(await over(page),{doc:false,bad:[]});await shot(page,1,w);
 // (b) 3단계
 await nextPlan(page);await runPhase(page,NOF);await nextPlan(page);
 await page.evaluate(()=>{const s=PB.App.s;PB.Choices.set(s,'petition','choice','not-now');PB.Choices.set(s,'petition','why','버스가 모자라서');});
 await runPhase(page,BAL);
 const exp=await page.evaluate(()=>{const s=PB.App.s,z=s.fixedPetition.zone,g=p=>s.history.filter(x=>x.phase===p)[0].rideLog[z];const a=g(2),b=g(3);return {name:PB.App.nodeName(z),a,b};});
 const fu=await txt(page,'#petition-followup');assert.ok(fu,'청원 확인 블록');
 const {name,a,b}=exp;
 assert.ok(fu.includes(`${name}에서 출발한 이동 중 목적지까지 못 간 이동: 2단계 ${a.requests}건 중 ${a.requests-a.arrived}건 → 3단계 ${b.requests}건 중 ${b.requests-b.arrived}건`),'못 간 이동 숫자: '+fu);
 assert.ok(fu.includes(`${name} 탑승 기록(다음 AI가 보는 자료): 2단계 ${a.rode}명 → 3단계 ${b.rode}명`),'탑승 숫자: '+fu);
 assert.ok(fu.includes('이번엔 못 한다')&&fu.includes('버스가 모자라서'),'학생 답: '+fu);
 assert.ok(!BAD.test(fu),'금지어');assert.deepEqual(await over(page),{doc:false,bad:[]});await shot(page,3,w);
 // (c) 4단계 폐지
 await nextPlan(page);await page.evaluate(()=>PB.Choices.set(PB.App.s,'elder','choice','abolish'));await runPhase(page,BAL);
 const ab=await txt(page,'#elder-result'),k=await page.evaluate(()=>PB.App.s.history.filter(x=>x.phase===4)[0].scores.mobility.reasons.stayHome||0);
 assert.ok(ab.includes('어르신 무임승차를 폐지했어요.')&&ab.includes(`버스를 타지 않은 이동 ${k}건 — 이동 수요 충족 점수에서 목적지까지 못 간 이동으로 셌어요.`),'폐지: '+ab);
 const paid=await page.evaluate(()=>{const s=PB.App.s;return s.history.filter(x=>x.phase===4)[0].elder.paid*s.config.finance.fare;});
 assert.ok(ab.includes('폐지로 어르신이 낸 운임 '+paid.toLocaleString('ko-KR')+'원')&&paid>0,'어르신이 낸 운임 줄: '+ab);assert.ok(!ab.includes('3단계보다'));
 assert.ok(!BAD.test(ab+(await txt(page,'#ai-seen-gap')||'')),'금지어');assert.deepEqual(await over(page),{doc:false,bad:[]});await shot(page,4,w);
 // 5단계: k 줄만
 await nextPlan(page);await runPhase(page,BAL);
 const ab5=await txt(page,'#elder-result');assert.ok(ab5,'5단계 블록 있음');assert.ok(!ab5.includes('폐지했어요')&&ab5.includes('버스를 타지 않은 이동'),'5단계 k줄만: '+ab5);
 // (d) 유지
 await fresh(page);await to4(page);await nextPlan(page);await page.evaluate(()=>PB.Choices.set(PB.App.s,'elder','choice','keep'));await runPhase(page,BAL);
 const kp=await txt(page,'#elder-result');assert.ok(kp.includes('어르신 무임승차를 유지했어요.')&&/무임 승객 \d+명 · 받지 않은 운임 /.test(kp),'유지: '+kp);assert.ok(!BAD.test(kp)&&!kp.includes('폐지로'));
 assert.deepEqual(await over(page),{doc:false,bad:[]});
 assert.deepEqual(errors,[]);await page.close();console.log('  ok',w);
}console.log('PASS fairness-result-1110');}finally{await browser.close();server.close();}
