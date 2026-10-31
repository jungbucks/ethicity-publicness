// 버스 배치 조작(대기 버스·‘버스 ×N’ 끌어 놓기·클릭·키보드·터치) 헤드리스 검증. 2D·3D, 여러 화면 크기.
//   PLAYWRIGHT_MODULE=… node publicness/tests/bus-depot-browser.mjs   (VIEWS=2d 로 일부만)
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,log=(...a)=>console.log(' ',...a);
const draft=p=>p.evaluate(()=>JSON.stringify(PB.App.s.draft));
const buses=p=>p.evaluate(()=>PB.App.s.draft.buses.map(b=>b.routeNum));
// 보존 검사: 버스 수 = 보유 대수, 대기 표시 숫자 = 쉬는 버스 수, 노선 표시 ×N 합 + 대기 = 전체
async function conserve(p,label){
 const r=await p.evaluate(()=>{const s=PB.App.s,rest=s.draft.buses.filter(b=>b.routeNum==null).length,shown=Number((document.querySelector('#depot-count')||{}).textContent.replace('대','')),
  badge=[...document.querySelectorAll('.route-bus')].reduce((a,b)=>a+Number((b.querySelector('.route-count')||{}).textContent||0),0),onDrawn=s.draft.buses.filter(b=>b.routeNum!=null&&document.querySelector('#route-bus-'+b.routeNum)).length;
  return {n:s.draft.buses.length,owned:s.owned,rest,shown,badge,onDrawn,neg:s.draft.buses.some(b=>b.routeNum!=null&&b.routeNum<0)};});
 assert.equal(r.n,r.owned,label+': 버스 수 = 보유');assert.equal(r.shown,r.rest,label+': 대기 숫자');assert.equal(r.badge,r.onDrawn,label+': ×N 합');assert.ok(r.rest>=0&&!r.neg,label+': 음수 없음');
 return r;
}
// 지도 위 점: 노선 num의 i번째 구간 f 지점에서 선에 수직으로 k px(차선 간격 반영). client 좌표
const linePoint=(p,num,i,f,k)=>p.evaluate(([num,i,f,k])=>{const A=PB.App,v=A.view,r=PB.Session.routeByNum(A.s,num),a=A.nodeXY(r.nodes[i]),b=A.nodeXY(r.nodes[i+1]),o=v.laneOffset(r.nodes[i],r.nodes[i+1],num),
 P=v.project(a.x+o.dx/110,a.y+o.dy/110),Q=v.project(b.x+o.dx/110,b.y+o.dy/110),dx=Q.left-P.left,dy=Q.top-P.top,l=Math.hypot(dx,dy),box=document.querySelector('#stage').getBoundingClientRect();
 return {x:box.left+P.left+dx*f-dy/l*k,y:box.top+P.top+dy*f+dx/l*k};},[num,i,f,k]);
const crossing=p=>p.evaluate(()=>{const A=PB.App,v=A.view,box=document.querySelector('#stage').getBoundingClientRect();
 const seg=n=>{const r=PB.Session.routeByNum(A.s,n),a=A.nodeXY(r.nodes[0]),b=A.nodeXY(r.nodes[1]),o=v.laneOffset(r.nodes[0],r.nodes[1],n);return [v.project(a.x+o.dx/110,a.y+o.dy/110),v.project(b.x+o.dx/110,b.y+o.dy/110)];};
 const [p1,p2]=seg(1),[p3,p4]=seg(2),d=(p2.left-p1.left)*(p4.top-p3.top)-(p2.top-p1.top)*(p4.left-p3.left),t=((p3.left-p1.left)*(p4.top-p3.top)-(p3.top-p1.top)*(p4.left-p3.left))/d;
 return {x:box.left+p1.left+t*(p2.left-p1.left),y:box.top+p1.top+t*(p2.top-p1.top)};});
