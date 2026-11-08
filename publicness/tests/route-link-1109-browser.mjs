// 2026-11-09 교사 플레이테스트 1: 지도 끌기로 노선 잇기
// ‘대학교–산업·일자리 노선에 구도심 시장을 넣으려니 산업·일자리 끝에서만 이어지고 대학교–구도심–산업·일자리로는 안 됨’
//  · 정류장을 노선 선 위에 놓으면 그 두 정류장 사이에 들어간다(고른 노선이 아니어도) — 마우스·터치, 2D·3D, 1280·375
//  · 머리 정류장에서 끌어도 머리 쪽으로 이어진다(예전: 정류장 교체), 끝→반대쪽 끝 = 순환
//  · 안 이어지면 한 줄로 이유와 되는 방법(같은 실패를 또 해도 알림이 다시 뜸)
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/route-link-1109-browser.mjs  (VIEWS=2d,3d · SIZES=1280,375)
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const HINT='노선 끝이나 선 위로 끌어 놓으면 이어져요.';
const pos=(p,id)=>p.evaluate(id=>{const A=PB.App,n=A.nodeXY(id),q=A.view.project(n.x,n.y),b=document.querySelector('#stage').getBoundingClientRect();return {x:b.left+q.left,y:b.top+q.top};},id);
// 노선 num의 i번째 구간 위에서 정류장들과 가장 먼 점(차선 반영, 버스 표시·얼굴·끝 손잡이를 피함)
const linePoint=(p,num,i=0)=>p.evaluate(([num,i])=>{const A=PB.App,v=A.view,r=PB.Session.routeByNum(A.s,num),a=A.nodeXY(r.nodes[i]),b=A.nodeXY(r.nodes[i+1]),o=v.laneOffset(r.nodes[i],r.nodes[i+1],num),
 P=v.project(a.x+o.dx/110,a.y+o.dy/110),Q=v.project(b.x+o.dx/110,b.y+o.dy/110),box=document.querySelector('#stage').getBoundingClientRect();
 const stops=PB.Session.graph(A.s).nodes.map(id=>{const n=A.nodeXY(id),q=v.project(n.x,n.y);return {x:box.left+q.left,y:box.top+q.top};});let best=null,score=-1;
 for(let g=.15;g<=.85;g+=.05){const x=box.left+P.left+(Q.left-P.left)*g,y=box.top+P.top+(Q.top-P.top)*g,hit=document.elementFromPoint(x,y);if(!hit||hit.closest('.route-bus,.map-person,.route-end-handle,button'))continue;const m=Math.min(...stops.map(s=>Math.hypot(s.x-x,s.y-y)));if(m>score){score=m;best={x,y};}}
 return best;},[num,i]);
