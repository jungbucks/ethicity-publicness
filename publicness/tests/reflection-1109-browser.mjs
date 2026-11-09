// 2026-11-09 테스터 6번(6-A): 결과 화면 단계별 문장 틀 — 「다음 운행 목표」 아래 #think-note, 「AI라면?」 아래 #ai-note
//  · 비워도 됨(다음 단계 버튼 그대로) · 입력마다 저장(s.stageNotes) · 새로고침 뒤 다시 보임 · 조사가 입력에 맞게 바뀜 · 같은/다른 생각 토글
//  · 단계마다 따로 · 출발 계획 기록 s.planLog(보고서 색 이름용) · 1280/375 가로 넘침 없음
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/reflection-1109-browser.mjs
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const toResult=(page,routes)=>page.evaluate(R=>{const A=PB.App,S=PB.Session;if(!A.s){A.startGame();}const s=A.s;s.tutorialSeen=true;S.beginPlan(s);
 s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);R.forEach(([num,nodes,buses])=>{s.draft.routes.push({num,nodes:nodes.slice(),stops:nodes.map(()=>true),autoPlaced:true});s.draft.buses.filter(b=>b.routeNum==null).slice(0,buses).forEach(b=>b.routeNum=num);});
 A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());S.startRun(s);S.finishRun(s);A.go('result');},routes);
const read=p=>p.evaluate(()=>({kept:document.querySelector('#note-kept').value,lost:document.querySelector('#note-lost').value,what:document.querySelector('#note-ai-what').value,why:document.querySelector('#note-ai-why').value,
 view:[...document.querySelectorAll('#ai-note [data-ai-view]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.aiView).join(),
 jk:document.querySelector('#note-kept-josa').textContent,jl:document.querySelector('#note-lost-josa').textContent,jw:document.querySelector('#note-ai-what-josa').textContent}));
try{for(const [w,h] of [[1280,800],[375,812]]){
 const page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?no3d=1');await page.evaluate(()=>localStorage.clear());await page.reload();
 await toResult(page,[[1,['F','C','B','D'],1],[2,['A','G'],1]]);await page.locator('#result-headline').waitFor();
 // 자리: 다음 운행 목표 안(두 가지 답 아래) · AI라면? 안
 const place=await page.evaluate(()=>{const t=document.querySelector('#think-note'),c=document.querySelector('#think-choice'),a=document.querySelector('#ai-note');
  return {inThink:!!t&&t.closest('#result-think')!==null,afterChoice:!!(t&&c&&(c.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING)),inAi:!!a&&a.closest('#result-ai')!==null,next:!!document.querySelector('#btn-next-phase:not([disabled])')};});
 assert.deepEqual(place,{inThink:true,afterChoice:true,inAi:true,next:true},'자리·다음 단계 버튼 막지 않음');
 assert.deepEqual(await read(page),{kept:'',lost:'',what:'',why:'',view:'',jk:'을(를)',jl:'이(가)',jw:'을(를)'},'처음엔 빈칸');
 await page.fill('#note-kept','순자 할머니');await page.fill('#note-lost','수지');
 await page.locator('#ai-note [data-ai-view="diff"]').click();await page.locator('#ai-note [data-ai-view="diff"]').click();await page.locator('#ai-note [data-ai-view="same"]').click();
 await page.fill('#note-ai-what','노선');await page.fill('#note-ai-why','외곽 마을 사람이 남아서');
 const filled=await read(page);
 assert.deepEqual(filled,{kept:'순자 할머니',lost:'수지',what:'노선',why:'외곽 마을 사람이 남아서',view:'same',jk:'를',jl:'가',jw:'을'},'조사가 입력에 맞게');
 const saved=await page.evaluate(()=>({mem:PB.App.s.stageNotes,disk:JSON.parse(localStorage.getItem('ethicity.publicness.save')).session.stageNotes,plan:PB.App.s.planLog&&PB.App.s.planLog[1]}));
 assert.deepEqual(saved.mem,{1:{kept:'순자 할머니',lost:'수지',aiView:'same',aiWhat:'노선',aiWhy:'외곽 마을 사람이 남아서'}});assert.deepEqual(saved.disk,saved.mem,'입력마다 저장');
 assert.deepEqual(saved.plan,{routes:[{num:1,nodes:['F','C','B','D'],buses:1},{num:2,nodes:['A','G'],buses:1}],resting:0},'출발 계획 기록');
 // AI 계산이 끝나 카드 본문을 다시 그려도 문장 틀은 그대로
 await page.locator('#result-ai-summary').waitFor({timeout:20000});assert.deepEqual(await read(page),filled,'AI 카드가 다시 그려도 남음');
 const over=await page.evaluate(()=>{const W=innerWidth,bad=[...document.querySelectorAll('#think-note *, #ai-note *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&(r.right>W+1||r.left<-1);}).map(n=>n.id||n.tagName);return {doc:document.documentElement.scrollWidth>W+1,bad};});
 assert.deepEqual(over,{doc:false,bad:[]},'가로 넘침 없음');
 const btn=await page.evaluate(()=>[...document.querySelectorAll('#ai-note [data-ai-view]')].map(b=>Math.round(b.getBoundingClientRect().height)));assert.ok(btn.every(x=>x>=44),'버튼 44px: '+btn);
 for(const id of ['#result-think','#result-ai']){await page.locator(id).scrollIntoViewIfNeeded();await page.locator(id).screenshot({path:`${SHOT}/_shot-reflect-${id.slice(8)}-${w}.png`});}
 // 새로고침(저장본) → 다시 보임
 await page.reload();await page.locator('#btn-continue').click();await page.locator('#result-headline').waitFor();
 assert.deepEqual(await read(page),filled,'새로고침 뒤 복원');
 // 지우면 저장본에서도 빠짐
 await page.fill('#note-lost','');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ethicity.publicness.save')).session.stageNotes[1].lost),undefined);
 // 다음 단계 결과는 빈칸(단계마다 따로)
 await page.evaluate(()=>{const A=PB.App,S=PB.Session;S.nextPhase(A.s);});await toResult(page,[[1,['F','C','B','D'],2]]);await page.locator('#result-headline').waitFor();
 const r2=await read(page);assert.equal(r2.kept,'');assert.equal(r2.view,'');
 assert.equal(await page.evaluate(()=>PB.App.s.stageNotes[1].kept),'순자 할머니','앞 단계 답 유지');
 assert.deepEqual(errors,[]);await page.close();console.log('  ok',w);
}console.log('PASS reflection-1109');}finally{await browser.close();server.close();}