// 실제 마우스 끌기: 놓기 직전 강조된 노선·안내를 읽고 놓는다
async function dragTo(p,from,pt,{release=true}={}){
 const b=await p.locator(from).boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();
 await p.mouse.move(pt.x,pt.y,{steps:8});await p.waitForTimeout(60);
 const seen=await p.evaluate(()=>({hl:document.querySelector('#drop-highlight')?.dataset.num||null,label:document.querySelector('#drag-ghost .ghost-label')?.textContent||null,ok:!!document.querySelector('#drag-ghost.ok'),depot:document.querySelector('#bus-depot')?.classList.contains('drop-target')}));
 seen.during=await buses(p);if(release)await p.mouse.up();await p.waitForTimeout(80);return seen;
}
async function start(p,view){
 await p.goto(base+(view==='2d'?'?no3d=1':''));
 await p.evaluate(()=>{try{localStorage.clear();}catch(e){}PB.App.startGame();PB.Session.beginPlan(PB.App.s);PB.App.go('plan');});
}
try{for(const view of (process.env.VIEWS||'2d,3d').split(',')){
 const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page,view);
 // 0) 에셋: 기존 fal.ai 모델에서 만든 그림이 실제로 풀리고, 투명 여백 없이 표시 영역 = 그림 비율
 let r=await page.evaluate(()=>[...document.querySelectorAll('.bus-sprite')].map(i=>({ok:i.complete&&i.naturalWidth>0,w:i.naturalWidth,h:i.naturalHeight,rw:i.getBoundingClientRect().width,rh:i.getBoundingClientRect().height,src:i.getAttribute('src')})));
 await page.waitForFunction(()=>[...document.querySelectorAll('.bus-sprite')].every(i=>i.complete&&i.naturalWidth>0));
 r=await page.evaluate(()=>[...document.querySelectorAll('.bus-sprite')].map(i=>({w:i.naturalWidth,h:i.naturalHeight,rw:i.getBoundingClientRect().width,rh:i.getBoundingClientRect().height,src:i.getAttribute('src')})));
 assert.ok(r.length>=2);for(const x of r){assert.equal(x.src,'assets/art/bus-sprite.webp');assert.ok(Math.abs(x.rw/x.rh-x.w/x.h)<0.03,'표시 비율 = 그림 비율');}
 log(view,'에셋',r[0].w+'×'+r[0].h,'표시',r.length+'곳');
 await conserve(page,'시작');assert.deepEqual(await buses(page),[null,null]);

 // 1) 노선 생성 → 정확히 1대 자동 배치, 고치기·다시 완성에도 추가 배치 없음
 assert.match(await page.locator('#map-plan-message').innerText(),/이으면 대기 중인 1호차가 바로 운행해요\(운영·연료 약 [\d,]+원\)/,'배치 전에 비용 안내');
 await page.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});
 assert.deepEqual(await buses(page),[1,null],'노선 1 완성 → 1호차 1대만');
 assert.match(await page.locator('#map-plan-message').innerText(),/1호차가 대기에서 나와 1번 운행을 시작해요 · 운영·연료 약 [\d,]+원/);
 await page.evaluate(()=>PB.App.onNodeClick('E'));assert.deepEqual(await buses(page),[1,null],'정류장 추가는 추가 배치 없음');
 await page.evaluate(()=>{PB.App.onNodeClick('C');});assert.deepEqual(await buses(page),[1,null]);
 await page.locator('#btn-undo').click();await page.locator('#btn-undo').click();await page.locator('#btn-undo').click();
 assert.deepEqual(await buses(page),[null,null],'되돌리기 한 번에 노선 완성+자동 배치가 함께 취소');
 await page.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});assert.deepEqual(await buses(page),[1,null]);
 await conserve(page,'자동 배치');

 // 2) 끌어 놓기 증차 — 실제 마우스, 놓기 전 강조 = 실제 배치 대상
 let pt=await linePoint(page,1,0,.35,20),s=await dragTo(page,'#bus-token-2',pt);
 assert.deepEqual(s.during,[1,null],'끄는 동안은 차감 없음');assert.equal(s.hl,'1');assert.match(s.label,/놓으면 1번 1→2대 · 간격 .+ → .+ · 운영·연료 \+약 [\d,]+원 \(기본 수요 기준\)/);
 assert.deepEqual(await buses(page),[1,1],'놓으면 1대 추가');await conserve(page,'증차');
 log(view,'증차 안내:',s.label);

 // 3) 회수·이동 — ‘버스 ×N’에서 끌기
 s=await dragTo(page,'#route-bus-1',await page.locator('#bus-depot').boundingBox().then(b=>({x:b.x+b.width-40,y:b.y+b.height/2})));
 assert.ok(s.depot&&s.ok);assert.match(s.label,/놓으면 대기로 · 1번 2→1대 · 간격 .+ → .+ · 운영·연료 −약 [\d,]+원/);assert.deepEqual(await buses(page),[1,null],'번호 큰 2호차 회수');await conserve(page,'회수');
 // 노선 2 만들기(지도에서 실제로 끌어 잇기 — 기존 노선 그리기와 충돌 없음)
 await page.locator('#route-2').click();
 const nodePt=id=>page.evaluate(id=>{const A=PB.App,n=A.nodeXY(id),q=A.view.project(n.x,n.y),b=document.querySelector('#stage').getBoundingClientRect();return {x:b.left+q.left,y:b.top+q.top};},id);
 const B=await nodePt('B'),E=await nodePt('E');await page.mouse.move(B.x,B.y);await page.mouse.down();await page.mouse.move(E.x,E.y,{steps:10});await page.mouse.up();await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,2).nodes),['B','E'],'지도 끌기로 노선 그리기');
 assert.deepEqual(await buses(page),[1,2],'노선 2 완성 → 2호차 자동');await conserve(page,'노선2');
 // 다른 노선으로 이동: 2번의 2호차 → 1번 선 위
 s=await dragTo(page,'#route-bus-2',await linePoint(page,1,0,.2,-15));assert.equal(s.hl,'1');assert.match(s.label,/놓으면 1번 1→2대 .*2번 1→0대 · 운행 대기/);
 assert.deepEqual(await buses(page),[1,1]);await conserve(page,'이동');
 assert.ok(await page.locator('#route-bus-2.idle').count(),'마지막 버스가 떠난 노선은 남고 운행 대기');assert.match(await page.locator('#route-bus-2').getAttribute('aria-label'),/운행 대기/);assert.equal(await page.locator('#route-bus-2 .route-count').innerText(),'0');
 assert.equal(await page.evaluate(()=>PB.Session.routeByNum(PB.App.s,2).nodes.length),2,'노선 유지');
 assert.match(await page.locator('#depot-count').innerText(),/^0대$/);assert.ok(await page.locator('.depot-empty').count());

 // 4) 교차 지점은 모호 → 강조 없음·변화 없음, 교차에서 비켜난 곳은 강조 = 배치
 const X=await crossing(page);
 s=await dragTo(page,'#route-bus-1',X);assert.equal(s.hl,null);assert.match(s.label,/겹치는 곳/);assert.deepEqual(await buses(page),[1,1],'모호하면 배치 안 함');
 const before=await draft(page);
 for(const [num,i,f,k] of [[2,0,.15,10],[2,0,.85,-25],[1,0,.1,30],[1,0,.9,-35],[2,0,.5,60]]){
  const p2=await linePoint(page,num,i,f,k),seen=await dragTo(page,'#route-bus-1',p2),after=await buses(page);
  const got=after.filter((x,j)=>x!==JSON.parse(before).buses[j].routeNum).length?after.find((x,j)=>x!==JSON.parse(before).buses[j].routeNum):null;
  const want=seen.ok&&seen.hl?Number(seen.hl):null;
  assert.equal(got===undefined?null:got,want,`강조(${seen.hl}) = 실제(${got}) @${num}/${f}/${k}`);
  if(k===60)assert.equal(want,null,'선에서 60px 밖은 대상 없음');
  if(num===1&&want===null&&k<44)assert.match(seen.label,/지금 달리는 노선/);
  await page.evaluate(d=>{PB.App.s.draft=JSON.parse(d);PB.App.keepFocus=true;PB.App.render();},before);
 }

 // 5) 잘못된 놓기·취소: 빈 곳, Esc, pointercancel, 화면 밖(상단 바) — 자원 그대로
 for(const how of ['empty','esc','cancel','topbar']){
  const d0=await draft(page),src=await page.locator('#route-bus-1').boundingBox();
  await page.mouse.move(src.x+src.width/2,src.y+src.height/2);await page.mouse.down();const tgt=how==='topbar'?{x:600,y:20}:await linePoint(page,2,0,.5,how==='empty'?120:5);
  await page.mouse.move(tgt.x,tgt.y,{steps:6});
  if(how==='esc')await page.keyboard.press('Escape');
  if(how==='cancel')await page.evaluate(()=>document.querySelector('#route-bus-1').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
  await page.mouse.up();await page.waitForTimeout(80);
  assert.equal(await draft(page),d0,how+': 자원 그대로');assert.equal(await page.locator('#drag-ghost').count(),0,how+': 끌던 그림 정리');
 }
 assert.equal(await page.evaluate(()=>PB.App.s.current),null,'계획 단계에는 운행 중인 승객이 없음');

 // 6) 클릭·탭 보조 조작과 키보드 (끌기 직후 350ms의 유령 클릭 무시 시간이 지난 뒤)
 await page.waitForTimeout(400);
 await page.locator('#route-bus-1').click();assert.equal(await page.locator('#route-bus-1').getAttribute('aria-pressed'),'true');
 await page.locator('#bus-rest').click();assert.deepEqual(await buses(page),[1,null],'고르기 → 대기로 돌리기');
 await page.locator('#bus-token-2').click();const lp=await linePoint(page,2,0,.5,0);await page.mouse.click(lp.x,lp.y);await page.waitForTimeout(80);
 assert.deepEqual(await buses(page),[1,2],'버스 고르기 → 지도 선 누르기');
 await page.locator('#route-bus-2').focus();await page.keyboard.press('Enter');assert.ok(await page.locator('#bus-rest').count());
 await page.locator('#bus-rest').focus();await page.keyboard.press('Enter');assert.deepEqual(await buses(page),[1,null],'키보드 회수');
 await page.locator('#bus-token-2').focus();await page.keyboard.press('Enter');await page.locator('#route-bus-1').focus();await page.keyboard.press('Enter');
 assert.deepEqual(await buses(page),[1,1],'키보드 배치');
 await page.locator('#route-bus-1').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await page.locator('#bus-rest').count(),0,'Esc로 고르기 해제');
 await page.locator('#route-bus-1').focus();await page.keyboard.press('Enter');await page.locator('#route-2').click();assert.deepEqual(await buses(page),[1,2],'노선 버튼으로 이동');
 await conserve(page,'키보드');

 // 7) 화면 크기·배율이 바뀐 뒤에도 판정이 맞다
 for(const [w,h] of [[1024,768],[820,1100]]){
  await page.setViewportSize({width:w,height:h});await page.waitForTimeout(400);
  // 지도 틀이 화면에 맞춰 작아지면 노선 사이가 좁아져 ‘모호’가 될 수 있다 — 게임 판정으로 2번만 가리키는 점을 고른다
  const d0=await draft(page),p3=await page.evaluate(()=>{const A=PB.App,v=A.view,r=PB.Session.routeByNum(A.s,2),box=document.querySelector('#stage').getBoundingClientRect();for(let i=0;i+1<r.nodes.length;i++)for(let f=.1;f<.95;f+=.05)for(const k of [0,8,-8,14,-14]){const a=A.nodeXY(r.nodes[i]),b=A.nodeXY(r.nodes[i+1]),o=v.laneOffset(r.nodes[i],r.nodes[i+1],2),P=v.project(a.x+o.dx/110,a.y+o.dy/110),Q=v.project(b.x+o.dx/110,b.y+o.dy/110),dx=Q.left-P.left,dy=Q.top-P.top,l=Math.hypot(dx,dy),x=box.left+P.left+dx*f-dy/l*k,y=box.top+P.top+dy*f+dx/l*k,t=PB.UI.busDrop.targetAt(x,y),h=document.elementFromPoint(x,y);if(t.kind==='route'&&t.num===2&&h&&!h.closest('.route-bus,.map-person,#bus-depot'))return {x,y};}});
  s=await dragTo(page,'#route-bus-1',p3);
  assert.equal(s.hl,'2',w+'px 강조');assert.deepEqual(await buses(page),[2,2],w+'px 실제 배치');
  await page.evaluate(d=>{PB.App.s.draft=JSON.parse(d);PB.App.keepFocus=true;PB.App.render();},d0);
 }
 await page.setViewportSize({width:1366,height:900});await page.waitForTimeout(300);

 // 8) 저장 → 새로고침 → 이어하기 후 같은 상태, 다시 고쳐도 추가 배치 없음
 const saved=await draft(page);await page.reload();await page.locator('#btn-continue').click();
 for(let i=0;i<40&&!(await page.locator('#bus-depot').count());i++){if(await page.locator('#btn-begin-plan').isVisible().catch(()=>false))await page.locator('#btn-begin-plan').click();await page.waitForTimeout(100);}
 assert.equal(await draft(page),saved,'이어하기 후 초안 동일(autoPlaced 포함)');await conserve(page,'이어하기');
 await page.evaluate(()=>{PB.App.onRouteClick(2,0);PB.App.onNodeClick('C');});assert.deepEqual(await buses(page),[1,2]);
 assert.deepEqual(errors,[],view+' 오류 없음');
 await page.screenshot({path:`publicness/tests/_shot-bus-depot-${view}.png`});
 await page.close();console.log('PASS bus-depot',view);
}
 // 9) 작은 화면 + 터치(합성 pointerType touch): 끌기 중 페이지 스크롤 없음, 44px 대상
 for(const view of ['2d','3d']){
  const ctx=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:2,hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page,view);await page.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});await page.waitForTimeout(300);
  const box=await page.locator('#bus-token-2').boundingBox();assert.ok(box.height>=44,'대기 버스 44px 이상');
  assert.equal(await page.locator('#bus-token-2').evaluate(e=>getComputedStyle(e).touchAction),'none');assert.equal(await page.locator('#route-bus-1').evaluate(e=>getComputedStyle(e).touchAction),'none');
  await page.locator('#route-bus-1').scrollIntoViewIfNeeded();
  const sy=await page.evaluate(()=>scrollY),to=await linePoint(page,1,0,.3,10);
  const res=await page.evaluate(([to])=>{const t=document.querySelector('#bus-token-2'),r=t.getBoundingClientRect(),o={pointerId:7,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,button:0,buttons:1};
   const at=(x,y)=>Object.assign({},o,{clientX:x,clientY:y});t.dispatchEvent(new PointerEvent('pointerdown',at(r.left+r.width/2,r.top+r.height/2)));
   for(let i=1;i<=6;i++)t.dispatchEvent(new PointerEvent('pointermove',at(r.left+r.width/2+(to.x-r.left-r.width/2)*i/6,r.top+r.height/2+(to.y-r.top-r.height/2)*i/6)));
   const hl=document.querySelector('#drop-highlight').dataset.num||null;t.dispatchEvent(new PointerEvent('pointerup',at(to.x,to.y)));return {hl,buses:PB.App.s.draft.buses.map(b=>b.routeNum)};},[to]);
  assert.equal(res.hl,'1');assert.deepEqual(res.buses,[1,1],'터치 끌기로 증차');
  assert.equal(await page.evaluate(()=>scrollY),sy,'끌기 중 스크롤 없음');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'가로 넘침 없음');
  // 노선 손잡이(번호 원 + 버스 수)는 손가락용 판정 여유(::before)까지 약 44px
  const hit=await page.locator('#route-bus-1').evaluate(e=>{const r=e.getBoundingClientRect(),b=getComputedStyle(e,'::before');return {w:r.width-2*parseFloat(b.left),h:r.height-2*parseFloat(b.top)};});
  assert.ok(hit.w>=44&&hit.h>=40,'손잡이 누르는 영역 '+JSON.stringify(hit));
  await page.screenshot({path:`publicness/tests/_shot-bus-depot-375-${view}.png`});
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS bus-depot 375 touch',view);
 }
}finally{await browser.close();server.close();}
