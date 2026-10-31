// 구간 없애기: 지도에서 노선 선을 두 번 누르면(마우스 더블클릭·터치 두 번 탭) 그 두 정류장 사이 길만 없어진다. 되돌리기 한 번으로 복구.
// 두 정류장 노선 → 노선이 없어지고 버스는 대기로 / 끝 구간 → 짧아짐 / 가운데 → 두 노선(빈 칸이 없으면 긴 쪽만) / 순환 → 열림.
// 한 번 클릭·느린 두 번 클릭·정류장 더블클릭·AI 미리보기에서는 철거하지 않는다. 2D·3D
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`;
// 노선 num 첫 구간의 f 지점(차선 반영) — ‘버스 ×N’ 표시와 겹치지 않게 f를 고른다
const linePoint=(p,num,f,i=0)=>p.evaluate(([num,f,i])=>{const A=PB.App,v=A.view,r=PB.Session.routeByNum(A.s,num),a=A.nodeXY(r.nodes[i]),b=A.nodeXY(r.nodes[i+1]),o=v.laneOffset(r.nodes[i],r.nodes[i+1],num),
 P=v.project(a.x+o.dx/110,a.y+o.dy/110),Q=v.project(b.x+o.dx/110,b.y+o.dy/110),box=document.querySelector('#stage').getBoundingClientRect();
 // 정류장 선택 반경(정류장이 우선)·표시·인물에 걸리지 않게, 선 위에서 정류장들과 가장 먼 점을 고른다
 const stops=PB.Session.graph(A.s).nodes.map(id=>{const n=A.nodeXY(id),q=v.project(n.x,n.y);return {x:box.left+q.left,y:box.top+q.top};});let best=null,score=-1;
 for(let g=.1;g<=.9;g+=.05){const x=box.left+P.left+(Q.left-P.left)*g,y=box.top+P.top+(Q.top-P.top)*g,hit=document.elementFromPoint(x,y);if(!hit||hit.closest('.route-bus,.map-person'))continue;const m=Math.min(...stops.map(s=>Math.hypot(s.x-x,s.y-y)));if(m>score){score=m;best={x,y};}}
 return best;},[num,f,i]);
const routes=p=>p.evaluate(()=>PB.App.s.draft.routes.filter(r=>r.nodes.length).map(r=>r.num));
const buses=p=>p.evaluate(()=>PB.App.s.draft.buses.map(b=>b.routeNum));
const nodes=p=>p.evaluate(()=>PB.Session.routesInOrder(PB.App.s).map(r=>r.nodes.join('')));
// 노선을 바로 정해 놓고 다시 그린다(되돌리기 기준점도 이 상태). 버스 i호차 → i번 노선
const setRoutes=(p,rs)=>p.evaluate(rs=>{const s=PB.App.s;s.draft.routes=rs.map((ns,i)=>({num:i+1,nodes:ns,stops:ns.map(()=>true),autoPlaced:true}));s.draft.buses.forEach((b,i)=>{b.routeNum=rs[i]&&rs[i].length?i+1:null;});PB.App.keepFocus=true;PB.App.render();},rs);
const cut=async(p,num,i)=>{await p.waitForTimeout(500);const q=await linePoint(p,num,.5,i);await p.mouse.dblclick(q.x,q.y);await p.waitForTimeout(200);};
try{for(const view of (process.env.VIEWS||'2d,3d').split(',')){
 const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+(view==='2d'?'?no3d=1':''));
 await page.evaluate(()=>{localStorage.clear();PB.App.startGame();PB.Session.beginPlan(PB.App.s);PB.App.go('plan');PB.App.onNodeClick('F');PB.App.onNodeClick('D');});
 assert.deepEqual(await routes(page),[1]);assert.deepEqual(await buses(page),[1,null]);
 let pt=await linePoint(page,1,.3);
 // 한 번 클릭 → 편집 선택만, 느린 두 번(0.7초 간격) → 철거 안 함
 await page.mouse.click(pt.x,pt.y);await page.waitForTimeout(700);await page.mouse.click(pt.x,pt.y);await page.waitForTimeout(150);
 assert.deepEqual(await routes(page),[1],'한 번·느린 두 번 클릭은 철거 아님');
 // 정류장 더블클릭은 노선 철거가 아니다
 const F=await page.evaluate(()=>{const A=PB.App,n=A.nodeXY('F'),q=A.view.project(n.x,n.y),b=document.querySelector('#stage').getBoundingClientRect();return {x:b.left+q.left,y:b.top+q.top};});
 await page.waitForTimeout(500);await page.mouse.dblclick(F.x,F.y);await page.waitForTimeout(150);assert.deepEqual(await routes(page),[1],'정류장 더블클릭은 철거 아님');
 // 더블클릭 → 철거, 버스 대기로, 대기 숫자·표시 갱신
 await page.waitForTimeout(500);pt=await linePoint(page,1,.3);await page.mouse.dblclick(pt.x,pt.y);await page.waitForTimeout(200);
 assert.deepEqual(await routes(page),[],view+' 더블클릭으로 철거');assert.deepEqual(await buses(page),[null,null],'버스는 대기로(보유 대수 그대로)');
 assert.equal(await page.evaluate(()=>PB.App.s.draft.buses.length),2);assert.match(await page.locator('#depot-count').innerText(),/^2대$/);
 assert.equal(await page.locator('#route-bus-1').count(),0);
 assert.match(await page.locator('#map-plan-message').innerText(),/외곽 마을–병원·공공서비스 구간을 없애 1번 노선이 없어졌어요 · 1호차는 대기로\. 잘못 지웠다면 ↶ 되돌리기/);
 // 되돌리기 한 번 → 노선·버스 모두 복구
 await page.locator('#btn-undo').click();assert.deepEqual(await routes(page),[1]);assert.deepEqual(await buses(page),[1,null],'되돌리기로 노선과 배치 복구');
 // 터치 두 번 탭(합성 pointerType touch)
 await page.waitForTimeout(500);pt=await linePoint(page,1,.3);
 await page.evaluate(({x,y})=>{const o={pointerId:5,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,button:0,clientX:x,clientY:y};
  for(let i=0;i<2;i++){const t=document.elementFromPoint(x,y);t.dispatchEvent(new PointerEvent('pointerdown',o));document.elementFromPoint(x,y).dispatchEvent(new PointerEvent('pointerup',o));}},pt);await page.waitForTimeout(200);
 assert.deepEqual(await routes(page),[],view+' 두 번 탭으로 철거');
 await page.locator('#btn-undo').click();assert.deepEqual(await routes(page),[1]);
 // 끝 구간: F–C를 없애면 C→B→A로 짧아지고 버스는 그대로
 await setRoutes(page,[['F','C','B','A'],[]]);await cut(page,1,0);
 assert.deepEqual(await nodes(page),['CBA','']);assert.deepEqual(await buses(page),[1,null],'버스 그대로');
 await page.locator('#btn-undo').click();assert.deepEqual(await nodes(page),['FCBA','']);
 // 가운데 구간: C–B를 없애면 1번 F→C(버스) + 빈 칸이던 2번 B→A(운행 대기)
 await cut(page,1,1);assert.deepEqual(await nodes(page),['FC','BA']);assert.deepEqual(await buses(page),[1,null]);
 assert.match(await page.locator('#map-plan-message').innerText(),/두 노선으로 나눴어요 · 1번 외곽 마을 → 대학교 \/ 2번 밀집 주거지 → 기차역\(운행 대기/);
 assert.match(await page.locator('#route-bus-2').getAttribute('aria-label'),/운행 대기/);
 await page.locator('#btn-undo').click();assert.deepEqual(await nodes(page),['FCBA',''],'되돌리기 한 번으로 합쳐짐');
 // 칸이 없으면(노선 한도 2개 모두 사용) 짧은 쪽을 지우고 긴 쪽만 — F→C→B→A→G 의 B–A를 없애면 F→C→B가 남는다
 await setRoutes(page,[['F','C','B','A','G'],['D','E']]);await cut(page,1,2);
 assert.deepEqual(await nodes(page),['FCB','DE']);assert.match(await page.locator('#map-plan-message').innerText(),/노선 한도\(최대 2개\)라 짧은 쪽은 지우고/);
 await page.locator('#btn-undo').click();assert.deepEqual(await nodes(page),['FCBAG','DE']);
 // 순환: A→B→C→E→(A)에서 B–C를 없애면 C→E→A→B 왕복으로 열린다
 await setRoutes(page,[['A','B','C','E','A'],[]]);await cut(page,1,1);
 assert.deepEqual(await nodes(page),['CEAB','']);assert.match(await page.locator('#map-plan-message').innerText(),/순환을 풀었어요/);
 await page.locator('#btn-undo').click();assert.deepEqual(await nodes(page),['ABCEA','']);
 // 노선 초기화: 노선 모두 지우고 버스는 전부 대기, 빈 1번 하나 남김 → 되돌리기 한 번으로 그대로
 await setRoutes(page,[['F','C','B'],['D','E']]);await page.waitForTimeout(400);
 await page.locator('#btn-reset-routes').click();
 assert.deepEqual(await nodes(page),['']);assert.deepEqual(await buses(page),[null,null]);assert.match(await page.locator('#depot-count').innerText(),/^2대$/);
 assert.match(await page.locator('#map-plan-message').innerText(),/노선을 모두 지웠어요 · 버스 2대는 대기로/);
 assert.ok(await page.locator('#btn-reset-routes').isDisabled(),'지울 것이 없으면 비활성');
 await page.locator('#btn-undo').click();assert.deepEqual(await nodes(page),['FCB','DE']);assert.deepEqual(await buses(page),[1,2],'되돌리기로 노선·배치 복구');
 await setRoutes(page,[['F','D'],[]]);
 // AI 미리보기 중에는 철거하지 않는다
 await page.locator('#plan-ai-toggle').click();await page.locator('#goal-time').click();await page.locator('#rec-card').waitFor();await page.locator('#plan-ai-toggle').click();
 await page.waitForTimeout(500);const before=await page.evaluate(()=>JSON.stringify(PB.App.s.draft));pt=await linePoint(page,1,.3);
 if(pt){await page.mouse.dblclick(pt.x,pt.y);await page.waitForTimeout(150);}
 assert.equal(await page.evaluate(()=>JSON.stringify(PB.App.s.draft)),before,'미리보기 중 초안 그대로');
 assert.deepEqual(errors,[]);await page.close();console.log('PASS route-demolish',view);
}}finally{await browser.close();server.close();}
