// 후반 단계 지도 배치 측정·캡처 — 도전 모드(seed 42) 8단계 설계 화면, 균형 운영 노선. 1280·375, 3D·2D
//   node publicness/tests/layout-capture.mjs before|after  → docs/layout/<tag>-p8-<view>-<w>.png + 측정값 출력
// 측정: 네트워크 경계 상자(정류장 마커·노선 선)가 지도 영역 가로·세로에서 차지하는 비율, 이름표끼리·이름표와 노선 선 겹침 수, 같은 시드 같은 배치
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const tag=process.argv[2]||'before',out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs/layout');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const PLAN=[[['F','D','A'],2],[['B','C','A'],1],[['I','A','G'],2],[['J','H','B'],1],[['B','L','M'],1,5],[['B','N'],1,6]];
async function setup(page,view,seed){
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?seed=${seed}${view==='2d'?'&no3d=1':''}`);
  await page.evaluate(plan=>{localStorage.clear();const S=PB.Session;PB.App.startGame();const s=PB.App.s;s.tutorialSeen=true;
    while(s.phase<8){S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=0;S.finishRun(s);S.nextPhase(s);}
    S.beginPlan(s);s.draft.routes=[];s.draft.buses.forEach(b=>{b.routeNum=null;});
    plan.forEach(([ns,n,num])=>{const r=S.addRoute(s,{nodes:ns,stops:ns.map(()=>true)},num);if(!r)return;let free=s.draft.buses.filter(b=>b.routeNum==null&&S.canAssign(s,b.id,r.num));free.slice(0,n).forEach(b=>S.assign(s,b.id,r.num));});
    PB.App._sceneKey=null;PB.App.go('plan');},PLAN);
  await page.waitForTimeout(2500);
}
const measure=page=>page.evaluate(()=>{
  const st=document.querySelector('#stage').getBoundingClientRect(),xs=[],ys=[];
  document.querySelectorAll('#net-layer .net-stop circle:first-child').forEach(c=>{const r=c.getBoundingClientRect();xs.push(r.left,r.right);ys.push(r.top,r.bottom);});
  const segs=[...document.querySelectorAll('#net-layer .net-lines line[data-route]')].map(l=>{const b=l.getBoundingClientRect(),w=parseFloat(l.getAttribute('stroke-width'));return {x1:l.x1.baseVal.value+st.left,y1:l.y1.baseVal.value+st.top,x2:l.x2.baseVal.value+st.left,y2:l.y2.baseVal.value+st.top,pad:w/2};});
  segs.forEach(s=>{xs.push(s.x1,s.x2);ys.push(s.y1,s.y2);});
  const labels=[...document.querySelectorAll('#net-layer .net-label')].map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.node,x:r.left,y:r.top,w:r.width,h:r.height};});
  const hit=(s,r)=>{const x0=r.x-s.pad,y0=r.y-s.pad,x1=r.x+r.w+s.pad,y1=r.y+r.h+s.pad,dx=s.x2-s.x1,dy=s.y2-s.y1;let t0=0,t1=1;const p=[-dx,dx,-dy,dy],q=[s.x1-x0,x1-s.x1,s.y1-y0,y1-s.y1];for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return false;}else{const t=q[i]/p[i];if(p[i]<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}}}return true;};
  const ll=[],lr=[];labels.forEach((a,i)=>{labels.slice(i+1).forEach(b=>{if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1)ll.push(a.id+'×'+b.id);});segs.forEach(s=>{if(hit(s,a))lr.push(a.id);});});
  const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
  return {stage:[Math.round(st.width),Math.round(st.height)],cover:[Math.round(100*w/st.width),Math.round(100*h/st.height)],labelLabel:ll,labelRoute:[...new Set(lr)],coords:JSON.stringify(PB.App.s.config.nodes.map(n=>[n.id,n.x,n.y]))};
});
try{const results={};
 for(const view of ['3d','2d'])for(const [w,h] of [[1280,860],[375,812]]){
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:w<500?2:1,reducedMotion:'reduce'});await setup(page,view,42);
  const m=await measure(page);results[`${view}-${w}`]=m;
  await page.screenshot({path:path.join(out,`${tag}-p8-${view}-${w}.png`)});
  console.log(`${view} ${w}: 지도 ${m.stage.join('×')} · 네트워크 차지 가로 ${m.cover[0]}% 세로 ${m.cover[1]}% · 이름표끼리 겹침 ${m.labelLabel.length} · 이름표-노선 겹침 ${m.labelRoute.length}${m.labelRoute.length?' ('+m.labelRoute.join(',')+')':''}`);
  await page.close();
 }
 // 같은 시드 = 같은 배치(두 번 만들어 좌표 비교)
 const p2=await browser.newPage();await setup(p2,'2d',42);const again=await p2.evaluate(()=>JSON.stringify(PB.App.s.config.nodes.map(n=>[n.id,n.x,n.y])));
 console.log('같은 시드 같은 배치:',again===results['2d-1280'].coords);await p2.close();
 fs.writeFileSync(path.join(out,`${tag}-p8.json`),JSON.stringify(results,null,1));
}finally{await browser.close();server.close();}
