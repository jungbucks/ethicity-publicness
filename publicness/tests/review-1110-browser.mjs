// 2026-11-10 검토 문서(review.md) 2~5번 화면 확인 — 브라우저 한 번에 모아서
//  A(4번) 깨진 저장본: session:{} · 잘린 JSON → 이어하기 꺼짐 + 한 줄 안내 + 새 게임 가능(원문은 .broken에 남김) / 되살리다 예외 → 누른 뒤 안내 / 정상 저장은 그대로 이어짐
//  C(5번) 4단계 정책 카드: 고르기 전 ‘이 게임의 가정’ 한 줄 + 접는 규칙(수치 = 설정값), 고른 뒤에도 펼친 채
//  B(3번) 저장 실패: ‘저장했어요’ 대신 ‘저장하지 못했어요’ + 상단 #save-status 한 곳, 입력·게임은 계속, 저장이 돌아오면 성공 상태 / 첫 화면 문구
//  D(2번) 보고서: 폐지 뒤 집에 머문 이동·평가 대상 수요가 h.scores.mobility와 같은 숫자로 실림(화면·인쇄 스크린샷)
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/review-1110-browser.mjs   (한 번에 하나: D:/Works/.browser-test.lock)
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const KEY='ethicity.publicness.save',BROKEN='저장된 진행을 불러오지 못해서 이어할 수 없어요. 새로 시작할 수 있어요.';
const ROUTES=[[1,['F','C','D','A'],1],[2,['B','A','G','E'],1]];
const title=p=>p.evaluate(()=>({cont:!document.querySelector('#btn-continue').hidden,note:document.querySelector('#continue-note').textContent,shown:document.querySelector('#continue-note').getClientRects().length>0,start:document.querySelector('#btn-start').textContent,screen:document.body.dataset.screen,restart:document.querySelector('#confirm-restart').open}));
const setSave=(p,raw)=>p.evaluate(([k,raw])=>{localStorage.clear();localStorage.setItem(k,raw);},[KEY,raw]);
const fresh=p=>p.evaluate(()=>{const S=PB.Session,s=S.create(PB.config);return JSON.stringify({version:PB.config.SCENARIO_VERSION,savedAt:Date.now(),session:S.serialize(s)});});
const runPhase=(page)=>page.evaluate(R=>{const A=PB.App,S=PB.Session,s=A.s;s.tutorialSeen=true;S.beginPlan(s);s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);
 R.forEach(([num,nodes])=>{s.draft.routes.push({num,nodes:nodes.slice(),stops:nodes.map(()=>true),autoPlaced:true});});s.draft.buses.forEach((b,i)=>{b.routeNum=R[i%R.length][0];});
 A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(!S.startRun(s))throw new Error('출발 실패 '+s.phase);S.finishRun(s);A.go('result');},ROUTES);
