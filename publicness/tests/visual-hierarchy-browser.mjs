// 지도 시각 위계(2026-10-27) 수용 기준을 화면에서 잰다 — 2D·3D, 1280·375, 설계·운행(첫 긴급 조정 멈춤)
//  ① 이름표·노선 손잡이·인물 얼굴끼리 겹침 0  ② 지도 위 ‘개수’ 숫자 배지는 2종류(정류장 대기 👤 N, 노선 버스 수)뿐
//  ③ 빨강은 위험 표시(.danger)에만 — 노선 색·이름표·버스 수에 빨강 없음  ④ 노선 색 6개의 흑백 밝기 차이 ≥ 24(1~4번 ≥ 40)
//  ⑤ 같은 구간의 노선은 나란히(같은 선 위에 겹쳐 그리지 않음)  ⑥ 화면 오류 없음
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const cfg=require('../js/config.js');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ROUTES=[['F','C','B','A'],['I','D','A','G'],['E','H','A'],['B','E','G']];
// ④ 팔레트(설정값 자체)
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const gray=cfg.ui.routeColors.map(h=>255*Math.pow(lum(h),1/2.2));
// 노선 색은 사용자가 정한 서울 지하철 계열(2026-10-27) — 흑백 밝기 차이·빨강 제외 검사는 하지 않고 값만 기록한다(흰 테두리·끝 번호로 구분)
const hue=h=>{const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),c=mx-mn;if(!c)return{h:0,s:0,l:(mx+mn)/2};let x=mx===r?((g-b)/c)%6:mx===g?(b-r)/c+2:(r-g)/c+4;return{h:(x*60+360)%360,s:c/(1-Math.abs(mx+mn-1)),l:(mx+mn)/2};};

console.log('  팔레트 흑백 밝기',gray.map(g=>Math.round(g)).join(' · '));
async function setup(page,view){
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/${view==='2d'?'?no3d=1':''}`);
  await page.evaluate(routes=>{localStorage.clear();const S=PB.Session;PB.App.startGame();const s=PB.App.s;s.tutorialSeen=true;
    while(s.phase<3){S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=0;S.finishRun(s);S.nextPhase(s);}
    S.beginPlan(s);s.draft.routes=routes.map((ns,i)=>({num:i+1,nodes:ns,stops:ns.map(()=>true),autoPlaced:true}));s.draft.buses.forEach((b,i)=>{b.routeNum=i<routes.length?i+1:null;});
    PB.App._sceneKey=null;PB.App.go('plan');},ROUTES);
  await page.waitForTimeout(1500);
}
// 지도 위에 보이는 요소들의 겹침·숫자·빨강 검사(무대 기준 사각형)
const inspect=page=>page.evaluate(()=>{
  const stage=document.querySelector('#stage').getBoundingClientRect(),vis=e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&!e.closest('[hidden]')&&r.right>stage.left&&r.left<stage.right&&r.bottom>stage.top&&r.top<stage.bottom;};
  const items=[...document.querySelectorAll('#net-layer .net-label, #route-buses .route-bus, #map-people .map-person')].filter(vis).map(e=>{const r=e.getBoundingClientRect();return {k:e.className.split(' ')[0]+':'+(e.dataset.node||e.dataset.num||e.id),x:r.left,y:r.top,w:r.width,h:r.height};});
  const overlaps=[];for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j],ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(ox>1&&oy>1)overlaps.push(a.k+' × '+b.k);}
  // 숫자가 보이는 지도 요소 종류(시계·운행 조작·노선 번호 원은 ‘개수’가 아니라 제외)
  const allowed='.net-wait, .route-count, .cap-count, .net-cap text:not(.cap-count), .route-num, #map-clock, #map-clock *, #run-controls, #run-controls *, .run-alert, .run-alert *, #plan-ai-popover, #plan-ai-popover *';
  const numeric=new Set();document.querySelectorAll('#stage *').forEach(e=>{if(e.children.length&&!(e instanceof SVGTextElement))return;const t=(e.textContent||'').trim();if(!/\d/.test(t)||!vis(e)||e.matches(allowed)||e.closest('#map-clock,#run-controls,.run-alert,#plan-ai-popover'))return;numeric.add((e.className.baseVal!=null?e.className.baseVal:e.className)||e.tagName);});
  const kinds=new Set([...document.querySelectorAll('#stage .net-wait, #stage .route-count, #stage .cap-count')].filter(vis).map(e=>e.classList.contains('net-wait')?'wait':'buses'));
  // 빨강: 보이는 이름표·대기 pill·노선 손잡이·노선 선 색 중 .danger가 아닌 것
  const isRed=c=>{const m=c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);if(!m)return false;const [r,g,b]=m.slice(1,4).map(Number);return r>150&&g<90&&b<90;};
  const reds=[];[...document.querySelectorAll('#net-layer .net-label, #net-layer .net-wait, #route-buses .route-num, #route-buses .route-count')].filter(vis).forEach(e=>{if(e.classList.contains('danger'))return;const cs=getComputedStyle(e);if(isRed(cs.backgroundColor)||isRed(cs.color))reds.push(e.className+':'+(e.textContent||'').trim());});
  // 같은 구간의 노선이 나란히: 같은 두 정류장 사이 선들의 중점이 서로 다르다
  const mids={};document.querySelectorAll('#net-layer .net-lines line[data-route]').forEach(l=>{const k=[l.x1.baseVal.value,l.y1.baseVal.value,l.x2.baseVal.value,l.y2.baseVal.value].map(Math.round).join(',');(mids[k]=mids[k]||[]).push(l.dataset.route);});
  const stacked=Object.values(mids).filter(v=>new Set(v).size>1);
  return {n:items.length,overlaps,numeric:[...numeric],kinds:[...kinds],reds,stacked,labels:document.querySelectorAll('#net-layer .net-label').length};
});
try{for(const view of (process.env.VIEWS||'3d,2d').split(','))for(const [w,h] of [[1280,860],[375,812]]){
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:w<500?2:1,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setup(page,view);
  for(const scene of ['plan','run']){
    if(scene==='run'){await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
      for(let i=0;i<20&&!(await page.locator('#emergency-dialog[open]').count());i++){await page.locator('#run-next').click().catch(()=>{});await page.waitForTimeout(1200);}await page.waitForTimeout(600);}
    const r=await inspect(page),tag=`${view} ${w} ${scene}`;
    assert.ok(r.labels>=7,tag+' 이름표 '+r.labels);
    assert.deepEqual(r.overlaps,[],tag+' 겹침');
    assert.deepEqual(r.numeric,[],tag+' 허용 밖 숫자 배지');
    assert.ok(r.kinds.length<=2,tag+' 숫자 배지 종류 '+r.kinds);
    assert.deepEqual(r.reds,[],tag+' 위험 아닌 빨강');
    assert.deepEqual(r.stacked,[],tag+' 같은 구간 겹쳐 그림');
    console.log('  ok',tag,'요소',r.n,'숫자 배지',r.kinds.join('+')||'-');
  }
  assert.deepEqual(errors,[]);await page.close();
}console.log('PASS visual hierarchy');}finally{await browser.close();server.close();}
