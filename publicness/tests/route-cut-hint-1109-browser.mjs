// 2026-11-09 교사 플레이테스트 3: ‘구간 지우기’(노선 선 두 번 누르기, 2026-10-27)를 몰라서 기능을 요청함 → 알아볼 수 있게
//  · 첫 노선을 만든 뒤 한 번만 알림 ‘선을 두 번 누르면 그 구간만 지워져요.’(seenTips cut)
//  · 노선 선 위에 마우스를 올리면 / 손가락으로 길게 누르면 작은 말풍선(#route-line-tip) — 길게 누름은 편집으로 치지 않음
//  · 도움말 아이콘 칸에 ‘구간 지우기’ · 되돌리기·노선 초기화는 그대로
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/route-cut-hint-1109-browser.mjs
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests',CUT='선을 두 번 누르면 그 구간만 지워져요.';
const linePoint=(p,num,i=0)=>p.evaluate(([num,i])=>{const A=PB.App,v=A.view,r=PB.Session.routeByNum(A.s,num),a=A.nodeXY(r.nodes[i]),b=A.nodeXY(r.nodes[i+1]),o=v.laneOffset(r.nodes[i],r.nodes[i+1],num),
 P=v.project(a.x+o.dx/110,a.y+o.dy/110),Q=v.project(b.x+o.dx/110,b.y+o.dy/110),box=document.querySelector('#stage').getBoundingClientRect();
 const stops=PB.Session.graph(A.s).nodes.map(id=>{const n=A.nodeXY(id),q=v.project(n.x,n.y);return {x:box.left+q.left,y:box.top+q.top};});let best=null,score=-1;
 for(let g=.15;g<=.85;g+=.05){const x=box.left+P.left+(Q.left-P.left)*g,y=box.top+P.top+(Q.top-P.top)*g,hit=document.elementFromPoint(x,y);if(!hit||hit.closest('.route-bus,.map-person,.route-end-handle,button'))continue;const m=Math.min(...stops.map(s=>Math.hypot(s.x-x,s.y-y)));if(m>score){score=m;best={x,y};}}
 return best;},[num,i]);