const nextPlan=(page)=>page.evaluate(()=>{const A=PB.App,S=PB.Session;S.nextPhase(A.s);A.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
const bar=p=>p.evaluate(()=>{const t=document.querySelector('#topbar'),n=document.querySelector('#save-status'),tr=t.getBoundingClientRect(),r=n.getBoundingClientRect();
 return {hidden:n.hidden,text:n.textContent,count:document.querySelectorAll('#save-status').length,h:Math.round(tr.height),over:t.scrollWidth>t.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,inside:n.hidden||(r.width>60&&r.top>=tr.top-1&&r.bottom<=tr.bottom+1&&r.left>=0&&r.right<=innerWidth+1),w:Math.round(r.width),clip:n.scrollHeight>n.clientHeight+1};});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(base+'?no3d=1');const V=await page.evaluate(()=>PB.config.SCENARIO_VERSION);
 // ── A. 깨진 저장본 ──
 await setSave(page,JSON.stringify({version:V,savedAt:1,session:{}}));await page.reload();
 assert.deepEqual(await title(page),{cont:false,note:BROKEN,shown:true,start:'첫 운행 계획하기',screen:'title',restart:false},'session:{}');
 const good=await fresh(page),cut=good.slice(0,Math.floor(good.length/2));
 await setSave(page,cut);await page.reload();
 assert.deepEqual(await title(page),{cont:false,note:BROKEN,shown:true,start:'첫 운행 계획하기',screen:'title',restart:false},'잘린 JSON');
 await page.screenshot({path:`${SHOT}/_shot-review-broken-save-1280.png`});
 await page.locator('#btn-start').click();
 assert.equal((await title(page)).restart,false,'깨진 저장본은 지울지 묻지 않고 새 게임');
 assert.equal(await page.evaluate(k=>localStorage.getItem(k+'.broken'),KEY),cut,'원문을 따로 남김');
 assert.deepEqual(errors,[],'깨진 저장본으로 멈추지 않음');
 // 뼈대는 맞지만 되살리다 예외가 나는 저장본: 이어하기를 누르면 안내로 바뀜
 const o=JSON.parse(good);o.session.history=[{phase:1}];delete o.session.ledger;o.session.stage='plan';
 await setSave(page,JSON.stringify(o));await page.reload();assert.equal((await title(page)).cont,true);
 await page.locator('#btn-continue').click();
 assert.deepEqual(await title(page),{cont:false,note:BROKEN,shown:true,start:'첫 운행 계획하기',screen:'title',restart:false},'되살리다 실패');assert.deepEqual(errors,[]);
 // 정상 저장은 그대로 이어짐
 await setSave(page,good);await page.reload();const t0=await title(page);assert.equal(t0.cont,true);assert.match(t0.note,/^기본 세팅 · 1 \/ 5단계 계획 · /);assert.equal(t0.start,'새로 시작하기');
 await page.locator('#btn-continue').click();assert.equal(await page.evaluate(()=>document.body.dataset.screen),'plan');assert.equal(await page.evaluate(()=>PB.App.s.phase),1);
 console.log('  ok A 깨진 저장본');
 // ── 4단계 계획 화면까지 ──
 await runPhase(page);await nextPlan(page);await runPhase(page);await nextPlan(page);
 await page.evaluate(()=>{PB.Choices.set(PB.App.s,'petition','choice','reflect');});await runPhase(page);await nextPlan(page);
 await page.locator('#elder-card').waitFor();await page.waitForSelector('#map-banner',{state:'detached',timeout:8000}).catch(()=>{});
 // ── C. 정책 카드: 고르기 전에 가정과 규칙 ──
 const c0=await page.evaluate(()=>{const E=PB.config.elderFree,card=document.querySelector('#elder-card'),d=card.querySelector('#elder-rule'),first=card.querySelector('.fair-option');
  return {assume:card.querySelector('#elder-assume').textContent,open:d.open,summary:d.querySelector('.fair-rule-more').textContent,inSummary:!!d.querySelector('summary #elder-assume'),before:!!(d.compareDocumentPosition(first)&Node.DOCUMENT_POSITION_FOLLOWING),
   pressed:[...card.querySelectorAll('.fair-option')].map(b=>b.getAttribute('aria-pressed')),share:Math.round(E.share*100),stay:Math.round(E.abolishStay*100),fare:PB.App.won(PB.config.finance.fare)};});
 assert.equal(c0.assume,'이 게임에서는 요금이 생기면 일부 어르신이 이동을 포기한다고 가정해요.');assert.equal(c0.open,false,'규칙은 접힌 채');assert.equal(c0.summary,'규칙 보기');assert.equal(c0.inSummary,true,'가정 한 줄은 접혀 있어도 보임');assert.ok(await page.locator('#elder-assume').isVisible());
 assert.equal(c0.before,true,'선택 버튼 앞');assert.deepEqual(c0.pressed,['false','false'],'아직 고르기 전');
 await page.locator('#elder-rule summary').click();
 const rule=await page.evaluate(()=>[...document.querySelectorAll('#elder-rule li')].map(l=>l.textContent));
 assert.equal(rule.length,6);assert.ok(rule[0].includes('약 '+c0.share+'%')&&rule[0].includes('외곽 마을')&&rule[0].includes('5단계부터'),rule[0]);
 assert.ok(rule[1].startsWith('유지하면')&&rule[1].includes(c0.fare),rule[1]);assert.ok(rule[2].startsWith('폐지하면')&&rule[2].includes('약 '+c0.stay+'%')&&rule[2].includes(c0.fare),rule[2]);
 assert.ok(rule[5].includes('실제 사회에서 일어날 일을 예측한 것이 아니에요.'),rule[5]);
 assert.ok(await page.locator('#elder-rule li').last().isVisible());
 const fit=()=>page.evaluate(()=>{const c=document.querySelector('#elder-card').getBoundingClientRect(),a=document.querySelector('.plan-actions').getBoundingClientRect(),w=document.querySelector('#elder-why').getBoundingClientRect();return {cardBottom:Math.round(c.bottom),actionsTop:Math.round(a.top),whyBottom:Math.round(w.bottom),scroll:document.documentElement.scrollTop||document.body.scrollTop};});
 const fo=await fit();assert.ok(fo.cardBottom<=fo.actionsTop+1,'펼쳐도 카드가 출발 버튼 밑으로 넘치지 않음 '+JSON.stringify(fo));assert.equal(fo.scroll,0,'페이지가 밀리지 않음');
 await page.screenshot({path:`${SHOT}/_shot-review-elder-rule-1280.png`});
 await page.locator('#elder-keep').click();
 assert.equal(await page.evaluate(()=>document.querySelector('#elder-rule').open),true,'고른 뒤에도 펼친 채');assert.equal(await page.locator('#btn-depart').isDisabled(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'가로 넘침 없음');
 await page.screenshot({path:`${SHOT}/_shot-review-elder-plan-1280.png`});
 await page.locator('#elder-rule summary').click();await page.waitForSelector('#minimal-toast',{state:'hidden',timeout:8000}).catch(()=>{});
 const fc=await fit();assert.ok(fc.cardBottom<=fc.actionsTop+1,'접힌 카드도 버튼 위 '+JSON.stringify(fc));console.log('    접힌 카드',JSON.stringify(fc));
 await page.screenshot({path:`${SHOT}/_shot-review-elder-plan-1280.png`});
 console.log('  ok C 정책 카드 가정·규칙');
 // ── B. 저장 실패 → 회복 ──
 const b0=await bar(page);assert.equal(b0.hidden,true,'평소엔 숨김');
 await page.fill('#elder-why','요금');assert.equal(await page.locator('#elder-saved').textContent(),'저장했어요.');
 await page.evaluate(()=>{window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
 await page.fill('#elder-why','요금 수입');
 assert.equal(await page.locator('#elder-saved').textContent(),'저장하지 못했어요.');
 const FAIL=await page.evaluate(()=>PB.App.SAVE_FAIL);assert.equal(FAIL,'저장이 안 돼요. 이 창에서는 계속할 수 있지만 새로고침하면 기록이 사라질 수 있어요.');
 let b=await bar(page);console.log('    1280 상태 줄',JSON.stringify({w:b.w,h:b.h,clip:b.clip}));await page.screenshot({path:`${SHOT}/_shot-review-save-fail-1280.png`});assert.deepEqual({hidden:b.hidden,text:b.text,count:b.count,h:b.h,over:b.over,inside:b.inside,clip:b.clip},{hidden:false,text:FAIL,count:1,h:b0.h,over:false,inside:true,clip:false},'1280 상태 한 곳 '+JSON.stringify(b));
 assert.equal(await page.evaluate(()=>PB.App.s.elderPolicy.why),'요금 수입','입력은 계속 받음');
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).session.elderPolicy.why,KEY),'요금','저장본은 마지막 성공 그대로');
 await page.fill('#elder-why','요금 수입이');await page.fill('#elder-why','요금 수입이 필요');
 b=await bar(page);assert.equal(b.count,1);assert.equal(b.text,FAIL);
 assert.equal(await page.evaluate(F=>[...document.querySelectorAll('body *')].filter(n=>n.children.length===0&&n.textContent===F&&n.getClientRects().length).length,FAIL),1,'안내는 쌓이지 않고 한 곳');
 await page.screenshot({path:`${SHOT}/_shot-review-save-fail-1280.png`});
 const squeezed=()=>page.evaluate(()=>[...document.querySelectorAll('#topbar .top-actions .btn')].filter(b=>b.getClientRects().length&&b.getBoundingClientRect().height>46).map(b=>b.id));
 assert.deepEqual(await squeezed(),[],'1280 상단 버튼 안 찌그러짐');
 for(const [w,h] of [[1024,768],[960,720],[820,1180]]){await page.setViewportSize({width:w,height:h});await page.waitForTimeout(400);const x=await bar(page);assert.equal(x.hidden,false);assert.equal(x.over,false,w+' 상단 바 넘침 '+JSON.stringify(x));assert.equal(x.inside,true,w+' '+JSON.stringify(x));assert.equal(x.clip,false,w+' 상태 줄이 잘림 '+JSON.stringify(x));if(w>=960)assert.deepEqual(await squeezed(),[],w+' 상단 버튼 안 찌그러짐');console.log('    '+w+' 상태 줄',JSON.stringify({w:x.w,h:x.h,clip:x.clip}));if(w===1024)await page.screenshot({path:`${SHOT}/_shot-review-save-fail-1024.png`});}
 await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(400);
 await page.evaluate(()=>{PB.App.keepFocus=true;PB.App.render();});assert.equal(await page.evaluate(()=>document.body.dataset.screen),'plan','저장이 안 돼도 화면은 그대로 그려짐');assert.equal((await bar(page)).hidden,false);
 await page.evaluate(()=>{Storage.prototype.setItem=window.__set;});
 await page.fill('#elder-why','요금 수입이 필요해서');
 assert.equal(await page.locator('#elder-saved').textContent(),'저장했어요.','저장이 돌아오면 성공 상태');assert.equal((await bar(page)).hidden,true);
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).session.elderPolicy.why,KEY),'요금 수입이 필요해서');
 // 결과 화면 ‘내 생각 남기기’도 같은 규칙
 await page.locator('#elder-abolish').click();await runPhase(page);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('denied','SecurityError');};});
 await page.fill('#note-kept','외곽 마을');assert.equal(await page.locator('#think-note .note-saved').textContent(),'저장하지 못했어요.');assert.equal((await bar(page)).hidden,false);
 await page.evaluate(()=>{Storage.prototype.setItem=window.__set;});
 await page.fill('#note-kept','외곽 마을 어르신');assert.equal(await page.locator('#think-note .note-saved').textContent(),'저장했어요.');assert.equal((await bar(page)).hidden,true);
 assert.deepEqual(errors,[]);console.log('  ok B 저장 실패·회복');
 // ── D. 보고서 ──
 await nextPlan(page);await runPhase(page);
 await page.evaluate(()=>{const A=PB.App,S=PB.Session;S.nextPhase(A.s);A.s.finalReflection='순자 할머니의 이동을 더 살피게 됐어요.';A.go('ending');document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
 await page.locator('#btn-report').click();await page.locator('#report').waitFor();
 const rep=await page.evaluate(()=>{const s=PB.App.s,h=s.history[3],m=h.scores.mobility,sec=document.querySelector('.report-stage[data-phase="4"]');
  return {policy:s.elderPolicy.choice,N:m.N,done:m.done,score:m.score,stay:m.reasons.stayHome,gN:h.metrics.N,gA:h.metrics.arrived,text:sec.textContent,scope:document.querySelector('#report-scope').textContent,
   items:[...sec.querySelectorAll('.report-nums li')].map(li=>({t:li.textContent,wide:li.classList.contains('is-wide'),top:Math.round(li.getBoundingClientRect().top)})),
   s3:document.querySelector('.report-stage[data-phase="3"]').textContent,choice:document.querySelector('#report-choices').textContent,over:document.documentElement.scrollWidth>innerWidth+1};});
 assert.equal(rep.policy,'abolish');assert.ok(rep.stay>0,'집에 머문 이동이 있는 판');
 assert.ok(rep.text.includes(`실제로 생긴 이동 요청의 도착률 `)&&rep.text.includes(`(${rep.gN}건 중 ${rep.gA}건)`),rep.text);
 assert.ok(rep.text.includes(`이동 수요 충족(평가 대상) ${rep.score}점 (${rep.N}건 중 ${rep.done}건 완료)`),rep.text);
 assert.ok(rep.text.includes(`평가 대상 중 못 마친 이동 ${rep.N-rep.done}건 (`)&&rep.text.includes(`무임 폐지로 집에 머문 이동 ${rep.stay}건`),rep.text);
 assert.ok(rep.text.includes('버스를 탄 사람의 최장 대기 '));assert.doesNotMatch(rep.s3,/집에 머문/,'3단계는 정책 전');assert.match(rep.choice,/4단계 어르신 무임승차 폐지/);
 assert.match(rep.scope,/실제로 생긴 이동 요청/);assert.match(rep.scope,/집에 머문 이동/);assert.equal(rep.over,false);
 const wide=rep.items.filter(i=>i.wide);assert.equal(wide.length,2);assert.ok(wide.every(w=>rep.items.filter(i=>i.top===w.top).length===1),'평가 줄은 한 줄씩');
 await page.screenshot({path:`${SHOT}/_shot-review-report-1280.png`,fullPage:true});
 await page.locator('.report-stage[data-phase="4"]').screenshot({path:`${SHOT}/_shot-review-report-stage4.png`});
 await page.emulateMedia({media:'print'});
 assert.equal(await page.evaluate(()=>{const n=document.querySelector('#report-scope');return getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().height>0;}),true,'인쇄에도 범위 안내');
 assert.ok((await page.locator('.report-stage[data-phase="4"]').textContent()).includes('무임 폐지로 집에 머문 이동'),'인쇄에도 집에 머문 이동');
 await page.screenshot({path:`${SHOT}/_shot-review-report-print.png`,fullPage:true});await page.emulateMedia({media:'screen'});
 assert.deepEqual(errors,[]);await page.close();console.log('  ok D 보고서',JSON.stringify({gen:rep.gN+'/'+rep.gA,eval:rep.N+'/'+rep.done,stay:rep.stay}));
 // ── 첫 화면: 저장할 수 없는 브라우저 ──
 {const ctx=await browser.newContext({viewport:{width:1280,height:800}});await ctx.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('denied','SecurityError');};});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(base+'?no3d=1');
  assert.equal(await p.locator('#save-note').textContent(),'이 브라우저에서는 진행을 저장할 수 없어요. 이 창에서는 끝까지 할 수 있지만 새로고침하거나 창을 닫으면 기록이 사라져요.');
  assert.ok(await p.locator('#save-note').isVisible(),'간단 화면에서도 보임');await p.screenshot({path:`${SHOT}/_shot-review-save-blocked-title-1280.png`});
  await p.evaluate(()=>{PB.App.startGame();PB.App.s.tutorialSeen=true;PB.App.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
  assert.equal(await p.evaluate(()=>document.body.dataset.screen),'plan','저장이 막혀도 게임은 시작됨');assert.equal(await p.evaluate(()=>document.querySelector('#save-status').hidden),false);
  await p.screenshot({path:`${SHOT}/_shot-review-save-blocked-1280.png`});assert.deepEqual(errs,[]);await ctx.close();console.log('  ok 첫 화면 저장 불가 안내');}
 console.log('PASS review-1110');
}finally{await browser.close();server.close();}
