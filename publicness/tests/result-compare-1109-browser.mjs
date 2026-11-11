// 2026-11-09 교사 플레이테스트 4: ‘유사하게 변경하면 안 좋아지는 경우’ — 같은 조건으로 다시 한 게임의 같은 단계와 비교 한두 줄
//  · 첫 게임: 비교 줄 없음(기록만) · 같은 조건 재도전 뒤 같은 단계 결과: #result-rerun(숫자 변화 큰 것 2~3개 + 달라진 계획)
//  · 숫자는 결과 화면의 값 그대로(새 시뮬레이션 없음) · 새로고침해도 자기 자신과 비교하지 않음 · runId 없는 예전 저장본도 열림
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/result-compare-1109-browser.mjs
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const toResult=(page,routes)=>page.evaluate(R=>{const A=PB.App,S=PB.Session;if(!A.s){A.startGame();}const s=A.s;s.tutorialSeen=true;S.beginPlan(s);
 s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);R.forEach(([num,nodes,buses])=>{s.draft.routes.push({num,nodes:nodes.slice(),stops:nodes.map(()=>true),autoPlaced:true});s.draft.buses.filter(b=>b.routeNum==null).slice(0,buses).forEach(b=>b.routeNum=num);});
 A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());S.startRun(s);S.finishRun(s);A.go('result');},routes);
const cmp=p=>p.evaluate(()=>{const n=document.querySelector('#result-rerun');return n?{numbers:n.querySelector('#result-rerun-numbers').textContent,plan:n.querySelector('#result-rerun-plan').textContent,visible:n.getBoundingClientRect().height>0}:null;});
const stored=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('ethicity.publicness.stageRuns')||'null'));
try{for(const [w,h] of [[1280,800],[375,812]]){
 const page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?no3d=1');await page.evaluate(()=>localStorage.clear());await page.reload();
 // 첫 게임: 빨강 F–C–B–D 버스 1대 + 초록 A–G 버스 1대
 await toResult(page,[[1,['F','C','B','D'],1],[2,['A','G'],1]]);await page.locator('#result-headline').waitFor();
 assert.equal(await cmp(page),null,'첫 게임은 비교할 지난 운행이 없음');
 const first=await page.evaluate(()=>{const h=PB.App.s.history[0].metrics;return {maxWait:h.maxWait,missed:h.N-h.arrived,total:h.costs.total,runId:PB.App.s.runId};});
 assert.ok(first.runId,'결과를 보면 게임 구분 runId가 붙음');assert.equal((await stored(page)).runs.length,1);
 // 같은 조건으로 재도전 → 비슷하지만 초록 노선을 빼고 빨강에 2대
 await page.evaluate(()=>PB.App.retry('same'));await toResult(page,[[1,['F','C','B','D'],2]]);await page.locator('#result-headline').waitFor();
 const c=await cmp(page),now=await page.evaluate(()=>{const h=PB.App.s.history[0].metrics;return {maxWait:h.maxWait,missed:h.N-h.arrived,total:h.costs.total,runId:PB.App.s.runId};});
 assert.ok(c&&c.visible,'재도전 같은 단계 결과에 비교 줄');assert.notEqual(now.runId,first.runId);
 assert.match(c.numbers,/^지난번 같은 단계와 비교: /);assert.ok(c.numbers.split(' · ').length<=3,c.numbers);
 const fmt=await page.evaluate(([a,b])=>({miss:a.missed+'건 → '+b.missed+'건',wait:PB.App.duration(a.maxWait)+' → '+PB.App.duration(b.maxWait)}),[first,now]);
 if(first.missed!==now.missed&&c.numbers.includes('목적지까지 못 간 이동'))assert.ok(c.numbers.includes('목적지까지 못 간 이동 '+fmt.miss),'숫자는 결과 값 그대로: '+c.numbers);
 if(c.numbers.includes('최장 대기'))assert.ok(c.numbers.includes('최장 대기 '+fmt.wait),c.numbers);
 assert.equal(c.plan,'달라진 계획: 초록 노선(기차역–산업·일자리) 없앰 · 빨강 노선 버스 1대 → 2대');
 assert.ok(await page.evaluate(()=>{const a=document.querySelector('#result-rerun'),b=document.querySelector('.result-big');return !!(a&&b&&(b.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING));}),'큰 숫자 바로 아래');
 await page.screenshot({path:`${SHOT}/_shot-result-compare-${w}.png`});
 console.log('  ok',w,c.numbers,'/',c.plan);
 // 새로고침(저장본에서 결과 다시 계산) → 여전히 지난 게임과 비교, 자기 기록은 하나로 덮어씀
 await page.reload();await page.locator('#btn-continue').click();await page.locator('#result-headline').waitFor();
 assert.deepEqual(await cmp(page),c,'새로고침해도 같은 비교');assert.equal((await stored(page)).runs.length,2);
 // runId 없는 예전 저장본: 지워도 열리고 새 runId를 받음
 await page.evaluate(()=>{const o=JSON.parse(localStorage.getItem('ethicity.publicness.save'));delete o.session.runId;localStorage.setItem('ethicity.publicness.save',JSON.stringify(o));});
 await page.reload();await page.locator('#btn-continue').click();await page.locator('#result-headline').waitFor();
 assert.ok(await page.evaluate(()=>!!PB.App.s.runId),'예전 저장본에도 runId');assert.ok(await cmp(page),'예전 저장본도 비교 줄');
 assert.deepEqual(errors,[]);await page.close();
}console.log('PASS result-compare-1109');}finally{await browser.close();server.close();}