const routes=p=>p.evaluate(()=>PB.Session.routesInOrder(PB.App.s).filter(r=>r.nodes.length).map(r=>r.nodes.join('')));
const lineTip=p=>p.evaluate(()=>{const t=document.querySelector('#route-line-tip');return t&&!t.hidden&&t.getBoundingClientRect().width>0?t.textContent:'';});
try{
 for(const view of (process.env.VIEWS||'2d,3d').split(',')){
  // 1. 첫 노선 → 버스 안내 다음에 구간 지우기 안내 한 번
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+(view==='2d'?'?no3d=1':''));
  await page.evaluate(()=>{localStorage.clear();PB.App.startGame();const s=PB.App.s;PB.Session.beginPlan(s);s.tutorialSeen=true;PB.App.go('plan');document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
  await page.waitForTimeout(900);
  const seen=[];await page.exposeFunction('__toastSeen',t=>seen.push(t));
  await page.evaluate(()=>{const t=PB.App.toast;PB.App.toast=function(x,o){window.__toastSeen(String(x));return t.apply(this,arguments);};});
  await page.evaluate(()=>{PB.App.onNodeClick('C');PB.App.onNodeClick('G');});
  await page.waitForFunction(CUT=>{const n=document.querySelector('#minimal-toast');return n&&!n.hidden&&n.textContent===CUT;},CUT,{timeout:9000});
  if(view==='2d')await page.screenshot({path:`${SHOT}/_shot-cut-hint-1280.png`});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ethicity.publicness.seenTips')).cut),true,'한 번 본 것으로 기억');
  // 2. 마우스를 선 위에 → 말풍선
  await page.waitForTimeout(2800);const q=await linePoint(page,1);await page.mouse.move(q.x,q.y-30);await page.mouse.move(q.x,q.y,{steps:4});await page.waitForTimeout(700);
  assert.match(await lineTip(page),/두 번 누르면 이 구간만 지워져요/,view+' 마우스 올림 말풍선');
  if(view==='2d')await page.screenshot({path:`${SHOT}/_shot-cut-hover-1280.png`});
  await page.mouse.move(q.x,q.y-120,{steps:4});await page.waitForTimeout(300);assert.equal(await lineTip(page),'','선을 벗어나면 사라짐');
  // 3. 두 번째 노선을 만들어도 다시 안 뜸
  const before=seen.filter(t=>t===CUT).length;await page.evaluate(()=>{document.querySelector('#btn-new-route').click();PB.App.onNodeClick('F');PB.App.onNodeClick('D');});await page.waitForTimeout(3500);
  assert.equal(seen.filter(t=>t===CUT).length,before,'한 번만');
  // 4. 도움말: 아이콘 칸 다섯째 ‘구간 지우기’, 되돌리기·초기화 버튼 그대로
  await page.locator('#btn-help').click();await page.locator('#help[open]').waitFor();
  const items=await page.evaluate(()=>[...document.querySelectorAll('#help .help-quick li')].map(li=>li.querySelector('b').textContent+'|'+li.querySelector('span').textContent));
  assert.ok(items.includes('구간 지우기|선을 두 번 누르면 지워져요'),items.join(', '));
  if(view==='2d')await page.screenshot({path:`${SHOT}/_shot-cut-help-1280.png`});
  await page.locator('#help form button[type=submit]').click();
  assert.equal(await page.locator('#btn-undo').count(),1);assert.equal(await page.locator('#btn-reset-routes').count(),1);
  assert.deepEqual(errors,[]);console.log('  ok',view,'1280 첫 노선 뒤 한 번 안내 · 마우스 말풍선 · 도움말');await page.close();
  // 5. 375 터치: 길게 누르면 말풍선, 노선은 그대로이고 편집 선택도 안 바뀜 · 두 번 탭은 여전히 구간 지우기
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),ph=await context.newPage(),perr=[];ph.on('pageerror',e=>perr.push(e.message));
  await ph.goto(base+(view==='2d'?'?no3d=1':''));
  await ph.evaluate(()=>{localStorage.clear();localStorage.setItem('ethicity.publicness.seenTips',JSON.stringify({bus:true,cut:true}));PB.App.startGame();const s=PB.App.s;PB.Session.beginPlan(s);s.tutorialSeen=true;PB.App.go('plan');document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
  await ph.waitForTimeout(900);await ph.evaluate(()=>{const s=PB.App.s;s.draft.routes=[['C','G'],['F','D']].map((ns,i)=>({num:i+1,nodes:ns,stops:[true,true],autoPlaced:true}));s.draft.buses.forEach((b,i)=>{b.routeNum=i<2?i+1:null;});PB.App.render();document.querySelector('#route-2').click();});await ph.waitForTimeout(3000);
  const cdp=await context.newCDPSession(ph),touch=async(type,pt)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pt?[{x:pt.x,y:pt.y,id:1}]:[]});};
  for(const num of [1,2]){/* 1 = 고르지 않은 노선(route-pointer), 2 = 고른 노선(route-drag) */
   const editing=await ph.evaluate(()=>PB.UI.planEditing()),draft=await ph.evaluate(()=>JSON.stringify(PB.App.s.draft)),p=await linePoint(ph,num);
   await ph.waitForTimeout(500);await touch('touchStart',p);await ph.waitForTimeout(750);
   assert.match(await lineTip(ph),/두 번 누르면 이 구간만 지워져요/,view+' 길게 누르면 말풍선 · 노선 '+num);
   if(view==='2d'&&num===1)await ph.screenshot({path:`${SHOT}/_shot-cut-longpress-375.png`});
   await touch('touchEnd');await ph.waitForTimeout(250);
   assert.equal(await ph.evaluate(()=>JSON.stringify(PB.App.s.draft)),draft,'길게 누름은 편집 아님');assert.equal(await ph.evaluate(()=>PB.UI.planEditing()),editing,'선택도 그대로');
  }
  // 길게 누른 다음 바로 한 번 더 탭해도 두 번 누르기로 치지 않음
  const p1=await linePoint(ph,1);await touch('touchStart',p1);await ph.waitForTimeout(750);await touch('touchEnd');await ph.waitForTimeout(80);await touch('touchStart',p1);await touch('touchEnd');await ph.waitForTimeout(300);
  assert.deepEqual(await routes(ph),['CG','FD'],'길게 누름 + 탭 ≠ 두 번 탭');
  const p2=await linePoint(ph,1);/* 고른 노선이 되면 버스 표시가 선 위에 생겨 자리가 바뀜 */await ph.waitForTimeout(500);await touch('touchStart',p2);await touch('touchEnd');await ph.waitForTimeout(90);await touch('touchStart',p2);await touch('touchEnd');await ph.waitForTimeout(300);
  assert.deepEqual(await routes(ph),['FD'],view+' 두 번 탭은 여전히 구간 지우기');
  assert.deepEqual(perr,[]);console.log('  ok',view,'375 길게 누름 말풍선 · 편집 아님 · 두 번 탭 유지');await context.close();
 }
 console.log('PASS route-cut-hint-1109');
}finally{await browser.close();server.close();}