const setRoutes=(p,rs,editing)=>p.evaluate(([rs,editing])=>{const s=PB.App.s;s.draft.routes=rs.map((ns,i)=>({num:i+1,nodes:ns,stops:ns.map(()=>true),autoPlaced:true}));s.draft.buses.forEach((b,i)=>{b.routeNum=rs[i]&&rs[i].length?i+1:null;});PB.App.keepFocus=true;PB.App.render();if(editing)document.querySelector('#route-'+editing).click();},[rs,editing]);
const routes=p=>p.evaluate(()=>PB.Session.routesInOrder(PB.App.s).filter(r=>r.nodes.length).map(r=>r.nodes.join('')));
const draft=p=>p.evaluate(()=>JSON.stringify(PB.App.s.draft.routes));
const message=p=>p.evaluate(()=>document.querySelector('#plan-message').textContent);
const toast=p=>p.evaluate(()=>{const t=document.querySelector('#minimal-toast');return t&&!t.hidden?t.textContent:'';});
const hideToast=p=>p.evaluate(()=>{const t=document.querySelector('#minimal-toast');if(t)t.hidden=true;});
try{for(const size of (process.env.SIZES||'1280,375').split(','))for(const view of (process.env.VIEWS||'2d,3d').split(',')){
 const phone=size==='375',context=await browser.newContext(phone?{viewport:{width:375,height:812},isMobile:true,hasTouch:true,reducedMotion:'reduce'}:{viewport:{width:1280,height:800},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+(view==='2d'?'?no3d=1':''));
 await page.evaluate(()=>{localStorage.clear();PB.App.startGame();const s=PB.App.s;PB.Session.beginPlan(s);s.tutorialSeen=true;PB.App.go('plan');document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
 await page.waitForTimeout(900);
 const cdp=phone?await context.newCDPSession(page):null;
 const touch=async(type,q)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:q?[{x:q.x,y:q.y,id:1}]:[]});await page.waitForTimeout(60);};
 const drag=async(a,b)=>{await page.waitForTimeout(450);/* 두 번 누르기 판정과 섞이지 않게 */
  if(phone){await touch('touchStart',a);await touch('touchMove',{x:(a.x+b.x)/2,y:(a.y+b.y)/2});await touch('touchMove',b);await touch('touchEnd');}
  else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.waitForTimeout(80);await page.mouse.up();}
  await page.waitForTimeout(250);};
 const tag=`${view} ${size}`;
 // 1. 구도심 시장(E)을 대학교(C)–산업·일자리(G) 선 위에 놓기 → C·E·G (선 가운데로 안내선이 굵어짐은 마우스에서만 확인)
 await setRoutes(page,[['C','G']],1);await page.waitForTimeout(400);
 let line=await linePoint(page,1),E=await pos(page,'E');assert.ok(line,'선 위 점');
 if(!phone){await page.waitForTimeout(450);await page.mouse.move(E.x,E.y);await page.mouse.down();await page.mouse.move(line.x,line.y,{steps:10});await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>!!document.querySelector('.route-drag-guide.on-line')),true,tag+' 선 위에 오면 안내선 강조');
  if(view==='2d')await page.screenshot({path:`${SHOT}/_shot-link-1109-drag-${size}.png`});await page.mouse.up();await page.waitForTimeout(250);}
 else await drag(E,line);
 assert.deepEqual(await routes(page),['CEG'],tag+' 선 위에 놓으면 사이에');assert.match(await message(page),/구도심 시장 정류장을 대학교–산업·일자리 사이에 넣었어요/);
 await page.screenshot({path:`${SHOT}/_shot-link-1109-${view}-${size}.png`});
 await page.locator('#btn-undo').click();await page.waitForTimeout(150);assert.deepEqual(await routes(page),['CG'],'되돌리기 한 번');
 // 2. 머리(C)에서 E로 → E·C·G(손잡이로), 꼬리(G)에서 → C·G·E
 await drag(await pos(page,'C'),await pos(page,'E'));assert.deepEqual(await routes(page),['ECG'],tag+' 머리에서 잇기');await page.locator('#btn-undo').click();await page.waitForTimeout(150);
 await drag(await pos(page,'G'),await pos(page,'E'));assert.deepEqual(await routes(page),['CGE'],tag+' 꼬리에서 잇기');await page.locator('#btn-undo').click();await page.waitForTimeout(150);
 // 3. 빈 곳에 놓기 → 그대로 + 이유 한 줄, 같은 실패를 또 해도 알림
 const before=await draft(page),c=await pos(page,'C'),box=await page.locator('#stage').boundingBox();
 const empty=await page.evaluate(([bx,by,bw,bh])=>{const A=PB.App,ids=PB.Session.graph(A.s).nodes,pts=ids.map(id=>{const n=A.nodeXY(id),q=A.view.project(n.x,n.y);return {x:bx+q.left,y:by+q.top};});let best=null,score=-1;
  for(let x=bx+30;x<bx+bw-30;x+=20)for(let y=by+60;y<by+bh-60;y+=20){const h=document.elementFromPoint(x,y);if(!h||!h.closest('#stage')||h.closest('button,.route-bus,.map-person,.net-label,#minimal-toast'))continue;const m=Math.min(...pts.map(p=>Math.hypot(p.x-x,p.y-y)));if(m>score){score=m;best={x,y};}}return best;},[box.x,box.y,box.width,box.height]);
 await hideToast(page);await drag(E,empty);assert.equal(await draft(page),before,tag+' 빈 곳은 안 바뀜');assert.equal(await message(page),HINT);assert.equal(await toast(page),HINT,tag+' 알림 한 줄');
 await hideToast(page);await drag(E,empty);assert.equal(await toast(page),HINT,tag+' 같은 실패도 다시 알림');
 // 끝 손잡이를 빈 곳에 놓기
 await hideToast(page);await drag(c,empty);assert.equal(await draft(page),before);assert.equal(await message(page),'끝은 다른 정류장 위에 놓아야 이어져요.',tag+' 끝을 빈 곳에');
 // 4. 고른 노선이 아니어도 그 노선 선 위에 놓으면 그 노선에(2D 1280만 — 두 노선 배치)
 if(!phone&&view==='2d'){await setRoutes(page,[['A','B'],['C','G']],1);await page.waitForTimeout(400);line=await linePoint(page,2);await drag(await pos(page,'E'),line);
  assert.deepEqual(await routes(page),['AB','CEG'],'다른 노선 선 위');assert.equal(await page.evaluate(()=>PB.UI.planEditing()),2,'그 노선이 편집 중');
}
 // 5. 머리 정류장 → 다른 정류장(손잡이 밖에서 끈 경우와 같은 처리 = link) / 끝 → 반대쪽 끝 = 순환
 await setRoutes(page,[['C','E','G']],1);await page.waitForTimeout(300);
 await page.evaluate(()=>PB.App.onLink({node:'C'},{node:'B'}));assert.deepEqual(await routes(page),['BCEG'],tag+' 머리에서 끈 link = 머리 잇기(교체 아님)');
 await page.locator('#btn-undo').click();await page.evaluate(()=>PB.App.onLink({node:'C'},{node:'G'}));assert.deepEqual(await routes(page),['GCEG'],'머리→꼬리 = 순환');assert.match(await message(page),/순환 노선으로 연결했어요/);
 await page.locator('#btn-undo').click();await page.evaluate(()=>PB.App.onLink({node:'B'},{route:1,index:0}));assert.deepEqual(await routes(page),['CBEG'],'정류장 → 선(link) = 사이에');
 await page.evaluate(()=>PB.App.onLink({node:'E'},{route:1,index:0}));assert.match(await message(page),/이미 빨강 노선에 있어요/);
 await page.evaluate(()=>PB.App.onLink({node:'E'},null));assert.equal(await message(page),HINT);
 assert.deepEqual(errors,[]);console.log('  ok',tag,'선 위 끼우기·양 끝 잇기·빈 곳 이유·순환');await context.close();
}console.log('PASS route-link-1109');}finally{await browser.close();server.close();}
