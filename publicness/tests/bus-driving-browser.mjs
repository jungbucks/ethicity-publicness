import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startServer} from './serve.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url));
const server=await startServer(), errors=[];
const base=process.env.FILE ? pathToFileURL(path.join(here,'../index.html')).href : `http://127.0.0.1:${server.address().port}/publicness/`;
const suffix=process.env.FILE?'-file':process.env.FALLBACK?'-fallback':'';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
try {
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  if(process.env.FALLBACK)await page.route('**/assets/models/bus.js',r=>r.fulfill({contentType:'application/javascript',body:'/* unavailable bus model fixture */'}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.evaluate(()=>{
    PB.App.startGame(); const s=PB.App.s; s.tutorialSeen=true;s.config.playback.msPerMinute=1500;
    PB.Session.beginPlan(s);
    s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);
    [['F','C','B','A'],['D','A','G']].forEach((ns,i)=>{
      const r=PB.Session.addRoute(s,{nodes:ns,stops:ns.map(()=>true)});PB.Session.assign(s,i+1,r.num);
    });
    PB.App.go('plan');
    const v=PB.App.view, original=v.setBuses;
    window.__driving=[];
    v.setBuses=function(list){window.__driving.push({t:PB.UI.runState()?.tf,list:JSON.parse(JSON.stringify(list))});original(list);};
    PB.Session.startRun(s);PB.App.go('run');
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  });
  await page.waitForFunction(()=>window.__driving.length>5);
  await page.locator('#run-pause').click();
  await page.screenshot({path:path.join(here,`_shot-bus-driving-${process.env.BEFORE?'before':'after'}${suffix}.png`)});
  const data=await page.evaluate(()=>({kind:PB.App.view.kind,buses:PB.App.view.busInfo(),frames:window.__driving,state:PB.UI.runState()}));
  assert.equal(data.kind,'3d');assert.ok(data.buses.every(b=>b.model===!process.env.FALLBACK),'bus asset or fallback loaded');
  assert.ok(data.frames.some(f=>f.list.some(b=>Number.isFinite(b.heading))),'3D playback receives path-tangent heading');
  const frozen=data.state.tf;
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>PB.UI.runState().tf),frozen,'pause holds the simulation clock');
  await page.locator('#run-pause').click();
  await page.waitForFunction(t=>PB.UI.runState().tf>t+.5,frozen);
  await page.locator('#speed-2').click();
  await page.locator('#run-pause').click();
  await page.evaluate(()=>PB.App.toggleView());
  assert.equal(await page.evaluate(()=>PB.App.view.kind),'2d');
  await page.evaluate(()=>PB.App.toggleView());
  assert.equal(await page.evaluate(()=>PB.App.view.kind),'3d');
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:path.join(here,`_shot-bus-driving-mobile${suffix}.png`)});
  // A saved/replayed timeline includes future emergency assignments. It must not
  // place an idle bus on its future route before that assignment takes effect.
  await page.goto(base);
  await page.evaluate(()=>{
    PB.App.startGame();const s=PB.App.s;s.phase=3;s.owned=4;s.tutorialSeen=true;s.config.playback.msPerMinute=1500;
    s.draft.buses=[1,2,3,4].map(id=>({id,routeNum:id===1?1:null,offset:0}));
    PB.Session.beginPlan(s);
    PB.Session.updateRoute(s,1,{nodes:['A','B'],stops:[true,true]});
    PB.Session.updateRoute(s,2,{nodes:['F','D'],stops:[true,true]});
    PB.Session.startRun(s);PB.Session.emergencyDecision(s,34,2,2);s.runCursor=0;
    PB.App.go('run');document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const view=PB.App.view, original=view.setBuses;window.__idle=null;
    view.setBuses=function(list){window.__idle=list.find(b=>b.id===2);original(list);};
  });
  await page.waitForFunction(()=>window.__idle);
  assert.equal(await page.evaluate(()=>Number.isFinite(window.__idle.heading)),false,'future assigned bus remains parked before activation');
  await page.locator('#run-pause').click();
  await page.evaluate(()=>{
    const view=PB.App.view, original=view.setDrivingSegments;window.__transferRoads=null;
    view.setDrivingSegments=function(segments){window.__transferRoads=segments.map(s=>[s.from,s.to]);original(segments);};
    PB.App.toggleView();PB.App.toggleView();
  });
  assert.ok((await page.evaluate(()=>window.__transferRoads)).length>0,'paused view refresh restores deadhead road surfaces');
  assert.deepEqual(errors,[]);
  console.log('PASS bus-driving '+(process.env.FILE?'file://':process.env.FALLBACK?'fallback':'HTTP')+': model, 3D heading, pause/resume, speed and view toggle, mobile, future assignment, no errors');
} finally {await browser.close();await new Promise(r=>server.close(r));}
