import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/Works/token_economy/node_modules/playwright');
const server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const failures=[];
try {
 for(const view of ['2d','3d']) for(const width of (process.env.TEST_WIDTHS||'1280,820,375').split(',').map(Number)) for(const phase of [1,8]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?${phase===8?'seed=42&':''}${view==='2d'?'no3d=1':''}`);
  await page.evaluate(phase=>{
   localStorage.clear();const A=PB.App,S=PB.Session;A.startGame();const s=A.s;s.tutorialSeen=true;
   while(s.phase<phase){S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=0;S.finishRun(s);S.nextPhase(s);}
   S.beginPlan(s);s.draft.routes=[{num:1,nodes:['F','D','A'],stops:[true,true,true]},{num:2,nodes:['B','C','A'],stops:[true,true,true]},{num:3,nodes:['A','E','B'],stops:[true,true,true]}];
   s.draft.buses.forEach((b,i)=>b.routeNum=S.canAssign(s,b.id,i%3+1)?i%3+1:null);if(!S.startRun(s))throw Error(S.validate(s).join(';'));A.go('run');
   document.querySelectorAll('dialog[open]').forEach(d=>d.close());
   document.querySelector('#run-pause')?.click();
  },phase);
  await page.waitForTimeout(1000);
  const result=await page.evaluate(()=>{
   const A=PB.App,stage=document.querySelector('#stage'),layer=document.querySelector('#stage-overlay');
   layer.querySelectorAll('.bubble,.run-alert').forEach(e=>e.remove());
   ['D','D','A'].forEach((id,i)=>{const e=document.createElement('div');e.dataset.node=id;
    e.className=i===2?'run-alert':'bubble';e.innerHTML=i===2?'<span class="run-alert-ring"></span><span class="run-alert-label">긴 기다림 · 병원 이동</span>':'<b>만차 · </b>다음 버스를 기다리고 있어요.';layer.append(e);});
   PB.UI.placeRunNotices?.();
   const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};};
   const hit=(a,b)=>a.x<b.x+b.w-.5&&b.x<a.x+a.w-.5&&a.y<b.y+b.h-.5&&b.y<a.y+a.h-.5;
   const elements=[...layer.querySelectorAll('.bubble,.run-alert-label')];
   const shown=e=>getComputedStyle(e).visibility!=='hidden';
   const st=r(stage),notices=elements.filter(shown).map(r),labels=[...document.querySelectorAll('.net-label')].map(r);
   const inside=b=>b.x>=st.x-1&&b.y>=st.y-1&&b.x+b.w<=st.x+st.w+1&&b.y+b.h<=st.y+st.h+1;
   return {controlsOutside:!hit(r(document.querySelector('#run-controls')),st),clockOutside:!hit(r(document.querySelector('#map-clock')),st),
    stopsInside:[...document.querySelectorAll('.net-stop circle:first-child')].every(e=>inside(r(e))),
    noticesInside:notices.every(inside),collisions:notices.some((n,i)=>labels.concat(notices.slice(i+1)).some(b=>hit(n,b))),
    noticesAccounted:elements.every(e=>shown(e)||(e.closest('.run-alert')||e)._overflow?.isConnected),
    noticeLayer:Number(getComputedStyle(layer).zIndex)>7,road:PB.BusMotion.road.halfWidth,errors:[]};
  });
  const name=`${view}-${width}-p${phase}`;
  await page.screenshot({path:`publicness/tests/_shot-clearance-${name}.png`});
  try {assert.equal(result.controlsOutside,true);assert.equal(result.clockOutside,true);assert.equal(result.stopsInside,true);assert.equal(result.noticesInside,true);assert.equal(result.noticesAccounted,true);assert.equal(result.collisions,false);assert.equal(result.noticeLayer,true);assert.ok(result.road<=.2);assert.deepEqual(errors,[]);console.log('PASS',name);} catch(e){failures.push({name,...result,errors});}
  await page.close();
 }
 console.log(JSON.stringify(failures,null,2));assert.equal(failures.length,0);
} finally {await browser.close();server.close();}
