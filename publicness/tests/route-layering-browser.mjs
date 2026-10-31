import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/Works/token_economy/node_modules/playwright');
const server=await startServer(0), browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const view of ['3d','2d']) {
  const page=await browser.newPage({viewport:{width:1280,height:860}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/${view==='2d'?'?no3d=1':''}`);
  await page.evaluate(()=>{const A=PB.App,S=PB.Session;A.startGame();const s=A.s;s.tutorialSeen=true;S.beginPlan(s);s.draft.routes=[{num:1,nodes:['F','C','B','A'],stops:[true,true,true,true]},{num:2,nodes:['D','A','G'],stops:[true,true,true]}];s.draft.buses.forEach((b,i)=>b.routeNum=i%2+1);A._sceneKey=null;A.go('plan');document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
  await page.waitForTimeout(2000);
  const state=await page.evaluate(()=>{
   const stage=document.querySelector('#stage'), line=document.querySelector('.net-lines line');
   const x=(+line.getAttribute('x1') + +line.getAttribute('x2'))/2,y=(+line.getAttribute('y1') + +line.getAttribute('y2'))/2;
   const alert=document.createElement('div');alert.className='run-alert';alert.style.left=x+'px';alert.style.top=y+'px';
   alert.innerHTML='<span class="run-alert-label" style="top:0">노선보다 앞에 보이는 안내</span>';stage.appendChild(alert);
   const label=alert.firstChild;label.style.pointerEvents='auto';line.style.pointerEvents='stroke';
   const r=label.getBoundingClientRect(), stack=document.elementsFromPoint(r.x+r.width/2,r.y+2);
   return {front:stack.indexOf(label),line:stack.indexOf(line),lineWidth:+line.getAttribute('stroke-width'),rootZ:getComputedStyle(document.querySelector('#net-layer')).zIndex};
  });
  await page.screenshot({path:`D:/Works/route-layering-${process.env.BASELINE?'before':'after'}-${view}.png`});
  console.log(view,state);
  if(!process.env.BASELINE){assert.equal(state.rootZ,'auto');assert.ok(state.front>=0&&(state.line<0||state.front<state.line),'alert must paint above route');assert.ok(state.lineWidth<=7);assert.deepEqual(errors,[]);}
  await page.close();
 }
}finally{await browser.close();server.close();}
